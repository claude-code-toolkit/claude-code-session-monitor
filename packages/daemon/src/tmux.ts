/**
 * Tmux utilities for terminal session management.
 * Provides tmux detection, session creation, and conflict detection.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";

// Cached tmux path
let tmuxPath: string | null | undefined = undefined;

/**
 * Find the tmux executable path
 */
function findTmuxPath(): string | null {
  const commonPaths = [
    "/opt/homebrew/bin/tmux",
    "/usr/local/bin/tmux",
    "/usr/bin/tmux",
  ];

  // Check common paths first
  for (const p of commonPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Try 'which tmux'
  try {
    const path = execSync("which tmux", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (path && fs.existsSync(path)) {
      return path;
    }
  } catch {
    // which failed
  }

  return null;
}

/**
 * Get the tmux executable path (cached)
 */
export function getTmuxPath(): string | null {
  if (tmuxPath === undefined) {
    tmuxPath = findTmuxPath();
    if (tmuxPath) {
      console.log(`[tmux] Found tmux at: ${tmuxPath}`);
    }
  }
  return tmuxPath;
}

/**
 * Check if tmux is available
 */
export function isTmuxAvailable(): boolean {
  return getTmuxPath() !== null;
}

/**
 * Generate tmux session name from Claude session ID
 * Uses first 8 characters for readability
 */
export function getTmuxSessionName(sessionId: string): string {
  return `claude-${sessionId.slice(0, 8)}`;
}

/**
 * Check if a tmux session exists for the given Claude session
 */
export function hasSession(sessionId: string): boolean {
  const tmux = getTmuxPath();
  if (!tmux) return false;

  const sessionName = getTmuxSessionName(sessionId);

  try {
    execSync(`${tmux} has-session -t ${sessionName}`, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a new tmux session with claude
 * @param resume - If true, use --resume to continue existing session. If false, start fresh.
 */
export function createSession(
  sessionId: string,
  cwd: string,
  claudePath: string,
  resume: boolean = true
): void {
  const tmux = getTmuxPath();
  if (!tmux) {
    throw new Error("tmux not available");
  }

  const sessionName = getTmuxSessionName(sessionId);
  const command = resume ? `${claudePath} --resume ${sessionId}` : claudePath;

  console.log(`[tmux] Creating session ${sessionName} in ${cwd}`);
  console.log(`[tmux] Command: ${command}`);

  try {
    // Create detached tmux session running claude --resume
    execSync(
      `${tmux} new-session -d -s ${sessionName} -c "${cwd}" "${command}"`,
      {
        stdio: ["pipe", "pipe", "pipe"],
        cwd,
      }
    );
  } catch (error) {
    console.error(`[tmux] Failed to create session:`, error);
    throw error;
  }
}

/**
 * Generate launcher session name from launcher ID
 */
export function getLauncherSessionName(launcherId: string): string {
  return `launcher-${launcherId.slice(0, 8)}`;
}

/**
 * Check if a launcher tmux session exists
 */
export function hasLauncherSession(launcherId: string): boolean {
  const tmux = getTmuxPath();
  if (!tmux) return false;

  const sessionName = getLauncherSessionName(launcherId);

  try {
    execSync(`${tmux} has-session -t ${sessionName}`, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a launcher tmux session with fzf directory picker
 * Once a directory is selected, Claude starts automatically
 */
export function createLauncherSession(launcherId: string): void {
  const tmux = getTmuxPath();
  if (!tmux) {
    throw new Error("tmux not available");
  }

  const sessionName = getLauncherSessionName(launcherId);

  // Launcher session: nnn to pick directory, then start claude
  console.log(`[tmux] Creating launcher session ${sessionName}`);

  // Kill any existing session with this name (shouldn't happen, but just in case)
  try {
    execSync(`${tmux} kill-session -t ${sessionName} 2>/dev/null`, {
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    // Session doesn't exist, that's fine
  }

  try {
    // Launcher just picks a directory with nnn, writes it to temp file, then exits
    // The daemon will read the file and create a proper Claude session
    //
    // Using NNN_TMPFILE: When user presses Ctrl+G to quit, nnn writes cd command to file
    // We then source it to change directory and write pwd to the file for the daemon
    const selFile = `/tmp/launcher_${launcherId}`;

    // Create a launcher script file (avoids bash -c quoting issues)
    const scriptFile = `/tmp/launcher_script_${launcherId}.sh`;
    const scriptContent = `#!/bin/bash
export NNN_TMPFILE="${selFile}"
rm -f "${selFile}"
cd ~
nnn
if [ -f "${selFile}" ]; then
  . "${selFile}"
  pwd > "${selFile}"
fi
`;
    fs.writeFileSync(scriptFile, scriptContent, { mode: 0o755 });

    execSync(`${tmux} new-session -d -s ${sessionName} bash "${scriptFile}"`, {
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    console.error(`[tmux] Failed to create launcher session:`, error);
    throw error;
  }
}

/**
 * Rename a tmux session
 */
export function renameSession(oldName: string, newName: string): boolean {
  const tmux = getTmuxPath();
  if (!tmux) return false;

  try {
    execSync(`${tmux} rename-session -t ${oldName} ${newName}`, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    console.log(`[tmux] Renamed session ${oldName} -> ${newName}`);
    return true;
  } catch (error) {
    console.error(`[tmux] Failed to rename session:`, error);
    return false;
  }
}

/**
 * Kill a launcher tmux session
 */
export function killLauncherSession(launcherId: string): boolean {
  const tmux = getTmuxPath();
  if (!tmux) return false;

  const sessionName = getLauncherSessionName(launcherId);

  try {
    execSync(`${tmux} kill-session -t ${sessionName}`, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    console.log(`[tmux] Killed launcher session ${sessionName}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Kill a tmux session
 */
export function killSession(sessionId: string): boolean {
  const tmux = getTmuxPath();
  if (!tmux) return false;

  const sessionName = getTmuxSessionName(sessionId);

  try {
    execSync(`${tmux} kill-session -t ${sessionName}`, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    console.log(`[tmux] Killed session ${sessionName}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the cwd of a process by PID (macOS compatible)
 */
function getProcessCwd(pid: number): string | null {
  try {
    // Use lsof to find the cwd on macOS
    const output = execSync(`lsof -p ${pid} 2>/dev/null | grep cwd`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    // Format: "node    15237   er  cwd       DIR   1,18   512   122657719 /Users/er/..."
    const parts = output.split(/\s+/);
    if (parts.length >= 9) {
      return parts.slice(8).join(" "); // Path might have spaces
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Find Claude process by cwd
 * Returns the PID if found, null otherwise
 */
export function getClaudeProcessPid(sessionId: string, cwd?: string): number | null {
  try {
    // First try to find by session ID in args (works when started with --resume)
    try {
      const result = execSync(`pgrep -f "claude.*--resume.*${sessionId}"`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      if (result) {
        const pid = parseInt(result.split("\n")[0], 10);
        if (!isNaN(pid)) return pid;
      }
    } catch {
      // No match by session ID
    }

    // If cwd provided, try to find by matching cwd
    if (cwd) {
      // Get all claude processes
      const pids = execSync(`pgrep -x claude`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();

      if (pids) {
        for (const pidStr of pids.split("\n")) {
          const pid = parseInt(pidStr, 10);
          if (isNaN(pid)) continue;

          const processCwd = getProcessCwd(pid);
          if (processCwd === cwd) {
            console.log(`[tmux] Found Claude process ${pid} with matching cwd: ${cwd}`);
            return pid;
          }
        }
      }
    }

    return null;
  } catch {
    // pgrep returns non-zero if no matches
    return null;
  }
}

/**
 * Check if a Claude process is running for the given session ID
 */
export function isClaudeRunning(sessionId: string): boolean {
  return getClaudeProcessPid(sessionId) !== null;
}

/**
 * Find which tmux session contains a process by PID
 * Returns the session name if found, null otherwise
 */
export function findTmuxSessionByPid(pid: number): string | null {
  const tmux = getTmuxPath();
  if (!tmux) return null;

  try {
    // List all panes with their PIDs and session names
    const output = execSync(
      `${tmux} list-panes -a -F "#{pane_pid} #{session_name}"`,
      {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }
    ).trim();

    // Find the line matching our PID
    for (const line of output.split("\n")) {
      const [panePid, sessionName] = line.split(" ");
      if (parseInt(panePid, 10) === pid) {
        return sessionName;
      }
    }

    // Also check parent processes (claude might be a child of the shell in tmux)
    // Get parent PID
    try {
      const ppidOutput = execSync(`ps -o ppid= -p ${pid}`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      const ppid = parseInt(ppidOutput, 10);
      if (!isNaN(ppid) && ppid > 1) {
        for (const line of output.split("\n")) {
          const [panePid, sessionName] = line.split(" ");
          if (parseInt(panePid, 10) === ppid) {
            return sessionName;
          }
        }
      }
    } catch {
      // Couldn't get parent PID
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Find the tmux session where Claude is running for a given session ID
 * Returns { sessionName, isOurSession } or null if not in tmux
 */
export function findClaudeTmuxSession(sessionId: string, cwd?: string): { sessionName: string; isOurSession: boolean } | null {
  const pid = getClaudeProcessPid(sessionId, cwd);
  if (!pid) return null;

  const sessionName = findTmuxSessionByPid(pid);
  if (!sessionName) return null;

  const expectedName = getTmuxSessionName(sessionId);
  return {
    sessionName,
    isOurSession: sessionName === expectedName,
  };
}

/**
 * Get info about a tmux session
 */
export interface TmuxSessionInfo {
  name: string;
  created: string;
  attached: boolean;
  windows: number;
}

export function getSessionInfo(sessionId: string): TmuxSessionInfo | null {
  const tmux = getTmuxPath();
  if (!tmux) return null;

  const sessionName = getTmuxSessionName(sessionId);

  try {
    const output = execSync(
      `${tmux} list-sessions -F "#{session_name}:#{session_created}:#{session_attached}:#{session_windows}" | grep "^${sessionName}:"`,
      {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }
    ).trim();

    if (!output) return null;

    const [name, created, attached, windows] = output.split(":");
    return {
      name,
      created,
      attached: attached === "1",
      windows: parseInt(windows, 10),
    };
  } catch {
    return null;
  }
}

/**
 * List all Claude tmux sessions
 */
export function listClaudeSessions(): TmuxSessionInfo[] {
  const tmux = getTmuxPath();
  if (!tmux) return [];

  try {
    const output = execSync(
      `${tmux} list-sessions -F "#{session_name}:#{session_created}:#{session_attached}:#{session_windows}" 2>/dev/null | grep "^claude-"`,
      {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }
    ).trim();

    if (!output) return [];

    return output.split("\n").map((line) => {
      const [name, created, attached, windows] = line.split(":");
      return {
        name,
        created,
        attached: attached === "1",
        windows: parseInt(windows, 10),
      };
    });
  } catch {
    return [];
  }
}
