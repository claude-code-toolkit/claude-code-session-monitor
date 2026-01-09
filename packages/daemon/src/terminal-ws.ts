/**
 * WebSocket server for terminal I/O.
 * Handles connections from the browser and bridges to PTY processes.
 */

import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Server } from "node:http";
import { getPtyManager } from "./pty.js";

const WS_PATH = "/terminal";

interface TerminalMessage {
  type: "input" | "resize" | "ping";
  data?: string;
  cols?: number;
  rows?: number;
}

interface ConnectionState {
  sessionId: string | null;
  launcherId: string | null;
  ptyId: string | null;
  cwd: string | null;
  hostname: string | null;
}

export class TerminalWebSocketServer {
  private wss: WebSocketServer;
  private connectionStates = new WeakMap<WebSocket, ConnectionState>();

  constructor(server: Server) {
    this.wss = new WebSocketServer({
      server,
      path: WS_PATH,
    });

    this.wss.on("connection", (ws, req) => this.handleConnection(ws, req));
    this.wss.on("error", (error) => {
      console.error("[terminal-ws] Server error:", error);
    });

    console.log(`[terminal-ws] WebSocket server started on ${WS_PATH}`);
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    // Parse session info from URL query params
    // URL format: /terminal?sessionId=xxx&cwd=xxx&hostname=xxx
    // Or for launcher: /terminal?launcherId=xxx&hostname=xxx
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const sessionId = url.searchParams.get("sessionId");
    const launcherId = url.searchParams.get("launcherId");
    const cwd = url.searchParams.get("cwd");
    const hostname = url.searchParams.get("hostname") || "local";

    const ptyManager = getPtyManager();

    // Handle launcher connection
    if (launcherId) {
      console.log(`[terminal-ws] New connection for launcher ${launcherId}`);

      // Find existing launcher PTY (should have been created via REST API)
      const pty = ptyManager.getByLauncherId(launcherId);
      if (!pty) {
        console.log("[terminal-ws] Connection rejected: launcher not found");
        ws.close(4000, "Launcher not found - create via POST /terminals/launcher first");
        return;
      }

      // Initialize connection state
      const state: ConnectionState = {
        sessionId: null,
        launcherId,
        ptyId: pty.ptyId,
        cwd: pty.cwd,
        hostname,
      };
      this.connectionStates.set(ws, state);

      // Attach this WebSocket to the launcher PTY
      ptyManager.attach(pty.ptyId, ws);

      // Handle messages and cleanup
      this.setupMessageHandlers(ws);
      return;
    }

    // Handle regular session connection
    if (!sessionId || !cwd) {
      console.log("[terminal-ws] Connection rejected: missing sessionId or cwd");
      ws.close(4000, "Missing sessionId or cwd (or launcherId for launcher)");
      return;
    }

    console.log(`[terminal-ws] New connection for session ${sessionId}`);

    // Initialize connection state
    const state: ConnectionState = {
      sessionId,
      launcherId: null,
      ptyId: null,
      cwd,
      hostname,
    };
    this.connectionStates.set(ws, state);

    // Get or create PTY for this session
    let pty;
    try {
      pty = ptyManager.getOrCreate(sessionId, cwd, hostname);
      state.ptyId = pty.ptyId;

      // Attach this WebSocket to the PTY
      ptyManager.attach(pty.ptyId, ws);
    } catch (error) {
      console.error(`[terminal-ws] Failed to create PTY for session ${sessionId}:`, error);
      ws.send(JSON.stringify({
        type: "error",
        message: `Failed to create terminal: ${(error as Error).message}`,
      }));
      ws.close(4001, "Failed to create PTY");
      return;
    }

    // Handle messages and cleanup
    this.setupMessageHandlers(ws);
  }

  /**
   * Setup message handlers for a WebSocket connection
   */
  private setupMessageHandlers(ws: WebSocket): void {
    const ptyManager = getPtyManager();

    // Handle messages from client
    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString()) as TerminalMessage;
        this.handleMessage(ws, message);
      } catch (error) {
        console.error("[terminal-ws] Failed to parse message:", error);
      }
    });

    // Handle client disconnect
    ws.on("close", () => {
      const state = this.connectionStates.get(ws);
      if (state?.ptyId) {
        ptyManager.detach(state.ptyId, ws);
        const identifier = state.launcherId
          ? `launcher ${state.launcherId}`
          : `session ${state.sessionId}`;
        console.log(`[terminal-ws] Connection closed for ${identifier}`);
      }
    });

    // Handle errors
    ws.on("error", (error) => {
      console.error(`[terminal-ws] WebSocket error:`, error);
    });
  }

  /**
   * Handle message from client
   */
  private handleMessage(ws: WebSocket, message: TerminalMessage): void {
    const state = this.connectionStates.get(ws);
    if (!state?.ptyId) return;

    const ptyManager = getPtyManager();

    switch (message.type) {
      case "input":
        if (message.data) {
          ptyManager.write(state.ptyId, message.data);
        }
        break;

      case "resize":
        if (message.cols && message.rows) {
          ptyManager.resize(state.ptyId, message.cols, message.rows);
        }
        break;

      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;

      default:
        console.log(`[terminal-ws] Unknown message type: ${(message as TerminalMessage).type}`);
    }
  }

  /**
   * Close the WebSocket server
   */
  close(): void {
    this.wss.close();
    console.log("[terminal-ws] WebSocket server closed");
  }

  /**
   * Get number of connected clients
   */
  getConnectionCount(): number {
    return this.wss.clients.size;
  }
}

// Singleton instance
let terminalWsServer: TerminalWebSocketServer | null = null;

export function createTerminalWebSocketServer(server: Server): TerminalWebSocketServer {
  if (terminalWsServer) {
    return terminalWsServer;
  }
  terminalWsServer = new TerminalWebSocketServer(server);
  return terminalWsServer;
}

export function getTerminalWebSocketServer(): TerminalWebSocketServer | null {
  return terminalWsServer;
}
