import { existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { useMultiFileAuthState, type AuthenticationState } from '@whiskeysockets/baileys'

export interface AuthState {
    state: AuthenticationState
    saveCreds: () => Promise<void>
}

/**
 * Initialize authentication state from the session directory.
 * Creates the directory if it doesn't exist.
 */
export async function initAuthState(sessionPath: string): Promise<AuthState> {
    // Ensure session directory exists
    const dir = dirname(sessionPath)
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
    }
    if (!existsSync(sessionPath)) {
        mkdirSync(sessionPath, { recursive: true })
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath)
    return { state, saveCreds }
}

/**
 * Check if we have existing credentials
 */
export function hasExistingSession(sessionPath: string): boolean {
    return existsSync(sessionPath) && existsSync(`${sessionPath}/creds.json`)
}
