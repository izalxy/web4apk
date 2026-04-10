/**
 * Color Preview - Menampilkan preview warna
 */

/**
 * Generate color preview card
 */
function generateColorPreview(hexColor) {
    const rgb = hexToRgb(hexColor);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    
    return `
╔═══════════════════════════════╗
║        🎨 COLOR PREVIEW       ║
╚═══════════════════════════════╝

┌─ <b>Preview</b>
│
├─ <code>${hexColor}</code>
│
├─ <b>RGB:</b> rgb(${rgb.r}, ${rgb.g}, ${rgb.b})
├─ <b>HSL:</b> hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)
│
└─ <b>Complement:</b> ${getComplementColor(hexColor)}
    `.trim();
}

function hexToRgb(hex) {
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100)
    };
}

function getComplementColor(hex) {
    const rgb = hexToRgb(hex);
    const complement = {
        r: 255 - rgb.r,
        g: 255 - rgb.g,
        b: 255 - rgb.b
    };
    return rgbToHex(complement.r, complement.g, complement.b);
}

function rgbToHex(r, g, b) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

module.exports = { generateColorPreview };