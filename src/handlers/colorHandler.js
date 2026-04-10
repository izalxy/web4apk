/**
 * Color Handler - Integrasi dengan bot Telegram
 * Tambahkan ini ke file handler Anda
 */

const { colorChanger, handleColorRequest, handleRandomColor, handleColorList } = require('../utils/colorChanger');

/**
 * Setup color commands untuk bot
 * @param {TelegramBot} bot - Instance bot Telegram
 */
function setupColorCommands(bot) {
    // Command untuk mengubah warna
    bot.onText(/\/color(?:\s+(.+))?/, (msg, match) => {
        handleColorRequest(bot, msg, match);
    });

    // Command untuk random color
    bot.onText(/\/randomcolor/, (msg) => {
        handleRandomColor(bot, msg.chat.id);
    });

    // Command untuk list warna
    bot.onText(/\/colorlist/, (msg) => {
        handleColorList(bot, msg.chat.id);
    });

    // Command untuk set base path
    bot.onText(/\/setbasepath(?:\s+(.+))?/, (msg, match) => {
        const chatId = msg.chat.id;
        const path = match[1];
        
        if (!path) {
            return bot.sendMessage(chatId, '❌ Gunakan: <code>/setbasepath /path/to/base</code>', { parse_mode: 'HTML' });
        }
        
        colorChanger.setBasePath(path);
        bot.sendMessage(chatId, `✅ Base path set to: <code>${path}</code>`, { parse_mode: 'HTML' });
    });

    console.log('🎨 Color commands registered');
}

module.exports = { setupColorCommands };