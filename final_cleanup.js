const fs = require('fs');
let content = fs.readFileSync('main.js', 'utf8');
const garbage = `    setStatus(\`Exported "\${safeName}.jpg"\`, "success");
  } catch (e) {
    showError("JPG export failed", e);
  }
}`;
content = content.replace(garbage, '');
fs.writeFileSync('main.js', content, 'utf8');
console.log('Final cleanup done');
