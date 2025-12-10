/**
 * Normalize phone number by removing common prefixes and formatting
 */
export function normalizePhone(phone: string): string {
    return phone.replace(/[\s\-()+ ]/g, '').replace(/^0+/, '')
}

/**
 * Extract phone number from WhatsApp JID
 */
export function phoneFromJid(jid: string): string {
    return jid.replace('@s.whatsapp.net', '').replace('@g.us', '')
}

/**
 * Convert phone number to WhatsApp JID
 */
export function phoneToJid(phone: string): string {
    const normalized = normalizePhone(phone)
    return `${normalized}@s.whatsapp.net`
}

/**
 * Check if a JID is from a whitelisted number
 */
export function isWhitelisted(jid: string, whitelist: string[]): boolean {
    const phone = phoneFromJid(jid)
    const normalizedPhone = normalizePhone(phone)

    return whitelist.some((allowed) => {
        const normalizedAllowed = normalizePhone(allowed)
        // Match if either ends with the other (handles country code variations)
        return (
            normalizedPhone.endsWith(normalizedAllowed) ||
            normalizedAllowed.endsWith(normalizedPhone) ||
            normalizedPhone === normalizedAllowed
        )
    })
}

/**
 * Check if JID is a group chat
 */
export function isGroupJid(jid: string): boolean {
    return jid.endsWith('@g.us')
}
