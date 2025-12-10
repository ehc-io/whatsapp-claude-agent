import pino from 'pino'
import pinoPretty from 'pino-pretty'

export function createLogger(verbose: boolean = false) {
    // Use pino-pretty directly (not via transport) for bundled executable compatibility
    const prettyStream = pinoPretty({
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname'
    })

    return pino(
        {
            level: verbose ? 'debug' : 'info'
        },
        prettyStream
    )
}

export type Logger = ReturnType<typeof createLogger>
