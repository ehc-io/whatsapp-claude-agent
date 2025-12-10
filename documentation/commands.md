# WhatsApp Commands

All commands start with `/`. Parsed in `src/whatsapp/messages.ts`, handled in `src/conversation/manager.ts`.

## Command Structure

```typescript
// Detection
isCommand(text: string): boolean  // checks for '/' prefix

// Parsing
parseCommand(text: string): { command: string; args: string } | null
// "/model opus" → { command: "model", args: "opus" }
```

## Session & Directory

| Command      | Handler                    | Effect                                    |
| ------------ | -------------------------- | ----------------------------------------- |
| `/clear`     | inline                     | Clears conversation history               |
| `/status`    | `getStatusMessage()`       | Shows agent status                        |
| `/session`   | `handleSessionCommand()`   | Show/set/clear session ID                 |
| `/fork`      | `handleForkCommand()`      | Fork current session                      |
| `/cd <path>` | `handleDirectoryCommand()` | Change working directory (clears session) |
| `/help`      | `getHelpMessage()`         | Show all commands                         |

## Agent & Model

| Command         | Handler                 | Effect                               |
| --------------- | ----------------------- | ------------------------------------ |
| `/name [name]`  | `handleNameCommand()`   | Show/set agent name                  |
| `/model [name]` | `handleModelCommand()`  | Show/set model (supports shorthands) |
| `/models`       | `handleModelsCommand()` | List available models                |

Model shorthands resolved in `src/claude/utils.ts`:

- `opus` → `claude-opus-4-5-20251101`
- `sonnet` → `claude-sonnet-4-5-20250929`
- `haiku` → `claude-3-5-haiku-20241022`

## Permission Modes

| Command                                  | Mode Set            |
| ---------------------------------------- | ------------------- |
| `/plan`, `/readonly`                     | `plan`              |
| `/default`, `/normal`                    | `default`           |
| `/acceptEdits`, `/accept-edits`          | `acceptEdits`       |
| `/bypass`, `/yolo`, `/bypasspermissions` | `bypassPermissions` |
| `/dontask`, `/dont-ask`                  | `dontAsk`           |
| `/mode`                                  | (shows current)     |

## System Prompt

| Command                | Handler                       | Effect                       |
| ---------------------- | ----------------------------- | ---------------------------- |
| `/prompt [text]`       | `handleSystemPromptCommand()` | Show/set/clear system prompt |
| `/promptappend [text]` | `handlePromptAppendCommand()` | Append to default prompt     |

Setting prompt clears session (context changes).

## CLAUDE.md

| Command               | Handler                   | Effect                            |
| --------------------- | ------------------------- | --------------------------------- |
| `/claudemd [sources]` | `handleClaudeMdCommand()` | Set sources: user, project, local |
| `/claudemd clear`     | —                         | Disable CLAUDE.md loading         |

## Configuration

| Command            | Handler                 | Effect                            |
| ------------------ | ----------------------- | --------------------------------- |
| `/config`          | `handleConfigCommand()` | Show runtime config               |
| `/config path`     | —                       | Show config file location         |
| `/config save`     | —                       | Save to `{directory}/config.json` |
| `/config generate` | —                       | Generate template                 |
| `/config reload`   | —                       | View file contents                |

## Adding New Commands

1. Add case in `handleCommand()` switch statement
2. Create handler method if complex
3. Update `getHelpMessage()`
4. If config-related, may need session clear logic
