const { getCancelKeyboard, getIconKeyboard } = require('../utils/keyboard');
const { colorChanger } = require('../utils/colorChanger');
const { formatColorChangeMessage } = require('../utils/progressUI');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

/**
 * Handle user messages during APK creation flow
 */
async function handleMessage(bot, msg, type = 'text') {
    const chatId = msg.chat.id;
    const session = global.sessions.get(chatId);

    // Handle color input if waiting for color
    if (session && session.step === 'waiting_color') {
        await handleColorInput(bot, chatId, msg, session);
        return;
    }

    // Ignore if no active session
    if (!session) return;

    switch (session.step) {
        case 'url':
            await handleUrlInput(bot, chatId, msg, session);
            break;

        case 'name':
            await handleNameInput(bot, chatId, msg, session);
            break;

        case 'icon':
            if (type === 'photo') {
                await handleIconUpload(bot, chatId, msg, session);
            }
            break;
    }
}

/**
 * Handle color input from user (manual color change)
 */
async function handleColorInput(bot, chatId, msg, session) {
    const input = msg.text?.trim();

    if (!input || input.toLowerCase() === 'batal') {
        global.sessions.delete(chatId);
        await bot.sendMessage(chatId, '❌ Proses ubah warna dibatalkan.', {
            reply_markup: { inline_keyboard: [[{ text: '🏠 Kembali ke Menu', callback_data: 'back_main', style: 'primary' }]] }
        });
        return;
    }

    if (session.colorStep === 'old_color') {
        // Parse old color
        const parsedColor = colorChanger.parseColor(input);
        
        if (!parsedColor) {
            await bot.sendMessage(chatId, `
╔═══════════════════════════════╗
     ❌  <b>WARNA TIDAK VALID</b>  ❌
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
Format warna tidak dikenali.

<b>Format yang didukung:</b>
• <b>HEX:</b> <code>#ff0000</code> atau <code>ff0000</code>
• <b>RGB:</b> <code>rgb(255,0,0)</code>
• <b>HSL:</b> <code>hsl(0,100%,50%)</code>
• <b>Nama:</b> <code>red</code>, <code>blue</code>, dll

━━━━━━━━━━━━━━━━━━━━━━━━━━
Silakan coba lagi:
            `.trim(), {
                parse_mode: 'HTML',
                reply_markup: getCancelKeyboard()
            });
            return;
        }

        session.oldColor = parsedColor.value;
        session.colorStep = 'new_color';
        global.sessions.set(chatId, session);

        await bot.sendMessage(chatId, `
╔═══════════════════════════════╗
     🎨  <b>GANTI WARNA MANUAL</b>  🎨
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ <b>Warna Lama:</b> <code>${parsedColor.value}</code>

<b>Langkah 2/2: Warna Baru</b>

Masukkan warna pengganti.

<b>Format yang didukung:</b>
• <b>HEX:</b> <code>#00ff00</code> atau <code>00ff00</code>
• <b>RGB:</b> <code>rgb(0,255,0)</code>
• <b>HSL:</b> <code>hsl(120,100%,50%)</code>
• <b>Nama:</b> <code>green</code>, <code>blue</code>, dll

━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>Ketik warna baru, atau tekan Batal:</i>
        `.trim(), {
            parse_mode: 'HTML',
            reply_markup: getCancelKeyboard()
        });
        return;
    }

    if (session.colorStep === 'new_color') {
        // Parse new color
        const parsedColor = colorChanger.parseColor(input);
        
        if (!parsedColor) {
            await bot.sendMessage(chatId, `
╔═══════════════════════════════╗
     ❌  <b>WARNA TIDAK VALID</b>  ❌
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
Format warna tidak dikenali.

Silakan coba lagi dengan format yang benar:
            `.trim(), {
                parse_mode: 'HTML',
                reply_markup: getCancelKeyboard()
            });
            return;
        }

        const oldColor = session.oldColor;
        const newColor = parsedColor.value;
        
        // Send processing message
        const processingMsg = await bot.sendMessage(chatId, `
⏳ <b>Mengubah warna base...</b>

🔴 Old Color: <code>${oldColor}</code>
🟢 New Color: <code>${newColor}</code>

📂 Memproses file...
        `.trim(), { parse_mode: 'HTML' });

        // Set base path to android-template
        const baseDir = path.join(__dirname, '..', '..', 'android-template');
        colorChanger.setBasePath(baseDir);

        // Perform color change
        const result = await colorChanger.autoChangeColor(baseDir, oldColor, newColor, ['.xml', '.java', '.kt', '.css', '.html']);

        // Clear session
        global.sessions.delete(chatId);

        // Send result
        await bot.editMessageText(formatColorChangeMessage(oldColor, newColor, result.totalChanges), {
            chat_id: chatId,
            message_id: processingMsg.message_id,
            parse_mode: 'HTML'
        });

        // Return to main menu after 3 seconds
        setTimeout(async () => {
            await bot.sendMessage(chatId, '🏠 Kembali ke menu utama...', {
                reply_markup: { inline_keyboard: [[{ text: '🏠 Menu Utama', callback_data: 'back_main', style: 'primary' }]] }
            });
        }, 3000);
    }
}

/**
 * Handle URL input
 */
async function handleUrlInput(bot, chatId, msg, session) {
    const url = msg.text?.trim();

    // Validate URL
    if (!url || !isValidUrl(url)) {
        await bot.sendMessage(chatId, `
╔═══════════════════════════════╗
     ❌  <b>URL TIDAK VALID</b>  ❌
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
Masukkan URL yang valid

<i>Contoh: https://example.com</i>
        `.trim(), {
            parse_mode: 'HTML',
            reply_markup: getCancelKeyboard()
        });
        return;
    }

    session.data.url = url;
    session.step = 'name';
    global.sessions.set(chatId, session);

    const message = `
╔═══════════════════════════════╗
     📱  <b>BUAT APK BARU</b>  📱
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>Langkah 2/3: Nama Aplikasi</b>

✅ <b>URL:</b> <code>${escapeHtml(url)}</code>

Sekarang, kirim nama untuk aplikasi Anda.

<i>Contoh: My App</i>
    `.trim();

    await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: getCancelKeyboard()
    });
}

/**
 * Handle app name input
 */
async function handleNameInput(bot, chatId, msg, session) {
    const name = msg.text?.trim();

    // Validate name
    if (!name || name.length < 2 || name.length > 30) {
        await bot.sendMessage(chatId, `
╔═══════════════════════════════╗
     ❌  <b>NAMA TIDAK VALID</b>  ❌
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
Nama harus 2-30 karakter.

<i>Contoh: My App, Calculator, dll</i>
        `.trim(), {
            parse_mode: 'HTML',
            reply_markup: getCancelKeyboard()
        });
        return;
    }

    session.data.appName = name;
    session.step = 'icon';
    global.sessions.set(chatId, session);

    const message = `
╔═══════════════════════════════╗
     📱  <b>BUAT APK BARU</b>  📱
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>Langkah 3/3: Icon Aplikasi</b>

✅ <b>URL:</b> <code>${escapeHtml(session.data.url)}</code>
✅ <b>Nama:</b> <b>${escapeHtml(name)}</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━
Kirim gambar untuk icon aplikasi (rasio 1:1 disarankan).

Atau klik tombol di bawah untuk menggunakan icon default.
    `.trim();

    await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: getIconKeyboard()
    });
}

/**
 * Handle icon upload
 */
async function handleIconUpload(bot, chatId, msg, session) {
    try {
        // Get the largest photo
        const photo = msg.photo[msg.photo.length - 1];
        const fileId = photo.file_id;

        // Download photo
        const file = await bot.getFile(fileId);
        const filePath = file.file_path;

        // Create temp directory
        const tempDir = path.join(__dirname, '..', '..', 'temp', uuidv4());
        await fs.ensureDir(tempDir);

        // Download file
        const iconPath = path.join(tempDir, 'icon.png');
        const fileStream = await bot.downloadFile(fileId, tempDir);

        // Rename downloaded file
        const downloadedPath = path.join(tempDir, path.basename(filePath));
        if (await fs.pathExists(downloadedPath)) {
            await fs.rename(downloadedPath, iconPath);
        }

        session.data.iconPath = iconPath;
        session.step = 'confirm';
        global.sessions.set(chatId, session);

        const message = `
╔═══════════════════════════════╗
     📱  <b>KONFIRMASI BUILD</b>  📱
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>Detail Aplikasi:</b>

🌐 <b>URL:</b> <code>${escapeHtml(session.data.url)}</code>
📝 <b>Nama:</b> ${escapeHtml(session.data.appName)}
🖼️ <b>Icon:</b> Custom

━━━━━━━━━━━━━━━━━━━━━━━━━━
Klik tombol di bawah untuk memulai proses build.
        `.trim();

        const { getConfirmKeyboard } = require('../utils/keyboard');
        await bot.sendMessage(chatId, message, {
            parse_mode: 'HTML',
            reply_markup: getConfirmKeyboard()
        });

    } catch (error) {
        console.error('Icon upload error:', error);
        await bot.sendMessage(chatId, `
╔═══════════════════════════════╗
     ❌  <b>GAGAL UPLOAD ICON</b>  ❌
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
Gagal mengupload icon. Silakan coba lagi atau lewati.
        `.trim(), {
            parse_mode: 'HTML',
            reply_markup: getIconKeyboard()
        });
    }
}

/**
 * Validate URL
 */
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

module.exports = { handleMessage };