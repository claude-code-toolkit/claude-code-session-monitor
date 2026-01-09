/**
 * iTerm2 tab management for macOS
 * Handles finding, focusing, and opening iTerm sessions
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";

const execAsync = promisify(exec);
const isMacOS = platform() === "darwin";

interface ITermSession {
  name: string;
  cwd: string;
}

/**
 * Normalize text to alphanumeric + spaces only for reliable matching
 */
function normalizeForMatch(text: string): string {
  return text
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export class ITerm {
  /**
   * Check if we're on macOS (iTerm features only work there)
   */
  static get isSupported(): boolean {
    return isMacOS;
  }

  /**
   * Get all iTerm2 sessions with their names and working directories
   */
  static async getAllSessions(): Promise<ITermSession[]> {
    if (!isMacOS) return [];

    try {
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
      return stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [name, cwd] = line.split("|||");
          return { name: name || "", cwd: cwd || "" };
        });
    } catch {
      return [];
    }
  }

  /**
   * Get the current Claude session name (first one with sparkle prefix)
   */
  static async getCurrentClaudeSessionName(): Promise<string | null> {
    const sessions = await this.getAllSessions();
    const claude = sessions.find((s) => s.name.startsWith("✳"));
    return claude?.name || null;
  }

  /**
   * Focus an iTerm session by name search term
   */
  static async focusByName(searchTerm?: string): Promise<boolean> {
    if (!isMacOS) return false;

    try {
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
   * Find and focus a tab by searching its scrollback contents
   * Uses normalized alphanumeric matching on last 40 chars of search text
   */
  static async focusByContent(searchText: string): Promise<boolean> {
    if (!isMacOS || !searchText) return false;

    const normalized = normalizeForMatch(searchText);
    const snippet = normalized.length > 40 ? normalized.slice(-40) : normalized;

    if (snippet.length < 10) return false;

    try {
      // Search ALL tabs using 'contents' (full scrollback buffer)
      // We search all tabs because resumed sessions lose the sparkle prefix when Claude exits
      const { stdout } = await execAsync(`osascript <<'APPLESCRIPT'
set searchSnippet to "${snippet}"
tell application "iTerm2"
    repeat with w in windows
        repeat with t in tabs of w
            repeat with s in sessions of t
                tell s
                    set sessionContents to contents
                end tell
                -- Normalize: lowercase, alphanumeric + spaces only
                set normalizedText to do shell script "echo " & quoted form of sessionContents & " | tr -cd 'a-zA-Z0-9 ' | tr '[:upper:]' '[:lower:]' | tr -s ' '"
                if normalizedText contains searchSnippet then
                    activate
                    select t
                    tell s to select
                    return "found"
                end if
            end repeat
        end repeat
    end repeat
    return "not found"
end tell
APPLESCRIPT`);
      return stdout.trim() === "found";
    } catch {
      return false;
    }
  }

  /**
   * Open a new iTerm tab, cd to directory, and run a command
   */
  static async openTab(options: { cwd: string; command: string }): Promise<boolean> {
    if (!isMacOS) return false;

    const { cwd, command } = options;

    try {
      await execAsync(`osascript <<'APPLESCRIPT'
tell application "iTerm2"
    activate
    if (count of windows) = 0 then
        create window with default profile
    end if
    tell current window
        create tab with default profile
        tell current session
            write text "cd ${cwd.replace(/"/g, '\\"')} && ${command.replace(/"/g, '\\"')}"
        end tell
    end tell
end tell
APPLESCRIPT`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Smart focus or open a Claude session:
   * 1. Search for tab containing last agent message
   * 2. Fallback: search for sessionId in tab content
   * 3. If not found: open new tab with claude --resume
   */
  static async focusOrOpen(options: {
    cwd: string;
    sessionId: string;
    lastAgentMessage?: string;
  }): Promise<{ action: "focused" | "opened" | "failed" }> {
    if (!isMacOS) return { action: "failed" };

    const { cwd, sessionId, lastAgentMessage } = options;

    // Try to find tab by last agent message content
    if (lastAgentMessage) {
      if (await this.focusByContent(lastAgentMessage)) {
        return { action: "focused" };
      }
    }

    // Fallback: search for sessionId (visible in `claude --resume <id>` command)
    if (await this.focusByContent(sessionId)) {
      return { action: "focused" };
    }

    // No matching tab - open new one
    const opened = await this.openTab({
      cwd,
      command: `claude --resume ${sessionId}`,
    });
    return { action: opened ? "opened" : "failed" };
  }
}
