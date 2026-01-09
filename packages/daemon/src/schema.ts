import { z } from "zod";
import { createStateSchema } from "@durable-streams/state";

// Session status enum
export const SessionStatusSchema = z.enum(["working", "waiting", "idle"]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

// Pending tool info
export const PendingToolSchema = z.object({
  tool: z.string(),
  target: z.string(),
});
export type PendingTool = z.infer<typeof PendingToolSchema>;

// Recent output entry for live view
export const RecentOutputSchema = z.object({
  role: z.enum(["user", "assistant", "tool"]),
  content: z.string(),
});
export type RecentOutput = z.infer<typeof RecentOutputSchema>;

// CI check status
export const CIStatusSchema = z.enum(["pending", "running", "success", "failure", "cancelled", "unknown"]);
export type CIStatus = z.infer<typeof CIStatusSchema>;

// PR info
export const PRInfoSchema = z.object({
  number: z.number(),
  url: z.string(),
  title: z.string(),
  ciStatus: CIStatusSchema,
  ciChecks: z.array(z.object({
    name: z.string(),
    status: CIStatusSchema,
    url: z.string().nullable(),
  })),
  lastChecked: z.string(), // ISO timestamp
});
export type PRInfo = z.infer<typeof PRInfoSchema>;

// Notification info (for browser notifications)
export const NotificationSchema = z.object({
  type: z.enum(["waiting_for_input", "needs_approval"]),
  timestamp: z.string(), // ISO timestamp - used to detect new notifications
});
export type SessionNotification = z.infer<typeof NotificationSchema>;

// Terminal info (PTY state)
export const TerminalInfoSchema = z.object({
  ptyId: z.string(),
  sessionId: z.string(),
  hostname: z.string(),
  active: z.boolean(), // Has at least one connection
  createdAt: z.string(), // ISO timestamp
  lastActivityAt: z.string(), // ISO timestamp
  connectionCount: z.number(),
  tmuxSession: z.string().nullable(), // tmux session name
});
export type TerminalInfo = z.infer<typeof TerminalInfoSchema>;

// Main session state schema
export const SessionSchema = z.object({
  sessionId: z.string(),
  hostname: z.string(), // Machine hostname for multi-machine support
  cwd: z.string(),
  gitBranch: z.string().nullable(),
  gitRepoUrl: z.string().nullable(),
  gitRepoId: z.string().nullable(),
  originalPrompt: z.string(),
  status: SessionStatusSchema,
  lastActivityAt: z.string(), // ISO timestamp
  messageCount: z.number(),
  hasPendingToolUse: z.boolean(),
  pendingTool: PendingToolSchema.nullable(),
  goal: z.string(), // High-level goal of the session
  summary: z.string(), // Current activity summary
  recentOutput: z.array(RecentOutputSchema), // Last few messages for live view
  pr: PRInfoSchema.nullable(), // Associated PR if branch has one
  terminal: TerminalInfoSchema.nullable(), // PTY state if terminal is open
  notification: NotificationSchema.nullable(), // Latest notification (for browser notifications)
});
export type Session = z.infer<typeof SessionSchema>;

// Create the state schema for durable streams
export const sessionsStateSchema = createStateSchema({
  sessions: {
    schema: SessionSchema,
    type: "session",
    primaryKey: "sessionId",
  },
});
