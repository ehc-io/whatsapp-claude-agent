import type { Config, PermissionMode } from '../types.ts'
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
