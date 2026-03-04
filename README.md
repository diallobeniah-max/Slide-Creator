# Instagram Slide Creator — Photoshop Plugin

## What it does
Creates a wide canvas split into N Instagram slides, adds visual guide lines at each slide boundary, then exports each slide as its own JPG or PNG file automatically.

## How to use

### Step 1 — Canvas Setup
- **Slides**: How many slides (e.g. 6 for a 6-part carousel)
- **Aspect Ratio W / H**: e.g. 5/5 = square (1:1), 4/5 = portrait, 16/9 = landscape
- **Slide Width (px)**: Width of each individual slide (e.g. 1080 for Instagram)
- Click **Create Canvas** → a new document opens sized `slideWidth × slideCount` wide

### Step 2 — Design Your Poster
Design across the full wide canvas. Each segment = one Instagram slide.

### Step 3 — Guides
Click **Add Guides** to draw vertical lines showing exactly where each slide splits.
Click **Clear Guides** to remove them before exporting.

### Step 4 — Export
- Choose **Format** (JPG or PNG)
- Set **JPG Quality** (1–100)
- Set a **Prefix** for filenames (e.g. "slide" → slide_01.jpg, slide_02.jpg…)
- Click **Export All Slides** → pick a folder → each slide exports automatically

## Installation
1. Open Photoshop
2. Go to Plugins → UXP Developer Tools (or Creative Cloud Desktop)
3. Load the plugin folder: `InstagramSlideCreator/`
4. The panel appears under Plugins → Instagram Slide Creator
