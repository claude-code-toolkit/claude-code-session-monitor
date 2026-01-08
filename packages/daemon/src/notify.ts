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
 * Get all iTerm2 session names
 */
async function getAlliTermSessionNames(): Promise<string[]> {
  if (!isMacOS) return [];

  try {
    const { stdout } = await execAsync(`osascript -e '
tell application "iTerm2"
    set output to ""
    repeat with w in windows
        repeat with t in tabs of w
            repeat with s in sessions of t
                set sessionName to name of s
                set output to output & sessionName & "\\n"
            end repeat
        end repeat
    end repeat
    return output
end tell
'`);
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
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
