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

The Docker setup uses a **sidecar architecture** for Playwright MCP to maintain persistent browser sessions.

### Architecture

```
┌─────────────────────────┐     ┌─────────────────────────┐
│  whatsapp-claude-agent  │────▶│     playwright-mcp      │
│     (main service)      │ SSE │   (sidecar service)     │
│                         │◀────│   - Chromium browser    │
└─────────────────────────┘     │   - Persistent state    │
                                └─────────────────────────┘
```

### Why Sidecar?

The Claude Agent SDK spawns **new processes for each query** with stdio MCP servers. This causes browser state to be lost between tool calls. The sidecar runs Playwright MCP as a persistent HTTP/SSE service, maintaining browser sessions across multiple tool calls.

### Critical Playwright MCP Flags

The Playwright MCP sidecar requires specific flags for Docker:

```bash
npx @playwright/mcp \
  --browser chromium \
  --headless \           # Required: no GUI in containers
  --no-sandbox \         # Required: running as non-root
  --host 0.0.0.0 \       # Bind to all interfaces
  --allowed-hosts '*' \  # Allow cross-container connections
  --port 3000
```

**`--allowed-hosts '*'`** is critical - without it, Playwright MCP rejects connections from other containers with "Access is only allowed at localhost".

### Configuration Files

| File | Purpose |
|------|---------|
| `/home/agent/.claude.json` | User-level MCP config (fallback) |
| `/home/agent/.claude/settings.json` | Permission pre-approvals |
| `/workspace/.mcp.json` | Project-level MCP config (SSE transport) |

### MCP Transport Types

| Transport | Persistence | Use Case |
|-----------|-------------|----------|
| `stdio` | None (new process per query) | Stateless tools |
| `sse` | Persistent connection | Stateful tools (browsers) |
| `http` | Per-request | API-based tools |

### Entrypoint Script

The `docker-entrypoint.sh` script:
1. Configures MCP to use SSE transport to the sidecar
2. Waits for the Playwright MCP sidecar to be healthy
3. Falls back to stdio if sidecar unavailable

### Pre-approved Permissions

```json
{
  "permissions": {
    "allow": ["mcp__*", "Bash(npx:*)", "Bash(bun:*)", "Bash(npm:*)", "Bash(git:*)", ...]
  },
  "enableAllProjectMcpServers": true
}
```

### How MCP Servers Are Loaded

The `SDKBackend` class loads MCP servers from config files and passes them to the SDK:

1. **Load order**:
   - `/workspace/.mcp.json` (project-level, priority)
   - `~/.claude.json` (user-level, fallback)

2. **Supports both transports**:
   - SSE/HTTP servers connect to URLs
   - Stdio servers spawn subprocesses

### Adding More MCP Servers

**SSE/HTTP server** (persistent, recommended for stateful tools):
```json
{
  "mcpServers": {
    "my-server": {
      "type": "sse",
      "url": "http://my-server:3000/sse"
    }
  }
}
```

**Stdio server** (spawned per query, for stateless tools):
```json
{
  "mcpServers": {
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
