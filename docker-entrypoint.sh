#!/bin/bash
# Docker entrypoint script for WhatsApp Claude Agent
# Ensures MCP configuration exists before starting the agent

MCP_CONFIG="/workspace/.mcp.json"

# Create .mcp.json if it doesn't exist (volume mount may have hidden the baked-in version)
if [ ! -f "$MCP_CONFIG" ]; then
    echo '{"mcpServers":{"playwright":{"type":"stdio","command":"npx","args":["@playwright/mcp","--browser","chromium"]}}}' > "$MCP_CONFIG"
    echo "Created MCP config at $MCP_CONFIG"
fi

# Execute the main command
exec "$@"
