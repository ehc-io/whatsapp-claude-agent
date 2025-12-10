import type { Config, PermissionMode, SettingSource } from '../types.ts'
import type { Logger } from '../utils/logger.ts'

export interface ClaudeResponse {
    text: string
    toolsUsed?: string[]
    error?: string
}

export interface PermissionCallback {
    (toolName: string, description: string, input: unknown): Promise<boolean>
}

export abstract class ClaudeBackend {
    protected config: Config
    protected logger: Logger
    protected mode: PermissionMode
    protected onPermissionRequest?: PermissionCallback

    constructor(config: Config, logger: Logger) {
        this.config = config
        this.logger = logger
        this.mode = config.mode
    }

    setMode(mode: PermissionMode): void {
        this.mode = mode
        this.logger.info(`Permission mode changed to: ${mode}`)
    }

    setPermissionCallback(callback: PermissionCallback): void {
        this.onPermissionRequest = callback
    }

    /**
     * Set a custom system prompt (replaces default)
     */
    setSystemPrompt(prompt: string | undefined): void {
        this.config.systemPrompt = prompt
        this.config.systemPromptAppend = undefined // Clear append when setting custom prompt
        this.logger.info(
            prompt ? `System prompt set (${prompt.length} chars)` : 'System prompt cleared'
        )
    }

    /**
     * Set text to append to the default system prompt
     */
    setSystemPromptAppend(text: string | undefined): void {
        this.config.systemPromptAppend = text
        this.config.systemPrompt = undefined // Clear custom prompt when appending
        this.logger.info(
            text
                ? `System prompt append set (${text.length} chars)`
                : 'System prompt append cleared'
        )
    }

    /**
     * Set which CLAUDE.md sources to load
     */
    setSettingSources(sources: SettingSource[] | undefined): void {
        this.config.settingSources = sources
        this.logger.info(
            sources ? `Setting sources set to: ${sources.join(', ')}` : 'Setting sources cleared'
        )
    }

    /**
     * Get current system prompt configuration
     */
    getSystemPromptConfig(): { systemPrompt?: string; systemPromptAppend?: string } {
        return {
            systemPrompt: this.config.systemPrompt,
            systemPromptAppend: this.config.systemPromptAppend
        }
    }

    /**
     * Get current setting sources
     */
    getSettingSources(): SettingSource[] | undefined {
        return this.config.settingSources
    }

    abstract query(prompt: string, conversationHistory?: string[]): Promise<ClaudeResponse>
    abstract stop(): Promise<void>
}

/**
 * Check if a tool is considered destructive (writes to filesystem)
 */
export function isDestructiveTool(toolName: string): boolean {
    const destructiveTools = ['Write', 'Edit', 'Bash', 'NotebookEdit', 'TodoWrite']
    return destructiveTools.includes(toolName)
}

/**
 * Format tool input for display in permission request
 */
export function formatToolInput(toolName: string, input: unknown): string {
    if (!input || typeof input !== 'object') {
        return String(input)
    }

    const obj = input as Record<string, unknown>

    switch (toolName) {
        case 'Write':
            return `File: ${obj['file_path']}\nContent: ${String(obj['content']).slice(0, 200)}...`
        case 'Edit':
            return `File: ${obj['file_path']}\nOld: ${obj['old_string']}\nNew: ${obj['new_string']}`
        case 'Bash':
            return `Command: ${obj['command']}`
        case 'Read':
            return `File: ${obj['file_path']}`
        default:
            return JSON.stringify(input, null, 2).slice(0, 500)
    }
}
