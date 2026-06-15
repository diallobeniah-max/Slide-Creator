# Slide Creator — Photoshop UXP Plugin

A full-featured Adobe Photoshop UXP panel for designing, managing, and exporting multi-slide layouts — perfect for Instagram carousels, presentations, and any tiled content.

---

## Features

### 🎨 Artboard Setup
- **Preset Sizes** — Pick from saved size presets or enter custom width × height values.
- **Custom Preset Manager** — Create, edit, and delete your own named presets (e.g. "YouTube Header 2560 × 1440"). Presets persist across Photoshop restarts.
- **Artboard Position** — Place new artboards to the Left, Right, Up, or Bottom of existing content.
- **Batch Creation** — Create multiple artboards at once and name them however you like.
- **Duplicate Artboard with Design** — Clone an existing artboard including all its layers.
- **Artboard from Canvas Size** — Generate a new artboard sized to match the current document canvas.

### 🖼️ Slide Setup & Export
- **Slide Dimensions** — Custom width/height or preset-based sizing for each slide.
- **Auto-Calculate** — Automatically determine slide dimensions from the current canvas and artboard layout.
- **Number of Slides** — Set how many slides the layout should produce.
- **Automatic Sharp Output (2×)** — Optional high-resolution export at double size for crisp results.
- **Guides** — Add vertical guide lines to visualise exact slide boundaries; clear them before final export.
- **Place Layers by Guides** — Choose visible layer rows, set their slide order, and fit them into the detected guide regions from the Tools align group.
- **Two-Step Export**
  1. **Crop Slides** — Split the current layout into separate slide documents.
  2. **Export All Slides** — Save every open slide document in JPG or PNG format with configurable quality (1-12) and custom filename prefix.
- **Delete Slides** — Selectively remove slide documents you no longer need before exporting.

### 📂 Layer Organization
- **Organize by Slides** — Automatically sorts layers into per-slide folders with matching label colours.
- **Layer Search** — Find any layer by name across the entire document.
- **Layer List** — Interactive, scrollable layer panel with multi-select, colour filtering, and a "Select All" toggle.
- **Group & Color** — Select layers, give them a group name and label colour in one click.
- **Auto-Color Selected** — Batch-apply label colours to the current selection.
- **Auto Name** — Sequentially rename selected layers (1, 2, 3 …).
- **Guide Layer Order** — Reorder selected picture layers before placing them into guide-defined slide regions.

### 🎨 Color Manager
- **Scan All Colors** — Detect every editable colour across text, shapes, fill layers, and common layer effects in the active document.
- **Color List** — Visual swatch grid of all found colours with layer-level detail.
- **Color Wheel + HSB Sliders** — Hue / Saturation / Brightness controls for precise colour picking.
- **Replace Color Globally** — Swap any colour across the entire document in one action, with live before/after preview and hex input.

### 📦 Asset Library (Vault)
- **Import Any File** — Add logos, icons, documents, or any asset type.
- **Save Selected Layers** — Snapshot the current Photoshop selection directly into the library.
- **Paste from Clipboard** — Drop PNG/JPG images straight from the clipboard.
- **Persistent Storage** — All assets survive Photoshop restarts.
- **Search & Browse** — Find saved assets by name with instant filtering.
- **Apply / Rename / Delete** — Place assets onto the canvas, rename them, or remove them — with multi-select support.

### 🛠️ Quick Actions (Header Bar)
- **Undo / Redo** — One-click history navigation.
- **Fit to Screen** — Zoom the canvas to fit the viewport (Ctrl + 0).

### ⏺️ Macros
- **Photoshop Actions List** — Browse recorded Photoshop Actions in a compact Macros tab.
- **Play / Edit / Delete** — Run an action, rename it with Save, or remove it from Photoshop.
- **Panel Order** — Move saved actions up or down in the plugin list for faster reuse.

---

## Installation

1. Open **Adobe Photoshop** (v23.0+).
2. Go to **Plugins → UXP Developer Tools** (or use Creative Cloud Desktop).
3. Click **Add Plugin** and load the plugin folder.
4. Open the panel from **Plugins → Slide Creator**.

---

## Requirements

- Adobe Photoshop **v23.0.0** or later
- UXP Manifest v5

---

## Project Structure

```
Slide Creator/
├── manifest.json        # UXP plugin manifest (v5)
├── index.html           # Plugin panel UI
├── main.js              # Core plugin logic
├── styles.css           # Panel styling
├── color_manager.js     # Color scanning & replacement engine
├── jszip.min.js         # ZIP support for batch export
├── icon_24.png          # Panel icon (1×)
├── icon_48.png          # Panel icon (2×)
└── icon.svg             # Source icon
```

---

## License

Private — all rights reserved.
