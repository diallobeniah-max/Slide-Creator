const fs = require('fs');
const css = `
.hidden { display: none !important; }
.tab-btn { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: #ccc; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; transition: all 0.2s; }
.tab-btn:hover { background: rgba(255, 255, 255, 0.1); }
.tab-btn.active { background: #444 !important; border-color: #666; color: #fff; box-shadow: inset 0 0 5px rgba(0,0,0,0.2); }
`;
fs.appendFileSync('styles.css', css, 'utf8');
console.log('Appended styles');
