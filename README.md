# Instagram Slide Creator - Photoshop Plugin

## What it does
Creates a wide canvas split into N Instagram slides, adds visual guide lines at each slide boundary, then exports each slide as its own JPG or PNG file automatically.

## How to use

### Step 1 - Artboard Setup
- Choose the number and size of the artboards you want.
- Click **Create Artboard** to add those artboards inside the current Photoshop document.
- Use **Duplicate Artboard with Design** when you want to repeat an existing artboard and keep its design.
- Use **Artboard from Layer Size** when you want the new artboard size to match the selected layer bounds.

### Step 2 - Design Your Poster
Design across the wide canvas. Each segment becomes one Instagram slide.

### Step 3 - Guides
Click **Add Guides** to draw vertical lines showing exactly where each slide splits.
Click **Clear Guides** to remove them before exporting.

### Step 4 - Export
- Choose **Format** (JPG or PNG).
- Set **JPG Quality**.
- Set a filename prefix such as `slide`.
- Click **Export All Slides** and pick a folder to save the generated files.

## Installation
1. Open Photoshop.
2. Go to Plugins > UXP Developer Tools (or Creative Cloud Desktop).
3. Load the plugin folder: `InstagramSlideCreator/`.
4. Open the panel from Plugins > Instagram Slide Creator.
