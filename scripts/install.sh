#!/bin/bash
set -e

echo "Claude Code Session Monitor - Install"
echo "======================================"
echo

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check OS
OS="$(uname -s)"
echo "Detected OS: $OS"
echo

# Check for required tools
check_command() {
    if command -v "$1" &> /dev/null; then
        echo -e "${GREEN}✓${NC} $1 found"
        return 0
    else
        echo -e "${RED}✗${NC} $1 not found"
        return 1
    fi
}

# Check Node.js
echo "Checking dependencies..."
if ! check_command node; then
    echo -e "${YELLOW}Please install Node.js >= 18${NC}"
    echo "  brew install node"
    exit 1
fi

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Node.js version must be >= 18 (found v$NODE_VERSION)${NC}"
    exit 1
fi

# Check pnpm
if ! check_command pnpm; then
    echo -e "${YELLOW}Installing pnpm...${NC}"
    npm install -g pnpm
fi

# Check tmux
if ! check_command tmux; then
    echo -e "${YELLOW}tmux is required for integrated terminals${NC}"
    if [ "$OS" = "Darwin" ]; then
        echo "  brew install tmux"
    else
        echo "  apt install tmux  # Debian/Ubuntu"
        echo "  dnf install tmux  # Fedora"
    fi
    echo
    echo -e "${YELLOW}Continuing without tmux (terminals will not work)${NC}"
fi

# Check nnn (optional, for launcher)
if ! check_command nnn; then
    echo -e "${YELLOW}nnn is optional (for new session launcher)${NC}"
    if [ "$OS" = "Darwin" ]; then
        echo "  brew install nnn"
    else
        echo "  apt install nnn  # Debian/Ubuntu"
    fi
fi

# Check gh (optional, for PR integration)
if ! check_command gh; then
    echo -e "${YELLOW}gh CLI is optional (for PR/CI tracking)${NC}"
    if [ "$OS" = "Darwin" ]; then
        echo "  brew install gh && gh auth login"
    fi
fi

echo
echo "Installing Node.js dependencies..."
pnpm install

echo
echo "Building daemon..."
pnpm --filter @claude-code-ui/daemon build

echo
echo -e "${GREEN}Installation complete!${NC}"
echo
echo "Next steps:"
echo "  1. Copy .env.example to .env and configure (optional)"
echo "  2. Run: ./scripts/start.sh"
echo "  3. Open: http://localhost:5173"
