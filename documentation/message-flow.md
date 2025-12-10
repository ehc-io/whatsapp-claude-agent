# Message Flow

## Startup Flow

```
main()
  ├─ parseArgs() → validate config
  ├─ createLogger()
  ├─ SDKBackend(config) → setSessionCallback()
  ├─ WhatsAppClient(config)
  ├─ ConversationManager(backend, config)
  ├─ Wire up event handlers
  └─ whatsapp.connect()
       │
       ▼
WhatsApp 'ready' event
  └─ sendStartupAnnouncement()
       └─ For each whitelisted number:
            whatsapp.sendMessage(jid, announcement)
```

Startup announcement sent to all whitelisted numbers:

```
Now online!

📁 Working directory: `{directory}`
🔐 Mode: {mode}
🧠 Model: {model}

Type */help* for available commands.
```

## Incoming Message Pipeline

```
Baileys WebSocket
       │
       ▼
WhatsAppClient.handleMessage()
  ├─ parseMessage() → IncomingMessage
  ├─ Filter: isFromMe? → skip
  ├─ Filter: isGroup? → skip
  ├─ Filter: inWhitelist? → skip if not
  ├─ Filter: withinThreshold? → skip if too old
  └─ emit('event', { type: 'message', message })
       │
       ▼
index.ts event handler
  └─ conversation.handleMessage(message, sendResponse, sendTyping)
       │
       ▼
ConversationManager.handleMessage()
  ├─ Check pending permissions → tryResolveFromMessage()
  ├─ Check isCommand() → handleCommand()
  └─ else → processWithClaude()
```

## Command Flow

```
handleCommand()
  ├─ parseCommand() → { command, args }
  └─ switch(command)
       ├─ 'clear' → history.clear()
       ├─ 'mode' → show current
       ├─ 'plan'/'default'/... → setMode()
       ├─ 'prompt' → handleSystemPromptCommand()
       ├─ 'model' → handleModelCommand()
       ├─ 'config' → handleConfigCommand()
       └─ ... etc
```

## Claude Query Flow

```
processWithClaude()
  ├─ sendTyping()
  ├─ history.addUserMessage()
  ├─ backend.query(text, history)
  │     │
  │     ▼
  │   SDKClaudeBackend.query()
  │     ├─ Build options (model, cwd, mode, prompts, session)
  │     ├─ claudeClient.processQuery()
  │     │     └─ Spawns Claude Code subprocess
  │     ├─ Handle permission callbacks
  │     ├─ Capture session ID from result
  │     └─ Return { text, toolsUsed, error }
  │
  ├─ history.addAssistantMessage()
  └─ sendResponse(text)
```

## Permission Flow

```
Claude requests tool use
       │
       ▼
permissionCallback(toolName, description, input)
  └─ PermissionManager.requestPermission()
       ├─ Create PermissionRequest with Promise
       ├─ Emit 'permission-request' event
       └─ Return Promise (blocks SDK)
              │
              ▼
       WhatsApp shows prompt to user
              │
              ▼
       User responds (Y/YES/ALLOW or N/NO/DENY)
              │
              ▼
       handleMessage() → tryResolveFromMessage()
         └─ Resolves Promise → SDK continues
```

Permission request message format:

```
🔐 *Permission Request*

Claude wants to use *{toolName}*:

```

{description}

```

Reply *Y* to allow or *N* to deny.
(Auto-denies in 5 minutes)
```

## Response Flow

```
sendResponse(text)
       │
       ▼
index.ts sendResponse callback
  └─ whatsapp.sendMessage(jid, text)
       │
       ▼
WhatsAppClient.sendMessage()
  ├─ formatMessageWithAgentName() → "[🤖 AgentName] text"
  ├─ chunkMessage() → splits if > 4000 chars
  └─ sock.sendMessage() for each chunk
```

## Session Management

- Session ID captured after first successful query
- Stored in backend, retrievable via `/session`
- Changed by: `/session <id>`, `--resume`
- Cleared by: `/session clear`, `/cd`, `/model`, `/prompt`
- Fork: `/fork` sets flag, next query creates branch

## History Management

- `ConversationHistory` stores last 50 entries
- Each entry: `{ role, content, timestamp }`
- Passed to Claude for context
- Cleared on: `/clear`, session changes, mode changes
