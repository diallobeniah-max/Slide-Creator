const fs = require('fs');

let mainjs = fs.readFileSync('main.js', 'utf8');

// First, remove the old listener if it exists
mainjs = mainjs.replace(/\/\/ Force sp-dropdown menus to always scroll to top when opened[\s\S]*?\}\);/g, '');

const newListener = `
// Force sp-dropdown menus to always scroll to top when opened
document.addEventListener('sp-opened', (e) => {
    if (e.target && e.target.tagName === 'SP-DROPDOWN') {
        setTimeout(() => {
            const menu = e.target.querySelector('sp-menu');
            if (menu) {
                menu.scrollTop = 0;
                
                // Inject style directly into the sp-menu's shadowRoot if it exists
                if (menu.shadowRoot && !menu.shadowRoot.querySelector('#injected-scroll-style-menu')) {
                    const style = document.createElement('style');
                    style.id = 'injected-scroll-style-menu';
                    style.textContent = \`
                        ::-webkit-scrollbar { width: 4px !important; }
                        ::-webkit-scrollbar-button { display: none !important; width: 0 !important; height: 0 !important; }
                        ::-webkit-scrollbar-thumb { border-radius: 4px !important; background: rgba(128,128,128,0.5) !important; }
                        *::-webkit-scrollbar { width: 4px !important; }
                        *::-webkit-scrollbar-button { display: none !important; }
                    \`;
                    menu.shadowRoot.appendChild(style);
                }
            }
            
            // Also inject into the popover wrapper if that exists
            const popover = e.target.shadowRoot ? e.target.shadowRoot.querySelector("sp-popover") : null;
            if (popover && popover.shadowRoot && !popover.shadowRoot.querySelector('#injected-scroll-style-popover')) {
                const style = document.createElement('style');
                style.id = 'injected-scroll-style-popover';
                style.textContent = \`
                    ::-webkit-scrollbar { width: 4px !important; }
                    ::-webkit-scrollbar-button { display: none !important; width: 0 !important; height: 0 !important; }
                    ::-webkit-scrollbar-thumb { border-radius: 4px !important; background: rgba(128,128,128,0.5) !important; }
                    *::-webkit-scrollbar { width: 4px !important; }
                    *::-webkit-scrollbar-button { display: none !important; }
                \`;
                popover.shadowRoot.appendChild(style);
            }
        }, 10);
    }
});
`;

mainjs += newListener;
fs.writeFileSync('main.js', mainjs, 'utf8');
console.log('injected shadow dom styles');
