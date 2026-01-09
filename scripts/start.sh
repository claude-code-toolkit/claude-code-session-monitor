#!/bin/bash

echo "Claude Code Session Monitor"
echo "============================"
echo

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Default ports
STREAM_PORT=${PORT:-4450}
API_PORT=${API_PORT:-4451}
UI_PORT=${UI_PORT:-5173}

# Check if ports are in use
check_port() {
    if lsof -i ":$1" &> /dev/null; then
        return 0  # in use
    fi
    return 1  # free
}

# Kill existing processes on our ports
cleanup_ports() {
    for port in $STREAM_PORT $API_PORT; do
        if check_port $port; then
            echo -e "${YELLOW}Port $port in use, stopping existing process...${NC}"
            lsof -i ":$port" -t | xargs kill -9 2>/dev/null || true
            sleep 1
        fi
    done
}

cleanup_ports

echo -e "${CYAN}Starting daemon...${NC}"
pnpm serve &
DAEMON_PID=$!

sleep 2

# Check if daemon started successfully
if ! kill -0 $DAEMON_PID 2>/dev/null; then
    echo "Daemon failed to start. Check the logs above."
    exit 1
fi

echo -e "${CYAN}Starting UI...${NC}"
pnpm --filter ui-svelte dev &
UI_PID=$!

sleep 2

echo
echo -e "${GREEN}Monitor is running!${NC}"
echo
echo "  Dashboard: http://localhost:$UI_PORT"
echo "  Daemon:    http://localhost:$STREAM_PORT (stream)"
echo "             http://localhost:$API_PORT (API + WebSocket)"
echo
echo "Press Ctrl+C to stop"
echo

# Handle Ctrl+C
cleanup() {
    echo
    echo "Stopping..."
    kill $DAEMON_PID 2>/dev/null
    kill $UI_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for processes
wait
