/**
 * Build-time constants injected during compilation.
 * These are replaced at build time via --define flags.
 *
 * For development, fallback values are provided.
 */

declare const BUILD_VERSION: string | undefined
declare const BUILD_DATE: string | undefined
declare const BUILD_COMMIT: string | undefined

// Use build-time constants if available, otherwise use fallbacks for dev
export const buildInfo = {
    version: typeof BUILD_VERSION !== 'undefined' ? BUILD_VERSION : '0.0.0-dev',
    date: typeof BUILD_DATE !== 'undefined' ? BUILD_DATE : new Date().toISOString(),
    commit: typeof BUILD_COMMIT !== 'undefined' ? BUILD_COMMIT : 'development'
} as const

export function getBuildInfoString(): string {
    return `v${buildInfo.version} (${buildInfo.commit.slice(0, 7)}) built ${buildInfo.date}`
}
