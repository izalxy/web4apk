/**
 * Generate inline keyboards for bot
 * Style yang didukung Telegram: "primary" (biru) dan "danger" (merah)
 */

// Helper function untuk membuat button dengan style
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

// Main menu keyboard
function getMainKeyboard() {
    return {
        inline_keyboard: [
            [createButton('📱 BUAT APLIKASI (URL)', 'create_apk', null, "primary")],
            [createButton('🎨 UBAH WARNA BASE', 'color_menu', null, "primary")],
            [createButton('📦 BUILD DARI ZIP', 'build_zip', null, "primary")],
            [createButton('📊 Status Server', 'server_status', null, "primary"), createButton('❓ Bantuan', 'help', null, "primary")],
            [createButton('👤 Owner', null, 'https://t.me/Izalmodz', "primary"), createButton('📢 Channel', null, 'https://t.me/AboutIzalll', "primary")]
        ]
    };
}

// Color menu keyboard
function getColorMenuKeyboard() {
    return {
        inline_keyboard: [
            [createButton('🎨 Ganti Warna Manual', 'color_manual', null, "primary")],
            [createButton('🎲 Random Color', 'color_random', null, "primary")],
            [createButton('📋 Daftar Warna', 'color_list', null, "primary")],
            [createButton('◀️ Kembali ke Menu', 'back_main', null, "danger")]
        ]
    };
}

// Color selection keyboard (untuk pilih warna dari preset)
function getColorPresetKeyboard() {
    return {
        inline_keyboard: [
            [createButton('🔴 Merah', 'color_red', null, "danger"), createButton('🔵 Biru', 'color_blue', null, "primary"), createButton('🟢 Hijau', 'color_green', null, "primary")],
            [createButton('🟣 Ungu', 'color_purple', null, "primary"), createButton('🟠 Oranye', 'color_orange', null, "primary"), createButton('🔷 Cyan', 'color_cyan', null, "primary")],
            [createButton('💗 Pink', 'color_pink', null, "primary"), createButton('🟤 Coklat', 'color_brown', null, "primary"), createButton('⚫ Hitam', 'color_black', null, "danger")],
            [createButton('⬜ Putih', 'color_white', null, "primary"), createButton('🩶 Abu-abu', 'color_gray', null, "primary"), createButton('🟡 Kuning', 'color_yellow', null, "primary")],
            [createButton('◀️ Kembali', 'color_menu', null, "danger")]
        ]
    };
}

// Color selection keyboard (untuk pilih warna tema aplikasi)
function getColorKeyboard() {
    return {
        inline_keyboard: [
            [createButton('🔵 Biru', 'color_blue', null, "primary"), createButton('🔴 Merah', 'color_red', null, "danger"), createButton('🟢 Hijau', 'color_green', null, "primary")],
            [createButton('🟣 Ungu', 'color_purple', null, "primary"), createButton('🟠 Oranye', 'color_orange', null, "primary"), createButton('🔵 Teal', 'color_teal', null, "primary")],
            [createButton('💗 Pink', 'color_pink', null, "primary"), createButton('🔵 Indigo', 'color_indigo', null, "primary")],
            [createButton('❌ Batal', 'cancel', null, "danger")]
        ]
    };
}

// Confirmation keyboard
function getConfirmKeyboard() {
    return {
        inline_keyboard: [
            [createButton('✅ Buat APK', 'confirm_build', null, "primary")],
            [createButton('❌ Batal', 'cancel', null, "danger")]
        ]
    };
}

// Cancel keyboard
function getCancelKeyboard() {
    return {
        inline_keyboard: [
            [createButton('❌ Batal', 'cancel', null, "danger")]
        ]
    };
}

// Icon upload keyboard
function getIconKeyboard() {
    return {
        inline_keyboard: [
            [createButton('⏭️ Lewati (Gunakan Default)', 'skip_icon', null, "primary")],
            [createButton('❌ Batal', 'cancel', null, "danger")]
        ]
    };
}

// ZIP project type keyboard
function getZipTypeKeyboard() {
    return {
        inline_keyboard: [
            [createButton('🤖 Android Studio / Gradle', 'zip_android', null, "primary"), createButton('💙 Flutter Project', 'zip_flutter', null, "primary")],
            [createButton('❌ Batal', 'cancel', null, "danger")]
        ]
    };
}

// ZIP build type keyboard (debug/release)
function getZipBuildTypeKeyboard() {
    return {
        inline_keyboard: [
            [createButton('🐛 Debug APK (Fast)', 'zipbuild_debug', null, "primary"), createButton('🚀 Release APK', 'zipbuild_release', null, "primary")],
            [createButton('❌ Batal', 'cancel', null, "danger")]
        ]
    };
}

// Color value mapping
const colorValues = {
    color_red: '#ff0000',
    color_blue: '#0000ff',
    color_green: '#00ff00',
    color_purple: '#800080',
    color_orange: '#ffa500',
    color_teal: '#008080',
    color_pink: '#ffc0cb',
    color_indigo: '#4b0082',
    color_cyan: '#00ffff',
    color_brown: '#a52a2a',
    color_black: '#000000',
    color_white: '#ffffff',
    color_gray: '#808080',
    color_yellow: '#ffff00'
};

// Get hex value from color callback data
function getColorValue(callbackData) {
    return colorValues[callbackData] || null;
}

module.exports = {
    createButton,
    getMainKeyboard,
    getColorMenuKeyboard,
    getColorPresetKeyboard,
    getColorKeyboard,
    getConfirmKeyboard,
    getCancelKeyboard,
    getIconKeyboard,
    getZipTypeKeyboard,
    getZipBuildTypeKeyboard,
    getColorValue,
    colorValues
};