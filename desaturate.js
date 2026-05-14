const fs = require('fs');

let css = fs.readFileSync('styles.css', 'utf8');

function hexToRgb(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
    }
    const num = parseInt(hex, 16);
    return [num >> 16, (num >> 8) & 255, num & 255];
}

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function shouldDesaturate(r, g, b) {
    // If it's already perfectly gray, don't touch it
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max > min + 5; 
}

function desaturate(r, g, b) {
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Bump up brightness slightly for visibility in dark mode, since pure luminance of dark colors can be too dark
    let v = Math.round(luma);
    if (v < 120 && (r > 150 || g > 150 || b > 150)) {
        v = Math.min(255, v + 40); // Boost bright colors that have low luminance (like blue/red)
    }
    return [v, v, v];
}

css = css.replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)((\s*,\s*[\d.]+)?)\s*\)/g, (match, rStr, gStr, bStr, alphaStr) => {
    let r = parseInt(rStr);
    let g = parseInt(gStr);
    let b = parseInt(bStr);
    if (shouldDesaturate(r, g, b)) {
        const [nr, ng, nb] = desaturate(r, g, b);
        if (alphaStr) {
            return `rgba(${nr}, ${ng}, ${nb}${alphaStr})`;
        } else {
            return `rgb(${nr}, ${ng}, ${nb})`;
        }
    }
    return match;
});

css = css.replace(/#([a-fA-F0-9]{3}|[a-fA-F0-9]{6})\b/gi, (match, hex) => {
    const [r, g, b] = hexToRgb(match);
    if (shouldDesaturate(r, g, b)) {
        const [nr, ng, nb] = desaturate(r, g, b);
        return rgbToHex(nr, ng, nb);
    }
    return match;
});

fs.writeFileSync('styles.css', css, 'utf8');
console.log('done monochrome');
