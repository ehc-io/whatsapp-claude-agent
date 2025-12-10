import { existsSync, unlinkSync, renameSync, chmodSync, writeFileSync } from 'fs'
import { spawn } from 'child_process'
import { buildInfo } from '../build-info.ts'

const REPO = 'dsebastien/whatsapp-claude-agent'

interface ReleaseInfo {
    tag_name: string
    assets: Array<{
        name: string
        browser_download_url: string
    }>
}

function detectPlatform(): { os: string; arch: string } {
    const platform = process.platform
    const arch = process.arch

    let os: string
    switch (platform) {
        case 'linux':
            os = 'linux'
            break
        case 'darwin':
            os = 'darwin'
            break
        case 'win32':
            os = 'windows'
            break
        default:
            throw new Error(`Unsupported platform: ${platform}`)
    }

    let normalizedArch: string
    switch (arch) {
        case 'x64':
            normalizedArch = 'x64'
            break
        case 'arm64':
            normalizedArch = 'arm64'
            break
        default:
            throw new Error(`Unsupported architecture: ${arch}`)
    }

    return { os, arch: normalizedArch }
}

function compareVersions(current: string, latest: string): number {
    // Remove 'v' prefix if present
    const cleanCurrent = current.replace(/^v/, '')
    const cleanLatest = latest.replace(/^v/, '')

    const currentParts = cleanCurrent.split('.').map((p) => parseInt(p, 10) || 0)
    const latestParts = cleanLatest.split('.').map((p) => parseInt(p, 10) || 0)

    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
        const c = currentParts[i] || 0
        const l = latestParts[i] || 0
        if (c < l) return -1
        if (c > l) return 1
    }
    return 0
}

async function fetchLatestRelease(): Promise<ReleaseInfo> {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
    if (!response.ok) {
        throw new Error(`Failed to fetch release info: ${response.statusText}`)
    }
    return (await response.json()) as ReleaseInfo
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function renderProgressBar(percent: number, width: number = 30): string {
    const filled = Math.round((percent / 100) * width)
    const empty = width - filled
    return '[' + '#'.repeat(filled) + '-'.repeat(empty) + ']'
}

async function downloadBinary(url: string, destPath: string): Promise<void> {
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`Failed to download: ${response.statusText}`)
    }

    const contentLength = response.headers.get('content-length')
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0

    if (!response.body) {
        throw new Error('No response body')
    }

    const chunks: Uint8Array[] = []
    let downloadedBytes = 0

    const reader = response.body.getReader()

    while (true) {
        const { done, value } = await reader.read()
        if (done) break

        chunks.push(value)
        downloadedBytes += value.length

        // Update progress bar
        if (totalBytes > 0) {
            const percent = Math.round((downloadedBytes / totalBytes) * 100)
            const bar = renderProgressBar(percent)
            process.stdout.write(
                `\r${bar} ${percent}% (${formatBytes(downloadedBytes)}/${formatBytes(totalBytes)})`
            )
        } else {
            process.stdout.write(`\rDownloaded: ${formatBytes(downloadedBytes)}`)
        }
    }

    // Clear progress line and print completion
    process.stdout.write('\r' + ' '.repeat(60) + '\r')

    // Combine chunks and write to file
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
    const buffer = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
        buffer.set(chunk, offset)
        offset += chunk.length
    }

    await Bun.write(destPath, buffer)
}

function getExecutablePath(): string {
    // For compiled Bun binaries, Bun.main returns a virtual /$bunfs/... path
    // In that case, process.execPath IS our compiled binary
    if (Bun.main.startsWith('/$bunfs/')) {
        return process.execPath
    }

    // Running as a script: check argv[1] first (the script path)
    if (process.argv[1] && existsSync(process.argv[1])) {
        return process.argv[1]
    }

    return Bun.main
}

/**
 * On Windows, we can't replace a running executable.
 * Create a batch script that waits for the process to exit, then replaces the file.
 */
function createWindowsUpdateScript(execPath: string, tempPath: string, version: string): string {
    const batchPath = `${execPath}.update.bat`
    const batchContent = `@echo off
echo Waiting for process to exit...
timeout /t 2 /nobreak >nul
:retry
del "${execPath}" 2>nul
if exist "${execPath}" (
    timeout /t 1 /nobreak >nul
    goto retry
)
move "${tempPath}" "${execPath}"
echo.
echo Successfully updated to ${version}!
echo You can now restart the application.
del "%~f0"
`
    writeFileSync(batchPath, batchContent)
    return batchPath
}

export async function runUpdate(): Promise<never> {
    console.log('Checking for updates...')

    const currentVersion = buildInfo.version
    // Treat dev version as 0.0.0 (oldest possible) so it can always be updated
    const comparableVersion = currentVersion === '0.0.0-dev' ? '0.0.0' : currentVersion

    try {
        // Fetch latest release info
        const release = await fetchLatestRelease()
        const latestVersion = release.tag_name

        console.log(
            `Current version: ${currentVersion}${currentVersion === '0.0.0-dev' ? ' (development)' : ''}`
        )
        console.log(`Latest version:  ${latestVersion}`)

        // Compare versions
        const comparison = compareVersions(comparableVersion, latestVersion)

        if (comparison >= 0) {
            console.log('\nYou are already running the latest version.')
            process.exit(0)
        }

        console.log(`\nNew version available: ${latestVersion}`)

        // Detect platform
        const { os, arch } = detectPlatform()
        console.log(`Platform: ${os}-${arch}`)

        // Find the correct asset
        let assetName = `whatsapp-claude-agent-${os}-${arch}`
        if (os === 'windows') {
            assetName += '.exe'
        }

        const asset = release.assets.find((a) => a.name === assetName)
        if (!asset) {
            console.error(`Error: No release found for platform ${os}-${arch}`)
            console.error('Available assets:')
            release.assets.forEach((a) => console.error(`  - ${a.name}`))
            process.exit(1)
        }

        // Get current executable path
        const execPath = getExecutablePath()
        console.log(`Executable path: ${execPath}`)

        // Download to temp file
        const tempPath = `${execPath}.new`
        const backupPath = `${execPath}.backup`

        console.log(`\nDownloading ${assetName}...`)
        await downloadBinary(asset.browser_download_url, tempPath)
        console.log('Download complete.')

        // Make executable (not needed on Windows)
        if (os !== 'windows') {
            chmodSync(tempPath, 0o755)
        }

        // Windows: Can't replace running executable, use batch script
        if (os === 'windows') {
            console.log('Creating update script...')
            const batchPath = createWindowsUpdateScript(execPath, tempPath, latestVersion)

            console.log(`\nUpdate downloaded. Running update script...`)
            console.log('The application will now exit to complete the update.')

            // Start the batch script detached
            spawn('cmd.exe', ['/c', batchPath], {
                detached: true,
                stdio: 'ignore',
                windowsHide: false
            }).unref()

            process.exit(0)
        }

        // Unix: Replace directly
        // Backup current executable
        if (existsSync(execPath)) {
            console.log('Creating backup...')
            if (existsSync(backupPath)) {
                unlinkSync(backupPath)
            }
            renameSync(execPath, backupPath)
        }

        // Move new executable into place
        console.log('Installing new version...')
        renameSync(tempPath, execPath)

        // Clean up backup
        if (existsSync(backupPath)) {
            unlinkSync(backupPath)
        }

        console.log(`\nSuccessfully updated to ${latestVersion}!`)
        console.log('Please restart the application.')
        process.exit(0)
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`\nUpdate failed: ${message}`)
        process.exit(1)
    }
}

export function isUpdateFlag(args: string[]): boolean {
    return args.includes('--update') || args.includes('-u')
}
