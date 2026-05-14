import os

path = 'styles.css'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('border-radius: 0px;', 'border-radius: 8px;')

body_orig = """body {
    background:
        radial-gradient(circle at top, rgba(91, 155, 240, 0.14), transparent 34%),
        var(--bg-color);"""

body_new = """body {
    background:
        radial-gradient(circle at top left, rgba(91, 155, 240, 0.16), transparent 45%),
        radial-gradient(circle at bottom right, rgba(160, 107, 245, 0.12), transparent 45%),
        var(--bg-color);"""

content = content.replace(body_orig, body_new)

card_orig = """    background-clip: padding-box;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.035));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);"""

card_new = """    background-clip: padding-box;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.025));
    backdrop-filter: blur(8px);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 4px 14px rgba(0, 0, 0, 0.15);"""

content = content.replace(card_orig, card_new)

tab_shell_orig = """    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 5px 8px;
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.04),
        0 2px 8px rgba(0, 0, 0, 0.12);
    width: 100%;
    backdrop-filter: blur(10px);"""

tab_shell_new = """    background: rgba(30, 30, 30, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 6px 8px;
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.08),
        0 6px 16px rgba(0, 0, 0, 0.2);
    width: 100%;
    backdrop-filter: blur(16px);"""

content = content.replace(tab_shell_orig, tab_shell_new)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("done")
