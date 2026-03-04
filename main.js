const app       = require("photoshop").app;
const core      = require("photoshop").core;
const action    = require("photoshop").action;
const constants = require("photoshop").constants;
const uxpFs     = require("uxp").storage.localFileSystem;

// ─── Presets ──────────────────────────────────────────────────────────────────
const PRESETS = {
    instagram: { w: 933,  h: 932  },
    long:      { w: 4323, h: 5404 },
};

let slideDocIds   = [];
let originalDocId = null;

// ─── UI helpers ───────────────────────────────────────────────────────────────

function setStatus(msg, type) {
    const bar = document.getElementById("status-bar");
    if (bar) { bar.textContent = msg; bar.className = "status-bar" + (type ? " " + type : ""); }
    if (type !== "error") { const log = document.getElementById("error-log"); if (log) log.classList.add("hidden"); }
}

function showError(label, err) {
    const msg = (err && err.message) ? err.message : String(err);
    setStatus(label + " — see details below", "error");
    const log = document.getElementById("error-log");
    if (log) { log.textContent = label + ":\n" + msg; log.classList.remove("hidden"); }
    console.error(label, err);
}

function getVal(id) { const el = document.getElementById(id); return el ? (el.value || "") : ""; }

function getSlideSize() {
    const p = getVal("size-preset");
    if (p === "custom" || !PRESETS[p]) return { w: parseInt(getVal("custom-w")) || 933, h: parseInt(getVal("custom-h")) || 932 };
    return PRESETS[p];
}

function getInputs() {
    const { w, h } = getSlideSize();
    return {
        slideW:        w,
        slideH:        h,
        slideCount:    Math.max(1, parseInt(getVal("slide-count")) || 6),
        exportPrefix:  (getVal("export-prefix") || "slide").trim(),
        exportFormat:  getVal("export-format") || "jpg",
        exportQuality: Math.min(12, Math.max(1, parseInt(getVal("export-quality")) || 10)),
    };
}

function updateSizeHint() {
    try {
        const { slideW, slideH, slideCount } = getInputs();
        const hint = document.getElementById("size-hint");
        if (hint) hint.textContent = `Total: ${(slideW * slideCount).toLocaleString()} × ${slideH.toLocaleString()} px  ·  Each: ${slideW} × ${slideH}`;
    } catch (_) {}
}

// ─── 1. Create Canvas ─────────────────────────────────────────────────────────

async function createCanvas() {
    const { slideW, slideH, slideCount } = getInputs();
    setStatus("Creating canvas…", "working");
    try {
        await core.executeAsModal(async () => {
            await app.documents.add({
                width: slideW * slideCount, height: slideH,
                resolution: 72,
                name: `Slides_${slideCount}_${slideW}x${slideH}`,
                mode: "RGBColorMode", fill: "white",
            });
        }, { commandName: "Create Canvas" });
        slideDocIds = [];
        setStatus(`✓ Canvas created — design your poster then Crop Slides`, "success");
    } catch (e) { showError("Create Canvas failed", e); }
}

// ─── 2. Add Guides ────────────────────────────────────────────────────────────

async function addGuides() {
    const { slideCount } = getInputs();
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
                        position:    { _unit: "pixelsUnit", _value: Math.round(sliceW * i) },
                        orientation: { _enum: "orientation", _value: "vertical" }
                    },
                    _options: { dialogOptions: "dontDisplay" }
                }], {});
            }
        }, { commandName: "Add Guides" });
        setStatus(`✓ ${getInputs().slideCount - 1} guide(s) added`, "success");
    } catch (e) { showError("Add Guides failed", e); }
}

// ─── 3. Clear Guides ──────────────────────────────────────────────────────────

async function clearGuides() {
    setStatus("Clearing guides…", "working");
    try {
        await core.executeAsModal(async () => {
            await action.batchPlay([{
                _obj: "delete",
                _target: [{ _ref: "guide", _enum: "ordinal", _value: "allEnum" }],
                _options: { dialogOptions: "dontDisplay" }
            }], {});
        }, { commandName: "Clear Guides" });
        setStatus("✓ Guides cleared", "success");
    } catch (e) { showError("Clear Guides failed", e); }
}

// ─── 4. Crop Slides ───────────────────────────────────────────────────────────
// Approach:
//   For each slide:
//   1. Duplicate the original doc
//   2. Flatten it
//   3. Make a rectangular marquee selection over the slide region
//   4. Run "crop to selection" (crop with no rect arg = crops to active selection)
//   5. Deselect
//   Leave each cropped doc open — record its ID

async function cropSlides() {
    const { slideCount, exportPrefix } = getInputs();
    if (!app.activeDocument) { showError("Crop failed", new Error("No active document.")); return; }

    const origDoc = app.activeDocument;
    originalDocId = origDoc.id;
    const docW    = Number(origDoc.width);
    const docH    = Number(origDoc.height);
    const sliceW  = Math.round(docW / slideCount);

    slideDocIds = [];
    setStatus("Cropping slides…", "working");

    try {
        await core.executeAsModal(async () => {

            for (let i = 0; i < slideCount; i++) {
                const num   = String(i + 1).padStart(2, "0");
                const name  = `${exportPrefix}_${num}`;
                const x     = i * sliceW;
                const right = (i === slideCount - 1) ? docW : Math.min(docW, x + sliceW);
                const partW = Math.max(1, right - x);

                app.activeDocument = origDoc;

                await action.batchPlay([{
                    _obj: "set",
                    _target: [{ _ref: "channel", _property: "selection" }],
                    to: {
                        _obj: "rectangle",
                        top:    { _unit: "pixelsUnit", _value: 0 },
                        left:   { _unit: "pixelsUnit", _value: x },
                        bottom: { _unit: "pixelsUnit", _value: docH },
                        right:  { _unit: "pixelsUnit", _value: right }
                    },
                    _options: { dialogOptions: "dontDisplay" }
                }], {});

                await action.batchPlay([{
                    _obj: "copyMerged",
                    _options: { dialogOptions: "dontDisplay" }
                }], {});

                await action.batchPlay([{
                    _obj: "set",
                    _target: [{ _ref: "channel", _property: "selection" }],
                    to: { _enum: "ordinal", _value: "none" },
                    _options: { dialogOptions: "dontDisplay" }
                }], {});

                const partDoc = await app.documents.add({
                    width: partW, height: docH,
                    resolution: 72,
                    name,
                    mode: "RGBColorMode", fill: "white",
                });
                app.activeDocument = partDoc;

                await action.batchPlay([{
                    _obj: "paste",
                    _options: { dialogOptions: "dontDisplay" }
                }], {});

                slideDocIds.push(partDoc.id);
                setStatus(`Cropped ${i + 1} / ${slideCount}…`, "working");
            }

            // Return to original
            app.activeDocument = origDoc;

        }, { commandName: "Crop Slides" });

        setStatus(`✓ ${slideCount} slides ready — tap Export All`, "success");

    } catch (e) { showError("Crop Slides failed", e); }
}

// ─── 5. Export All Slides ─────────────────────────────────────────────────────
// Saves each slide doc as the chosen format (JPG or PNG — once each, not both)
// File entries created outside modal, saveAs called inside modal

async function exportSlides() {
    if (slideDocIds.length === 0) { showError("Export failed", new Error("No slides — tap Crop Slides first.")); return; }

    const { exportPrefix, exportFormat, exportQuality } = getInputs();
    const doJpg = exportFormat === "jpg";
    const doPng = exportFormat === "png";

    setStatus("Choose export folder…", "working");
    let folder;
    try {
        folder = await uxpFs.getFolder();
        if (!folder) { setStatus("Export cancelled.", ""); return; }
    } catch (e) { showError("Folder picker failed", e); return; }

    const count = slideDocIds.length;

    for (let i = 0; i < count; i++) {
        const id  = slideDocIds[i];
        const num = String(i + 1).padStart(2, "0");
        const ext = doJpg ? "jpg" : "png";

        // Create file entry outside modal
        let fileEntry;
        try {
            fileEntry = await folder.createFile(`${exportPrefix}_${num}.${ext}`, { overwrite: true });
        } catch (e) { showError(`Slide ${num}: file creation failed`, e); return; }

        try {
            await core.executeAsModal(async () => {
                const slideDoc = app.documents.find(d => d.id === id);
                if (!slideDoc) throw new Error(`Slide doc ${num} not found — was it closed?`);
                app.activeDocument = slideDoc;

                if (doJpg) {
                    await slideDoc.saveAs.jpg(fileEntry, { quality: exportQuality }, true);
                } else {
                    await slideDoc.saveAs.png(fileEntry, {}, true);
                }

                await slideDoc.close(constants.SaveOptions.DONOTSAVECHANGES);

            }, { commandName: `Save slide ${num}` });

            setStatus(`Saved ${i + 1} / ${count}…`, "working");

        } catch (e) { showError(`Export slide ${num} failed`, e); return; }
    }

    slideDocIds = [];

    // Return to original
    try {
        await core.executeAsModal(async () => {
            const orig = app.documents.find(d => d.id === originalDocId);
            if (orig) app.activeDocument = orig;
        }, { commandName: "Refocus original" });
    } catch (_) {}

    setStatus(`✓ All ${count} slides exported as ${exportFormat.toUpperCase()}!`, "success");
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    const presetPicker = document.getElementById("size-preset");
    const customFields = document.getElementById("custom-fields");

    function onPresetChange() {
        customFields.classList.toggle("hidden", presetPicker.value !== "custom");
        updateSizeHint();
    }

    if (presetPicker) {
        presetPicker.addEventListener("change", onPresetChange);
        presetPicker.addEventListener("click",  onPresetChange);
    }

    ["slide-count", "custom-w", "custom-h"].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.addEventListener("input", updateSizeHint); el.addEventListener("change", updateSizeHint); }
    });

    document.getElementById("btn-create-canvas").addEventListener("click", createCanvas);
    document.getElementById("btn-add-guides")   .addEventListener("click", addGuides);
    document.getElementById("btn-clear-guides") .addEventListener("click", clearGuides);
    document.getElementById("btn-crop-slides")  .addEventListener("click", cropSlides);
    document.getElementById("btn-export-slides").addEventListener("click", exportSlides);

    updateSizeHint();
});
