/**
 * Progress Bar & Formatting Utilities for Telegram
 * Style yang didukung Telegram: HTML formatting (b, i, code, pre)
 */

// Progress bar characters
const PROGRESS_CHARS = {
    filled: '█',
    empty: '░',
    // Alternative styles:
    // filled: '▓', empty: '░',
    // filled: '●', empty: '○',
    // filled: '▰', empty: '▱',
};

// Color mapping for progress bar (for console only)
const PROGRESS_COLORS = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m'
};

/**
 * Generate a visual progress bar
 * @param {number} percent - Percentage (0-100)
 * @param {number} length - Bar length (default 15)
 * @returns {string} Progress bar string
 */
function progressBar(percent, length = 15) {
    const filled = Math.round((percent / 100) * length);
    const empty = length - filled;
    return PROGRESS_CHARS.filled.repeat(filled) + PROGRESS_CHARS.empty.repeat(empty);
}

/**
 * Generate colored progress bar for console
 * @param {number} percent - Percentage (0-100)
 * @param {number} length - Bar length (default 30)
 * @param {string} color - Color name (red, green, yellow, blue, magenta, cyan)
 * @returns {string} Colored progress bar string
 */
function coloredProgressBar(percent, length = 30, color = 'green') {
    const filled = Math.round((percent / 100) * length);
    const empty = length - filled;
    const colorCode = PROGRESS_COLORS[color] || PROGRESS_COLORS.green;
    return `${colorCode}${PROGRESS_CHARS.filled.repeat(filled)}${PROGRESS_COLORS.reset}${PROGRESS_CHARS.empty.repeat(empty)}`;
}

/**
 * Format build progress message
 * @param {number} percent - Progress percentage
 * @param {string} status - Current status text
 * @param {string} appName - Application name (optional)
 * @returns {string} Formatted message
 */
function formatBuildProgress(percent, status, appName = '') {
    const bar = progressBar(percent);
    const header = appName ? `🔨 <b>Building: ${appName}</b>` : '🔨 <b>Building APK</b>';

    return `
${header}
━━━━━━━━━━━━━━━━━━

${bar} <b>${percent}%</b>

<code>${escapeHtml(status)}</code>

⏳ <i>Mohon tunggu...</i>
    `.trim();
}

/**
 * Format ZIP build progress message
 * @param {number} percent - Progress percentage
 * @param {string} status - Current status text
 * @param {string} projectType - Project type (flutter/android)
 * @param {string} buildType - Build type (debug/release)
 * @returns {string} Formatted message
 */
function formatZipBuildProgress(percent, status, projectType, buildType) {
    const bar = progressBar(percent);
    const typeIcon = projectType === 'flutter' ? '💙' : '🤖';
    const buildIcon = buildType === 'release' ? '🚀' : '🐛';

    return `
🔨 <b>Building Project</b>
━━━━━━━━━━━━━━━━━━

${bar} <b>${percent}%</b>

${typeIcon} <b>Type:</b> ${projectType === 'flutter' ? 'Flutter' : 'Android'}
${buildIcon} <b>Build:</b> ${buildType === 'release' ? 'Release' : 'Debug'}

📍 <code>${escapeHtml(status)}</code>

⏳ <i>Harap tunggu, proses ini membutuhkan waktu...</i>
    `.trim();
}

/**
 * Format success message
 * @param {string} appName - Application name
 * @param {string} url - Target URL (optional)
 * @returns {string} Formatted message
 */
function formatSuccessMessage(appName, url = '') {
    const urlLine = url ? `\n🌐 <code>${escapeHtml(url)}</code>` : '';
    return `
✅ <b>APK Berhasil Dibuat!</b>
━━━━━━━━━━━━━━━━━━

📱 <b>${escapeHtml(appName)}</b>${urlLine}

🎉 <i>File APK sedang dikirim...</i>
    `.trim();
}

/**
 * Format success message with download button
 * @param {string} appName - Application name
 * @param {string} url - Target URL (optional)
 * @param {string} downloadUrl - Download URL
 * @returns {object} Object with message and reply_markup
 */
function formatSuccessMessageWithButton(appName, url = '', downloadUrl = '') {
    const urlLine = url ? `\n🌐 <code>${escapeHtml(url)}</code>` : '';
    return {
        message: `
✅ <b>APK Berhasil Dibuat!</b>
━━━━━━━━━━━━━━━━━━

📱 <b>${escapeHtml(appName)}</b>${urlLine}

🎉 <i>File APK siap diunduh!</i>
        `.trim(),
        reply_markup: {
            inline_keyboard: [
                [{ text: '📥 Download APK', url: downloadUrl, style: 'primary' }],
                [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu', style: 'danger' }]
            ]
        }
    };
}

/**
 * Format error message
 * @param {string} error - Error message
 * @returns {string} Formatted message
 */
function formatErrorMessage(error) {
    // Truncate error if too long
    const truncatedError = error.length > 500 ? error.substring(0, 500) + '...' : error;

    return `
❌ <b>Build Gagal</b>
━━━━━━━━━━━━━━━━━━

<b>Error:</b>
<code>${escapeHtml(truncatedError)}</code>

💡 <i>Periksa project Anda dan coba lagi.</i>
    `.trim();
}

/**
 * Format error message with retry button
 * @param {string} error - Error message
 * @returns {object} Object with message and reply_markup
 */
function formatErrorMessageWithRetry(error) {
    const truncatedError = error.length > 500 ? error.substring(0, 500) + '...' : error;

    return {
        message: `
❌ <b>Build Gagal</b>
━━━━━━━━━━━━━━━━━━

<b>Error:</b>
<code>${escapeHtml(truncatedError)}</code>

💡 <i>Periksa project Anda dan coba lagi.</i>
        `.trim(),
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔄 Coba Lagi', callback_data: 'retry_build', style: 'primary' }],
                [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu', style: 'danger' }]
            ]
        }
    };
}

/**
 * Format queue status message
 * @param {number} position - Queue position
 * @param {number} totalWaiting - Total waiting users
 * @param {string} currentBuild - Current build info
 * @returns {string} Formatted message
 */
function formatQueueStatusMessage(position, totalWaiting, currentBuild = 'Unknown') {
    const bar = progressBar(Math.round((totalWaiting - position) / totalWaiting * 100));
    
    return `
⏳ <b>Status Antrian</b>
━━━━━━━━━━━━━━━━━━

📋 <b>Posisi Anda:</b> #${position}
👥 <b>Total Antrian:</b> ${totalWaiting} user
🔨 <b>Sedang diproses:</b> ${escapeHtml(currentBuild)}

${bar} <b>${Math.round((totalWaiting - position) / totalWaiting * 100)}%</b>

💡 <i>Bot akan memberi tahu saat giliran Anda tiba.</i>
    `.trim();
}

/**
 * Format server status message
 * @param {object} status - Server status object
 * @returns {string} Formatted message
 */
function formatServerStatusMessage(status) {
    const statusIcon = status.isBuilding ? '🔴' : '🟢';
    const statusText = status.isBuilding ? 'Sedang Build' : 'Tersedia';
    const bar = progressBar(status.queueProgress || 0);
    
    let message = `
${statusIcon} <b>Status Server</b>
━━━━━━━━━━━━━━━━━━

📊 <b>Status:</b> ${statusText}
📱 <b>Build Type:</b> ${status.buildType === 'zip' ? 'ZIP Project' : 'URL Build'}
⏱️ <b>Durasi:</b> ${status.duration}
👥 <b>Antrian:</b> ${status.waitingCount} user
`;

    if (status.waitingCount > 0) {
        message += `
━━━━━━━━━━━━━━━━━━
${bar} <b>${status.queueProgress}%</b>
`;
    }

    return message.trim();
}

/**
 * Format color change success message
 * @param {string} oldColor - Old color
 * @param {string} newColor - New color
 * @param {number} changes - Number of changes
 * @returns {string} Formatted message
 */
function formatColorChangeMessage(oldColor, newColor, changes) {
    return `
✅ <b>Warna Base Berhasil Diubah!</b>
━━━━━━━━━━━━━━━━━━

🔴 <b>Warna Lama:</b> <code>${escapeHtml(oldColor)}</code>
🟢 <b>Warna Baru:</b> <code>${escapeHtml(newColor)}</code>
📝 <b>Total Perubahan:</b> ${changes} file

💡 <i>Gunakan /start untuk melihat perubahan.</i>
    `.trim();
}

/**
 * Get animated spinner (for variety)
 * @param {number} step - Animation step
 * @returns {string} Spinner character
 */
function getSpinner(step) {
    const spinners = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    return spinners[step % spinners.length];
}

/**
 * Format initial build message
 * @param {string} appName - App name
 * @param {string} url - Target URL
 * @returns {string} Formatted message
 */
function formatBuildStartMessage(appName, url) {
    return `
🚀 <b>Memulai Build</b>
━━━━━━━━━━━━━━━━━━

📱 <b>Aplikasi:</b> ${escapeHtml(appName)}
🌐 <b>URL:</b> <code>${escapeHtml(url)}</code>

${progressBar(0)} <b>0%</b>

⏳ <i>Mempersiapkan environment...</i>
    `.trim();
}

/**
 * Format cancel message
 * @returns {string} Formatted message
 */
function formatCancelMessage() {
    return `
❌ <b>Proses Dibatalkan</b>
━━━━━━━━━━━━━━━━━━

<i>Build APK telah dibatalkan.</i>

🏠 <b>Kembali ke menu utama dengan /start</b>
    `.trim();
}

/**
 * Format waiting message
 * @param {string} step - Current step name
 * @returns {string} Formatted message
 */
function formatWaitingMessage(step) {
    return `
⏳ <b>Processing: ${escapeHtml(step)}</b>
━━━━━━━━━━━━━━━━━━

<i>Sedang memproses permintaan Anda...</i>

${progressBar(30)} <b>30%</b>

📦 <i>Mohon tunggu sebentar...</i>
    `.trim();
}

/**
 * Format welcome message for new user
 * @param {string} username - Username
 * @returns {string} Formatted message
 */
function formatWelcomeMessage(username) {
    return `
╔═══════════════════════════════╗
     👋  <b>SELAMAT DATANG</b>  👋
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>${escapeHtml(username)}</b>, selamat datang di <b>Web4APK Bot</b>!

Konversi website menjadi aplikasi Android native dengan mudah dan cepat.

━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ <b>Fitur:</b>
• 🚫 Tanpa Iklan
• ⚡ Proses Cepat
• 🖼️ Custom Icon
• 📦 Build dari ZIP
• 🎨 Custom Theme

━━━━━━━━━━━━━━━━━━━━━━━━━━
👇 <b>Mulai project Anda sekarang:</b>
    `.trim();
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

module.exports = {
    progressBar,
    coloredProgressBar,
    formatBuildProgress,
    formatZipBuildProgress,
    formatSuccessMessage,
    formatSuccessMessageWithButton,
    formatErrorMessage,
    formatErrorMessageWithRetry,
    formatQueueStatusMessage,
    formatServerStatusMessage,
    formatColorChangeMessage,
    formatBuildStartMessage,
    formatCancelMessage,
    formatWaitingMessage,
    formatWelcomeMessage,
    getSpinner,
    escapeHtml
};