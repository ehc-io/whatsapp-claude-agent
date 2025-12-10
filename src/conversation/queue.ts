import type { IncomingMessage } from '../types.ts'
import type { Logger } from '../utils/logger.ts'

interface QueuedMessage {
    message: IncomingMessage
    resolve: () => void
}

/**
 * Message queue to handle concurrent messages.
 * Ensures messages from a single sender are processed sequentially.
 */
export class MessageQueue {
    private queues: Map<string, QueuedMessage[]> = new Map()
    private processing: Set<string> = new Set()

    constructor(_logger: Logger) {
        // Logger reserved for future use
        void _logger
    }

    /**
     * Add a message to the queue and wait for it to be processed
     */
    async enqueue(message: IncomingMessage): Promise<void> {
        return new Promise((resolve) => {
            const queue = this.queues.get(message.from) || []
            queue.push({ message, resolve })
            this.queues.set(message.from, queue)

            // Start processing if not already
            if (!this.processing.has(message.from)) {
                this.processQueue(message.from)
            }
        })
    }

    /**
     * Signal that the current message has been processed
     */
    dequeue(from: string): void {
        const queue = this.queues.get(from)
        if (queue && queue.length > 0) {
            const item = queue.shift()
            item?.resolve()
        }
    }

    private async processQueue(from: string): Promise<void> {
        this.processing.add(from)

        while (true) {
            const queue = this.queues.get(from)
            if (!queue || queue.length === 0) {
                break
            }

            // Wait for the current message to be processed
            // The handler will call dequeue() when done
            await new Promise<void>((resolve) => {
                // Give control back to allow the message to be processed
                setImmediate(resolve)
            })

            // Check if there are more messages
            const currentQueue = this.queues.get(from)
            if (!currentQueue || currentQueue.length === 0) {
                break
            }
        }

        this.processing.delete(from)
        this.queues.delete(from)
    }

    /**
     * Get the next message for a sender without removing it
     */
    peek(from: string): IncomingMessage | null {
        const queue = this.queues.get(from)
        return queue?.[0]?.message || null
    }

    /**
     * Check if there are queued messages for a sender
     */
    hasQueued(from: string): boolean {
        const queue = this.queues.get(from)
        return (queue?.length || 0) > 0
    }

    /**
     * Get queue size for a sender
     */
    queueSize(from: string): number {
        return this.queues.get(from)?.length || 0
    }

    /**
     * Clear all queues
     */
    clear(): void {
        for (const queue of this.queues.values()) {
            for (const item of queue) {
                item.resolve()
            }
        }
        this.queues.clear()
        this.processing.clear()
    }
}
