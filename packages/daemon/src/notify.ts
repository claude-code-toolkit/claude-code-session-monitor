/**
 * Desktop notifications for session status changes (macOS only)
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { platform, tmpdir } from "node:os";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const execAsync = promisify(exec);

// Check if notifications are enabled via env var
export function isNotificationsEnabled(): boolean {
  return process.env.NOTIFICATIONS_ENABLED === "true";
}

// Check if we're on macOS
const isMacOS = platform() === "darwin";

/**
 * Get all iTerm2 session info (name and working directory)
 */
interface ITermSession {
  name: string;
  cwd: string;
}

async function getAlliTermSessions(): Promise<ITermSession[]> {
  if (!isMacOS) return [];

  try {
    // Get session names and their working directories
    const { stdout } = await execAsync(`osascript -e '
tell application "iTerm2"
    set output to ""
    repeat with w in windows
        repeat with t in tabs of w
            repeat with s in sessions of t
                set sessionName to name of s
                tell s
                    set sessionPath to variable named "path"
                end tell
                set output to output & sessionName & "|||" & sessionPath & "\\n"
            end repeat
        end repeat
    end repeat
    return output
end tell
'`);
    return stdout.trim().split("\n").filter(Boolean).map(line => {
      const [name, cwd] = line.split("|||");
      return { name: name || "", cwd: cwd || "" };
    });
  } catch {
    return [];
  }
}

/**
 * Get all iTerm2 session names (legacy, for compatibility)
 */
async function getAlliTermSessionNames(): Promise<string[]> {
  const sessions = await getAlliTermSessions();
  return sessions.map(s => s.name);
}

// Store script paths to clean up later
const scriptPaths: string[] = [];

/**
 * Create a temp script to focus an iTerm Claude session (first with ✳ prefix).
 */
function createFocusScript(): string {
  const scriptPath = join(tmpdir(), `iterm-focus-${Date.now()}.sh`);
  // Find the Claude Code session (✳ prefix) whose working directory matches
  const script = `#!/bin/bash
osascript <<'APPLESCRIPT'
tell application "iTerm2"
    activate
    -- First try to find a Claude session (with ✳) in any tab
    repeat with w in windows
        repeat with t in tabs of w
            repeat with s in sessions of t
                set sessionName to name of s
                if sessionName starts with "✳" then
                    select t
                    tell s to select
                    return "focused claude session"
                end if
            end repeat
        end repeat
    end repeat
    -- Fallback: just activate iTerm
    return "no claude session found"
end tell
APPLESCRIPT
`;
  writeFileSync(scriptPath, script, { mode: 0o755 });
  scriptPaths.push(scriptPath);

  // Clean up old scripts
  while (scriptPaths.length > 10) {
    const old = scriptPaths.shift();
    if (old) try { unlinkSync(old); } catch {}
  }

  return scriptPath;
}

/**
 * Send a macOS notification using terminal-notifier or osascript fallback
 */
export function sendNotification(options: {
  title: string;
  subtitle?: string;
  message: string;
  sound?: string;
}): void {
  if (!isNotificationsEnabled() || !isMacOS) return;

  const { title, subtitle, message, sound = "default" } = options;

  // Build terminal-notifier command
  const cmdParts = [
    "terminal-notifier",
    `-title "${escapeQuotes(title)}"`,
    subtitle ? `-subtitle "${escapeQuotes(subtitle)}"` : "",
    `-message "${escapeQuotes(message)}"`,
    `-sound ${sound}`,
    `-group "claude-code-daemon"`,
  ];

  // Add click action to focus iTerm Claude session
  const scriptPath = createFocusScript();
  cmdParts.push(`-execute "${scriptPath}"`);

  const terminalNotifierCmd = cmdParts.filter(Boolean).join(" ");

  exec(terminalNotifierCmd, (error) => {
    if (error) {
      // Fallback to osascript (no click handling)
      const osascriptCmd = `osascript -e 'display notification "${escapeQuotes(message)}" with title "${escapeQuotes(title)}"${subtitle ? ` subtitle "${escapeQuotes(subtitle)}"` : ""}'`;
      exec(osascriptCmd);
    }
  });
}

/**
 * Escape quotes for shell commands
 */
function escapeQuotes(str: string): string {
  return str.replace(/"/g, '\\"').replace(/'/g, "'\\''");
}

/**
 * Get the current Claude session name (first one with ✳ prefix)
 */
async function getCurrentClaudeSessionName(): Promise<string | null> {
  const sessions = await getAlliTermSessionNames();
  return sessions.find(s => s.startsWith("✳")) || null;
}

/**
 * Focus an iTerm session by searching for one containing the search term
 */
export async function focusiTermSession(searchTerm?: string): Promise<boolean> {
  if (!isMacOS) return false;

  try {
    // Build AppleScript to find and focus session
    const searchCondition = searchTerm
      ? `sessionName contains "${searchTerm.replace(/"/g, '\\"')}"`
      : `sessionName starts with "✳"`;

    const { stdout } = await execAsync(`osascript <<'APPLESCRIPT'
tell application "iTerm2"
    activate
    repeat with w in windows
        repeat with t in tabs of w
            repeat with s in sessions of t
                set sessionName to name of s
                if ${searchCondition} then
                    select t
                    tell s to select
                    return "focused"
                end if
            end repeat
        end repeat
    end repeat
    return "not found"
end tell
APPLESCRIPT`);
    return stdout.trim() === "focused";
  } catch {
    return false;
  }
}

/**
 * Notify when session is waiting for input
 */
export async function notifyWaitingForInput(sessionInfo: {
  cwd: string;
  gitRepoId?: string | null;
}): Promise<void> {
  const dirName = sessionInfo.cwd.split("/").pop() || sessionInfo.cwd;

  // Get current iTerm Claude session name
  const iTermName = await getCurrentClaudeSessionName();
  const subtitle = iTermName || sessionInfo.gitRepoId || dirName;

  sendNotification({
    title: "Claude Code",
    subtitle,
    message: "Waiting for input",
    sound: "default",
  });
}

/**
 * Notify when session needs approval
 */
export async function notifyNeedsApproval(sessionInfo: {
  cwd: string;
  gitRepoId?: string | null;
}): Promise<void> {
  const dirName = sessionInfo.cwd.split("/").pop() || sessionInfo.cwd;

  // Get current iTerm Claude session name
  const iTermName = await getCurrentClaudeSessionName();
  const subtitle = iTermName || sessionInfo.gitRepoId || dirName;

  sendNotification({
    title: "Claude Code",
    subtitle,
    message: "Needs approval",
    sound: "default",
  });
}

/**
 * Find a Claude session (✳ prefix) with matching working directory
 */
async function findClaudeSessionByCwd(targetCwd: string): Promise<boolean> {
  const sessions = await getAlliTermSessions();
  console.log(`[findClaudeSessionByCwd] Looking for cwd="${targetCwd}"`);
  console.log(`[findClaudeSessionByCwd] Found sessions:`, sessions.map(s => `${s.name} @ ${s.cwd}`));
  // Look for a Claude session with matching cwd
  const found = sessions.some(s => s.name.startsWith("✳") && s.cwd === targetCwd);
  console.log(`[findClaudeSessionByCwd] Match found: ${found}`);
  return found;
}

/**
 * Smart focus or open:
 * - Idle sessions always open new tab (no active process)
 * - Active sessions try to focus existing tab, fallback to open
 */
export async function focusOrOpenSession(options: {
  cwd: string;
  sessionId: string;
  status?: string;
}): Promise<{ action: "focused" | "opened" | "failed" }> {
  if (!isMacOS) return { action: "failed" };

  const { cwd, sessionId, status } = options;
  console.log(`[focus-or-open] status=${status}, cwd=${cwd}, sessionId=${sessionId.slice(0, 8)}`);

  // Idle sessions: always open new tab (the process has exited)
  if (status === "idle") {
    console.log(`[focus-or-open] idle session, opening new tab...`);
    const opened = await openSessionInITerm({ cwd, sessionId });
    console.log(`[focus-or-open] open result=${opened}`);
    return { action: opened ? "opened" : "failed" };
  }

  // Active sessions: try to focus existing tab
  const hasMatchingTab = await findClaudeSessionByCwd(cwd);
  console.log(`[focus-or-open] hasMatchingTab=${hasMatchingTab}`);

  if (hasMatchingTab) {
    const focused = await focusiTermSession();
    console.log(`[focus-or-open] focus result=${focused}`);
    if (focused) {
      return { action: "focused" };
    }
  }

  // No matching tab found - open new one
  console.log(`[focus-or-open] opening new tab...`);
  const opened = await openSessionInITerm({ cwd, sessionId });
  console.log(`[focus-or-open] open result=${opened}`);
  return { action: opened ? "opened" : "failed" };
}

/**
 * Open a new iTerm tab, cd to directory, and resume a Claude session
 */
export async function openSessionInITerm(options: {
  cwd: string;
  sessionId: string;
}): Promise<boolean> {
  if (!isMacOS) return false;

  const { cwd, sessionId } = options;

  try {
    // AppleScript to open new iTerm tab and run command
    await execAsync(`osascript <<'APPLESCRIPT'
tell application "iTerm2"
    activate

    -- Try to use current window, or create new one
    if (count of windows) = 0 then
        create window with default profile
    end if

    tell current window
        -- Create new tab
        create tab with default profile

        tell current session
            -- cd to directory and resume claude session
            write text "cd ${cwd.replace(/"/g, '\\"')} && claude --resume ${sessionId}"
        end tell
    end tell
end tell
APPLESCRIPT`);
    return true;
  } catch (error) {
    console.error("Failed to open iTerm session:", (error as Error).message);
    return false;
  }
}
