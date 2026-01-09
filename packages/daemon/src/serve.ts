#!/usr/bin/env node
/**
 * Starts the session watcher and durable streams server.
 * Sessions are published to the stream for the UI to consume.
 */

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
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
import { isNotificationsEnabled, notifyWaitingForInput, notifyNeedsApproval, focusiTermSession, openSessionInITerm, focusOrOpenSession } from "./notify.js";

const PORT = parseInt(process.env.PORT ?? "4450", 10);
const API_PORT = parseInt(process.env.API_PORT ?? "4451", 10);
const MAX_AGE_HOURS = parseInt(process.env.MAX_AGE_HOURS ?? "24", 10);
const MAX_AGE_MS = MAX_AGE_HOURS * 60 * 60 * 1000;

// ANSI colors
const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
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
  console.log(`${colors.bold}Claude Code Session Daemon${colors.reset}`);
  console.log(`${colors.dim}Showing sessions from last ${MAX_AGE_HOURS} hours${colors.reset}`);
  console.log();

  // Check optional integrations and show warnings
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  await checkGHAuth();
  const hasGHAuth = isGHEnabled();

  const hasNotifications = isNotificationsEnabled();

  if (!hasAnthropicKey || !hasGHAuth || !hasNotifications) {
    console.log(`${colors.yellow}Optional integrations:${colors.reset}`);
    if (!hasAnthropicKey) {
      console.log(`  ${colors.dim}• ANTHROPIC_API_KEY not set - AI summaries disabled${colors.reset}`);
    }
    if (!hasGHAuth) {
      console.log(`  ${colors.dim}• gh CLI not authenticated - PR/CI tracking disabled${colors.reset}`);
    }
    if (!hasNotifications) {
      console.log(`  ${colors.dim}• NOTIFICATIONS_ENABLED not set - desktop notifications disabled${colors.reset}`);
    }
    console.log();
  }

  // Start the durable streams server
  const streamServer = new StreamServer({ port: PORT });
  await streamServer.start();

  console.log(`Stream URL: ${colors.cyan}${streamServer.getStreamUrl()}${colors.reset}`);
  console.log();

  // Start simple HTTP API server for actions (like focus iTerm)
  const apiServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS headers for UI
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "POST" && req.url === "/focus-iterm") {
      try {
        // Parse body
        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }
        const { searchTerm } = JSON.parse(body || "{}");

        const success = await focusiTermSession(searchTerm);

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
        // Parse body
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

        const success = await openSessionInITerm({ cwd, sessionId });

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
        // Parse body
        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }
        const { cwd, sessionId, status, lastAgentMessage } = JSON.parse(body || "{}");

        if (!cwd || !sessionId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "cwd and sessionId required" }));
          return;
        }

        const result = await focusOrOpenSession({ cwd, sessionId, status, lastAgentMessage });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: (error as Error).message }));
      }
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  apiServer.listen(API_PORT, "127.0.0.1", () => {
    console.log(`API server: ${colors.cyan}http://127.0.0.1:${API_PORT}${colors.reset}`);
  });

  console.log();

  // Start the session watcher
  const watcher = new SessionWatcher({ debounceMs: 300 });

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

    // Publish to stream
    try {
      const operation = type === "created" ? "insert" : type === "deleted" ? "delete" : "update";
      await streamServer.publishSession(session, operation);
    } catch (error) {
      console.error(`${colors.yellow}[ERROR]${colors.reset} Failed to publish:`, error);
    }

    // Send notifications on status transitions
    if (type === "updated" && event.previousStatus) {
      const prevStatus = event.previousStatus.status;
      const newStatus = session.status.status;
      const wasWorking = prevStatus === "working";

      // Notify when transitioning FROM working TO waiting/needs approval
      if (wasWorking && newStatus === "waiting") {
        const notifyInfo = {
          cwd: session.cwd,
          gitRepoId: session.gitRepoId,
        };
        if (session.status.hasPendingToolUse) {
          await notifyNeedsApproval(notifyInfo);
        } else {
          await notifyWaitingForInput(notifyInfo);
        }
      }
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
    apiServer.close();
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
