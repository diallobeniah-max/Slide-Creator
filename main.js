const app = require("photoshop").app;
const core = require("photoshop").core;
const action = require("photoshop").action;
const constants = require("photoshop").constants;
const uxpFs = require("uxp").storage.localFileSystem;

// ─── Presets ──────────────────────────────────────────────────────────────────
const PRESETS = {
  instagram: { w: 1080, h: 1080 },
  long: { w: 1080, h: 1350 },
};
const ARTBOARD_GAP = 140;

let slides = [];
let originalDocId = null;
let selectedSlideId = null;
let draggedSlideId = null;

// ─── UI helpers ───────────────────────────────────────────────────────────────

function setStatus(msg, type) {
  const bar = document.getElementById("status-bar");
  if (bar) {
    bar.textContent = msg;
    bar.className = "status-bar" + (type ? " " + type : "");
  }
  if (type !== "error") {
    const log = document.getElementById("error-log");
    if (log) log.classList.add("hidden");
  }
}

function showError(label, err) {
  const msg = err && err.message ? err.message : String(err);
  setStatus(label + " — see details below", "error");
  const log = document.getElementById("error-log");
  if (log) {
    log.textContent = label + ":\n" + msg;
    log.classList.remove("hidden");
  }
  console.error(label, err);
}

function getDropdownValue(el) {
  if (!el) return "";
  const selected = el.querySelector("sp-menu-item[selected]");
  if (selected) return selected.getAttribute("value") || "";
  if (el.value) return el.value;
  const ariaSelected = el.querySelector("sp-menu-item[aria-selected='true']");
  if (ariaSelected) return ariaSelected.getAttribute("value") || "";
  const first = el.querySelector("sp-menu-item");
  return first ? first.getAttribute("value") || "" : "";
}

function getVal(id) {
  const el = document.getElementById(id);
  if (el && el.tagName === "SP-DROPDOWN") return getDropdownValue(el);
  return el ? el.value || "" : "";
}

function isChecked(id) {
  const el = document.getElementById(id);
  return !!(el && el.checked);
}

// ─── Artboard Setup readers (use IDs: artboard-preset, artboard-position, etc.)
function getArtboardInputs() {
  const preset = getVal("artboard-preset");
  let artW, artH;
  if (preset === "custom" || !PRESETS[preset]) {
    artW = parseInt(getVal("artboard-custom-w")) || 1080;
    artH = parseInt(getVal("artboard-custom-h")) || 1080;
  } else {
    artW = PRESETS[preset].w;
    artH = PRESETS[preset].h;
  }
  const posRaw = (getVal("artboard-position") || "left").trim().toLowerCase();
  const position = ["left", "right", "up", "bottom"].includes(posRaw) ? posRaw : "left";
  const count = Math.max(1, parseInt(getVal("artboard-count")) || 1);
  const name = (getVal("artboard-name") || "canvas").trim() || "canvas";
  return { artW, artH, position, count, name };
}

// ─── Slide Setup readers (use IDs: slide-size-preset, slide-count, etc.)
function getSlideInputs() {
  const preset = getVal("slide-size-preset");
  let slideW;
  let slideH;
  if (preset === "custom" || !PRESETS[preset]) {
    slideW = parseInt(getVal("slide-custom-w")) || 1080;
    slideH = parseInt(getVal("slide-custom-h")) || 1080;
  } else {
    slideW = PRESETS[preset].w;
    slideH = PRESETS[preset].h;
  }
  const resolutionScale = isChecked("slide-highres") ? 2 : 1;
  slideW *= resolutionScale;
  slideH *= resolutionScale;
  const slideCount = Math.max(1, parseInt(getVal("slide-count")) || 6);
  const exportPrefix = (getVal("export-prefix") || "slide").trim() || "slide";
  const exportFormat = getVal("export-format") || "jpg";
  const exportQuality = Math.min(12, Math.max(1, parseInt(getVal("export-quality")) || 10));
  return {
    slideW,
    slideH,
    resolutionScale,
    slideCount,
    exportPrefix,
    exportFormat,
    exportQuality,
  };
}

// Keep getInputs() for any legacy callers (guides, etc.)
function getInputs() {
  const ab = getArtboardInputs();
  const sl = getSlideInputs();
  return {
    slideW: ab.artW,
    slideH: ab.artH,
    slideCount: sl.slideCount,
    canvasPosition: ab.position,
    canvasCount: ab.count,
    canvasName: ab.name,
    exportPrefix: sl.exportPrefix,
    exportFormat: sl.exportFormat,
    exportQuality: sl.exportQuality,
    slidePresetW: sl.slideW,
    slidePresetH: sl.slideH,
    usePrimaryArtboardSize: false,
  };
}

function updateArtboardHint() {
  try {
    const { artW, artH, position, count } = getArtboardInputs();
    const hint = document.getElementById("artboard-size-hint");
    if (hint) {
      const direction = position.charAt(0).toUpperCase() + position.slice(1);
      hint.textContent = `${count} artboard(s) · ${artW} × ${artH} px · Direction: ${direction} · Gap: ${ARTBOARD_GAP}px`;
    }
  } catch (_) { }
}

// ─── Thumbnails ───────────────────────────────────────────────────────────────

function renderThumbnails() {
  const container = document.getElementById("slide-thumbnails-container");
  if (!container) return;
  container.innerHTML = "";
  slides.forEach((slide, index) => {
    const el = document.createElement("div");
    el.className = "slide-thumbnail";
    el.setAttribute("draggable", "true");
    el.dataset.slideId = slide.id;
    el.dataset.slideNumber = index + 1;

    const img = document.createElement("img");
    img.src = slide.thumbnailBase64
      ? `data:image/png;base64,${slide.thumbnailBase64}`
      : `https://via.placeholder.com/60x60?text=${index + 1}`;
    img.alt = `Slide ${index + 1}`;
    img.style.cursor = "grab";

    const label = document.createElement("span");
    label.className = "slide-thumbnail-label";
    label.textContent = String(index + 1);

    const controls = document.createElement("div");
    controls.className = "slide-move-controls";

    const moveLeft = document.createElement("button");
    moveLeft.className = "slide-move-button";
    moveLeft.textContent = "◀";
    moveLeft.addEventListener("click", (e) => { e.stopPropagation(); moveSlideByOffset(slide.id, -1); });

    const moveRight = document.createElement("button");
    moveRight.className = "slide-move-button";
    moveRight.textContent = "▶";
    moveRight.addEventListener("click", (e) => { e.stopPropagation(); moveSlideByOffset(slide.id, 1); });

    controls.appendChild(moveLeft);
    controls.appendChild(moveRight);

    if (slide.id === selectedSlideId) el.classList.add("selected");

    el.addEventListener("click", () => selectSlide(slide.id));

    el.addEventListener("dragstart", (e) => {
      draggedSlideId = slide.id;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", slide.id);
      el.classList.add("dragging");
    });
    el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("drag-over"); });
    el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.classList.remove("drag-over");
      const targetId = parseInt(el.dataset.slideId);
      if (draggedSlideId !== targetId) reorderSlides(draggedSlideId, targetId);
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("dragging");
      draggedSlideId = null;
      document.querySelectorAll(".slide-thumbnail").forEach(t => t.classList.remove("drag-over"));
    });

    el.appendChild(img);
    el.appendChild(label);
    el.appendChild(controls);
    container.appendChild(el);
  });
}

function selectSlide(slideId) {
  selectedSlideId = slideId;
  document.querySelectorAll(".slide-thumbnail").forEach(t => {
    t.classList.toggle("selected", parseInt(t.dataset.slideId) === slideId);
  });
}

function reorderSlides(draggedId, targetId) {
  const from = slides.findIndex(s => s.id === draggedId);
  const to = slides.findIndex(s => s.id === targetId);
  if (from === -1 || to === -1) return;
  const [moved] = slides.splice(from, 1);
  slides.splice(to, 0, moved);
  renderThumbnails();
}

function moveSlideByOffset(slideId, offset) {
  const idx = slides.findIndex(s => s.id === slideId);
  if (idx === -1) return;
  const next = idx + offset;
  if (next < 0 || next >= slides.length) return;
  const [moved] = slides.splice(idx, 1);
  slides.splice(next, 0, moved);
  selectedSlideId = slideId;
  renderThumbnails();
}

function toPixels(value) {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "_value" in value) return Number(value._value) || 0;
  return Number(value) || 0;
}

function toNumberId(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeBounds(bounds) {
  return {
    left: toPixels(bounds && bounds.left),
    top: toPixels(bounds && bounds.top),
    right: toPixels(bounds && bounds.right),
    bottom: toPixels(bounds && bounds.bottom),
  };
}

function buildArtboardRects(anchorBounds, artW, artH, position, count, gap) {
  const rects = [];
  for (let i = 0; i < count; i++) {
    let left = anchorBounds.left;
    let top = anchorBounds.top;

    switch (position) {
      case "right":
        left = anchorBounds.right + gap + i * (artW + gap);
        top = anchorBounds.top;
        break;
      case "left":
        left = anchorBounds.left - (artW + gap) * (i + 1);
        top = anchorBounds.top;
        break;
      case "bottom":
        left = anchorBounds.left;
        top = anchorBounds.bottom + gap + i * (artH + gap);
        break;
      case "up":
        left = anchorBounds.left;
        top = anchorBounds.top - (artH + gap) * (i + 1);
        break;
    }

    rects.push({
      left,
      top,
      right: left + artW,
      bottom: top + artH,
    });
  }
  return rects;
}

function buildDuplicateLayoutRects(sourceBounds, artW, artH, position, count, gap) {
  const rects = [];

  for (let i = 0; i < count; i++) {
    let left = sourceBounds.left;
    let top = sourceBounds.top;

    switch (position) {
      case "right":
        left = sourceBounds.right + gap;
        top = sourceBounds.top + i * (artH + gap);
        break;
      case "left":
        left = sourceBounds.left - artW - gap;
        top = sourceBounds.top + i * (artH + gap);
        break;
      case "bottom":
        left = sourceBounds.left + i * (artW + gap);
        top = sourceBounds.bottom + gap;
        break;
      case "up":
        left = sourceBounds.left + i * (artW + gap);
        top = sourceBounds.top - artH - gap;
        break;
    }

    rects.push({
      left,
      top,
      right: left + artW,
      bottom: top + artH,
    });
  }

  return rects;
}

function getCanvasExpansion(docW, docH, rects) {
  let minLeft = 0;
  let minTop = 0;
  let maxRight = docW;
  let maxBottom = docH;

  rects.forEach((rect) => {
    minLeft = Math.min(minLeft, rect.left);
    minTop = Math.min(minTop, rect.top);
    maxRight = Math.max(maxRight, rect.right);
    maxBottom = Math.max(maxBottom, rect.bottom);
  });

  return {
    newW: Math.max(1, maxRight - minLeft),
    newH: Math.max(1, maxBottom - minTop),
    shiftX: -minLeft,
    shiftY: -minTop,
  };
}

async function resizeActiveDocumentCanvas(newW, newH, shiftX, shiftY) {
  const doc = app.activeDocument;
  if (!doc) throw new Error("No active document open.");

  const currentW = Math.round(Number(doc.width));
  const currentH = Math.round(Number(doc.height));
  const width = Math.round(newW);
  const height = Math.round(newH);
  const offsetX = Math.round(shiftX || 0);
  const offsetY = Math.round(shiftY || 0);

  if (currentW === width && currentH === height && offsetX === 0 && offsetY === 0) return;

  await action.batchPlay([{
    _obj: "canvasSize",
    width: { _unit: "pixelsUnit", _value: width },
    height: { _unit: "pixelsUnit", _value: height },
    _target: [{ _ref: "document", _enum: "ordinal", _value: "targetEnum" }],
    offset: {
      _obj: "offset",
      horizontal: { _unit: "pixelsUnit", _value: offsetX },
      vertical: { _unit: "pixelsUnit", _value: offsetY },
    },
    _options: { dialogOptions: "dontDisplay" },
  }], {});
}

async function createArtboardsInActiveDocument({ artW, artH, position, count, name }) {
  const doc = app.activeDocument;
  if (!doc) throw new Error("No active document open.");

  const docW = Math.round(Number(doc.width));
  const docH = Math.round(Number(doc.height));
  const occupiedBounds = await getOccupiedBounds(doc);
  const rects = buildArtboardRects(occupiedBounds, artW, artH, position, count, ARTBOARD_GAP);
  const expansion = getCanvasExpansion(docW, docH, rects);

  await resizeActiveDocumentCanvas(expansion.newW, expansion.newH, expansion.shiftX, expansion.shiftY);

  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    await action.batchPlay([{
      _obj: "make",
      _target: [{ _ref: "artboardSection" }],
      artboardRect: {
        _obj: "classFloatRect",
        top: { _unit: "pixelsUnit", _value: rect.top + expansion.shiftY },
        left: { _unit: "pixelsUnit", _value: rect.left + expansion.shiftX },
        bottom: { _unit: "pixelsUnit", _value: rect.bottom + expansion.shiftY },
        right: { _unit: "pixelsUnit", _value: rect.right + expansion.shiftX },
      },
      name: count > 1 ? `${name} ${i + 1}` : name,
      _options: { dialogOptions: "dontDisplay" },
    }], {});
  }
}

async function createSlidesFromSetup() {
  const { slideW, slideH, slideCount, exportPrefix } = getSlideInputs();
  setStatus(`Creating ${slideCount} slide artboard(s)…`, "working");
  try {
    await core.executeAsModal(async () => {
      await createArtboardsInActiveDocument({
        artW: slideW,
        artH: slideH,
        position: "right",
        count: slideCount,
        name: exportPrefix,
      });
    }, { commandName: "Create Slides" });

    slides = [];
    renderThumbnails();
    setStatus(`✓ Created ${slideCount} slide artboard(s) from Slide Setup`, "success");
  } catch (e) {
    showError("Create Slides failed", e);
  }
}

async function getTargetArtboardInfo(doc) {
  if (!doc || !doc.activeLayers || doc.activeLayers.length === 0) {
    const artboards = await getAllArtboardInfos(doc);
    return artboards[0] || null;
  }

  for (const layer of doc.activeLayers) {
    try {
      const artboard = await getArtboardInfoFromLayerId(layer.id);
      if (artboard) return artboard;
    } catch (e) { }
  }

  const artboards = await getAllArtboardInfos(doc);
  return artboards[0] || null;
}

async function selectLayerById(layerId) {
  const id = toNumberId(layerId);
  if (id === null) throw new Error("Invalid layer id.");
  await action.batchPlay([{
    _obj: "select",
    _target: [{ _ref: "layer", _id: id }],
    makeVisible: false,
    _options: { dialogOptions: "dontDisplay" },
  }], {});
}

function flattenLayers(layers, flattened = []) {
  for (const layer of layers || []) {
    flattened.push(layer);
    if (layer.layers && layer.layers.length) flattenLayers(layer.layers, flattened);
  }
  return flattened;
}

function getLayerById(doc, layerId) {
  const id = toNumberId(layerId);
  if (id === null) return null;
  return flattenLayers(doc.layers).find((layer) => toNumberId(layer.id) === id) || null;
}

function getParentLayerId(layerInfo) {
  if (!layerInfo) return null;
  if (layerInfo.parentLayerID) return layerInfo.parentLayerID;
  if (layerInfo.parentLayerId) return layerInfo.parentLayerId;
  if (Array.isArray(layerInfo.parentLayerIDs) && layerInfo.parentLayerIDs.length) return layerInfo.parentLayerIDs[0];
  if (Array.isArray(layerInfo.parentLayerIDList) && layerInfo.parentLayerIDList.length) return layerInfo.parentLayerIDList[0];
  return null;
}

async function getLayerDescriptorById(layerId) {
  try {
    const result = await action.batchPlay([{
      _obj: "get",
      _target: [
        { _ref: "layer", _id: layerId },
        { _ref: "document", _enum: "ordinal", _value: "targetEnum" },
      ],
      _options: { dialogOptions: "dontDisplay" },
    }], { synchronousExecution: true });
    return result && result[0] ? result[0] : null;
  } catch (e) {
    return null;
  }
}

async function getArtboardInfoFromLayerId(layerId) {
  let currentId = layerId;
  const seen = new Set();

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const layerInfo = await getLayerDescriptorById(currentId);
    if (!layerInfo) return null;
    if (layerInfo.artboardEnabled) {
      return {
        id: toNumberId(currentId),
        bounds: normalizeBounds(layerInfo.bounds),
      };
    }
    currentId = getParentLayerId(layerInfo);
  }

  return null;
}

async function getAllArtboardInfos(doc) {
  const artboards = [];
  const seen = new Set();

  for (const layer of flattenLayers(doc.layers)) {
    if (seen.has(layer.id)) continue;
    seen.add(layer.id);
    const artboard = await getArtboardInfoFromLayerId(layer.id);
    if (artboard && !artboards.some(item => item.id === artboard.id)) {
      artboards.push(artboard);
    }
  }

  return artboards;
}

function unionBounds(boundsList) {
  return boundsList.reduce((acc, bounds) => ({
    left: Math.min(acc.left, bounds.left),
    top: Math.min(acc.top, bounds.top),
    right: Math.max(acc.right, bounds.right),
    bottom: Math.max(acc.bottom, bounds.bottom),
  }));
}

async function getOccupiedBounds(doc) {
  const docW = Math.round(Number(doc.width));
  const docH = Math.round(Number(doc.height));
  return { left: 0, top: 0, right: docW, bottom: docH };
}

// Create artboards in the currently active Photoshop document.

async function createCanvas() {
  const { artW, artH, position, count, name } = getArtboardInputs();

  const doc = app.activeDocument;
  if (!doc) {
    showError("Create Artboard failed", new Error("No document open. Open or create a Photoshop document first, then try again."));
    return;
  }

  setStatus(`Creating ${count} artboard(s) at ${artW}×${artH} px…`, "working");
  try {
    await core.executeAsModal(async () => {
      await createArtboardsInActiveDocument({ artW, artH, position, count, name });
    }, { commandName: "Create Artboard" });

    slides = [];
    renderThumbnails();
    setStatus(
      `✓ Created ${count} artboard(s) in the active document`,
      "success"
    );
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    if (msg.includes("user cancelled") || msg.includes("cancelled")) {
      setStatus("Cancelled — no changes made", "");
    } else {
      showError("Create Artboard failed", e);
    }
  }
}

// ─── 1b. Duplicate Artboard with Design ──────────────────────────────────────
// Finds the first artboardSection in the active document, duplicates it N times
// (count from the artboard-count field), placing copies side-by-side.

async function duplicateArtboardWithDesign() {
  const { position, count, name } = getArtboardInputs();

  const doc = app.activeDocument;
  if (!doc) {
    showError("Duplicate Artboard failed", new Error("No document open. Open a Photoshop document with an artboard first."));
    return;
  }

  setStatus("Duplicating artboard with design…", "working");
  try {
    await core.executeAsModal(async () => {
      const activeTopLayer = Array.from(doc.activeLayers || [])
        .map((layer) => getTopLevelArtboardLayer(layer, doc))
        .find(Boolean);
      let sourceLayer = activeTopLayer || getPrimaryTopLevelLayer(doc);
      let sourceArtboard = null;

      if (sourceLayer && isGroupLikeLayer(sourceLayer)) {
        sourceArtboard = {
          id: toNumberId(sourceLayer.id),
          bounds: getArtboardLikeBounds(sourceLayer),
          layer: sourceLayer,
        };
      }

      if (!sourceArtboard || !sourceLayer) {
        sourceArtboard = await createSourceArtboardFromDocument(doc, count > 1 ? `${name} 1` : name);
        sourceLayer = sourceArtboard.layer;
      }

      const docBounds = {
        left: 0,
        top: 0,
        right: Math.round(Number(doc.width)),
        bottom: Math.round(Number(doc.height)),
      };
      const bounds = sourceArtboard.bounds;
      const artW = Math.round(bounds.right - bounds.left) || docBounds.right;
      const artH = Math.round(bounds.bottom - bounds.top) || docBounds.bottom;
      const normalizedBounds =
        artW > 0 && artH > 0
          ? {
            left: bounds.left,
            top: bounds.top,
            right: bounds.left + artW,
            bottom: bounds.top + artH,
          }
          : docBounds;
      const layoutRects = buildDuplicateLayoutRects(normalizedBounds, artW, artH, position, count, ARTBOARD_GAP);

      const expansion = getCanvasExpansion(
        Math.round(Number(doc.width)),
        Math.round(Number(doc.height)),
        layoutRects
      );

      await resizeActiveDocumentCanvas(expansion.newW, expansion.newH, expansion.shiftX, expansion.shiftY);
      const shiftedSourceBounds = {
        left: normalizedBounds.left + expansion.shiftX,
        top: normalizedBounds.top + expansion.shiftY,
        right: normalizedBounds.right + expansion.shiftX,
        bottom: normalizedBounds.bottom + expansion.shiftY,
      };
      const firstRect = layoutRects[0];
      const firstTarget = {
        left: firstRect.left + expansion.shiftX,
        top: firstRect.top + expansion.shiftY,
      };
      await sourceLayer.translate(
        firstTarget.left - shiftedSourceBounds.left,
        firstTarget.top - shiftedSourceBounds.top
      );

      const placedBoards = [{
        layer: sourceLayer,
        left: firstTarget.left,
        top: firstTarget.top,
      }];

      for (let i = 1; i < count; i++) {
        const rect = layoutRects[i];
        const targetLeft = rect.left + expansion.shiftX;
        const targetTop = rect.top + expansion.shiftY;

        const duplicateLayer = await sourceLayer.duplicate();
        const offsetX = targetLeft - firstTarget.left;
        const offsetY = targetTop - firstTarget.top;
        await duplicateLayer.translate(offsetX, offsetY);
        placedBoards.push({
          layer: duplicateLayer,
          left: targetLeft,
          top: targetTop,
        });
      }

      const sortAxis = (position === "up" || position === "bottom") ? "left" : "top";
      placedBoards.sort((a, b) => {
        if (a[sortAxis] !== b[sortAxis]) return a[sortAxis] - b[sortAxis];
        if (sortAxis !== "left" && a.left !== b.left) return a.left - b.left;
        if (sortAxis !== "top" && a.top !== b.top) return a.top - b.top;
        return 0;
      });

      placedBoards.forEach((board, index) => {
        board.layer.name = count > 1 ? `${name} ${index + 1}` : name;
      });

    }, { commandName: "Duplicate Artboard with Design" });

    setStatus(`✓ Added ${Math.max(0, count - 1)} duplicated artboard(s) with design intact`, "success");
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    if (msg.includes("user cancelled") || msg.includes("cancelled")) {
      setStatus("Cancelled — no changes made", "");
    } else {
      showError("Duplicate Artboard failed", e);
    }
  }
}

// ─── 1c. Artboard from Layer Size ────────────────────────────────────────────
// Uses the active document canvas size as the artboard size.

async function artboardFromLayerSize() {
  const { position, count, name } = getArtboardInputs();

  const doc = app.activeDocument;
  if (!doc) {
    showError("Artboard from Canvas Size failed", new Error("No document open. Open a Photoshop document first, then try again."));
    return;
  }

  setStatus("Reading current canvas size…", "working");
  try {
    await core.executeAsModal(async () => {
      const artW = Math.max(1, Math.round(Number(doc.width)));
      const artH = Math.max(1, Math.round(Number(doc.height)));

      if (artW < 1 || artH < 1) throw new Error(`Invalid canvas size: ${artW}×${artH}`);

      await createArtboardsInActiveDocument({ artW, artH, position, count, name });

    }, { commandName: "Artboard from Canvas Size" });

    setStatus(`✓ Created ${count} artboard(s) using the current canvas size`, "success");
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    if (msg.includes("user cancelled") || msg.includes("cancelled")) {
      setStatus("Cancelled — no changes made", "");
    } else {
      showError("Artboard from Canvas Size failed", e);
    }
  }
}



async function addGuides() {
  const { slideCount } = getSlideInputs();
  setStatus("Adding guides…", "working");
  try {
    await core.executeAsModal(async () => {
      const doc = app.activeDocument;
      if (!doc) throw new Error("No active document.");
      const sliceW = Number(doc.width) / slideCount;
      for (let i = 1; i < slideCount; i++) {
        await action.batchPlay([{
          _obj: "make",
          _target: [{ _ref: "guide" }],
          new: {
            _obj: "guide",
            position: { _unit: "pixelsUnit", _value: Math.round(sliceW * i) },
            orientation: { _enum: "orientation", _value: "vertical" },
          },
          _options: { dialogOptions: "dontDisplay" },
        }], {});
      }
    }, { commandName: "Add Guides" });
    setStatus(`✓ ${slideCount - 1} guide(s) added`, "success");
  } catch (e) {
    showError("Add Guides failed", e);
  }
}

// ─── 3. Clear Guides ──────────────────────────────────────────────────────────

async function clearGuides() {
  setStatus("Clearing guides…", "working");
  try {
    await core.executeAsModal(async () => {
      await action.batchPlay([{
        _obj: "delete",
        _target: [{ _ref: "guide", _enum: "ordinal", _value: "allEnum" }],
        _options: { dialogOptions: "dontDisplay" },
      }], {});
    }, { commandName: "Clear Guides" });
    setStatus("✓ Guides cleared", "success");
  } catch (e) {
    showError("Clear Guides failed", e);
  }
}

// ─── 4. Crop Slides ───────────────────────────────────────────────────────────
// Reads ONLY from Slide Setup fields (slide-size-preset, slide-count, etc.)

async function cropSlides() {
  const { slideW, slideH, slideCount, exportPrefix } = getSlideInputs();

  if (!app.activeDocument) {
    showError("Crop failed", new Error("No active document."));
    return;
  }

  const origDoc = app.activeDocument;
  originalDocId = origDoc.id;
  const docW = Number(origDoc.width);
  const docH = Number(origDoc.height);
  const sliceW = Math.max(1, Math.round(docW / slideCount));
  const cropBottom = Math.min(docH, Math.max(1, Math.round(slideH || docH)));

  if (slides.length > 0) {
    try {
      await core.executeAsModal(async () => {
        for (const slide of slides) {
          const old = app.documents.find(d => d.id === slide.id);
          if (old) await old.close(constants.SaveOptions.DONOTSAVECHANGES);
        }
      }, { commandName: "Close previous slides" });
    } catch (_) { }
  }

  slides = [];
  setStatus("Cropping slides…", "working");

  try {
    for (let i = 0; i < slideCount; i++) {
      const num = i + 1;
      const name = `${exportPrefix} Slide ${num}`;
      const x = i * sliceW;
      const right = i === slideCount - 1 ? docW : Math.min(docW, x + sliceW);
      const partW = Math.max(1, right - x);

      await core.executeAsModal(async () => {
        const currentOrigDoc = app.documents.find(d => d.id === originalDocId);
        if (!currentOrigDoc) throw new Error("Original document not found.");

        const cropBounds = {
          left: Math.round(x),
          top: 0,
          right: Math.round(x + partW),
          bottom: Math.round(cropBottom),
        };

        // Duplicate merged pixels only so exported slide docs do not inherit
        // artboard/canvas state from the original wide layout.
        const partDoc = await currentOrigDoc.duplicate(name, true);
        app.activeDocument = partDoc;
        await partDoc.crop(cropBounds, 0, Math.round(partW), Math.round(cropBottom));
        await partDoc.flatten();

        slides.push({
          id: partDoc.id,
          name,
          width: Math.round(partW),
          height: Math.round(cropBottom),
        });
      }, { commandName: `Crop Slide ${num}` });

      setStatus(`Cropped ${i + 1} / ${slideCount}…`, "working");
    }

    renderThumbnails();
    updateDeleteSlidesUI();
    // Show the Export All Slides button after cropping
    const exportButton = document.getElementById("btn-export-slides");
    if (exportButton) exportButton.classList.remove("hidden");
    setStatus(`✓ ${slideCount} slides cropped — ready to export`, "success");
  } catch (e) {
    showError("Crop Slides failed", e);
  }
}

// ─── 5. Export ────────────────────────────────────────────────────────────────

async function closeAllSlideDocs() {
  if (slides.length === 0) return;
  try {
    await core.executeAsModal(async () => {
      for (const slide of slides) {
        const doc = app.documents.find(d => d.id === slide.id);
        if (doc) await doc.close(constants.SaveOptions.DONOTSAVECHANGES);
      }
    }, { commandName: "Close slide docs" });
  } catch (_) { }
  slides = [];
}

async function exportSlides(forcedFormat) {
  if (slides.length === 0) {
    showError("Export failed", new Error("No slides — tap Crop Slides first."));
    return;
  }

  const { exportFormat, exportQuality } = getSlideInputs();
  const resolvedFormat = forcedFormat || exportFormat;
  const doJpg = resolvedFormat === "jpg";
  const ext = doJpg ? "jpg" : "png";
  const count = slides.length;

  setStatus("Choose folder to save slides…", "working");
  let folderEntry;
  try {
    folderEntry = await uxpFs.getFolder();
    if (!folderEntry) { setStatus("Export cancelled.", ""); return; }
  } catch (e) {
    showError("Folder selection failed", e);
    return;
  }

  try {
    await core.executeAsModal(async () => {
      for (let i = 0; i < count; i++) {
        const slide = slides[i];
        const num = i + 1;
        const baseName = slide.name.split(" Slide")[0];
        const fileName = `${baseName}_${String(num).padStart(2, "0")}`;
        const slideDoc = app.documents.find(d => d.id === slide.id);
        if (!slideDoc) throw new Error(`Slide doc ${num} not found.`);
        app.activeDocument = slideDoc;
        const fileEntry = await folderEntry.createFile(`${fileName}.${ext}`, { overwrite: true });
        if (doJpg) {
          await slideDoc.saveAs.jpg(fileEntry, { quality: exportQuality }, true);
        } else {
          await slideDoc.saveAs.png(fileEntry, {}, true);
        }
        setStatus(`Exported ${i + 1} / ${count}…`, "working");
      }
    }, { commandName: doJpg ? "Export Slides as JPG" : "Export Slides" });

    setStatus(`✓ All ${slides.length} slides exported!`, "success");
    await closeAllSlideDocs();
    updateDeleteSlidesUI();
  } catch (e) {
    showError("Export failed", e);
  }
}

// ─── 6. Delete Slides ────────────────────────────────────────────────────────

function updateDeleteSlidesUI() {
  const card = document.getElementById("delete-slides-card");
  const container = document.getElementById("delete-slides-container");
  const noSlidesMsg = document.getElementById("no-slides-message");
  const checklist = document.getElementById("slide-checklist");
  const selectAll = document.getElementById("select-all-checkbox");
  const deleteButton = document.getElementById("btn-delete-slides");
  if (slides.length === 0) {
    if (card) card.classList.add("hidden");
    container.classList.add("hidden");
    noSlidesMsg.style.display = "none";
    checklist.innerHTML = "";
    if (selectAll) selectAll.checked = false;
    if (deleteButton) deleteButton.disabled = true;
    return;
  }
  if (card) card.classList.remove("hidden");
  container.classList.remove("hidden");
  noSlidesMsg.style.display = "none";
  checklist.innerHTML = "";
  if (selectAll) selectAll.checked = false;
  if (deleteButton) deleteButton.disabled = false;
  slides.forEach((slide, index) => {
    const item = document.createElement("div");
    item.className = "slide-check-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.slideIndex = index;
    cb.dataset.slideId = slide.id;
    const lbl = document.createElement("label");
    lbl.className = "slide-check-label";
    lbl.textContent = `Slide ${index + 1}`;
    item.appendChild(cb);
    item.appendChild(lbl);
    checklist.appendChild(item);
  });
}

function handleSelectAllChange(event) {
  document.querySelectorAll("#slide-checklist input[type='checkbox']")
    .forEach(cb => { cb.checked = event.target.checked; });
}

async function deleteSelectedSlides() {
  const checked = document.querySelectorAll("#slide-checklist input[type='checkbox']:checked");
  if (checked.length === 0) { showError("Delete failed", new Error("No slides selected.")); return; }
  const indices = Array.from(checked).map(cb => parseInt(cb.dataset.slideIndex)).sort((a, b) => b - a);
  const ids = Array.from(checked).map(cb => parseInt(cb.dataset.slideId));
  setStatus("Deleting selected slides…", "working");
  try {
    await core.executeAsModal(async () => {
      for (const id of ids) {
        const doc = app.documents.find(d => d.id === id);
        if (doc) await doc.close(constants.SaveOptions.DONOTSAVECHANGES);
      }
    }, { commandName: "Delete Slides" });
    for (const i of indices) slides.splice(i, 1);
    updateDeleteSlidesUI();
    setStatus(`✓ ${indices.length} slide(s) deleted!`, "success");
  } catch (e) {
    showError("Delete Slides failed", e);
  }
}

async function stepHistory(direction) {
  const doc = app.activeDocument;
  if (!doc) {
    showError(direction === "undo" ? "Undo failed" : "Redo failed", new Error("No active document open."));
    return;
  }

  try {
    await core.executeAsModal(async () => {
      const historyStates = doc.historyStates || [];
      const activeState = doc.activeHistoryState;
      const currentIndex = historyStates.findIndex((state) => state && activeState && state.id === activeState.id);
      if (currentIndex === -1) throw new Error("Could not determine document history.");

      const nextIndex = direction === "undo" ? currentIndex - 1 : currentIndex + 1;
      if (nextIndex < 0 || nextIndex >= historyStates.length) {
        throw new Error(direction === "undo" ? "Nothing left to undo." : "Nothing left to redo.");
      }

      doc.activeHistoryState = historyStates[nextIndex];
    }, { commandName: direction === "undo" ? "Undo" : "Redo" });

    setStatus(direction === "undo" ? "Undid last change." : "Redid last undone change.", "success");
  } catch (e) {
    showError(direction === "undo" ? "Undo failed" : "Redo failed", e);
  }
}

async function fitViewToScreen() {
  const doc = app.activeDocument;
  if (!doc) {
    showError("Fit failed", new Error("No active document open."));
    return;
  }

  try {
    await core.executeAsModal(async () => {
      await action.batchPlay([{
        _obj: "select",
        _target: [{
          _ref: "menuItemClass",
          _enum: "menuItemType",
          _value: "fitOnScreen",
        }],
        _options: { dialogOptions: "dontDisplay" },
      }], {});
    }, { commandName: "Fit on Screen" });

    setStatus("Fit current document to screen.", "success");
  } catch (e) {
    showError("Fit failed", e);
  }
}

// ─── Dropdown binding ────────────────────────────────────────────────────────

function syncDropdownSelection(dropdownId, textTargetId, forcedValue) {
  const dropdown = document.getElementById(dropdownId);
  const textTarget = document.getElementById(textTargetId);
  if (!dropdown) return;
  const value = forcedValue || getDropdownValue(dropdown);
  const item =
    dropdown.querySelector(`sp-menu-item[value="${value}"]`) ||
    dropdown.querySelector("sp-menu-item[selected]") ||
    dropdown.querySelector("sp-menu-item");
  if (!item) return;
  const itemValue = item.getAttribute("value") || "";
  dropdown.value = itemValue;
  dropdown.querySelectorAll("sp-menu-item").forEach(mi => {
    if (mi.getAttribute("value") === itemValue) mi.setAttribute("selected", "");
    else mi.removeAttribute("selected");
  });
  if (textTarget) textTarget.textContent = item.textContent.trim();
}

function bindDropdownPreview(dropdownId, textTargetId, onSync) {
  const dropdown = document.getElementById(dropdownId);
  if (!dropdown) return;
  const getEv = (e) => (e && e.target && e.target.value) ? e.target.value : getDropdownValue(dropdown);
  const apply = (v) => {
    syncDropdownSelection(dropdownId, textTargetId, v);
    if (onSync) onSync(getDropdownValue(dropdown));
  };
  const clickSel = (e) => {
    const item = e.target && typeof e.target.closest === "function" ? e.target.closest("sp-menu-item") : null;
    if (item) apply(item.getAttribute("value") || "");
  };
  apply(getDropdownValue(dropdown));
  dropdown.addEventListener("change", (e) => apply(getEv(e)));
  dropdown.addEventListener("input", (e) => apply(getEv(e)));
  dropdown.addEventListener("click", clickSel);
  const menu = dropdown.querySelector("sp-menu");
  if (menu) { menu.addEventListener("change", (e) => apply(getEv(e))); menu.addEventListener("click", clickSel); }
  dropdown.querySelectorAll("sp-menu-item").forEach(item => {
    item.addEventListener("click", () => apply(item.getAttribute("value") || ""));
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") apply(item.getAttribute("value") || "");
    });
  });
  if (typeof MutationObserver === "function") {
    new MutationObserver(() => apply(getDropdownValue(dropdown)))
      .observe(dropdown, { subtree: true, attributes: true, attributeFilter: ["selected", "value", "aria-selected"] });
  }
}

function setActiveTab(tabName) {
  // Update icon tab buttons
  document.querySelectorAll(".tab-icon-btn[data-tab-button]").forEach((button) => {
    const active = button.getAttribute("data-tab-button") === tabName;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
    button.tabIndex = active ? 0 : -1;
  });

  // Show/hide panels
  document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
    const pId = panel.getAttribute("data-tab-panel");
    const active = pId === tabName;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
    if (active && tabName === "layers" && typeof refreshLayerList === "function") {
      refreshLayerList();
    }
    if (active && tabName === "colors" && typeof scheduleWheelDraw === "function") {
      setTimeout(scheduleWheelDraw, 50);
    }
  });
}

function initTabs() {
  const tabsNav = document.getElementById("main-tabs");
  if (!tabsNav) return;

  if (tabsNav.dataset.tabsInitialized === "true") {
    return;
  }
  tabsNav.dataset.tabsInitialized = "true";

  tabsNav.querySelectorAll(".tab-icon-btn[data-tab-button]").forEach((button) => {
    button.addEventListener("click", () => {
      setActiveTab(button.getAttribute("data-tab-button"));
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        setActiveTab(button.getAttribute("data-tab-button"));
      }
    });
  });

  const act = tabsNav.querySelector(".tab-icon-btn.active");
  const tab = act ? act.getAttribute("data-tab-button") : "artboard";
  setActiveTab(tab || "artboard");
}

// ─── Init ────────────────────────────────────────────────────────────────────

function initUI() {
  const artCustomFields = document.getElementById("artboard-custom-fields");
  const slideCustomFields = document.getElementById("slide-custom-fields");
  const artboardFromCanvasButton = document.getElementById("btn-artboard-from-layer");
  if (artboardFromCanvasButton) artboardFromCanvasButton.textContent = "Artboard from Canvas Size";
  initTabs();
  setTimeout(() => {
    if (typeof initializeAutoResize === 'function') initializeAutoResize();
  }, 100);

  // Artboard Setup dropdowns
  bindDropdownPreview("artboard-preset", "artboard-preset-inline", (value) => {
    if (artCustomFields) artCustomFields.classList.toggle("hidden", value !== "custom");
    updateArtboardHint();
  });
  bindDropdownPreview("artboard-position", "artboard-position-inline", () => updateArtboardHint());

  // Slide Setup dropdown
  bindDropdownPreview("slide-size-preset", "slide-size-preset-inline", (value) => {
    if (slideCustomFields) slideCustomFields.classList.toggle("hidden", value !== "custom");
  });

  // Export format dropdown
  bindDropdownPreview("export-format", "export-format-inline");

  // Artboard hint updates
  ["artboard-count", "artboard-custom-w", "artboard-custom-h", "artboard-name"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", updateArtboardHint);
      el.addEventListener("change", updateArtboardHint);
      el.addEventListener("blur", updateArtboardHint);
      el.addEventListener("value-change", updateArtboardHint);
    }
  });

  const selectAllCb = document.getElementById("select-all-checkbox");
  if (selectAllCb) selectAllCb.addEventListener("change", handleSelectAllChange);

  if (artCustomFields) artCustomFields.classList.toggle("hidden", getVal("artboard-preset") !== "custom");
  if (slideCustomFields) slideCustomFields.classList.toggle("hidden", getVal("slide-size-preset") !== "custom");
  updateArtboardHint();
  updateDeleteSlidesUI();
}

function flashActionButton(button) {
  if (!button || !button.classList || !button.classList.contains("header-icon-btn")) return;
  button.classList.add("is-pressed");
  window.clearTimeout(button._pressTimer);
  button._pressTimer = window.setTimeout(() => {
    button.classList.remove("is-pressed");
  }, 220);
}

function handleButtonClick(event) {
  const button = event.target.closest("sp-button, [data-action-button]");
  if (!button) return;
  flashActionButton(button);
  switch (button.id) {
    case "btn-undo": stepHistory("undo"); break;
    case "btn-redo": stepHistory("redo"); break;
    case "btn-fit-screen": fitViewToScreen(); break;
    case "btn-create-canvas": createCanvas(); break;
    case "btn-duplicate-artboard": duplicateArtboardWithDesign(); break;
    case "btn-artboard-from-layer": artboardFromLayerSize(); break;
    case "btn-auto-aspect-create": autoCalculateAndCreateSlide(); break;
    case "btn-create-slide": createSlideLayoutDocument(); break;
    case "btn-add-guides": addGuides(); break;
    case "btn-clear-guides": clearGuides(); break;
    case "btn-crop-slides": cropSlides(); break;
    case "btn-export-slides": exportSlides(); break;

    case "btn-rasterize": rasterizeSelectedLayers(); break;
    case "btn-organize-slides": organizeLayersIntoSlides(); break;
    case "btn-delete-slides": deleteSelectedSlides(); break;
    default: break;
  }
}

function handleActionButtonKeydown(event) {
  const button = event.target.closest("[data-action-button]");
  if (!button) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  button.click();
}

function handleKeydown(event) {
  if (!(event.ctrlKey || event.metaKey)) return;
  if (event.altKey) return;
  if (event.key !== "0") return;

  event.preventDefault();
  fitViewToScreen();
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  return btoa(binary);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initUI);
} else {
  initUI();
}

  document.addEventListener("click", handleButtonClick);
  document.addEventListener("keydown", handleActionButtonKeydown);
document.addEventListener("keydown", handleKeydown);

function getArtboardLikeBounds(layer) {
  return normalizeBounds((layer && layer.boundsNoEffects) ? layer.boundsNoEffects : (layer && layer.bounds));
}

function getTopLevelLayers(doc) {
  return Array.from((doc && doc.layers) || []);
}

function getTopLevelArtboardLayer(layer, doc) {
  const topLevelLayers = getTopLevelLayers(doc);
  const topLevelById = new Map(topLevelLayers.map((item) => [toNumberId(item.id), item]));
  let current = layer || null;

  while (current) {
    const currentId = toNumberId(current.id);
    if (currentId !== null && topLevelById.has(currentId)) {
      return topLevelById.get(currentId);
    }
    current = current.parent || null;
  }

  return null;
}

function getPrimaryTopLevelLayer(doc) {
  const topLevelLayers = getTopLevelLayers(doc);
  return topLevelLayers[0] || null;
}

function isGroupLikeLayer(layer) {
  return !!(layer && layer.layers);
}

async function createSourceArtboardFromDocument(doc, baseName) {
  const docW = Math.round(Number(doc.width));
  const docH = Math.round(Number(doc.height));
  const beforeIds = new Set(getTopLevelLayers(doc).map((layer) => toNumberId(layer.id)));

  await action.batchPlay([{
    _obj: "make",
    _target: [{ _ref: "artboardSection" }],
    artboardRect: {
      _obj: "classFloatRect",
      top: { _unit: "pixelsUnit", _value: 0 },
      left: { _unit: "pixelsUnit", _value: 0 },
      bottom: { _unit: "pixelsUnit", _value: docH },
      right: { _unit: "pixelsUnit", _value: docW },
    },
    name: baseName,
    _options: { dialogOptions: "dontDisplay" },
  }], {});

  const sourceLayer =
    getTopLevelLayers(doc).find((layer) => !beforeIds.has(toNumberId(layer.id))) ||
    getPrimaryTopLevelLayer(doc);

  if (!sourceLayer) {
    throw new Error("Could not create the source artboard from the current document.");
  }

  const sourceId = toNumberId(sourceLayer.id);
  const layersToMove = getTopLevelLayers(doc)
    .filter((layer) => toNumberId(layer.id) !== sourceId);

  for (const layer of layersToMove.reverse()) {
    layer.move(sourceLayer, constants.ElementPlacement.PLACEINSIDE);
  }

  return {
    id: sourceId,
    bounds: { left: 0, top: 0, right: docW, bottom: docH },
    layer: sourceLayer,
  };
}

async function getAllArtboardInfos(doc) {
  return Array.from(doc.layers || [])
    .filter((layer) => layer && layer.parent === doc)
    .map((layer) => ({
      id: toNumberId(layer.id),
      bounds: getArtboardLikeBounds(layer),
    }))
    .filter((item) => item.id !== null);
}

async function getOccupiedBounds(doc) {
  const docW = Math.round(Number(doc.width));
  const docH = Math.round(Number(doc.height));
  const artboards = await getAllArtboardInfos(doc);

  if (!artboards.length) {
    return { left: 0, top: 0, right: docW, bottom: docH };
  }

  return unionBounds(artboards.map((item) => item.bounds));
}

async function getTargetArtboardInfo(doc) {
  const activeLayers = Array.from(doc.activeLayers || []);

  for (const layer of activeLayers) {
    const artboardLayer = getTopLevelArtboardLayer(layer, doc);
    if (artboardLayer) {
      return {
        id: toNumberId(artboardLayer.id),
        bounds: getArtboardLikeBounds(artboardLayer),
      };
    }
  }

  const fallbackLayer = getPrimaryTopLevelLayer(doc);
  if (fallbackLayer) {
    return {
      id: toNumberId(fallbackLayer.id),
      bounds: getArtboardLikeBounds(fallbackLayer),
    };
  }

  return null;
}

async function createSlideLayoutDocument(overrideInputs = null) {
  const { slideW, slideH, slideCount, exportPrefix } = overrideInputs || getSlideInputs();
  const totalW = Math.max(1, Math.round(slideW * slideCount));

  setStatus(`Creating ${slideCount} slides at ${slideW}x${slideH} px...`, "working");
  try {
    const doc = app.activeDocument;
    if (!doc) throw new Error("Open the document you want to turn into slides first.");

    await core.executeAsModal(async () => {
      await doc.resizeCanvas(totalW, slideH, constants.AnchorPosition.TOPLEFT);
      const activeLayer = (doc.activeLayers && doc.activeLayers[0]) || getPrimaryTopLevelLayer(doc);
      if (activeLayer) {
        const layerBounds = getArtboardLikeBounds(activeLayer);
        const layerHeight = Math.round(layerBounds.bottom - layerBounds.top);
        if (layerHeight > 0) {
          const scalePercent = (slideH / layerHeight) * 100;
          if (Math.abs(scalePercent - 100) > 0.5) {
            await activeLayer.scale(scalePercent, scalePercent, constants.AnchorPosition.TOPLEFT);
          }

          const fittedBounds = getArtboardLikeBounds(activeLayer);
          if (Math.round(fittedBounds.top) !== 0) {
            await activeLayer.translate(0, -Math.round(fittedBounds.top));
          }
        }
      }
    }, { commandName: "Create Slides" });

    originalDocId = doc.id;
    slides = [];
    selectedSlideId = null;
    renderThumbnails();
    updateDeleteSlidesUI();
    setStatus(`Resized the current document to ${totalW}x${slideH} px for ${slideCount} slides`, "success");
  } catch (e) {
    showError("Create Slides failed", e);
  }
}

async function autoCalculateAndCreateSlide() {
  const doc = app.activeDocument;
  if (!doc) {
    showError("Auto Calculate failed", new Error("No active document open."));
    return;
  }

  const { slideCount, exportPrefix } = getSlideInputs();
  let picW = 0;
  let picH = 0;

  // Read actual layer/document dimensions inside a modal context
  try {
    await core.executeAsModal(async () => {
      // Try batchPlay to get exact bounds from Photoshop's transform
      try {
        const result = await action.batchPlay([{
          _obj: "get",
          _target: [
            { _ref: "layer", _enum: "ordinal", _value: "targetEnum" },
            { _ref: "document", _enum: "ordinal", _value: "targetEnum" }
          ],
          _options: { dialogOptions: "dontDisplay" },
        }], { synchronousExecution: true });

        if (result && result[0] && result[0].bounds) {
          const b = result[0].bounds;
          const left = b.left && b.left._value !== undefined ? b.left._value : Number(b.left);
          const top = b.top && b.top._value !== undefined ? b.top._value : Number(b.top);
          const right = b.right && b.right._value !== undefined ? b.right._value : Number(b.right);
          const bottom = b.bottom && b.bottom._value !== undefined ? b.bottom._value : Number(b.bottom);
          picW = Math.round(Math.abs(right - left));
          picH = Math.round(Math.abs(bottom - top));
        }
      } catch (e) {
        console.log("batchPlay bounds error:", e);
      }

      // Fallback: active layer API bounds
      if (picW <= 0 || picH <= 0) {
        const activeLayer = (doc.activeLayers && doc.activeLayers[0]) || getPrimaryTopLevelLayer(doc);
        if (activeLayer) {
          const bounds = getArtboardLikeBounds(activeLayer);
          picW = Math.round(bounds.right - bounds.left);
          picH = Math.round(bounds.bottom - bounds.top);
        }
      }

      // Final fallback: full canvas size
      if (picW <= 0 || picH <= 0 || isNaN(picW) || isNaN(picH)) {
        picW = Math.round(Number(doc.width));
        picH = Math.round(Number(doc.height));
      }

    }, { commandName: "Read Layer Dimensions" });
  } catch (e) {
    picW = Math.round(Number(doc.width));
    picH = Math.round(Number(doc.height));
    console.log("Modal read error:", e);
  }

  // The exact width & height of the picture becomes the width & height of ONE slide!
  const slideW = Math.max(1, picW);
  const slideH = Math.max(1, picH);

  // Ensure values are strings for UI attributes
  const wStr = String(slideW);
  const hStr = String(slideH);

  // Set values onto the DOM elements
  function setFieldValue(id, val) {
    const el = document.getElementById(id);
    if (el) {
      el.value = val;
      el.setAttribute("value", String(val));
    }
  }

  // Switch preset dropdown to Custom and show the W/H fields
  syncDropdownSelection("slide-size-preset", "slide-size-preset-inline", "custom");
  const slideCustomFields = document.getElementById("slide-custom-fields");
  if (slideCustomFields) slideCustomFields.classList.remove("hidden");

  // Populate the UI fields explicitly
  setFieldValue("slide-custom-w", wStr);
  setFieldValue("slide-custom-h", hStr);

  setStatus(`Image detected: ${picW}×${picH} px → each slide: ${wStr}×${hStr} px`, "success");

  const slideCountLabel = slideCount === 1 ? "slide" : "slides";
  setStatus(`Calculated ${wStr}x${hStr} px for each ${slideCountLabel}. Tap Create Slides to build them.`, "success");
}


async function organizeLayersIntoSlides() {
  const doc = app.activeDocument;
  if (!doc) {
    showError("Organization failed", new Error("No active document open."));
    return;
  }

  const { slideW } = getSlideInputs();
  const docWidth = Number(doc.width);
  // Auto-detect the actual number of slides present on the canvas
  const activeSlideCount = Math.max(1, Math.round(docWidth / slideW));

  if (activeSlideCount <= 1) {
    showError("Organization failed", new Error("Your current document canvas is not wide enough to be sliced into multiple slides based on your Slide Setup width."));
    return;
  }

  // The exact physical width of each slide slice
  const sliceW = docWidth / activeSlideCount;
  setStatus(`Organizing layers into ${activeSlideCount} slide groups...`, "working");

  try {
    await core.executeAsModal(async () => {
      const rootLayers = Array.from(doc.layers || []);
      const slideBaskets = {}; // slideIdx -> [layerId]

      function processLayer(layer) {
        if (layer.isBackgroundLayer) return;
        if (layer.kind === constants.LayerKind.GROUP && layer.name.match(/^Slide \d+/i)) return; // Skip existing Slide groups

        let bounds = null;
        try {
          bounds = getArtboardLikeBounds(layer);
        } catch (e) { }

        if (!bounds) {
          // Empty or invalid bounds on a group? Trace its children.
          if (layer.kind === constants.LayerKind.GROUP && layer.layers) {
            Array.from(layer.layers).forEach(child => processLayer(child));
          }
          return;
        }

        const l = bounds.left;
        const r = bounds.right;
        const docW = r - l;

        if (l === 0 && r === 0 && Math.round(bounds.bottom - bounds.top) === 0) return;

        // Intelligent Nesting: If a group spans wildly across multiple slides, we shatter it 
        // to assign its children distinctly to different slides.
        if (layer.kind === constants.LayerKind.GROUP && layer.layers && layer.layers.length > 0) {
          if (docW > sliceW * 1.05) {
            Array.from(layer.layers).forEach(child => processLayer(child));
            return;
          }
        }

        // Assign to Slide
        const centerX = (l + r) / 2;
        let sIdx = Math.floor(centerX / sliceW) + 1;
        if (sIdx < 1) sIdx = 1;
        if (sIdx > activeSlideCount) sIdx = activeSlideCount;

        if (!slideBaskets[sIdx]) slideBaskets[sIdx] = [];
        slideBaskets[sIdx].push(toNumberId(layer.id));
      }

      // Seed processing
      for (const layer of rootLayers) {
        processLayer(layer);
      }

      const colors = ["red", "orange", "yellowColor", "green", "blue", "violet", "gray"];
      const slideIndices = Object.keys(slideBaskets).map(Number).sort((a, b) => a - b);

      for (const sIdx of slideIndices) {
        const ids = slideBaskets[sIdx];
        if (ids.length === 0) continue;

        await action.batchPlay([{
          _obj: "select",
          _target: ids.map(id => ({ _ref: "layer", _id: id })),
          makeVisible: false
        }], { synchronousExecution: true });

        await action.batchPlay([{
          _obj: "make",
          _target: [{ _ref: "layerSection" }],
          from: { _ref: "layer", _enum: "ordinal", _value: "targetEnum" },
          name: `Slide ${sIdx}`
        }], { synchronousExecution: true });

        const colorValue = colors[(sIdx - 1) % colors.length];
        await action.batchPlay([{
          _obj: "set",
          _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }],
          to: { _obj: "layer", color: { _enum: "color", _value: colorValue } }
        }], { synchronousExecution: true });
      }

    }, { commandName: "Organize Layers into Slides" });

    if (typeof refreshLayerList === "function") refreshLayerList();
    setStatus("Layers successfully grouped and colored by slide!", "success");

  } catch (e) {
    showError("Organize failed", e);
  }
}


async function addGuides() {
  const { slideW, slideH, slideCount } = getSlideInputs();
  setStatus("Adding guides...", "working");
  try {
    await core.executeAsModal(async () => {
      const doc = app.activeDocument;
      if (!doc) throw new Error("No active document.");

      await action.batchPlay([{
        _obj: "delete",
        _target: [{ _ref: "guide", _enum: "ordinal", _value: "allEnum" }],
        _options: { dialogOptions: "dontDisplay" },
      }], {});

      const docWidth = Math.round(Number(doc.width));
      const docHeight = Math.round(Number(doc.height));

      for (let i = 1; i < slideCount; i++) {
        const guideX = Math.round(slideW * i);
        if (guideX >= docWidth) break;

        await action.batchPlay([{
          _obj: "make",
          _target: [{ _ref: "guide" }],
          new: {
            _obj: "guide",
            position: { _unit: "pixelsUnit", _value: guideX },
            orientation: { _enum: "orientation", _value: "vertical" },
          },
          _options: { dialogOptions: "dontDisplay" },
        }], {});
      }

      const guideY = Math.round(slideH);
      if (guideY > 0 && guideY < docHeight) {
        await action.batchPlay([{
          _obj: "make",
          _target: [{ _ref: "guide" }],
          new: {
            _obj: "guide",
            position: { _unit: "pixelsUnit", _value: guideY },
            orientation: { _enum: "orientation", _value: "horizontal" },
          },
          _options: { dialogOptions: "dontDisplay" },
        }], {});
      }
    }, { commandName: "Add Guides" });

    setStatus(`Guides updated for ${slideCount} slide(s) at ${slideW}x${slideH}px`, "success");
  } catch (e) {
    showError("Add Guides failed", e);
  }
}


// --- Auto Resize Extensions ---
// Button database with raw SVGs matching panel theme
const BUTTON_DEFS = {
  "btn-width": { title: "Fit Height", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><polyline points="8 7 12 3 16 7"/><polyline points="8 17 12 21 16 17"/><line x1="3" y1="12" x2="21" y2="12"/><polyline points="7 8 3 12 7 16"/><polyline points="17 8 21 12 17 16"/></svg>` },
  "btn-both": { title: "Fit Width", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="12" x2="22" y2="12"/><polyline points="7 7 2 12 7 17"/><polyline points="17 7 22 12 17 17"/><line x1="2" y1="5" x2="2" y2="19"/><line x1="22" y1="5" x2="22" y2="19"/></svg>` },
  "btn-stretch-all": { title: "Stretch to Fill", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 3 3 9 5"/><polyline points="15 5 21 3 19 9"/><polyline points="5 15 3 21 9 19"/><polyline points="19 15 21 21 15 19"/><line x1="3" y1="3" x2="10" y2="10"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/><line x1="21" y1="21" x2="14" y2="14"/></svg>` },
  "btn-rotate-left": { title: "Rotate 90° CCW", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>` },
  "btn-rotate-right": { title: "Rotate 90° CW", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-4.95"/></svg>` },
  "btn-smart-object": { title: "Convert to Smart Objects", variant: "smart-object", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><rect x="8" y="8" width="8" height="8"/><line x1="3" y1="3" x2="8" y2="8"/><line x1="21" y1="3" x2="16" y2="8"/><line x1="3" y1="21" x2="8" y2="16"/><line x1="21" y1="21" x2="16" y2="16"/></svg>` },
  "btn-smart-merge": { title: "Merge all into ONE Smart Object", variant: "smart-merge", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="2" width="8" height="8" rx="1"/><rect x="2" y="14" width="8" height="8" rx="1"/><rect x="14" y="14" width="8" height="8" rx="1"/><path d="M10 6h4M6 10v4M18 10v4M10 18h4"/></svg>` },
  "btn-place-embed": { title: "Place Embedded", variant: "place-embed", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>` },
  "btn-new-layer": { title: "New Layer", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>` },
  "btn-rasterize": { title: "Rasterize Layer", variant: "rasterize", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="8" height="8" rx="1.5"/><path d="M15 5h2M19 5h.01M15 9h.01M19 9h2M15 13h2M19 13h.01M15 17h.01M19 17h2"/><path d="M11 8l4 4"/></svg>` },
  "btn-align-left": { title: "Align Left", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="4" y2="20"/><rect x="8" y="6" width="12" height="4"/><rect x="8" y="14" width="8" height="4"/></svg>` },
  "btn-align-h-center": { title: "Align H Center", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="4" x2="12" y2="20"/><rect x="4" y="7" width="16" height="4"/><rect x="7" y="13" width="10" height="4"/></svg>` },
  "btn-align-right": { title: "Align Right", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="20" y1="4" x2="20" y2="20"/><rect x="4" y="6" width="12" height="4"/><rect x="8" y="14" width="8" height="4"/></svg>` },
  "btn-align-top": { title: "Align Top", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="20" y2="4"/><rect x="6" y="8" width="4" height="12"/><rect x="14" y="8" width="4" height="8"/></svg>` },
  "btn-align-v-center": { title: "Align V Center", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="12" x2="20" y2="12"/><rect x="6" y="4" width="4" height="16"/><rect x="14" y="7" width="4" height="10"/></svg>` },
  "btn-align-bottom": { title: "Align Bottom", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="20" x2="20" y2="20"/><rect x="6" y="4" width="4" height="12"/><rect x="14" y="8" width="4" height="8"/></svg>` },
  "btn-distribute-h": { title: "Flip Horizontal", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><polyline points="7 8 3 12 7 16"/><polyline points="17 8 21 12 17 16"/></svg>` },
  "btn-distribute-v": { title: "Flip Vertical", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><polyline points="8 7 12 3 16 7"/><polyline points="8 17 12 21 16 17"/></svg>` },
  "btn-visibility": { title: "Toggle Visibility", variant: "visibility", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/><line x1="1" y1="1" x2="23" y2="23"/></svg>` },
  "btn-delete": { title: "Delete Layer", variant: "danger", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>` },
  "btn-link-layers": { title: "Link Layers", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>` },
  "btn-invert": { title: "Invert Colors", variant: "invert", svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="invertGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" style="stop-color:#FFFFFF;stop-opacity:1"/><stop offset="100%" style="stop-color:#000000;stop-opacity:1"/></linearGradient></defs><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M 12 2 A 10 10 0 0 1 22 12 L 12 12 Z" fill="url(#invertGrad)"/><path d="M 12 12 L 22 12 A 10 10 0 0 1 12 22 Z" fill="url(#invertGrad)" opacity="0.5"/></svg>` }
};

const DEFAULT_LAYOUT = [
  [{ id: "g-transform", name: "Transform", buttons: ["btn-width", "btn-both", "btn-stretch-all", "btn-rotate-left", "btn-rotate-right", "btn-smart-object", "btn-smart-merge", "btn-place-embed", "btn-new-layer"] }],
  [{ id: "g-align", name: "Align", buttons: ["btn-align-left", "btn-align-h-center", "btn-align-right", "btn-align-top", "btn-align-v-center", "btn-align-bottom"] }],
  [{ id: "g-flip", name: "Flip", buttons: ["btn-distribute-h", "btn-distribute-v"] },
  { id: "g-actions", name: "Actions", buttons: ["btn-visibility", "btn-invert", "btn-delete", "btn-rasterize"] },
  { id: "g-manage", name: "Manage", buttons: ["btn-link-layers"] }]
];

const STORAGE_KEY = "autosizelayer_layout_v8";
const AUTO_SAVE_PREFERENCE_KEY = "tools_auto_save_minutes_v1";
let layout = [];
let isLayoutEditMode = false;
const AUTO_SAVE_MINUTES = [3, 5, 10];
let autoSaveIntervalId = null;
let autoSaveTargetDocId = null;
let autoSaveTargetDocTitle = "";
let autoSaveEndsAt = 0;
let autoSaveDurationMinutes = null;
let preferredAutoSaveMinutes = 5;
let autoSaveLastPulseSecond = null;
const DEFAULT_HEADER_TITLE = "Slide Creator";

function cloneDefaultLayout() {
  return JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
}

function ensureRasterizeButton(layoutState) {
  const alreadyPresent = layoutState.some((row) =>
    row.some((group) => (group.buttons || []).includes("btn-rasterize"))
  );
  if (alreadyPresent) return;

  const actionsGroup = layoutState.flat().find((group) => group.id === "g-actions");
  if (actionsGroup) {
    const deleteIndex = actionsGroup.buttons.indexOf("btn-delete");
    if (deleteIndex === -1) actionsGroup.buttons.push("btn-rasterize");
    else actionsGroup.buttons.splice(deleteIndex + 1, 0, "btn-rasterize");
    return;
  }

  const defaultActionsGroup = cloneDefaultLayout().flat().find((group) => group.id === "g-actions");
  if (!defaultActionsGroup) return;

  if (layoutState.length === 0) layoutState.push([]);
  layoutState[layoutState.length - 1].push(defaultActionsGroup);
}

function clearAutoSaveTimerState() {
  if (autoSaveIntervalId) {
    window.clearInterval(autoSaveIntervalId);
    autoSaveIntervalId = null;
  }
  autoSaveTargetDocId = null;
  autoSaveTargetDocTitle = "";
  autoSaveEndsAt = 0;
  autoSaveDurationMinutes = null;
  autoSaveLastPulseSecond = null;
  const headerBrand = document.querySelector(".header-brand");
  if (headerBrand) headerBrand.classList.remove("auto-save-pulse");
  const headerTitle = document.querySelector(".header-title");
  if (headerTitle) headerTitle.textContent = DEFAULT_HEADER_TITLE;
}

function loadPreferredAutoSaveMinutes() {
  try {
    const saved = Number(localStorage.getItem(AUTO_SAVE_PREFERENCE_KEY));
    if (AUTO_SAVE_MINUTES.includes(saved)) preferredAutoSaveMinutes = saved;
  } catch (_) { }
}

function savePreferredAutoSaveMinutes(minutes) {
  if (!AUTO_SAVE_MINUTES.includes(minutes)) return;
  preferredAutoSaveMinutes = minutes;
  try {
    localStorage.setItem(AUTO_SAVE_PREFERENCE_KEY, String(minutes));
  } catch (_) { }
}

function formatAutoSaveRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function triggerAutoSavePulse(remainingSeconds) {
  const headerBrand = document.querySelector(".header-brand");
  const headerTitle = document.querySelector(".header-title");
  if (!headerBrand) return;
  if (headerTitle) headerTitle.textContent = `Saving in ${remainingSeconds}`;
  headerBrand.classList.remove("auto-save-pulse");
  void headerBrand.offsetWidth;
  headerBrand.classList.add("auto-save-pulse");
  window.setTimeout(() => {
    headerBrand.classList.remove("auto-save-pulse");
  }, 820);
}

function updateAutoSaveTimerUI() {
  const timerCard = document.getElementById("tools-save-timer-card");
  if (!timerCard) return;

  const buttons = Array.from(timerCard.querySelectorAll(".tools-save-timer-option"));
  const status = timerCard.querySelector(".tools-save-timer-status");
  const hasActiveTimer = !!(autoSaveTargetDocId && autoSaveEndsAt > Date.now());

  buttons.forEach((button) => {
    const buttonMinutes = Number(button.dataset.minutes);
    const isSelected = hasActiveTimer
      ? buttonMinutes === autoSaveDurationMinutes
      : buttonMinutes === preferredAutoSaveMinutes;
    button.classList.toggle("active", isSelected);
  });

  if (!status) return;

  if (!hasActiveTimer) {
    status.textContent = `Default timer: ${preferredAutoSaveMinutes} min. Pick 3, 5, or 10 minutes to start a repeating auto-save loop for the active document.`;
    return;
  }

  const remaining = formatAutoSaveRemaining(autoSaveEndsAt - Date.now());
  status.textContent = `Looping save for "${autoSaveTargetDocTitle}" in ${remaining}. The last 5 seconds pulse green before each save.`;
}

async function runAutoSaveTimerSave() {
  const targetDoc = app.documents.find((doc) => doc.id === autoSaveTargetDocId);
  const timerMinutes = autoSaveDurationMinutes;
  const docLabel = autoSaveTargetDocTitle || "document";

  clearAutoSaveTimerState();
  updateAutoSaveTimerUI();

  if (!targetDoc) {
    showError("Auto-save failed", new Error(`The timed document "${docLabel}" is no longer open.`));
    return;
  }

  try {
    await core.executeAsModal(async () => {
      await targetDoc.save();
    }, {
      commandName: "Timed Save Document",
      interactive: true,
    });

    setStatus(`Saved "${targetDoc.title}". Next auto-save in ${timerMinutes} minutes.`, "success");
    if (app.documents.find((doc) => doc.id === targetDoc.id)) {
      startAutoSaveTimer(timerMinutes, targetDoc, false);
    }
  } catch (e) {
    showError("Auto-save failed", e);
  }
}

function handleAutoSaveTimerTick() {
  if (!autoSaveTargetDocId) {
    clearAutoSaveTimerState();
    updateAutoSaveTimerUI();
    return;
  }

  const remainingMs = autoSaveEndsAt - Date.now();
  if (remainingMs <= 0) {
    runAutoSaveTimerSave();
    return;
  }

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  if (remainingSeconds <= 5 && remainingSeconds !== autoSaveLastPulseSecond) {
    autoSaveLastPulseSecond = remainingSeconds;
    triggerAutoSavePulse(remainingSeconds);
  }

  updateAutoSaveTimerUI();
}

function startAutoSaveTimer(minutes, docOverride = null, persistPreference = true) {
  const doc = docOverride || app.activeDocument;
  if (!doc) {
    showError("Auto-save failed", new Error("No active document."));
    return;
  }

  if (persistPreference) savePreferredAutoSaveMinutes(minutes);
  clearAutoSaveTimerState();

  autoSaveTargetDocId = doc.id;
  autoSaveTargetDocTitle = doc.title || doc.name || "Untitled";
  autoSaveDurationMinutes = minutes;
  autoSaveEndsAt = Date.now() + minutes * 60 * 1000;
  autoSaveLastPulseSecond = null;

  autoSaveIntervalId = window.setInterval(handleAutoSaveTimerTick, 1000);

  updateAutoSaveTimerUI();
  setStatus(`Repeating auto-save set for "${autoSaveTargetDocTitle}" every ${minutes} minutes.`, "working");
}

function renderAutoSaveTimerCard(root) {
  const timerCard = document.createElement("div");
  timerCard.id = "tools-save-timer-card";
  timerCard.className = "tools-save-timer-card";
  timerCard.innerHTML = `
    <div class="tools-save-timer-header">
      <span class="tools-save-timer-kicker">Auto Save</span>
      <span class="tools-save-timer-title">Timed Save</span>
    </div>
    <div class="tools-save-timer-options"></div>
    <div class="tools-save-timer-status"></div>
  `;

  const optionsWrap = timerCard.querySelector(".tools-save-timer-options");
  AUTO_SAVE_MINUTES.forEach((minutes) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tools-save-timer-option";
    button.dataset.minutes = String(minutes);
    button.textContent = `${minutes} min`;
    button.addEventListener("click", () => startAutoSaveTimer(minutes));
    optionsWrap.appendChild(button);
  });

  root.appendChild(timerCard);
  updateAutoSaveTimerUI();
}

// Layout Saving & Loading logic
function saveLayout() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch (_) { }
}

function loadLayout() {
  loadPreferredAutoSaveMinutes();
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        layout = parsed.map(row =>
          row.map(g => ({ ...g, buttons: (g.buttons || []).filter(id => BUTTON_DEFS[id]) }))
            .filter(g => g.id)
        );
        ensureRasterizeButton(layout);
        const allSaved = layout.flat().flatMap(g => g.buttons);
        const newBtns = Object.keys(BUTTON_DEFS).filter(id => !allSaved.includes(id) && id !== "btn-rasterize");
        if (newBtns.length) layout[0][0].buttons.push(...newBtns);
        return;
      }
    }
  } catch (_) { }
  layout = cloneDefaultLayout();
}

function findGroup(id) {
  for (const row of layout) for (const g of row) if (g.id === id) return g;
  return null;
}

function removeGroupFromLayout(groupId) {
  for (let r = 0; r < layout.length; r++) {
    const idx = layout[r].findIndex(g => g.id === groupId);
    if (idx !== -1) {
      layout[r].splice(idx, 1);
      if (!layout[r].length) layout.splice(r, 1);
      return;
    }
  }
}

// UI Panel Rendering logic
function renderLayout() {
  const root = document.getElementById("panel-root");
  if (!root) return;
  root.innerHTML = "";
  document.body.classList.toggle("layout-edit-mode", isLayoutEditMode);

  const topBar = document.createElement("div");
  topBar.className = "panel-topbar";
  const editBtn = document.createElement("div");
  editBtn.className = "layout-edit-btn" + (isLayoutEditMode ? " active" : "");
  editBtn.textContent = isLayoutEditMode ? "Done" : "Edit";
  editBtn.addEventListener("click", () => { isLayoutEditMode = !isLayoutEditMode; renderLayout(); });
  const resetBtn = document.createElement("div");
  resetBtn.className = "layout-reset-btn";
  resetBtn.textContent = "Reset";
  resetBtn.addEventListener("click", () => { layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT)); saveLayout(); renderLayout(); });
  topBar.appendChild(editBtn);
  topBar.appendChild(resetBtn);
  root.appendChild(topBar);

  layout.forEach((row, rowIdx) => {
    if (rowIdx > 0) root.appendChild(makeRowDivider(rowIdx));
    const rowEl = document.createElement("div");
    rowEl.className = "layout-row";
    rowEl.dataset.rowIdx = rowIdx;
    row.forEach((group, colIdx) => {
      if (colIdx > 0) rowEl.appendChild(makeSideZone(rowIdx, colIdx));
      rowEl.appendChild(makeGroupEl(group, rowIdx, colIdx));
    });
    rowEl.appendChild(makeSideZone(rowIdx, row.length));
    root.appendChild(rowEl);
  });

  // ── Full-width JPG export button pinned at the bottom ──
  const jpgSpacer = document.createElement("div");
  jpgSpacer.className = "tools-bottom-spacer";
  root.appendChild(jpgSpacer);

  renderAutoSaveTimerCard(root);

  const jpgBtn = document.createElement("div");
  jpgBtn.id = "tools-export-jpg-btn";
  jpgBtn.className = "tools-jpg-btn";
  jpgBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <polyline points="9 15 12 18 15 15"/>
        </svg>
        <span>Export as JPG</span>
    `;
  jpgBtn.title = "Export document as JPG";
  jpgBtn.addEventListener("click", () => showJpgFilenamePrompt(root));
  root.appendChild(jpgBtn);

  // ── PNG Export button ──
  const pngBtn = document.createElement("div");
  pngBtn.className = "tools-png-btn";
  pngBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <polyline points="9 15 12 18 15 15"/>
        </svg>
        <span>Export as PNG</span>
    `;
  pngBtn.title = "Export document as PNG";
  pngBtn.addEventListener("click", () => exportAllLayersAsImages("png"));
  root.appendChild(pngBtn);

  // ── Export All Layers button ──
  const exportAllBtn = document.createElement("div");
  exportAllBtn.className = "tools-export-all-btn";
  exportAllBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <span>Export All Layers</span>
    `;
  exportAllBtn.title = "Export all layers as separate image files";
  exportAllBtn.addEventListener("click", () => showLayerExportSelector());
  root.appendChild(exportAllBtn);

  wireActions();
}

function showJpgFilenamePrompt(root) {
  // Remove any existing prompt
  const existing = root.querySelector(".jpg-prompt-wrap");
  if (existing) { existing.remove(); return; }

  const doc = typeof app !== "undefined" && app.activeDocument;
  const defaultName = doc ? doc.title.replace(/\.[^/.]+$/, "") : "export";

  const wrap = document.createElement("div");
  wrap.className = "jpg-prompt-wrap";

  const input = document.createElement("input");
  input.type = "text";
  input.value = defaultName;
  input.className = "jpg-prompt-input";
  input.placeholder = "Filename...";
  input.spellcheck = false;
  input.autocomplete = "off";

  const saveBtn = document.createElement("div");
  saveBtn.className = "jpg-prompt-save";
  saveBtn.textContent = "Save";

  const cancelBtn = document.createElement("div");
  cancelBtn.className = "jpg-prompt-cancel";
  cancelBtn.textContent = "✕";

  wrap.appendChild(input);
  wrap.appendChild(saveBtn);
  wrap.appendChild(cancelBtn);

  // Insert the prompt directly after the JPG button
  const jpgBtn = root.querySelector(".tools-jpg-btn");
  if (jpgBtn) jpgBtn.after(wrap);
  else root.appendChild(wrap);

  // Focus and select the input text
  setTimeout(() => { input.focus(); input.select(); }, 50);

  const doSave = () => {
    const name = input.value.trim() || defaultName;
    wrap.remove();
    exportDocument("jpg", name);
  };

  saveBtn.addEventListener("click", doSave);
  cancelBtn.addEventListener("click", () => wrap.remove());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSave();
    if (e.key === "Escape") wrap.remove();
  });
}

function makeRowDivider(rowIdx) {
  const wrap = document.createElement("div"); wrap.className = "row-drop-divider"; wrap.dataset.afterRowIdx = rowIdx - 1;
  const line = document.createElement("div"); line.className = "row-divider-line"; wrap.appendChild(line);
  return wrap;
}

function makeSideZone(rowIdx, colIdx) {
  const el = document.createElement("div"); el.className = "side-drop-zone"; el.dataset.rowIdx = rowIdx; el.dataset.colIdx = colIdx;
  return el;
}

function makeGroupEl(group, rowIdx, colIdx) {
  const groupEl = document.createElement("div");
  groupEl.className = "group"; groupEl.dataset.groupId = group.id; groupEl.dataset.rowIdx = rowIdx; groupEl.dataset.colIdx = colIdx;

  const grip = document.createElement("div"); grip.className = "group-grip"; grip.title = "Drag to move group";
  for (let i = 0; i < 6; i++) grip.appendChild(document.createElement("span"));
  initGroupDrag(grip, group.id);
  groupEl.appendChild(grip);

  const buttonsEl = document.createElement("div");
  buttonsEl.className = "group-buttons"; buttonsEl.dataset.groupId = group.id;

  const btns = [...group.buttons];
  let i = 0;
  while (i < btns.length) {
    const id = btns[i];
    const def = BUTTON_DEFS[id];
    if (!def) { i++; continue; }
    const nextDef = btns[i + 1] ? BUTTON_DEFS[btns[i + 1]] : null;
    if (def.isPill && nextDef?.isPill) {
      const pg = document.createElement("div"); pg.className = "pill-group";
      pg.appendChild(makePillBtn(id, def));
      const d = document.createElement("div"); d.className = "pill-divider"; pg.appendChild(d);
      pg.appendChild(makePillBtn(btns[i + 1], nextDef));
      buttonsEl.appendChild(pg); i += 2;
    } else if (def.isPill) {
      const pg = document.createElement("div"); pg.className = "pill-group";
      pg.appendChild(makePillBtn(id, def));
      buttonsEl.appendChild(pg); i++;
    } else {
      buttonsEl.appendChild(makeIconBtn(id, def)); i++;
    }
  }
  groupEl.appendChild(buttonsEl);
  return groupEl;
}

function makeIconBtn(id, def) {
  const btn = document.createElement("div");
  btn.className = "icon-button" + (def.variant ? ` ${def.variant}` : "");
  btn.id = id; btn.title = def.title; btn.innerHTML = def.svg;
  initButtonDrag(btn, id);
  return btn;
}

function makePillBtn(id, def) {
  const btn = document.createElement("div");
  btn.className = "pill-btn" + (def.pillVariant ? ` ${def.pillVariant}` : "");
  btn.id = id; btn.title = def.title; btn.innerHTML = def.svg + `<span class="pill-label">${def.pillLabel}</span>`;
  return btn;
}

// Drag & Drop State
const LONG_PRESS_MS = 380;
let ghost = null;

function initButtonDrag(el, btnId) {
  el.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);

    const rect = el.getBoundingClientRect();
    let timer = null; let dragReady = isLayoutEditMode; let moved = false;
    const startX = e.clientX, startY = e.clientY;
    const offsetX = e.clientX - rect.left, offsetY = e.clientY - rect.top;
    const sourceGroupId = el.closest(".group-buttons")?.dataset.groupId;

    if (isLayoutEditMode) el.classList.add("drag-ready");
    else timer = setTimeout(() => { dragReady = true; el.classList.add("drag-ready"); }, LONG_PRESS_MS);

    const onMove = e2 => {
      if (!dragReady) return;
      const dist = Math.hypot(e2.clientX - startX, e2.clientY - startY);
      if (!moved && dist > 3) {
        moved = true; clearTimeout(timer);
        ghost = el.cloneNode(true); ghost.id = "drag-ghost";
        ghost.style.width = rect.width + "px"; ghost.style.height = rect.height + "px";
        ghost.classList.add("drag-ready");
        document.body.appendChild(ghost);
        el.classList.add("dragging"); el.classList.remove("drag-ready");
      }
      if (moved && ghost) {
        ghost.style.left = (e2.clientX - offsetX) + "px"; ghost.style.top = (e2.clientY - offsetY) + "px";
        clearHighlights();
        const zone = getZoneAt(e2.clientX, e2.clientY, ".group-buttons");
        if (zone) zone.classList.add("drag-over");
      }
    };

    const onUp = e2 => {
      clearTimeout(timer);
      el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerup", onUp); el.removeEventListener("pointercancel", onUp);
      el.classList.remove("drag-ready", "dragging");

      if (moved) {
        const zone = getZoneAt(e2.clientX, e2.clientY, ".group-buttons");
        const tgtId = zone?.dataset.groupId;
        if (tgtId) {
          const src = findGroup(sourceGroupId);
          if (src) src.buttons = src.buttons.filter(id => id !== btnId);
          const tgt = findGroup(tgtId);
          if (tgt) {
            const btnEls = Array.from(zone.querySelectorAll(".icon-button, .pill-btn"));
            let ins = tgt.buttons.length;
            for (let i = 0; i < btnEls.length; i++) {
              const r = btnEls[i].getBoundingClientRect();
              if (e2.clientX < r.left + r.width / 2) {
                const idx = tgt.buttons.indexOf(btnEls[i].id);
                if (idx !== -1) { ins = idx; break; }
              }
            }
            tgt.buttons.splice(ins, 0, btnId);
          }
          saveLayout(); renderLayout();
        } else renderLayout();
      } else if (!moved) fireAction(btnId);

      if (ghost) { ghost.remove(); ghost = null; }
      clearHighlights();
    };

    el.addEventListener("pointermove", onMove); el.addEventListener("pointerup", onUp); el.addEventListener("pointercancel", onUp);
  });
}

function initGroupDrag(handleEl, groupId) {
  handleEl.addEventListener("pointerdown", e => {
    if (!isLayoutEditMode || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    handleEl.setPointerCapture(e.pointerId);

    const groupEl = handleEl.closest(".group");
    const rect = groupEl.getBoundingClientRect();
    let moved = false;
    const startX = e.clientX, startY = e.clientY;
    const offsetX = e.clientX - rect.left, offsetY = e.clientY - rect.top;

    const onMove = e2 => {
      if (!moved && Math.hypot(e2.clientX - startX, e2.clientY - startY) > 4) {
        moved = true; handleEl.classList.add("grip-ready");
        ghost = groupEl.cloneNode(true); ghost.id = "drag-ghost";
        ghost.style.width = rect.width + "px"; ghost.style.opacity = "0.82"; ghost.style.background = "#1e1e1e";
        ghost.style.borderRadius = "6px"; ghost.style.padding = "4px"; ghost.style.border = "1px solid #555";
        document.body.appendChild(ghost); groupEl.style.opacity = "0.2";
      }
      if (moved && ghost) {
        ghost.style.left = (e2.clientX - offsetX) + "px"; ghost.style.top = (e2.clientY - offsetY) + "px";
        highlightGroupTarget(e2.clientX, e2.clientY, groupId);
      }
    };

    const onUp = e2 => {
      handleEl.removeEventListener("pointermove", onMove); handleEl.removeEventListener("pointerup", onUp); handleEl.removeEventListener("pointercancel", onUp);
      handleEl.classList.remove("grip-ready"); groupEl.style.opacity = "";
      if (moved) dropGroup(e2.clientX, e2.clientY, groupId);
      if (ghost) { ghost.remove(); ghost = null; }
      clearHighlights();
    };

    handleEl.addEventListener("pointermove", onMove); handleEl.addEventListener("pointerup", onUp); handleEl.addEventListener("pointercancel", onUp);
  });
}

function getZoneAt(x, y, selector) {
  if (ghost) ghost.style.visibility = "hidden";
  const el = document.elementFromPoint(x, y);
  if (ghost) ghost.style.visibility = "";
  return el?.closest(selector) || null;
}

function getGroupDropTarget(x, y, draggingId) {
  for (const z of document.querySelectorAll(".side-drop-zone")) {
    const r = z.getBoundingClientRect();
    if (x >= r.left - 6 && x <= r.right + 6 && y >= r.top && y <= r.bottom) return { type: "side", rowIdx: +z.dataset.rowIdx, colIdx: +z.dataset.colIdx };
  }
  for (const z of document.querySelectorAll(".row-drop-divider")) {
    const r = z.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return { type: "row", afterRowIdx: +z.dataset.afterRowIdx };
  }
  for (const g of document.querySelectorAll(".group")) {
    if (g.dataset.groupId === draggingId) continue;
    const r = g.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return { type: "on-group", targetGroupId: g.dataset.groupId, rowIdx: +g.dataset.rowIdx, colIdx: +g.dataset.colIdx };
  }
  return null;
}

function highlightGroupTarget(x, y, draggingId) {
  clearHighlights();
  const t = getGroupDropTarget(x, y, draggingId);
  if (!t) return;
  if (t.type === "side") document.querySelector(`.side-drop-zone[data-row-idx="${t.rowIdx}"][data-col-idx="${t.colIdx}"]`)?.classList.add("side-drop-active");
  else if (t.type === "row") document.querySelector(`.row-drop-divider[data-after-row-idx="${t.afterRowIdx}"]`)?.classList.add("row-drop-active");
  else if (t.type === "on-group") document.querySelector(`.group[data-group-id="${t.targetGroupId}"]`)?.classList.add("group-drop-target");
}

function clearHighlights() {
  document.querySelectorAll(".drag-over,.side-drop-active,.row-drop-active,.group-drop-target").forEach(el => el.classList.remove("drag-over", "side-drop-active", "row-drop-active", "group-drop-target"));
}

function dropGroup(x, y, groupId) {
  const t = getGroupDropTarget(x, y, groupId);
  if (!t) return;
  const copy = JSON.parse(JSON.stringify(findGroup(groupId)));
  removeGroupFromLayout(groupId);
  if (t.type === "side") {
    const row = layout[t.rowIdx];
    if (row) row.splice(Math.min(t.colIdx, row.length), 0, copy);
  } else if (t.type === "row") {
    layout.splice(t.afterRowIdx + 1, 0, [copy]);
  } else if (t.type === "on-group") {
    const row = layout[t.rowIdx];
    if (row) row.splice(t.colIdx + 1, 0, copy);
  }
  for (let i = layout.length - 1; i >= 0; i--) if (!layout[i].length) layout.splice(i, 1);
  saveLayout(); renderLayout();
}

// Map IDs to specific Photoshop actions
function fireAction(id) {
  const map = {
    "btn-visibility": toggleVisibility,
    "btn-invert": invertColors,
    "btn-rasterize": rasterizeSelectedLayers,
    "btn-smart-object": convertToSmartObject,
    "btn-smart-merge": convertToSmartObjectMerged,
    "btn-new-layer": createNewLayer,
    "btn-width": () => resizeLayer("height"),
    "btn-both": () => resizeLayer("width"),
    "btn-stretch-all": () => resizeLayer("both"),
    "btn-rotate-left": () => rotateLayer(-90),
    "btn-rotate-right": () => rotateLayer(90),
    "btn-place-embed": placeEmbedded,
    "btn-align-left": () => alignLayersToCanvas("left"),
    "btn-align-h-center": () => alignLayersToCanvas("h-center"),
    "btn-align-right": () => alignLayersToCanvas("right"),
    "btn-align-top": () => alignLayersToCanvas("top"),
    "btn-align-v-center": () => alignLayersToCanvas("v-center"),
    "btn-align-bottom": () => alignLayersToCanvas("bottom"),
    "btn-distribute-h": () => flipLayer("horizontal"),
    "btn-distribute-v": () => flipLayer("vertical"),
    "btn-link-layers": linkSelectedLayers,
    "btn-delete": deleteSelectedLayers,
  };
  if (map[id]) map[id]();
}

function wireActions() {
  Object.keys(BUTTON_DEFS).forEach(id => {
    const el = document.getElementById(id);
    if (el?.classList.contains("pill-btn")) el.addEventListener("click", () => fireAction(id));
  });
}

// ─── Photoshop DOM / Actions Execute Commands ─────────────────────────────
async function invertColors() {
  await core.executeAsModal(async () => {
    const doc = app.activeDocument; if (!doc) return;
    for (const layer of doc.activeLayers.filter(l => !l.locked)) {
      await action.batchPlay([{ _obj: "select", _target: [{ _ref: "layer", _id: layer.id }], makeVisible: false, _options: { dialogOptions: "dontDisplay" } }], {});
      await action.batchPlay([{ _obj: "invert" }], {});
    }
  }, { commandName: "Invert Colors" });
}

async function rasterizeSelectedLayers() {
  const doc = app.activeDocument;
  if (!doc) {
    showError("Rasterize failed", new Error("No active document."));
    return;
  }
  const layers = Array.from(doc.activeLayers || []);
  if (layers.length === 0) {
    showError("Rasterize failed", new Error("No layers selected."));
    return;
  }
  setStatus("Rasterizing layers...", "working");
  try {
    await core.executeAsModal(async () => {
      await action.batchPlay([{
        _obj: "rasterizeLayer",
        _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }]
      }], { synchronousExecution: true });
    }, { commandName: "Rasterize Layers" });
    setStatus("Layers rasterized", "success");
    if (typeof refreshLayerList === "function") refreshLayerList();
  } catch (e) {
    showError("Rasterize failed", e);
  }
}

async function linkSelectedLayers() {
  const doc = app.activeDocument;
  if (!doc) return;
  const layers = Array.from(doc.activeLayers || []);
  if (layers.length < 2) {
    showError("Link failed", new Error("Select at least 2 layers to link."));
    return;
  }

  setStatus("Linking layers...", "working");
  try {
    await core.executeAsModal(async () => {
      await action.batchPlay([{
        _obj: "linkSelectedLayers",
        _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }]
      }], {});
    }, { commandName: "Link Layers" });
    setStatus("Layers linked", "success");
  } catch (e) {
    showError("Link failed", e);
  }
}

async function toggleVisibility() {
  await core.executeAsModal(async () => {
    const doc = app.activeDocument; if (!doc) return;
    doc.activeLayers.forEach(l => { l.visible = !l.visible; });
  }, { commandName: "Toggle Visibility" });
}

async function convertToSmartObject() {
  await core.executeAsModal(async () => {
    const doc = app.activeDocument; if (!doc) return;
    for (const l of doc.activeLayers.filter(l => !l.locked)) {
      try {
        await action.batchPlay([{ _obj: "select", _target: [{ _ref: "layer", _id: l.id }], makeVisible: false, handleSelectedLayers: true }], {});
        await action.batchPlay([{ _obj: "newPlacedLayer" }], {});
      } catch (e) { }
    }
  }, { commandName: "Convert to Smart Objects" });
}

async function convertToSmartObjectMerged() {
  await core.executeAsModal(async () => {
    const doc = app.activeDocument; if (!doc) return;
    const layers = doc.activeLayers.filter(l => !l.locked);
    if (!layers.length) return;
    const refs = layers.map(l => ({ _ref: "layer", _id: l.id }));
    await action.batchPlay([{ _obj: "select", _target: refs, makeVisible: false, _options: { dialogOptions: "dontDisplay" } }], {});
    await action.batchPlay([{ _obj: "newPlacedLayer" }], {});
  }, { commandName: "Merge to Smart Object" });
}

async function createNewLayer() {
  await core.executeAsModal(async () => {
    const doc = app.activeDocument; if (!doc) return;
    await action.batchPlay([{ _obj: "make", _target: [{ _ref: "layer" }], _options: { dialogOptions: "dontDisplay" } }], {});
  }, { commandName: "New Layer" });
}

async function placeEmbedded() {
  await core.executeAsModal(async () => {
    await action.batchPlay([{ _obj: "placeEvent", _options: { dialogOptions: "display" } }], {});
  }, { commandName: "Place Embedded" });
}

async function resizeLayer(mode) {
  await core.executeAsModal(async () => {
    const doc = app.activeDocument; if (!doc) return;
    const layers = doc.activeLayers.filter(l => !l.locked); if (!layers.length) return;
    const docW = Number(doc.width), docH = Number(doc.height);
    for (const layer of layers) {
      const b = layer.bounds;
      const lW = Number(b.right) - Number(b.left), lH = Number(b.bottom) - Number(b.top);
      if (!lW || !lH) continue;
      await action.batchPlay([{ _obj: "select", _target: [{ _ref: "layer", _id: layer.id }], makeVisible: false, _options: { dialogOptions: "dontDisplay" } }], {});
      let sX, sY;
      if (mode === "width") { sX = (docW / lW) * 100; sY = sX; }
      else if (mode === "height") { sY = (docH / lH) * 100; sX = sY; }
      else { sX = (docW / lW) * 100; sY = (docH / lH) * 100; }
      await action.batchPlay([{ _obj: "transform", _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }], freeTransformCenterState: { _enum: "quadCenterState", _value: "QCSAverage" }, offset: { _obj: "offset", horizontal: { _unit: "pixelsUnit", _value: 0 }, vertical: { _unit: "pixelsUnit", _value: 0 } }, width: { _unit: "percentUnit", _value: sX }, height: { _unit: "percentUnit", _value: sY }, _options: { dialogOptions: "dontDisplay" } }], {});
      const nb = layer.bounds;
      const cx = Number(nb.left) + (Number(nb.right) - Number(nb.left)) / 2;
      const cy = Number(nb.top) + (Number(nb.bottom) - Number(nb.top)) / 2;
      const tx = (docW / 2) - cx, ty = (docH / 2) - cy;
      if (Math.abs(tx) > 0.5 || Math.abs(ty) > 0.5)
        await action.batchPlay([{ _obj: "move", _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }], to: { _obj: "offset", horizontal: { _unit: "pixelsUnit", _value: tx }, vertical: { _unit: "pixelsUnit", _value: ty } }, _options: { dialogOptions: "dontDisplay" } }], {});
    }
  }, { commandName: `Fit ${mode}` });
}

async function rotateLayer(degrees) {
  await core.executeAsModal(async () => {
    const doc = app.activeDocument; if (!doc) return;
    for (const layer of doc.activeLayers.filter(l => !l.locked)) {
      await action.batchPlay([{ _obj: "select", _target: [{ _ref: "layer", _id: layer.id }], makeVisible: false, _options: { dialogOptions: "dontDisplay" } }], {});
      await action.batchPlay([{ _obj: "transform", _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }], freeTransformCenterState: { _enum: "quadCenterState", _value: "QCSAverage" }, offset: { _obj: "offset", horizontal: { _unit: "pixelsUnit", _value: 0 }, vertical: { _unit: "pixelsUnit", _value: 0 } }, angle: { _unit: "angleUnit", _value: degrees }, _options: { dialogOptions: "dontDisplay" } }], {});
    }
  }, { commandName: `Rotate ${degrees > 0 ? "Right" : "Left"} 90°` });
}

async function flipLayer(direction) {
  await core.executeAsModal(async () => {
    const doc = app.activeDocument; if (!doc) return;
    for (const layer of doc.activeLayers.filter(l => !l.locked)) {
      await action.batchPlay([{ _obj: "select", _target: [{ _ref: "layer", _id: layer.id }], makeVisible: false, _options: { dialogOptions: "dontDisplay" } }], {});
      const scaleX = direction === "horizontal" ? -100 : 100;
      const scaleY = direction === "vertical" ? -100 : 100;
      await action.batchPlay([{ _obj: "transform", _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }], freeTransformCenterState: { _enum: "quadCenterState", _value: "QCSAverage" }, offset: { _obj: "offset", horizontal: { _unit: "pixelsUnit", _value: 0 }, vertical: { _unit: "pixelsUnit", _value: 0 } }, width: { _unit: "percentUnit", _value: scaleX }, height: { _unit: "percentUnit", _value: scaleY }, _options: { dialogOptions: "dontDisplay" } }], {});
    }
  }, { commandName: `Flip ${direction}` });
}

async function alignLayersToCanvas(mode) {
  const sm = { left: "ADSLefts", "h-center": "ADSCentersH", right: "ADSRights", top: "ADSTops", "v-center": "ADSCentersV", bottom: "ADSBottoms" };
  await core.executeAsModal(async () => {
    const doc = app.activeDocument; if (!doc) return;
    const active = doc.activeLayers.filter(l => !l.locked); if (!active.length) return;
    if (active.length === 1) {
      const layer = active[0], b = layer.bounds;
      const left = Number(b.left), right = Number(b.right), top = Number(b.top), bottom = Number(b.bottom);
      const docW = Number(doc.width), docH = Number(doc.height);
      const cx = left + (right - left) / 2, cy = top + (bottom - top) / 2;
      let tx = 0, ty = 0;
      if (mode === "left") tx = 0 - left;
      else if (mode === "h-center") tx = (docW / 2) - cx;
      else if (mode === "right") tx = docW - right;
      else if (mode === "top") ty = 0 - top;
      else if (mode === "v-center") ty = (docH / 2) - cy;
      else if (mode === "bottom") ty = docH - bottom;
      await layer.translate(tx, ty);
    } else {
      await action.batchPlay([{ _obj: "align", _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }], using: { _enum: "alignDistributeSelector", _value: sm[mode] }, alignToCanvas: true, _options: { dialogOptions: "dontDisplay" } }], {});
    }
  }, { commandName: `Align ${mode}` });
}

async function deleteSelectedLayers() {
  await core.executeAsModal(async () => {
    const doc = app.activeDocument; if (!doc) return;
    for (const l of [...doc.activeLayers]) if (!l.locked) await l.delete();
  }, { commandName: "Delete Selected Layers" });
}

async function exportDocument(format, customName) {
  const doc = app.activeDocument; if (!doc) return;
  const ext = format === "jpg" ? "jpg" : "png";
  const base = customName ? customName : doc.title.replace(/\.[^/.]+$/, "");
  try {
    const folder = await uxpFs.getFolder(); if (!folder) return;
    const file = await folder.createFile(`${base}.${ext}`, { overwrite: true });
    await core.executeAsModal(async () => {
      if (format === "jpg") await doc.saveAs.jpg(file, { quality: 12 }, true);
      else await doc.saveAs.png(file, {}, true);
    }, { commandName: `Export ${ext.toUpperCase()}` });
  } catch (e) { }
}

let exportLayerSelection = new Set();

async function showLayerExportSelector() {
  const doc = app.activeDocument;
  if (!doc) {
    setStatus("No document open", "error");
    return;
  }

  const allLayers = getAllLayersRecursive(doc);
  const exportableLayers = allLayers.filter(l => !l.locked && (!l.layers || l.layers.length === 0));

  if (exportableLayers.length === 0) {
    setStatus("No exportable layers found", "error");
    return;
  }

  const existingModal = document.getElementById("layer-export-modal");
  if (existingModal) existingModal.remove();

  const modal = document.createElement("div");
  modal.id = "layer-export-modal";
  modal.className = "modal-overlay";

  const modalContent = document.createElement("div");
  modalContent.className = "modal-content layer-export-modal-content";

  const header = document.createElement("div");
  header.className = "modal-header";
  header.innerHTML = `
        <h3>Select Layers to Export</h3>
        <button class="modal-close" id="close-export-modal">&times;</button>
    `;

  const layerList = document.createElement("div");
  layerList.className = "layer-export-list";

  exportableLayers.forEach((layer, idx) => {
    const item = document.createElement("div");
    item.className = "layer-export-item";
    item.innerHTML = `
            <input type="checkbox" class="layer-export-checkbox" data-layer-id="${layer.id}" checked>
            <span class="layer-export-name">${layer.name}</span>
        `;
    layerList.appendChild(item);
  });

  const actions = document.createElement("div");
  actions.className = "layer-export-actions";
  actions.innerHTML = `
        <button class="btn-select-all" id="select-all-export">Select All</button>
        <button class="btn-deselect-all" id="deselect-all-export">Deselect All</button>
        <button class="btn-export-selected" id="btn-do-export-layers">Export Selected</button>
    `;

  modalContent.appendChild(header);
  modalContent.appendChild(layerList);
  modalContent.appendChild(actions);
  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  document.getElementById("close-export-modal").addEventListener("click", () => modal.remove());

  document.getElementById("select-all-export").addEventListener("click", () => {
    document.querySelectorAll(".layer-export-checkbox").forEach(cb => cb.checked = true);
  });

  document.getElementById("deselect-all-export").addEventListener("click", () => {
    document.querySelectorAll(".layer-export-checkbox").forEach(cb => cb.checked = false);
  });

  document.getElementById("btn-do-export-layers").addEventListener("click", async () => {
    const selectedCheckboxes = document.querySelectorAll(".layer-export-checkbox:checked");
    if (selectedCheckboxes.length === 0) {
      setStatus("No layers selected", "error");
      return;
    }

    const selectedLayerIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.layerId);
    modal.remove();
    await doExportSelectedLayers(selectedLayerIds);
  });
}

async function doExportSelectedLayers(layerIds) {
  const doc = app.activeDocument;
  if (!doc) {
    setStatus("No document open", "error");
    return;
  }

  const allLayers = getAllLayersRecursive(doc);
  const selectedLayers = allLayers.filter(l => layerIds.includes(String(l.id)));

  if (selectedLayers.length === 0) {
    setStatus("No valid layers found", "error");
    return;
  }

  setStatus("Preparing to export layers...", "working");

  try {
    const folder = await uxpFs.getFolder();
    if (!folder) {
      setStatus("Export cancelled", "");
      return;
    }

    const exportDir = await folder.createEntry("Layer_Exports", { type: "folder" });
    const originalDocId = doc.id;

    await core.executeAsModal(async () => {
      let exportedCount = 0;

      for (let i = 0; i < selectedLayers.length; i++) {
        const layer = selectedLayers[i];

        try {
          await action.batchPlay([
            {
              _obj: "select",
              _target: [{ _ref: "layer", _id: layer.id }],
              makeVisible: true,
              _options: { dialogOptions: "dontDisplay" }
            }
          ], { dialogOptions: "dontDisplay" });

          let bounds = { left: 0, top: 0, right: 100, bottom: 100 };
          try {
            bounds = layer.boundsNoEffects || layer.bounds || bounds;
          } catch (e) { }

          const layerW = Math.max(1, Math.round(bounds.right - bounds.left));
          const layerH = Math.max(1, Math.round(bounds.bottom - bounds.top));

          const newDoc = await app.documents.add(layerW, layerH, 72, "Export_" + i, constants.NewDocumentMode.RGB, constants.DocumentFill.TRANSPARENT);

          app.activeDocument = doc;

          await action.batchPlay([
            {
              _obj: "copyMerge",
              _options: { dialogOptions: "dontDisplay" }
            }
          ], { dialogOptions: "dontDisplay" });

          app.activeDocument = newDoc;

          await action.batchPlay([
            {
              _obj: "paste",
              _options: { dialogOptions: "dontDisplay" }
            }
          ], { dialogOptions: "dontDisplay" });

          await newDoc.flatten();

          const layerName = layer.name.replace(/[<>:"/\\|?*]/g, "_") || `Layer_${i + 1}`;
          const fileName = `${layerName}.png`;
          const fileEntry = await exportDir.createFile(fileName, { overwrite: true });
          await newDoc.saveAs.png(fileEntry, {}, true);
          await newDoc.close(constants.SaveOptions.DONOTSAVECHANGES);

          exportedCount++;
          setStatus(`Exported ${exportedCount} / ${selectedLayers.length} layer(s)...`, "working");

        } catch (e) {
          console.warn(`Failed to export layer ${layer.name}:`, e);
        }
      }

      const origDoc = app.documents.find(d => d.id === originalDocId);
      if (origDoc) app.activeDocument = origDoc;

      setStatus(`Exported ${exportedCount} layer(s) to "Layer_Exports" folder`, "success");
    }, { commandName: "Export Selected Layers" });

  } catch (e) {
    showError("Failed to export layers", e);
  }
}

async function exportAllLayersAsImages(format) {
  const doc = app.activeDocument;
  if (!doc) {
    setStatus("No document open", "error");
    return;
  }

  setStatus("Exporting all layers...", "working");

  try {
    const allLayers = getAllLayersRecursive(doc);
    if (allLayers.length === 0) {
      setStatus("No layers found to export", "error");
      return;
    }

    const ext = format === "jpg" ? "jpg" : "png";
    const folder = await uxpFs.getFolder();
    if (!folder) {
      setStatus("Export cancelled", "");
      return;
    }

    const exportDir = await folder.createEntry("Layer_Exports", { type: "folder" });

    await core.executeAsModal(async () => {
      let exportedCount = 0;

      for (let i = 0; i < allLayers.length; i++) {
        const layer = allLayers[i];
        if (layer.locked) continue;
        if (layer.layers && layer.layers.length > 0) continue;

        const layerId = layer.id;
        const layerName = layer.name.replace(/[<>:"/\\|?*]/g, "_") || `Layer_${i + 1}`;

        try {
          await action.batchPlay([
            {
              _obj: "select",
              _target: [{ _ref: "layer", _id: layerId }],
              makeVisible: false,
              _options: { dialogOptions: "dontDisplay" }
            },
            {
              _obj: "copyMerge",
              _options: { dialogOptions: "dontDisplay" }
            },
            {
              _obj: "paste",
              _options: { dialogOptions: "dontDisplay" }
            }
          ], {});

          const tempDoc = app.activeDocument;
          if (tempDoc) {
            const fileName = `${layerName}.${ext}`;
            const fileEntry = await exportDir.createFile(fileName, { overwrite: true });

            if (format === "jpg") {
              await tempDoc.saveAs.jpg(fileEntry, { quality: 12 }, true);
            } else {
              await tempDoc.saveAs.png(fileEntry, {}, true);
            }

            await tempDoc.close(constants.SaveOptions.DONOTSAVECHANGES);
            exportedCount++;
            setStatus(`Exported ${exportedCount} layer(s)...`, "working");
          }
        } catch (e) {
          console.warn(`Failed to export layer: ${layerName}`, e);
        }
      }

      if (exportedCount === 0) {
        setStatus("No layers could be exported (locked or empty)", "error");
      } else {
        setStatus(`Exported ${exportedCount} layer(s) to "Layer_Exports" folder`, "success");
      }
    }, { commandName: "Export All Layers" });

  } catch (e) {
    showError("Failed to export layers", e);
  }
}

const initializeAutoResize = () => {
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      invertColors();
    }
  });

  loadLayout();
  renderLayout();
  if (typeof initLayersTab === 'function') initLayersTab();
};

/* initNavigationTabs replaced by initTabs with pointerdown logic */
// ─── Layers Organization Tab Logic ───────────────────────────────

let selectedColor = "red";
let selectedLayerIds = new Set();
let activeFilterColor = null;
let currentLayersInView = [];

function initLayersTab() {
  const searchInput = document.getElementById("layer-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      refreshLayerList(e.target.value);
    });
  }

  const refreshBtn = document.getElementById("btn-refresh-layers");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      refreshLayerList();
    });
  }

  const clearBtn = document.getElementById("clear-color-filter");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      activeFilterColor = null;
      clearBtn.classList.add("hidden");
      const header = document.getElementById("layer-list-header");
      if (header) header.textContent = "Layer List";
      refreshLayerList(document.getElementById("layer-search-input").value);
    });
  }

  // Select All logic
  const selectAllCheck = document.getElementById("layer-select-all");
  if (selectAllCheck) {
    selectAllCheck.addEventListener("change", (e) => {
      if (e.target.checked) {
        currentLayersInView.forEach(l => selectedLayerIds.add(l.id));
      } else {
        currentLayersInView.forEach(l => selectedLayerIds.delete(l.id));
      }
      refreshLayerList(document.getElementById("layer-search-input").value);
    });
  }

  // Color swatches click handler
  const swatches = document.querySelectorAll(".color-swatch-item");
  swatches.forEach(swatch => {
    swatch.addEventListener("click", () => {
      swatches.forEach(s => s.classList.remove("active"));
      swatch.classList.add("active");

      // Set for applying
      selectedColor = swatch.dataset.color;

      // Toggle filtering
      if (selectedColor === "none") {
        activeFilterColor = null;
        if (clearBtn) clearBtn.classList.add("hidden");
        const header = document.getElementById("layer-list-header");
        if (header) header.textContent = "Layer List";
      } else {
        activeFilterColor = selectedColor;
        if (clearBtn) clearBtn.classList.remove("hidden");
        const header = document.getElementById("layer-list-header");
        if (header) header.textContent = `List (${selectedColor.toUpperCase()})`;
      }

      refreshLayerList(document.getElementById("layer-search-input").value);
    });
  });

  const btnGroupColor = document.getElementById("btn-group-color");
  if (btnGroupColor) btnGroupColor.addEventListener("click", handleGroupAndColor);

  const btnColorOnly = document.getElementById("btn-color-only");
  if (btnColorOnly) btnColorOnly.addEventListener("click", handleColorOnly);

  const btnAutoName = document.getElementById("btn-auto-name");
  if (btnAutoName) btnAutoName.addEventListener("click", handleAutoName);

  // Initial population
  setTimeout(() => {
    refreshLayerList();
  }, 500);
}

// Robust helper to get layer color via batchPlay
async function getLayerLabelRobust(id) {
  try {
    const result = await action.batchPlay([
      {
        _obj: "get",
        _target: [{ _ref: "layer", _id: id }],
        _options: { dialogOptions: "dontDisplay" }
      }
    ], {});

    if (result && result[0] && result[0].color) {
      return result[0].color._value;
    }
  } catch (_) { }
  return "none";
}

// ── Flat layer list via batchPlay (guaranteed to work in all UXP versions) ──
async function getAllLayersViaBatchPlay() {
  try {
    const result = await action.batchPlay([{
      _obj: "multiGet",
      _target: { _ref: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }] },
      extendedReference: [
        [{ _property: "layerID" }, { _property: "name" }, { _property: "layerLocking" },
        { _property: "layerKind" }, { _property: "color" }, { _property: "layerSection" }],
        { _ref: "layer", _enum: "ordinal", _value: "front" },
        { _ref: "layer", _enum: "ordinal", _value: "back" }
      ],
      options: { failOnMissingProperty: false }
    }], { dialogOptions: "dontDisplay" });

    if (result && result[0] && result[0].list) {
      return result[0].list;
    }
  } catch (_) { }

  // Fallback: use UXP DOM layers
  try {
    const doc = app.activeDocument;
    if (!doc || !doc.layers) return [];
    const layers = [];
    for (let i = 0; i < doc.layers.length; i++) {
      layers.push(doc.layers[i]);
    }
    return layers;
  } catch (_) { }
  return [];
}

async function refreshLayerList(query = "") {
  const listInner = document.getElementById("layer-list-inner");
  if (!listInner) return;

  try {
    if (!app.activeDocument) {
      listInner.innerHTML = '<span class="no-layers-msg">No document open</span>';
      return;
    }

    // Use reliable recursive traversal from DOM
    const allLayersRaw = getAllLayersRecursive(app.activeDocument);

    // If DOM gave nothing, bail early with message
    if (!allLayersRaw || allLayersRaw.length === 0) {
      listInner.innerHTML = '<span class="no-layers-msg">No layers found. Try Refresh.</span>';
      return;
    }

    // Batch-fetch color labels for all layers in one call
    const batchDescs = allLayersRaw.map(l => ({
      _obj: "get",
      _target: [{ _ref: "layer", _id: l.id }],
      _options: { dialogOptions: "dontDisplay" }
    }));

    let batchResults = [];
    try {
      batchResults = await action.batchPlay(batchDescs, { dialogOptions: "dontDisplay" });
    } catch (_) { }

    // Build enriched list with real color labels
    const allLayers = allLayersRaw.map((layer, idx) => {
      const res = batchResults[idx];
      const colorLabel = (res && res.color) ? res.color._value : "none";
      return { layer, colorLabel };
    });

    const searchInput = document.getElementById("layer-search-input");
    const currentQuery = query !== undefined ? query : (searchInput ? searchInput.value : "");

    // Color Weights for logical sorting
    const colorOrder = {
      "red": 1, "orange": 2, "yellowcolor": 3, "yellow": 3,
      "green": 4, "blue": 5, "violet": 6, "gray": 7, "none": 8
    };

    let filtered = allLayers;

    // 1. Filter by Search Query (using enriched object)
    if (currentQuery) {
      filtered = filtered.filter(entry => entry.layer.name.toLowerCase().includes(currentQuery.toLowerCase()));
    }

    // 2. Filter by Color (using pre-fetched colorLabel)
    if (activeFilterColor) {
      const colorMap = {
        "yellow": ["yellowcolor", "yellow"],
        "red": ["red"],
        "orange": ["orange"],
        "green": ["green"],
        "blue": ["blue"],
        "violet": ["violet"],
        "gray": ["gray"],
      };
      const targetVariants = colorMap[activeFilterColor.toLowerCase()] || [activeFilterColor.toLowerCase()];
      filtered = filtered.filter(entry => targetVariants.some(v => v === entry.colorLabel.toLowerCase()));
    }

    // 3. Sort by Color Weight
    filtered = filtered.sort((a, b) => {
      const weightA = colorOrder[a.colorLabel.toLowerCase()] || 99;
      const weightB = colorOrder[b.colorLabel.toLowerCase()] || 99;
      return weightA - weightB;
    });

    currentLayersInView = filtered.map(e => e.layer);
    listInner.innerHTML = "";

    if (filtered.length === 0) {
      listInner.innerHTML = '<span class="no-layers-msg">No layers match filter</span>';
      return;
    }

    filtered.forEach(({ layer, colorLabel }) => {
      const item = document.createElement("div");
      const id = layer.id;
      const isSelected = selectedLayerIds.has(id);
      item.className = "layer-item" + (isSelected ? " selected" : "");
      item.dataset.layerId = id;

      const isGroup = layer.layers && layer.layers.length > 0;
      const iconUri = isGroup
        ? `<svg viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" fill="currentColor"/></svg>`
        : `<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="2"/></svg>`;

      // Color dot indicator
      const colorDotStyle = colorLabel !== "none"
        ? `background:${colorLabelToHex(colorLabel)};`
        : `background:transparent; border:1px dashed rgba(255,255,255,0.2);`;

      item.innerHTML = `
                <input type="checkbox" class="layer-item-check" ${isSelected ? 'checked' : ''} style="margin:0 4px 0 0; width:12px; height:12px; flex-shrink:0; cursor:pointer;">
                <div class="layer-icon ${isGroup ? 'layer-type-folder' : 'layer-type-pixel'}">
                    ${iconUri}
                </div>
                <div class="layer-name" title="${layer.name}">${layer.name}</div>
                <div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-left:4px;${colorDotStyle}"></div>
            `;

      const check = item.querySelector(".layer-item-check");

      const toggleSelect = () => {
        if (selectedLayerIds.has(id)) selectedLayerIds.delete(id);
        else selectedLayerIds.add(id);
        refreshLayerList(document.getElementById("layer-search-input").value);
      };

      item.addEventListener("click", (e) => {
        if (e.target.type !== "checkbox") toggleSelect();
      });

      check.addEventListener("change", (e) => {
        if (e.target.checked) selectedLayerIds.add(id);
        else selectedLayerIds.delete(id);
        refreshLayerList(document.getElementById("layer-search-input").value);
      });

      listInner.appendChild(item);
    });

    // Update Select All Checkbox state
    const selectAllCheck = document.getElementById("layer-select-all");
    if (selectAllCheck) {
      const allSelected = currentLayersInView.length > 0 && currentLayersInView.every(l => selectedLayerIds.has(l.id));
      selectAllCheck.checked = allSelected;
      selectAllCheck.indeterminate = !allSelected && currentLayersInView.some(l => selectedLayerIds.has(l.id));
    }

  } catch (err) {
    if (listInner) listInner.innerHTML = `<span class="no-layers-msg">Load error: ${err.message}</span>`;
  }
}

// Map PS color label → hex for the color dot
function colorLabelToHex(label) {
  const map = {
    "red": "#f24e4e", "orange": "#f28c4e", "yellowcolor": "#f2d44e",
    "yellow": "#f2d44e", "green": "#4ef285", "blue": "#4ea8f2",
    "violet": "#984ef2", "gray": "#a7a7a7"
  };
  return map[label.toLowerCase()] || "transparent";
}

async function applyColorToLayers(layerIds, color) {
  // Photoshop Label Colors: none, red, orange, yellowColor, green, blue, violet, gray
  const colorMap = {
    "red": "red",
    "orange": "orange",
    "yellow": "yellowColor",
    "green": "green",
    "blue": "blue",
    "violet": "violet",
    "gray": "gray",
    "none": "none"
  };

  const psColor = colorMap[color] || "none";

  await core.executeAsModal(async () => {
    for (const id of layerIds) {
      await action.batchPlay([
        {
          _obj: "set",
          _target: [{ _ref: "layer", _id: id }],
          to: {
            _obj: "layer",
            color: { _enum: "color", _value: psColor }
          }
        }
      ], {});
    }
  }, { commandName: "Apply Color Label" });
}

// Helper to get all layers recursively (Robust for UXP collections)
function getAllLayersRecursive(container) {
  let found = [];
  if (!container || !container.layers) return found;

  // Use standard for loop for UXP collection compatibility
  const layers = container.layers;
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    found.push(layer);

    // Check if it's a group or artboard by checking for layers property
    if (layer.layers && layer.layers.length > 0) {
      found = found.concat(getAllLayersRecursive(layer));
    }
  }
  return found;
}

async function handleColorOnly() {
  const doc = app.activeDocument;
  if (!doc) {
    setStatus("No document open", "error");
    return;
  }

  const nameInput = document.getElementById("layer-action-name");
  const newName = nameInput ? nameInput.value.trim() : "";

  setStatus("Auto-coloring all layers...", "working");

  try {
    const allLayers = getAllLayersRecursive(doc);

    await core.executeAsModal(async () => {
      for (const layer of allLayers) {
        const id = layer.id;

        // Determine Auto-Color
        let psColor = "none";

        if (layer.kind === "text") {
          psColor = "yellowColor";
        } else if (layer.kind === "smartObject") {
          psColor = "violet";
        } else if (layer.kind === "solidColor" || layer.kind === "vector") {
          psColor = "orange";
        } else if (layer.kind === "adjustment" || layer.kind === "brightnessContrast" || layer.kind === "levels") {
          psColor = "red";
        } else if (layer.layers) { // Group
          psColor = "gray";
        } else if (layer.kind === "pixel" || layer.kind === "normal") {
          psColor = "green";
        }

        // Apply Color
        await action.batchPlay([
          {
            _obj: "set",
            _target: [{ _ref: "layer", _id: id }],
            to: {
              _obj: "layer",
              color: { _enum: "color", _value: psColor }
            }
          }
        ], { dialogOptions: "dontDisplay" });

        // Apply Name IF it's one of the MANUALLY selected layers in the list
        // OR if the user just wants to rename EVERY layer (risky, but he asked it re-names)
        // Actually, let's only rename if they were selected in the list, otherwise it's safe.
        if (newName && selectedLayerIds.has(id)) {
          await action.batchPlay([{
            _obj: "set",
            _target: [{ _ref: "layer", _id: id }],
            to: { _obj: "layer", name: newName }
          }], { dialogOptions: "dontDisplay" });
        }
      }
    }, { commandName: "Auto-Color All Layers" });

    setStatus("All layers styled successfully", "success");

    // Short delay to ensure PS state is updated before refreshing the UI list
    setTimeout(() => {
      refreshLayerList(document.getElementById("layer-search-input").value);
    }, 500);
  } catch (e) {
    showError("Failed to auto-style layers", e);
  }
}

async function handleAutoName() {
  const doc = app.activeDocument;
  if (!doc) {
    setStatus("No document open", "error");
    return;
  }

  const nameInput = document.getElementById("layer-action-name");
  const baseName = nameInput ? nameInput.value.trim() : "Layer";

  if (!baseName) {
    setStatus("Enter a base name in the text field", "error");
    return;
  }

  if (selectedLayerIds.size === 0) {
    setStatus("Select layers in the list to start naming from", "error");
    return;
  }

  setStatus("Auto-naming layers...", "working");

  try {
    const allLayers = getAllLayersRecursive(doc);
    const selectedArr = Array.from(selectedLayerIds);

    await core.executeAsModal(async () => {
      let counter = 1;
      for (const layerId of selectedArr) {
        const idNum = Number(layerId);
        const newLayerName = `${baseName} ${counter}`;

        await action.batchPlay([
          {
            _obj: "set",
            _target: [{ _ref: "layer", _id: idNum }],
            to: { _obj: "layer", name: newLayerName }
          }
        ], { dialogOptions: "dontDisplay" });

        counter++;
      }
    }, { commandName: "Auto-Name Layers" });

    setStatus(`Renamed ${selectedArr.length} layer(s) to "${baseName} 1, 2, 3..."`, "success");

    setTimeout(() => {
      refreshLayerList(document.getElementById("layer-search-input").value);
    }, 500);
  } catch (e) {
    showError("Failed to auto-name layers", e);
  }
}

// Helper to find layer in subfolders
function findLayerByIdRecursive(layers, id) {
  for (const layer of layers) {
    if (layer.id === id) return layer;
    if (layer.layers) {
      const found = findLayerByIdRecursive(layer.layers, id);
      if (found) return found;
    }
  }
  return null;
}

async function handleGroupAndColor() {
  if (selectedLayerIds.size === 0) {
    setStatus("Select layers in the list first", "error");
    return;
  }

  const nameInput = document.getElementById("layer-action-name");
  const groupName = (nameInput ? nameInput.value.trim() : "") || "New Group";

  setStatus("Grouping layers...", "working");

  try {
    const ids = Array.from(selectedLayerIds);

    await core.executeAsModal(async () => {
      // 1. Select layers first
      await action.batchPlay([{
        _obj: "select",
        _target: ids.map(id => ({ _ref: "layer", _id: id })),
        makeVisible: false
      }], {});

      // 2. Group them
      await action.batchPlay([{
        _obj: "make",
        _target: [{ _ref: "layerSection" }],
        from: { _ref: "layer", _enum: "ordinal", _value: "targetEnum" },
        name: groupName
      }], {});

      // 3. Color the group
      // The newly created group is now targeted
      const colorMap = {
        "red": "red", "orange": "orange", "yellow": "yellowColor",
        "green": "green", "blue": "blue", "violet": "violet",
        "gray": "gray", "none": "none"
      };
      const psColor = colorMap[selectedColor] || "none";

      await action.batchPlay([{
        _obj: "set",
        _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }],
        to: { _obj: "layer", color: { _enum: "color", _value: psColor } }
      }], {});

    }, { commandName: "Group and Color" });

    setStatus("Grouped and colored successfully", "success");
    selectedLayerIds.clear();
    refreshLayerList(document.getElementById("layer-search-input").value);
  } catch (e) {
    showError("Failed to group layers", e);
  }
}
