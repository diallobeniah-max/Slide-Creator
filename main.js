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
  } catch (_) {}
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
        left = anchorBounds.right + gap;
        top = anchorBounds.top + i * (artH + gap);
        break;
      case "left":
        left = anchorBounds.left - artW - gap;
        top = anchorBounds.top + i * (artH + gap);
        break;
      case "bottom":
        left = anchorBounds.left + i * (artW + gap);
        top = anchorBounds.bottom + gap;
        break;
      case "up":
        left = anchorBounds.left + i * (artW + gap);
        top = anchorBounds.top - artH - gap;
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
    } catch (e) {}
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
    } catch (_) {}
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

        const partDoc = await currentOrigDoc.duplicate(name);
        app.activeDocument = partDoc;
        await partDoc.crop({
          left: Math.round(x),
          top: 0,
          right: Math.round(x + partW),
          bottom: Math.round(cropBottom),
        }, 0);
        await partDoc.flatten();

        slides.push({ id: partDoc.id, name });
      }, { commandName: `Crop Slide ${num}` });

      setStatus(`Cropped ${i + 1} / ${slideCount}…`, "working");
    }

    updateDeleteSlidesUI();
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
  } catch (_) {}
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
  dropdown.addEventListener("input",  (e) => apply(getEv(e)));
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
  const tabGroup = document.getElementById("main-tabs");
  if (tabGroup) {
    const selectedRadio = tabGroup.querySelector(`sp-radio[value="${tabName}"]`);
    if (selectedRadio) {
      tabGroup.querySelectorAll("sp-radio").forEach((radio) => radio.removeAttribute("checked"));
      selectedRadio.setAttribute("checked", "");
    }
  }

  document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
    const active = panel.dataset.tabPanel === tabName;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}

function initTabs() {
  const tabGroup = document.getElementById("main-tabs");
  if (!tabGroup) return;

  const sync = () => {
    const checkedRadio = tabGroup.querySelector("sp-radio[checked]");
    const value =
      (checkedRadio && checkedRadio.getAttribute("value")) ||
      tabGroup.value ||
      tabGroup.selected ||
      "artboard";
    setActiveTab(value);
  };

  tabGroup.addEventListener("change", sync);
  tabGroup.querySelectorAll("sp-radio").forEach((radio) => {
    radio.addEventListener("click", () => setActiveTab(radio.getAttribute("value") || "artboard"));
  });

  sync();
}

// ─── Init ────────────────────────────────────────────────────────────────────

function initUI() {
  const artCustomFields = document.getElementById("artboard-custom-fields");
  const slideCustomFields = document.getElementById("slide-custom-fields");
  const artboardFromCanvasButton = document.getElementById("btn-artboard-from-layer");
  if (artboardFromCanvasButton) artboardFromCanvasButton.textContent = "Artboard from Canvas Size";
  initTabs();

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

function handleButtonClick(event) {
  const button = event.target.closest("sp-button");
  if (!button) return;
  switch (button.id) {
    case "btn-undo":              stepHistory("undo");             break;
    case "btn-redo":              stepHistory("redo");             break;
    case "btn-fit-screen":        fitViewToScreen();               break;
    case "btn-create-canvas":       createCanvas();                break;
    case "btn-duplicate-artboard":  duplicateArtboardWithDesign(); break;
    case "btn-artboard-from-layer": artboardFromLayerSize();        break;
    case "btn-create-slide":        createSlideLayoutDocument();   break;
    case "btn-add-guides":     addGuides();             break;
    case "btn-clear-guides":   clearGuides();           break;
    case "btn-crop-slides":    cropSlides();            break;
    case "btn-export-slides":  exportSlides();          break;
    case "btn-export-jpg":     exportSlides("jpg");     break;
    case "btn-delete-slides":  deleteSelectedSlides();  break;
    default: break;
  }
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

async function createSlideLayoutDocument() {
  const { slideW, slideH, slideCount, exportPrefix } = getSlideInputs();
  const totalW = Math.max(1, slideW * slideCount);

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
