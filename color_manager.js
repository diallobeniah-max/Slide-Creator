// ═══════════════════════════════════════════════════════════════════════════
//  COLOR MANAGER  v2  —  batch scan · character-level text · layer mapping
// ═══════════════════════════════════════════════════════════════════════════

let colorManagerState = {
  // Each entry: { hex, r, g, b, layers: [{ id, name, kind, rangeIndex? }], count }
  foundColors: [],
  selectedHex: null,
  newH: 0, newS: 100, newB: 100,
};

// ─── Math helpers ───────────────────────────────────────────────────────────

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map(v => {
    const h = Math.round(Math.max(0, Math.min(255, v))).toString(16);
    return h.length === 1 ? "0" + h : h;
  }).join("");
}

function hexToRgb(hex) {
  let clean = hex.replace("#", "");
  if (clean.length === 3) clean = clean.split("").map(c => c + c).join("");
  const n = parseInt(clean, 16);
  if (isNaN(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsb(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s: max === 0 ? 0 : (d / max) * 100, b: max * 100 };
}

function hsbToRgb(h, s, b) {
  h /= 360; s /= 100; b /= 100;
  let r = 0, g = 0, bl = 0;
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = b * (1 - s), q = b * (1 - f * s), t = b * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r=b;  g=t;  bl=p; break; case 1: r=q;  g=b;  bl=p; break;
    case 2: r=p;  g=b;  bl=t; break; case 3: r=p;  g=q;  bl=b; break;
    case 4: r=t;  g=p;  bl=b; break; case 5: r=b;  g=p;  bl=q; break;
  }
  return { r: Math.round(r*255), g: Math.round(g*255), b: Math.round(bl*255) };
}

function colorsNear(hex1, hex2, tol) {
  tol = (tol === undefined) ? 4 : tol;
  const a = hexToRgb(hex1), b = hexToRgb(hex2);
  return Math.abs(a.r - b.r) <= tol && Math.abs(a.g - b.g) <= tol && Math.abs(a.b - b.b) <= tol;
}

// ─── Color Map registry ─────────────────────────────────────────────────────
// colorMap: hex → { r, g, b, layers: Set<string JSON> }
// We defer serialization to the end so we never iterate the map mid-mutation.

let _colorMap = {};

function _record(r, g, b, layerEntry) {
  const hex = rgbToHex(r, g, b);
  // Find an existing near-match to merge perceptually similar colors
  const key = Object.keys(_colorMap).find(k => colorsNear(k, hex)) || hex;
  if (!_colorMap[key]) _colorMap[key] = { r, g, b, layers: [] };
  // Store a compact entry; use JSON stringify for cheap dedup
  const sig = layerEntry.id + "|" + (layerEntry.rangeIndex !== undefined ? layerEntry.rangeIndex : "");
  if (!_colorMap[key]._sigs) _colorMap[key]._sigs = new Set();
  if (!_colorMap[key]._sigs.has(sig)) {
    _colorMap[key]._sigs.add(sig);
    _colorMap[key].layers.push(layerEntry);
  }
}

// ─── SCAN ───────────────────────────────────────────────────────────────────
// Strategy: collect all leaf-layer IDs in one fast DOM walk (no batchPlay),
// then fire ONE batched batchPlay call for all IDs at once.

async function scanAllColors() {
  const doc = app.activeDocument;
  if (!doc) { showError("Scan failed", new Error("No active document.")); return; }
  setStatus("Scanning…", "working");

  // 1. Fast DOM walk — zero batchPlay calls, just collect IDs + names
  const leafLayers = [];
  function collectLeaves(layers) {
    for (const layer of Array.from(layers || [])) {
      if (layer.isBackgroundLayer) continue;
      if (layer.layers && layer.layers.length > 0) {
        collectLeaves(layer.layers); // recurse into group
      } else {
        leafLayers.push({ id: layer.id, name: layer.name || "Layer" });
      }
    }
  }
  collectLeaves(doc.layers);

  if (leafLayers.length === 0) {
    setStatus("No layers found.", "error"); return;
  }

  // 2. Batch-fetch all layer descriptors in ONE batchPlay call
  _colorMap = {};
  try {
    await core.executeAsModal(async () => {
      // Build one multi-get batchPlay array (much faster than one-per-layer)
      const CHUNK = 30; // UXP limits very large batches; 30 is safe
      for (let i = 0; i < leafLayers.length; i += CHUNK) {
        const chunk = leafLayers.slice(i, i + CHUNK);
        const ops = chunk.map(l => ({
          _obj: "get",
          _target: [{ _ref: "layer", _id: l.id }, { _ref: "document", _enum: "ordinal", _value: "targetEnum" }],
          _options: { dialogOptions: "dontDisplay" }
        }));
        let results;
        try { results = await action.batchPlay(ops, { synchronousExecution: true }); }
        catch(_) { results = []; }

        for (let j = 0; j < chunk.length; j++) {
          const lr = results[j];
          if (!lr) continue;
          const { id, name } = chunk[j];

          // ── Character-level text color extraction ──
          // textStyleRange gives per-range colors (mixed-color text is fully supported)
          if (lr.textKey && lr.textKey.textStyleRange) {
            const ranges = lr.textKey.textStyleRange;
            for (let ri = 0; ri < ranges.length; ri++) {
              const ts = ranges[ri].textStyle;
              if (!ts || !ts.color) continue;
              const c = ts.color;
              const rr = Math.round(c.red   || 0);
              const rg = Math.round(c.green  || 0);
              const rb = Math.round(c.blue   || 0);
              _record(rr, rg, rb, { id, name, kind: "text", rangeIndex: ri });
            }
            continue; // text layer — no fill to check
          }

          // ── Solid color fill layer ──
          if (lr.adjustment && lr.adjustment[0] && lr.adjustment[0]._obj === "solidColorLayer") {
            const c = lr.adjustment[0].color;
            if (c) _record(Math.round(c.red||0), Math.round(c.green||0), Math.round(c.blue||0), { id, name, kind: "fill" });
            continue;
          }

          // ── Shape / vector fill ──
          if (lr.fillContents && lr.fillContents.color) {
            const c = lr.fillContents.color;
            _record(Math.round(c.red||0), Math.round(c.green||0), Math.round(c.blue||0), { id, name, kind: "shape" });
            continue;
          }

          // ── Layer effects solid fill ──
          if (lr.layerEffects && lr.layerEffects.solidFill) {
            const sf = lr.layerEffects.solidFill;
            const c = sf.color || (Array.isArray(sf) && sf[0] && sf[0].color);
            if (c) _record(Math.round(c.red||0), Math.round(c.green||0), Math.round(c.blue||0), { id, name, kind: "effect" });
          }
        }
      }
    }, { commandName: "Scan Colors" });

    // 3. Materialise state — done outside modal so no re-render inside modal
    colorManagerState.foundColors = Object.entries(_colorMap).map(([hex, v]) => ({
      hex, r: v.r, g: v.g, b: v.b,
      layers: v.layers,
      count: v.layers.length
    })).sort((a, b) => b.count - a.count);

    renderColorSwatches();
    setStatus("Found " + colorManagerState.foundColors.length + " color(s) across " + leafLayers.length + " layer(s)", "success");
  } catch(e) {
    showError("Scan failed", e);
  }
}

// ─── SWATCH RENDER ──────────────────────────────────────────────────────────
// Single DOM write using a DocumentFragment — zero reflows during build.

function renderColorSwatches() {
  const list = document.getElementById("color-swatch-list");
  if (!list) return;

  if (colorManagerState.foundColors.length === 0) {
    list.innerHTML = '<span class="no-layers-msg">No solid colors found in this document.</span>';
    return;
  }

  const frag = document.createDocumentFragment();

  for (const entry of colorManagerState.foundColors) {
    const row = document.createElement("div");
    row.className = "color-swatch-row" + (colorManagerState.selectedHex === entry.hex ? " selected" : "");
    row.dataset.hex = entry.hex;

    // Dot
    const dot = document.createElement("div");
    dot.className = "color-swatch-dot";
    dot.style.background = entry.hex;

    // Info column
    const info = document.createElement("div");
    info.className = "color-swatch-info";

    const hexSpan = document.createElement("span");
    hexSpan.className = "color-swatch-hex";
    hexSpan.textContent = entry.hex.toUpperCase();

    // Layer name pills — compact, max 3 shown
    const pillsWrap = document.createElement("div");
    pillsWrap.className = "color-layer-pills";
    const uniqueNames = [...new Set(entry.layers.map(l => l.name))];
    const shown = uniqueNames.slice(0, 3);
    const extra = uniqueNames.length - shown.length;
    for (const n of shown) {
      const pill = document.createElement("span");
      pill.className = "color-layer-pill";
      pill.textContent = n;
      pillsWrap.appendChild(pill);
    }
    if (extra > 0) {
      const more = document.createElement("span");
      more.className = "color-layer-pill color-layer-pill-more";
      more.textContent = "+" + extra + " more";
      pillsWrap.appendChild(more);
    }

    const countSpan = document.createElement("span");
    countSpan.className = "color-swatch-count";
    countSpan.textContent = entry.count + " instance" + (entry.count !== 1 ? "s" : "");

    info.appendChild(hexSpan);
    info.appendChild(pillsWrap);
    info.appendChild(countSpan);

    // Checkmark
    const icon = document.createElement("span");
    icon.className = "color-swatch-select-icon";
    icon.textContent = "✓";

    row.appendChild(dot);
    row.appendChild(info);
    row.appendChild(icon);

    row.addEventListener("click", () => selectSwatchColor(entry.hex));
    frag.appendChild(row);
  }

  // ONE DOM write
  list.innerHTML = "";
  list.appendChild(frag);
}

function selectSwatchColor(hex) {
  colorManagerState.selectedHex = hex;

  // Batch classList toggles without forcing separate reflows
  const rows = document.querySelectorAll(".color-swatch-row");
  for (const r of rows) r.classList.toggle("selected", r.dataset.hex === hex);

  const fromBox = document.getElementById("color-preview-from");
  if (fromBox) fromBox.style.background = hex;

  const rgb = hexToRgb(hex);
  const hsb = rgbToHsb(rgb.r, rgb.g, rgb.b);
  colorManagerState.newH = hsb.h;
  colorManagerState.newS = hsb.s;
  colorManagerState.newB = hsb.b;

  syncPickerFromHSB();

  const card = document.getElementById("color-editor-card");
  if (card) card.style.display = "";

  // Show which layers will be affected in the editor card header
  const entry = colorManagerState.foundColors.find(e => e.hex === hex);
  updateEditorLayerPills(entry ? entry.layers : []);
}

function updateEditorLayerPills(layerEntries) {
  let container = document.getElementById("color-editor-layer-pills");
  if (!container) return;
  const frag = document.createDocumentFragment();
  const names = [...new Set(layerEntries.map(l => l.name))];
  names.forEach(n => {
    const p = document.createElement("span");
    p.className = "color-layer-pill";
    p.textContent = n;
    frag.appendChild(p);
  });
  container.innerHTML = "";
  container.appendChild(frag);
}

// ─── COLOR WHEEL ────────────────────────────────────────────────────────────
// Drawn using ImageData — one putImageData call, no per-pixel fillRect.

function drawColorWheel() {
  const canvas = document.getElementById("color-wheel-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2, radius = W / 2;
  const bri = colorManagerState.newB;

  const img = ctx.createImageData(W, H);
  const data = img.data;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * W + x) * 4;
      if (dist > radius) {
        data[idx + 3] = 0; // transparent outside circle
        continue;
      }
      const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      const sat = (dist / radius) * 100;
      const rgb = hsbToRgb(angle, sat, bri);
      data[idx]     = rgb.r;
      data[idx + 1] = rgb.g;
      data[idx + 2] = rgb.b;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0); // single GPU upload
}

function updateWheelCursor() {
  const canvas = document.getElementById("color-wheel-canvas");
  const cursor = document.getElementById("color-wheel-cursor");
  if (!canvas || !cursor) return;
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2, radius = W / 2;
  const angle = colorManagerState.newH * Math.PI / 180;
  const dist = (colorManagerState.newS / 100) * radius;
  const px = cx + Math.cos(angle) * dist;
  const py = cy + Math.sin(angle) * dist;
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width / W, scaleY = rect.height / H;
  // Batch style writes
  const rgb = hsbToRgb(colorManagerState.newH, colorManagerState.newS, colorManagerState.newB);
  cursor.style.cssText = "left:" + (px * scaleX) + "px;top:" + (py * scaleY) + "px;background:rgb(" + rgb.r + "," + rgb.g + "," + rgb.b + ");";
}

// Debounce wheel re-draw so rapid dragging doesn't spam pixel loops
let _wheelRafId = null;
function scheduleWheelDraw() {
  if (_wheelRafId) return;
  _wheelRafId = requestAnimationFrame(() => {
    _wheelRafId = null;
    drawColorWheel();
    updateWheelCursor();
  });
}

function syncPickerFromHSB() {
  const { newH: h, newS: s, newB: b } = colorManagerState;
  const slH = document.getElementById("slider-h");
  const slS = document.getElementById("slider-s");
  const slB = document.getElementById("slider-b");
  const vH  = document.getElementById("val-h");
  const vS  = document.getElementById("val-s");
  const vB  = document.getElementById("val-b");
  if (slH) { slH.value = h; if (vH) vH.textContent = Math.round(h); }
  if (slS) { slS.value = s; if (vS) vS.textContent = Math.round(s); }
  if (slB) { slB.value = b; if (vB) vB.textContent = Math.round(b); }

  const rgb = hsbToRgb(h, s, b);
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
  const hexInput = document.getElementById("color-hex-input");
  if (hexInput) { hexInput.value = hex; hexInput.setAttribute("value", hex); }
  const toBox = document.getElementById("color-preview-to");
  if (toBox) toBox.style.background = hex;

  scheduleWheelDraw();
}

function pickFromWheel(e) {
  const canvas = document.getElementById("color-wheel-canvas");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dx = e.clientX - rect.left - rect.width / 2;
  const dy = e.clientY - rect.top  - rect.height / 2;
  const radius = rect.width / 2;
  const dist = Math.min(Math.sqrt(dx * dx + dy * dy), radius);
  colorManagerState.newH = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
  colorManagerState.newS = (dist / radius) * 100;
  syncPickerFromHSB();
}

function initColorWheel() {
  const canvas = document.getElementById("color-wheel-canvas");
  if (!canvas) return;

  let dragging = false;
  canvas.addEventListener("mousedown", e => { dragging = true; pickFromWheel(e); });
  canvas.addEventListener("mousemove", e => { if (dragging) pickFromWheel(e); });
  document.addEventListener("mouseup", () => { dragging = false; });

  function bindSlider(id, stateKey, valId) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
      colorManagerState[stateKey] = Number(el.value);
      const v = document.getElementById(valId);
      if (v) v.textContent = Math.round(colorManagerState[stateKey]);
      syncPickerFromHSB();
    });
  }
  bindSlider("slider-h", "newH", "val-h");
  bindSlider("slider-s", "newS", "val-s");
  bindSlider("slider-b", "newB", "val-b");

  function applyHexInput() {
    const hexInput = document.getElementById("color-hex-input");
    if (!hexInput) return;
    let val = (hexInput.value || "").trim();
    if (!val.startsWith("#")) val = "#" + val;
    const rgb = hexToRgb(val);
    const hsb = rgbToHsb(rgb.r, rgb.g, rgb.b);
    colorManagerState.newH = hsb.h;
    colorManagerState.newS = hsb.s;
    colorManagerState.newB = hsb.b;
    syncPickerFromHSB();
  }
  const hexInput = document.getElementById("color-hex-input");
  if (hexInput) {
    hexInput.addEventListener("change", applyHexInput);
    hexInput.addEventListener("blur",   applyHexInput);
  }
}

// ─── REPLACE ─────────────────────────────────────────────────────────────────
// Targets only the exact layers stored in the colorMap entry.
// All selects + sets are batched per-layer-type to minimise round-trips.

async function replaceColorGlobally() {
  const { selectedHex, newH, newS, newB } = colorManagerState;
  if (!selectedHex) {
    showError("Replace failed", new Error("Select a color from the list first.")); return;
  }
  const doc = app.activeDocument;
  if (!doc) { showError("Replace failed", new Error("No active document.")); return; }

  const entry = colorManagerState.foundColors.find(e => e.hex === selectedHex);
  if (!entry || entry.layers.length === 0) {
    showError("Replace failed", new Error("No layers mapped to this color.")); return;
  }

  const toRgb = hsbToRgb(newH, newS, newB);
  const toHex = rgbToHex(toRgb.r, toRgb.g, toRgb.b);
  setStatus("Replacing " + selectedHex.toUpperCase() + " → " + toHex.toUpperCase() + " across " + entry.layers.length + " instance(s)…", "working");

  const newColor = { _obj: "RGBColor", red: toRgb.r, green: toRgb.g, blue: toRgb.b };

  try {
    await core.executeAsModal(async () => {
      // Group by kind for efficient batching
      const textLayers   = entry.layers.filter(l => l.kind === "text");
      const fillLayers   = entry.layers.filter(l => l.kind === "fill");
      const shapeLayers  = entry.layers.filter(l => l.kind === "shape");

      // ── Text layers: select each, then set all-text color in one call ──
      for (const l of textLayers) {
        await action.batchPlay([
          { _obj: "select", _target: [{ _ref: "layer", _id: l.id }], makeVisible: false },
          // Select all characters
          { _obj: "set", _target: [{ _ref: "textLayer", _enum: "ordinal", _value: "targetEnum" }],
            to: { _obj: "textLayer",
                  textKey: { _obj: "textLayer",
                    textStyleRange: [{
                      _obj: "textStyleRange",
                      from: 0, to: 99999,
                      textStyle: { _obj: "textStyle", color: newColor }
                    }]
                  }
                }
          }
        ], { synchronousExecution: true });
      }

      // ── Solid fill layers: batch select + set ──
      for (const l of fillLayers) {
        await action.batchPlay([
          { _obj: "select", _target: [{ _ref: "layer", _id: l.id }], makeVisible: false },
          { _obj: "set",
            _target: [{ _ref: "contentLayer", _enum: "ordinal", _value: "targetEnum" }],
            to: { _obj: "solidColorLayer", color: newColor }
          }
        ], { synchronousExecution: true });
      }

      // ── Shape layers ──
      for (const l of shapeLayers) {
        await action.batchPlay([
          { _obj: "select", _target: [{ _ref: "layer", _id: l.id }], makeVisible: false },
          { _obj: "set",
            _target: [{ _ref: "contentLayer", _enum: "ordinal", _value: "targetEnum" }],
            to: { _obj: "shapeStyle",
                  fillContents: { _obj: "solidColorLayer", color: newColor }
                }
          }
        ], { synchronousExecution: true });
      }
    }, { commandName: "Replace Color Globally" });

    // Update state map without re-scanning
    colorManagerState.foundColors = colorManagerState.foundColors.map(e =>
      e.hex === selectedHex
        ? { ...e, hex: toHex, r: toRgb.r, g: toRgb.g, b: toRgb.b }
        : e
    );
    colorManagerState.selectedHex = toHex;
    renderColorSwatches();
    selectSwatchColor(toHex);
    setStatus("Done — replaced " + selectedHex.toUpperCase() + " with " + toHex.toUpperCase(), "success");
  } catch(e) {
    showError("Replace failed", e);
  }
}

// ─── INIT ────────────────────────────────────────────────────────────────────

function initColorManager() {
  // Guard: don't double-init
  if (window._colorManagerInited) return;
  window._colorManagerInited = true;

  const btnScan  = document.getElementById("btn-scan-colors");
  const btnApply = document.getElementById("btn-apply-color-replace");
  if (btnScan)  btnScan.addEventListener("click", scanAllColors);
  if (btnApply) btnApply.addEventListener("click", replaceColorGlobally);

  initColorWheel();
  drawColorWheel();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initColorManager);
} else {
  initColorManager();
}
