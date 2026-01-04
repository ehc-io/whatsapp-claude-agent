#!/bin/bash
# Docker entrypoint script for WhatsApp Claude Agent
# Ensures MCP configuration exists with correct settings before starting the agent

MCP_CONFIG="/workspace/.mcp.json"

# Get Playwright MCP URL from environment (set by docker-compose)
PLAYWRIGHT_URL="${PLAYWRIGHT_MCP_URL:-http://playwright-mcp:3000}"

# Check if config exists and uses SSE transport
NEEDS_UPDATE=false
if [ ! -f "$MCP_CONFIG" ]; then
    NEEDS_UPDATE=true
elif ! grep -q '"type": "sse"' "$MCP_CONFIG" 2>/dev/null; then
    echo "MCP config using stdio transport, upgrading to SSE..."
    NEEDS_UPDATE=true
fi

if [ "$NEEDS_UPDATE" = true ]; then
    # Use SSE transport to connect to persistent Playwright MCP sidecar service
    # This maintains browser state across multiple tool calls
    cat > "$MCP_CONFIG" << EOF
{
  "mcpServers": {
    "playwright": {
      "type": "sse",
      "url": "${PLAYWRIGHT_URL}/sse"
    }
  }
}
EOF
    echo "MCP config updated at $MCP_CONFIG with SSE transport to ${PLAYWRIGHT_URL}"
else
    echo "MCP config OK at $MCP_CONFIG"
fi

# Wait for Playwright MCP service to be ready
echo "Waiting for Playwright MCP service at ${PLAYWRIGHT_URL}..."
MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s "${PLAYWRIGHT_URL}/" > /dev/null 2>&1; then
        echo "Playwright MCP service is ready!"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "  Attempt $RETRY_COUNT/$MAX_RETRIES - waiting..."
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "WARNING: Playwright MCP service not responding at ${PLAYWRIGHT_URL}"
    echo "Browser automation may not work. Falling back to stdio transport."
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
        "--no-sandbox",
        "--timeout-action", "30000",
        "--timeout-navigation", "60000",
        "--output-dir", "/workspace",
        "--viewport-size", "1280x720"
      ]
    }
  }
}
EOF
fi

# Execute the main command
exec "$@"
