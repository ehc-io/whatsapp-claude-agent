#!/usr/bin/env bun
import { parseArgs } from './cli/commands.ts'
import { createLogger } from './utils/logger.ts'
import { WhatsAppClient } from './whatsapp/client.ts'
import { SDKBackend } from './claude/sdk-backend.ts'
import { ConversationManager } from './conversation/manager.ts'
import { phoneToJid } from './utils/phone.ts'
import type { Config, AgentEvent, IncomingMessage, PermissionRequest } from './types.ts'

async function main() {
    // Parse command line arguments
    let config: Config
    try {
        config = parseArgs(process.argv)
    } catch (error) {
        console.error(error instanceof Error ? error.message : error)
        process.exit(1)
    }

    // Create logger
    const logger = createLogger(config.verbose)

    logger.info('Starting WhatsApp Claude Agent...')
    logger.info(`Working directory: ${config.directory}`)
    logger.info(`Mode: ${config.mode}`)
    logger.info(`Whitelisted numbers: ${config.whitelist.join(', ')}`)

    // Create Claude backend
    const backend = new SDKBackend(config, logger)

    // Create WhatsApp client
    const whatsapp = new WhatsAppClient(config, logger)

    // Create conversation manager
    const conversation = new ConversationManager(backend, config, logger)

    // Track the current message sender for permission requests
    let currentSenderJid: string | null = null

    // Set up event handlers
    whatsapp.on('event', async (event: AgentEvent) => {
        switch (event.type) {
            case 'qr':
                logger.info('QR code displayed. Please scan with WhatsApp.')
                break

            case 'authenticated':
                logger.info('WhatsApp authenticated successfully!')
                break

            case 'ready':
                logger.info('WhatsApp client ready. Listening for messages...')
                break

            case 'message':
                await handleMessage(event.message)
                break

            case 'disconnected':
                logger.warn(`Disconnected: ${event.reason}`)
                break

            case 'error':
                logger.error(`Error: ${event.error.message}`)
                break
        }
    })

    // Handle permission requests from conversation manager
    conversation.on('event', async (event: AgentEvent) => {
        if (event.type === 'permission-request') {
            await handlePermissionRequest(event.request)
        }
    })

    async function handleMessage(message: IncomingMessage) {
        logger.debug(`Processing message from ${message.from}`)

        // Track sender for permission requests
        currentSenderJid = message.from

        await conversation.handleMessage(
            message,
            async (text) => {
                await whatsapp.sendMessage(message.from, text)
            },
            async () => {
                await whatsapp.sendTyping(message.from)
            }
        )

        // Clear sender after handling
        currentSenderJid = null
    }

    async function handlePermissionRequest(request: PermissionRequest) {
        // Send permission request to the user who initiated the conversation
        const jid = currentSenderJid || phoneToJid(config.whitelist[0])

        logger.info(`Sending permission request to ${jid} for tool: ${request.toolName}`)

        const permMessage = `🔐 *Permission Request*

Claude wants to use *${request.toolName}*:

\`\`\`
${request.description}
\`\`\`

Reply *Y* to allow or *N* to deny.
(Auto-denies in 5 minutes)`

        try {
            await whatsapp.sendMessage(jid, permMessage)
            logger.info(`Permission request sent successfully to ${jid}`)
        } catch (error) {
            logger.error(`Failed to send permission request: ${error}`)
        }
    }

    // Handle graceful shutdown
    const shutdown = async () => {
        logger.info('\nShutting down...')

        conversation.dispose()
        await backend.stop()
        await whatsapp.disconnect()

        logger.info('Goodbye!')
        process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

    // Connect to WhatsApp
    try {
        await whatsapp.connect()
    } catch (error) {
        logger.error(`Failed to connect: ${error}`)
        process.exit(1)
    }
}

main().catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
})
