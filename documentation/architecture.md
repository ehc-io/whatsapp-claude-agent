# Architecture

## Overview

WhatsApp-Claude-Agent bridges WhatsApp with Claude Code via the Claude Agent SDK. Users send messages via WhatsApp; agent processes with Claude; responses sent back.

## Core Components

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  WhatsAppClient │────▶│ ConversationManager  │────▶│  ClaudeBackend  │
│    (Baileys)    │◀────│                      │◀────│   (Agent SDK)   │
└─────────────────┘     └──────────────────────┘     └─────────────────┘
```

### WhatsAppClient (`src/whatsapp/client.ts`)

- Wraps Baileys library for WhatsApp Web protocol
- Handles authentication, QR code display, session persistence
- Filters messages: whitelist check, time threshold
- Supports group mode (`--join-whatsapp-group`) or private message mode
- Emits typed events to main orchestrator
- Chunks long responses into multiple WhatsApp messages

### ConversationManager (`src/conversation/manager.ts`)

- Central message dispatcher
- Routes: permission responses → commands → Claude processing
- Manages conversation history (50 messages max)
- Handles all slash commands (`/help`, `/mode`, `/config`, etc.)
- Coordinates with PermissionManager for tool approvals

### ClaudeBackend (`src/claude/backend.ts`, `src/claude/sdk-backend.ts`)

- Interface + SDK implementation for Claude queries
- Manages: model, directory, system prompt, session ID, permission mode
- Spawns Claude Code subprocess via Agent SDK
- Handles session resumption and forking

### PermissionManager (`src/claude/permissions.ts`)

- Queues tool permission requests from Claude
- Resolves via WhatsApp responses (Y/N/1/2/etc.)
- Timeout handling for unresolved requests

## Directory Structure

```
src/
├── index.ts              # Entry point, orchestrator
├── types.ts              # Shared types, Zod schemas
├── build-info.ts         # Build metadata
├── cli/
│   ├── commands.ts       # CLI argument parsing (Commander)
│   ├── config.ts         # Config file load/save
│   └── config-commands.ts # Config subcommand handlers
├── claude/
│   ├── backend.ts        # Backend interface
│   ├── sdk-backend.ts    # Agent SDK implementation
│   ├── permissions.ts    # Permission request handling
│   └── utils.ts          # Model resolution, shorthands
├── conversation/
│   ├── manager.ts        # Message routing, command handling
│   ├── history.ts        # Conversation history storage
│   └── queue.ts          # Sequential message processing
├── whatsapp/
│   ├── client.ts         # Baileys wrapper
│   ├── messages.ts       # Message parsing, command detection
│   ├── chunker.ts        # Long message splitting
│   └── auth.ts           # Auth state management
└── utils/
    ├── logger.ts         # Logging utility
    ├── agent-name.ts     # Agent identity (name, host, folder) generation
    └── phone.ts          # Phone number utilities
```

## Data Flow

1. **Startup**: Parse CLI/config → Init WhatsAppClient → Init ClaudeBackend → Init ConversationManager
2. **Auth**: Display QR → User scans → Session saved to disk
3. **Message In**: Baileys event → WhatsAppClient filters → Emits to orchestrator → ConversationManager.handleMessage()
4. **Command**: Detected by `/` prefix → Routed to handler → Response sent
5. **Claude Query**: Added to history → Backend.query() → SDK spawns Claude Code → Response returned → Sent to WhatsApp
6. **Permission**: Claude requests tool use → PermissionManager queues → User responds via WhatsApp → Resolved

## Docker & MCP Configuration

The Docker image comes pre-configured with Claude Code and Playwright MCP.

### Baked-in Configuration Files

| File | Purpose |
|------|---------|
| `/home/agent/.claude.json` | MCP server definitions (user-level, Playwright) |
| `/home/agent/.claude/settings.json` | Permission pre-approvals (global) |
| `/workspace/.mcp.json` | MCP server definitions (project-level, created at runtime) |

### Entrypoint Script

The `docker-entrypoint.sh` script runs before the agent starts and ensures:
- `/workspace/.mcp.json` exists (survives volume mounts)
- Playwright MCP server is configured with `"type": "stdio"`

### Pre-approved Permissions

```json
{
  "permissions": {
    "allow": ["mcp__*", "Bash(npx:*)", "Bash(bun:*)", "Bash(npm:*)", "Bash(git:*)", ...]
  },
  "enableAllProjectMcpServers": true
}
```

- `mcp__*` — All MCP server tools auto-approved (no prompts)
- `enableAllProjectMcpServers` — Project-level `.mcp.json` servers enabled
- `allowDangerouslySkipPermissions` — SDK-level bypass enabled in code

### How MCP Servers Are Loaded

The Claude Agent SDK does **not** auto-load MCP servers from config files. The `SDKBackend` class explicitly loads and passes them:

1. **Load order** (in `sdk-backend.ts`):
   - `/workspace/.mcp.json` (project-level, highest priority)
   - `~/.claude.json` (user-level, fallback)

2. **Passed to SDK** via `mcpServers` option in query

### Adding More MCP Servers

1. **At build time**: Modify `docker-entrypoint.sh` to include additional servers
2. **At runtime**: Edit `/workspace/.mcp.json` in the container
3. **Via host mount**: Add servers to `./workspace/.mcp.json` on host before starting

Example `.mcp.json` with multiple servers:
```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["@playwright/mcp", "--browser", "chromium"]
    },
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["@anthropic/mcp-server-filesystem", "/workspace"]
    }
  }
}
```

### Docker Volumes

| Volume | Path | Purpose |
|--------|------|---------|
| `whatsapp-session` | `/app/.whatsapp-session` | WhatsApp auth persistence |
| `agent-cache` | `/home/agent/.cache` | Playwright browsers |
| `claude-config` (optional) | `/home/agent/.claude` | Override baked-in settings |

## Key Dependencies

- `@anthropic-ai/claude-agent-sdk`: Claude Code integration
- `@playwright/mcp`: Browser automation via MCP
- `baileys`: WhatsApp Web protocol (unofficial)
- `commander`: CLI parsing
- `zod`: Runtime validation
- `superheroes`: Random name generation
