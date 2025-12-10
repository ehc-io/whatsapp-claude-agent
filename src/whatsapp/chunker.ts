const MAX_MESSAGE_LENGTH = 4000

/**
 * Split a long message into chunks that fit within WhatsApp's limits.
 * Tries to split at natural boundaries (paragraphs, sentences) when possible.
 */
export function chunkMessage(text: string, maxLen = MAX_MESSAGE_LENGTH): string[] {
    if (text.length <= maxLen) {
        return [text]
    }

    const chunks: string[] = []
    let remaining = text

    while (remaining.length > 0) {
        if (remaining.length <= maxLen) {
            chunks.push(remaining)
            break
        }

        // Try to find a good split point
        const splitIndex = findSplitPoint(remaining, maxLen)

        chunks.push(remaining.slice(0, splitIndex).trim())
        remaining = remaining.slice(splitIndex).trim()
    }

    // Add chunk indicators if there are multiple chunks
    if (chunks.length > 1) {
        return chunks.map((chunk, i) => `[${i + 1}/${chunks.length}]\n${chunk}`)
    }

    return chunks
}

function findSplitPoint(text: string, maxLen: number): number {
    // Try to split at paragraph boundary (double newline)
    const paragraphBreak = text.lastIndexOf('\n\n', maxLen)
    if (paragraphBreak > maxLen * 0.5) {
        return paragraphBreak + 2
    }

    // Try to split at single newline
    const lineBreak = text.lastIndexOf('\n', maxLen)
    if (lineBreak > maxLen * 0.5) {
        return lineBreak + 1
    }

    // Try to split at sentence boundary
    const sentenceEnd = findLastSentenceEnd(text, maxLen)
    if (sentenceEnd > maxLen * 0.5) {
        return sentenceEnd
    }

    // Try to split at word boundary
    const wordBreak = text.lastIndexOf(' ', maxLen)
    if (wordBreak > maxLen * 0.3) {
        return wordBreak + 1
    }

    // Hard split as last resort
    return maxLen
}

function findLastSentenceEnd(text: string, maxLen: number): number {
    const searchArea = text.slice(0, maxLen)

    // Look for sentence-ending punctuation followed by space or newline
    const patterns = [/\.\s/g, /!\s/g, /\?\s/g, /\.\n/g, /!\n/g, /\?\n/g]

    let lastIndex = -1
    for (const pattern of patterns) {
        let match
        while ((match = pattern.exec(searchArea)) !== null) {
            if (match.index > lastIndex) {
                lastIndex = match.index + 1 // Include the punctuation
            }
        }
    }

    return lastIndex
}

/**
 * Format a code block for WhatsApp (using monospace formatting)
 */
export function formatCodeBlock(code: string, language?: string): string {
    // WhatsApp uses triple backticks for code blocks
    return '```' + (language || '') + '\n' + code + '\n```'
}

/**
 * Escape special WhatsApp formatting characters if needed
 */
export function escapeWhatsAppFormatting(text: string): string {
    // WhatsApp uses *bold*, _italic_, ~strikethrough~, ```code```
    // Only escape if we don't want formatting
    return text
}
