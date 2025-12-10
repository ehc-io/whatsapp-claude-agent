import { basename } from 'path'
import { randomSuperhero } from 'superheroes'

/**
 * Get a random superhero name from the superheroes package
 */
export function getRandomSuperheroName(): string {
    return randomSuperhero()
}

/**
 * Convert a string to Title Case
 * Example: "my-project-name" -> "My Project Name"
 * Example: "spider-man" -> "Spider Man"
 */
export function toTitleCase(str: string): string {
    return str
        .replace(/[-_]/g, ' ') // Replace dashes and underscores with spaces
        .replace(/\s+/g, ' ') // Normalize multiple spaces
        .trim()
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
}

/**
 * Generate a default agent name based on the directory name and a random superhero
 * Format: "Directory Name Superhero" (Title Case)
 * Example: "My Project Spider Man", "Knowii Voice AI Jarvis"
 */
export function generateDefaultAgentName(directory: string): string {
    const dirName = basename(directory)
    const superhero = getRandomSuperheroName()
    // Convert both parts to title case and combine
    const titleCaseDirName = toTitleCase(dirName)
    const titleCaseSuperhero = toTitleCase(superhero)
    return `${titleCaseDirName} ${titleCaseSuperhero}`
}

/**
 * Validate and normalize an agent name
 * - Trims whitespace
 * - Returns the name if valid, undefined if empty
 */
export function normalizeAgentName(name: string | undefined): string | undefined {
    if (!name) return undefined
    const trimmed = name.trim()
    return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Format a message with the agent name prefix
 * Format: "[robot emoji AgentName] message"
 */
export function formatMessageWithAgentName(agentName: string, message: string): string {
    return `[🤖 ${agentName}] ${message}`
}
