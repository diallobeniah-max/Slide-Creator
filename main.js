const app       = require("photoshop").app;
const core      = require("photoshop").core;
const action    = require("photoshop").action;
const constants = require("photoshop").constants;
const uxpFs     = require("uxp").storage.localFileSystem;

// ─── Presets ──────────────────────────────────────────────────────────────────
const PRESETS = {
    instagram: { w: 1080, h: 1080 },
    long:      { w: 1080, h: 1350 },
};

let slides = []; // Array of { id: number, name: string, thumbnailHtml: string }
let originalDocId = null;
let selectedSlideId = null; // To keep track of the currently selected slide
let draggedSlideId = null; // To keep track of the slide being dragged

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

function getDropdownValue(el) {
    if (!el) return "";
    const selected = el.querySelector("sp-menu-item[selected]");
    if (selected) return selected.getAttribute("value") || "";
    if (el.value) return el.value;
    const ariaSelected = el.querySelector("sp-menu-item[aria-selected='true']");
    if (ariaSelected) return ariaSelected.getAttribute("value") || "";
    const first = el.querySelector("sp-menu-item");
    return first ? (first.getAttribute("value") || "") : "";
}

function getVal(id) {
    const el = document.getElementById(id);
    if (el && el.tagName === "SP-DROPDOWN") return getDropdownValue(el);
    return el ? (el.value || "") : "";
}

function getSlideSize() {
    const p = getVal("size-preset");
    if (p === "custom" || !PRESETS[p]) return { w: parseInt(getVal("custom-w")) || 1080, h: parseInt(getVal("custom-h")) || 1080 };
    return PRESETS[p];
}

function getInputs() {
    const { w, h } = getSlideSize();
    return {
        slideW:        w,
        slideH:        h,
        slideCount:    Math.max(1, parseInt(getVal("slide-count")) || 6),
        exportPrefix:  (getVal("export-prefix") || "Slide").trim(),
        exportFormat:  getVal("export-format") || "jpg",
        exportQuality: Math.min(12, Math.max(1, parseInt(getVal("export-quality")) || 10)),
        namingPattern: getVal("naming-pattern") || "document_number",
    };
}

function updateSizeHint() {
    try {
        const { slideW, slideH, slideCount } = getInputs();
        const hint = document.getElementById("size-hint");
        if (hint) hint.textContent = `Total: ${(slideW * slideCount).toLocaleString()} × ${slideH.toLocaleString()} px  ·  Each: ${slideW} × ${slideH}`;
    } catch (_) {}
}

// ─── Slide Thumbnail Management ───────────────────────────────────────────────

function renderThumbnails() {
    const container = document.getElementById("slide-thumbnails-container");
    if (!container) return;

    container.innerHTML = ""; // Clear existing thumbnails

    slides.forEach((slide, index) => {
        const thumbnailElement = document.createElement("div");
        thumbnailElement.className = "slide-thumbnail";
        thumbnailElement.setAttribute("draggable", "true");
        thumbnailElement.dataset.slideId = slide.id; // Store actual Photoshop doc ID
        thumbnailElement.dataset.slideNumber = index + 1; // Store display number

        const imgElement = document.createElement("img");
        imgElement.src = `https://via.placeholder.com/60x60?text=${index + 1}`;
        imgElement.alt = `Slide ${index + 1}`;

        const labelElement = document.createElement("span");
        labelElement.className = "slide-thumbnail-label";
        labelElement.textContent = String(index + 1);

        const controls = document.createElement("div");
        controls.className = "slide-move-controls";

        const moveLeft = document.createElement("button");
        moveLeft.className = "slide-move-button";
        moveLeft.textContent = "◀";
        moveLeft.addEventListener("click", event => {
            event.stopPropagation();
            moveSlideByOffset(slide.id, -1);
        });

        const moveRight = document.createElement("button");
        moveRight.className = "slide-move-button";
        moveRight.textContent = "▶";
        moveRight.addEventListener("click", event => {
            event.stopPropagation();
            moveSlideByOffset(slide.id, 1);
        });

        controls.appendChild(moveLeft);
        controls.appendChild(moveRight);

        if (slide.id === selectedSlideId) {
            thumbnailElement.classList.add("selected");
        }

        thumbnailElement.addEventListener("click", () => {
            selectSlide(slide.id);
        });

        // Drag and drop event listeners
        thumbnailElement.addEventListener("dragstart", (e) => {
            draggedSlideId = slide.id;
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", slide.id);
            thumbnailElement.classList.add("dragging");
        });

        thumbnailElement.addEventListener("dragover", (e) => {
            e.preventDefault(); // Allow drop
            if (e.target.closest(".slide-thumbnail") !== thumbnailElement) {
                thumbnailElement.classList.add("drag-over");
            }
        });

        thumbnailElement.addEventListener("dragleave", () => {
            thumbnailElement.classList.remove("drag-over");
        });

        thumbnailElement.addEventListener("drop", (e) => {
            e.preventDefault();
            thumbnailElement.classList.remove("drag-over");
            const dropTargetId = parseInt(thumbnailElement.dataset.slideId);
            if (draggedSlideId !== dropTargetId) {
                reorderSlides(draggedSlideId, dropTargetId);
            }
        });

        thumbnailElement.addEventListener("dragend", () => {
            thumbnailElement.classList.remove("dragging");
            draggedSlideId = null;
            document.querySelectorAll(".slide-thumbnail").forEach(thumb => {
                thumb.classList.remove("drag-over");
            });
        });

        thumbnailElement.appendChild(imgElement);
        thumbnailElement.appendChild(labelElement);
        thumbnailElement.appendChild(controls);
        container.appendChild(thumbnailElement);
    });
}

function selectSlide(slideId) {
    selectedSlideId = slideId;
    const thumbnails = document.querySelectorAll(".slide-thumbnail");
    thumbnails.forEach(thumb => {
        if (thumb.dataset.slideId === String(slideId)) {
            thumb.classList.add("selected");
        } else {
            thumb.classList.remove("selected");
        }
    });
}

function reorderSlides(draggedId, targetId) {
    const draggedIndex = slides.findIndex(slide => slide.id === draggedId);
    const targetIndex = slides.findIndex(slide => slide.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const [draggedSlide] = slides.splice(draggedIndex, 1);
    slides.splice(targetIndex, 0, draggedSlide);

    renderThumbnails();
}

function moveSlideByOffset(slideId, offset) {
    const currentIndex = slides.findIndex(slide => slide.id === slideId);
    if (currentIndex === -1) return;
    const nextIndex = currentIndex + offset;
    if (nextIndex < 0 || nextIndex >= slides.length) return;
    const [moved] = slides.splice(currentIndex, 1);
    slides.splice(nextIndex, 0, moved);
    selectedSlideId = slideId;
    renderThumbnails();
}

// ─── 1. Create Canvas ─────────────────────────────────────────────────────────
// Resizes the active document if one is open; creates a new one if not.

async function createCanvas() {
    const { slideW, slideH, slideCount } = getInputs();
    const totalW = slideW * slideCount;
    setStatus("Setting up canvas…", "working");
    try {
        await core.executeAsModal(async () => {
            const doc = app.activeDocument;
            if (doc) {
                await action.batchPlay([{
                    _obj: "imageSize",
                    width:      { _unit: "pixelsUnit", _value: totalW },
                    height:     { _unit: "pixelsUnit", _value: slideH },
                    resolution: { _unit: "densityUnit", _value: doc.resolution || 72 },
                    scaleStyles: false,
                    constrainProportions: false,
                    resample: { _enum: "interpolationType", _value: "none" },
                    _options: { dialogOptions: "dontDisplay" }
                }], {});
            } else {
                await app.documents.add({
                    width: totalW, height: slideH,
                    resolution: 72,
                    name: `Slides_${slideCount}_${slideW}x${slideH}`,
                    mode: "RGBColorMode", fill: "white",
                });
            }
        }, { commandName: "Create Canvas" });
        slides = []; // Clear slides on new canvas creation
        renderThumbnails(); // Clear thumbnails
        setStatus(`✓ Canvas ready (${totalW} × ${slideH} px) — design then Crop Slides`, "success");
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
// FIXED: Each slide is cropped in its own executeAsModal, with delete: true to remove artifacts

async function cropSlides() {
    const { slideCount, exportPrefix } = getInputs();
    if (!app.activeDocument) { showError("Crop failed", new Error("No active document.")); return; }

    const origDoc = app.activeDocument;
    originalDocId = origDoc.id;
    const docW    = Number(origDoc.width);
    const docH    = Number(origDoc.height);
    const sliceW  = Math.round(docW / slideCount);

    // Close any previously cropped docs that were never exported
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

    slides = []; // Clear existing slides
    setStatus("Cropping slides…", "working");

    try {
        for (let i = 0; i < slideCount; i++) {
            const num   = i + 1;
            const name  = `${exportPrefix} Slide ${num}`;
            const x     = i * sliceW;
            const right = (i === slideCount - 1) ? docW : Math.min(docW, x + sliceW);
            const partW = Math.max(1, right - x);

            await core.executeAsModal(async () => {
                // Always get fresh reference to original document
                const currentOrigDoc = app.documents.find(d => d.id === originalDocId);
                if (!currentOrigDoc) throw new Error(`Original document not found.`);

                // Duplicate the original document
                const partDoc = await currentOrigDoc.duplicate(name);
                app.activeDocument = partDoc;

                // Use Canvas API to crop instead of batchPlay
                const layer = partDoc.layers[0];
                if (layer && layer.kind === "group") {
                    // If it's a group, just work with bounds
                    await action.batchPlay([{
                        _obj: "canvasSize",
                        width:  { _unit: "pixelsUnit", _value: partW },
                        height: { _unit: "pixelsUnit", _value: docH },
                        _target: [{ _ref: "document", _enum: "ordinal", _value: "targetEnum" }],
                        offset: {
                            _obj: "offset",
                            horizontal: { _unit: "pixelsUnit", _value: -x },
                            vertical: { _unit: "pixelsUnit", _value: 0 }
                        },
                        _options: { dialogOptions: "dontDisplay" }
                    }], {});
                } else {
                    // Use canvas size to crop
                    await action.batchPlay([{
                        _obj: "canvasSize",
                        width:  { _unit: "pixelsUnit", _value: partW },
                        height: { _unit: "pixelsUnit", _value: docH },
                        _target: [{ _ref: "document", _enum: "ordinal", _value: "targetEnum" }],
                        offset: {
                            _obj: "offset",
                            horizontal: { _unit: "pixelsUnit", _value: -x },
                            vertical: { _unit: "pixelsUnit", _value: 0 }
                        },
                        _options: { dialogOptions: "dontDisplay" }
                    }], {});

                    // Flatten to merge layers
                    await action.batchPlay([{
                        _obj: "flattenImage",
                        _target: [{ _ref: "document", _enum: "ordinal", _value: "targetEnum" }],
                        _options: { dialogOptions: "dontDisplay" }
                    }], {});
                }

                slides.push({ id: partDoc.id, name: name });
            }, { commandName: `Crop Slide ${num}` });

            setStatus(`Cropped ${i + 1} / ${slideCount}…`, "working");
        }

        renderThumbnails(); // Render thumbnails after all slides are cropped
        setStatus(`✓ ${slideCount} slides ready — tap Export All`, "success");
    } catch (e) { showError("Crop Slides failed", e); }
}

// ─── 5. Slide Management Actions ──────────────────────────────────────────────

async function duplicateSlide() {
    if (!selectedSlideId) { showError("Duplicate failed", new Error("No slide selected.")); return; }

    setStatus("Duplicating slide…", "working");
    try {
        await core.executeAsModal(async () => {
            const originalSlide = slides.find(s => s.id === selectedSlideId);
            if (!originalSlide) throw new Error("Selected slide not found.");

            const doc = app.documents.find(d => d.id === selectedSlideId);
            if (!doc) throw new Error("Selected document not found.");

            app.activeDocument = doc;
            const newSlideName = `${originalSlide.name} Copy`;
            const duplicatedDoc = await doc.duplicate(newSlideName);

            slides.splice(slides.findIndex(s => s.id === selectedSlideId) + 1, 0, {
                id: duplicatedDoc.id,
                name: newSlideName,
            });
            selectedSlideId = duplicatedDoc.id; // Select the new duplicated slide
        }, { commandName: "Duplicate Slide" });
        renderThumbnails();
        setStatus("✓ Slide duplicated!", "success");
    } catch (e) { showError("Duplicate Slide failed", e); }
}

async function deleteSlide() {
    if (!selectedSlideId) { showError("Delete failed", new Error("No slide selected.")); return; }

    setStatus("Deleting slide…", "working");
    try {
        await core.executeAsModal(async () => {
            const doc = app.documents.find(d => d.id === selectedSlideId);
            if (doc) await doc.close(constants.SaveOptions.DONOTSAVECHANGES);

            slides = slides.filter(s => s.id !== selectedSlideId);
            selectedSlideId = slides.length > 0 ? slides[0].id : null; // Select first slide if available
        }, { commandName: "Delete Slide" });
        renderThumbnails();
        setStatus("✓ Slide deleted!", "success");
    } catch (e) { showError("Delete Slide failed", e); }
}

// ─── 6. Export All Slides ─────────────────────────────────────────────────────

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

// New function to save individual slides directly (without ZIP)
async function exportSlidesDirectly() {
    if (slides.length === 0) { showError("Export failed", new Error("No slides — tap Crop Slides first.")); return; }

    const { exportPrefix, exportFormat, exportQuality, namingPattern } = getInputs();
    const doJpg = exportFormat === "jpg";
    const count = slides.length;
    const ext = doJpg ? "jpg" : "png";

    setStatus("Choose folder to save slides…", "working");
    let folderEntry;
    try {
        folderEntry = await uxpFs.getFolder();
        if (!folderEntry) { setStatus("Export cancelled.", ""); return; }
    } catch (e) { showError("Folder selection failed", e); return; }

    try {
        await core.executeAsModal(async () => {
            for (let i = 0; i < count; i++) {
                const slide = slides[i];
                const num = i + 1;
                const originalDocName = slide.name.split(" Slide")[0];

                let fileName = "";
                if (namingPattern === "document_number") {
                    fileName = `${originalDocName}_${String(num).padStart(2, '0')}`;
                } else {
                    fileName = `${exportPrefix}_${String(num).padStart(2, '0')}`;
                }

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
        }, { commandName: "Export Slides" });

        setStatus(`✓ All ${slides.length} slides exported!`, "success");
        await closeAllSlideDocs();
    } catch (e) {
        showError("Export failed", e);
    }
}

async function exportSlides() {
    // Simply call the direct export function
    await exportSlidesDirectly();
}

// ─── 7. Instagram Preview ─────────────────────────────────────────────────────

async function generateInstagramPreview() {
    if (slides.length === 0) { showError("Preview failed", new Error("No slides — tap Crop Slides first.")); return; }

    const carouselContainer = document.getElementById("instagram-carousel");
    if (!carouselContainer) { showError("Preview failed", new Error("Instagram carousel container not found.")); return; }

    carouselContainer.innerHTML = ""; // Clear existing previews
    setStatus("Generating Instagram preview…", "working");

    try {
        const tempFolder = await uxpFs.getTemporaryFolder();
        await core.executeAsModal(async () => {
            for (let i = 0; i < slides.length; i++) {
                const slide = slides[i];
                const slideDoc = app.documents.find(d => d.id === slide.id);
                if (!slideDoc) throw new Error(`Slide doc ${i + 1} not found.`);

                app.activeDocument = slideDoc;

                const tempFile = await tempFolder.createFile(`preview_slide_${i}.png`, { overwrite: true });
                await slideDoc.saveAs.png(tempFile, {});
                const imageData = await tempFile.read();
                await tempFile.delete(); // Clean up temporary file immediately
                
                const base64ImageData = arrayBufferToBase64(imageData);

                const imgElement = document.createElement("img");
                imgElement.src = `data:image/png;base64,${base64ImageData}`;
                imgElement.alt = `Slide ${i + 1}`;
                imgElement.classList.add("instagram-slide-preview");
                carouselContainer.appendChild(imgElement);
            }
        }, { commandName: "Generate Instagram Preview" });
        setStatus("✓ Instagram preview generated!", "success");
    } catch (e) {
        showError("Generate Instagram Preview failed", e);
    }
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

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

    dropdown.querySelectorAll("sp-menu-item").forEach(menuItem => {
        const menuValue = menuItem.getAttribute("value") || "";
        if (menuValue === itemValue) menuItem.setAttribute("selected", "");
        else menuItem.removeAttribute("selected");
    });

    if (textTarget) textTarget.textContent = item.textContent.trim();
}

function bindDropdownPreview(dropdownId, textTargetId, onSync) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;

    const getEventValue = event => {
        if (event && event.target && event.target.value) return event.target.value;
        return getDropdownValue(dropdown);
    };

    const apply = nextValue => {
        syncDropdownSelection(dropdownId, textTargetId, nextValue);
        if (onSync) onSync(getDropdownValue(dropdown));
    };

    const handleClickSelection = event => {
        const target = event.target;
        if (!target || typeof target.closest !== "function") return;
        const item = target.closest("sp-menu-item");
        if (item) apply(item.getAttribute("value") || "");
    };

    apply(getDropdownValue(dropdown));

    dropdown.addEventListener("change", event => apply(getEventValue(event)));
    dropdown.addEventListener("input", event => apply(getEventValue(event)));
    dropdown.addEventListener("click", handleClickSelection);

    const menu = dropdown.querySelector("sp-menu");
    if (menu) {
        menu.addEventListener("change", event => apply(getEventValue(event)));
        menu.addEventListener("click", handleClickSelection);
    }

    dropdown.querySelectorAll("sp-menu-item").forEach(item => {
        item.addEventListener("click", () => apply(item.getAttribute("value") || ""));
        item.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
                apply(item.getAttribute("value") || "");
            }
        });
    });

    if (typeof MutationObserver === "function") {
        const observer = new MutationObserver(() => apply(getDropdownValue(dropdown)));
        observer.observe(dropdown, {
            subtree: true,
            attributes: true,
            attributeFilter: ["selected", "value", "aria-selected"]
        });
    }
}

function initUI() {
    const customFields = document.getElementById("custom-fields");
    try {
        bindDropdownPreview("size-preset", "size-preset-inline", value => {
            if (customFields) customFields.classList.toggle("hidden", value !== "custom");
            updateSizeHint();
        });
        bindDropdownPreview("export-format", "export-format-inline");
        bindDropdownPreview("naming-pattern", "naming-pattern-inline");
    } catch (_) {}

    ["slide-count", "custom-w", "custom-h", "export-prefix", "export-quality"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("input", updateSizeHint);
            el.addEventListener("change", updateSizeHint);
            el.addEventListener("blur", updateSizeHint);
            // For sp-textfield, also listen for value-change event
            el.addEventListener("value-change", updateSizeHint);
        }
    });

    const btnCreate = document.getElementById("btn-create-canvas");
    const btnAddGuides = document.getElementById("btn-add-guides");
    const btnClearGuides = document.getElementById("btn-clear-guides");
    const btnCrop = document.getElementById("btn-crop-slides");
    const btnExport = document.getElementById("btn-export-slides");
    const btnDuplicate = document.getElementById("btn-duplicate-slide");
    const btnDelete = document.getElementById("btn-delete-slide");
    const btnGeneratePreview = document.getElementById("btn-generate-preview");

    // Note: Button clicks are handled by handleButtonClick via document-level listener
    // No need to add individual addEventListener for these buttons

    if (customFields) customFields.classList.toggle("hidden", getVal("size-preset") !== "custom");
    updateSizeHint();
}

function handleButtonClick(event) {
    const button = event.target.closest("sp-button");
    if (!button) return;
    switch (button.id) {
        case "btn-create-canvas":
            createCanvas();
            break;
        case "btn-add-guides":
            addGuides();
            break;
        case "btn-clear-guides":
            clearGuides();
            break;
        case "btn-crop-slides":
            cropSlides();
            break;
        case "btn-export-slides":
            exportSlides();
            break;
        case "btn-duplicate-slide":
            duplicateSlide();
            break;
        case "btn-delete-slide":
            deleteSlide();
            break;
        case "btn-generate-preview":
            generateInstagramPreview();
            break;
        default:
            break;
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initUI);
} else {
    initUI();
}

document.addEventListener("click", handleButtonClick);
