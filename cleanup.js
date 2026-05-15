const fs = require('fs');
let lines = fs.readFileSync('styles.css', 'utf8').split(/\r?\n/);
// lines are 0-indexed in array, so 3410-3412 (1-indexed) are 3409, 3410, 3411
// But I need to be sure about the content.
// Let's just filter out the exact garbage.
let newLines = [];
let skip = 0;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('gap: 10px;') && lines[i+1] && lines[i+1].includes('margin-top: 12px;') && lines[i+2] === '}' && lines[i-1] === '}') {
        i += 2; // skip these 3 lines
        continue;
    }
    newLines.push(lines[i]);
}
fs.writeFileSync('styles.css', newLines.join('\n'), 'utf8');
console.log('Cleanup done');
