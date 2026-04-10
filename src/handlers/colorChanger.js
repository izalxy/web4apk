/**
 * Color Changer - Sistem Pengubah Warna Base Otomatis
 * Support: Hex, RGB, HSL, Nama Warna
 * Tanpa Error
 */

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

class ColorChanger {
    constructor() {
        this.supportedFormats = ['hex', 'rgb', 'hsl', 'name'];
        this.colorCache = new Map();
        this.basePath = null;
    }

    /**
     * Set base path untuk file yang akan diubah
     */
    setBasePath(basePath) {
        this.basePath = basePath;
        console.log(chalk.green(`✅ Base path set to: ${basePath}`));
    }

    /**
     * Parse warna dari berbagai format
     */
    parseColor(colorInput) {
        // Trim whitespace
        colorInput = colorInput.trim().toLowerCase();

        // Check if it's HEX
        if (colorInput.match(/^#?[0-9a-f]{6}$/i)) {
            let hex = colorInput.startsWith('#') ? colorInput : `#${colorInput}`;
            return { format: 'hex', value: hex, rgb: this.hexToRgb(hex) };
        }

        // Check if it's HEX 3 digit
        if (colorInput.match(/^#?[0-9a-f]{3}$/i)) {
            let hex = colorInput.startsWith('#') ? colorInput : `#${colorInput}`;
            let fullHex = '#' + hex[1].repeat(2) + hex[2].repeat(2) + hex[3].repeat(2);
            return { format: 'hex', value: fullHex, rgb: this.hexToRgb(fullHex) };
        }

        // Check if it's RGB
        let rgbMatch = colorInput.match(/^rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/i);
        if (rgbMatch) {
            let r = parseInt(rgbMatch[1]);
            let g = parseInt(rgbMatch[2]);
            let b = parseInt(rgbMatch[3]);
            return { format: 'rgb', value: `rgb(${r}, ${g}, ${b})`, rgb: { r, g, b }, hex: this.rgbToHex(r, g, b) };
        }

        // Check if it's HSL
        let hslMatch = colorInput.match(/^hsl\((\d{1,3}),\s*(\d{1,3})%,\s*(\d{1,3})%\)$/i);
        if (hslMatch) {
            let h = parseInt(hslMatch[1]);
            let s = parseInt(hslMatch[2]);
            let l = parseInt(hslMatch[3]);
            let rgb = this.hslToRgb(h, s, l);
            return { format: 'hsl', value: `hsl(${h}, ${s}%, ${l}%)`, rgb, hex: this.rgbToHex(rgb.r, rgb.g, rgb.b) };
        }

        // Check if it's color name
        const colorNames = this.getColorNames();
        if (colorNames[colorInput]) {
            let hex = colorNames[colorInput];
            return { format: 'name', value: colorInput, hex, rgb: this.hexToRgb(hex) };
        }

        return null;
    }

    /**
     * Convert HEX to RGB
     */
    hexToRgb(hex) {
        let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    /**
     * Convert RGB to HEX
     */
    rgbToHex(r, g, b) {
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    /**
     * Convert HSL to RGB
     */
    hslToRgb(h, s, l) {
        s /= 100;
        l /= 100;
        let c = (1 - Math.abs(2 * l - 1)) * s;
        let hp = h / 60;
        let x = c * (1 - Math.abs((hp % 2) - 1));
        let r1, g1, b1;

        if (hp <= 1) { r1 = c; g1 = x; b1 = 0; }
        else if (hp <= 2) { r1 = x; g1 = c; b1 = 0; }
        else if (hp <= 3) { r1 = 0; g1 = c; b1 = x; }
        else if (hp <= 4) { r1 = 0; g1 = x; b1 = c; }
        else if (hp <= 5) { r1 = x; g1 = 0; b1 = c; }
        else { r1 = c; g1 = 0; b1 = x; }

        let m = l - c / 2;
        return {
            r: Math.round((r1 + m) * 255),
            g: Math.round((g1 + m) * 255),
            b: Math.round((b1 + m) * 255)
        };
    }

    /**
     * Get color names mapping
     */
    getColorNames() {
        return {
            'red': '#ff0000',
            'green': '#00ff00',
            'blue': '#0000ff',
            'yellow': '#ffff00',
            'cyan': '#00ffff',
            'magenta': '#ff00ff',
            'black': '#000000',
            'white': '#ffffff',
            'gray': '#808080',
            'grey': '#808080',
            'orange': '#ffa500',
            'purple': '#800080',
            'pink': '#ffc0cb',
            'brown': '#a52a2a',
            'navy': '#000080',
            'teal': '#008080',
            'olive': '#808000',
            'maroon': '#800000',
            'coral': '#ff7f50',
            'gold': '#ffd700',
            'silver': '#c0c0c0',
            'indigo': '#4b0082',
            'violet': '#ee82ee',
            'lavender': '#e6e6fa',
            'beige': '#f5f5dc',
            'ivory': '#fffff0',
            'khaki': '#f0e68c'
        };
    }

    /**
     * Generate random color
     */
    randomColor() {
        let letters = '0123456789ABCDEF';
        let color = '#';
        for (let i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    }

    /**
     * Change color in CSS/HTML file
     */
    async changeColorInFile(filePath, oldColor, newColor, fileType = 'css') {
        try {
            if (!await fs.pathExists(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }

            let content = await fs.readFile(filePath, 'utf8');
            let changes = 0;

            if (fileType === 'css') {
                // Replace color in CSS
                const regex = new RegExp(oldColor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                const matches = content.match(regex);
                if (matches) {
                    content = content.replace(regex, newColor);
                    changes = matches.length;
                }
            } else if (fileType === 'html') {
                // Replace color in HTML (style attributes, inline styles)
                const regex = new RegExp(oldColor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                const matches = content.match(regex);
                if (matches) {
                    content = content.replace(regex, newColor);
                    changes = matches.length;
                }
            } else if (fileType === 'js') {
                // Replace color in JavaScript
                const regex = new RegExp(oldColor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                const matches = content.match(regex);
                if (matches) {
                    content = content.replace(regex, newColor);
                    changes = matches.length;
                }
            }

            if (changes > 0) {
                await fs.writeFile(filePath, content);
                console.log(chalk.green(`✅ Changed ${changes} occurrence(s) from ${oldColor} to ${newColor} in ${filePath}`));
            }

            return { success: true, changes, filePath };
        } catch (error) {
            console.error(chalk.red(`❌ Error changing color: ${error.message}`));
            return { success: false, error: error.message };
        }
    }

    /**
     * Auto detect and change color in multiple files
     */
    async autoChangeColor(directory, oldColor, newColor, fileExtensions = ['.css', '.html', '.js']) {
        let results = [];
        let totalChanges = 0;

        try {
            const files = await this.getAllFiles(directory, fileExtensions);
            
            for (const file of files) {
                const ext = path.extname(file).toLowerCase();
                let fileType = 'css';
                if (ext === '.html') fileType = 'html';
                else if (ext === '.js') fileType = 'js';
                
                const result = await this.changeColorInFile(file, oldColor, newColor, fileType);
                results.push(result);
                if (result.success) totalChanges += result.changes;
            }

            return { success: true, totalChanges, filesProcessed: results.length, results };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

// Create instance
const colorChanger = new ColorChanger();

/**
 * Handler untuk menerima base dan request color dari Telegram
 */
async function handleColorRequest(bot, msg, match) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];

    if (!input) {
        return bot.sendMessage(chatId, `
╔═══════════════════════════════╗
     🎨  <b>COLOR CHANGER</b>  🎨
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>Format yang didukung:</b>

• <b>HEX</b>: <code>#ff0000</code> atau <code>ff0000</code>
• <b>RGB</b>: <code>rgb(255,0,0)</code>
• <b>HSL</b>: <code>hsl(0,100%,50%)</code>
• <b>Nama</b>: <code>red</code>, <code>blue</code>, <code>green</code>

━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>Penggunaan:</b>
<code>/color old_color new_color</code>

<b>Contoh:</b>
<code>/color #ff0000 #00ff00</code>
<code>/color red blue</code>
<code>/color rgb(255,0,0) #00ff00</code>

━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>Bot akan otomatis mengubah warna di semua file base!</i>
        `.trim(), { parse_mode: 'HTML' });
    }

    const parts = input.split(' ');
    if (parts.length < 2) {
        return bot.sendMessage(chatId, '❌ Format salah! Gunakan: <code>/color old_color new_color</code>', { parse_mode: 'HTML' });
    }

    const oldColorInput = parts[0];
    const newColorInput = parts.slice(1).join(' ');

    // Parse colors
    const oldColor = colorChanger.parseColor(oldColorInput);
    const newColor = colorChanger.parseColor(newColorInput);

    if (!oldColor) {
        return bot.sendMessage(chatId, `❌ Warna lama tidak valid: <code>${oldColorInput}</code>`, { parse_mode: 'HTML' });
    }

    if (!newColor) {
        return bot.sendMessage(chatId, `❌ Warna baru tidak valid: <code>${newColorInput}</code>`, { parse_mode: 'HTML' });
    }

    // Send processing message
    const processingMsg = await bot.sendMessage(chatId, `
⏳ <b>Memproses perubahan warna...</b>

🔴 Old Color: <code>${oldColor.value}</code>
🟢 New Color: <code>${newColor.value}</code>

📂 Scanning files...
    `.trim(), { parse_mode: 'HTML' });

    // Get base directory (you can set this to your project root)
    const baseDir = path.join(__dirname, '..', 'android-template');
    
    if (!colorChanger.basePath) {
        colorChanger.setBasePath(baseDir);
    }

    // Perform color change
    const result = await colorChanger.autoChangeColor(baseDir, oldColor.value, newColor.value, ['.css', '.html', '.xml', '.java']);

    if (result.success && result.totalChanges > 0) {
        await bot.editMessageText(`
✅ <b>Perubahan Warna Berhasil!</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 Old Color: <code>${oldColor.value}</code>
🟢 New Color: <code>${newColor.value}</code>

📊 <b>Statistik:</b>
├➤ Files Processed: <code>${result.filesProcessed}</code>
└➤ Total Changes: <code>${result.totalChanges}</code>

✨ <i>Warna base telah diubah!</i>
        `.trim(), {
            chat_id: chatId,
            message_id: processingMsg.message_id,
            parse_mode: 'HTML'
        });
    } else if (result.success && result.totalChanges === 0) {
        await bot.editMessageText(`
⚠️ <b>Tidak Ada Perubahan</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 Old Color: <code>${oldColor.value}</code>
🟢 New Color: <code>${newColor.value}</code>

📂 Files Processed: <code>${result.filesProcessed}</code>

❓ <i>Warna lama tidak ditemukan di file manapun.</i>
        `.trim(), {
            chat_id: chatId,
            message_id: processingMsg.message_id,
            parse_mode: 'HTML'
        });
    } else {
        await bot.editMessageText(`
❌ <b>Perubahan Gagal!</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━

Error: <code>${result.error}</code>

💡 <i>Pastikan base directory sudah benar.</i>
        `.trim(), {
            chat_id: chatId,
            message_id: processingMsg.message_id,
            parse_mode: 'HTML'
        });
    }
}

/**
 * Handler untuk random color
 */
async function handleRandomColor(bot, chatId) {
    const randomHex = colorChanger.randomColor();
    const rgb = colorChanger.hexToRgb(randomHex);
    
    await bot.sendMessage(chatId, `
🎨 <b>Random Color Generated</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 <b>HEX:</b> <code>${randomHex}</code>
🟢 <b>RGB:</b> <code>rgb(${rgb.r}, ${rgb.g}, ${rgb.b})</code>

💡 Gunakan: <code>/color old_color ${randomHex}</code>
    `.trim(), { parse_mode: 'HTML' });
}

/**
 * Handler untuk list warna yang tersedia
 */
async function handleColorList(bot, chatId) {
    const colors = colorChanger.getColorNames();
    let colorList = '🎨 <b>Color Names Available</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    const colorEntries = Object.entries(colors);
    for (let i = 0; i < colorEntries.length; i += 4) {
        const chunk = colorEntries.slice(i, i + 4);
        colorList += chunk.map(([name, hex]) => `• <code>${name}</code> → ${hex}`).join('\n') + '\n';
    }
    
    await bot.sendMessage(chatId, colorList, { parse_mode: 'HTML' });
}

module.exports = { 
    colorChanger, 
    handleColorRequest, 
    handleRandomColor, 
    handleColorList 
};