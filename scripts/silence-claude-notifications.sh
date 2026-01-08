#!/bin/bash
# Silence Claude Code's built-in notifications by setting preferredNotifChannel to terminal_bell
# This allows our custom daemon notifications to be the only ones shown

SETTINGS_FILE="$HOME/.claude/settings.json"

# Create settings file if it doesn't exist
if [ ! -f "$SETTINGS_FILE" ]; then
  echo '{}' > "$SETTINGS_FILE"
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
  echo "Error: jq is required. Install with: brew install jq"
  exit 1
fi

# Check current setting
CURRENT=$(jq -r '.preferredNotifChannel // "not set"' "$SETTINGS_FILE" 2>/dev/null)

if [ "$CURRENT" = "terminal_bell" ]; then
  echo "Already configured: preferredNotifChannel = terminal_bell"
  exit 0
fi

# Add the setting
UPDATED=$(jq '. + {"preferredNotifChannel": "terminal_bell"}' "$SETTINGS_FILE")

if [ $? -eq 0 ]; then
  echo "$UPDATED" > "$SETTINGS_FILE"
  echo "Updated $SETTINGS_FILE"
  echo "Set: preferredNotifChannel = terminal_bell"
  echo ""
  echo "Restart any running Claude Code sessions for changes to take effect."
else
  echo "Error: Failed to update settings"
  exit 1
fi
