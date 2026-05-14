const fs = require('fs');
let css = fs.readFileSync('styles.css', 'utf8');
const toInject = `    --spectrum-global-color-blue-100: #e0e0e0;
    --spectrum-global-color-blue-200: #c2c2c2;
    --spectrum-global-color-blue-300: #a3a3a3;
    --spectrum-global-color-blue-400: #858585;
    --spectrum-global-color-blue-500: #666666;
    --spectrum-global-color-blue-600: #4d4d4d;
    --spectrum-global-color-blue-700: #333333;
    --spectrum-global-color-blue-800: #1a1a1a;
    --spectrum-global-color-blue-900: #000000;
`;
if (!css.includes('--spectrum-global-color-blue-100')) {
    css = css.replace(':root {', ':root {\n' + toInject);
    fs.writeFileSync('styles.css', css, 'utf8');
}
let mainjs = fs.readFileSync('main.js', 'utf8');
const jsToInject = `
// Force sp-dropdown menus to always scroll to top when opened
document.addEventListener('sp-opened', (e) => {
    if (e.target && e.target.tagName === 'SP-DROPDOWN') {
        setTimeout(() => {
            const menu = e.target.querySelector('sp-menu');
            if (menu) {
                menu.scrollTop = 0;
            }
        }, 10);
    }
});
`;
if (!mainjs.includes('Force sp-dropdown menus to always scroll to top')) {
    mainjs += jsToInject;
    fs.writeFileSync('main.js', mainjs, 'utf8');
}
console.log('Done injections');
