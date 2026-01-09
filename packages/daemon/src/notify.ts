/**
 * Desktop notifications for session status changes (macOS only)
 */

import { exec } from "node:child_process";
import { platform, tmpdir } from "node:os";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { Terminal } from "./terminal.js";

const isMacOS = platform() === "darwin";

export function isNotificationsEnabled(): boolean {
  return process.env.NOTIFICATIONS_ENABLED === "true";
}

// Store script paths to clean up later
const scriptPaths: string[] = [];

/**
 * Create a temp script to focus an iTerm Claude session (first with sparkle prefix)
 */
function createFocusScript(): string {
  const scriptPath = join(tmpdir(), `iterm-focus-${Date.now()}.sh`);
  const script = `#!/bin/bash
osascript <<'APPLESCRIPT'
tell application "iTerm2"
    activate
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

function escapeQuotes(str: string): string {
  return str.replace(/"/g, '\\"').replace(/'/g, "'\\''");
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
 * Notify when session is waiting for input
 */
export async function notifyWaitingForInput(sessionInfo: {
  cwd: string;
  gitRepoId?: string | null;
}): Promise<void> {
  const dirName = sessionInfo.cwd.split("/").pop() || sessionInfo.cwd;
  const iTermName = await Terminal.getCurrentClaudeSessionName();
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
  const iTermName = await Terminal.getCurrentClaudeSessionName();
  const subtitle = iTermName || sessionInfo.gitRepoId || dirName;

  sendNotification({
    title: "Claude Code",
    subtitle,
    message: "Needs approval",
    sound: "default",
  });
}
