import { EventEmitter } from 'events'
import type { PermissionRequest, PermissionMode } from '../types.ts'
import type { Logger } from '../utils/logger.ts'

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export class PermissionManager extends EventEmitter {
    private pendingRequests: Map<string, PermissionRequest> = new Map()
    private logger: Logger
    private timeoutMs: number

    constructor(logger: Logger, timeoutMs = DEFAULT_TIMEOUT_MS) {
        super()
        this.logger = logger
        this.timeoutMs = timeoutMs
    }

    /**
     * Create a permission request and wait for user response
     */
    async requestPermission(
        toolName: string,
        description: string,
        input: unknown
    ): Promise<boolean> {
        const id = `perm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

        return new Promise((resolve) => {
            const request: PermissionRequest = {
                id,
                toolName,
                description,
                input,
                resolve: (allowed: boolean) => {
                    this.pendingRequests.delete(id)
                    resolve(allowed)
                }
            }

            this.pendingRequests.set(id, request)

            // Emit event for WhatsApp to send message
            this.emit('permission-request', request)

            // Set timeout
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.logger.warn(`Permission request ${id} timed out, denying`)
                    this.pendingRequests.delete(id)
                    resolve(false)
                }
            }, this.timeoutMs)
        })
    }

    /**
     * Resolve a pending permission request
     */
    resolvePermission(requestId: string, allowed: boolean): boolean {
        const request = this.pendingRequests.get(requestId)
        if (!request) {
            this.logger.warn(`No pending permission request with id: ${requestId}`)
            return false
        }

        request.resolve(allowed)
        return true
    }

    /**
     * Try to resolve by checking if the response matches a pending request
     * Returns true if a permission was resolved
     */
    tryResolveFromMessage(message: string): boolean {
        const trimmed = message.trim().toUpperCase()
        const isYes = trimmed === 'Y' || trimmed === 'YES' || trimmed === 'ALLOW'
        const isNo = trimmed === 'N' || trimmed === 'NO' || trimmed === 'DENY'

        if (!isYes && !isNo) {
            return false
        }

        // Resolve the most recent pending request
        const requests = Array.from(this.pendingRequests.values())
        if (requests.length === 0) {
            return false
        }

        const latestRequest = requests[requests.length - 1]
        if (latestRequest) {
            this.logger.info(
                `Permission ${latestRequest.id} ${isYes ? 'granted' : 'denied'} for ${latestRequest.toolName}`
            )
            latestRequest.resolve(isYes)
            return true
        }

        return false
    }

    /**
     * Format a permission request message for WhatsApp
     */
    formatPermissionMessage(request: PermissionRequest): string {
        return `🔐 *Permission Request*

Claude wants to use *${request.toolName}*:

\`\`\`
${request.description}
\`\`\`

Reply *Y* to allow or *N* to deny.
(Auto-denies in 5 minutes)`
    }

    /**
     * Get count of pending requests
     */
    get pendingCount(): number {
        return this.pendingRequests.size
    }

    /**
     * Cancel all pending requests
     */
    cancelAll(): void {
        for (const request of this.pendingRequests.values()) {
            request.resolve(false)
        }
        this.pendingRequests.clear()
    }
}

/**
 * Parse mode-switching commands
 */
export function parseModeCommand(text: string): PermissionMode | null {
    const trimmed = text.trim().toLowerCase()

    switch (trimmed) {
        case '/readonly':
        case '/plan':
            return 'plan'
        case '/normal':
            return 'normal'
        case '/yolo':
        case '/dangerously-skip-permissions':
            return 'dangerously-skip-permissions'
        default:
            return null
    }
}
