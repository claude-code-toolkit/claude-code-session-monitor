/**
 * PTY Manager for terminal sessions.
 * Spawns and tracks pseudo-terminal processes for Claude sessions.
 */

import { spawn, type IPty } from "node-pty";
import type { WebSocket } from "ws";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { execSync } from "node:child_process";
import {
  getTmuxPath,
  getTmuxSessionName,
  getLauncherSessionName,
  hasSession as hasTmuxSession,
  createSession as createTmuxSession,
  createLauncherSession,
  renameSession as renameTmuxSession,
} from "./tmux.js";

// Idle timeout before killing PTY (2 hours)
const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;

// Check for idle PTYs every 5 minutes
const IDLE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Max output buffer size (100KB) - for replaying on reconnect
const MAX_OUTPUT_BUFFER_SIZE = 100 * 1024;

// Cached claude executable path (resolved at startup)
let claudePath: string | null = null;

/**
 * Find the claude executable path
 */
function findClaudePath(): string | null {
  // Try common installation paths first (more reliable than 'which' in daemon context)
  const commonPaths = [
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
    `${os.homedir()}/.npm-global/bin/claude`,
  ];

  // Add NVM paths - check all installed node versions
  const nvmDir = `${os.homedir()}/.nvm/versions/node`;
  try {
    if (fs.existsSync(nvmDir)) {
      const versions = fs.readdirSync(nvmDir);
      for (const version of versions) {
        commonPaths.push(`${nvmDir}/${version}/bin/claude`);
      }
    }
  } catch {
    // NVM directory doesn't exist or can't be read
  }

  // Check each path
  for (const p of commonPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Fallback: try 'which' with user's shell (loads profile)
  try {
    const shell = process.env.SHELL || "/bin/bash";
    const path = execSync(`${shell} -ilc "which claude"`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000,
    }).trim();
    if (path && !path.includes("not found")) return path;
  } catch {
    // which failed
  }

  return null;
}

/**
 * Get the claude executable path (cached)
 */
export function getClaudePath(): string | null {
  if (claudePath === null) {
    claudePath = findClaudePath();
    if (claudePath) {
      console.log(`[pty] Found claude at: ${claudePath}`);
    } else {
      console.warn("[pty] Warning: claude executable not found in PATH");
    }
  }
  return claudePath;
}

export interface ManagedPty {
  ptyId: string;
  sessionId: string;
  launcherId?: string; // For launcher PTYs (directory picker)
  process: IPty;
  cwd: string;
  hostname: string;
  createdAt: Date;
  lastActivityAt: Date;
  connections: Set<WebSocket>;
  outputBuffer: string; // Buffered output for replay on reconnect
  tmuxSession: string | null; // Name of tmux session
  warning: string | null; // Warning to show user (e.g., conflict detected)
}

export interface TerminalInfo {
  ptyId: string;
  sessionId: string;
  launcherId?: string;
  hostname: string;
  active: boolean;
  createdAt: string;
  lastActivityAt: string;
  connectionCount: number;
  tmuxSession: string | null;
}

export interface PtyManagerEvents {
  created: (info: TerminalInfo) => void;
  closed: (ptyId: string, sessionId: string) => void;
  output: (ptyId: string, data: string) => void;
}

export class PtyManager extends EventEmitter {
  private ptys = new Map<string, ManagedPty>();
  private sessionToPty = new Map<string, string>(); // sessionId -> ptyId
  private launcherToPty = new Map<string, string>(); // launcherId -> ptyId
  private idleCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  /**
   * Start the idle check interval
   */
  start(): void {
    if (this.idleCheckInterval) return;

    this.idleCheckInterval = setInterval(() => {
      this.checkIdleTimeouts();
    }, IDLE_CHECK_INTERVAL_MS);

    console.log("[pty] Manager started");
  }

  /**
   * Stop the manager and kill all PTYs
   */
  async stop(): Promise<void> {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }

    // Kill all PTYs
    for (const ptyId of this.ptys.keys()) {
      this.kill(ptyId);
    }

    console.log("[pty] Manager stopped");
  }

  /**
   * Get or create a PTY for a session (using tmux)
   * @param forceNew - If true, always create a new tmux session (don't attach to existing)
   */
  getOrCreate(sessionId: string, cwd: string, hostname: string, forceNew: boolean = false): ManagedPty {
    // Check if PTY already exists for this session (in our daemon)
    const existingPtyId = this.sessionToPty.get(sessionId);
    if (existingPtyId) {
      const existing = this.ptys.get(existingPtyId);
      if (existing) {
        console.log(`[pty] Reusing existing PTY ${existingPtyId} for session ${sessionId}`);
        return existing;
      }
    }

    // Check tmux availability (required)
    const tmuxPath = getTmuxPath();
    if (!tmuxPath) {
      throw new Error("tmux is required but not installed. Install with: brew install tmux");
    }

    // Get claude path
    const claudePath = getClaudePath();
    if (!claudePath) {
      throw new Error("Claude executable not found. Make sure 'claude' is installed and in PATH.");
    }

    const ptyId = this.generatePtyId();
    const ourTmuxName = getTmuxSessionName(sessionId);
    let warning: string | null = null;
    let tmuxNameToAttach: string = ourTmuxName;

    console.log(`[pty] Creating PTY ${ptyId} for session ${sessionId}`);

    // Helper to check if Claude is running outside tmux in this cwd
    const checkClaudeOutsideTmux = (): number | null => {
      try {
        const pids = execSync(`pgrep -x claude`, {
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"],
        }).trim();

        if (pids) {
          for (const pidStr of pids.split("\n")) {
            const pid = parseInt(pidStr, 10);
            if (isNaN(pid)) continue;

            // Check if this PID is in any tmux session
            try {
              const tmuxPanes = execSync(`tmux list-panes -a -F "#{pane_pid}"`, {
                encoding: "utf8",
                stdio: ["pipe", "pipe", "pipe"],
              }).trim();
              const tmuxPids = new Set(tmuxPanes.split("\n").map(p => parseInt(p, 10)));

              // Also check parent PIDs (claude is child of shell in tmux)
              const ppidOutput = execSync(`ps -o ppid= -p ${pid}`, {
                encoding: "utf8",
                stdio: ["pipe", "pipe", "pipe"],
              }).trim();
              const ppid = parseInt(ppidOutput, 10);

              // If neither pid nor ppid is in tmux, check cwd
              if (!tmuxPids.has(pid) && !tmuxPids.has(ppid)) {
                const lsofOutput = execSync(`lsof -p ${pid} 2>/dev/null | grep cwd`, {
                  encoding: "utf8",
                  stdio: ["pipe", "pipe", "pipe"],
                }).trim();
                const parts = lsofOutput.split(/\s+/);
                const processCwd = parts.length >= 9 ? parts.slice(8).join(" ") : null;

                if (processCwd === cwd) {
                  return pid;
                }
              }
            } catch {
              // Couldn't check this process
            }
          }
        }
      } catch {
        // No Claude processes found
      }
      return null;
    };

    // First, check if our named tmux session already exists
    // This handles reconnection after daemon restart
    const ourSessionExists = hasTmuxSession(sessionId);

    if (ourSessionExists) {
      console.log(`[pty] Our tmux session ${ourTmuxName} already exists, attaching to it`);
      tmuxNameToAttach = ourTmuxName;

      // Still check if Claude is running outside tmux (user might have both)
      const outsidePid = checkClaudeOutsideTmux();
      if (outsidePid) {
        warning = `Claude is also running outside tmux (PID ${outsidePid}). Close it for sync:\n  tmux attach -t ${ourTmuxName}`;
        console.log(`[pty] Warning: Claude (PID ${outsidePid}) also running outside tmux`);
      }
    } else {
      // No existing tmux session for this sessionId
      // Check if Claude is running outside tmux in this cwd
      const outsidePid = checkClaudeOutsideTmux();
      if (outsidePid) {
        warning = `Claude is running outside tmux (PID ${outsidePid}). For sync, close it and attach:\n  tmux attach -t ${ourTmuxName}`;
        console.log(`[pty] Warning: Claude (PID ${outsidePid}) running outside tmux in ${cwd}`);
      }

      // Create new tmux session with claude
      // If forceNew, start fresh (no --resume). Otherwise, try to resume.
      console.log(`[pty] Creating tmux session: ${ourTmuxName} (forceNew=${forceNew})`);
      createTmuxSession(sessionId, cwd, claudePath, !forceNew);
      tmuxNameToAttach = ourTmuxName;
    }

    console.log(`[pty] Attaching to tmux session: ${tmuxNameToAttach}`);

    // Attach to the tmux session via PTY
    let ptyProcess: IPty;
    try {
      ptyProcess = spawn(tmuxPath, ["attach", "-t", tmuxNameToAttach], {
        name: "xterm-256color",
        cols: 120,
        rows: 30,
        cwd,
        env: {
          ...process.env,
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
        },
      });
    } catch (error) {
      console.error(`[pty] Failed to attach to tmux:`, error);
      throw error;
    }

    const managedPty: ManagedPty = {
      ptyId,
      sessionId,
      process: ptyProcess,
      cwd,
      hostname,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      connections: new Set(),
      outputBuffer: "",
      tmuxSession: tmuxNameToAttach,
      warning,
    };

    this.ptys.set(ptyId, managedPty);
    this.sessionToPty.set(sessionId, ptyId);

    // Handle PTY output
    ptyProcess.onData((data) => {
      managedPty.lastActivityAt = new Date();
      this.emit("output", ptyId, data);

      // Buffer output for replay on reconnect
      managedPty.outputBuffer += data;
      // Trim buffer if it gets too large (keep last 100KB)
      if (managedPty.outputBuffer.length > MAX_OUTPUT_BUFFER_SIZE) {
        managedPty.outputBuffer = managedPty.outputBuffer.slice(-MAX_OUTPUT_BUFFER_SIZE);
      }

      // Send to all connected WebSockets
      for (const ws of managedPty.connections) {
        if (ws.readyState === 1) { // WebSocket.OPEN
          ws.send(JSON.stringify({ type: "output", data }));
        }
      }
    });

    // Handle PTY exit (tmux attach disconnected)
    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`[pty] PTY ${ptyId} exited (code: ${exitCode}, signal: ${signal})`);

      // Notify connected clients
      for (const ws of managedPty.connections) {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "exit", code: exitCode, signal }));
        }
      }

      // Clean up PTY tracking (but don't kill tmux session - it persists)
      this.ptys.delete(ptyId);
      this.sessionToPty.delete(sessionId);
      this.emit("closed", ptyId, sessionId);
    });

    this.emit("created", this.getTerminalInfo(managedPty));

    return managedPty;
  }

  /**
   * Create a launcher PTY (fzf directory picker that starts Claude)
   */
  createLauncher(hostname: string): ManagedPty {
    // Check if this launcher already exists
    // (unlikely since launcherIds are unique, but just in case)

    // Check tmux availability (required)
    const tmuxPath = getTmuxPath();
    if (!tmuxPath) {
      throw new Error("tmux is required but not installed. Install with: brew install tmux");
    }

    const launcherId = this.generateLauncherId();
    const ptyId = this.generatePtyId();
    const tmuxSessionName = getLauncherSessionName(launcherId);

    console.log(`[pty] Creating launcher PTY ${ptyId} (launcher ${launcherId})`);

    // Create the launcher tmux session
    createLauncherSession(launcherId);

    // Attach to the launcher tmux session via PTY
    let ptyProcess: IPty;
    try {
      ptyProcess = spawn(tmuxPath, ["attach", "-t", tmuxSessionName], {
        name: "xterm-256color",
        cols: 120,
        rows: 30,
        cwd: os.homedir(),
        env: {
          ...process.env,
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
        },
      });
    } catch (error) {
      console.error(`[pty] Failed to attach to launcher tmux:`, error);
      throw error;
    }

    const managedPty: ManagedPty = {
      ptyId,
      sessionId: `launcher-${launcherId}`, // Placeholder session ID for launchers
      launcherId,
      process: ptyProcess,
      cwd: os.homedir(),
      hostname,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      connections: new Set(),
      outputBuffer: "",
      tmuxSession: tmuxSessionName,
      warning: null,
    };

    this.ptys.set(ptyId, managedPty);
    this.launcherToPty.set(launcherId, ptyId);

    // Handle PTY output
    ptyProcess.onData((data) => {
      managedPty.lastActivityAt = new Date();
      this.emit("output", ptyId, data);

      // Buffer output for replay on reconnect
      managedPty.outputBuffer += data;
      if (managedPty.outputBuffer.length > MAX_OUTPUT_BUFFER_SIZE) {
        managedPty.outputBuffer = managedPty.outputBuffer.slice(-MAX_OUTPUT_BUFFER_SIZE);
      }

      // Send to all connected WebSockets
      for (const ws of managedPty.connections) {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "output", data }));
        }
      }
    });

    // Handle PTY exit - check if directory was selected and create proper session
    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`[pty] Launcher PTY ${ptyId} exited (code: ${exitCode}, signal: ${signal})`);

      // Check if a directory was selected
      const selFile = `/tmp/launcher_${launcherId}`;
      const scriptFile = `/tmp/launcher_script_${launcherId}.sh`;
      let selectedPath: string | null = null;
      try {
        if (fs.existsSync(selFile)) {
          selectedPath = fs.readFileSync(selFile, "utf8").trim();
          fs.unlinkSync(selFile); // Clean up temp file
          console.log(`[pty] Launcher selected path: ${selectedPath}`);
        }
        // Clean up script file
        if (fs.existsSync(scriptFile)) {
          fs.unlinkSync(scriptFile);
        }
      } catch (err) {
        console.error(`[pty] Error reading launcher selection:`, err);
      }

      // Resolve to a directory (if user selected a file, use its parent)
      let selectedDir: string | null = null;
      if (selectedPath && fs.existsSync(selectedPath)) {
        const stat = fs.statSync(selectedPath);
        selectedDir = stat.isDirectory() ? selectedPath : path.dirname(selectedPath);
        console.log(`[pty] Resolved directory: ${selectedDir}`);
      }

      // If directory was selected, create a proper Claude session
      if (selectedDir && fs.existsSync(selectedDir)) {
        console.log(`[pty] Creating Claude session in: ${selectedDir}`);
        try {
          // forceNew: true to always create new session, not attach to existing
          // Use random prefix to avoid tmux name collisions (tmux name uses first 8 chars)
          const randomId = Math.random().toString(36).slice(2, 10);
          const tempSessionId = `${randomId}-${Date.now()}`;
          const newPty = this.getOrCreate(tempSessionId, selectedDir, hostname, true);

          // Watch for Claude's JSONL file to get the real session ID
          // Poll for up to 10 seconds
          const projectDir = this.findClaudeProjectDir(selectedDir);
          if (projectDir) {
            this.waitForClaudeSession(projectDir, tempSessionId, newPty, managedPty.connections, selectedDir);
          } else {
            // Can't find project dir, just use temp ID
            for (const ws of managedPty.connections) {
              if (ws.readyState === 1) {
                ws.send(JSON.stringify({
                  type: "launcher_complete",
                  sessionId: newPty.sessionId,
                  ptyId: newPty.ptyId,
                  cwd: selectedDir,
                }));
              }
            }
          }
        } catch (err) {
          console.error(`[pty] Failed to create session:`, err);
          for (const ws of managedPty.connections) {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: "exit", code: exitCode, signal }));
            }
          }
        }
      } else {
        // No directory selected, just notify exit
        for (const ws of managedPty.connections) {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: "exit", code: exitCode, signal }));
          }
        }
      }

      // Clean up launcher
      this.ptys.delete(ptyId);
      this.launcherToPty.delete(launcherId);
      this.emit("closed", ptyId, managedPty.sessionId);
    });

    this.emit("created", this.getTerminalInfo(managedPty));

    return managedPty;
  }

  /**
   * Find Claude's project directory for a given cwd
   */
  private findClaudeProjectDir(cwd: string): string | null {
    const claudeDir = path.join(os.homedir(), ".claude", "projects");
    if (!fs.existsSync(claudeDir)) return null;

    // Claude encodes the path: /Users/er/foo -> -Users-er-foo
    const encodedPath = cwd.replace(/\//g, "-");
    const projectDir = path.join(claudeDir, encodedPath);

    if (fs.existsSync(projectDir)) {
      return projectDir;
    }

    return null;
  }

  /**
   * Wait for Claude to create its JSONL file, then rename tmux and notify clients
   */
  private waitForClaudeSession(
    projectDir: string,
    tempSessionId: string,
    newPty: ManagedPty,
    connections: Set<WebSocket>,
    cwd: string
  ): void {
    const startTime = Date.now();
    const maxWait = 10000; // 10 seconds
    const pollInterval = 500; // 500ms

    // Get existing JSONL files before Claude starts
    const existingFiles = new Set(
      fs.readdirSync(projectDir)
        .filter(f => f.endsWith(".jsonl"))
    );

    const poll = () => {
      // Check for new JSONL file
      const currentFiles = fs.readdirSync(projectDir).filter(f => f.endsWith(".jsonl"));
      const newFiles = currentFiles.filter(f => !existingFiles.has(f));

      if (newFiles.length > 0) {
        // Found new session file - extract session ID
        const realSessionId = newFiles[0].replace(".jsonl", "");
        console.log(`[pty] Found Claude session: ${realSessionId}`);

        // Rename tmux session
        const oldTmuxName = getTmuxSessionName(tempSessionId);
        const newTmuxName = getTmuxSessionName(realSessionId);
        if (oldTmuxName !== newTmuxName) {
          renameTmuxSession(oldTmuxName, newTmuxName);
        }

        // Update PTY tracking
        this.sessionToPty.delete(tempSessionId);
        this.sessionToPty.set(realSessionId, newPty.ptyId);
        newPty.sessionId = realSessionId;
        newPty.tmuxSession = newTmuxName;

        // Notify clients with real session ID
        for (const ws of connections) {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({
              type: "launcher_complete",
              sessionId: realSessionId,
              ptyId: newPty.ptyId,
              cwd,
            }));
          }
        }
        return;
      }

      // Check if we've waited too long
      if (Date.now() - startTime > maxWait) {
        console.log(`[pty] Timeout waiting for Claude session, using temp ID`);
        // Use temp ID as fallback
        for (const ws of connections) {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({
              type: "launcher_complete",
              sessionId: newPty.sessionId,
              ptyId: newPty.ptyId,
              cwd,
            }));
          }
        }
        return;
      }

      // Continue polling
      setTimeout(poll, pollInterval);
    };

    // Start polling
    setTimeout(poll, pollInterval);
  }

  /**
   * Get PTY by launcher ID
   */
  getByLauncherId(launcherId: string): ManagedPty | null {
    const ptyId = this.launcherToPty.get(launcherId);
    if (!ptyId) return null;
    return this.ptys.get(ptyId) || null;
  }

  /**
   * Attach a WebSocket connection to a PTY
   */
  attach(ptyId: string, ws: WebSocket): boolean {
    const pty = this.ptys.get(ptyId);
    if (!pty) {
      console.log(`[pty] Cannot attach: PTY ${ptyId} not found`);
      return false;
    }

    pty.connections.add(ws);
    pty.lastActivityAt = new Date();

    console.log(`[pty] WebSocket attached to PTY ${ptyId} (${pty.connections.size} connections)`);

    // Replay buffered output on reconnect
    if (pty.outputBuffer.length > 0) {
      console.log(`[pty] Replaying ${pty.outputBuffer.length} bytes of buffered output`);
      ws.send(JSON.stringify({ type: "output", data: pty.outputBuffer }));
    }

    // Send attached confirmation with warning if any
    ws.send(JSON.stringify({
      type: "attached",
      ptyId,
      sessionId: pty.sessionId,
      tmuxSession: pty.tmuxSession,
      warning: pty.warning,
    }));

    return true;
  }

  /**
   * Detach a WebSocket connection from a PTY
   */
  detach(ptyId: string, ws: WebSocket): void {
    const pty = this.ptys.get(ptyId);
    if (!pty) return;

    pty.connections.delete(ws);
    console.log(`[pty] WebSocket detached from PTY ${ptyId} (${pty.connections.size} connections)`);
  }

  /**
   * Send input to a PTY
   */
  write(ptyId: string, data: string): boolean {
    const pty = this.ptys.get(ptyId);
    if (!pty) return false;

    pty.process.write(data);
    pty.lastActivityAt = new Date();
    return true;
  }

  /**
   * Resize a PTY
   */
  resize(ptyId: string, cols: number, rows: number): boolean {
    const pty = this.ptys.get(ptyId);
    if (!pty) return false;

    pty.process.resize(cols, rows);
    return true;
  }

  /**
   * Kill a PTY
   */
  kill(ptyId: string): boolean {
    const pty = this.ptys.get(ptyId);
    if (!pty) return false;

    console.log(`[pty] Killing PTY ${ptyId}`);

    // Notify connected clients
    for (const ws of pty.connections) {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "exit", code: null, reason: "killed" }));
      }
    }

    // Kill the process
    pty.process.kill();

    // Clean up
    this.ptys.delete(ptyId);
    this.sessionToPty.delete(pty.sessionId);
    this.emit("closed", ptyId, pty.sessionId);

    return true;
  }

  /**
   * Get PTY by session ID
   */
  getBySessionId(sessionId: string): ManagedPty | null {
    const ptyId = this.sessionToPty.get(sessionId);
    if (!ptyId) return null;
    return this.ptys.get(ptyId) || null;
  }

  /**
   * Get PTY by PTY ID
   */
  getByPtyId(ptyId: string): ManagedPty | null {
    return this.ptys.get(ptyId) || null;
  }

  /**
   * Get all active PTYs
   */
  getAll(): ManagedPty[] {
    return Array.from(this.ptys.values());
  }

  /**
   * Get terminal info for a session (for API response)
   */
  getTerminalInfoForSession(sessionId: string): TerminalInfo | null {
    const pty = this.getBySessionId(sessionId);
    if (!pty) return null;
    return this.getTerminalInfo(pty);
  }

  /**
   * Get all terminal infos (for API response)
   */
  getAllTerminalInfos(): TerminalInfo[] {
    return this.getAll().map((pty) => this.getTerminalInfo(pty));
  }

  /**
   * Check for idle PTYs and kill them
   */
  private checkIdleTimeouts(): void {
    const now = Date.now();

    for (const [ptyId, pty] of this.ptys.entries()) {
      const idleTime = now - pty.lastActivityAt.getTime();

      if (idleTime > IDLE_TIMEOUT_MS) {
        console.log(`[pty] PTY ${ptyId} idle for ${Math.round(idleTime / 1000 / 60)} minutes, killing`);
        this.kill(ptyId);
      }
    }
  }

  /**
   * Generate a unique PTY ID
   */
  private generatePtyId(): string {
    return `pty-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Generate a unique launcher ID
   */
  private generateLauncherId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Convert ManagedPty to TerminalInfo
   */
  private getTerminalInfo(pty: ManagedPty): TerminalInfo {
    return {
      ptyId: pty.ptyId,
      sessionId: pty.sessionId,
      launcherId: pty.launcherId,
      hostname: pty.hostname,
      active: pty.connections.size > 0,
      createdAt: pty.createdAt.toISOString(),
      lastActivityAt: pty.lastActivityAt.toISOString(),
      connectionCount: pty.connections.size,
      tmuxSession: pty.tmuxSession,
    };
  }
}

// Singleton instance
let ptyManager: PtyManager | null = null;

export function getPtyManager(): PtyManager {
  if (!ptyManager) {
    ptyManager = new PtyManager();
  }
  return ptyManager;
}
