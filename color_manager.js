// Color Manager
// Optimized scan, mixed-text support, larger labels, no hex in the list.

let colorManagerState = {
  foundColors: [],
  selectedHex: null,
  newH: 0,
  newS: 100,
  newB: 100,
  smartObjectCount: 0,
  wheelFrame: null,
  wheelDragging: false,
  wheelImageKey: null,
  wheelForceRedraw: true,
};

let colorBucketMap = new Map();
let _colorMap = {};

function normalizeHex(hex) {
  if (!hex) return null;
  let clean = String(hex).trim().replace(/^#/, "");
  if (!clean) return null;
  if (clean.length === 3) clean = clean.split("").map((char) => char + char).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return "#" + clean.toLowerCase();
}

function rgbToHex(r, g, b) {
  return normalizeHex(
    [r, g, b]
      .map((value) => {
        const hex = Math.round(Math.max(0, Math.min(255, value))).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("")
  );
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) return { r: 0, g: 0, b: 0 };
  const value = parseInt(normalized.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHsb(r, g, b) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    switch (max) {
      case red:
        hue = ((green - blue) / delta + (green < blue ? 6 : 0)) / 6;
        break;
      case green:
        hue = ((blue - red) / delta + 2) / 6;
        break;
      default:
        hue = ((red - green) / delta + 4) / 6;
        break;
    }
  }

  return {
    h: hue * 360,
    s: max === 0 ? 0 : (delta / max) * 100,
    b: max * 100,
  };
}

function hsbToRgb(h, s, b) {
  const hue = ((Number(h) % 360) + 360) % 360 / 360;
  const sat = Math.max(0, Math.min(100, Number(s))) / 100;
  const bri = Math.max(0, Math.min(100, Number(b))) / 100;

  let red = 0;
  let green = 0;
  let blue = 0;

  const i = Math.floor(hue * 6);
  const f = hue * 6 - i;
  const p = bri * (1 - sat);
  const q = bri * (1 - f * sat);
  const t = bri * (1 - (1 - f) * sat);

  switch (i % 6) {
    case 0:
      red = bri; green = t; blue = p;
      break;
    case 1:
      red = q; green = bri; blue = p;
      break;
    case 2:
      red = p; green = bri; blue = t;
      break;
    case 3:
      red = p; green = q; blue = bri;
      break;
    case 4:
      red = t; green = p; blue = bri;
      break;
    default:
      red = bri; green = p; blue = q;
      break;
  }

  return {
    r: Math.round(red * 255),
    g: Math.round(green * 255),
    b: Math.round(blue * 255),
  };
}

function getColorChannels(color) {
  if (!color) return null;
  const red = Number(color.red && color.red._value !== undefined ? color.red._value : color.red);
  const green = Number(color.green && color.green._value !== undefined ? color.green._value : color.green);
  const blue = Number(color.blue && color.blue._value !== undefined ? color.blue._value : color.blue);
  if (![red, green, blue].every(Number.isFinite)) return null;
  return {
    red: Math.round(red),
    green: Math.round(green),
    blue: Math.round(blue),
  };
}

function colorToHex(color) {
  const channels = getColorChannels(color);
  if (!channels) return null;
  return rgbToHex(channels.red, channels.green, channels.blue);
}

function colorsNear(hex1, hex2, tolerance) {
  const tol = tolerance === undefined ? 4 : tolerance;
  const left = hexToRgb(hex1);
  const right = hexToRgb(hex2);
  return (
    Math.abs(left.r - right.r) <= tol &&
    Math.abs(left.g - right.g) <= tol &&
    Math.abs(left.b - right.b) <= tol
  );
}

function setScanNote(message) {
  const note = document.getElementById("color-scan-note");
  if (!note) return;
  const hasMessage = !!message;
  note.textContent = hasMessage ? message : "";
  note.classList.toggle("hidden", !hasMessage);
}

function setSourcePreview(hex) {
  const preview = document.getElementById("color-source-preview");
  const fromBox = document.getElementById("color-preview-from");
  const previewColor = normalizeHex(hex) || "rgba(255,255,255,0.06)";

  if (preview) preview.style.background = previewColor;
  if (fromBox) fromBox.style.background = previewColor;
}

function setTargetPreview(hex) {
  const toBox = document.getElementById("color-preview-to");
  if (toBox) toBox.style.background = normalizeHex(hex) || "transparent";
}

function updateSliderValues() {
  const values = {
    h: Math.round(colorManagerState.newH),
    s: Math.round(colorManagerState.newS),
    b: Math.round(colorManagerState.newB),
  };

  ["h", "s", "b"].forEach((key) => {
    const slider = document.getElementById("slider-" + key);
    const label = document.getElementById("val-" + key);
    if (slider) slider.value = values[key];
    if (label) label.textContent = String(values[key]);
  });
}

function recordColor(color, layerEntry) {
  const hex = colorToHex(color);
  if (!hex) return;

  if (!colorBucketMap.has(hex)) {
    colorBucketMap.set(hex, { hex, layers: [], seen: new Set() });
  }

  const bucket = colorBucketMap.get(hex);
  const signature = [
    layerEntry.id,
    layerEntry.kind || "",
    layerEntry.path || "",
    layerEntry.rangeIndex !== undefined ? layerEntry.rangeIndex : "",
  ].join("|");

  if (bucket.seen.has(signature)) return;
  bucket.seen.add(signature);
  bucket.layers.push({ ...layerEntry, sourceHex: hex });
}

function recordRawColor(red, green, blue, layerEntry) {
  const hex = rgbToHex(red, green, blue);
  const key = Object.keys(_colorMap).find((existing) => colorsNear(existing, hex)) || hex;
  if (!_colorMap[key]) _colorMap[key] = { r: red, g: green, b: blue, layers: [] };
  const signature = layerEntry.id + "|" + (layerEntry.rangeIndex !== undefined ? layerEntry.rangeIndex : "");
  if (!_colorMap[key]._sigs) _colorMap[key]._sigs = new Set();
  if (_colorMap[key]._sigs.has(signature)) return;
  _colorMap[key]._sigs.add(signature);
  _colorMap[key].layers.push(layerEntry);
}

function collectLeafLayers(layers, result) {
  for (const layer of Array.from(layers || [])) {
    if (layer.isBackgroundLayer) continue;
    if (layer.layers && layer.layers.length > 0) {
      collectLeafLayers(layer.layers, result);
      continue;
    }

    const layerKind = String(layer.kind || "").toLowerCase();

    result.push({
      id: layer.id,
      name: layer.name || "Layer",
      layerKind,
    });
  }
}

async function fetchLayerDescriptors(layerEntries) {
  const descriptorsById = new Map();
  const chunkSize = 30;

  for (let index = 0; index < layerEntries.length; index += chunkSize) {
    const chunk = layerEntries.slice(index, index + chunkSize);
    const commands = chunk.map((entry) => ({
      _obj: "multiGet",
      _target: {
        _ref: [
          { _ref: "layer", _id: entry.id },
          { _ref: "document", _enum: "ordinal", _value: "targetEnum" },
        ],
      },
      extendedReference: [[
        "name",
        "textKey",
        "textStyleRange",
        "textStyle",
        "adjustment",
        "fillContents",
        "layerEffects",
        "smartObject",
        "smartObjectMore",
      ]],
      options: {
        failOnMissingProperty: false,
        failOnMissingElement: false,
      },
    }));

    let results = [];
    try {
      results = await action.batchPlay(commands, {
        continueOnError: true,
        synchronousExecution: true,
      });
    } catch (_) {
      results = [];
    }

    results.forEach((descriptor, resultIndex) => {
      if (!descriptor || descriptor._obj === "error") return;
      descriptorsById.set(chunk[resultIndex].id, descriptor);
    });
  }

  return descriptorsById;
}

function getTextStyleRanges(descriptor) {
  const textKey = descriptor && descriptor.textKey;
  const textKeyRanges = Array.isArray(textKey && textKey.textStyleRange) ? textKey.textStyleRange : [];
  if (textKeyRanges.length > 0) {
    return { textKey, ranges: textKeyRanges, path: "textKey.textStyleRange" };
  }

  const rootRanges = Array.isArray(descriptor && descriptor.textStyleRange) ? descriptor.textStyleRange : [];
  if (rootRanges.length > 0) {
    return { textKey, ranges: rootRanges, path: "textStyleRange" };
  }

  return { textKey, ranges: [], path: "textKey.textStyleRange" };
}

function cloneDescriptorValue(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function getFallbackTextStyle(descriptor) {
  return (descriptor && descriptor.textKey && descriptor.textKey.textStyle) ||
    (descriptor && descriptor.textStyle) ||
    null;
}

function getResolvedTextColor(range, fallbackStyle) {
  if (range && range.textStyle && range.textStyle.color) return range.textStyle.color;
  return fallbackStyle && fallbackStyle.color ? fallbackStyle.color : null;
}

function extractTextColors(layerEntry, descriptor) {
  const { textKey, ranges, path } = getTextStyleRanges(descriptor);
  const fallbackStyle = getFallbackTextStyle(descriptor);

  if (ranges.length === 0 && fallbackStyle && fallbackStyle.color) {
    recordColor(fallbackStyle.color, {
      id: layerEntry.id,
      name: layerEntry.name,
      kind: "text",
      path: "textKey.textStyle.color",
      rangeIndex: 0,
    });
    return;
  }

  ranges.forEach((range, rangeIndex) => {
    const resolvedColor = getResolvedTextColor(range, fallbackStyle);
    if (!resolvedColor) return;
    recordColor(resolvedColor, {
      id: layerEntry.id,
      name: layerEntry.name,
      kind: "text",
      path,
      rangeIndex,
      from: range.from,
      to: range.to,
      inherited: !(range && range.textStyle && range.textStyle.color),
    });
  });
}

function extractSolidColorLayer(layerEntry, descriptor) {
  const adjustments = Array.isArray(descriptor && descriptor.adjustment) ? descriptor.adjustment : [];
  adjustments.forEach((adjustment, adjustmentIndex) => {
    if (!adjustment || adjustment._obj !== "solidColorLayer" || !adjustment.color) return;
    recordColor(adjustment.color, {
      id: layerEntry.id,
      name: layerEntry.name,
      kind: "fill",
      path: "adjustment." + adjustmentIndex + ".color",
    });
  });
}

function extractShapeFill(layerEntry, descriptor) {
  if (!descriptor || !descriptor.fillContents || !descriptor.fillContents.color) return;
  recordColor(descriptor.fillContents.color, {
    id: layerEntry.id,
    name: layerEntry.name,
    kind: "shape",
    path: "fillContents.color",
  });
}

function getLayerEffectEntries(descriptor) {
  const layerEffects = descriptor && descriptor.layerEffects;
  if (!layerEffects) return [];

  const supportedEffects = [
    { key: "solidFill", path: "layerEffects.solidFill.color" },
    { key: "frameFX", path: "layerEffects.frameFX.color" },
  ];

  return supportedEffects
    .map((effect) => {
      const effectValue = layerEffects[effect.key];
      const effectDescriptor = Array.isArray(effectValue) ? effectValue[0] : effectValue;
      return effectDescriptor && effectDescriptor.color
        ? { path: effect.path, color: effectDescriptor.color }
        : null;
    })
    .filter(Boolean);
}

function extractLayerEffects(layerEntry, descriptor) {
  getLayerEffectEntries(descriptor).forEach((effectEntry) => {
    recordColor(effectEntry.color, {
      id: layerEntry.id,
      name: layerEntry.name,
      kind: "effect",
      path: effectEntry.path,
    });
  });
}

function buildFoundColors() {
  return Array.from(colorBucketMap.values())
    .map((bucket) => ({
      hex: bucket.hex,
      layers: bucket.layers,
      count: bucket.layers.length,
    }))
    .sort((left, right) => right.count - left.count || left.hex.localeCompare(right.hex));
}

function collectColorDataFromDescriptor(layerEntry, descriptor) {
  if (!descriptor || descriptor._obj === "error") return;
  extractTextColors(layerEntry, descriptor);
  extractSolidColorLayer(layerEntry, descriptor);
  extractShapeFill(layerEntry, descriptor);
  extractLayerEffects(layerEntry, descriptor);
}

function renderColorSwatches() {
  const list = document.getElementById("color-swatch-list");
  if (!list) return;

  if (colorManagerState.foundColors.length === 0) {
    list.innerHTML = '<span class="no-layers-msg">No editable colors found. Raster content and most smart object internals cannot be scanned by Photoshop UXP.</span>';
    return;
  }

  const fragment = document.createDocumentFragment();

  colorManagerState.foundColors.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "color-swatch-row" + (colorManagerState.selectedHex === entry.hex ? " selected" : "");
    row.dataset.hex = entry.hex;

    const dot = document.createElement("div");
    dot.className = "color-swatch-dot";
    dot.style.background = entry.hex;

    const info = document.createElement("div");
    info.className = "color-swatch-info";

    const pillsWrap = document.createElement("div");
    pillsWrap.className = "color-layer-pills color-layer-pills-list";

    const uniqueLayerNames = [...new Set(entry.layers.map((layer) => layer.name))];
    const shownNames = uniqueLayerNames.slice(0, 2);
    const remainingCount = uniqueLayerNames.length - shownNames.length;

    shownNames.forEach((layerName) => {
      const pill = document.createElement("span");
      pill.className = "color-layer-pill";
      pill.textContent = layerName;
      pillsWrap.appendChild(pill);
    });

    if (remainingCount > 0) {
      const extra = document.createElement("span");
      extra.className = "color-layer-pill color-layer-pill-more";
      extra.textContent = "+" + remainingCount;
      pillsWrap.appendChild(extra);
    }

    const count = document.createElement("span");
    count.className = "color-swatch-count";
    count.textContent = entry.count + " match" + (entry.count === 1 ? "" : "es");

    info.appendChild(pillsWrap);
    info.appendChild(count);

    const icon = document.createElement("span");
    icon.className = "color-swatch-select-icon";
    icon.textContent = "✓";

    row.appendChild(dot);
    row.appendChild(info);
    row.appendChild(icon);
    row.addEventListener("click", () => selectSwatchColor(entry.hex));

    fragment.appendChild(row);
  });

  list.innerHTML = "";
  list.appendChild(fragment);
}

function refreshSwatchSelection() {
  document.querySelectorAll(".color-swatch-row").forEach((row) => {
    row.classList.toggle("selected", row.dataset.hex === colorManagerState.selectedHex);
  });
}

function updateEditorLayerPills(layerEntries) {
  const container = document.getElementById("color-editor-layer-pills");
  if (!container) return;

  container.innerHTML = "";

  const uniqueNames = [...new Set((layerEntries || []).map((entry) => entry.name))];
  if (uniqueNames.length === 0) {
    const empty = document.createElement("span");
    empty.className = "hint-text";
    empty.textContent = "No scanned layer names mapped to this source color yet.";
    container.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  uniqueNames.forEach((layerName) => {
    const pill = document.createElement("span");
    pill.className = "color-layer-pill";
    pill.textContent = layerName;
    fragment.appendChild(pill);
  });

  container.appendChild(fragment);
}

function setSelectedSource(hex, options = {}) {
  const normalized = normalizeHex(hex);
  colorManagerState.selectedHex = normalized;

  const sourceInput = document.getElementById("source-color-hex-input");
  if (sourceInput && options.syncInput !== false) {
    sourceInput.value = normalized || "";
    if (normalized) sourceInput.setAttribute("value", normalized);
  }

  setSourcePreview(normalized);
  refreshSwatchSelection();

  const foundEntry = colorManagerState.foundColors.find((entry) => entry.hex === normalized);
  updateEditorLayerPills(foundEntry ? foundEntry.layers : []);

  if (!options.keepTarget && normalized) {
    const rgb = hexToRgb(normalized);
    const hsb = rgbToHsb(rgb.r, rgb.g, rgb.b);
    colorManagerState.newH = hsb.h;
    colorManagerState.newS = hsb.s;
    colorManagerState.newB = hsb.b;
    syncPickerFromHSB(true);
  }
}

function selectSwatchColor(hex) {
  setSelectedSource(hex);
}

function syncPickerFromHSB(forceWheelRedraw) {
  updateSliderValues();

  const rgb = hsbToRgb(colorManagerState.newH, colorManagerState.newS, colorManagerState.newB);
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
  const hexInput = document.getElementById("color-hex-input");
  if (hexInput) {
    hexInput.value = hex;
    hexInput.setAttribute("value", hex);
  }

  setTargetPreview(hex);
  scheduleWheelDraw(!!forceWheelRedraw);
}

function drawColorWheel(force) {
  const canvas = document.getElementById("color-wheel-canvas");
  if (!canvas) return;

  const brightnessKey = Math.round(colorManagerState.newB);
  if (!force && colorManagerState.wheelImageKey === brightnessKey) return;

  const brightness = Math.max(0.08, Math.min(1, colorManagerState.newB / 100));
  canvas.style.setProperty("--wheel-brightness", String(brightness));
  colorManagerState.wheelImageKey = brightnessKey;
}

function updateWheelCursor() {
  const canvas = document.getElementById("color-wheel-canvas");
  const cursor = document.getElementById("color-wheel-cursor");
  if (!canvas || !cursor) return;

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const width = canvas.width;
  const centerX = width / 2;
  const centerY = width / 2;
  const radius = width / 2;
  const angle = (colorManagerState.newH * Math.PI) / 180;
  const distance = (colorManagerState.newS / 100) * radius;
  const pointX = centerX + Math.cos(angle) * distance;
  const pointY = centerY + Math.sin(angle) * distance;
  const scaleX = rect.width / width;
  const scaleY = rect.height / canvas.height;
  const rgb = hsbToRgb(colorManagerState.newH, colorManagerState.newS, colorManagerState.newB);

  cursor.style.left = pointX * scaleX + "px";
  cursor.style.top = pointY * scaleY + "px";
  cursor.style.background = "rgb(" + rgb.r + ", " + rgb.g + ", " + rgb.b + ")";
  cursor.style.display = "block";
}

function scheduleWheelDraw(forceImage) {
  if (forceImage) colorManagerState.wheelForceRedraw = true;
  if (colorManagerState.wheelFrame) return;

  colorManagerState.wheelFrame = requestAnimationFrame(() => {
    colorManagerState.wheelFrame = null;
    drawColorWheel(true);
    colorManagerState.wheelForceRedraw = false;
    updateWheelCursor();
  });
}

function pickFromWheel(event) {
  const canvas = document.getElementById("color-wheel-canvas");
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const dx = event.clientX - rect.left - rect.width / 2;
  const dy = event.clientY - rect.top - rect.height / 2;
  const radius = rect.width / 2;
  const distance = Math.min(Math.sqrt(dx * dx + dy * dy), radius);

  colorManagerState.newH = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
  colorManagerState.newS = (distance / radius) * 100;
  syncPickerFromHSB(false);
}

function applyTargetHexInput() {
  const hexInput = document.getElementById("color-hex-input");
  if (!hexInput) return;

  const normalized = normalizeHex(hexInput.value);
  if (!normalized) return;

  const rgb = hexToRgb(normalized);
  const hsb = rgbToHsb(rgb.r, rgb.g, rgb.b);
  colorManagerState.newH = hsb.h;
  colorManagerState.newS = hsb.s;
  colorManagerState.newB = hsb.b;
  syncPickerFromHSB(true);
}

function applySourceHexInput() {
  const sourceInput = document.getElementById("source-color-hex-input");
  if (!sourceInput) return;

  const normalized = normalizeHex(sourceInput.value);
  if (!normalized) return;

  setSelectedSource(normalized, { syncInput: true });
}

function initColorWheel() {
  const canvas = document.getElementById("color-wheel-canvas");
  if (!canvas || canvas.dataset.bound === "true") return;
  canvas.dataset.bound = "true";

  canvas.addEventListener("pointerdown", (event) => {
    colorManagerState.wheelDragging = true;
    if (canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (_) {
        // Ignore pointer-capture issues inside UXP.
      }
    }
    pickFromWheel(event);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!colorManagerState.wheelDragging) return;
    pickFromWheel(event);
  });

  const stopDragging = () => {
    colorManagerState.wheelDragging = false;
  };

  canvas.addEventListener("pointerup", stopDragging);
  canvas.addEventListener("pointercancel", stopDragging);
  document.addEventListener("pointerup", stopDragging);

  ["h", "s", "b"].forEach((key) => {
    const slider = document.getElementById("slider-" + key);
    if (!slider) return;
    slider.addEventListener("input", () => {
      colorManagerState["new" + key.toUpperCase()] = Number(slider.value);
      syncPickerFromHSB(key === "b");
    });
  });

  const targetHexInput = document.getElementById("color-hex-input");
  if (targetHexInput) {
    targetHexInput.addEventListener("change", applyTargetHexInput);
    targetHexInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") applyTargetHexInput();
    });
  }

  const sourceHexInput = document.getElementById("source-color-hex-input");
  if (sourceHexInput) {
    sourceHexInput.addEventListener("change", applySourceHexInput);
    sourceHexInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") applySourceHexInput();
    });
  }
}

async function scanAllColors(options = {}) {
  const doc = app.activeDocument;
  if (!doc) {
    showError("Scan failed", new Error("No active document."));
    return;
  }

  if (!options.skipStatus) setStatus("Scanning colors...", "working");

  const leafLayers = [];
  colorManagerState.smartObjectCount = 0;
  collectLeafLayers(doc.layers, leafLayers);

  if (leafLayers.length === 0) {
    colorManagerState.foundColors = [];
    renderColorSwatches();
    updateEditorLayerPills([]);
    setScanNote("");
    setStatus("No layers found.", "error");
    return;
  }

  colorBucketMap = new Map();
  _colorMap = {};

  try {
    let descriptorsById = new Map();

    await core.executeAsModal(async () => {
      descriptorsById = await fetchLayerDescriptors(leafLayers);
    }, {
      commandName: "Scan Colors",
    });

    leafLayers.forEach((layerEntry) => {
      const descriptor = descriptorsById.get(layerEntry.id);
      if (!descriptor) return;
      if (descriptor.smartObject || descriptor.smartObjectMore || layerEntry.layerKind.includes("smart")) {
        colorManagerState.smartObjectCount += 1;
      }
      collectColorDataFromDescriptor(layerEntry, descriptor);
    });

    colorManagerState.foundColors = buildFoundColors();
    renderColorSwatches();

    if (colorManagerState.smartObjectCount > 0) {
      setScanNote("Smart object internals are only partially exposed by Photoshop UXP, so embedded colors may need manual source selection.");
    } else {
      setScanNote("");
    }

    const preferredSelection =
      normalizeHex(options.preserveSelection) ||
      colorManagerState.selectedHex ||
      (colorManagerState.foundColors[0] && colorManagerState.foundColors[0].hex);

    if (preferredSelection) {
      setSelectedSource(preferredSelection, { keepTarget: !!options.keepTarget });
    } else {
      updateEditorLayerPills([]);
      setSourcePreview(null);
    }

    if (!options.skipStatus) {
      setStatus("Found " + colorManagerState.foundColors.length + " colors across " + descriptorsById.size + " layers", "success");
    }
  } catch (error) {
    showError("Scan failed", error);
  }
}

function getSelectedEntries(sourceHex) {
  const normalized = normalizeHex(sourceHex);
  if (!normalized) return [];
  const entry = colorManagerState.foundColors.find((item) => item.hex === normalized);
  return entry ? entry.layers.slice() : [];
}

function addMatchingEntry(matchSet, matches, layerEntry, extra = {}) {
  const signature = [
    layerEntry.id,
    extra.kind || "",
    extra.path || "",
    extra.rangeIndex !== undefined ? extra.rangeIndex : "",
  ].join("|");

  if (matchSet.has(signature)) return;
  matchSet.add(signature);
  matches.push({
    id: layerEntry.id,
    name: layerEntry.name,
    kind: extra.kind || layerEntry.kind || "",
    path: extra.path || "",
    rangeIndex: extra.rangeIndex,
    from: extra.from,
    to: extra.to,
    sourceHex: extra.sourceHex || null,
  });
}

function collectMatchingEntriesByHex(layerEntry, descriptor, sourceHex, matches, matchSet) {
  if (!descriptor || descriptor._obj === "error") return;

  const { ranges, path } = getTextStyleRanges(descriptor);
  const fallbackStyle = getFallbackTextStyle(descriptor);

  if (ranges.length > 0) {
    ranges.forEach((range, rangeIndex) => {
      const rangeHex = colorToHex(getResolvedTextColor(range, fallbackStyle));
      if (rangeHex !== sourceHex) return;
      addMatchingEntry(matchSet, matches, layerEntry, {
        kind: "text",
        path,
        rangeIndex,
        from: range.from,
        to: range.to,
        sourceHex: rangeHex,
        inherited: !(range && range.textStyle && range.textStyle.color),
      });
    });
  } else if (fallbackStyle && colorToHex(fallbackStyle.color) === sourceHex) {
    addMatchingEntry(matchSet, matches, layerEntry, {
      kind: "text",
      path: "textKey.textStyle.color",
      rangeIndex: 0,
      sourceHex,
    });
  }

  const adjustments = Array.isArray(descriptor.adjustment) ? descriptor.adjustment : [];
  adjustments.forEach((adjustment, adjustmentIndex) => {
    const colorHex = adjustment && adjustment.color && colorToHex(adjustment.color);
    if (adjustment && adjustment._obj === "solidColorLayer" && colorHex === sourceHex) {
      addMatchingEntry(matchSet, matches, layerEntry, {
        kind: "fill",
        path: "adjustment." + adjustmentIndex + ".color",
        sourceHex: colorHex,
      });
    }
  });

  const fillHex = descriptor.fillContents && descriptor.fillContents.color && colorToHex(descriptor.fillContents.color);
  if (fillHex === sourceHex) {
    addMatchingEntry(matchSet, matches, layerEntry, {
      kind: "shape",
      path: "fillContents.color",
      sourceHex: fillHex,
    });
  }

  getLayerEffectEntries(descriptor).forEach((effectEntry) => {
    const effectHex = colorToHex(effectEntry.color);
    if (effectHex !== sourceHex) return;
    addMatchingEntry(matchSet, matches, layerEntry, {
      kind: "effect",
      path: effectEntry.path,
      sourceHex: effectHex,
    });
  });
}

async function findEditableEntriesByHex(sourceHex) {
  const normalized = normalizeHex(sourceHex);
  const doc = app.activeDocument;
  if (!normalized || !doc) return [];

  const leafLayers = [];
  collectLeafLayers(doc.layers, leafLayers);
  if (leafLayers.length === 0) return [];

  let descriptorsById = new Map();

  await core.executeAsModal(async () => {
    descriptorsById = await fetchLayerDescriptors(leafLayers);
  }, {
    commandName: "Find Source Color",
  });

  const matches = [];
  const matchSet = new Set();
  leafLayers.forEach((layerEntry) => {
    collectMatchingEntriesByHex(layerEntry, descriptorsById.get(layerEntry.id), normalized, matches, matchSet);
  });

  return matches;
}

function buildTextReplaceCommands(layerIds, descriptorsById, sourceHex, newColor) {
  const commands = [];

  layerIds.forEach((layerId) => {
    const descriptor = descriptorsById.get(layerId);
    if (!descriptor || !descriptor.textKey) return;

    const textKey = cloneDescriptorValue(descriptor.textKey);
    let changed = false;
    const fallbackStyle = getFallbackTextStyle(descriptor);
    const fallbackHex = colorToHex(fallbackStyle && fallbackStyle.color);
    const sourceRanges = Array.isArray(textKey.textStyleRange)
      ? textKey.textStyleRange
      : Array.isArray(descriptor.textStyleRange)
        ? cloneDescriptorValue(descriptor.textStyleRange)
        : [];

    if (fallbackHex === sourceHex) {
      textKey.textStyle = {
        ...(cloneDescriptorValue(textKey.textStyle) || {}),
        color: newColor,
      };
      changed = true;
    }

    if (sourceRanges.length > 0) {
      textKey.textStyleRange = sourceRanges.map((range) => {
        const nextRange = { ...range };
        const style = { ...(range.textStyle || {}) };
        if (colorToHex(style.color) === sourceHex) {
          style.color = newColor;
          nextRange.textStyle = style;
          changed = true;
        }
        return nextRange;
      });
    } else if (!changed && fallbackHex === sourceHex) {
      textKey.textStyle = {
        ...(cloneDescriptorValue(textKey.textStyle) || {}),
        color: newColor,
      };
      changed = true;
    }

    if (!changed) return;

    commands.push({
      _obj: "set",
      _target: [{ _ref: "layer", _id: layerId }],
      to: { _obj: "textLayer", textKey },
      _options: { dialogOptions: "dontDisplay" },
    });
  });

  return commands;
}

async function replaceShapeOrFillColor(layerEntries, newColor) {
  const uniqueIds = [...new Set(layerEntries.map((entry) => entry.id))];

  for (const layerId of uniqueIds) {
    await action.batchPlay(
      [
        {
          _obj: "select",
          _target: [{ _ref: "layer", _id: layerId }],
          makeVisible: false,
        },
        {
          _obj: "set",
          _target: [{ _ref: "contentLayer", _enum: "ordinal", _value: "targetEnum" }],
          to: { _obj: "solidColorLayer", color: newColor },
          _options: { dialogOptions: "dontDisplay" },
        },
      ],
      { continueOnError: true }
    );
  }
}

function updateEffectColorInDescriptor(layerEffects, effectPath, newColor) {
  if (!layerEffects || !effectPath) return false;

  const effectMap = {
    "layerEffects.solidFill.color": "solidFill",
    "layerEffects.frameFX.color": "frameFX",
  };

  const effectKey = effectMap[effectPath];
  if (!effectKey || !layerEffects[effectKey]) return false;

  const effectValue = Array.isArray(layerEffects[effectKey]) ? layerEffects[effectKey][0] : layerEffects[effectKey];
  if (!effectValue) return false;

  effectValue.color = newColor;
  return true;
}

async function replaceEffectColor(layerEntries, newColor, descriptorsById) {
  const uniqueEntries = [];
  const seen = new Set();

  layerEntries.forEach((entry) => {
    const signature = entry.id + "|" + (entry.path || "");
    if (seen.has(signature)) return;
    seen.add(signature);
    uniqueEntries.push(entry);
  });

  for (const entry of uniqueEntries) {
    const descriptor = descriptorsById.get(entry.id);
    const layerEffects = cloneDescriptorValue(descriptor && descriptor.layerEffects);
    if (!layerEffects || !updateEffectColorInDescriptor(layerEffects, entry.path, newColor)) continue;

    await action.batchPlay(
      [
        {
          _obj: "set",
          _target: [{ _ref: "layer", _id: entry.id }],
          to: {
            _obj: "layer",
            layerEffects,
          },
          _options: { dialogOptions: "dontDisplay" },
        },
      ],
      { continueOnError: true }
    );
  }
}

async function replaceColorGlobally() {
  const sourceInput = document.getElementById("source-color-hex-input");
  const sourceHex = normalizeHex((sourceInput && sourceInput.value) || colorManagerState.selectedHex);
  if (!sourceHex) {
    setStatus("Choose or type a source color first.", "error");
    return;
  }

  let sourceEntries = getSelectedEntries(sourceHex);
  if (sourceEntries.length === 0) {
    sourceEntries = await findEditableEntriesByHex(sourceHex);
  }

  if (sourceEntries.length === 0) {
    const smartObjectHint = colorManagerState.smartObjectCount > 0
      ? " Smart object internals are still limited by current UXP APIs."
      : "";
    setStatus("That source color was not found in editable text, shapes, fills or layer effects." + smartObjectHint, "error");
    return;
  }

  if (getSelectedEntries(sourceHex).length === 0) {
    setSelectedSource(sourceHex, { syncInput: true, keepTarget: true });
    updateEditorLayerPills(sourceEntries);
  }

  const targetRgb = hsbToRgb(colorManagerState.newH, colorManagerState.newS, colorManagerState.newB);
  const targetHex = rgbToHex(targetRgb.r, targetRgb.g, targetRgb.b);
  const newColor = {
    _obj: "RGBColor",
    red: targetRgb.r,
    green: targetRgb.g,
    blue: targetRgb.b,
  };

  const textLayerIds = [...new Set(sourceEntries.filter((entry) => entry.kind === "text").map((entry) => entry.id))];
  const shapeEntries = sourceEntries.filter((entry) => entry.kind === "shape" || entry.kind === "fill");
  const effectEntries = sourceEntries.filter((entry) => entry.kind === "effect");

  setStatus("Replacing color...", "working");

  try {
    await core.executeAsModal(async () => {
      const descriptorIdsNeedingFetch = [...new Set([
        ...textLayerIds,
        ...effectEntries.map((entry) => entry.id),
      ])];
      const descriptorsById = descriptorIdsNeedingFetch.length > 0
        ? await fetchLayerDescriptors(descriptorIdsNeedingFetch.map((id) => ({ id, name: "", layerKind: "" })))
        : new Map();

      if (textLayerIds.length > 0) {
        const textCommands = buildTextReplaceCommands(textLayerIds, descriptorsById, sourceHex, newColor);
        if (textCommands.length > 0) {
          await action.batchPlay(textCommands, { continueOnError: true });
        }
      }

      if (shapeEntries.length > 0) {
        await replaceShapeOrFillColor(shapeEntries, newColor);
      }

      if (effectEntries.length > 0) {
        await replaceEffectColor(effectEntries, newColor, descriptorsById);
      }
    }, { commandName: "Replace Color Globally" });

    await scanAllColors({
      preserveSelection: targetHex,
      keepTarget: true,
      skipStatus: true,
    });

    setSelectedSource(targetHex, { syncInput: true, keepTarget: true });
    setStatus("Replaced color globally.", "success");
  } catch (error) {
    showError("Replace failed", error);
  }
}

function initColorManager() {
  if (window._colorInited) return;
  window._colorInited = true;

  const scanButton = document.getElementById("btn-scan-colors");
  if (scanButton) scanButton.addEventListener("click", () => scanAllColors());

  const refreshButton = document.getElementById("btn-refresh-colors");
  if (refreshButton) {
    refreshButton.addEventListener("click", () => {
      const sourceInput = document.getElementById("source-color-hex-input");
      scanAllColors({
        preserveSelection: normalizeHex((sourceInput && sourceInput.value) || colorManagerState.selectedHex),
        keepTarget: true,
      });
    });
  }

  const applyButton = document.getElementById("btn-apply-color-replace");
  if (applyButton) applyButton.addEventListener("click", replaceColorGlobally);

  initColorWheel();
  updateEditorLayerPills([]);
  setSourcePreview(null);
  syncPickerFromHSB(true);
  drawColorWheel(true);
  updateWheelCursor();
}

document.addEventListener("DOMContentLoaded", initColorManager);
if (document.readyState !== "loading") initColorManager();
