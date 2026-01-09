import { watch, type FSWatcher } from "chokidar";
import { EventEmitter } from "node:events";
import os from "node:os";
import {
  tailJSONL,
  extractMetadata,
  extractLatestPrompt,
  extractSessionId,
  extractEncodedDir,
} from "./parser.js";
import { deriveStatus, statusChanged } from "./status.js";
import { getGitInfoCached, type GitInfo } from "./git.js";
import type { LogEntry, SessionMetadata, StatusResult } from "./types.js";

const DEFAULT_CLAUDE_PROJECTS_DIR = `${process.env.HOME}/.claude/projects`;

export interface WatchPath {
  path: string;
  hostname: string;
}

export interface SessionState {
  sessionId: string;
  hostname: string;  // Machine hostname for multi-machine support
  filepath: string;
  encodedDir: string;
  cwd: string;
  gitBranch: string | null;
  originalPrompt: string;
  startedAt: string;
  status: StatusResult;
  entries: LogEntry[];
  bytePosition: number;
  // GitHub repo info
  gitRepoUrl: string | null;   // https://github.com/owner/repo
  gitRepoId: string | null;    // owner/repo (for grouping)
}

export interface SessionEvent {
  type: "created" | "updated" | "deleted";
  session: SessionState;
  previousStatus?: StatusResult;
}

export class SessionWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private sessions = new Map<string, SessionState>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private debounceMs: number;
  private watchPaths: WatchPath[];

  constructor(options: { debounceMs?: number; watchPaths?: WatchPath[] } = {}) {
    super();
    this.debounceMs = options.debounceMs ?? 200;
    // Default to local claude projects dir with local hostname
    this.watchPaths = options.watchPaths ?? [
      {
        path: DEFAULT_CLAUDE_PROJECTS_DIR,
        hostname: process.env.HOSTNAME || os.hostname(),
      },
    ];
  }

  /**
   * Get hostname for a file path based on which watch path it belongs to
   */
  private getHostnameForPath(filepath: string): string {
    for (const wp of this.watchPaths) {
      if (filepath.startsWith(wp.path)) {
        return wp.hostname;
      }
    }
    // Fallback to local hostname
    return process.env.HOSTNAME || os.hostname();
  }

  async start(): Promise<void> {
    const pathsToWatch = this.watchPaths.map(wp => wp.path);
    console.log(`[watcher] Watching ${pathsToWatch.length} path(s):`, pathsToWatch);

    // Use directory watching instead of glob - chokidar has issues with
    // directories that start with dashes when using glob patterns
    this.watcher = watch(pathsToWatch, {
      ignored: /agent-.*\.jsonl$/,  // Ignore agent sub-session files
      persistent: true,
      ignoreInitial: false,
      depth: 2,
    });

    this.watcher
      .on("add", (path) => {
        if (!path.endsWith(".jsonl")) return;
        this.handleFile(path, "add");
      })
      .on("change", (path) => {
        if (!path.endsWith(".jsonl")) return;
        this.debouncedHandleFile(path);
      })
      .on("unlink", (path) => this.handleDelete(path))
      .on("error", (error) => this.emit("error", error));

    // Wait for initial scan to complete
    await new Promise<void>((resolve) => {
      this.watcher!.on("ready", resolve);
    });
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  getSessions(): Map<string, SessionState> {
    return this.sessions;
  }

  /**
   * Re-check all sessions in "working" state for timeout transitions.
   * Call this periodically to handle sessions that went stale without file changes.
   */
  recheckTimeouts(): void {
    for (const [, session] of this.sessions) {
      // Only recheck sessions in "working" state
      if (session.status.status !== "working") continue;

      const previousStatus = session.status;
      const newStatus = deriveStatus(session.entries);

      if (statusChanged(previousStatus, newStatus)) {
        session.status = newStatus;
        this.emit("session", {
          type: "updated",
          session,
          previousStatus,
        } satisfies SessionEvent);
      }
    }
  }

  private debouncedHandleFile(filepath: string): void {
    // Clear existing timer for this file
    const existing = this.debounceTimers.get(filepath);
    if (existing) {
      clearTimeout(existing);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(filepath);
      this.handleFile(filepath, "change");
    }, this.debounceMs);

    this.debounceTimers.set(filepath, timer);
  }

  /**
   * When a new session is created for the same cwd, remove older sessions.
   * This handles the case when `/clear` is run and Claude creates a new session file
   * but stays in the same tmux session.
   */
  private removeSupersededSessions(newSession: SessionState): void {
    const toRemove: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      // Skip the new session itself
      if (sessionId === newSession.sessionId) continue;

      // Skip sessions on different hosts
      if (session.hostname !== newSession.hostname) continue;

      // Check if same cwd and idle (not working or waiting)
      // Only remove truly idle sessions - waiting means user is actively in conversation
      if (
        session.cwd === newSession.cwd &&
        session.status.status === "idle"
      ) {
        toRemove.push(sessionId);
      }
    }

    // Remove superseded sessions
    for (const sessionId of toRemove) {
      const session = this.sessions.get(sessionId);
      if (session) {
        this.sessions.delete(sessionId);
        this.emit("session", {
          type: "deleted",
          session,
        } satisfies SessionEvent);

        console.log(
          `[watcher] Removed superseded session ${sessionId.slice(0, 8)} (replaced by ${newSession.sessionId.slice(0, 8)})`
        );
      }
    }
  }

  private async handleFile(
    filepath: string,
    _eventType: "add" | "change"
  ): Promise<void> {
    try {
      const sessionId = extractSessionId(filepath);
      const existingSession = this.sessions.get(sessionId);

      // Determine starting byte position
      const fromByte = existingSession?.bytePosition ?? 0;

      // Read new entries
      const { entries: newEntries, newPosition } = await tailJSONL(
        filepath,
        fromByte
      );

      if (newEntries.length === 0 && existingSession) {
        // No new data
        return;
      }

      // Combine with existing entries or start fresh
      const allEntries = existingSession
        ? [...existingSession.entries, ...newEntries]
        : newEntries;

      // Extract metadata (only needed for new sessions)
      let metadata: SessionMetadata | null;
      let gitInfo: GitInfo;

      if (existingSession) {
        // Update prompt to latest meaningful user message
        const latestPrompt = extractLatestPrompt(allEntries);
        metadata = {
          sessionId: existingSession.sessionId,
          cwd: existingSession.cwd,
          gitBranch: existingSession.gitBranch,
          originalPrompt: latestPrompt || existingSession.originalPrompt,
          startedAt: existingSession.startedAt,
        };
        // Reuse cached git info
        gitInfo = {
          repoUrl: existingSession.gitRepoUrl,
          repoId: existingSession.gitRepoId,
          branch: existingSession.gitBranch,
          isGitRepo: existingSession.gitRepoUrl !== null || existingSession.gitBranch !== null,
        };
      } else {
        metadata = extractMetadata(allEntries);
        if (!metadata) {
          // Not enough data yet
          return;
        }
        // Look up git info for new sessions
        gitInfo = await getGitInfoCached(metadata.cwd);
      }

      // Derive status from all entries
      const status = deriveStatus(allEntries);
      const previousStatus = existingSession?.status;

      // Build session state - prefer branch from git info over log entry
      const session: SessionState = {
        sessionId,
        hostname: this.getHostnameForPath(filepath),
        filepath,
        encodedDir: extractEncodedDir(filepath),
        cwd: metadata.cwd,
        gitBranch: gitInfo.branch || metadata.gitBranch,
        originalPrompt: metadata.originalPrompt,
        startedAt: metadata.startedAt,
        status,
        entries: allEntries,
        bytePosition: newPosition,
        gitRepoUrl: gitInfo.repoUrl,
        gitRepoId: gitInfo.repoId,
      };

      // Store session
      this.sessions.set(sessionId, session);

      // Emit event
      const isNew = !existingSession;
      const hasStatusChange = statusChanged(previousStatus, status);
      const hasNewMessages = existingSession && status.messageCount > existingSession.status.messageCount;

      if (isNew) {
        // Remove older sessions in the same cwd that are superseded
        this.removeSupersededSessions(session);

        this.emit("session", {
          type: "created",
          session,
        } satisfies SessionEvent);
      } else if (hasStatusChange || hasNewMessages) {
        this.emit("session", {
          type: "updated",
          session,
          previousStatus,
        } satisfies SessionEvent);
      }
    } catch (error) {
      this.emit("error", error);
    }
  }

  private handleDelete(filepath: string): void {
    const sessionId = extractSessionId(filepath);
    const session = this.sessions.get(sessionId);

    if (session) {
      this.sessions.delete(sessionId);
      this.emit("session", {
        type: "deleted",
        session,
      } satisfies SessionEvent);
    }
  }
}
