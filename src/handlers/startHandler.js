const { getMainKeyboard } = require('../utils/keyboard');
const userService = require('../utils/userService');
const backupService = require('../utils/backupService');

/**
 * Handle /start command
 */
async function handleStart(bot, msg) {
    const chatId = msg.chat.id;
    const safeName = (msg.from.first_name || 'User')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/&/g, '&amp;');

    // Update user activity
    userService.updateUserActivity(chatId);

    const welcomeCaption = `
╔═══════════════════════════════╗
     👋  <b>SELAMAT DATANG</b>  👋
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>${safeName}</b>, selamat datang di <b>Web4APK Pro Bot Gen 4</b>!

Konversi website menjadi aplikasi Android native dengan mudah dan cepat.

━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ <b>Fitur Premium:</b>
• 🚫 Tanpa Iklan
• ⚡ Proses Cepat
• 🖼️ Custom Icon Support
• 📦 Build dari ZIP Project
• 🎨 Custom Theme Color
• 🎨 Ubah Warna Base

━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 <b>Statistik Server:</b>
• 👥 Total Users: <code>${userService.getCount()}</code>
• 🟢 Active (24h): <code>${userService.getStats().active24h}</code>

━━━━━━━━━━━━━━━━━━━━━━━━━━
👇 <b>Pilih menu di bawah untuk memulai:</b>
    `.trim();

    // Kirim foto dengan caption dan menu
    await bot.sendPhoto(chatId, 'https://files.catbox.moe/5z33zb.jpg', {
        caption: welcomeCaption,
        parse_mode: 'HTML',
        reply_markup: getMainKeyboard()
    }).catch(async () => {
        // Fallback jika gagal kirim foto
        await bot.sendMessage(chatId, welcomeCaption, {
            parse_mode: 'HTML',
            reply_markup: getMainKeyboard()
        });
    });

    // Kirim notifikasi ke owner jika user baru
    const isNew = userService.saveUser(chatId, bot, {
        username: msg.from.username,
        first_name: msg.from.first_name,
        last_name: msg.from.last_name,
        language_code: msg.from.language_code,
        is_premium: msg.from.is_premium
    });

    if (isNew) {
        // Send welcome message to owner
        const ownerId = process.env.ADMIN_IDS?.split(',')[0];
        if (ownerId) {
            await bot.sendMessage(ownerId, `
╔═══════════════════════════════╗
     👤  <b>NEW USER</b>  👤
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
🆔 <b>ID:</b> <code>${chatId}</code>
👤 <b>Name:</b> ${safeName}
📛 <b>Username:</b> ${msg.from.username ? '@' + msg.from.username : '-'}
🌐 <b>Language:</b> ${msg.from.language_code || '-'}
⭐ <b>Premium:</b> ${msg.from.is_premium ? 'Yes' : 'No'}

━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 <b>Time:</b> ${new Date().toLocaleString('id-ID')}
            `.trim(), { parse_mode: 'HTML' }).catch(() => {});
        }
    }
}

/**
 * Handle /backup command (admin only)
 */
async function handleBackup(bot, msg) {
    const chatId = msg.chat.id;
    const isAdmin = process.env.ADMIN_IDS?.split(',').map(id => id.trim()).includes(String(chatId));

    if (!isAdmin) {
        await bot.sendMessage(chatId, '❌ Anda tidak memiliki akses ke command ini.', {
            reply_markup: getMainKeyboard()
        });
        return;
    }

    await backupService.sendToTelegram(bot, 'manual');
}

/**
 * Handle /stats command (admin only)
 */
async function handleStatsCommand(bot, msg) {
    const chatId = msg.chat.id;
    const isAdmin = process.env.ADMIN_IDS?.split(',').map(id => id.trim()).includes(String(chatId));

    if (!isAdmin) {
        await bot.sendMessage(chatId, '❌ Anda tidak memiliki akses ke command ini.');
        return;
    }

    const stats = userService.getStats();
    const backupStats = await backupService.getStats();

    const message = `
╔═══════════════════════════════╗
     📊  <b>SERVER STATISTICS</b>  📊
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 <b>USERS</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
• Total Users: <code>${stats.total}</code>
• Active (24h): <code>${stats.active24h}</code>
• Active (7d): <code>${stats.active7d}</code>
• With Username: <code>${stats.withUsername}</code>
• Premium Users: <code>${stats.premium}</code>

━━━━━━━━━━━━━━━━━━━━━━━━━━
💾 <b>BACKUPS</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
• Total Backups: <code>${backupStats.totalBackups}</code>
• Total Size: <code>${backupStats.totalSize} MB</code>
• Latest Backup: ${backupStats.latestBackup ? backupStats.latestBackup.name : '-'}

━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 <b>Last Update:</b> ${new Date().toLocaleString('id-ID')}
    `.trim();

    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
}

/**
 * Handle /ping command
 */
async function handlePing(bot, msg) {
    const start = Date.now();
    const sentMsg = await bot.sendMessage(msg.chat.id, '🏓 Pinging...');
    const end = Date.now();
    const latency = end - start;
    
    await bot.editMessageText(`🏓 Pong!\n\n📡 Latency: <code>${latency}ms</code>\n🕐 Server Time: ${new Date().toLocaleString('id-ID')}`, {
        chat_id: msg.chat.id,
        message_id: sentMsg.message_id,
        parse_mode: 'HTML'
    });
}

module.exports = { 
    handleStart,
    handleBackup,
    handleStatsCommand,
    handlePing
};