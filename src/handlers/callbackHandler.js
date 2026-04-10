const { getMainKeyboard, getConfirmKeyboard, getCancelKeyboard, getZipTypeKeyboard, getZipBuildTypeKeyboard, getColorMenuKeyboard, getColorPresetKeyboard, getColorValue } = require('../utils/keyboard');
const { buildApk } = require('../builder/apkBuilder');
const { buildFromZip } = require('../builder/zipBuilder');
const { sendBuildReport } = require('../utils/adminReporter');
const { formatBuildProgress, formatBuildStartMessage, formatSuccessMessage, formatErrorMessage, formatZipBuildProgress, formatColorChangeMessage } = require('../utils/progressUI');
const { buildQueue } = require('../utils/buildQueue');
const { colorChanger, handleColorRequest, handleRandomColor, handleColorList } = require('../utils/colorChanger');
const path = require('path');
const fs = require('fs-extra');

/**
 * Handle callback queries from inline buttons
 */
async function handleCallback(bot, query) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    const userInfo = {
        id: query.from.id,
        firstName: query.from.first_name || 'User',
        lastName: query.from.last_name || '',
        username: query.from.username || null
    };

    await bot.answerCallbackQuery(query.id);

    // Color menu callbacks
    if (data === 'color_menu') {
        await showColorMenu(bot, chatId, messageId);
        return;
    }
    
    if (data === 'color_manual') {
        await askForColorInput(bot, chatId, messageId);
        return;
    }
    
    if (data === 'color_random') {
        await handleRandomColor(bot, chatId);
        await backToMain(bot, chatId, messageId);
        return;
    }
    
    if (data === 'color_list') {
        await handleColorList(bot, chatId);
        await backToMain(bot, chatId, messageId);
        return;
    }
    
    // Color preset callbacks
    if (data.startsWith('color_') && data !== 'color_menu' && data !== 'color_manual' && data !== 'color_random' && data !== 'color_list') {
        const newColor = getColorValue(data);
        if (newColor) {
            await applyColorChange(bot, chatId, messageId, newColor, data);
        }
        return;
    }

    switch (data) {
        case 'create_apk':
            await startCreateApk(bot, chatId, messageId, userInfo);
            break;

        case 'help':
            await showHelp(bot, chatId, messageId);
            break;

        case 'back_main':
            await backToMain(bot, chatId, messageId);
            break;

        case 'cancel':
            await cancelProcess(bot, chatId, messageId);
            break;

        case 'skip_icon':
            await skipIcon(bot, chatId, messageId);
            break;

        case 'confirm_build':
            await confirmBuild(bot, chatId, messageId);
            break;

        case 'build_zip':
            await startBuildZip(bot, chatId, messageId);
            break;

        case 'zip_android':
            await selectZipType(bot, chatId, messageId, 'android');
            break;

        case 'zip_flutter':
            await selectZipType(bot, chatId, messageId, 'flutter');
            break;

        case 'zipbuild_debug':
            await selectZipBuildType(bot, chatId, messageId, 'debug');
            break;

        case 'zipbuild_release':
            await selectZipBuildType(bot, chatId, messageId, 'release');
            break;

        case 'server_status':
            await showServerStatus(bot, chatId, messageId);
            break;
    }
}

/**
 * Show color menu
 */
async function showColorMenu(bot, chatId, messageId) {
    const message = `
╔═══════════════════════════════╗
     🎨  <b>UBAH WARNA BASE</b>  🎨
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
Pilih opsi perubahan warna:

<b>🎨 Ganti Warna Manual</b>
Masukkan warna sendiri (HEX/RGB/HSL/Nama)

<b>🎲 Random Color</b>
Generate warna acak

<b>📋 Daftar Warna</b>
Lihat daftar nama warna yang tersedia

━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>Pilih tombol di bawah untuk melanjutkan:</i>
    `.trim();

    await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: getColorMenuKeyboard()
    });
}

/**
 * Ask for color input from user
 */
async function askForColorInput(bot, chatId, messageId) {
    const session = global.sessions.get(chatId) || {};
    session.step = 'waiting_color';
    session.colorStep = 'old_color';
    global.sessions.set(chatId, session);

    const message = `
╔═══════════════════════════════╗
     🎨  <b>GANTI WARNA MANUAL</b>  🎨
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>Langkah 1/2: Warna Lama</b>

Masukkan warna yang ingin diganti.

<b>Format yang didukung:</b>
• <b>HEX:</b> <code>#ff0000</code> atau <code>ff0000</code>
• <b>RGB:</b> <code>rgb(255,0,0)</code>
• <b>HSL:</b> <code>hsl(0,100%,50%)</code>
• <b>Nama:</b> <code>red</code>, <code>blue</code>, dll

━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>Ketik warna lama, atau tekan Batal:</i>
    `.trim();

    await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: getCancelKeyboard()
    });
}

/**
 * Apply color change
 */
async function applyColorChange(bot, chatId, messageId, newColor, colorName) {
    const processingMsg = await bot.sendMessage(chatId, `
⏳ <b>Mengubah warna base...</b>

🟢 New Color: <code>${newColor}</code>

📂 Memproses file...
    `.trim(), { parse_mode: 'HTML' });

    // Set base path to android-template
    const baseDir = path.join(__dirname, '..', '..', 'android-template');
    colorChanger.setBasePath(baseDir);

    // Perform color change (assuming we change from default blue)
    const oldColor = '#2196F3'; // Default blue
    const result = await colorChanger.autoChangeColor(baseDir, oldColor, newColor, ['.xml', '.java', '.kt']);

    await bot.editMessageText(formatColorChangeMessage(oldColor, newColor, result.totalChanges), {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: 'HTML'
    });

    setTimeout(() => {
        backToMain(bot, chatId, messageId);
    }, 3000);
}

/**
 * Start APK creation flow
 */
async function startCreateApk(bot, chatId, messageId, userInfo = {}) {
    const fullName = [userInfo.firstName, userInfo.lastName].filter(Boolean).join(' ').trim() || 'Unknown';

    global.sessions.set(chatId, {
        step: 'url',
        userName: fullName,
        userUsername: userInfo.username || null,
        data: {
            url: null,
            appName: null,
            iconPath: null,
            themeColor: '#2196F3'
        }
    });

    await bot.deleteMessage(chatId, messageId).catch(() => { });

    const message = `
╔═══════════════════════════════╗
     📱  <b>BUAT APK BARU</b>  📱
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>Langkah 1/3: URL Website</b>

Silakan kirim URL website yang ingin dikonversi menjadi APK.

<i>Contoh: https://example.com</i>
    `.trim();

    await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: getCancelKeyboard()
    });
}

/**
 * Show help message
 */
async function showHelp(bot, chatId, messageId) {
    const helpMessage = `
╔═══════════════════════════════╗
     📚  <b>PANDUAN BOT</b>  📚
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>📱 Cara Membuat APK:</b>
1. Klik tombol "BUAT APLIKASI SEKARANG"
2. Masukkan URL website target
3. Masukkan nama aplikasi
4. Upload icon (opsional)
5. Tunggu proses build (~1-3 menit)

━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>🎨 Cara Ubah Warna Base:</b>
1. Klik tombol "UBAH WARNA BASE"
2. Pilih warna dari preset atau manual
3. Tunggu proses perubahan

━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>💡 Tips:</b>
• URL harus dimulai dengan http:// atau https://
• Nama aplikasi maksimal 30 karakter
• Icon sebaiknya ukuran 512x512 px

━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>❓ Butuh Bantuan?</b>
Hubungi: @Izalmodz
    `.trim();

    await bot.deleteMessage(chatId, messageId).catch(() => { });

    await bot.sendMessage(chatId, helpMessage, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '◀️ Kembali ke Menu', callback_data: 'back_main', style: 'primary' }]
            ]
        }
    });
}

/**
 * Show server status
 */
async function showServerStatus(bot, chatId, messageId) {
    const currentBuild = buildQueue.getCurrentBuild();

    let statusMessage;
    if (currentBuild) {
        const duration = Math.round(currentBuild.duration / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;

        statusMessage = `
╔═══════════════════════════════╗
     📊  <b>STATUS SERVER</b>  📊
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 <b>Status:</b> Sedang Build
⏱️ <b>Durasi:</b> ${minutes}m ${seconds}s
👥 <b>Antrian:</b> ${buildQueue.getWaitingCount()}

💡 <i>Server sedang memproses build. Silakan tunggu hingga selesai.</i>
        `.trim();
    } else {
        statusMessage = `
╔═══════════════════════════════╗
     📊  <b>STATUS SERVER</b>  📊
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
🟢 <b>Status:</b> Tersedia
✅ <b>Antrian:</b> Kosong

💡 <i>Server siap menerima build baru!</i>
        `.trim();
    }

    await bot.deleteMessage(chatId, messageId).catch(() => { });

    await bot.sendMessage(chatId, statusMessage, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔄 Refresh', callback_data: 'server_status', style: 'primary' }],
                [{ text: '◀️ Kembali ke Menu', callback_data: 'back_main', style: 'danger' }]
            ]
        }
    });
}

/**
 * Back to main menu
 */
async function backToMain(bot, chatId, messageId) {
    global.sessions.delete(chatId);

    await bot.deleteMessage(chatId, messageId).catch(() => { });

    const welcomeCaption = `
╔═══════════════════════════════╗
     🤖  <b>WEB4APK PRO BOT</b>  🤖
╚═══════════════════════════════╝

Konversi website menjadi aplikasi Android native dengan mudah!

👇 <b>Klik tombol di bawah untuk memulai:</b>
    `.trim();

    await bot.sendPhoto(chatId, 'https://files.catbox.moe/5z33zb.jpg', {
        caption: welcomeCaption,
        parse_mode: 'HTML',
        reply_markup: getMainKeyboard()
    }).catch(async () => {
        await bot.sendMessage(chatId, welcomeCaption, {
            parse_mode: 'HTML',
            reply_markup: getMainKeyboard()
        });
    });
}

/**
 * Cancel current process
 */
async function cancelProcess(bot, chatId, messageId) {
    const session = global.sessions.get(chatId);

    if (session?.data?.iconPath) {
        await fs.remove(session.data.iconPath).catch(() => { });
    }

    global.sessions.delete(chatId);

    await bot.editMessageText('❌ Proses dibatalkan.\n\nKlik tombol di bawah untuk memulai lagi.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: getMainKeyboard()
    });
}

/**
 * Skip icon upload
 */
async function skipIcon(bot, chatId, messageId) {
    const session = global.sessions.get(chatId);
    if (!session) return;

    session.step = 'confirm';
    global.sessions.set(chatId, session);

    const message = `
╔═══════════════════════════════╗
     📱  <b>KONFIRMASI BUILD</b>  📱
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>Detail Aplikasi:</b>
🌐 URL: ${session.data.url}
📝 Nama: ${session.data.appName}
🖼️ Icon: Default

Klik tombol di bawah untuk memulai proses build.
    `.trim();

    await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: getConfirmKeyboard()
    });
}

/**
 * Confirm and start build
 */
async function confirmBuild(bot, chatId, messageId) {
    const session = global.sessions.get(chatId);
    if (!session) return;

    if (!buildQueue.acquire(chatId, session.userUsername, 'url')) {
        const currentBuild = buildQueue.getCurrentBuild();
        const waitTime = currentBuild ? Math.round(currentBuild.duration / 1000) : 0;
        const position = buildQueue.getQueuePosition(chatId);

        let message = `
╔═══════════════════════════════╗
     ⏳  <b>SERVER SEDANG SIBUK</b>  ⏳
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
🔨 Ada build yang sedang berjalan.
⏱️ Sudah berjalan: <b>${Math.floor(waitTime / 60)}m ${waitTime % 60}s</b>
`;

        if (position > 0) {
            message += `📋 Posisi antrian Anda: <b>#${position}</b>\n`;
        }

        message += `
━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 <i>Silakan coba lagi setelah build selesai.</i>
        `.trim();

        await bot.editMessageText(message, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: getMainKeyboard()
        });

        if (session?.data?.iconPath) {
            await fs.remove(session.data.iconPath).catch(() => { });
        }
        global.sessions.delete(chatId);
        return;
    }

    let currentProgress = 0;
    let buildResult = null;

    await bot.editMessageText(formatBuildStartMessage(session.data.appName, session.data.url), {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML'
    });

    try {
        buildResult = await buildApk(session.data, (status) => {
            buildQueue.updateActivity();

            if (status.includes('Preparing')) currentProgress = 10;
            else if (status.includes('Generating')) currentProgress = 25;
            else if (status.includes('Copying')) currentProgress = 40;
            else if (status.includes('Configuring')) currentProgress = 55;
            else if (status.includes('Building') || status.includes('Gradle')) currentProgress = 70;
            else if (status.includes('Packaging')) currentProgress = 85;
            else if (status.includes('Complete') || status.includes('Success')) currentProgress = 100;
            else currentProgress = Math.min(currentProgress + 5, 95);

            bot.editMessageText(formatBuildProgress(currentProgress, status, session.data.appName), {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML'
            }).catch(() => { });
        });

        if (buildResult.success) {
            await bot.editMessageText(formatSuccessMessage(session.data.appName, session.data.url), {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML'
            });

            await bot.sendDocument(chatId, buildResult.apkPath, {
                caption: `✅ <b>${session.data.appName}</b>\n\n🌐 <code>${session.data.url}</code>\n\n<i>Generated by Web4APK Bot</i>`,
                parse_mode: 'HTML'
            });

            await bot.sendMessage(chatId, '🎉 APK berhasil dikirim!\n\nIngin membuat APK lagi?', {
                reply_markup: getMainKeyboard()
            });

            sendBuildReport(bot, {
                id: chatId,
                name: session.userName || 'Unknown',
                username: session.userUsername || null
            }, session.data);

        } else {
            throw new Error(buildResult.error);
        }

    } catch (error) {
        console.error('Build error:', error);
        await bot.editMessageText(formatErrorMessage(error.message), {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: getMainKeyboard()
        });
    } finally {
        if (buildResult?.apkPath) {
            await fs.remove(buildResult.apkPath).catch(() => { });
        }
        if (buildResult?.buildDir) {
            await fs.remove(buildResult.buildDir).catch(() => { });
        }
        if (session?.data?.iconPath) {
            await fs.remove(session.data.iconPath).catch(() => { });
        }

        const nextUser = buildQueue.release(chatId, buildResult?.success || false);
        if (nextUser) {
            bot.sendMessage(nextUser.chatId, '🎉 Giliran Anda! Memulai proses build...').catch(() => { });
        }
        global.sessions.delete(chatId);
    }
}

/**
 * Start ZIP project build flow
 */
async function startBuildZip(bot, chatId, messageId) {
    await bot.deleteMessage(chatId, messageId).catch(() => { });

    const message = `
╔═══════════════════════════════╗
     📦  <b>BUILD DARI ZIP</b>  📦
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
Pilih jenis project yang akan di-build:

<b>🤖 Android Studio</b>
Project dengan <code>build.gradle</code>

<b>💙 Flutter</b>
Project dengan <code>pubspec.yaml</code>
    `.trim();

    await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: getZipTypeKeyboard()
    });
}

/**
 * Handle ZIP type selection
 */
async function selectZipType(bot, chatId, messageId, projectType) {
    global.sessions.set(chatId, {
        step: 'zip_buildtype',
        data: {
            projectType: projectType,
            buildType: null,
            zipPath: null
        }
    });

    await bot.deleteMessage(chatId, messageId).catch(() => { });

    const typeName = projectType === 'flutter' ? 'Flutter' : 'Android Studio';
    const message = `
╔═══════════════════════════════╗
     📦  <b>PROJECT: ${typeName}</b>  📦
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
Pilih tipe build:

<b>🐛 Debug</b> - Build cepat untuk testing
<b>🚀 Release</b> - Build untuk produksi
    `.trim();

    await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: getZipBuildTypeKeyboard()
    });
}

/**
 * Handle build type selection
 */
async function selectZipBuildType(bot, chatId, messageId, buildType) {
    const session = global.sessions.get(chatId);
    if (!session) return;

    session.data.buildType = buildType;
    session.step = 'zip_upload';
    global.sessions.set(chatId, session);

    await bot.deleteMessage(chatId, messageId).catch(() => { });

    const typeName = session.data.projectType === 'flutter' ? 'Flutter' : 'Android';
    const message = `
╔═══════════════════════════════╗
     📤  <b>UPLOAD PROJECT ZIP</b>  📤
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>Project:</b> ${typeName}
<b>Build:</b> ${buildType === 'release' ? '🚀 Release' : '🐛 Debug'}

Silakan kirim file <b>.zip</b> project Anda.

<i>⚠️ Pastikan project sudah bisa di-build sebelumnya.</i>
    `.trim();

    await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: getCancelKeyboard()
    });
}

/**
 * Handle ZIP file upload and build
 */
async function handleZipUpload(bot, chatId, filePath) {
    const session = global.sessions.get(chatId);
    if (!session || session.step !== 'zip_upload') return false;

    const { projectType, buildType } = session.data;

    if (!buildQueue.acquire(chatId, session.userUsername, 'zip')) {
        const currentBuild = buildQueue.getCurrentBuild();
        const waitTime = currentBuild ? Math.round(currentBuild.duration / 1000) : 0;
        const position = buildQueue.getQueuePosition(chatId);

        let message = `
╔═══════════════════════════════╗
     ⏳  <b>SERVER SEDANG SIBUK</b>  ⏳
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
🔨 Ada build yang sedang berjalan.
⏱️ Sudah berjalan: <b>${Math.floor(waitTime / 60)}m ${waitTime % 60}s</b>
`;

        if (position > 0) {
            message += `📋 Posisi antrian Anda: <b>#${position}</b>\n`;
        }

        message += `
━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 <i>Silakan coba lagi setelah build selesai.</i>
        `.trim();

        await bot.sendMessage(chatId, message, {
            parse_mode: 'HTML',
            reply_markup: getMainKeyboard()
        });

        await fs.remove(filePath).catch(() => { });
        global.sessions.delete(chatId);
        return true;
    }

    let currentProgress = 0;

    const statusMsg = await bot.sendMessage(chatId,
        formatZipBuildProgress(0, 'Memulai proses build...', projectType, buildType),
        { parse_mode: 'HTML' }
    );

    try {
        const result = await buildFromZip(
            filePath,
            projectType,
            buildType,
            (status) => {
                buildQueue.updateActivity();

                if (status.includes('Extracting')) currentProgress = 10;
                else if (status.includes('Cleaning')) currentProgress = 20;
                else if (status.includes('dependencies') || status.includes('Getting')) currentProgress = 35;
                else if (status.includes('Building') || status.includes('Gradle')) currentProgress = 60;
                else if (status.includes('Locating') || status.includes('APK')) currentProgress = 90;
                else currentProgress = Math.min(currentProgress + 5, 95);

                bot.editMessageText(
                    formatZipBuildProgress(currentProgress, status, projectType, buildType), {
                    chat_id: chatId,
                    message_id: statusMsg.message_id,
                    parse_mode: 'HTML'
                }).catch(() => { });
            }
        );

        if (result.success) {
            const typeName = projectType === 'flutter' ? 'Flutter' : 'Android';
            const buildName = buildType === 'release' ? 'Release' : 'Debug';

            const MAX_FILE_SIZE = 50 * 1024 * 1024;
            const apkStats = await fs.stat(result.apkPath);
            const fileSizeMB = (apkStats.size / (1024 * 1024)).toFixed(2);

            if (apkStats.size > MAX_FILE_SIZE) {
                await bot.editMessageText(`
⚠️ <b>APK Terlalu Besar!</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━

📱 <b>Type:</b> ${typeName}
🏷️ <b>Build:</b> ${buildName}
📦 <b>Ukuran:</b> ${fileSizeMB} MB

❌ <b>Error:</b> File APK melebihi batas Telegram (50MB).

💡 <b>Tips untuk memperkecil APK:</b>
• Gunakan <code>--split-per-abi</code> untuk Flutter
• Hapus assets yang tidak diperlukan
• Kompres gambar dalam project
                `.trim(), {
                    chat_id: chatId,
                    message_id: statusMsg.message_id,
                    parse_mode: 'HTML',
                    reply_markup: getMainKeyboard()
                });

                await fs.remove(result.apkPath).catch(() => { });
                await fs.remove(result.buildDir).catch(() => { });
                return true;
            }

            await bot.editMessageText(`
✅ <b>Build Berhasil!</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━

📱 <b>Type:</b> ${typeName}
🏷️ <b>Build:</b> ${buildName}
📦 <b>Ukuran:</b> ${fileSizeMB} MB

🎉 <i>Mengirim file APK...</i>
            `.trim(), {
                chat_id: chatId,
                message_id: statusMsg.message_id,
                parse_mode: 'HTML'
            });

            await bot.sendDocument(chatId, result.apkPath, {
                caption: `✅ <b>APK Build Success</b>\n\n📱 <b>Type:</b> ${typeName}\n🏷️ <b>Build:</b> ${buildName}\n📦 <b>Size:</b> ${fileSizeMB} MB\n\n<i>Generated by Web4APK Bot</i>`,
                parse_mode: 'HTML'
            });

            await fs.remove(result.apkPath).catch(() => { });
            await fs.remove(result.buildDir).catch(() => { });

            await bot.sendMessage(chatId, '🎉 APK berhasil di-build!\n\nIngin build lagi?', {
                reply_markup: getMainKeyboard()
            });
        } else {
            throw new Error(result.error);
        }

    } catch (error) {
        console.error('ZIP Build error:', error);
        await bot.editMessageText(formatErrorMessage(error.message), {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: 'HTML',
            reply_markup: getMainKeyboard()
        });
    } finally {
        const nextUser = buildQueue.release(chatId, true);
        if (nextUser) {
            bot.sendMessage(nextUser.chatId, '🎉 Giliran Anda! Memulai proses build...').catch(() => { });
        }
        global.sessions.delete(chatId);
    }
    return true;
}

module.exports = { handleCallback, handleZipUpload };