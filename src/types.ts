import { z } from 'zod'

export const PermissionMode = z.enum(['plan', 'normal', 'dangerously-skip-permissions'])
export type PermissionMode = z.infer<typeof PermissionMode>

export const ConfigSchema = z.object({
    directory: z.string().default(process.cwd()),
    mode: PermissionMode.default('normal'),
    whitelist: z.array(z.string()).min(1, 'At least one whitelisted number required'),
    sessionPath: z.string().default('~/.whatsapp-claude-agent/session'),
    model: z.string().default('claude-sonnet-4-20250514'),
    maxTurns: z.number().optional(),
    processMissed: z.boolean().default(true),
    missedThresholdMins: z.number().default(60),
    verbose: z.boolean().default(false)
})

export type Config = z.infer<typeof ConfigSchema>

export interface IncomingMessage {
    id: string
    from: string
    text: string
    timestamp: Date
    isFromMe: boolean
}

export interface OutgoingMessage {
    to: string
    text: string
    replyTo?: string
}

export interface PermissionRequest {
    id: string
    toolName: string
    description: string
    input: unknown
    resolve: (allowed: boolean) => void
}

export type AgentEvent =
    | { type: 'qr'; qr: string }
    | { type: 'authenticated' }
    | { type: 'ready' }
    | { type: 'message'; message: IncomingMessage }
    | { type: 'response'; message: OutgoingMessage }
    | { type: 'permission-request'; request: PermissionRequest }
    | { type: 'error'; error: Error }
    | { type: 'disconnected'; reason: string }
