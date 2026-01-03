#!/bin/bash
# Docker entrypoint script for WhatsApp Claude Agent
# Ensures MCP configuration exists with correct flags before starting the agent

MCP_CONFIG="/workspace/.mcp.json"

# CRITICAL FLAGS for Docker:
#   --headless: Required for containers (no GUI)
#   --no-sandbox: Required when running as root in Docker

# Check if config exists and has the required flags
NEEDS_UPDATE=false
if [ ! -f "$MCP_CONFIG" ]; then
    NEEDS_UPDATE=true
elif ! grep -q '"--headless"' "$MCP_CONFIG" 2>/dev/null || ! grep -q '"--no-sandbox"' "$MCP_CONFIG" 2>/dev/null; then
    echo "MCP config missing required Docker flags, updating..."
    NEEDS_UPDATE=true
fi

if [ "$NEEDS_UPDATE" = true ]; then
    cat > "$MCP_CONFIG" << 'EOF'
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "@playwright/mcp",
        "--browser", "chromium",
        "--headless",
        "--no-sandbox"
      ]
    }
  }
}
EOF
    echo "MCP config updated at $MCP_CONFIG with headless and no-sandbox flags"
else
    echo "MCP config OK at $MCP_CONFIG"
fi

# Execute the main command
exec "$@"
