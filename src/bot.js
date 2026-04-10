require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs-extra');

// Handlers
const { handleStart } = require('./handlers/startHandler');
const { handleCallback, handleZipUpload } = require('./handlers/callbackHandler');
const { handleMessage } = require('./handlers/messageHandler');

// Color Handler
const { setupColorCommands } = require('./handlers/colorHandler');

// Utils
const { cleanupOldFiles } = require('./utils/cleanup');
const userService = require('./utils/userService');
const licenseKeyService = require('./utils/licenseKeyService');
const { startWebServer, updateNotification } = require('./server');

// Validate environment
if (!process.env.BOT_TOKEN) {
    console.error('❌ Error: BOT_TOKEN tidak ditemukan di .env');
    console.error('   Silakan copy .env.example ke .env dan isi token bot Anda');
    process.exit(1);
}

// Create bot instance
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ==================== SETUP COLOR COMMANDS ====================
// PENTING: Setup color commands HARUS setelah bot dibuat
setupColorCommands(bot);

// Store user sessions
global.sessions = new Map();

// Ensure directories exist
const dirs = ['temp', 'output', 'logs', 'Q U A N T U M'];
dirs.forEach(dir => {
    const dirPath = path.join(__dirname, '..', dir);
    fs.ensureDirSync(dirPath);
});

// Set bot commands menu
bot.setMyCommands([
    { command: 'start', description: '🏠 Mulai menggunakan bot' },
    { command: 'help', description: '❓ Bantuan & panduan' },
    { command: 'stats', description: '📊 Statistik bot (Admin)' },
    { command: 'broadcast', description: '📢 Broadcast pesan (Admin)' },
    { command: 'color', description: '🎨 Ubah warna base (contoh: /color #ff0000 #00ff00)' },
    { command: 'randomcolor', description: '🎲 Generate random color' },
    { command: 'colorlist', description: '📋 Lihat daftar nama warna' }
]).catch(e => console.error('Failed to set commands:', e.message));

// --- CHANNEL MEMBERSHIP CHECK ---
async function checkChannelMembership(userId) {
    const requiredChannel = process.env.REQUIRED_CHANNEL;
    if (!requiredChannel) return true;

    try {
        const member = await bot.getChatMember(requiredChannel, userId);
        return ['member', 'administrator', 'creator'].includes(member.status);
    } catch (error) {
        console.warn(`Channel check failed for ${userId}:`, error.message);
        return true;
    }
}

// --- ADMIN CHECK ---
function isAdmin(userId) {
    const adminIds = process.env.ADMIN_IDS?.split(',').map(id => id.trim()) || [];
    return adminIds.includes(String(userId));
}

// ==================== BUTTON STYLE HELPER ====================
// Style yang didukung Telegram: "primary" (biru) dan "danger" (merah)
function createButton(text, callbackData = null, url = null, style = "primary") {
    const button = { text };
    if (url) {
        button.url = url;
    } else {
        button.callback_data = callbackData;
    }
    // Hanya tambah style jika valid (primary atau danger)
    if (style === "primary" || style === "danger") {
        button.style = style;
    }
    return button;
}

// ==================== START COMMAND ====================
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    userService.saveUser(chatId, bot, {
        username: msg.from.username,
        first_name: msg.from.first_name,
        last_name: msg.from.last_name
    });

    const isMember = await checkChannelMembership(chatId);
    if (!isMember) {
        const channelUsername = process.env.REQUIRED_CHANNEL?.replace('@', '');
        return bot.sendMessage(chatId, `
╔═══════════════════════════════╗
     ⚠️  <b>VERIFIKASI DIPERLUKAN</b>  ⚠️
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
Silakan join channel kami terlebih dahulu:
👉 @${channelUsername}

Setelah join, tekan /start lagi.
        `.trim(), {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                    createButton('📢 Join Channel', null, `https://t.me/${channelUsername}`, "primary")
                ]]
            }
        });
    }

    handleStart(bot, msg);
});

bot.onText(/\/help/, (msg) => handleStart(bot, msg));

// ==================== ADMIN: STATS COMMAND ====================
bot.onText(/\/stats/, async (msg) => {
    if (!isAdmin(msg.chat.id)) return;

    const stats = `
╔═══════════════════════════════╗
     📊  <b>BOT STATISTICS</b>  📊
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 Total Users: <code>${userService.getCount()}</code>
🔄 Active Sessions: <code>${global.sessions.size}</code>
⏱ Uptime: <code>${Math.floor(process.uptime() / 60)} minutes</code>
━━━━━━━━━━━━━━━━━━━━━━━━━━
    `.trim();

    bot.sendMessage(msg.chat.id, stats, { parse_mode: 'HTML' });
});

// ==================== ADMIN: ADD LICENSE KEY ====================
bot.onText(/\/addkey(?:\s+(.+))?/, async (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;

    const input = match[1];
    if (!input) {
        return bot.sendMessage(msg.chat.id, `
🔑 <b>ADD LICENSE KEY</b>
━━━━━━━━━━━━━━━━━━

<b>Penggunaan:</b>
<code>/addkey username,hari,telegram_id</code>

<b>Contoh:</b>
<code>/addkey john,30,123456789</code>
<code>/addkey user123,7,987654321</code>

💡 <i>Hari harus antara 1-365</i>

⚠️ <b>PENTING:</b>
<i>Pastikan user sudah /start bot ini terlebih dahulu</i>
        `.trim(), { parse_mode: 'HTML' });
    }

    const parts = input.split(',').map(p => p.trim());
    if (parts.length !== 3) {
        return bot.sendMessage(msg.chat.id, '❌ Format salah! Gunakan: <code>/addkey username,hari,telegram_id</code>', { parse_mode: 'HTML' });
    }

    const [username, daysStr, telegramId] = parts;
    const days = parseInt(daysStr, 10);

    if (isNaN(days)) {
        return bot.sendMessage(msg.chat.id, '❌ Jumlah hari harus berupa angka!', { parse_mode: 'HTML' });
    }

    if (!telegramId || isNaN(parseInt(telegramId, 10))) {
        return bot.sendMessage(msg.chat.id, '❌ Telegram ID harus berupa angka!', { parse_mode: 'HTML' });
    }

    const result = licenseKeyService.createKey(username, days, telegramId);

    if (result.success) {
        bot.sendMessage(msg.chat.id, `
✅ <b>LICENSE KEY CREATED</b>
━━━━━━━━━━━━━━━━━━

👤 <b>Username:</b> <code>${result.username}</code>
🔑 <b>Key:</b> <code>${result.key}</code>
📅 <b>Berlaku:</b> ${result.days} hari
⏰ <b>Expired:</b> ${new Date(result.expiresAt).toLocaleDateString('id-ID', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })}
📱 <b>Telegram ID:</b> <code>${result.telegramId}</code>

📤 <i>Mengirim data ke user...</i>
        `.trim(), { parse_mode: 'HTML' });

        const loginUrl = process.env.WEB_URL || `http://localhost:${process.env.WEB_PORT || 3000}`;

        try {
            await bot.sendMessage(telegramId, `
╔═══════════════════════════════╗
     🎉  <b>AKUN ANDA TELAH DIBUAT</b>  🎉
╚═══════════════════════════════╝

Selamat! Akun Web4APK Anda telah berhasil dibuat.

━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 <b>Username:</b>
<code>${result.username}</code>

🔑 <b>License Key:</b>
<code>${result.key}</code>

📅 <b>Berlaku hingga:</b>
${new Date(result.expiresAt).toLocaleDateString('id-ID', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })}

━━━━━━━━━━━━━━━━━━━━━━━━━━

🌐 <b>Link Login:</b>
${loginUrl}/login.html

📱 <b>Cara Menggunakan:</b>
1. Klik link di atas atau buka di browser
2. Login dengan username dan key
3. Mulai convert URL atau ZIP menjadi APK!

⚠️ <i>Simpan data ini dengan baik. Jangan bagikan ke orang lain.</i>

━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 <i>Web4APK Bot - Auto Generated</i>
            `.trim(), { parse_mode: 'HTML' });

            bot.sendMessage(msg.chat.id, `✅ Data akun berhasil dikirim ke Telegram ID <code>${telegramId}</code>`, { parse_mode: 'HTML' });
        } catch (sendError) {
            bot.sendMessage(msg.chat.id, `
⚠️ <b>Gagal mengirim ke user!</b>
━━━━━━━━━━━━━━━━━━
Error: ${sendError.message}

<i>Kemungkinan penyebab:</i>
• User belum pernah /start bot ini
• Telegram ID salah
• User memblokir bot

💡 <i>Silakan kirim data akun secara manual ke user.</i>
            `.trim(), { parse_mode: 'HTML' });
        }
    } else {
        bot.sendMessage(msg.chat.id, `❌ <b>Gagal:</b> ${result.error}`, { parse_mode: 'HTML' });
    }
});

// ==================== ADMIN: LIST LICENSE KEYS ====================
bot.onText(/\/listkey/, async (msg) => {
    if (!isAdmin(msg.chat.id)) return;

    const keys = licenseKeyService.listKeys();

    if (keys.length === 0) {
        return bot.sendMessage(msg.chat.id, `
📋 <b>LICENSE KEYS</b>
━━━━━━━━━━━━━━━━━━

<i>Belum ada license key.</i>

💡 Gunakan <code>/addkey username,hari,telegram_id</code> untuk membuat key baru.
        `.trim(), { parse_mode: 'HTML' });
    }

    let message = `
📋 <b>LICENSE KEYS</b> (${keys.length})
━━━━━━━━━━━━━━━━━━
`;

    keys.forEach((k, i) => {
        const status = k.isExpired ? '🔴 Expired' : (k.deviceId ? '🟢 Active' : '🟡 Unused');
        message += `
${i + 1}. <b>${k.username}</b>
   🔑 <code>${k.key}</code>
   ${status} ${!k.isExpired ? `(${k.daysLeft} hari lagi)` : ''}
   📱 ${k.deviceId ? `Device: <code>${k.deviceId.substring(0, 12)}...</code>` : 'Belum login'}
   📲 Telegram: ${k.telegramId ? `<code>${k.telegramId}</code>` : '<i>Tidak ada</i>'}
`;
    });

    message += `\n━━━━━━━━━━━━━━━━━━
💡 <code>/delkey username</code> untuk hapus key`;

    bot.sendMessage(msg.chat.id, message.trim(), { parse_mode: 'HTML' });
});

// ==================== ADMIN: DELETE LICENSE KEY ====================
bot.onText(/\/delkey(?:\s+(.+))?/, async (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;

    const username = match[1]?.trim();
    if (!username) {
        return bot.sendMessage(msg.chat.id, `
🗑️ <b>DELETE LICENSE KEY</b>
━━━━━━━━━━━━━━━━━━

<b>Penggunaan:</b>
<code>/delkey username</code>

<b>Contoh:</b>
<code>/delkey john</code>
        `.trim(), { parse_mode: 'HTML' });
    }

    const result = licenseKeyService.deleteKey(username);

    if (result.success) {
        bot.sendMessage(msg.chat.id, `✅ License key untuk <b>${result.username}</b> berhasil dihapus.`, { parse_mode: 'HTML' });
    } else {
        bot.sendMessage(msg.chat.id, `❌ <b>Gagal:</b> ${result.error}`, { parse_mode: 'HTML' });
    }
});

// ==================== ADMIN: BROADCAST COMMAND ====================
bot.onText(/\/broadcast(?: (.+))?/, async (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;

    const textContent = match[1];
    const isReply = msg.reply_to_message;

    if (!isReply && !textContent) {
        return bot.sendMessage(msg.chat.id, `
╔══════════════════════════╗
     📢  <b>BROADCAST CENTER</b>  📢
╚══════════════════════════╝

<b>📝 Cara Penggunaan:</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━

<b>1️⃣ Text Broadcast:</b>
<code>/broadcast &lt;pesan anda&gt;</code>

<b>2️⃣ Forward Message:</b>
Reply pesan apapun dengan <code>/broadcast</code>

<b>3️⃣ Rich Format (HTML):</b>
<code>/broadcast &lt;b&gt;Bold&lt;/b&gt; &lt;i&gt;Italic&lt;/i&gt;</code>

━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 Total Users: <code>${userService.getCount()}</code>
        `.trim(), { parse_mode: 'HTML' });
    }

    const users = userService.getBroadcastList();
    const totalUsers = users.length;
    const estimatedTime = Math.ceil(totalUsers * 0.05);

    const confirmMsg = await bot.sendMessage(msg.chat.id, `
╔══════════════════════════╗
   ⚠️  <b>KONFIRMASI BROADCAST</b>  ⚠️
╚══════════════════════════╝

📊 <b>Statistik:</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 Target: <code>${totalUsers}</code> users
⏱ Estimasi: <code>~${estimatedTime}</code> detik
📨 Tipe: ${isReply ? 'Forward Message' : 'Text Message'}

📝 <b>Preview:</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${isReply ? '📎 <i>(Forward dari pesan yang di-reply)</i>' : textContent?.substring(0, 200) + (textContent?.length > 200 ? '...' : '')}

━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>Klik tombol untuk melanjutkan...</i>
    `.trim(), {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [
                    createButton('✅ Mulai Broadcast', 'bc_confirm', null, "primary"),
                    createButton('❌ Batal', 'bc_cancel', null, "danger")
                ]
            ]
        }
    });

    global.pendingBroadcast = {
        adminId: msg.chat.id,
        confirmMsgId: confirmMsg.message_id,
        isReply,
        textContent,
        replyMsgId: isReply ? msg.reply_to_message.message_id : null,
        users,
        timestamp: Date.now()
    };
});

// ==================== HANDLE BROADCAST CONFIRMATION ====================
bot.on('callback_query', async (query) => {
    if (!query.data.startsWith('bc_')) return;
    if (!isAdmin(query.from.id)) return;

    const action = query.data;
    const bc = global.pendingBroadcast;

    if (!bc || bc.adminId !== query.from.id) {
        return bot.answerCallbackQuery(query.id, { text: '⚠️ Session expired', show_alert: true });
    }

    if (action === 'bc_cancel') {
        await bot.editMessageText('❌ <b>Broadcast dibatalkan.</b>', {
            chat_id: bc.adminId,
            message_id: bc.confirmMsgId,
            parse_mode: 'HTML'
        });
        global.pendingBroadcast = null;
        return bot.answerCallbackQuery(query.id);
    }

    if (action === 'bc_confirm') {
        await bot.answerCallbackQuery(query.id, { text: '🚀 Memulai broadcast...' });

        const startTime = Date.now();
        let success = 0, failed = 0;
        const total = bc.users.length;

        const getProgressBar = (current, total) => {
            const percent = Math.round((current / total) * 100);
            const filled = Math.round(percent / 5);
            const empty = 20 - filled;
            return '█'.repeat(filled) + '░'.repeat(empty);
        };

        await bot.editMessageText(`
╔══════════════════════════╗
   🚀  <b>BROADCAST IN PROGRESS</b>  🚀
╚══════════════════════════╝

📊 <b>Progress:</b>
<code>[${getProgressBar(0, total)}]</code> 0%

📬 Sent: <code>0</code>
❌ Failed: <code>0</code>
👥 Total: <code>${total}</code>

⏱ Elapsed: <code>0s</code>
━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>⏳ Mohon tunggu...</i>
        `.trim(), {
            chat_id: bc.adminId,
            message_id: bc.confirmMsgId,
            parse_mode: 'HTML'
        });

        let lastUpdate = 0;

        for (let i = 0; i < bc.users.length; i++) {
            const userId = bc.users[i];

            try {
                if (bc.isReply) {
                    await bot.sendMessage(userId, `
╔═══════════════════════════════╗
     📢  <b>PENGUMUMAN RESMI</b>  📢
╚═══════════════════════════════╝
`, { parse_mode: 'HTML' });
                    await bot.forwardMessage(userId, bc.adminId, bc.replyMsgId);
                } else {
                    const formattedMessage = `
╔═══════════════════════════════╗
     📢  <b>PENGUMUMAN RESMI</b>  📢
╚═══════════════════════════════╝

${bc.textContent}

━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 <i>Pesan otomatis dari Web4APK Bot</i>
📅 <i>${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</i>
`.trim();
                    await bot.sendMessage(userId, formattedMessage, { parse_mode: 'HTML' });
                }
                success++;
            } catch (e) {
                failed++;
                if (e.response?.body?.error_code === 403) {
                    userService.removeUser(userId);
                }
            }

            const current = i + 1;
            if (current - lastUpdate >= 10 || current === total) {
                const elapsed = Math.round((Date.now() - startTime) / 1000);
                const percent = Math.round((current / total) * 100);

                await bot.editMessageText(`
╔══════════════════════════╗
   🚀  <b>BROADCAST IN PROGRESS</b>  🚀
╚══════════════════════════╝

📊 <b>Progress:</b>
<code>[${getProgressBar(current, total)}]</code> ${percent}%

📬 Sent: <code>${success}</code>
❌ Failed: <code>${failed}</code>
👥 Total: <code>${total}</code>

⏱ Elapsed: <code>${elapsed}s</code>
━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>⏳ ${current}/${total} processed...</i>
                `.trim(), {
                    chat_id: bc.adminId,
                    message_id: bc.confirmMsgId,
                    parse_mode: 'HTML'
                }).catch(() => { });

                lastUpdate = current;
            }

            await new Promise(r => setTimeout(r, 50));
        }

        const totalTime = Math.round((Date.now() - startTime) / 1000);
        const successRate = Math.round((success / total) * 100);

        await bot.editMessageText(`
╔══════════════════════════╗
   ✅  <b>BROADCAST COMPLETE</b>  ✅
╚══════════════════════════╝

📊 <b>Final Result:</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
<code>[████████████████████]</code> 100%

📬 Sent: <code>${success}</code> ✓
❌ Failed: <code>${failed}</code>
📈 Success Rate: <code>${successRate}%</code>

⏱ Total Time: <code>${totalTime}s</code>
📅 Completed: <code>${new Date().toLocaleString('id-ID')}</code>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${failed > 0 ? `\n⚠️ <i>${failed} users telah dihapus (blocked/deleted)</i>` : '🎉 <i>Semua pesan terkirim dengan sukses!</i>'}
        `.trim(), {
            chat_id: bc.adminId,
            message_id: bc.confirmMsgId,
            parse_mode: 'HTML'
        });

        global.pendingBroadcast = null;
    }
});

// ==================== CALLBACK QUERY HANDLER ====================
bot.on('callback_query', (query) => {
    userService.saveUser(query.from.id, bot);
    handleCallback(bot, query);
});

// ==================== MESSAGE HANDLER ====================
bot.on('message', (msg) => {
    if (msg.text && msg.text.startsWith('/')) return;
    handleMessage(bot, msg);
});

// ==================== PHOTO HANDLER ====================
bot.on('photo', (msg) => {
    handleMessage(bot, msg, 'photo');
});

// ==================== DOCUMENT HANDLER ====================
bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const document = msg.document;

    if (document.file_name?.endsWith('.zip')) {
        const session = global.sessions.get(chatId);

        if (session?.step === 'zip_upload') {
            try {
                const filePath = await bot.downloadFile(document.file_id, path.join(__dirname, '..', 'temp'));
                await handleZipUpload(bot, chatId, filePath);
            } catch (error) {
                console.error('Error downloading ZIP:', error);
                bot.sendMessage(chatId, '❌ Gagal mengunduh file. Silakan coba lagi.');
            }
        } else {
            bot.sendMessage(chatId, '⚠️ Untuk build project ZIP, klik tombol "📦 BUILD PROJECT (ZIP)" terlebih dahulu.');
        }
    }
});

// ==================== ERROR HANDLING ====================
bot.on('polling_error', (error) => {
    console.error('Polling error:', error.message);
});

bot.on('error', (error) => {
    console.error('Bot error:', error.message);
});

// ==================== CLEANUP SCHEDULER ====================
setInterval(() => {
    cleanupOldFiles(path.join(__dirname, '..', 'temp'), 15);
    cleanupOldFiles(path.join(__dirname, '..', 'output'), 15);
}, 15 * 60 * 1000);

// ==================== STARTUP CLEANUP ====================
(async () => {
    console.log('🗑️ Cleaning up leftover temp files...');
    await cleanupOldFiles(path.join(__dirname, '..', 'temp'), 1);
    await cleanupOldFiles(path.join(__dirname, '..', 'output'), 1);
    console.log('✅ Startup cleanup complete');
})();

// ==================== ADMIN: NOTIFICATION COMMAND ====================
bot.onText(/\/notif(?: (.+))?/, async (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;

    const text = match[1];
    if (!text) {
        return bot.sendMessage(msg.chat.id, '❌ Gunakan format: <code>/notif pesan anda</code>', { parse_mode: 'HTML' });
    }

    updateNotification(text);

    bot.sendMessage(msg.chat.id, `
✅ <b>Notifikasi Dikirim!</b>
━━━━━━━━━━━━━━━━━━
📝 <b>Pesan:</b>
${text}

<i>Akan muncul di aplikasi dalam ~1 menit.</i>
    `.trim(), { parse_mode: 'HTML' });
});

// ==================== START WEB SERVER ====================
startWebServer();

// ==================== START BOT ====================
console.log('🤖 Web4APK Bot berhasil dijalankan!');
console.log(`   Total users: ${userService.getCount()}`);
console.log('   Tekan Ctrl+C untuk menghentikan bot');

// ==================== GRACEFUL SHUTDOWN ====================
process.on('SIGINT', () => {
    console.log('\n👋 Bot dihentikan');
    bot.stopPolling();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 Bot dihentikan');
    bot.stopPolling();
    process.exit(0);
});