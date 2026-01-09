#!/usr/bin/env node
/**
 * Starts the session watcher and durable streams server.
 * Sessions are published to the stream for the UI to consume.
 */

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, rmSync } from "node:fs";
import os from "node:os";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

// Load .env from project root (handles both src and dist execution)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPaths = [
  path.resolve(__dirname, "../../../.env"),  // from src/
  path.resolve(__dirname, "../../.env"),     // from dist/
  path.resolve(process.cwd(), ".env"),       // from cwd
];
for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}
import { SessionWatcher, type SessionEvent, type SessionState } from "./watcher.js";
import { StreamServer } from "./server.js";
import { formatStatus } from "./status.js";
import { checkGHAuth, isGHEnabled } from "./github.js";
// Browser notifications are now handled via the stream, not terminal-notifier
import { Terminal, getTerminalType } from "./terminal.js";
import { getMountManager } from "./mounts.js";
import { getPtyManager, getClaudePath } from "./pty.js";
import { createTerminalWebSocketServer } from "./terminal-ws.js";
import { getTmuxPath } from "./tmux.js";

const PORT = parseInt(process.env.PORT ?? "4450", 10);
const API_PORT = parseInt(process.env.API_PORT ?? "4451", 10);
const MAX_AGE_HOURS = parseInt(process.env.MAX_AGE_HOURS ?? "24", 10);
const MAX_AGE_MS = MAX_AGE_HOURS * 60 * 60 * 1000;

// ANSI colors
const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

/**
 * Check if a session is recent enough to include
 */
function isRecentSession(session: SessionState): boolean {
  const lastActivity = new Date(session.status.lastActivityAt).getTime();
  return Date.now() - lastActivity < MAX_AGE_MS;
}

async function main(): Promise<void> {
  // Handle --clear flag to reset state
  const args = process.argv.slice(2);
  if (args.includes("--clear")) {
    const stateDir = path.join(os.homedir(), ".claude-code-ui", "streams");
    if (existsSync(stateDir)) {
      console.log(`${colors.yellow}Clearing state directory: ${stateDir}${colors.reset}`);
      rmSync(stateDir, { recursive: true, force: true });
    }
  }

  console.log(`${colors.bold}Claude Code Session Daemon${colors.reset}`);
  console.log(`${colors.dim}Showing sessions from last ${MAX_AGE_HOURS} hours${colors.reset}`);
  console.log();

  // Check optional integrations and show warnings
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  await checkGHAuth();
  const hasGHAuth = isGHEnabled();

  const terminalType = getTerminalType();
  const hasTerminal = terminalType !== "NONE";

  if (!hasAnthropicKey || !hasGHAuth || !hasTerminal) {
    console.log(`${colors.yellow}Optional integrations:${colors.reset}`);
    if (!hasAnthropicKey) {
      console.log(`  ${colors.dim}• ANTHROPIC_API_KEY not set - AI summaries disabled${colors.reset}`);
    }
    if (!hasGHAuth) {
      console.log(`  ${colors.dim}• gh CLI not authenticated - PR/CI tracking disabled${colors.reset}`);
    }
    if (!hasTerminal) {
      console.log(`  ${colors.dim}• TERMINAL not set or unsupported - click-to-focus disabled${colors.reset}`);
    }
    console.log();
  }

  if (hasTerminal) {
    console.log(`${colors.dim}Terminal: ${terminalType}${colors.reset}`);
  }

  // Start the durable streams server
  const streamServer = new StreamServer({ port: PORT });
  await streamServer.start();

  console.log(`Stream URL: ${colors.cyan}${streamServer.getStreamUrl()}${colors.reset}`);

  // Start the PTY manager for terminal sessions
  const ptyManager = getPtyManager();
  ptyManager.start();

  // Check tmux availability (required for terminal feature)
  const tmuxPath = getTmuxPath();
  if (tmuxPath) {
    console.log(`tmux: ${colors.cyan}${tmuxPath}${colors.reset}`);
  } else {
    console.log(`${colors.red}Error: tmux not found - terminal feature disabled${colors.reset}`);
    console.log(`${colors.dim}Install with: brew install tmux${colors.reset}`);
  }

  // Resolve claude path early (will warn if not found)
  const claudePath = getClaudePath();
  if (claudePath) {
    console.log(`Claude CLI: ${colors.cyan}${claudePath}${colors.reset}`);
  } else {
    console.log(`${colors.yellow}Warning: claude CLI not found - terminal feature disabled${colors.reset}`);
  }
  console.log();

  // Mount remote machines via SSHFS (if configured)
  const mountManager = getMountManager();
  await mountManager.mountAll();

  // Start simple HTTP API server for actions (like focus iTerm)
  const apiServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS headers for UI
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "POST" && req.url === "/focus-iterm") {
      try {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }
        const { searchTerm } = JSON.parse(body || "{}");
        const success = await Terminal.focusByName(searchTerm);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success }));
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: (error as Error).message }));
      }
      return;
    }

    if (req.method === "POST" && req.url === "/open-session") {
      try {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }
        const { cwd, sessionId } = JSON.parse(body || "{}");
        if (!cwd || !sessionId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "cwd and sessionId required" }));
          return;
        }
        const success = await Terminal.openTab({ cwd, command: `claude --resume ${sessionId}` });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success }));
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: (error as Error).message }));
      }
      return;
    }

    if (req.method === "POST" && req.url === "/focus-or-open") {
      try {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }
        const { cwd, sessionId, lastAgentMessage } = JSON.parse(body || "{}");
        if (!cwd || !sessionId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "cwd and sessionId required" }));
          return;
        }
        const result = await Terminal.focusOrOpen({ cwd, sessionId, lastAgentMessage });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: (error as Error).message }));
      }
      return;
    }

    // GET /machines - return list of all machines (local + mounted)
    if (req.method === "GET" && req.url === "/machines") {
      const machines = mountManager.getMachineInfo();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ machines }));
      return;
    }

    // GET /terminals - list all active PTYs
    if (req.method === "GET" && req.url === "/terminals") {
      const terminals = ptyManager.getAllTerminalInfos();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ terminals }));
      return;
    }

    // POST /terminals/launcher - create launcher PTY (fzf directory picker)
    if (req.method === "POST" && req.url === "/terminals/launcher") {
      try {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }
        const { hostname } = JSON.parse(body || "{}");
        const pty = ptyManager.createLauncher(hostname || "local");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ptyId: pty.ptyId,
          launcherId: pty.launcherId,
          hostname: pty.hostname,
        }));
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: (error as Error).message }));
      }
      return;
    }

    // POST /terminals - create PTY for a session
    if (req.method === "POST" && req.url === "/terminals") {
      try {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }
        const { sessionId, cwd, hostname } = JSON.parse(body || "{}");
        if (!sessionId || !cwd) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "sessionId and cwd required" }));
          return;
        }
        const pty = ptyManager.getOrCreate(sessionId, cwd, hostname || "local");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ptyId: pty.ptyId,
          sessionId: pty.sessionId,
          hostname: pty.hostname,
        }));
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: (error as Error).message }));
      }
      return;
    }

    // DELETE /terminals/:ptyId - kill a PTY
    const deleteMatch = req.url?.match(/^\/terminals\/([^/]+)$/);
    if (req.method === "DELETE" && deleteMatch) {
      const ptyId = deleteMatch[1];
      const success = ptyManager.kill(ptyId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success }));
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  apiServer.listen(API_PORT, "127.0.0.1", () => {
    console.log(`API server: ${colors.cyan}http://127.0.0.1:${API_PORT}${colors.reset}`);
  });

  // Attach WebSocket server for terminal I/O
  const terminalWs = createTerminalWebSocketServer(apiServer);
  console.log(`Terminal WebSocket: ${colors.cyan}ws://127.0.0.1:${API_PORT}/terminal${colors.reset}`);

  console.log();

  // Start the session watcher with all watch paths (local + mounted)
  const watchPaths = mountManager.getWatchPaths();
  const watcher = new SessionWatcher({ debounceMs: 300, watchPaths });

  watcher.on("session", async (event: SessionEvent) => {
    const { type, session } = event;

    // Only publish recent sessions
    if (!isRecentSession(session) && type !== "deleted") {
      return;
    }

    const timestamp = new Date().toLocaleTimeString();

    // Log to console - show directory name for easier identification
    const statusStr = formatStatus(session.status);
    const dirName = session.cwd.split("/").pop() || session.cwd;
    console.log(
      `${colors.gray}${timestamp}${colors.reset} ` +
      `${type === "created" ? colors.green : type === "deleted" ? colors.blue : colors.yellow}[${type.toUpperCase().slice(0, 3)}]${colors.reset} ` +
      `${colors.cyan}${session.sessionId.slice(0, 8)}${colors.reset} ` +
      `${colors.dim}${dirName}${colors.reset} ` +
      `${statusStr}`
    );

    // Check if we need to send a notification
    let notification: { type: "waiting_for_input" | "needs_approval"; timestamp: string } | null = null;

    if (type === "updated" && event.previousStatus) {
      const prevStatus = event.previousStatus.status;
      const newStatus = session.status.status;
      const wasWorking = prevStatus === "working";

      // Notify when transitioning FROM working TO waiting/needs approval
      if (wasWorking && newStatus === "waiting") {
        notification = {
          type: session.status.hasPendingToolUse ? "needs_approval" : "waiting_for_input",
          timestamp: new Date().toISOString(),
        };
        console.log(`[notify] ${session.sessionId.slice(0, 8)}: ${notification.type}`);
      }
    }

    // Publish to stream (with notification if any)
    try {
      const operation = type === "created" ? "insert" : type === "deleted" ? "delete" : "update";
      await streamServer.publishSession(session, operation, notification);
    } catch (error) {
      console.error(`${colors.yellow}[ERROR]${colors.reset} Failed to publish:`, error);
    }
  });

  watcher.on("error", (error: Error) => {
    console.error(`${colors.yellow}[ERROR]${colors.reset}`, error.message);
  });

  // Periodically recheck timeouts for sessions stuck in "working" state
  const timeoutChecker = setInterval(() => {
    watcher.recheckTimeouts();
  }, 2000);

  // Handle shutdown
  process.on("SIGINT", async () => {
    console.log();
    console.log(`${colors.dim}Shutting down...${colors.reset}`);
    clearInterval(timeoutChecker);
    watcher.stop();
    terminalWs.close();
    await ptyManager.stop();
    apiServer.close();
    await mountManager.unmountAll();
    await streamServer.stop();
    process.exit(0);
  });

  // Start watching
  await watcher.start();

  // Publish initial sessions (filtered to recent only)
  const allSessions = watcher.getSessions();
  const recentSessions = Array.from(allSessions.values()).filter(isRecentSession);

  console.log(`${colors.dim}Found ${recentSessions.length} recent sessions (of ${allSessions.size} total), publishing...${colors.reset}`);

  for (const session of recentSessions) {
    try {
      await streamServer.publishSession(session, "insert");
    } catch (error) {
      console.error(`${colors.yellow}[ERROR]${colors.reset} Failed to publish initial session:`, error);
    }
  }

  console.log();
  console.log(`${colors.green}✓${colors.reset} Ready - watching for changes`);
  console.log(`${colors.dim}Press Ctrl+C to exit${colors.reset}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
