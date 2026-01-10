# Claude Code Session Monitor

A real-time dashboard for monitoring and interacting with Claude Code sessions. View all your sessions, see what Claude is working on, and open integrated terminals—all from one place.

![Dashboard Screenshot](docs/screenshot.png)

## Features

- **Real-time session monitoring** - See all active Claude sessions across projects
- **Integrated terminal panel** - Click any session to open a terminal, powered by tmux
- **New session launcher** - Create new Claude sessions in any directory via nnn file picker
- **Status tracking** - Working, Waiting, Needs Approval, Idle states
- **PR/CI integration** - See associated PRs and their CI status
- **Desktop notifications** - Get notified when Claude needs attention (macOS)

## Quick Start

```bash
# Install dependencies
./scripts/install.sh

# Start the monitor
./scripts/start.sh
```

Then open http://localhost:5173

## Requirements

- **Node.js** >= 18
- **pnpm** - Package manager
- **tmux** - Terminal multiplexer (for integrated terminals)
- **nnn** - File manager (for new session launcher)

### macOS

```bash
brew install tmux nnn pnpm
```

## How It Works

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Claude Code    │     │     Daemon      │     │       UI        │
│   ~/.claude/    │────▶│   (Watcher +    │────▶│   (SvelteKit)   │
│   projects/     │     │    PTY Mgr)     │     │                 │
└─────────────────┘     └────────┬────────┘     └────────┬────────┘
                                 │                       │
                                 │◄──────────────────────┘
                                 │     WebSocket (PTY I/O)
                                 ▼
                        ┌─────────────────┐
                        │      tmux       │
                        │   (sessions)    │
                        └─────────────────┘
```

1. **Daemon** watches `~/.claude/projects/` for session logs
2. **UI** displays sessions grouped by repo with real-time updates
3. **Click a session** → Opens terminal panel attached to that tmux session
4. **New Terminal** → Launches nnn to pick directory, starts fresh Claude session

## Usage

### Opening Terminals

Click any session card in the dashboard to open a terminal for that session. The terminal connects to a tmux session running Claude.

- Sessions persist even if you close the browser
- Reconnect to any session by clicking it again
- Multiple terminals can be open simultaneously (tabs)

### Creating New Sessions

1. Click the **+** button in the terminal panel (or floating button)
2. Navigate to your project directory using nnn
3. Press **Ctrl+G** to select the directory
4. Claude starts in a fresh session

### Header Controls

| Icon | Function |
|------|----------|
| **?** | Quick help guide with usage tips |
| **Bell** | Notification settings — all changes, approval only, or disabled |
| **≡ Xh** | Filter sessions by age (6h, 12h, 24h, 48h, 7 days, or all) |

### Session States

| State | Description |
|-------|-------------|
| **Working** | Claude is actively processing |
| **Needs Approval** | Tool use awaiting user approval |
| **Waiting** | Claude finished, waiting for user input |
| **Idle** | No activity for 20+ minutes |

## Configuration

Create a `.env` file in the project root:

```bash
# AI-powered summaries (optional)
ANTHROPIC_API_KEY=sk-ant-...

# Desktop notifications (optional, macOS)
NOTIFICATIONS_ENABLED=true

# Server ports (defaults shown)
PORT=4450              # Daemon stream server
API_PORT=4451          # Daemon API + WebSocket
UI_PORT=5173           # UI dev server

# Session filtering
MAX_AGE_HOURS=24       # Only show sessions from last N hours
```

### Optional Features

| Feature | Requirement | Without It |
|---------|-------------|------------|
| AI Summaries | `ANTHROPIC_API_KEY` | Shows truncated prompt |
| PR/CI Status | `gh` CLI authenticated | PR info hidden |
| Notifications | `NOTIFICATIONS_ENABLED=true` | No desktop alerts |

## Development

```bash
# Install dependencies
pnpm install

# Start daemon only
pnpm serve

# Start UI dev server (separate terminal)
pnpm --filter ui-svelte dev

# Or start both
pnpm start
```

### Project Structure

```
packages/
├── daemon/           # Session watcher + PTY manager
│   ├── src/
│   │   ├── serve.ts       # Main entry point
│   │   ├── watcher.ts     # JSONL file watcher
│   │   ├── pty.ts         # PTY/terminal management
│   │   ├── tmux.ts        # tmux session utilities
│   │   └── terminal-ws.ts # WebSocket server for terminals
│   └── ...
└── ui-svelte/        # SvelteKit dashboard
    ├── src/
    │   ├── lib/
    │   │   ├── components/
    │   │   │   ├── Terminal.svelte
    │   │   │   └── TerminalPanel.svelte
    │   │   └── stores/
    │   │       └── terminals.ts
    │   └── routes/
    └── ...
```

## Troubleshooting

### Terminal shows escape sequences like `[?1;2c`

Refresh the browser - this is filtered in the latest version.

### Sessions not appearing

- Check that Claude Code is running and creating logs in `~/.claude/projects/`
- Restart the daemon: `pnpm serve`

### tmux session conflicts

Kill orphan sessions: `tmux kill-server` (warning: kills ALL tmux sessions)

Or selectively: `tmux list-sessions` then `tmux kill-session -t <name>`

## License

MIT
