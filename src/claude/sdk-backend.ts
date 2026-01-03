import { query as claudeQuery, type PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import { existsSync, readFileSync } from 'fs'
import { execSync } from 'child_process'
import path from 'path'
import {
    ClaudeBackend,
    isDestructiveTool,
    formatToolInput,
    type ClaudeResponse
} from './backend.ts'
import type { Config } from '../types.ts'
import type { Logger } from '../utils/logger.ts'

/**
 * MCP Server configuration type
 */
interface MCPServerConfig {
    type?: 'stdio' | 'http' | 'sse'
    command?: string
    args?: string[]
    env?: Record<string, string>
    url?: string
    headers?: Record<string, string>
}

/**
 * MCP configuration file structure
 */
interface MCPConfigFile {
    mcpServers?: Record<string, MCPServerConfig>
}

/**
 * Load MCP server configuration from config files
 * Checks: project .mcp.json, user ~/.claude.json
 */
function loadMCPServers(cwd: string, logger: Logger): Record<string, MCPServerConfig> {
    const servers: Record<string, MCPServerConfig> = {}

    // 1. Load from project-level .mcp.json (highest priority for project)
    const projectMcpPath = path.join(cwd, '.mcp.json')
    if (existsSync(projectMcpPath)) {
        try {
            const content = readFileSync(projectMcpPath, 'utf-8')
            const config: MCPConfigFile = JSON.parse(content)
            if (config.mcpServers) {
                Object.assign(servers, config.mcpServers)
                logger.info(`Loaded MCP servers from ${projectMcpPath}: ${Object.keys(config.mcpServers).join(', ')}`)
            }
        } catch (error) {
            logger.warn(`Failed to load MCP config from ${projectMcpPath}: ${error}`)
        }
    }

    // 2. Load from user-level ~/.claude.json (fallback)
    const userMcpPath = path.join(process.env['HOME'] || '', '.claude.json')
    if (existsSync(userMcpPath)) {
        try {
            const content = readFileSync(userMcpPath, 'utf-8')
            const config: MCPConfigFile = JSON.parse(content)
            if (config.mcpServers) {
                // Only add servers not already defined at project level
                for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
                    if (!servers[name]) {
                        servers[name] = serverConfig
                        logger.info(`Loaded MCP server '${name}' from ${userMcpPath}`)
                    }
                }
            }
        } catch (error) {
            logger.warn(`Failed to load MCP config from ${userMcpPath}: ${error}`)
        }
    }

    if (Object.keys(servers).length === 0) {
        logger.debug('No MCP servers found in config files')
    }

    return servers
}

/**
 * Find the Claude Code executable path
 */
function findClaudeCodePath(): string | undefined {
    // Common installation paths
    const possiblePaths = [
        '/usr/local/bin/claude',
        '/usr/bin/claude',
        `${process.env['HOME']}/.npm-global/bin/claude`,
        `${process.env['HOME']}/.bun/bin/claude`
    ]

    for (const p of possiblePaths) {
        if (existsSync(p)) {
            return p
        }
    }

    // Try to find via `which`
    try {
        const result = execSync('which claude', { encoding: 'utf-8' }).trim()
        if (result && existsSync(result)) {
            return result
        }
    } catch {
        // `which` failed, continue
    }

    return undefined
}

export class SDKBackend extends ClaudeBackend {
    private claudeCodePath: string | undefined
    private currentSessionId: string | undefined
    private forkNextQuery: boolean

    constructor(config: Config, logger: Logger) {
        super(config, logger)
        this.claudeCodePath = findClaudeCodePath()
        this.forkNextQuery = config.forkSession
        if (this.claudeCodePath) {
            this.logger.info(`Found Claude Code at: ${this.claudeCodePath}`)
        } else {
            this.logger.warn(
                'Claude Code executable not found. Install it globally with: npm install -g @anthropic-ai/claude-code'
            )
        }

        // Initialize from config if resuming a session
        if (config.resumeSessionId) {
            this.currentSessionId = config.resumeSessionId
            this.logger.info(
                `Will resume session: ${config.resumeSessionId}${config.forkSession ? ' (forking)' : ''}`
            )
        }
    }

    /**
     * Get the current session ID
     */
    override getSessionId(): string | undefined {
        return this.currentSessionId
    }

    /**
     * Set the session ID (for resuming)
     */
    override setSessionId(sessionId: string | undefined): void {
        this.currentSessionId = sessionId
        if (sessionId) {
            this.logger.info(`Session ID set to: ${sessionId}`)
        } else {
            this.logger.info('Session ID cleared')
        }
    }

    /**
     * Enable forking for the next query
     */
    override setForkSession(fork: boolean): void {
        this.forkNextQuery = fork
        this.logger.info(`Fork session set to: ${fork}`)
    }

    /**
     * Get current fork session setting
     */
    override getForkSession(): boolean {
        return this.forkNextQuery
    }

    /**
     * Build the system prompt based on config options.
     * - If systemPrompt is set, use it as a custom prompt (replaces default)
     * - If systemPromptAppend is set, use default preset with appended text
     * - Otherwise, use default preset
     */
    private buildSystemPrompt():
        | string
        | { type: 'preset'; preset: 'claude_code'; append?: string }
        | undefined {
        if (this.config.systemPrompt) {
            return this.config.systemPrompt
        }
        if (this.config.systemPromptAppend) {
            return {
                type: 'preset',
                preset: 'claude_code',
                append: this.config.systemPromptAppend
            }
        }
        return { type: 'preset', preset: 'claude_code' }
    }

    async query(prompt: string, conversationHistory?: string[]): Promise<ClaudeResponse> {
        this.logger.info(`Querying Claude SDK (mode: ${this.mode}, model: ${this.config.model})`)

        // Check if Claude Code is available
        if (!this.claudeCodePath) {
            return {
                text: '',
                error: 'Claude Code executable not found. Install it with: npm install -g @anthropic-ai/claude-code'
            }
        }

        const toolsUsed: string[] = []
        let responseText = ''

        try {
            // Build the full prompt with conversation history
            const fullPrompt = conversationHistory?.length
                ? [...conversationHistory, prompt].join('\n\n---\n\n')
                : prompt

            this.logger.debug(`Prompt length: ${fullPrompt.length} chars`)

            // Build options for the query
            const systemPrompt = this.buildSystemPrompt()
            this.logger.debug(
                `System prompt: ${typeof systemPrompt === 'string' ? systemPrompt.slice(0, 200) : JSON.stringify(systemPrompt)}`
            )

            // Load MCP servers from config files
            const mcpServers = loadMCPServers(this.config.directory, this.logger)

            const queryOptions: Parameters<typeof claudeQuery>[0]['options'] = {
                pathToClaudeCodeExecutable: this.claudeCodePath,
                cwd: this.config.directory,
                model: this.config.model,
                maxTurns: this.config.maxTurns,
                permissionMode: this.mode,
                // Required for bypassPermissions mode to work in TypeScript SDK
                allowDangerouslySkipPermissions: this.mode === 'bypassPermissions',
                tools: { type: 'preset', preset: 'claude_code' },
                systemPrompt,
                settingSources: this.config.settingSources,
                // Pass MCP servers to the SDK (SDK doesn't auto-load from files)
                mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
                canUseTool: async (toolName: string, input: unknown) => {
                    this.logger.info(`>>> canUseTool callback invoked: ${toolName}`)
                    return this.handleToolPermission(toolName, input)
                }
            }

            // Add session resume/fork options if a session ID is set
            if (this.currentSessionId) {
                queryOptions.resume = this.currentSessionId
                queryOptions.forkSession = this.forkNextQuery
                this.logger.info(
                    `Resuming session: ${this.currentSessionId}${this.forkNextQuery ? ' (forking)' : ''}`
                )
                // Reset fork flag after use (forking is a one-time operation)
                if (this.forkNextQuery) {
                    this.forkNextQuery = false
                }
            }

            const result = claudeQuery({
                prompt: fullPrompt,
                options: queryOptions
            })

            this.logger.info('Waiting for Claude response...')

            // Process the async generator
            let messageCount = 0
            for await (const message of result) {
                messageCount++
                this.logger.debug(`Received message #${messageCount}: type=${message.type}`)

                if (message.type === 'assistant') {
                    // SDKAssistantMessage has message.message.content
                    const assistantMsg = message as {
                        type: 'assistant'
                        message: { content?: Array<{ type: string; text?: string; name?: string }> }
                    }
                    const content = assistantMsg.message?.content
                    if (content) {
                        for (const block of content) {
                            if (block.type === 'text' && block.text) {
                                responseText += block.text
                            } else if (block.type === 'tool_use' && block.name) {
                                this.logger.info(`Claude using tool: ${block.name}`)
                                toolsUsed.push(block.name)
                            }
                        }
                    }
                } else if (message.type === 'result') {
                    // SDKResultMessage has total_cost_usd
                    const resultMsg = message as {
                        type: 'result'
                        total_cost_usd?: number
                        is_error?: boolean
                        subtype?: string
                    }
                    this.logger.info(
                        `Query completed. Cost: $${resultMsg.total_cost_usd?.toFixed(4) || 'unknown'}, is_error: ${resultMsg.is_error}, subtype: ${resultMsg.subtype}`
                    )
                } else if (message.type === 'system') {
                    this.logger.debug(`System message: ${JSON.stringify(message).slice(0, 200)}`)
                    // Capture session ID from the init message
                    const systemMsg = message as {
                        type: 'system'
                        subtype?: string
                        session_id?: string
                    }
                    if (systemMsg.subtype === 'init' && systemMsg.session_id) {
                        const isNewSession = this.currentSessionId !== systemMsg.session_id
                        this.currentSessionId = systemMsg.session_id
                        this.logger.info(`Session ID captured: ${this.currentSessionId}`)
                        // Notify callback if this is a new session
                        if (isNewSession && this.onSessionCreated) {
                            this.onSessionCreated(this.currentSessionId)
                        }
                    }
                }
            }

            this.logger.info(
                `Response: ${responseText.length} chars, ${toolsUsed.length} tools used, ${messageCount} messages processed`
            )

            return {
                text: responseText || 'No response generated.',
                toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error(`SDK query error: ${errorMessage}`)
            if (error instanceof Error && error.stack) {
                this.logger.debug(`Stack trace: ${error.stack}`)
            }

            // Check if this is a session resume failure (process exited with code 1)
            // This often happens when trying to resume a session with a different cwd
            if (errorMessage.includes('process exited with code') && this.currentSessionId) {
                this.logger.warn(
                    'Session resume failed. This may be because the session was created in a different directory. ' +
                        'Clearing session ID - next message will start a new session.'
                )
                this.currentSessionId = undefined
                return {
                    text: '',
                    error:
                        'Failed to resume session (sessions are tied to the directory they were created in). ' +
                        'Please send your message again to start a new session.'
                }
            }

            return {
                text: '',
                error: errorMessage
            }
        }
    }

    private async handleToolPermission(
        toolName: string,
        input: unknown
    ): Promise<PermissionResult> {
        const inputRecord = (input as Record<string, unknown>) || {}

        this.logger.debug(`handleToolPermission called: tool=${toolName}, mode=${this.mode}`)

        // In bypassPermissions mode, allow everything
        if (this.mode === 'bypassPermissions') {
            this.logger.debug(`Allowing ${toolName} (bypassPermissions mode)`)
            return { behavior: 'allow', updatedInput: inputRecord }
        }

        // In plan mode, deny destructive tools
        if (this.mode === 'plan' && isDestructiveTool(toolName)) {
            this.logger.debug(`Denied ${toolName} in plan mode`)
            return { behavior: 'deny', message: 'Destructive tools not allowed in plan mode' }
        }

        // In acceptEdits mode, auto-allow edit operations
        if (
            this.mode === 'acceptEdits' &&
            (toolName === 'Edit' || toolName === 'Write' || toolName === 'NotebookEdit')
        ) {
            this.logger.debug(`Auto-allowing ${toolName} (acceptEdits mode)`)
            return { behavior: 'allow', updatedInput: inputRecord }
        }

        // In dontAsk mode, deny if not pre-approved (destructive tools)
        if (this.mode === 'dontAsk' && isDestructiveTool(toolName)) {
            this.logger.debug(`Denied ${toolName} in dontAsk mode (not pre-approved)`)
            return { behavior: 'deny', message: 'Tool not pre-approved in dontAsk mode' }
        }

        // In default mode, ask for permission for destructive tools
        if (this.mode === 'default' && isDestructiveTool(toolName)) {
            this.logger.info(`Destructive tool ${toolName} requires permission in default mode`)
            if (this.onPermissionRequest) {
                const description = formatToolInput(toolName, input)
                this.logger.info(`Sending permission request for ${toolName}...`)
                const allowed = await this.onPermissionRequest(toolName, description, input)
                this.logger.info(
                    `Permission response for ${toolName}: ${allowed ? 'ALLOWED' : 'DENIED'}`
                )
                if (allowed) {
                    return { behavior: 'allow', updatedInput: inputRecord }
                }
                return { behavior: 'deny', message: 'User denied permission' }
            }
            // No callback registered, deny by default
            this.logger.warn(`No permission callback registered, denying ${toolName}`)
            return { behavior: 'deny', message: 'No permission handler registered' }
        }

        // Allow non-destructive tools
        this.logger.debug(`Allowing non-destructive tool: ${toolName}`)
        return { behavior: 'allow', updatedInput: inputRecord }
    }

    async stop(): Promise<void> {
        // SDK doesn't need explicit cleanup
        this.logger.debug('SDK backend stopped')
    }
}
