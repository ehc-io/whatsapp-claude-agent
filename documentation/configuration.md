# Configuration

## Sources (Priority Order)

1. **CLI arguments** (highest) — override everything
2. **Config file** — used if CLI not provided
3. **Built-in defaults** (lowest)

## Config File Locations

- **Working directory**: `{directory}/config.json` — used by `/config` commands
- **Home directory**: `~/.whatsapp-claude-agent/config.json` — loaded at startup

Specify custom path: `-c, --config <path>`

## Schema

Defined in `src/types.ts` via Zod:

```typescript
ConfigSchema = z.object({
    directory: z.string().default(process.cwd()),
    mode: PermissionModeSchema.default('default'),
    whitelist: z.array(z.string()).min(1),
    sessionPath: z.string().default('~/.whatsapp-claude-agent/session'),
    model: z.string().default('claude-sonnet-4-20250514'),
    maxTurns: z.number().optional(),
    processMissed: z.boolean().default(true),
    missedThresholdMins: z.number().default(60),
    verbose: z.boolean().default(false),
    systemPrompt: z.string().optional(),
    systemPromptAppend: z.string().optional(),
    settingSources: z.array(SettingSourceSchema).optional(),
    resumeSessionId: z.string().optional(),
    forkSession: z.boolean().default(false),
    agentName: z.string()
})
```

## CLI to Config Mapping

| CLI                      | Config Property       |
| ------------------------ | --------------------- |
| `-d, --directory`        | `directory`           |
| `-m, --mode`             | `mode`                |
| `-w, --whitelist`        | `whitelist`           |
| `-s, --session`          | `sessionPath`         |
| `--model`                | `model`               |
| `--max-turns`            | `maxTurns`            |
| `--process-missed`       | `processMissed`       |
| `--missed-threshold`     | `missedThresholdMins` |
| `-v, --verbose`          | `verbose`             |
| `--system-prompt`        | `systemPrompt`        |
| `--system-prompt-append` | `systemPromptAppend`  |
| `--load-claude-md`       | `settingSources`      |
| `--resume`               | `resumeSessionId`     |
| `--fork`                 | `forkSession`         |
| `--agent-name`           | `agentName`           |

## Save/Load Functions

```typescript
// src/cli/config.ts

loadConfigFile(configPath?: string): Partial<Config>
// Loads from path or default (~/.whatsapp-claude-agent/config.json)

saveConfigFile(config: Config, configPath?: string): string
// Saves to path or {config.directory}/config.json
// Returns saved path

getDefaultConfigPath(): string
// ~/.whatsapp-claude-agent/config.json

getLocalConfigPath(directory?: string): string
// {directory}/config.json

generateConfigTemplate(whitelist: string[]): string
// Returns JSON string for template
```

## Saveable vs Runtime Properties

Only persistent properties saved to file (defined in `SAVEABLE_KEYS`):

- whitelist, directory, mode, sessionPath, model, maxTurns
- processMissed, missedThresholdMins, verbose, agentName
- systemPrompt, systemPromptAppend, settingSources

Runtime-only (not saved):

- resumeSessionId, forkSession

## Adding New Config Options

1. Add to `ConfigSchema` in `src/types.ts`
2. Add CLI option in `src/cli/commands.ts`
3. Add merge logic in `parseConfig()` in `src/cli/config.ts`
4. If saveable, add to `SAVEABLE_KEYS` array
5. Update README config table
