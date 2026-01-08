# Claude Code Session Tracker

A real-time dashboard for monitoring Claude Code sessions across multiple projects. See what Claude is working on, which sessions need approval, and track PR/CI status.

## Features

- **Real-time updates** via Durable Streams
- **Kanban board** showing sessions by status (Working, Needs Approval, Waiting, Idle)
- **AI-powered summaries** of session activity using Claude Sonnet
- **PR & CI tracking** - see associated PRs and their CI status
- **Multi-repo support** - sessions grouped by GitHub repository

https://github.com/user-attachments/assets/877a43af-25f9-4751-88eb-24e7bbda68da

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Claude Code    │     │     Daemon      │     │       UI        │
│   Sessions      │────▶│   (Watcher)     │────▶│   (React)       │
│  ~/.claude/     │     │                 │     │                 │
│   projects/     │     │  Durable Stream │     │  TanStack DB    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Daemon (`packages/daemon`)

Watches `~/.claude/projects/` for session log changes and:
- Parses JSONL log files incrementally
- Derives session status using XState state machine
- Generates AI summaries via Claude Sonnet API
- Detects git branches and polls for PR/CI status
- Publishes state updates to Durable Streams

### UI (`packages/ui`)

React app using TanStack Router and Radix UI:
- Subscribes to Durable Streams for real-time updates
- Groups sessions by GitHub repository
- Shows session cards with goal, summary, branch/PR info
- Hover cards with recent output preview

## Session Status State Machine

The daemon uses an XState state machine to determine session status:

```
                    ┌─────────────────┐
                    │      idle       │
                    └────────┬────────┘
                             │ USER_PROMPT
                             ▼
┌─────────────────┐  TOOL_RESULT  ┌─────────────────┐
│ waiting_for_    │◄──────────────│     working     │
│   approval      │               └────────┬────────┘
└────────┬────────┘                        │
         │                    ┌────────────┼────────────┐
         │                    │            │            │
         │              TURN_END    ASSISTANT_   STALE_
         │                    │      TOOL_USE   TIMEOUT
         │                    ▼            │            │
         │            ┌─────────────────┐  │            │
         │            │ waiting_for_   │◄─┘            │
         └───────────▶│     input      │◄──────────────┘
           IDLE_      └─────────────────┘
          TIMEOUT
```

### States

| State | Description | UI Column |
|-------|-------------|-----------|
| `idle` | No activity for 5+ minutes | Idle |
| `working` | Claude is actively processing | Working |
| `waiting_for_approval` | Tool use needs user approval | Needs Approval |
| `waiting_for_input` | Claude finished, waiting for user | Waiting |

### Events (from log entries)

| Event | Source | Description |
|-------|--------|-------------|
| `USER_PROMPT` | User entry with string content | User sent a message |
| `TOOL_RESULT` | User entry with tool_result array | User approved/ran tool |
| `ASSISTANT_STREAMING` | Assistant entry (no tool_use) | Claude is outputting |
| `ASSISTANT_TOOL_USE` | Assistant entry with tool_use | Claude requested a tool |
| `TURN_END` | System entry (turn_duration/stop_hook_summary) | Turn completed |

### Timeout Fallbacks

Claude Code inconsistently writes `turn_duration` markers, so we use timeout fallbacks:
- **500ms**: Text response without turn marker → `waiting_for_input` (fast detection)
- **5 seconds**: Tool use pending too long → `waiting_for_approval`
- **5 minutes**: No activity → `idle`

The daemon rechecks sessions every 2 seconds to catch stale states even without file changes.

## Desktop Notifications (macOS)

Get notified when Claude needs attention:

1. **Enable notifications** in `.env`:
   ```bash
   NOTIFICATIONS_ENABLED=true
   ```

2. **Silence Claude Code's built-in notifications** (optional, to avoid duplicates):
   ```bash
   ./scripts/silence-claude-notifications.sh
   ```
   Or manually add to `~/.claude/settings.json`:
   ```json
   {
     "preferredNotifChannel": "terminal_bell"
   }
   ```

3. **Install terminal-notifier** (for better notifications):
   ```bash
   brew install terminal-notifier
   ```

### Features
- Shows current iTerm tab name (e.g., "✳ Feature Implementation (node)")
- Click notification to focus the correct iTerm tab
- Notifications for "Waiting for input" and "Needs approval" states

## Development

```bash
# Install dependencies
pnpm install

# Start both daemon and UI
pnpm start

# Or run separately:
pnpm serve  # Start daemon on port 4450
pnpm dev    # Start UI dev server
```

## Environment Variables

All integrations are optional - the daemon works without any of these:

```bash
# .env file in project root

# AI-powered summaries (optional)
ANTHROPIC_API_KEY=sk-ant-...

# Desktop notifications (optional, macOS only)
NOTIFICATIONS_ENABLED=true

# Daemon settings
PORT=4450              # Stream server port
MAX_AGE_HOURS=24       # Only show sessions from last N hours
```

### Optional Integrations

| Feature | Requirement | Fallback |
|---------|-------------|----------|
| AI Summaries | `ANTHROPIC_API_KEY` | Shows truncated original prompt |
| PR/CI Tracking | `gh` CLI authenticated | Skipped silently |
| Notifications | `NOTIFICATIONS_ENABLED=true` | None |

## Dependencies

- **@durable-streams/*** - Real-time state synchronization
- **@tanstack/db** - Reactive database for UI
- **xstate** - State machine for status detection
- **chokidar** - File system watching
- **@radix-ui/themes** - UI components
