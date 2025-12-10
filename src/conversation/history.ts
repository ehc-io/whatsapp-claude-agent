import type { IncomingMessage } from '../types.ts'

export interface ConversationEntry {
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
}

export class ConversationHistory {
    private entries: ConversationEntry[] = []
    private maxEntries: number

    constructor(maxEntries = 50) {
        this.maxEntries = maxEntries
    }

    addUserMessage(message: IncomingMessage): void {
        this.entries.push({
            role: 'user',
            content: message.text,
            timestamp: message.timestamp
        })
        this.trim()
    }

    addAssistantMessage(text: string): void {
        this.entries.push({
            role: 'assistant',
            content: text,
            timestamp: new Date()
        })
        this.trim()
    }

    /**
     * Get conversation history formatted for Claude
     */
    getHistory(): string[] {
        return this.entries.map((entry) => {
            const role = entry.role === 'user' ? 'User' : 'Assistant'
            return `${role}: ${entry.content}`
        })
    }

    /**
     * Get a summary of conversation context
     */
    getContextSummary(): string {
        if (this.entries.length === 0) {
            return 'No previous conversation.'
        }

        const lastFew = this.entries.slice(-5)
        return lastFew
            .map((e) => `${e.role === 'user' ? 'You' : 'Claude'}: ${e.content.slice(0, 100)}...`)
            .join('\n')
    }

    clear(): void {
        this.entries = []
    }

    get length(): number {
        return this.entries.length
    }

    private trim(): void {
        if (this.entries.length > this.maxEntries) {
            // Keep the most recent entries
            this.entries = this.entries.slice(-this.maxEntries)
        }
    }
}
