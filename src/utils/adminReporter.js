/**
 * Admin Reporter - Mengirim laporan ke owner setiap ada aktivitas
 * Style yang didukung Telegram: HTML formatting (b, i, code, pre)
 */

// Helper untuk format timestamp
function getFormattedTimestamp() {
    return new Date().toLocaleString('id-ID', { 
        timeZone: 'Asia/Jakarta',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// Helper untuk format durasi
function getDuration(startTime) {
    if (!startTime) return '-';
    const duration = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

// Helper untuk mendapatkan owner ID
function getOwnerId() {
    return process.env.ADMIN_IDS?.split(',')[0];
}

// Helper untuk escape HTML
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Send build report to admin
 * @param {Object} bot - Telegram bot instance
 * @param {Object} userData - User information
 * @param {Object} appData - Application data
 * @param {Object} options - Additional options (duration, status, etc)
 */
async function sendBuildReport(bot, userData, appData, options = {}) {
    const ownerId = getOwnerId();
    if (!ownerId) return;

    const timestamp = getFormattedTimestamp();
    const duration = getDuration(options.startTime);
    const status = options.status || 'success';
    const errorMsg = options.errorMsg || null;
    const buildType = options.buildType || 'url';

    // Determine status icon
    const statusIcon = status === 'success' ? '✅' : '❌';
    const statusText = status === 'success' ? 'SUCCESS' : 'FAILED';
    const buildTypeIcon = buildType === 'zip' ? '📦' : '🌐';

    let reportMsg = '';

    if (status === 'success') {
        reportMsg = `
╔═══════════════════════════════╗
     ${statusIcon}  <b>BUILD REPORT</b>  ${statusIcon}
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 <b>APPLICATION INFO</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
📛 <b>Name:</b> <code>${escapeHtml(appData.appName || '-')}</code>
${buildType === 'url' ? `🌐 <b>URL:</b> <code>${escapeHtml(appData.url || '-')}</code>` : `${buildTypeIcon} <b>Type:</b> <code>${buildType === 'zip' ? 'ZIP Project' : 'URL Build'}</code>`}
🎨 <b>Theme Color:</b> ${appData.themeColor || 'Default'}
🖼️ <b>Custom Icon:</b> ${appData.hasCustomIcon ? '✅ Yes' : '❌ No'}

━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 <b>USER INFO</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
🆔 <b>ID:</b> <code>${escapeHtml(userData.id || '-')}</code>
📛 <b>Name:</b> ${escapeHtml(userData.name || '-')}
👤 <b>Username:</b> ${userData.username ? '@' + escapeHtml(userData.username) : '-'}

━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱️ <b>TIME INFO</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 <b>Timestamp:</b> ${timestamp}
⏱️ <b>Duration:</b> <code>${duration}</code>

━━━━━━━━━━━━━━━━━━━━━━━━━━
${statusIcon} <b>Status:</b> <code>${statusText}</code>
        `.trim();
    } else {
        reportMsg = `
╔═══════════════════════════════╗
     ${statusIcon}  <b>BUILD REPORT</b>  ${statusIcon}
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 <b>APPLICATION INFO</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
📛 <b>Name:</b> <code>${escapeHtml(appData.appName || '-')}</code>
${buildType === 'url' ? `🌐 <b>URL:</b> <code>${escapeHtml(appData.url || '-')}</code>` : `${buildTypeIcon} <b>Type:</b> <code>${buildType === 'zip' ? 'ZIP Project' : 'URL Build'}</code>`}

━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 <b>USER INFO</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
🆔 <b>ID:</b> <code>${escapeHtml(userData.id || '-')}</code>
📛 <b>Name:</b> ${escapeHtml(userData.name || '-')}
👤 <b>Username:</b> ${userData.username ? '@' + escapeHtml(userData.username) : '-'}

━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱️ <b>TIME INFO</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 <b>Timestamp:</b> ${timestamp}

━━━━━━━━━━━━━━━━━━━━━━━━━━
${statusIcon} <b>Status:</b> <code>${statusText}</code>
${errorMsg ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n❌ <b>Error:</b>\n<code>${escapeHtml(errorMsg.substring(0, 300))}${errorMsg.length > 300 ? '...' : ''}</code>` : ''}
        `.trim();
    }

    try {
        await bot.sendMessage(ownerId, reportMsg, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });
        console.log(`📊 Build report sent to admin for user ${userData.id}`);
    } catch (e) {
        console.error('Failed to send admin report:', e.message);
    }
}

/**
 * Send user activity report (when user starts bot)
 * @param {Object} bot - Telegram bot instance
 * @param {Object} userData - User information
 */
async function sendUserActivityReport(bot, userData) {
    const ownerId = getOwnerId();
    if (!ownerId) return;

    const timestamp = getFormattedTimestamp();

    const reportMsg = `
╔═══════════════════════════════╗
     👤  <b>USER ACTIVITY</b>  👤
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 <b>USER INFO</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
🆔 <b>ID:</b> <code>${escapeHtml(userData.id || '-')}</code>
📛 <b>Name:</b> ${escapeHtml(userData.name || '-')}
👤 <b>Username:</b> ${userData.username ? '@' + escapeHtml(userData.username) : '-'}

━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 <b>Timestamp:</b> ${timestamp}

━━━━━━━━━━━━━━━━━━━━━━━━━━
🟢 <b>Action:</b> <code>Started Bot</code>
    `.trim();

    try {
        await bot.sendMessage(ownerId, reportMsg, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });
        console.log(`👤 User activity report sent for ${userData.id}`);
    } catch (e) {
        console.error('Failed to send user activity report:', e.message);
    }
}

/**
 * Send error report to admin
 * @param {Object} bot - Telegram bot instance
 * @param {Object} userData - User information
 * @param {string} errorType - Type of error
 * @param {string} errorMessage - Error message
 * @param {Object} additionalInfo - Additional info (optional)
 */
async function sendErrorReport(bot, userData, errorType, errorMessage, additionalInfo = null) {
    const ownerId = getOwnerId();
    if (!ownerId) return;

    const timestamp = getFormattedTimestamp();

    let reportMsg = `
╔═══════════════════════════════╗
     ⚠️  <b>ERROR REPORT</b>  ⚠️
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 <b>USER INFO</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
🆔 <b>ID:</b> <code>${escapeHtml(userData.id || '-')}</code>
📛 <b>Name:</b> ${escapeHtml(userData.name || '-')}
👤 <b>Username:</b> ${userData.username ? '@' + escapeHtml(userData.username) : '-'}

━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ <b>ERROR INFO</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 <b>Type:</b> <code>${escapeHtml(errorType)}</code>
❌ <b>Message:</b>
<code>${escapeHtml(errorMessage.substring(0, 300))}${errorMessage.length > 300 ? '...' : ''}</code>
`;

    if (additionalInfo) {
        reportMsg += `
━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 <b>ADDITIONAL INFO</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
<code>${escapeHtml(JSON.stringify(additionalInfo, null, 2).substring(0, 500))}</code>
`;
    }

    reportMsg += `
━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 <b>Timestamp:</b> ${timestamp}
    `.trim();

    try {
        await bot.sendMessage(ownerId, reportMsg, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });
        console.log(`⚠️ Error report sent to admin: ${errorType}`);
    } catch (e) {
        console.error('Failed to send error report:', e.message);
    }
}

/**
 * Send daily summary report to admin
 * @param {Object} bot - Telegram bot instance
 * @param {Object} stats - Statistics object
 */
async function sendDailySummary(bot, stats) {
    const ownerId = getOwnerId();
    if (!ownerId) return;

    const timestamp = getFormattedTimestamp();

    const reportMsg = `
╔═══════════════════════════════╗
     📊  <b>DAILY SUMMARY</b>  📊
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 <b>STATISTICS</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 <b>Total Users:</b> <code>${stats.totalUsers || 0}</code>
🟢 <b>Active Today:</b> <code>${stats.activeToday || 0}</code>
✅ <b>Builds Today:</b> <code>${stats.buildsToday || 0}</code>
❌ <b>Errors Today:</b> <code>${stats.errorsToday || 0}</code>
📦 <b>ZIP Builds:</b> <code>${stats.zipBuilds || 0}</code>
🌐 <b>URL Builds:</b> <code>${stats.urlBuilds || 0}</code>

━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 <b>Report Date:</b> ${timestamp}
    `.trim();

    try {
        await bot.sendMessage(ownerId, reportMsg, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });
        console.log('📊 Daily summary sent to admin');
    } catch (e) {
        console.error('Failed to send daily summary:', e.message);
    }
}

/**
 * Send server status report to admin
 * @param {Object} bot - Telegram bot instance
 * @param {Object} status - Server status
 */
async function sendServerStatusReport(bot, status) {
    const ownerId = getOwnerId();
    if (!ownerId) return;

    const timestamp = getFormattedTimestamp();

    const reportMsg = `
╔═══════════════════════════════╗
     🖥️  <b>SERVER STATUS</b>  🖥️
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 <b>SYSTEM INFO</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
💾 <b>Memory Usage:</b> <code>${status.memoryUsage || '-'}</code>
📀 <b>Disk Usage:</b> <code>${status.diskUsage || '-'}</code>
⏱️ <b>Uptime:</b> <code>${status.uptime || '-'}</code>
🔄 <b>Queue Status:</b> <code>${status.queueStatus || 'idle'}</code>
👥 <b>Waiting Queue:</b> <code>${status.waitingCount || 0}</code>

━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 <b>Report Time:</b> ${timestamp}
    `.trim();

    try {
        await bot.sendMessage(ownerId, reportMsg, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });
    } catch (e) {
        console.error('Failed to send server status report:', e.message);
    }
}

module.exports = { 
    sendBuildReport, 
    sendUserActivityReport, 
    sendErrorReport,
    sendDailySummary,
    sendServerStatusReport,
    getOwnerId,
    getFormattedTimestamp
};