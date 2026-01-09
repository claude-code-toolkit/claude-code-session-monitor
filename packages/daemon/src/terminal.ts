/**
 * Terminal abstraction for tab management and focusing.
 * Supports different terminal emulators via TERMINAL env var.
 *
 * Supported terminals:
 * - iterm2 (default on macOS)
 * - none (disable terminal features)
 *
 * Future: terminal, kitty, warp, alacritty
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";

const execAsync = promisify(exec);
const isMacOS = platform() === "darwin";

export type TerminalType = "iterm2" | "none";

/**
 * Get configured terminal type from env var
 */
export function getTerminalType(): TerminalType {
  const terminal = process.env.TERMINAL?.toLowerCase();

  if (terminal === "none" || terminal === "disabled") {
    return "none";
  }

  if (terminal === "iterm2" || terminal === "iterm") {
    return "iterm2";
  }

  // Default: iterm2 on macOS, none otherwise
  if (!terminal) {
    return isMacOS ? "iterm2" : "none";
  }

  // Unknown terminal - warn and disable
  console.warn(`Unknown TERMINAL="${terminal}", disabling terminal features. Supported: iterm2, none`);
  return "none";
}

/**
 * Check if terminal features are enabled
 */
export function isTerminalEnabled(): boolean {
  return getTerminalType() !== "none";
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

// =============================================================================
// iTerm2 Implementation
// =============================================================================

const iterm2 = {
  async getAllSessions(): Promise<{ name: string; cwd: string }[]> {
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
  },

  async getCurrentClaudeSessionName(): Promise<string | null> {
    const sessions = await this.getAllSessions();
    const claude = sessions.find((s) => s.name.startsWith("✳"));
    return claude?.name || null;
  },

  async focusByName(searchTerm?: string): Promise<boolean> {
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
  },

  async focusByContent(searchText: string): Promise<boolean> {
    if (!searchText) return false;

    const normalized = normalizeForMatch(searchText);
    const snippet = normalized.length > 40 ? normalized.slice(-40) : normalized;

    if (snippet.length < 10) return false;

    try {
      const { stdout } = await execAsync(`osascript <<'APPLESCRIPT'
set searchSnippet to "${snippet}"
tell application "iTerm2"
    repeat with w in windows
        repeat with t in tabs of w
            repeat with s in sessions of t
                tell s
                    set sessionContents to contents
                end tell
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
  },

  async openTab(options: { cwd: string; command: string }): Promise<boolean> {
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
  },
};

// =============================================================================
// Public Terminal API
// =============================================================================

export const Terminal = {
  /**
   * Check if terminal features are available
   */
  get isSupported(): boolean {
    return isTerminalEnabled();
  },

  /**
   * Get the configured terminal type
   */
  get type(): TerminalType {
    return getTerminalType();
  },

  /**
   * Get all terminal sessions
   */
  async getAllSessions(): Promise<{ name: string; cwd: string }[]> {
    const type = getTerminalType();
    if (type === "iterm2") return iterm2.getAllSessions();
    return [];
  },

  /**
   * Get the current Claude session name (with sparkle prefix)
   */
  async getCurrentClaudeSessionName(): Promise<string | null> {
    const type = getTerminalType();
    if (type === "iterm2") return iterm2.getCurrentClaudeSessionName();
    return null;
  },

  /**
   * Focus a tab by name search
   */
  async focusByName(searchTerm?: string): Promise<boolean> {
    const type = getTerminalType();
    if (type === "iterm2") return iterm2.focusByName(searchTerm);
    return false;
  },

  /**
   * Focus a tab by searching its content
   */
  async focusByContent(searchText: string): Promise<boolean> {
    const type = getTerminalType();
    if (type === "iterm2") return iterm2.focusByContent(searchText);
    return false;
  },

  /**
   * Open a new tab with a command
   */
  async openTab(options: { cwd: string; command: string }): Promise<boolean> {
    const type = getTerminalType();
    if (type === "iterm2") return iterm2.openTab(options);
    return false;
  },

  /**
   * Smart focus or open a Claude session
   */
  async focusOrOpen(options: {
    cwd: string;
    sessionId: string;
    lastAgentMessage?: string;
  }): Promise<{ action: "focused" | "opened" | "failed" }> {
    if (!isTerminalEnabled()) return { action: "failed" };

    const { cwd, sessionId, lastAgentMessage } = options;

    // Try to find tab by last agent message content
    if (lastAgentMessage) {
      if (await this.focusByContent(lastAgentMessage)) {
        return { action: "focused" };
      }
    }

    // Fallback: search for sessionId
    if (await this.focusByContent(sessionId)) {
      return { action: "focused" };
    }

    // No matching tab - open new one
    const opened = await this.openTab({
      cwd,
      command: `claude --resume ${sessionId}`,
    });
    return { action: opened ? "opened" : "failed" };
  },
};
