const app = require("photoshop").app;
const core = require("photoshop").core;
const action = require("photoshop").action;
const constants = require("photoshop").constants;
const uxpStorage = require("uxp").storage;
const uxpFs = require("uxp").storage.localFileSystem;
const uxpFormats = uxpStorage && uxpStorage.formats ? uxpStorage.formats : {};

async function createDocumentCompat(width, height, name, fill = constants.DocumentFill.TRANSPARENT, mode = constants.NewDocumentMode.RGB, resolution = 72) {
  const safeWidth = Math.max(1, Math.round(Number(width) || 1));
  const safeHeight = Math.max(1, Math.round(Number(height) || 1));
  const safeName = String(name || "Untitled");

  try {
    return await app.documents.add({
      width: safeWidth,
      height: safeHeight,
      resolution,
      name: safeName,
      mode,
      fill,
    });
  } catch (objectError) {
    try {
      return await app.documents.add(safeWidth, safeHeight, resolution, safeName, mode, fill);
    } catch (_) {
      throw objectError;
    }
  }
}

// â”€â”€â”€ Presets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const BUILTIN_PRESETS = {
  instagram: { group: "Social", icon: "social", name: "Instagram Post", label: "Instagram Post [W] 1080 x [H] 1080", w: 1080, h: 1080 },
  long: { group: "Social", icon: "social", name: "Instagram Portrait", label: "Instagram Portrait [W] 1080 x [H] 1350", w: 1080, h: 1350 },
  squareVideo: { group: "Social", icon: "social", name: "Square Video", label: "Square Video [W] 1080 x [H] 1080", w: 1080, h: 1080 },
  shorts: { group: "YouTube", icon: "youtube", name: "Short Video", label: "Short Video [W] 1080 x [H] 1920", w: 1080, h: 1920 },
  hd: { group: "YouTube", icon: "youtube", name: "YouTube Video HD", label: "YouTube Video HD [W] 1920 x [H] 1080", w: 1920, h: 1080 },
  youtubeThumb: { group: "YouTube", icon: "youtube", name: "YouTube Thumbnail", label: "YouTube Thumbnail [W] 1280 x [H] 720", w: 1280, h: 720 },
  youtubeBanner: { group: "YouTube", icon: "youtube", name: "YouTube Banner", label: "YouTube Banner [W] 2048 x [H] 1152", w: 2048, h: 1152 },
  youtubeProfile: { group: "YouTube", icon: "youtube", name: "YouTube Profile Picture", label: "YouTube Profile Picture [W] 98 x [H] 98", w: 98, h: 98 },
  googleDisplay: { group: "Google Ads", icon: "ads", name: "Medium Rectangle", label: "Medium Rectangle [W] 300 x [H] 250", w: 300, h: 250 },
  googleLeaderboard: { group: "Google Ads", icon: "ads", name: "Leaderboard", label: "Leaderboard [W] 728 x [H] 90", w: 728, h: 90 },
  googleHalfPage: { group: "Google Ads", icon: "ads", name: "Half Page", label: "Half Page [W] 300 x [H] 600", w: 300, h: 600 },
  googleMobileBanner: { group: "Google Ads", icon: "ads", name: "Mobile Banner", label: "Mobile Banner [W] 320 x [H] 100", w: 320, h: 100 },
  passport: { group: "Photo", icon: "photo", name: "Passport Photo", label: "Passport Photo [W] 600 x [H] 600", w: 600, h: 600 },
  hd720: { group: "Presentation", icon: "slides", name: "Presentation 720p", label: "Presentation 720p [W] 1280 x [H] 720", w: 1280, h: 720 },
  standard: { group: "Presentation", icon: "slides", name: "Standard 4:3", label: "Standard 4:3 [W] 1024 x [H] 768", w: 1024, h: 768 },
  widescreen: { group: "Presentation", icon: "slides", name: "Widescreen", label: "Widescreen [W] 1920 x [H] 1200", w: 1920, h: 1200 },
  a4: { group: "Print", icon: "print", name: "A4 Print", label: "A4 Print [W] 2480 x [H] 3508", w: 2480, h: 3508 },
  a3: { group: "Print", icon: "print", name: "A3 Print", label: "A3 Print [W] 3508 x [H] 4961", w: 3508, h: 4961 },
  letter: { group: "Print", icon: "print", name: "US Letter", label: "US Letter [W] 2550 x [H] 3300", w: 2550, h: 3300 },
  ledger: { group: "Print", icon: "print", name: "US Ledger", label: "US Ledger [W] 3300 x [H] 5100", w: 3300, h: 5100 },
};
const CUSTOM_PRESET_STORAGE_KEY = "slide_creator_custom_size_presets_v1";
const CUSTOM_PRESET_SENTINEL = "custom";
const DEFAULT_SIZE_PRESET_ID = CUSTOM_PRESET_SENTINEL;
const PRESET_GROUP_ORDER = ["Custom", "YouTube", "Social", "Google Ads", "Presentation", "Print", "Photo"];
const PRESET_GROUP_SENTINEL_PREFIX = "__group__:";
const PRESET_ICON_SVGS = {
  youtube: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 15l5-3-5-3v6Z"/><path d="M21.6 7.2a3 3 0 0 0-2.1-2.1C17.8 4.7 12 4.7 12 4.7s-5.8 0-7.5.4A3 3 0 0 0 2.4 7.2 31 31 0 0 0 2 12a31 31 0 0 0 .4 4.8 3 3 0 0 0 2.1 2.1c1.7.4 7.5.4 7.5.4s5.8 0 7.5-.4a3 3 0 0 0 2.1-2.1A31 31 0 0 0 22 12a31 31 0 0 0-.4-4.8Z" fill="currentColor" opacity="0.14"/><path d="M21.6 7.2a3 3 0 0 0-2.1-2.1C17.8 4.7 12 4.7 12 4.7s-5.8 0-7.5.4A3 3 0 0 0 2.4 7.2 31 31 0 0 0 2 12a31 31 0 0 0 .4 4.8 3 3 0 0 0 2.1 2.1c1.7.4 7.5.4 7.5.4s5.8 0 7.5-.4a3 3 0 0 0 2.1-2.1A31 31 0 0 0 22 12a31 31 0 0 0-.4-4.8Z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`,
  ads: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v10H4z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 10h5M7 13h8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M18 7V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`,
  slides: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 19h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M9 9h6M9 12h8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  print: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V4h10v4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 17h10v3H7z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 8h12a3 3 0 0 1 3 3v5h-4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 16H2v-5a3 3 0 0 1 3-3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`,
  photo: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 5l2-2h6l2 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  social: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 8a3 3 0 1 0-2.9-3.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 14a3 3 0 1 0 2.9 3.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M14 10l-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M8 8a3 3 0 1 0 0 6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`,
  custom: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
};
const SIZE_CONTEXTS = {
  artboard: {
    dropdownId: "artboard-preset",
    inlineId: "artboard-preset-inline",
    customWrapId: "artboard-custom-fields",
    widthId: "artboard-custom-w",
    heightId: "artboard-custom-h",
    title: "Artboard",
  },
  slide: {
    dropdownId: "slide-size-preset",
    inlineId: "slide-size-preset-inline",
    customWrapId: "slide-custom-fields",
    widthId: "slide-custom-w",
    heightId: "slide-custom-h",
    title: "Slide",
  },
};
const ARTBOARD_GAP = 140;

let slides = [];
let originalDocId = null;
let selectedSlideId = null;
let draggedSlideId = null;
let statusHideTimer = null;
let customPresets = {};
let presetManagerContext = "artboard";
let presetManagerEditingId = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizePresetDimension(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function slugifyPresetName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
}

function getAllPresets() {
  return { ...BUILTIN_PRESETS, ...customPresets };
}

function getPresetDefinition(id) {
  return getAllPresets()[id] || null;
}

function getPresetLabel(preset) {
  if (!preset) return "";
  return preset.label || `${preset.name || "Preset"} [W] ${preset.w} x [H] ${preset.h}`;
}

function getPresetIconMarkup(iconKey) {
  const svg = PRESET_ICON_SVGS[iconKey] || PRESET_ICON_SVGS.custom;
  return `<span class="preset-menu-icon" aria-hidden="true">${svg}</span>`;
}

function buildPresetMenuItemMarkup(id, preset) {
  const iconKey = (preset && preset.custom) ? "custom" : (preset && preset.icon ? preset.icon : "custom");
  const label = getPresetLabel(preset);
  return `<sp-menu-item class="preset-menu-item" value="${escapeHtml(id)}">${getPresetIconMarkup(iconKey)}<span class="preset-menu-label">${escapeHtml(label)}</span></sp-menu-item>`;
}

function buildPresetGroupHeaderMarkup(groupName) {
  const headerValue = `${PRESET_GROUP_SENTINEL_PREFIX}${String(groupName || "").toLowerCase().replace(/\s+/g, "-")}`;
  return `<sp-menu-item class="preset-group-header" value="${escapeHtml(headerValue)}" disabled>${escapeHtml(groupName)}</sp-menu-item>`;
}

function createCustomPresetRecord(id, name, w, h) {
  const cleanName = String(name || "").trim();
  return {
    id,
    name: cleanName,
    label: `${cleanName} [W] ${w} x [H] ${h}`,
    w,
    h,
    custom: true,
  };
}

function makeCustomPresetId(name, existingId = null) {
  if (existingId) return existingId;
  const base = slugifyPresetName(name) || "my-size";
  let candidate = `user-${base}`;
  let index = 2;
  while (BUILTIN_PRESETS[candidate] || customPresets[candidate]) {
    candidate = `user-${base}-${index}`;
    index += 1;
  }
  return candidate;
}

function loadCustomPresets() {
  customPresets = {};
  try {
    const raw = localStorage.getItem(CUSTOM_PRESET_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed) ? parsed : Object.values(parsed || {});
    entries.forEach((entry) => {
      const name = String(entry && entry.name ? entry.name : "").trim();
      const w = sanitizePresetDimension(entry && entry.w);
      const h = sanitizePresetDimension(entry && entry.h);
      if (!name || !w || !h) return;
      const id = String(entry && entry.id ? entry.id : makeCustomPresetId(name));
      if (BUILTIN_PRESETS[id]) return;
      customPresets[id] = createCustomPresetRecord(id, name, w, h);
    });
  } catch (_) { }
}

function persistCustomPresets() {
  try {
    localStorage.setItem(CUSTOM_PRESET_STORAGE_KEY, JSON.stringify(Object.values(customPresets)));
  } catch (_) { }
}

function getOrderedPresetEntries() {
  const builtIns = Object.entries(BUILTIN_PRESETS);
  const customs = Object.values(customPresets)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((preset) => [preset.id, preset]);
  return [...builtIns, ...customs];
}

function buildPresetOptionMarkup() {
  const groups = new Map();
  Object.entries(BUILTIN_PRESETS).forEach(([id, preset]) => {
    const groupName = preset && preset.group ? preset.group : "Other";
    if (!groups.has(groupName)) groups.set(groupName, []);
    groups.get(groupName).push([id, preset]);
  });
  Object.values(customPresets).forEach((preset) => {
    const groupName = "Custom";
    if (!groups.has(groupName)) groups.set(groupName, []);
    groups.get(groupName).push([preset.id, preset]);
  });

  const orderedGroupNames = PRESET_GROUP_ORDER.filter((g) => groups.has(g));
  const remainingGroupNames = Array.from(groups.keys()).filter((g) => !orderedGroupNames.includes(g)).sort();
  const groupNames = [...orderedGroupNames, ...remainingGroupNames];

  const chunks = [];
  groupNames.forEach((groupName) => {
    chunks.push(buildPresetGroupHeaderMarkup(groupName));
    const items = (groups.get(groupName) || []).slice().sort((a, b) => {
      const aLabel = getPresetLabel(a[1]);
      const bLabel = getPresetLabel(b[1]);
      return aLabel.localeCompare(bLabel);
    });
    if (groupName === "Custom") {
      chunks.push(`<sp-menu-item class="preset-menu-item preset-menu-item-custom" value="${CUSTOM_PRESET_SENTINEL}">${getPresetIconMarkup("custom")}<span class="preset-menu-label">Custom...</span></sp-menu-item>`);
    }
    items.forEach(([id, preset]) => chunks.push(buildPresetMenuItemMarkup(id, preset)));
  });

  if (!groups.has("Custom")) {
    chunks.push(buildPresetGroupHeaderMarkup("Custom"));
    chunks.push(`<sp-menu-item class="preset-menu-item preset-menu-item-custom" value="${CUSTOM_PRESET_SENTINEL}">${getPresetIconMarkup("custom")}<span class="preset-menu-label">Custom...</span></sp-menu-item>`);
  }

  return chunks.join("");
}

function getCurrentPresetSelections() {
  return Object.fromEntries(
    Object.entries(SIZE_CONTEXTS).map(([contextName, config]) => [contextName, getVal(config.dropdownId) || DEFAULT_SIZE_PRESET_ID])
  );
}

function refreshSizePresetDropdowns(preferredSelections = null) {
  const selections = preferredSelections || getCurrentPresetSelections();
  Object.entries(SIZE_CONTEXTS).forEach(([contextName, config]) => {
    const dropdown = document.getElementById(config.dropdownId);
    const menu = dropdown && dropdown.querySelector("sp-menu");
    if (!dropdown || !menu) return;
    const current = selections[contextName] || dropdown.value || DEFAULT_SIZE_PRESET_ID;
    menu.innerHTML = buildPresetOptionMarkup();
    const nextValue = current === CUSTOM_PRESET_SENTINEL || getPresetDefinition(current)
      ? current
      : DEFAULT_SIZE_PRESET_ID;
    syncDropdownSelection(config.dropdownId, config.inlineId, nextValue);
    const customWrap = document.getElementById(config.customWrapId);
    if (customWrap) customWrap.classList.toggle("hidden", nextValue !== CUSTOM_PRESET_SENTINEL);
  });
}

function getContextDimensions(contextName) {
  const config = SIZE_CONTEXTS[contextName] || SIZE_CONTEXTS.artboard;
  const selectedId = getVal(config.dropdownId);
  const preset = getPresetDefinition(selectedId);
  if (preset) {
    return { presetId: selectedId, name: preset.name, w: preset.w, h: preset.h };
  }
  return {
    presetId: CUSTOM_PRESET_SENTINEL,
    name: "",
    w: sanitizePresetDimension(getVal(config.widthId)) || 1080,
    h: sanitizePresetDimension(getVal(config.heightId)) || 1080,
  };
}

function applyPresetToContext(contextName, presetId) {
  const config = SIZE_CONTEXTS[contextName] || SIZE_CONTEXTS.artboard;
  syncDropdownSelection(config.dropdownId, config.inlineId, presetId);
  const customWrap = document.getElementById(config.customWrapId);
  if (customWrap) customWrap.classList.toggle("hidden", presetId !== CUSTOM_PRESET_SENTINEL);
  if (contextName === "artboard") updateArtboardHint();
}

function setPresetManagerFormValues({ name = "", w = "", h = "" } = {}) {
  const nameInput = document.getElementById("preset-manager-name");
  const widthInput = document.getElementById("preset-manager-width");
  const heightInput = document.getElementById("preset-manager-height");
  const saveBtn = document.getElementById("preset-manager-save-btn");
  
  if (nameInput) nameInput.value = name;
  if (widthInput) widthInput.value = w ? String(w) : "";
  if (heightInput) heightInput.value = h ? String(h) : "";
  
  if (saveBtn) {
    saveBtn.textContent = presetManagerEditingId ? "Update Size" : "Save Size";
  }
}

function updatePresetManagerContextText() {
  const contextEl = document.getElementById("preset-manager-context");
  if (!contextEl) return;
  const context = SIZE_CONTEXTS[presetManagerContext] || SIZE_CONTEXTS.artboard;
  contextEl.textContent = `${context.title} preset editor. Saved sizes show in both Artboard and Slide lists.`;
}

function renderPresetManagerList() {
  const list = document.getElementById("preset-manager-list");
  if (!list) return;
  const customList = Object.values(customPresets).sort((a, b) => a.name.localeCompare(b.name));
  if (!customList.length) {
    list.innerHTML = `<div class="preset-manager-empty">No personal saved sizes yet.</div>`;
    return;
  }

  list.innerHTML = customList.map((preset) => `
    <div class="preset-manager-item" data-preset-id="${escapeHtml(preset.id)}">
      <div class="preset-manager-item-main">
        <div class="preset-manager-item-name">${escapeHtml(preset.name)}</div>
        <div class="preset-manager-item-size">${preset.w} Ã— ${preset.h} px</div>
      </div>
      <div class="preset-manager-item-actions">
        <button type="button" data-preset-action="use" data-preset-id="${escapeHtml(preset.id)}" title="Apply this size">Use</button>
        <button type="button" data-preset-action="edit" data-preset-id="${escapeHtml(preset.id)}" title="Edit name or dimensions">Edit</button>
        <button type="button" class="danger" data-preset-action="delete" data-preset-id="${escapeHtml(preset.id)}" title="Remove permanently">Delete</button>
      </div>
    </div>
  `).join("");
}

function resetPresetManagerForm(fromContext = true) {
  presetManagerEditingId = null;
  if (!fromContext) {
    setPresetManagerFormValues();
    return;
  }
  const dims = getContextDimensions(presetManagerContext);
  const preset = dims.presetId && customPresets[dims.presetId] ? customPresets[dims.presetId] : null;
  setPresetManagerFormValues({
    name: preset ? preset.name : "",
    w: dims.w,
    h: dims.h,
  });
}

function openPresetManager(contextName) {
  const modal = document.getElementById("preset-manager-modal");
  if (!modal) return;
  const activeEl = document.activeElement;
  if (activeEl && typeof activeEl.blur === "function") activeEl.blur();
  document.querySelectorAll("sp-dropdown[open]").forEach((el) => el.removeAttribute("open"));
  presetManagerContext = contextName in SIZE_CONTEXTS ? contextName : "artboard";
  updatePresetManagerContextText();
  renderPresetManagerList();
  resetPresetManagerForm(false);
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("preset-modal-open");
}

function closePresetManager() {
  const modal = document.getElementById("preset-manager-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("preset-modal-open");
}

const PRESET_MANAGER_ACTIVATION_GUARD_MS = 350;
const presetManagerActivationTimes = new WeakMap();

function shouldIgnorePresetManagerActivation(button) {
  const now = Date.now();
  const last = presetManagerActivationTimes.get(button) || 0;
  if (now - last < PRESET_MANAGER_ACTIVATION_GUARD_MS) return true;
  presetManagerActivationTimes.set(button, now);
  return false;
}

function openPresetManagerFromButton(button) {
  if (!button || !button.id) return;
  if (button.id === "btn-edit-slide-presets") {
    openPresetManager("slide");
  } else {
    openPresetManager("artboard");
  }
}

function handlePresetManagerPointerDown(event) {
  const button = event.currentTarget;
  if (!button || event.pointerType === "mouse") return;
  event.preventDefault();
  if (shouldIgnorePresetManagerActivation(button)) return;
  openPresetManagerFromButton(button);
}

function handlePresetManagerClick(event) {
  const button = event.currentTarget;
  if (!button || shouldIgnorePresetManagerActivation(button)) return;
  openPresetManagerFromButton(button);
}

function handlePresetManagerKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  const button = event.currentTarget;
  if (!button || shouldIgnorePresetManagerActivation(button)) return;
  openPresetManagerFromButton(button);
}

function deleteCustomPreset(presetId) {
  const preset = customPresets[presetId];
  if (!preset) return;
  delete customPresets[presetId];
  persistCustomPresets();

  const selections = getCurrentPresetSelections();
  Object.entries(SIZE_CONTEXTS).forEach(([contextName, config]) => {
    if (selections[contextName] !== presetId) return;
    setFieldValue(config.widthId, String(preset.w));
    setFieldValue(config.heightId, String(preset.h));
    selections[contextName] = CUSTOM_PRESET_SENTINEL;
  });

  refreshSizePresetDropdowns(selections);
  renderPresetManagerList();
  resetPresetManagerForm(true);
  setStatus(`Removed saved size "${preset.name}".`, "success");
}

function savePresetFromManager() {
  const nameInput = document.getElementById("preset-manager-name");
  const widthInput = document.getElementById("preset-manager-width");
  const heightInput = document.getElementById("preset-manager-height");
  const name = String(nameInput && nameInput.value ? nameInput.value : "").trim();
  const w = sanitizePresetDimension(widthInput && widthInput.value);
  const h = sanitizePresetDimension(heightInput && heightInput.value);

  if (!name || !w || !h) {
    showError("Save size failed", new Error("Enter a name, width, and height greater than zero."));
    return;
  }

  const presetId = makeCustomPresetId(name, presetManagerEditingId);
  const preset = createCustomPresetRecord(presetId, name, w, h);
  customPresets[presetId] = preset;
  persistCustomPresets();
  refreshSizePresetDropdowns({
    ...getCurrentPresetSelections(),
    [presetManagerContext]: presetId,
  });
  applyPresetToContext(presetManagerContext, presetId);
  renderPresetManagerList();
  closePresetManager();
  setStatus(`Saved "${preset.name}" to your preset sizes.`, "success");
}


function initializePresetManager() {
  loadCustomPresets();
  refreshSizePresetDropdowns();

  const artboardButton = document.getElementById("btn-edit-artboard-presets");
  const slideButton = document.getElementById("btn-edit-slide-presets");
  const closeButton = document.getElementById("preset-manager-close");
  const saveButton = document.getElementById("preset-manager-save-btn");
  const cancelButton = document.getElementById("preset-manager-cancel-btn");
  const modal = document.getElementById("preset-manager-modal");
  const list = document.getElementById("preset-manager-list");

  if (artboardButton) {
    artboardButton.addEventListener("pointerdown", handlePresetManagerPointerDown);
    artboardButton.addEventListener("click", handlePresetManagerClick);
    artboardButton.addEventListener("keydown", handlePresetManagerKeydown);
  }
  if (slideButton) {
    slideButton.addEventListener("pointerdown", handlePresetManagerPointerDown);
    slideButton.addEventListener("click", handlePresetManagerClick);
    slideButton.addEventListener("keydown", handlePresetManagerKeydown);
  }
  if (closeButton) closeButton.addEventListener("click", closePresetManager);
  if (saveButton) saveButton.addEventListener("click", savePresetFromManager);
  if (cancelButton) cancelButton.addEventListener("click", () => resetPresetManagerForm(false));
  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closePresetManager();
    });
  }
  if (list) {
    list.addEventListener("click", (event) => {
      const button = event.target && typeof event.target.closest === "function"
        ? event.target.closest("[data-preset-action]")
        : null;
      if (!button) return;
      const presetId = button.getAttribute("data-preset-id") || "";
      const actionName = button.getAttribute("data-preset-action");
      const preset = customPresets[presetId];
      if (!preset) return;

      if (actionName === "use") {
        applyPresetToContext(presetManagerContext, presetId);
        closePresetManager();
        return;
      }

      if (actionName === "edit") {
        presetManagerEditingId = presetId;
        setPresetManagerFormValues({ name: preset.name, w: preset.w, h: preset.h });
        return;
      }
      
      if (actionName === "delete") {
        delete customPresets[presetId];
        persistCustomPresets();
        refreshSizePresetDropdowns();
        renderPresetManagerList();
        setStatus(`Deleted "${preset.name}".`, "info");
        return;
      }


    });
  }
}

const LIBRARY_FOLDER_NAME = "slide_creator_library_assets";
const LIBRARY_META_FILE_NAME = "assets.json";
const LIBRARY_DEFAULT_THUMB =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#252a33"/><path d="M7 35l10-12 8 9 6-7 10 10H7z" fill="#62d6cf"/><circle cx="17" cy="16" r="4" fill="#8ee6df"/><rect x="1.5" y="1.5" width="45" height="45" fill="none" stroke="#5e6675"/></svg>`
  );
const LIBRARY_IMAGE_PREVIEW_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
  "tif",
  "tiff",
  "svg",
  "avif",
  "heic",
  "heif",
  "jp2",
  "j2k",
]);
let libraryFolderEntry = null;
let libraryMetaEntry = null;
let libraryAssets = [];
let selectedLibraryAssetIds = [];

function getSelectedLibraryAssetId() {
  return selectedLibraryAssetIds[0] || null;
}

function getSelectedLibraryAssets() {
  return selectedLibraryAssetIds
    .map((assetId) => libraryAssets.find((asset) => asset.id === assetId))
    .filter(Boolean);
}

function sanitizeAssetName(name) {
  const clean = String(name || "").trim().replace(/\s+/g, " ");
  return clean ? clean.slice(0, 80) : "";
}

function sanitizeAssetFileStem(stem) {
  const clean = String(stem || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return clean || "asset";
}

function getFileExtension(fileName) {
  const dotIndex = String(fileName || "").lastIndexOf(".");
  if (dotIndex < 0) return "";
  return String(fileName).slice(dotIndex + 1).toLowerCase();
}

function isLibraryPreviewableFile(fileName) {
  return LIBRARY_IMAGE_PREVIEW_EXTENSIONS.has(getFileExtension(fileName));
}

function hashLibraryLabel(value) {
  let hash = 0;
  const text = String(value || "asset");
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildLibraryFallbackPreview(fileName, assetName) {
  const labelSource = String(assetName || fileName || "FILE").trim();
  const ext = String(getFileExtension(fileName) || "").toUpperCase();
  const badge = ext ? ext.slice(0, 4) : labelSource.replace(/\s+/g, "").slice(0, 4).toUpperCase() || "FILE";
  const hash = hashLibraryLabel(fileName || assetName || badge);
  const hue = hash % 360;
  const bg = `hsl(${(hue + 204) % 360} 28% 14%)`;
  const fg = `hsl(${hue} 82% 72%)`;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${bg}"/>
          <stop offset="100%" stop-color="hsl(${(hue + 150) % 360} 34% 20%)"/>
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="18" fill="url(#g)"/>
      <rect x="18" y="18" width="124" height="124" rx="14" fill="none" stroke="${fg}" stroke-width="3" stroke-dasharray="7 6" opacity="0.85"/>
      <path d="M46 60h68M46 81h52M46 102h40" fill="none" stroke="${fg}" stroke-width="8" stroke-linecap="round" opacity="0.9"/>
      <text x="80" y="136" text-anchor="middle" font-size="24" font-family="Arial, sans-serif" font-weight="700" fill="${fg}">${badge}</text>
    </svg>
  `;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function buildLibraryPreviewURI(fileName, assetName, nativePath = "") {
  if (nativePath && isLibraryPreviewableFile(fileName)) {
    return String(nativePath).replace(/\\/g, "/");
  }
  return buildLibraryFallbackPreview(fileName, assetName);
}

function formatAssetDate(isoString) {
  const value = new Date(isoString);
  if (!Number.isFinite(value.getTime())) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getAssetPreviewPath(asset) {
  if (!asset) return LIBRARY_DEFAULT_THUMB;
  if (asset.previewURI) return asset.previewURI;
  return LIBRARY_DEFAULT_THUMB;
}

function updateLibrarySelectedSummary(asset) {
  const summary = document.getElementById("library-selected-summary");
  const previewStack = document.getElementById("library-selected-preview-stack");
  const name = document.getElementById("library-selected-name");
  const sub = document.getElementById("library-selected-sub");
  const selectedAssets = getSelectedLibraryAssets();
  const firstAsset = selectedAssets[0] || asset || null;
  const multi = selectedAssets.length > 1;

  if (summary) {
    summary.classList.toggle("is-multi", multi);
  }

  if (previewStack) {
    const previews = multi ? selectedAssets.slice(0, 4) : firstAsset ? [firstAsset] : [];
    previewStack.classList.toggle("multi", multi);
    previewStack.innerHTML = previews.length
      ? previews.map((item) => `<img class="library-selected-preview" src="${escapeHtml(getAssetPreviewPath(item))}" alt="${escapeHtml(item.name)} preview">`).join("")
      : `<img class="library-selected-preview" src="${LIBRARY_DEFAULT_THUMB}" alt="Selected asset preview">`;
  }

  if (name) {
    if (!selectedAssets.length) name.textContent = "No asset selected";
    else if (multi) name.textContent = `${selectedAssets.length} assets selected`;
    else name.textContent = firstAsset ? firstAsset.name : "No asset selected";
  }

  if (sub) {
    if (!selectedAssets.length) {
      sub.textContent = "Tap an asset to apply it to the current project, or add a new file above.";
    } else if (multi) {
      sub.textContent = "Orange highlight means a multi-selection. Use Apply to add them all, or click one asset to work on a single item.";
    } else {
      const created = formatAssetDate(firstAsset.createdAt);
      sub.textContent = `${firstAsset.originalFileName || firstAsset.fileName}${created ? ` · ${created}` : ""}`;
    }
  }
}

async function ensureLibraryStorage() {
  if (libraryFolderEntry && libraryMetaEntry) return;

  const dataFolder = await uxpFs.getDataFolder();
  if (!dataFolder) throw new Error("Unable to access plugin data folder.");

  try {
    libraryFolderEntry = await dataFolder.createEntry(LIBRARY_FOLDER_NAME, { type: "folder" });
  } catch (_) {
    libraryFolderEntry = await dataFolder.getEntry(LIBRARY_FOLDER_NAME);
  }

  try {
    libraryMetaEntry = await libraryFolderEntry.getEntry(LIBRARY_META_FILE_NAME);
  } catch (_) {
    libraryMetaEntry = await libraryFolderEntry.createFile(LIBRARY_META_FILE_NAME, { overwrite: true });
    await libraryMetaEntry.write("[]");
  }
}

async function writeLibraryMetadata() {
  await ensureLibraryStorage();
  const sanitized = libraryAssets.map((asset) => ({
    id: asset.id,
    name: sanitizeAssetName(asset.name),
    fileName: asset.fileName,
    originalFileName: asset.originalFileName || asset.fileName,
    createdAt: asset.createdAt || new Date().toISOString(),
    updatedAt: asset.updatedAt || new Date().toISOString(),
  }));
  await libraryMetaEntry.write(JSON.stringify(sanitized, null, 2));
}

function isLibraryAssetValid(asset) {
  return !!(
    asset &&
    typeof asset.id === "string" &&
    typeof asset.name === "string" &&
    typeof asset.fileName === "string"
  );
}

async function loadLibraryMetadata() {
  await ensureLibraryStorage();
  let parsed = [];
  try {
    const raw = await libraryMetaEntry.read();
    parsed = JSON.parse(raw || "[]");
  } catch (_) {
    parsed = [];
  }

  libraryAssets = parsed
    .filter(isLibraryAssetValid)
    .map((asset) => ({
      ...asset,
      name: sanitizeAssetName(asset.name) || "Untitled Asset",
      updatedAt: asset.updatedAt || asset.createdAt || new Date().toISOString(),
      createdAt: asset.createdAt || new Date().toISOString(),
      previewURI: "",
    }))
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

async function hydrateLibraryPreviewURIs() {
  if (!libraryFolderEntry) return;

  for (const asset of libraryAssets) {
    try {
      const fileEntry = await libraryFolderEntry.getEntry(asset.fileName);
      asset.previewURI = buildLibraryPreviewURI(asset.fileName, asset.name, fileEntry && fileEntry.nativePath ? fileEntry.nativePath : "");
    } catch (_) {
      asset.previewURI = buildLibraryPreviewURI(asset.fileName, asset.name, "");
    }
  }
}

function getLibrarySearchValue() {
  const input = document.getElementById("library-search-input");
  return String((input && input.value) || "").trim().toLowerCase();
}

function getFilteredLibraryAssets() {
  const search = getLibrarySearchValue();
  if (!search) return libraryAssets.slice();
  return libraryAssets.filter((asset) => {
    const haystack = `${asset.name} ${asset.originalFileName || ""}`.toLowerCase();
    return haystack.includes(search);
  });
}

function selectLibraryAsset(assetId, additive = false) {
  const id = String(assetId || "").trim();
  if (!id) return;

  if (additive) {
    if (selectedLibraryAssetIds.includes(id)) {
      selectedLibraryAssetIds = selectedLibraryAssetIds.filter((existingId) => existingId !== id);
    } else {
      selectedLibraryAssetIds = [...selectedLibraryAssetIds, id];
    }
  } else {
    selectedLibraryAssetIds = [id];
  }

  const selectedAsset = libraryAssets.find((asset) => asset.id === getSelectedLibraryAssetId()) || null;
  const nameField = document.getElementById("library-asset-name");
  if (nameField) {
    nameField.value = selectedAsset ? selectedAsset.name : "";
    if (selectedAsset) nameField.setAttribute("value", selectedAsset.name);
  }
  updateLibrarySelectedSummary(selectedAsset);
  renderLibraryAssets();
}

function renderLibraryAssets() {
  const list = document.getElementById("library-assets-list");
  if (!list) return;

  const assets = getFilteredLibraryAssets();
  if (!assets.length) {
    if (libraryAssets.length === 0) {
      list.innerHTML = '<span class="no-layers-msg">No assets saved yet. Add files, save selection, or paste clipboard.</span>';
    } else {
      list.innerHTML = '<span class="no-layers-msg">No matching assets found.</span>';
    }
    return;
  }

  const selectedIds = new Set(selectedLibraryAssetIds);
  const rows = assets.map((asset) => {
    const isSelected = selectedIds.has(asset.id) ? " selected" : "";
    const isMultiSelected = selectedIds.size > 1 && selectedIds.has(asset.id) ? " multi-selected" : "";
    const created = formatAssetDate(asset.createdAt);
    const ext = getFileExtension(asset.fileName).toUpperCase() || "FILE";
    return `
      <div class="library-asset-row${isSelected}${isMultiSelected}" data-library-asset-id="${escapeHtml(asset.id)}" aria-selected="${selectedIds.has(asset.id) ? "true" : "false"}">
        <img class="library-asset-thumb" src="${escapeHtml(getAssetPreviewPath(asset))}" alt="${escapeHtml(asset.name)}" />
        <div class="library-asset-meta">
          <span class="library-asset-name">${escapeHtml(asset.name)}</span>
          <span class="library-asset-sub">${escapeHtml(asset.originalFileName || asset.fileName)}${created ? " · " + escapeHtml(created) : ""}</span>
        </div>
        <div class="library-asset-row-actions">
          <span class="library-asset-badge">${escapeHtml(ext)}</span>
          <button type="button" class="library-row-btn" data-library-action="place" data-library-asset-id="${escapeHtml(asset.id)}" aria-selected="${selectedIds.has(asset.id) ? "true" : "false"}">Apply</button>
          <button type="button" class="library-row-btn" data-library-action="rename" data-library-asset-id="${escapeHtml(asset.id)}" aria-selected="${selectedIds.has(asset.id) ? "true" : "false"}">Rename</button>
          <button type="button" class="library-row-btn danger" data-library-action="delete" data-library-asset-id="${escapeHtml(asset.id)}" aria-selected="${selectedIds.has(asset.id) ? "true" : "false"}">Delete</button>
        </div>
      </div>
    `;
  });
  list.innerHTML = rows.join("");
  updateLibrarySelectedSummary(libraryAssets.find((asset) => asset.id === getSelectedLibraryAssetId()) || null);
}

async function refreshLibraryView() {
  await loadLibraryMetadata();
  await reconcileLibraryMetadataWithFolder();
  await hydrateLibraryPreviewURIs();
  if (selectedLibraryAssetIds.length && !selectedLibraryAssetIds.some((assetId) => libraryAssets.some((asset) => asset.id === assetId))) {
    selectedLibraryAssetIds = [];
  }
  renderLibraryAssets();
}

async function reconcileLibraryMetadataWithFolder() {
  if (!libraryFolderEntry) return;
  let changed = false;
  let entries = [];
  try {
    entries = await libraryFolderEntry.getEntries();
  } catch (_) {
    entries = [];
  }
  const knownFileNames = new Set(libraryAssets.map((asset) => asset.fileName));

  entries.forEach((entry) => {
    if (!entry || entry.isFolder) return;
    const fileName = entry.name || "";
    if (!fileName || fileName === LIBRARY_META_FILE_NAME) return;
    if (knownFileNames.has(fileName)) return;
    const baseName = sanitizeAssetName(fileName.replace(/\.[^/.]+$/, "")) || "Recovered Asset";
    libraryAssets.unshift({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: baseName,
      fileName,
      originalFileName: fileName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      previewURI: buildLibraryPreviewURI(fileName, baseName, entry.nativePath || ""),
    });
    changed = true;
  });

  if (changed) {
    await writeLibraryMetadata();
  }
}

async function getUniqueLibraryFileName(baseName, extension) {
  const stem = sanitizeAssetFileStem(baseName);
  const ext = String(extension || "").replace(/^\./, "").toLowerCase() || "bin";
  let counter = 0;
  while (counter < 2000) {
    const suffix = counter === 0 ? "" : `_${counter + 1}`;
    const candidate = `${stem}${suffix}.${ext}`;
    try {
      await libraryFolderEntry.getEntry(candidate);
      counter += 1;
    } catch (_) {
      return candidate;
    }
  }
  return `${stem}_${Date.now()}.${ext}`;
}

function getFilesFromPickerResult(result) {
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

async function addFilesToLibrary() {
  await ensureLibraryStorage();
  const picked = await uxpFs.getFileForOpening({ allowMultiple: true });
  const files = getFilesFromPickerResult(picked);
  if (!files.length) {
    setStatus("No files selected.", "");
    return;
  }

  const typedName = sanitizeAssetName(getVal("library-asset-name"));
  let importedCount = 0;
  const failedImports = [];

  for (let index = 0; index < files.length; index += 1) {
    const fileEntry = files[index];
    const originalName = fileEntry && fileEntry.name ? fileEntry.name : `Asset_${Date.now()}`;
    const extension = getFileExtension(originalName);

    const baseName = sanitizeAssetName(originalName.replace(/\.[^/.]+$/, "")) || "Asset";
    const finalName = files.length === 1 && typedName ? typedName : baseName;
    const storedFileName = await getUniqueLibraryFileName(finalName, extension);

    try {
      const binary = await fileEntry.read({ format: uxpFormats.binary });
      const storedFile = await libraryFolderEntry.createFile(storedFileName, { overwrite: true });
      await storedFile.write(binary, { format: uxpFormats.binary });

      libraryAssets.unshift({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: finalName,
        fileName: storedFileName,
        originalFileName: originalName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        previewURI: buildLibraryPreviewURI(storedFileName, finalName, storedFile.nativePath || ""),
      });
      importedCount += 1;
    } catch (error) {
      failedImports.push(originalName);
      console.warn("Library import failed for", originalName, error);
    }
  }

  if (!importedCount) {
    if (failedImports.length) {
      const firstThreeFailed = failedImports.slice(0, 3).join(", ");
      const moreFailed = failedImports.length > 3 ? ` (+${failedImports.length - 3} more)` : "";
      setStatus(`Import failed for: ${firstThreeFailed}${moreFailed}`, "error");
    } else {
      setStatus("No supported files imported.", "error");
    }
    return;
  }

  await writeLibraryMetadata();
  selectedLibraryAssetIds = libraryAssets[0] ? [libraryAssets[0].id] : [];
  renderLibraryAssets();
  if (failedImports.length) {
    setStatus(
      `Added ${importedCount} asset(s). ${failedImports.length} file(s) could not be imported.`,
      "success"
    );
  } else {
    setStatus(`Added ${importedCount} asset(s) to Library.`, "success");
  }
}

async function placeLibraryAsset() {
  await ensureLibraryStorage();
  const assets = getSelectedLibraryAssets();
  if (!assets.length) {
    setStatus("Select an asset first.", "error");
    return;
  }

  try {
    const placeDescriptors = [];
    for (const asset of assets) {
      const fileEntry = await libraryFolderEntry.getEntry(asset.fileName);
      const token = uxpFs.createSessionToken(fileEntry);
      placeDescriptors.push({
        _obj: "placeEvent",
        null: {
          _path: token,
          _kind: "local",
        },
        _options: { dialogOptions: "dontDisplay" },
      });
    }
    await core.executeAsModal(async () => {
      await action.batchPlay(placeDescriptors, { synchronousExecution: true });
    }, { commandName: "Place Library Asset" });
    setStatus(assets.length === 1 ? `Applied "${assets[0].name}".` : `Applied ${assets.length} assets.`, "success");
  } catch (error) {
    showError("Place asset failed", error);
  }
}

async function saveTempDocToLibrary(tempDoc, requestedName, originalFileName) {
  await ensureLibraryStorage();
  const finalName = sanitizeAssetName(requestedName) || "Asset";
  const storedFileName = await getUniqueLibraryFileName(finalName, "png");
  const storedFile = await libraryFolderEntry.createFile(storedFileName, { overwrite: true });

  await tempDoc.saveAs.png(storedFile, {}, true);
  await tempDoc.close(constants.SaveOptions.DONOTSAVECHANGES);

  const assetRecord = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: finalName,
    fileName: storedFileName,
    originalFileName: originalFileName || `${finalName}.png`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    previewURI: buildLibraryPreviewURI(storedFileName, finalName, storedFile.nativePath || ""),
  };
  libraryAssets.unshift(assetRecord);
  selectedLibraryAssetIds = [assetRecord.id];
  await writeLibraryMetadata();
  renderLibraryAssets();
}

async function saveSelectedToLibrary() {
  const doc = app.activeDocument;
  if (!doc || !doc.activeLayers || doc.activeLayers.length === 0) {
    setStatus("Select at least one layer first.", "error");
    return;
  }

  const typedName = sanitizeAssetName(getVal("library-asset-name")) || "Selection Asset";
  setStatus("Saving selected layers to Library...", "working");

  try {
    let tempDoc = null;
    await core.executeAsModal(async () => {
      const sourceDoc = app.activeDocument;
      if (!sourceDoc) throw new Error("No active document.");
      const width = Math.max(1, Number(sourceDoc.width) || 2000);
      const height = Math.max(1, Number(sourceDoc.height) || 2000);
      await action.batchPlay([{ _obj: "copyMerged", _options: { dialogOptions: "dontDisplay" } }], {});
      tempDoc = await createDocumentCompat(width, height, "Library_Selection", constants.DocumentFill.TRANSPARENT);
      app.activeDocument = tempDoc;
      await action.batchPlay([{ _obj: "paste", _options: { dialogOptions: "dontDisplay" } }], {});
    }, { commandName: "Save Selection To Library" });

    if (!tempDoc) throw new Error("Failed to capture selected layers.");
    await saveTempDocToLibrary(tempDoc, typedName, `${typedName}.png`);
    setStatus(`Saved "${typedName}" to Library.`, "success");
  } catch (error) {
    showError("Save selection failed", error);
  }
}

async function pasteClipboardToLibrary() {
  const typedName = sanitizeAssetName(getVal("library-asset-name")) || "Clipboard Asset";
  setStatus("Pasting clipboard into Library...", "working");

  try {
    let tempDoc = null;
    await core.executeAsModal(async () => {
      tempDoc = await createDocumentCompat(2200, 2200, "Library_Clipboard", constants.DocumentFill.TRANSPARENT);
      app.activeDocument = tempDoc;
      await action.batchPlay([{ _obj: "paste", _options: { dialogOptions: "dontDisplay" } }], { synchronousExecution: true });
    }, { commandName: "Paste Clipboard To Library" });

    if (!tempDoc) throw new Error("Clipboard paste failed.");
    await saveTempDocToLibrary(tempDoc, typedName, `${typedName}.png`);
    setStatus(`Pasted clipboard as "${typedName}".`, "success");
  } catch (error) {
    showError("Paste clipboard failed", error);
  }
}

async function renameLibraryAsset() {
  const asset = libraryAssets.find((item) => item.id === getSelectedLibraryAssetId());
  if (!asset) {
    setStatus("Select an asset to rename.", "error");
    return;
  }

  const nextName = sanitizeAssetName(getVal("library-asset-name"));
  if (!nextName) {
    setStatus("Enter a new name first.", "error");
    return;
  }

  asset.name = nextName;
  asset.updatedAt = new Date().toISOString();
  await writeLibraryMetadata();
  renderLibraryAssets();
  setStatus(`Renamed asset to "${nextName}".`, "success");
}

async function deleteLibraryAsset() {
  await ensureLibraryStorage();
  const index = libraryAssets.findIndex((item) => item.id === getSelectedLibraryAssetId());
  if (index < 0) {
    setStatus("Select an asset to delete.", "error");
    return;
  }

  const asset = libraryAssets[index];
  try {
    const fileEntry = await libraryFolderEntry.getEntry(asset.fileName);
    await fileEntry.delete();
  } catch (_) {
    // Ignore missing files and remove metadata anyway.
  }

  libraryAssets.splice(index, 1);
  selectedLibraryAssetIds = libraryAssets[0] ? [libraryAssets[0].id] : [];
  await writeLibraryMetadata();
  renderLibraryAssets();
  setStatus(`Deleted "${asset.name}".`, "success");
}

function bindLibraryEvents() {
  const refreshButton = document.getElementById("btn-library-refresh");
  if (refreshButton && !refreshButton.dataset.bound) {
    refreshButton.dataset.bound = "true";
    refreshButton.addEventListener("click", () => {
      refreshLibraryView().catch((error) => console.warn("Library refresh failed", error));
    });
  }

  const searchInput = document.getElementById("library-search-input");
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = "true";
    searchInput.addEventListener("input", renderLibraryAssets);
  }

  const list = document.getElementById("library-assets-list");
  if (list && !list.dataset.bound) {
    list.dataset.bound = "true";
    list.addEventListener("click", (event) => {
      const actionButton = event.target && typeof event.target.closest === "function"
        ? event.target.closest(".library-row-btn[data-library-action][data-library-asset-id]")
        : null;
      if (actionButton) {
        const assetId = actionButton.getAttribute("data-library-asset-id");
        const actionName = actionButton.getAttribute("data-library-action");
        selectLibraryAsset(assetId);
        if (actionName === "place") placeLibraryAsset();
        if (actionName === "rename") renameLibraryAsset();
        if (actionName === "delete") deleteLibraryAsset();
        return;
      }
      const row = event.target && typeof event.target.closest === "function"
        ? event.target.closest(".library-asset-row[data-library-asset-id]")
        : null;
      if (!row) return;
      const assetId = row.getAttribute("data-library-asset-id");
      const multiSelect = !!(event.ctrlKey || event.metaKey || event.shiftKey);
      selectLibraryAsset(assetId, multiSelect);
      if (!multiSelect) {
        placeLibraryAsset().catch((error) => console.warn("Library place failed", error));
      }
    });
  }
}

async function initializeLibraryManager() {
  ensureLibraryImportButtons();
  bindLibraryEvents();
  await refreshLibraryView();
}

function createLibraryImportButton(id, text) {
  const button = document.createElement("button");
  button.id = id;
  button.type = "button";
  button.className = "library-import-btn";
  button.setAttribute("data-action-button", "");
  const iconMap = {
    "btn-library-add-files": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/><path d="M19 19H5V5h9l5 5z"/></svg>`,
    "btn-library-save-selection": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v12"/><path d="M8 12l4 4 4-4"/><path d="M6 20h12"/></svg>`,
    "btn-library-paste-clipboard": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4h8v3H8z"/><path d="M7 7h10v13H7z"/><path d="M10 11h4M10 15h4"/></svg>`,
  };
  button.innerHTML = `${iconMap[id] || ""}<span>${text}</span>`;
  return button;
}

function ensureLibraryImportButtons() {
  const libraryPanel = document.querySelector('[data-tab-panel="library"]');
  if (!libraryPanel) return;
  const firstCard = libraryPanel.querySelector(".card");
  if (!firstCard) return;

  let grid = firstCard.querySelector(".library-import-grid");
  if (!grid) {
    grid = document.createElement("div");
    grid.className = "library-import-grid";
    const hint = firstCard.querySelector(".hint-text");
    if (hint && hint.parentNode === firstCard) firstCard.insertBefore(grid, hint);
    else firstCard.appendChild(grid);
  }

  const required = [
    { id: "btn-library-add-files", text: "Import Any File" },
    { id: "btn-library-save-selection", text: "Save Selected" },
    { id: "btn-library-paste-clipboard", text: "Paste Clipboard" },
  ];

  required.forEach((item) => {
    let button = document.getElementById(item.id);
    if (!button) {
      button = createLibraryImportButton(item.id, item.text);
      grid.appendChild(button);
    } else {
      button.classList.add("library-import-btn");
      button.setAttribute("data-action-button", "");
      button.style.display = "inline-flex";
      button.style.alignItems = "center";
      button.style.justifyContent = "center";
      button.style.gap = "8px";
      if (!button.querySelector("svg")) {
        const iconButton = createLibraryImportButton(item.id, item.text);
        button.innerHTML = iconButton.innerHTML;
      } else if (!button.querySelector("span")) {
        button.innerHTML = `${button.innerHTML}<span>${item.text}</span>`;
      }
    }
  });
}

// â”€â”€â”€ UI helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function setStatus(msg, type) {
  const wrap = document.getElementById("status-wrap");
  const bar = document.getElementById("status-bar");
  const log = document.getElementById("error-log");
  const text = typeof msg === "string" ? msg.trim() : String(msg || "").trim();

  if (statusHideTimer) {
    clearTimeout(statusHideTimer);
    statusHideTimer = null;
  }

  if (!wrap || !bar) return;

  if (!text) {
    bar.textContent = "";
    bar.className = "status-bar hidden";
    wrap.classList.add("hidden");
    wrap.setAttribute("aria-hidden", "true");
    if (log) log.classList.add("hidden");
    return;
  }

  wrap.classList.remove("hidden");
  wrap.setAttribute("aria-hidden", "false");
  bar.className = "status-bar" + (type ? " " + type : "");
  bar.classList.remove("hidden");
  bar.textContent = text;

  if (type !== "error") {
    if (log) log.classList.add("hidden");
  }

  if (type !== "working" && type !== "error") {
    statusHideTimer = setTimeout(() => {
      const errorLog = document.getElementById("error-log");
      if (errorLog && !errorLog.classList.contains("hidden")) return;
      bar.textContent = "";
      bar.className = "status-bar hidden";
      wrap.classList.add("hidden");
      wrap.setAttribute("aria-hidden", "true");
      statusHideTimer = null;
    }, 3200);
  }
}

function showError(label, err) {
  const msg = err && err.message ? err.message : String(err);
  setStatus(label + " â€” see details below", "error");
  const log = document.getElementById("error-log");
  if (log) {
    log.textContent = label + ":\n" + msg;
    log.classList.remove("hidden");
  }
  console.error(label, err);
}

function runPanelAction(label, actionFn) {
  try {
    const result = actionFn();
    if (result && typeof result.catch === "function") {
      result.catch((error) => showError(label, error));
    }
  } catch (error) {
    showError(label, error);
  }
}

if (typeof window !== "undefined" && !window.__slideCreatorPanelErrorGuard) {
  window.__slideCreatorPanelErrorGuard = true;
  window.addEventListener("unhandledrejection", (event) => {
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    showError("Action failed", event?.reason || new Error("Unknown action error."));
  });
  window.addEventListener("error", (event) => {
    showError("Action failed", event?.error || event?.message || new Error("Unknown action error."));
  });
}

function getDropdownValue(el) {
  if (!el) return "";
  const selected = el.querySelector("sp-menu-item[selected]");
  if (selected) return selected.getAttribute("value") || "";
  if (el.value) return el.value;
  const ariaSelected = el.querySelector("sp-menu-item[aria-selected='true']");
  if (ariaSelected) return ariaSelected.getAttribute("value") || "";
  const first = el.querySelector("sp-menu-item:not([disabled])");
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

// â”€â”€â”€ Artboard Setup readers (use IDs: artboard-preset, artboard-position, etc.)
function getArtboardInputs() {
  const preset = getVal("artboard-preset");
  const presetDef = getPresetDefinition(preset);
  let artW, artH;
  if (preset === CUSTOM_PRESET_SENTINEL || !presetDef) {
    artW = parseInt(getVal("artboard-custom-w")) || 1080;
    artH = parseInt(getVal("artboard-custom-h")) || 1080;
  } else {
    artW = presetDef.w;
    artH = presetDef.h;
  }
  const posRaw = (getVal("artboard-position") || "left").trim().toLowerCase();
  const position = ["left", "right", "up", "bottom"].includes(posRaw) ? posRaw : "left";
  const count = Math.max(1, parseInt(getVal("artboard-count")) || 1);
  const name = (getVal("artboard-name") || "canvas").trim() || "canvas";
  return { artW, artH, position, count, name };
}

// â”€â”€â”€ Slide Setup readers (use IDs: slide-size-preset, slide-count, etc.)
function getSlideInputs() {
  const preset = getVal("slide-size-preset");
  const presetDef = getPresetDefinition(preset);
  let slideW;
  let slideH;
  if (preset === CUSTOM_PRESET_SENTINEL || !presetDef) {
    slideW = parseInt(getVal("slide-custom-w")) || 1080;
    slideH = parseInt(getVal("slide-custom-h")) || 1080;
  } else {
    slideW = presetDef.w;
    slideH = presetDef.h;
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
      hint.textContent = `${count} artboard(s) Â· ${artW} Ã— ${artH} px Â· Direction: ${direction} Â· Gap: ${ARTBOARD_GAP}px`;
    }
  } catch (_) { }
}

// â”€â”€â”€ Thumbnails â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    moveLeft.textContent = "â—€";
    moveLeft.addEventListener("click", (e) => { e.stopPropagation(); moveSlideByOffset(slide.id, -1); });

    const moveRight = document.createElement("button");
    moveRight.className = "slide-move-button";
    moveRight.textContent = "â–¶";
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
        left = sourceBounds.right + gap + i * (artW + gap);
        top = sourceBounds.top;
        break;
      case "left":
        left = sourceBounds.left - (artW + gap) * (i + 1);
        top = sourceBounds.top;
        break;
      case "bottom":
        left = sourceBounds.left;
        top = sourceBounds.bottom + gap + i * (artH + gap);
        break;
      case "up":
        left = sourceBounds.left;
        top = sourceBounds.top - (artH + gap) * (i + 1);
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
  setStatus(`Creating ${slideCount} slide artboard(s)â€¦`, "working");
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
    setStatus(`âœ“ Created ${slideCount} slide artboard(s) from Slide Setup`, "success");
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

  setStatus(`Creating ${count} artboard(s) at ${artW}Ã—${artH} pxâ€¦`, "working");
  try {
    await core.executeAsModal(async () => {
      await createArtboardsInActiveDocument({ artW, artH, position, count, name });
    }, { commandName: "Create Artboard" });

    slides = [];
    renderThumbnails();
    setStatus(
      `âœ“ Created ${count} artboard(s) in the active document`,
      "success"
    );
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    if (msg.includes("user cancelled") || msg.includes("cancelled")) {
      setStatus("Cancelled â€” no changes made", "");
    } else {
      showError("Create Artboard failed", e);
    }
  }
}

// â”€â”€â”€ 1b. Duplicate Artboard with Design â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Finds the first artboardSection in the active document and adds N duplicates
// from the artboard-count field, placing the copies in the chosen direction.

async function duplicateArtboardWithDesign() {
  const { position, count, name } = getArtboardInputs();

  const doc = app.activeDocument;
  if (!doc) {
    showError("Duplicate Artboard failed", new Error("No document open. Open a Photoshop document with an artboard first."));
    return;
  }

  setStatus("Duplicating artboard with designâ€¦", "working");
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
        sourceArtboard = await createSourceArtboardFromDocument(doc, `${name} 1`);
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

      const placedBoards = [{
        layer: sourceLayer,
        left: shiftedSourceBounds.left,
        top: shiftedSourceBounds.top,
      }];

      for (let i = 0; i < layoutRects.length; i++) {
        const rect = layoutRects[i];
        const targetLeft = rect.left + expansion.shiftX;
        const targetTop = rect.top + expansion.shiftY;

        const duplicateLayer = await sourceLayer.duplicate();
        const offsetX = targetLeft - shiftedSourceBounds.left;
        const offsetY = targetTop - shiftedSourceBounds.top;
        await duplicateLayer.translate(offsetX, offsetY);
        placedBoards.push({
          layer: duplicateLayer,
          left: targetLeft,
          top: targetTop,
        });
      }

      const sortAxis = (position === "left" || position === "right") ? "left" : "top";
      placedBoards.sort((a, b) => {
        if (a[sortAxis] !== b[sortAxis]) return a[sortAxis] - b[sortAxis];
        if (sortAxis !== "left" && a.left !== b.left) return a.left - b.left;
        if (sortAxis !== "top" && a.top !== b.top) return a.top - b.top;
        return 0;
      });

      placedBoards.forEach((board, index) => {
        board.layer.name = placedBoards.length > 1 ? `${name} ${index + 1}` : name;
      });

    }, { commandName: "Duplicate Artboard with Design" });

    setStatus(`âœ“ Added ${count} duplicated artboard(s) with design intact`, "success");
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    if (msg.includes("user cancelled") || msg.includes("cancelled")) {
      setStatus("Cancelled â€” no changes made", "");
    } else {
      showError("Duplicate Artboard failed", e);
    }
  }
}

// â”€â”€â”€ 1c. Artboard from Layer Size â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Uses the active document canvas size as the artboard size.

async function artboardFromLayerSize() {
  const { position, count, name } = getArtboardInputs();

  const doc = app.activeDocument;
  if (!doc) {
    showError("Artboard from Canvas Size failed", new Error("No document open. Open a Photoshop document first, then try again."));
    return;
  }

  setStatus("Reading current canvas sizeâ€¦", "working");
  try {
    await core.executeAsModal(async () => {
      const artW = Math.max(1, Math.round(Number(doc.width)));
      const artH = Math.max(1, Math.round(Number(doc.height)));

      if (artW < 1 || artH < 1) throw new Error(`Invalid canvas size: ${artW}Ã—${artH}`);

      await createArtboardsInActiveDocument({ artW, artH, position, count, name });

    }, { commandName: "Artboard from Canvas Size" });

    setStatus(`âœ“ Created ${count} artboard(s) using the current canvas size`, "success");
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    if (msg.includes("user cancelled") || msg.includes("cancelled")) {
      setStatus("Cancelled â€” no changes made", "");
    } else {
      showError("Artboard from Canvas Size failed", e);
    }
  }
}



async function addGuides() {
  const { slideCount } = getSlideInputs();
  setStatus("Adding guidesâ€¦", "working");
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
    setStatus(`âœ“ ${slideCount - 1} guide(s) added`, "success");
  } catch (e) {
    showError("Add Guides failed", e);
  }
}

// â”€â”€â”€ 3. Clear Guides â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function clearGuides() {
  setStatus("Clearing guidesâ€¦", "working");
  try {
    await core.executeAsModal(async () => {
      await action.batchPlay([{
        _obj: "delete",
        _target: [{ _ref: "guide", _enum: "ordinal", _value: "allEnum" }],
        _options: { dialogOptions: "dontDisplay" },
      }], {});
    }, { commandName: "Clear Guides" });
    setStatus("âœ“ Guides cleared", "success");
  } catch (e) {
    showError("Clear Guides failed", e);
  }
}

// â”€â”€â”€ 4. Crop Slides â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  setStatus("Cropping slidesâ€¦", "working");

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

      setStatus(`Cropped ${i + 1} / ${slideCount}â€¦`, "working");
    }

    renderThumbnails();
    updateDeleteSlidesUI();
    // Show the Export All Slides button after cropping
    const exportButton = document.getElementById("btn-export-slides");
    if (exportButton) exportButton.classList.remove("hidden");
    setStatus(`âœ“ ${slideCount} slides cropped â€” ready to export`, "success");
  } catch (e) {
    showError("Crop Slides failed", e);
  }
}

// â”€â”€â”€ 5. Export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    showError("Export failed", new Error("No slides â€” tap Crop Slides first."));
    return;
  }

  const { exportFormat, exportQuality } = getSlideInputs();
  const resolvedFormat = forcedFormat || exportFormat;
  const doJpg = resolvedFormat === "jpg";
  const ext = doJpg ? "jpg" : "png";
  const count = slides.length;

  setStatus("Choose folder to save slidesâ€¦", "working");
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
        setStatus(`Exported ${i + 1} / ${count}â€¦`, "working");
      }
    }, { commandName: doJpg ? "Export Slides as JPG" : "Export Slides" });

    setStatus(`âœ“ All ${slides.length} slides exported!`, "success");
    await closeAllSlideDocs();
    updateDeleteSlidesUI();
  } catch (e) {
    showError("Export failed", e);
  }
}

// â”€â”€â”€ Export Options Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function showExportOptionsModal() {
  const existingModal = document.getElementById("export-options-modal");
  if (existingModal) {
    existingModal.remove();
    document.body.classList.remove("export-options-modal-open");
  }

  if (!Array.isArray(slides) || slides.length === 0) {
    showError("Export failed", new Error("No cropped slides found. Tap Crop Slides first, then export."));
    return;
  }

  const { exportPrefix, exportFormat } = getSlideInputs();
  const defaultName = sanitizeAssetFileStem(exportPrefix || "slide");
  const formatLabel = String(exportFormat || "jpg").toUpperCase();

  const modal = document.createElement("div");
  modal.id = "export-options-modal";
  modal.className = "modal-overlay";
  document.body.classList.add("export-options-modal-open");

  const modalContent = document.createElement("div");
  modalContent.className = "modal-content export-options-modal-content";

  const header = document.createElement("div");
  header.className = "modal-header";
  header.innerHTML = `
    <h3>Export Options</h3>
    <button class="modal-close" id="close-export-options-modal">&times;</button>
  `;

  const body = document.createElement("div");
  body.className = "modal-body";

  const summarySection = document.createElement("div");
  summarySection.className = "export-scope-section";
  summarySection.innerHTML = `
    <label class="field-label">Export</label>
    <div class="export-scope-options">
      <div class="export-scope-option export-scope-summary">
        <span>All ${slides.length} cropped slide${slides.length === 1 ? "" : "s"} as ${formatLabel}</span>
      </div>
    </div>
  `;

  const nameSection = document.createElement("div");
  nameSection.className = "export-name-section";
  nameSection.innerHTML = `
    <label class="field-label">Export Name</label>
    <input type="text" id="export-name-input" class="export-name-input" placeholder="Enter export name..." value="${defaultName}">
  `;

  const zipSection = document.createElement("label");
  zipSection.className = "export-zip-option";
  zipSection.innerHTML = `
    <input type="checkbox" id="export-slides-zip">
    <span>Zip exported slides</span>
  `;

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  actions.innerHTML = `
    <button class="btn-cancel" id="btn-cancel-export">Cancel</button>
    <button class="btn-confirm" id="btn-confirm-export">Export</button>
  `;

  body.appendChild(summarySection);
  body.appendChild(nameSection);
  body.appendChild(zipSection);

  modalContent.appendChild(header);
  modalContent.appendChild(body);
  modalContent.appendChild(actions);
  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  const closeModal = () => {
    document.body.classList.remove("export-options-modal-open");
    modal.remove();
  };

  document.getElementById("close-export-options-modal").addEventListener("click", closeModal);
  document.getElementById("btn-cancel-export").addEventListener("click", closeModal);

  document.getElementById("btn-confirm-export").addEventListener("click", async () => {
    try {
      const confirmButton = document.getElementById("btn-confirm-export");
      const exportName = sanitizeAssetFileStem(document.getElementById("export-name-input").value.trim() || defaultName);
      const shouldZip = Boolean(document.getElementById("export-slides-zip")?.checked);
      if (confirmButton) confirmButton.disabled = true;
      closeModal();
      await exportSlidesWithName(exportName, exportFormat, getSlideInputs().exportQuality, shouldZip);
    } catch (error) {
      document.body.classList.remove("export-options-modal-open");
      showError("Export failed", error);
    }
  });
}

async function exportWithOptions(exportScope, exportName) {
  const { exportFormat, exportQuality } = getSlideInputs();
  const doJpg = exportFormat === "jpg";
  const ext = doJpg ? "jpg" : "png";

  if (exportScope === "all") {
    await exportSlidesWithName(exportName, exportFormat, exportQuality);
  } else {
    await exportSelectedLayersWithName(exportName, exportFormat, exportQuality);
  }
}

async function createUniqueFolder(parentFolder, baseName) {
  const safeBaseName = sanitizeAssetFileStem(baseName || "export");
  for (let index = 0; index < 100; index++) {
    const folderName = index === 0 ? safeBaseName : `${safeBaseName}_${index + 1}`;
    try {
      return await parentFolder.createEntry(folderName, { type: "folder" });
    } catch (_) { }
  }
  throw new Error("Could not create export folder.");
}

async function createSlidesZip(folderEntry, zipName, exportedFiles) {
  const ZipCtor = (typeof JSZip !== "undefined" && JSZip) || (typeof window !== "undefined" && window.JSZip);
  if (!ZipCtor) throw new Error("ZIP support is not available.");

  const zip = new ZipCtor();
  for (const fileInfo of exportedFiles) {
    const binary = await fileInfo.entry.read({ format: uxpFormats.binary });
    zip.file(fileInfo.name, binary);
  }

  const zipBinary = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  const zipFile = await folderEntry.createFile(`${sanitizeAssetFileStem(zipName)}.zip`, { overwrite: true });
  await zipFile.write(zipBinary, { format: uxpFormats.binary });
  return zipFile;
}

async function cleanupExportEntries(entries) {
  for (const entry of entries) {
    try {
      if (entry && typeof entry.delete === "function") await entry.delete();
    } catch (_) { }
  }
}

async function exportSlidesWithName(customName, format, quality, zipOutput = false) {
  if (slides.length === 0) {
    showError("Export failed", new Error("No slides — tap Crop Slides first."));
    return;
  }

  const doJpg = format === "jpg";
  const ext = doJpg ? "jpg" : "png";
  const count = slides.length;
  const exportStem = sanitizeAssetFileStem(customName || "slide");

  setStatus(zipOutput ? "Choose folder to save ZIP..." : "Choose folder to save slides...", "working");
  let folderEntry;
  try {
    folderEntry = await uxpFs.getFolder();
    if (!folderEntry) { setStatus("Export cancelled.", ""); return; }
  } catch (e) {
    showError("Folder selection failed", e);
    return;
  }

  try {
    const outputFolder = zipOutput
      ? await createUniqueFolder(await uxpFs.getDataFolder(), `slide_export_${Date.now()}`)
      : folderEntry;
    const exportedFiles = [];

    await core.executeAsModal(async () => {
      for (let i = 0; i < count; i++) {
        const slide = slides[i];
        const num = i + 1;
        const baseFileName = `${exportStem}_${String(num).padStart(2, "0")}`;
        let fileName = baseFileName;
        let suffix = 1;
        const slideDoc = app.documents.find(d => d.id === slide.id);
        if (!slideDoc) throw new Error(`Slide doc ${num} not found.`);
        app.activeDocument = slideDoc;

        // Try to create file with unique name if there's a conflict
        let fileEntry;
        while (true) {
          try {
            fileEntry = await outputFolder.createFile(`${fileName}.${ext}`, { overwrite: true });
            break;
          } catch (fileError) {
            if (fileError.message && fileError.message.includes("Folder")) {
              // Folder with this name exists, try a different name
              fileName = `${baseFileName}_${suffix}`;
              suffix++;
              if (suffix > 100) {
                throw new Error("Could not create file: too many name conflicts");
              }
            } else {
              throw fileError;
            }
          }
        }

        if (doJpg) {
          await slideDoc.saveAs.jpg(fileEntry, { quality: quality }, true);
        } else {
          await slideDoc.saveAs.png(fileEntry, {}, true);
        }
        exportedFiles.push({ entry: fileEntry, name: `${fileName}.${ext}` });
        setStatus(`Exported ${i + 1} / ${count}…`, "working");
      }
    }, { commandName: doJpg ? "Export Slides as JPG" : "Export Slides" });

    if (zipOutput) {
      setStatus("Creating ZIP...", "working");
      await createSlidesZip(folderEntry, exportStem, exportedFiles);
      await cleanupExportEntries(exportedFiles.map((fileInfo) => fileInfo.entry));
      await cleanupExportEntries([outputFolder]);
      setStatus(`✓ Exported ${slides.length} slides to ${exportStem}.zip`, "success");
    } else {
      setStatus(`✓ All ${slides.length} slides exported!`, "success");
    }
    await closeAllSlideDocs();
    updateDeleteSlidesUI();
  } catch (e) {
    showError("Export failed", e);
  }
}

async function exportSelectedLayersWithName(customName, format, quality) {
  const doc = app.activeDocument;
  if (!doc) {
    showError("Export failed", new Error("No active document."));
    return;
  }

  const selectedLayers = doc.activeLayers;
  if (!selectedLayers || selectedLayers.length === 0) {
    showError("Export failed", new Error("No layers selected. Please select layers to export."));
    return;
  }

  const doJpg = format === "jpg";
  const ext = doJpg ? "jpg" : "png";

  setStatus("Choose folder to save layers…", "working");
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
      // Store original visibility states
      const layerStates = [];
        const allLayers = getAllLayersRecursive(doc);

      allLayers.forEach(layer => {
        layerStates.push({
          id: layer.id,
          visible: layer.visible
        });
      });

      // Hide all layers first
      await action.batchPlay([{
        _obj: "set",
        _target: [{ _ref: "layer", _enum: "ordinal", _value: "allEnum" }],
        to: { _obj: "layer", visible: false }
      }], { synchronousExecution: true });

      // Export each selected layer one at a time
      for (let i = 0; i < selectedLayers.length; i++) {
        const layer = selectedLayers[i];
        const num = i + 1;
        const baseFileName = `${customName}_${layer.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_${String(num).padStart(2, "0")}`;
        let fileName = baseFileName;
        let suffix = 1;

        // Hide all layers
        allLayers.forEach(l => {
          if (l.visible) {
            action.batchPlay([{
              _obj: "set",
              _target: [{ _ref: "layer", _id: l.id }],
              to: { _obj: "layer", visible: false }
            }], { synchronousExecution: true });
          }
        });

        // Show only the current layer
        await action.batchPlay([{
          _obj: "set",
          _target: [{ _ref: "layer", _id: layer.id }],
          to: { _obj: "layer", visible: true }
        }], { synchronousExecution: true });

        app.activeDocument = doc;

        // Try to create file with unique name if there's a conflict
        let fileEntry;
        while (true) {
          try {
            fileEntry = await folderEntry.createFile(`${fileName}.${ext}`, { overwrite: true });
            break;
          } catch (fileError) {
            if (fileError.message && fileError.message.includes("Folder")) {
              // Folder with this name exists, try a different name
              fileName = `${baseFileName}_${suffix}`;
              suffix++;
              if (suffix > 100) {
                throw new Error("Could not create file: too many name conflicts");
              }
            } else {
              throw fileError;
            }
          }
        }

        if (doJpg) {
          await doc.saveAs.jpg(fileEntry, { quality: quality }, true);
        } else {
          await doc.saveAs.png(fileEntry, {}, true);
        }

        setStatus(`Exported ${i + 1} / ${selectedLayers.length}…`, "working");
      }

      // Restore original visibility states
      for (const state of layerStates) {
        await action.batchPlay([{
          _obj: "set",
          _target: [{ _ref: "layer", _id: state.id }],
          to: { _obj: "layer", visible: state.visible }
        }], { synchronousExecution: true });
      }
    }, { commandName: doJpg ? "Export Selected Layers as JPG" : "Export Selected Layers" });

    setStatus(`✓ All ${selectedLayers.length} layers exported!`, "success");
  } catch (e) {
    showError("Export failed", e);
  }
}

// â”€â”€â”€ 6. Delete Slides â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  setStatus("Deleting selected slidesâ€¦", "working");
  try {
    await core.executeAsModal(async () => {
      for (const id of ids) {
        const doc = app.documents.find(d => d.id === id);
        if (doc) await doc.close(constants.SaveOptions.DONOTSAVECHANGES);
      }
    }, { commandName: "Delete Slides" });
    for (const i of indices) slides.splice(i, 1);
    updateDeleteSlidesUI();
    setStatus(`âœ“ ${indices.length} slide(s) deleted!`, "success");
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

// â”€â”€â”€ Dropdown binding â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function syncDropdownSelection(dropdownId, textTargetId, forcedValue) {
  const dropdown = document.getElementById(dropdownId);
  const textTarget = document.getElementById(textTargetId);
  if (!dropdown) return;
  const value = forcedValue || getDropdownValue(dropdown);
  const item =
    dropdown.querySelector(`sp-menu-item[value="${value}"]`) ||
    dropdown.querySelector("sp-menu-item[selected]") ||
    dropdown.querySelector("sp-menu-item:not([disabled])");
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
    if (String(v || "").startsWith(PRESET_GROUP_SENTINEL_PREFIX)) return;
    syncDropdownSelection(dropdownId, textTargetId, v);
    if (onSync) onSync(getDropdownValue(dropdown));
  };
  const clickSel = (e) => {
    const item = e.target && typeof e.target.closest === "function" ? e.target.closest("sp-menu-item") : null;
    if (item && item.hasAttribute("disabled")) return;
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
      if (item.hasAttribute("disabled")) return;
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
    if (active && tabName === "library") {
      refreshLibraryView().catch((error) => {
        console.warn("Library refresh failed", error);
      });
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

// â”€â”€â”€ Init â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function initUI() {
  // Safety reset: ensure the preset modal lock state never leaks across panel reloads.
  document.body.classList.remove("preset-modal-open");
  const presetModal = document.getElementById("preset-manager-modal");
  if (presetModal) {
    presetModal.classList.add("hidden");
    presetModal.setAttribute("aria-hidden", "true");
  }

  const artCustomFields = document.getElementById("artboard-custom-fields");
  const slideCustomFields = document.getElementById("slide-custom-fields");
  const artboardFromCanvasButton = document.getElementById("btn-artboard-from-layer");
  if (artboardFromCanvasButton) artboardFromCanvasButton.textContent = "Artboard from Canvas Size";
  initializeLibraryManager().catch((error) => {
    console.warn("Library init failed", error);
  });
  initializePresetManager();
  initTabs();
  setTimeout(() => {
    if (typeof initializeAutoResize === 'function') initializeAutoResize();
  }, 100);

  // Artboard Setup dropdowns
  bindDropdownPreview("artboard-preset", "artboard-preset-inline", (value) => {
    if (artCustomFields) artCustomFields.classList.toggle("hidden", value !== CUSTOM_PRESET_SENTINEL);
    updateArtboardHint();
  });
  bindDropdownPreview("artboard-position", "artboard-position-inline", () => updateArtboardHint());

  // Slide Setup dropdown
  bindDropdownPreview("slide-size-preset", "slide-size-preset-inline", (value) => {
    if (slideCustomFields) slideCustomFields.classList.toggle("hidden", value !== CUSTOM_PRESET_SENTINEL);
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

  if (artCustomFields) artCustomFields.classList.toggle("hidden", getVal("artboard-preset") !== CUSTOM_PRESET_SENTINEL);
  if (slideCustomFields) slideCustomFields.classList.toggle("hidden", getVal("slide-size-preset") !== CUSTOM_PRESET_SENTINEL);
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
    case "btn-export-slides": showExportOptionsModal(); break;

    case "btn-rasterize": rasterizeSelectedLayers(); break;
    case "btn-organize-slides": organizeLayersIntoSlides(); break;
    case "btn-delete-slides": deleteSelectedSlides(); break;
    case "btn-library-add-files": addFilesToLibrary(); break;
    case "btn-library-add-header": addFilesToLibrary(); break;
    case "btn-library-save-selection": saveSelectedToLibrary(); break;
    case "btn-library-paste-inline": pasteClipboardToLibrary(); break;
    case "btn-library-paste-clipboard": pasteClipboardToLibrary(); break;
    case "btn-library-refresh": refreshLibraryView(); break;
    case "btn-library-place": placeLibraryAsset(); break;
    case "btn-library-rename": renameLibraryAsset(); break;
    case "btn-library-delete": deleteLibraryAsset(); break;
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

function isEmptyBounds(bounds) {
  if (!bounds) return true;
  const width = Math.round(bounds.right - bounds.left);
  const height = Math.round(bounds.bottom - bounds.top);
  return width <= 0 && height <= 0;
}

function isSlideFolderLayer(layer) {
  return !!(layer && layer.kind === constants.LayerKind.GROUP && /^Slide\s+\d+/i.test(String(layer.name || "").trim()));
}

function sortSlideRegions(regions) {
  return Array.from(regions || []).sort((a, b) => {
    const topDiff = (a.top || 0) - (b.top || 0);
    if (topDiff !== 0) return topDiff;
    const leftDiff = (a.left || 0) - (b.left || 0);
    if (leftDiff !== 0) return leftDiff;
    return (a.index || 0) - (b.index || 0);
  });
}

function buildCanvasSlideRegions(docWidth, docHeight, slideCount) {
  const count = Math.max(1, Math.round(slideCount) || 1);
  const sliceW = Math.max(1, docWidth / count);
  const regions = [];

  for (let i = 1; i <= count; i++) {
    regions.push({
      index: i,
      left: (i - 1) * sliceW,
      right: i === count ? docWidth : i * sliceW,
      top: 0,
      bottom: docHeight,
    });
  }

  return regions;
}

function getBestSlideForBounds(bounds, slideRegions) {
  if (!bounds) return null;
  const { left, right } = bounds;

  // Skip empty / invisible layers
  if (left === 0 && right === 0 && Math.round(bounds.bottom - bounds.top) === 0) return null;
  if (Math.round(right - left) === 0 && Math.round(bounds.bottom - bounds.top) === 0) return null;

  let bestSlide = null;
  let bestOverlap = 0;

  for (const region of slideRegions) {
    const overlapLeft = Math.max(left, region.left);
    const overlapRight = Math.min(right, region.right);
    const overlap = Math.max(0, overlapRight - overlapLeft);

    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestSlide = region.index;
    }
  }

  if (!bestSlide) {
    const centerX = (left + right) / 2;
    const fallbackRegion = slideRegions[slideRegions.length - 1] || { index: 1, left: 0, right: 1 };
    for (const region of slideRegions) {
      if (centerX >= region.left && centerX < region.right) {
        bestSlide = region.index;
        break;
      }
    }
    if (!bestSlide) bestSlide = fallbackRegion.index;
  }

  return bestSlide;
}

function mergeSlideAssignments(target, source) {
  for (const [slideIndex, ids] of source.entries()) {
    if (!target.has(slideIndex)) target.set(slideIndex, []);
    target.get(slideIndex).push(...ids);
  }
  return target;
}

function collectSlideAssignments(layer, slideRegions, artboardIds = new Set()) {
  const assignments = new Map();
  if (!layer || layer.isBackgroundLayer || isSlideFolderLayer(layer)) return assignments;

  const layerId = toNumberId(layer.id);
  const isArtboardContainer = layerId !== null && artboardIds.has(layerId);
  const hasChildren = !!(layer.layers && layer.layers.length > 0);

  let bounds = null;
  try {
    bounds = getArtboardLikeBounds(layer);
  } catch (_) {
    bounds = null;
  }

  if (hasChildren) {
    const childAssignments = new Map();
    for (const child of Array.from(layer.layers || [])) {
      mergeSlideAssignments(childAssignments, collectSlideAssignments(child, slideRegions, artboardIds));
    }

    if (isArtboardContainer) {
      return childAssignments;
    }

    if (childAssignments.size === 1 && !isArtboardContainer) {
      const [[slideIndex]] = childAssignments.entries();
      if (layerId !== null) {
        childAssignments.clear();
        childAssignments.set(slideIndex, [layerId]);
      }
      return childAssignments;
    }

    if (childAssignments.size > 0) return childAssignments;
  }

  if (isEmptyBounds(bounds)) return assignments;

  const bestSlide = getBestSlideForBounds(bounds, slideRegions);
  if (bestSlide && layerId !== null) {
    assignments.set(bestSlide, [layerId]);
  }

  return assignments;
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
  syncDropdownSelection("slide-size-preset", "slide-size-preset-inline", CUSTOM_PRESET_SENTINEL);
  const slideCustomFields = document.getElementById("slide-custom-fields");
  if (slideCustomFields) slideCustomFields.classList.remove("hidden");

  // Populate the UI fields explicitly
  setFieldValue("slide-custom-w", wStr);
  setFieldValue("slide-custom-h", hStr);

  setStatus(`Image detected: ${picW}Ã—${picH} px â†’ each slide: ${wStr}Ã—${hStr} px`, "success");

  const slideCountLabel = slideCount === 1 ? "slide" : "slides";
  setStatus(`Calculated ${wStr}x${hStr} px for each ${slideCountLabel}. Tap Create Slides to build them.`, "success");
}


async function organizeLayersIntoSlides() {
  const doc = app.activeDocument;
  if (!doc) {
    showError("Organization failed", new Error("No active document open."));
    return;
  }

  const { slideW, slideCount } = getSlideInputs();
  const docWidth = Number(doc.width);
  const docHeight = Number(doc.height);
  const artboardInfos = await getAllArtboardInfos(doc);
  const usableArtboardInfos = sortSlideRegions(
    artboardInfos.filter((item) => item && item.bounds && !isEmptyBounds(item.bounds))
  );

  const useArtboardRegions = usableArtboardInfos.length > 1 || (usableArtboardInfos.length === 1 && slideCount === 1);
  const slideRegionCount = useArtboardRegions
    ? usableArtboardInfos.length
    : Math.max(1, Math.round(docWidth / slideW));
  const actualSlideCount = useArtboardRegions
    ? slideRegionCount
    : Math.max(1, Math.min(slideCount, slideRegionCount));
  const slideRegions = useArtboardRegions
    ? usableArtboardInfos.slice(0, actualSlideCount).map((item, idx) => ({
        index: idx + 1,
        left: item.bounds.left,
        right: item.bounds.right,
        top: item.bounds.top,
        bottom: item.bounds.bottom,
      }))
    : buildCanvasSlideRegions(docWidth, docHeight, actualSlideCount);

  const artboardIdSet = new Set(usableArtboardInfos.map((item) => item.id).filter((id) => id !== null));

  if (slideRegions.length <= 1) {
    showError("Organization failed", new Error("Your current document does not contain enough slide regions to organize into multiple folders."));
    return;
  }

  setStatus(`Organizing layers into ${actualSlideCount} slide folders...`, "working");

  try {
    await core.executeAsModal(async () => {
      const slideBaskets = new Map(); // slideIdx -> [layerId]

      for (const layer of doc.layers || []) {
        mergeSlideAssignments(slideBaskets, collectSlideAssignments(layer, slideRegions, artboardIdSet));
      }

      const colors = ["red", "orange", "yellowColor", "green", "blue", "violet", "gray"];
      const slideIndices = Array.from(slideBaskets.keys()).sort((a, b) => a - b);

      for (const sIdx of slideIndices) {
        const ids = Array.from(new Set((slideBaskets.get(sIdx) || []).filter((id) => id !== null)));
        if (ids.length === 0) continue;

        // Select layers for this slide
        await action.batchPlay([{
          _obj: "select",
          _target: ids.map(id => ({ _ref: "layer", _id: id })),
          makeVisible: false
        }], { synchronousExecution: true });

        // Group selected layers into a new folder
        await action.batchPlay([{
          _obj: "make",
          _target: [{ _ref: "layerSection" }],
          from: { _ref: "layer", _enum: "ordinal", _value: "targetEnum" },
          name: `Slide ${sIdx}`
        }], { synchronousExecution: true });

        // Assign matching label color
        const colorValue = colors[(sIdx - 1) % colors.length];
        await action.batchPlay([{
          _obj: "set",
          _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }],
          to: { _obj: "layer", color: { _enum: "color", _value: colorValue } }
        }], { synchronousExecution: true });
      }

    }, { commandName: "Organize Layers into Slides" });

    if (typeof refreshLayerList === "function") refreshLayerList();
    setStatus("Layers grouped into slide folders without moving their positions!", "success");

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
  "btn-rotate-left": { title: "Rotate 90Â° CCW", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>` },
  "btn-rotate-right": { title: "Rotate 90Â° CW", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-4.95"/></svg>` },
  "btn-smart-object": { title: "Convert to Smart Objects", variant: "smart-object", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><rect x="8" y="8" width="8" height="8"/><line x1="3" y1="3" x2="8" y2="8"/><line x1="21" y1="3" x2="16" y2="8"/><line x1="3" y1="21" x2="8" y2="16"/><line x1="21" y1="21" x2="16" y2="16"/></svg>` },
  "btn-smart-merge": { title: "Merge all into ONE Smart Object", variant: "smart-merge", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="2" width="8" height="8" rx="1"/><rect x="2" y="14" width="8" height="8" rx="1"/><rect x="14" y="14" width="8" height="8" rx="1"/><path d="M10 6h4M6 10v4M18 10v4M10 18h4"/></svg>` },
  "btn-stamp-visible": { title: "Stamp Selected/Visible Layers", variant: "stamp-visible", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="12" height="12" rx="1.5"/><path d="M8 8h6M8 12h4"/><path d="M9 20h10a2 2 0 0 0 2-2V8"/><path d="M4 20h5"/><path d="M6.5 17.5L9 20l4-4"/></svg>` },
  "btn-convert-layers": { title: "Convert to Layers", isPill: true, pillLabel: "Convert to Layers", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="7" height="6" rx="1.2"/><rect x="14" y="4" width="7" height="6" rx="1.2"/><rect x="3" y="14" width="7" height="6" rx="1.2"/><rect x="14" y="14" width="7" height="6" rx="1.2"/><path d="M10 7h4M10 17h4M12 10v4" stroke-linecap="round"/></svg>` },
  "btn-place-embed": { title: "Place Embedded", variant: "place-embed", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>` },
  "btn-paste-text-lines": { title: "Paste Styled Text Lines", isPill: true, pillLabel: "Paste Text", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16"/><path d="M12 5v14"/><path d="M8 19h8"/><path d="M5 11h4"/><path d="M15 11h4"/></svg>` },
  "btn-notes-board": { title: "Notes Board", isPill: true, pillLabel: "Notes", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h5"/><path d="M15 15l2 2 3-4"/></svg>` },
  "btn-new-layer": { title: "New Layer", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>` },
  "btn-rasterize": { title: "Rasterize Layer", isPill: true, pillLabel: "Rasterize", pillVariant: "rasterize", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="8" height="8" rx="1.5"/><path d="M15 5h2M19 5h.01M15 9h.01M19 9h2M15 13h2M19 13h.01M15 17h.01M19 17h2"/><path d="M11 8l4 4"/></svg>` },
  "btn-remove-effects": { title: "Remove Layer Effects", variant: "remove-effects", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14"/><path d="M7 4l1 16h8l1-16"/><path d="M9 9h6"/><path d="M9 13h6"/><path d="M4 20L20 4"/></svg>` },
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
  [{ id: "g-transform", name: "Transform", buttons: ["btn-width", "btn-both", "btn-stretch-all", "btn-rotate-left", "btn-rotate-right", "btn-smart-object", "btn-smart-merge", "btn-stamp-visible", "btn-place-embed", "btn-new-layer"] }],
  [{ id: "g-text-tools", name: "Text", buttons: ["btn-convert-layers", "btn-paste-text-lines", "btn-notes-board", "btn-rasterize"] }],
  [{ id: "g-align", name: "Align", buttons: ["btn-align-left", "btn-align-h-center", "btn-align-right", "btn-align-top", "btn-align-v-center", "btn-align-bottom"] }],
  [{ id: "g-flip", name: "Flip", buttons: ["btn-distribute-h", "btn-distribute-v"] },
  { id: "g-actions", name: "Actions", buttons: ["btn-visibility", "btn-invert", "btn-remove-effects", "btn-delete"] },
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
let autoSaveIsSaving = false;
const DEFAULT_HEADER_TITLE = "Slide Creator";
const AUTO_SAVE_OFF_HEADER_TITLE = "Auto Save Off - Turn It On";

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

function ensureConvertToLayersButton(layoutState) {
  const alreadyPresent = layoutState.some((row) =>
    row.some((group) => (group.buttons || []).includes("btn-convert-layers"))
  );
  if (alreadyPresent) return;

  const transformGroup = layoutState.flat().find((group) => group.id === "g-transform");
  if (transformGroup) {
    const afterSmartMerge = transformGroup.buttons.indexOf("btn-smart-merge");
    const beforePlaceEmbed = transformGroup.buttons.indexOf("btn-place-embed");
    const insertAt = afterSmartMerge !== -1
      ? afterSmartMerge + 1
      : beforePlaceEmbed !== -1
        ? beforePlaceEmbed
        : transformGroup.buttons.length;
    transformGroup.buttons.splice(insertAt, 0, "btn-convert-layers");
    return;
  }

  const defaultTransformGroup = cloneDefaultLayout().flat().find((group) => group.id === "g-transform");
  if (!defaultTransformGroup) return;

  if (layoutState.length === 0) layoutState.push([]);
  layoutState[layoutState.length - 1].push(defaultTransformGroup);
}

function ensureStampVisibleButton(layoutState) {
  const alreadyPresent = layoutState.some((row) =>
    row.some((group) => (group.buttons || []).includes("btn-stamp-visible"))
  );
  if (alreadyPresent) return;

  const transformGroup = layoutState.flat().find((group) => group.id === "g-transform");
  if (transformGroup) {
    transformGroup.buttons = Array.isArray(transformGroup.buttons) ? transformGroup.buttons : [];
    const afterSmartMerge = transformGroup.buttons.indexOf("btn-smart-merge");
    const beforePlaceEmbed = transformGroup.buttons.indexOf("btn-place-embed");
    const insertAt = afterSmartMerge !== -1
      ? afterSmartMerge + 1
      : beforePlaceEmbed !== -1
        ? beforePlaceEmbed
        : transformGroup.buttons.length;
    transformGroup.buttons.splice(insertAt, 0, "btn-stamp-visible");
    return;
  }

  const defaultTransformGroup = cloneDefaultLayout().flat().find((group) => group.id === "g-transform");
  if (!defaultTransformGroup) return;

  if (layoutState.length === 0) layoutState.push([]);
  layoutState[0].push(defaultTransformGroup);
}

function normalizeTextToolsRow(layoutState) {
  const textButtons = ["btn-convert-layers", "btn-paste-text-lines", "btn-notes-board", "btn-rasterize"];

  layoutState.forEach((row) => {
    row.forEach((group) => {
      group.buttons = (group.buttons || []).filter((buttonId) => !textButtons.includes(buttonId));
    });
  });

  for (let rowIndex = layoutState.length - 1; rowIndex >= 0; rowIndex--) {
    layoutState[rowIndex] = layoutState[rowIndex].filter((group) => group.id !== "g-text-tools" && (group.buttons || []).length > 0);
    if (layoutState[rowIndex].length === 0) layoutState.splice(rowIndex, 1);
  }

  const textRow = [{ id: "g-text-tools", name: "Text", buttons: textButtons }];
  const transformIndex = layoutState.findIndex((row) => row.some((group) => group.id === "g-transform"));
  const insertAt = transformIndex === -1 ? 1 : transformIndex + 1;
  layoutState.splice(Math.min(insertAt, layoutState.length), 0, textRow);
}

function ensureRemoveEffectsButton(layoutState) {
  const alreadyPresent = layoutState.some((row) =>
    row.some((group) => (group.buttons || []).includes("btn-remove-effects"))
  );
  if (alreadyPresent) return;

  const actionsGroup = layoutState.flat().find((group) => group.id === "g-actions");
  if (actionsGroup) {
    actionsGroup.buttons = Array.isArray(actionsGroup.buttons) ? actionsGroup.buttons : [];
    const beforeDelete = actionsGroup.buttons.indexOf("btn-delete");
    const insertAt = beforeDelete !== -1 ? beforeDelete : actionsGroup.buttons.length;
    actionsGroup.buttons.splice(insertAt, 0, "btn-remove-effects");
    return;
  }

  const defaultActionsGroup = cloneDefaultLayout().flat().find((group) => group.id === "g-actions");
  if (!defaultActionsGroup) return;

  if (layoutState.length === 0) layoutState.push([]);
  layoutState[layoutState.length - 1].push(defaultActionsGroup);
}

function ensureTransformToolButton(layoutState, buttonId, beforeButtonId = "btn-new-layer") {
  const alreadyPresent = layoutState.some((row) =>
    row.some((group) => (group.buttons || []).includes(buttonId))
  );
  if (alreadyPresent) return;

  const transformGroup = layoutState.flat().find((group) => group.id === "g-transform");
  if (transformGroup) {
    transformGroup.buttons = Array.isArray(transformGroup.buttons) ? transformGroup.buttons : [];
    const beforeIndex = transformGroup.buttons.indexOf(beforeButtonId);
    const insertAt = beforeIndex !== -1 ? beforeIndex : transformGroup.buttons.length;
    transformGroup.buttons.splice(insertAt, 0, buttonId);
    return;
  }

  const defaultTransformGroup = cloneDefaultLayout().flat().find((group) => group.id === "g-transform");
  if (!defaultTransformGroup) return;
  if (layoutState.length === 0) layoutState.push([]);
  layoutState[0].push(defaultTransformGroup);
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
  updateAutoSaveHeaderState(false);
}

function updateAutoSaveHeaderState(hasActiveTimer) {
  const headerBrand = document.querySelector(".header-brand");
  const headerTitle = document.querySelector(".header-title");
  if (!headerBrand || !headerTitle) return;

  headerBrand.classList.remove("auto-save-pulse");
  headerBrand.classList.toggle("auto-save-warning", !hasActiveTimer);
  headerTitle.textContent = hasActiveTimer ? DEFAULT_HEADER_TITLE : AUTO_SAVE_OFF_HEADER_TITLE;
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
  headerBrand.classList.remove("auto-save-warning");
  if (headerTitle) headerTitle.textContent = `Saving in ${remainingSeconds}`;
  headerBrand.classList.remove("auto-save-pulse");
  void headerBrand.offsetWidth;
  headerBrand.classList.add("auto-save-pulse");
  window.setTimeout(() => {
    headerBrand.classList.remove("auto-save-pulse");
    if (autoSaveTargetDocId && autoSaveEndsAt > Date.now() && headerTitle) {
      headerTitle.textContent = DEFAULT_HEADER_TITLE;
    }
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
    updateAutoSaveHeaderState(false);
    status.textContent = `Default timer: ${preferredAutoSaveMinutes} min. Pick 3, 5, or 10 minutes to start a repeating auto-save loop for the active document.`;
    return;
  }

  updateAutoSaveHeaderState(true);
  const remaining = formatAutoSaveRemaining(autoSaveEndsAt - Date.now());
  status.textContent = `Looping save for "${autoSaveTargetDocTitle}" in ${remaining}. The last 5 seconds pulse green before each save.`;
}

async function runAutoSaveTimerSave() {
  if (autoSaveIsSaving) return;
  const targetDoc = app.documents.find((doc) => doc.id === autoSaveTargetDocId);
  const timerMinutes = autoSaveDurationMinutes;
  const docLabel = autoSaveTargetDocTitle || "document";

  if (!targetDoc) {
    clearAutoSaveTimerState();
    updateAutoSaveTimerUI();
    showError("Auto-save failed", new Error(`The timed document "${docLabel}" is no longer open.`));
    return;
  }

  try {
    autoSaveIsSaving = true;
    if (autoSaveIntervalId) {
      window.clearInterval(autoSaveIntervalId);
      autoSaveIntervalId = null;
    }
    updateAutoSaveTimerUI();

    await core.executeAsModal(async () => {
      if (typeof targetDoc.save === "function") {
        await targetDoc.save();
      } else {
        app.activeDocument = targetDoc;
        await action.batchPlay([{ _obj: "save", _options: { dialogOptions: "dontDisplay" } }], {
          synchronousExecution: true,
          continueOnError: true,
        });
      }
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
  } finally {
    autoSaveIsSaving = false;
    updateAutoSaveTimerUI();
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
        ensureConvertToLayersButton(layout);
        ensureStampVisibleButton(layout);
        ensureRemoveEffectsButton(layout);
        normalizeTextToolsRow(layout);
        const allSaved = layout.flat().flatMap(g => g.buttons);
        const newBtns = Object.keys(BUTTON_DEFS).filter(id => !allSaved.includes(id) && id !== "btn-rasterize" && id !== "btn-convert-layers" && id !== "btn-stamp-visible" && id !== "btn-remove-effects" && id !== "btn-paste-text-lines" && id !== "btn-notes-board");
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

  const toolsFooter = document.createElement("div");
  toolsFooter.className = "tools-footer";
  root.appendChild(toolsFooter);

  renderAutoSaveTimerCard(toolsFooter);

  const exportRow = document.createElement("div");
  exportRow.className = "tools-export-row";
  toolsFooter.appendChild(exportRow);

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
  jpgBtn.addEventListener("click", () => showExportDialog("jpg"));
  exportRow.appendChild(jpgBtn);

  // â”€â”€ PNG Export button â”€â”€
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
  pngBtn.addEventListener("click", () => showExportDialog("png"));
  exportRow.appendChild(pngBtn);

  // â”€â”€ Export All Layers button â”€â”€
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
  toolsFooter.appendChild(exportAllBtn);

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
  cancelBtn.textContent = "âœ•";

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
        ghost.style.borderRadius = "0px"; ghost.style.padding = "4px"; ghost.style.border = "1px solid #555";
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
    "btn-remove-effects": showLayerEffectsRemovalSelector,
    "btn-convert-layers": convertToLayers,
    "btn-smart-object": convertToSmartObject,
    "btn-smart-merge": convertToSmartObjectMerged,
    "btn-stamp-visible": stampVisibleLayers,
    "btn-new-layer": createNewLayer,
    "btn-width": () => resizeLayer("height"),
    "btn-both": () => resizeLayer("width"),
    "btn-stretch-all": () => resizeLayer("both"),
    "btn-rotate-left": () => rotateLayer(-90),
    "btn-rotate-right": () => rotateLayer(90),
    "btn-place-embed": placeEmbedded,
    "btn-paste-text-lines": showStyledTextPasteDialog,
    "btn-notes-board": showNotesBoard,
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
  if (map[id]) runPanelAction(BUTTON_DEFS[id]?.title || "Action failed", map[id]);
}

function wireActions() {
  Object.keys(BUTTON_DEFS).forEach(id => {
    const el = document.getElementById(id);
    if (el?.classList.contains("pill-btn")) el.addEventListener("click", () => fireAction(id));
  });
}

// â”€â”€â”€ Photoshop DOM / Actions Execute Commands â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

async function convertToLayers() {
  const doc = app.activeDocument;
  if (!doc) {
    showError("Convert to Layers failed", new Error("No active document."));
    return;
  }

  const layers = Array.from(doc.activeLayers || []);
  if (layers.length === 0) {
    showError("Convert to Layers failed", new Error("No layers selected."));
    return;
  }

  setStatus("Converting smart object to layers...", "working");
  try {
    await core.executeAsModal(async () => {
      await action.batchPlay([{
        _obj: "placedLayerConvertToLayers",
        _options: { dialogOptions: "dontDisplay" },
      }], { synchronousExecution: true });
    }, { commandName: "Convert to Layers" });
    setStatus("Converted smart object to layers.", "success");
    if (typeof refreshLayerList === "function") refreshLayerList();
  } catch (e) {
    showError("Convert to Layers failed", e);
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

async function runStampSelectedLayers(activeLayers) {
  const refs = activeLayers
    .filter((layer) => layer && !layer.locked)
    .map((layer) => ({ _ref: "layer", _id: layer.id }));

  if (refs.length < 2) return false;

  try {
    await action.batchPlay([
      {
        _obj: "select",
        _target: refs,
        makeVisible: false,
        _options: { dialogOptions: "dontDisplay" },
      },
      {
        _obj: "mergeLayersNew",
        _options: { dialogOptions: "dontDisplay" },
      },
    ], {
      synchronousExecution: true,
      continueOnError: true,
    });
    return true;
  } catch (_) {
    return false;
  }
}

async function stampVisibleLayers() {
  const doc = app.activeDocument;
  if (!doc) {
    showError("Stamp Visible failed", new Error("No active document."));
    return;
  }

  const activeLayers = Array.from(doc.activeLayers || []);
  const canStampSelection = activeLayers.filter((layer) => layer && !layer.locked).length > 1;

  setStatus(canStampSelection ? "Stamping selected layers..." : "Stamping visible layers...", "working");
  try {
    let stampedSelection = false;
    await core.executeAsModal(async () => {
      if (canStampSelection) stampedSelection = await runStampSelectedLayers(activeLayers);

      if (!stampedSelection) {
        await action.batchPlay([{
          _obj: "mergeVisible",
          duplicate: true,
          _options: { dialogOptions: "dontDisplay" },
        }], { synchronousExecution: true });
      }
    }, { commandName: canStampSelection ? "Stamp Selected Layers" : "Stamp Visible Layers" });

    setStatus(stampedSelection ? "Stamped selected layers into a new layer." : "Stamped visible layers into a new layer.", "success");
    if (typeof refreshLayerList === "function") refreshLayerList();
  } catch (e) {
    showError("Stamp Visible failed", e);
  }
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
  }, { commandName: `Rotate ${degrees > 0 ? "Right" : "Left"} 90Â°` });
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
  const doc = app.activeDocument;
  if (!doc) {
    setStatus("No document open", "error");
    return;
  }
  const active = Array.from(doc.activeLayers || []).filter(l => !l.locked);
  if (!active.length) {
    setStatus("Select a layer to align", "error");
    return;
  }
  if (active.length >= 2) {
    showAlignmentTargetDialog(mode, active);
    return;
  }
  await applyLayerAlignment(mode, active[0], null);
}

function showAlignmentTargetDialog(mode, activeLayers) {
  const existing = document.getElementById("alignment-target-modal");
  if (existing) existing.remove();

  const sourceLayer = activeLayers[0];
  const targetLayers = activeLayers.slice(1);
  const modal = document.createElement("div");
  modal.id = "alignment-target-modal";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-content layer-export-modal-content compact-tool-modal">
      <div class="modal-header">
        <h3>Align Layer</h3>
        <button class="modal-close" id="close-align-target-modal">&times;</button>
      </div>
      <div class="tool-modal-body">
        <button id="align-to-page" type="button" class="tool-choice-btn primary">Align to page</button>
        <div class="alignment-target-list">
          <div class="modal-field-label">Use Layer Size</div>
          ${targetLayers.map((layer) => `<button type="button" class="tool-choice-btn alignment-layer-option" data-layer-id="${layer.id}">${escapeHtml(layer.name || "Layer")}</button>`).join("")}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector("#close-align-target-modal").addEventListener("click", () => modal.remove());
  modal.querySelector("#align-to-page").addEventListener("click", async () => {
    modal.remove();
    await applyLayerAlignment(mode, sourceLayer, null);
  });
  modal.querySelectorAll(".alignment-layer-option").forEach((button) => {
    button.addEventListener("click", async () => {
      const targetId = Number(button.dataset.layerId);
      const targetLayer = targetLayers.find((layer) => Number(layer.id) === targetId);
      modal.remove();
      await applyLayerAlignment(mode, sourceLayer, targetLayer || null);
    });
  });
}

async function applyLayerAlignment(mode, sourceLayer, targetLayer) {
  await core.executeAsModal(async () => {
    const doc = app.activeDocument; if (!doc) return;
    const sourceRect = getLayerBoundsRect(sourceLayer);
    const targetRect = targetLayer ? getLayerBoundsRect(targetLayer) : {
      left: 0,
      top: 0,
      right: Number(doc.width),
      bottom: Number(doc.height),
      width: Number(doc.width),
      height: Number(doc.height),
    };
    if (!sourceRect || !targetRect) return;

    const sourceCx = sourceRect.left + sourceRect.width / 2;
    const sourceCy = sourceRect.top + sourceRect.height / 2;
    const targetCx = targetRect.left + targetRect.width / 2;
    const targetCy = targetRect.top + targetRect.height / 2;
    let tx = 0;
    let ty = 0;

    if (mode === "left") tx = targetRect.left - sourceRect.left;
    else if (mode === "h-center") tx = targetCx - sourceCx;
    else if (mode === "right") tx = targetRect.right - sourceRect.right;
    else if (mode === "top") ty = targetRect.top - sourceRect.top;
    else if (mode === "v-center") ty = targetCy - sourceCy;
    else if (mode === "bottom") ty = targetRect.bottom - sourceRect.bottom;

    await action.batchPlay([{ _obj: "select", _target: [{ _ref: "layer", _id: sourceLayer.id }], makeVisible: false }], { synchronousExecution: true });
    await sourceLayer.translate(tx, ty);
  }, { commandName: targetLayer ? "Align to Layer" : "Align to Page" });
}

async function deleteSelectedLayers() {
  await core.executeAsModal(async () => {
    const doc = app.activeDocument; if (!doc) return;
    for (const l of [...doc.activeLayers]) if (!l.locked) await l.delete();
  }, { commandName: "Delete Selected Layers" });
}

const TEXT_PASTE_FONTS = [
  { label: "Arial", value: "ArialMT" },
  { label: "Arial Bold", value: "Arial-BoldMT" },
  { label: "Helvetica", value: "Helvetica" },
  { label: "Times", value: "TimesNewRomanPSMT" },
  { label: "Georgia", value: "Georgia" },
  { label: "Impact", value: "Impact" },
];

const TEXT_PASTE_STYLES = [
  { label: "Regular", bold: false, italic: false },
  { label: "Bold", bold: true, italic: false },
  { label: "Italic", bold: false, italic: true },
  { label: "Bold Italic", bold: true, italic: true },
];

let notesBoardZoom = 1;

function parseHexToRGBColor(hexValue, fallback = "#ffffff") {
  const clean = String(hexValue || fallback).trim().replace(/^#/, "");
  const full = clean.length === 3
    ? clean.split("").map((char) => char + char).join("")
    : clean;
  const value = /^[0-9a-fA-F]{6}$/.test(full) ? full : fallback.replace(/^#/, "");
  return {
    _obj: "RGBColor",
    red: parseInt(value.slice(0, 2), 16),
    green: parseInt(value.slice(2, 4), 16),
    blue: parseInt(value.slice(4, 6), 16),
  };
}

function getLayerBoundsRect(layer) {
  const bounds = (layer && (layer.boundsNoEffects || layer.bounds)) || null;
  if (!bounds) return null;
  const left = Number(bounds.left);
  const top = Number(bounds.top);
  const right = Number(bounds.right);
  const bottom = Number(bounds.bottom);
  if (![left, top, right, bottom].every(Number.isFinite)) return null;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

async function showExportDialog(format) {
  const doc = app.activeDocument;
  if (!doc) {
    setStatus("No document open", "error");
    return;
  }

  const existingModal = document.getElementById("export-choice-modal");
  if (existingModal) existingModal.remove();

  const baseName = (doc.title || doc.name || "export").replace(/\.[^/.]+$/, "");
  const modal = document.createElement("div");
  modal.id = "export-choice-modal";
  modal.className = "modal-overlay";
  
  const allLayers = getAllLayersFlat(doc).filter(l => l.name);

  modal.innerHTML = `
    <div class="modal-content layer-export-modal-content compact-tool-modal" style="width: 320px; max-height: 85vh; overflow: hidden; display: flex; flex-direction: column; padding: 16px;">
      <div class="modal-header" style="margin-bottom: 16px;">
        <h3 style="font-size: 14px; font-weight: 600;">Export as ${format.toUpperCase()}</h3>
        <button class="modal-close" id="close-export-modal" style="font-size: 18px;">&times;</button>
      </div>
      
      <div class="tool-modal-body" style="overflow-y: auto; flex: 1; padding: 0 4px;">
        <div class="field-group" style="margin-bottom: 16px;">
            <span class="field-label" style="font-size: 11px; margin-bottom: 6px; display: block; opacity: 0.8;">File Name</span>
            <input id="export-name" class="modal-input" value="${escapeHtml(baseName)}" placeholder="File name" style="width: 100%; box-sizing: border-box;">
        </div>

        <div class="export-options-tabs" style="display:flex; gap:6px; margin-bottom: 16px; background: rgba(255,255,255,0.03); padding: 4px; border-radius: 6px;">
            <button id="tab-export-doc" class="tab-btn active" style="flex:1; padding: 6px; font-size: 10px;">Entire Doc</button>
            <button id="tab-export-select" class="tab-btn" style="flex:1; padding: 6px; font-size: 10px;">Select Layers</button>
        </div>

        <div id="export-doc-panel" class="export-panel">
            <p style="font-size:10px; opacity:0.6; margin-bottom:16px; line-height: 1.4;">Flattened export of the entire canvas.</p>
            <button id="btn-export-doc-now" type="button" class="tool-choice-btn primary" style="width: 100%; height: 38px;">
                <span style="font-size: 12px;">Export Document</span>
            </button>
        </div>

        <div id="export-select-panel" class="export-panel hidden">
            <p style="font-size:10px; opacity:0.6; margin-bottom:8px; line-height: 1.4;">Export specific visible items.</p>
            <div id="export-layer-list" style="max-height: 180px; overflow-y: auto; background: rgba(0,0,0,0.15); border: 1px solid rgba(255,255,255,0.05); border-radius:4px; padding:2px;">
                ${allLayers.map(layer => `
                    <div class="export-layer-row" style="display: flex; align-items: center; padding: 5px 8px; border-bottom: 1px solid rgba(255,255,255,0.03); cursor:pointer;">
                        <input type="checkbox" class="export-layer-check" data-id="${layer.id}" checked style="margin: 0; width: 12px; height: 12px;">
                        <span style="font-size:11px; margin-left:8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.9;">${escapeHtml(layer.name)}</span>
                    </div>
                `).join('')}
            </div>
            <button id="btn-export-select-now" type="button" class="tool-choice-btn primary" style="width: 100%; height: 38px; margin-top:12px;">
                <span style="font-size: 12px;">Export Selection</span>
            </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const nameInput = modal.querySelector("#export-name");
  const docPanel = modal.querySelector("#export-doc-panel");
  const selectPanel = modal.querySelector("#export-select-panel");
  const tabDoc = modal.querySelector("#tab-export-doc");
  const tabSelect = modal.querySelector("#tab-export-select");

  tabDoc.addEventListener("click", () => {
    tabDoc.classList.add("active");
    tabSelect.classList.remove("active");
    docPanel.classList.remove("hidden");
    selectPanel.classList.add("hidden");
  });

  tabSelect.addEventListener("click", () => {
    tabSelect.classList.add("active");
    tabDoc.classList.remove("active");
    selectPanel.classList.remove("hidden");
    docPanel.classList.add("hidden");
  });

  modal.querySelectorAll(".export-layer-row").forEach(row => {
      row.addEventListener("click", (e) => {
          if (e.target.type !== "checkbox") {
              const cb = row.querySelector("input");
              cb.checked = !cb.checked;
          }
      });
  });

  modal.querySelector("#close-export-modal").addEventListener("click", () => modal.remove());

  modal.querySelector("#btn-export-doc-now").addEventListener("click", async () => {
    const name = nameInput.value.trim() || baseName;
    modal.remove();
    await performUnifiedExport("document", format, name);
  });

  modal.querySelector("#btn-export-select-now").addEventListener("click", async () => {
    const name = nameInput.value.trim() || baseName;
    const selectedIds = Array.from(modal.querySelectorAll(".export-layer-check:checked")).map(cb => Number(cb.dataset.id));
    if (selectedIds.length === 0) {
        setStatus("No layers selected", "error");
        return;
    }
    modal.remove();
    await performUnifiedExport("selection", format, name, selectedIds);
  });
}

async function performUnifiedExport(scope, format, customName, layerIds = []) {
  const doc = app.activeDocument;
  if (!doc) return;

  const folder = await uxpFs.getFolder();
  if (!folder) return;

  const safeName = customName.replace(/[<>:"/\\|?*]/g, "_");
  const file = await folder.createFile(`${safeName}.${format}`, { overwrite: true });
  const originalDocId = doc.id;

  setStatus(`Exporting ${format.toUpperCase()}...`, "working");

  try {
    await core.executeAsModal(async () => {
      // Record initial state
      const initialVisibility = new Map();
      const allDocLayers = getAllLayersFlat(doc);
      
      if (scope === "selection") {
        allDocLayers.forEach(l => {
            initialVisibility.set(l.id, l.visible);
            l.visible = layerIds.includes(l.id);
        });
      }

      // 1. STAMP VISIBLE — creates a new merged layer on top
      await action.batchPlay([
        {
          _obj: "mergeVisible",
          duplicate: true,
          _options: { dialogOptions: "dontDisplay" }
        }
      ], { synchronousExecution: true });

      const stampLayerId = doc.activeLayers[0].id;

      // 2. SAVE DIRECTLY — no temp document needed!
      // Use the Photoshop saveAs API on the current doc with the stamp visible
      if (format === "jpg") {
        await doc.saveAs.jpg(file, { quality: 12 }, true);
      } else {
        await doc.saveAs.png(file, {}, true);
      }

      // 3. DELETE the stamp layer to restore original state
      await action.batchPlay([{
          _obj: "delete",
          _target: [{ _ref: "layer", _id: stampLayerId }],
          _options: { dialogOptions: "dontDisplay" }
      }], { synchronousExecution: true });

      // 4. RESTORE layer visibility if we changed it
      if (scope === "selection") {
        allDocLayers.forEach(l => {
            if (initialVisibility.has(l.id)) {
                try { l.visible = initialVisibility.get(l.id); } catch(_) {}
            }
        });
      }

      // Ensure we're still on the original document
      const origDoc = app.documents.find(d => d.id === originalDocId);
      if (origDoc) app.activeDocument = origDoc;

      setStatus(`Exported: ${safeName}.${format}`, "success");
    }, { commandName: "Export " + format.toUpperCase() });
  } catch (err) {
    // Make sure original doc is still active even on error
    try {
      const origDoc = app.documents.find(d => d.id === originalDocId);
      if (origDoc) app.activeDocument = origDoc;
    } catch(_) {}
    showError("Export Failed", err);
  }
}

function getAllLayersFlat(container) {
  let result = [];
  const layers = Array.from(container.layers || []);
  layers.forEach(layer => {
    result.push(layer);
    if (layer.layers && layer.layers.length > 0) {
      result = result.concat(getAllLayersFlat(layer));
    }
  });
  return result;
}



function showStyledTextPasteDialog() {
  const existing = document.getElementById("styled-text-paste-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "styled-text-paste-modal";
  modal.className = "modal-overlay";
  modal.style.background = "rgba(0, 0, 0, 0.72)";
  document.body.classList.add("text-paste-modal-open");
  modal.innerHTML = `
    <div class="modal-content layer-export-modal-content text-paste-modal-content">
      <div class="modal-header">
        <h3>Paste Text</h3>
        <button class="modal-close" id="close-text-paste-modal">&times;</button>
      </div>
      <div class="tool-modal-body">
        <div class="text-paste-mode-row" role="group" aria-label="Paste text mode" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 2px 0;min-height:40px;">
          <div class="text-paste-mode-option active" role="button" tabindex="0" data-text-paste-mode="all" style="display:flex;align-items:center;justify-content:center;min-height:40px;border:1px solid rgba(91,155,240,.62);background:rgba(47,125,246,.25);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">All</div>
          <div class="text-paste-mode-option" role="button" tabindex="0" data-text-paste-mode="break" style="display:flex;align-items:center;justify-content:center;min-height:40px;border:1px solid rgba(255,255,255,.14);background:rgba(12,18,28,.9);color:#dbe5f7;font-size:13px;font-weight:700;cursor:pointer;">Break</div>
        </div>
        <textarea id="text-paste-source" class="tool-textarea" placeholder="Paste multiple lines here"></textarea>
        <div class="text-paste-toolbar">
          <button id="text-paste-build-lines" type="button" class="tool-choice-btn">Set Styles</button>
        </div>
        <div id="text-paste-line-list" class="text-paste-line-list"></div>
      </div>
      <div class="layer-export-actions">
        <button id="text-paste-cancel" class="btn-select-all">Cancel</button>
        <button id="text-paste-apply" class="btn-export-selected">Paste</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const modalContent = modal.querySelector(".text-paste-modal-content");
  if (modalContent) {
    modalContent.style.width = "min(340px, calc(100vw - 28px))";
    modalContent.style.background = "linear-gradient(180deg, rgba(58, 74, 103, 0.99), rgba(43, 55, 78, 0.99))";
    modalContent.style.boxShadow = "0 24px 54px rgba(0,0,0,.58)";
  }

  const source = modal.querySelector("#text-paste-source");
  const list = modal.querySelector("#text-paste-line-list");
  const modeOptions = Array.from(modal.querySelectorAll(".text-paste-mode-option"));
  let pasteMode = "all";
  const closeModal = () => {
    document.body.classList.remove("text-paste-modal-open");
    modal.remove();
  };
  const getMode = () => pasteMode;
  const renderRows = () => {
    const mode = getMode();
    const sourceText = String(source.value || "");
    const lines = mode === "break"
      ? sourceText.split(/\r?\n/).filter((line) => line.length > 0)
      : [sourceText].filter((line) => line.length > 0);
    list.innerHTML = lines.map((line, index) => `
      <div class="text-paste-line-row" data-line-index="${index}">
        <div class="text-paste-line-preview">${escapeHtml(line)}</div>
        <select class="text-paste-font">${TEXT_PASTE_FONTS.map((font) => `<option value="${font.value}">${font.label}</option>`).join("")}</select>
        <input class="text-paste-color" type="color" value="${index % 2 ? "#f8d36b" : "#ffffff"}">
        <select class="text-paste-style">${TEXT_PASTE_STYLES.map((style, styleIndex) => `<option value="${styleIndex}">${style.label}</option>`).join("")}</select>
      </div>
    `).join("");
  };
  const syncModeUI = () => {
    const mode = getMode();
    modeOptions.forEach((option) => {
      const active = option.dataset.textPasteMode === mode;
      option.classList.toggle("active", active);
      option.style.borderColor = active ? "rgba(91,155,240,.72)" : "rgba(255,255,255,.14)";
      option.style.background = active ? "rgba(47,125,246,.28)" : "rgba(12,18,28,.9)";
      option.style.color = active ? "#fff" : "#dbe5f7";
    });
    modal.querySelector("#text-paste-build-lines").textContent = mode === "break" ? "Set Line Styles" : "Set Text Style";
    renderRows();
  };

  modal.querySelector("#close-text-paste-modal").addEventListener("click", closeModal);
  modal.querySelector("#text-paste-cancel").addEventListener("click", closeModal);
  modal.querySelector("#text-paste-build-lines").addEventListener("click", renderRows);
  modeOptions.forEach((option) => {
    option.addEventListener("click", () => {
      pasteMode = option.dataset.textPasteMode || "all";
      syncModeUI();
    });
    option.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      pasteMode = option.dataset.textPasteMode || "all";
      syncModeUI();
    });
  });
  source.addEventListener("input", () => {
    if (getMode() === "break" || !list.children.length) renderRows();
  });
  modal.querySelector("#text-paste-apply").addEventListener("click", async () => {
    if (!list.children.length) renderRows();
    const sourceText = String(source.value || "");
    const lines = getMode() === "break"
      ? sourceText.split(/\r?\n/).filter((line) => line.length > 0)
      : [sourceText].filter((line) => line.length > 0);
    const styles = Array.from(list.querySelectorAll(".text-paste-line-row")).map((row) => {
      const style = TEXT_PASTE_STYLES[Number(row.querySelector(".text-paste-style").value)] || TEXT_PASTE_STYLES[0];
      return {
        font: row.querySelector(".text-paste-font").value,
        color: row.querySelector(".text-paste-color").value,
        bold: style.bold,
        italic: style.italic,
      };
    });
    closeModal();
    await pasteStyledTextLines(lines, styles);
  });
  syncModeUI();
  setTimeout(() => source.focus(), 40);
}

async function pasteStyledTextLines(lines, styles) {
  const doc = app.activeDocument;
  if (!doc) {
    setStatus("No document open", "error");
    return;
  }
  if (!lines.length) {
    setStatus("Paste text first", "error");
    return;
  }

  const startX = Math.round(Number(doc.width) * 0.08) || 80;
  const startY = Math.round(Number(doc.height) * 0.14) || 100;
  const fontSize = Math.max(22, Math.round((Number(doc.height) || 1080) * 0.045));
  const lineGap = Math.round(fontSize * 1.35);

  try {
    await core.executeAsModal(async () => {
      for (let index = 0; index < lines.length; index++) {
        const style = styles[index] || styles[0] || {};
        const color = parseHexToRGBColor(style.color || "#ffffff");
        await action.batchPlay([{
          _obj: "make",
          _target: [{ _ref: "textLayer" }],
          using: {
            _obj: "textLayer",
            textKey: lines[index],
            textClickPoint: {
              _obj: "paint",
              horizontal: { _unit: "pixelsUnit", _value: startX },
              vertical: { _unit: "pixelsUnit", _value: startY + index * lineGap },
            },
            textStyleRange: [{
              _obj: "textStyleRange",
              from: 0,
              to: lines[index].length,
              textStyle: {
                _obj: "textStyle",
                fontPostScriptName: style.font || "ArialMT",
                size: { _unit: "pointsUnit", _value: fontSize },
                fauxBold: !!style.bold,
                fauxItalic: !!style.italic,
                color,
              },
            }],
          },
          _options: { dialogOptions: "dontDisplay" },
        }], { synchronousExecution: true, continueOnError: true });
      }
    }, { commandName: "Paste Styled Text Lines" });

    setStatus(`Added ${lines.length} text layer(s).`, "success");
  } catch (e) {
    showError("Paste text failed", e);
  }
}

function showNotesBoard() {
  const existing = document.getElementById("notes-board-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "notes-board-modal";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-content layer-export-modal-content notes-board-modal-content">
      <div class="modal-header">
        <h3>Notes</h3>
        <button class="modal-close" id="close-notes-board-modal">&times;</button>
      </div>
      <div class="notes-board-toolbar">
        <button id="notes-zoom-out" type="button">-</button>
        <span id="notes-zoom-label">${Math.round(notesBoardZoom * 100)}%</span>
        <button id="notes-zoom-in" type="button">+</button>
      </div>
      <div class="notes-board-viewport">
        <div id="notes-board-surface" class="notes-board-surface" contenteditable="true" spellcheck="true"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const surface = modal.querySelector("#notes-board-surface");
  const label = modal.querySelector("#notes-zoom-label");
  const saved = localStorage.getItem("slide_creator_notes_board_html_v1");
  surface.innerHTML = saved || "";

  const applyZoom = () => {
    surface.style.transform = `scale(${notesBoardZoom})`;
    label.textContent = `${Math.round(notesBoardZoom * 100)}%`;
  };

  modal.querySelector("#close-notes-board-modal").addEventListener("click", () => {
    localStorage.setItem("slide_creator_notes_board_html_v1", surface.innerHTML);
    modal.remove();
  });
  modal.querySelector("#notes-zoom-out").addEventListener("click", () => {
    notesBoardZoom = Math.max(0.35, notesBoardZoom - 0.15);
    applyZoom();
  });
  modal.querySelector("#notes-zoom-in").addEventListener("click", () => {
    notesBoardZoom = Math.min(2.5, notesBoardZoom + 0.15);
    applyZoom();
  });
  surface.addEventListener("input", () => {
    localStorage.setItem("slide_creator_notes_board_html_v1", surface.innerHTML);
  });
  applyZoom();
  setTimeout(() => surface.focus(), 40);
}

const LAYER_EFFECT_LABELS = {
  solidFill: "Color Overlay",
  gradientFill: "Gradient Overlay",
  patternFill: "Pattern Overlay",
  frameFX: "Stroke",
  frameFXMulti: "Stroke",
  dropShadow: "Drop Shadow",
  dropShadowMulti: "Drop Shadow",
  innerShadow: "Inner Shadow",
  innerShadowMulti: "Inner Shadow",
  outerGlow: "Outer Glow",
  innerGlow: "Inner Glow",
  bevelEmboss: "Bevel & Emboss",
  chromeFX: "Satin",
};

const LAYER_EFFECT_META_KEYS = new Set([
  "_obj",
  "scale",
  "masterFXSwitch",
  "globalLightingAngle",
  "globalLightingAltitude",
]);

function flattenLayerEffectValue(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function prettifyLayerEffectKey(key) {
  const cleaned = String(key || "")
    .replace(/Multi$/, "")
    .replace(/FX$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "Effect";
}

function getLayerEffectLabels(layerEffects) {
  if (!layerEffects || typeof layerEffects !== "object") return [];

  const labels = [];
  const seen = new Set();

  Object.entries(layerEffects).forEach(([key, value]) => {
    if (LAYER_EFFECT_META_KEYS.has(key)) return;

    const hasDescriptor = flattenLayerEffectValue(value).some((item) =>
      item && typeof item === "object" && Object.keys(item).length > 0
    );
    if (!hasDescriptor) return;

    const label = LAYER_EFFECT_LABELS[key] || prettifyLayerEffectKey(key);
    const signature = label.toLowerCase();
    if (seen.has(signature)) return;
    seen.add(signature);
    labels.push(label);
  });

  return labels;
}

function isLayerLockedForEffectRemoval(layer) {
  try {
    return !!(layer.locked || layer.allLocked || layer.pixelsLocked || layer.positionLocked);
  } catch (_) {
    return false;
  }
}

async function fetchLayerEffectDescriptors(layerEntries) {
  const effectLayers = [];
  const chunkSize = 30;

  for (let index = 0; index < layerEntries.length; index += chunkSize) {
    const chunk = layerEntries.slice(index, index + chunkSize);
    const commands = chunk.map((layer) => ({
      _obj: "multiGet",
      _target: {
        _ref: [
          { _ref: "layer", _id: layer.id },
          { _ref: "document", _enum: "ordinal", _value: "targetEnum" },
        ],
      },
      extendedReference: [["name", "layerEffects"]],
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
      const layer = chunk[resultIndex];
      const effectLabels = getLayerEffectLabels(descriptor.layerEffects);
      if (effectLabels.length === 0) return;

      effectLayers.push({
        id: layer.id,
        name: descriptor.name || layer.name || "Layer",
        locked: isLayerLockedForEffectRemoval(layer),
        effectLabels,
      });
    });
  }

  return effectLayers;
}

async function findLayersWithEffects(doc) {
  const allLayers = getAllLayersRecursive(doc).filter((layer) =>
    layer && Number.isFinite(Number(layer.id)) && !layer.isBackgroundLayer
  );
  if (allLayers.length === 0) return [];

  let effectLayers = [];
  await core.executeAsModal(async () => {
    effectLayers = await fetchLayerEffectDescriptors(allLayers);
  }, { commandName: "Scan Layer Effects" });

  return effectLayers;
}

async function showLayerEffectsRemovalSelector() {
  const doc = app.activeDocument;
  if (!doc) {
    setStatus("No document open", "error");
    return;
  }

  setStatus("Scanning layers with effects...", "working");

  let effectLayers = [];
  try {
    effectLayers = await findLayersWithEffects(doc);
  } catch (e) {
    showError("Layer effect scan failed", e);
    return;
  }

  if (effectLayers.length === 0) {
    setStatus("No layers with effects found", "error");
    return;
  }

  const existingModal = document.getElementById("layer-effects-modal");
  if (existingModal) existingModal.remove();

  const modal = document.createElement("div");
  modal.id = "layer-effects-modal";
  modal.className = "modal-overlay";

  const modalContent = document.createElement("div");
  modalContent.className = "modal-content layer-export-modal-content layer-effects-modal-content";

  const header = document.createElement("div");
  header.className = "modal-header";
  header.innerHTML = `
        <h3>Remove Layer Effects</h3>
        <button class="modal-close" id="close-layer-effects-modal">&times;</button>
    `;

  const layerList = document.createElement("div");
  layerList.className = "layer-export-list layer-effects-list";

  effectLayers.forEach((layer) => {
    const locked = layer.locked;
    const item = document.createElement("div");
    item.className = "layer-export-item layer-effects-item" + (locked ? " disabled" : "");
    item.innerHTML = `
            <input type="checkbox" class="layer-effects-checkbox" data-layer-id="${layer.id}" ${locked ? "disabled" : "checked"}>
            <span class="layer-export-name layer-effects-name">${escapeHtml(layer.name)}</span>
            <span class="layer-effects-meta">${escapeHtml(layer.effectLabels.join(", "))}${locked ? " - Locked" : ""}</span>
        `;
    layerList.appendChild(item);
  });

  const actions = document.createElement("div");
  actions.className = "layer-export-actions layer-effects-actions";
  actions.innerHTML = `
        <button class="btn-select-all" id="select-all-effects">Select All</button>
        <button class="btn-deselect-all" id="deselect-all-effects">Clear</button>
        <button class="btn-export-selected btn-remove-layer-effects" id="btn-remove-layer-effects">Remove Effects</button>
    `;

  modalContent.appendChild(header);
  modalContent.appendChild(layerList);
  modalContent.appendChild(actions);
  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  const getEnabledCheckboxes = () => Array.from(modal.querySelectorAll(".layer-effects-checkbox:not(:disabled)"));
  const getSelectedIds = () => getEnabledCheckboxes()
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => Number(checkbox.dataset.layerId))
    .filter((id) => Number.isFinite(id));

  modal.querySelector("#close-layer-effects-modal").addEventListener("click", () => modal.remove());
  modal.querySelector("#select-all-effects").addEventListener("click", () => {
    getEnabledCheckboxes().forEach((checkbox) => { checkbox.checked = true; });
  });
  modal.querySelector("#deselect-all-effects").addEventListener("click", () => {
    getEnabledCheckboxes().forEach((checkbox) => { checkbox.checked = false; });
  });
  modal.querySelectorAll(".layer-effects-item").forEach((item) => {
    item.addEventListener("click", (event) => {
      if (event.target && event.target.type === "checkbox") return;
      const checkbox = item.querySelector(".layer-effects-checkbox");
      if (!checkbox || checkbox.disabled) return;
      checkbox.checked = !checkbox.checked;
    });
  });

  const removeButton = modal.querySelector("#btn-remove-layer-effects");
  removeButton.disabled = getEnabledCheckboxes().length === 0;
  removeButton.addEventListener("click", async () => {
    const layerIds = getSelectedIds();
    if (layerIds.length === 0) {
      setStatus("Select at least one layer with effects", "error");
      return;
    }

    modal.remove();
    await removeLayerEffectsByIds(layerIds);
  });
}

function batchPlayHadError(results) {
  return Array.isArray(results) && results.some((result) => result && result._obj === "error");
}

async function removeLayerEffectsProperty(layerId) {
  try {
    const results = await action.batchPlay([
      {
        _obj: "select",
        _target: [{ _ref: "layer", _id: layerId }],
        makeVisible: false,
        _options: { dialogOptions: "dontDisplay" },
      },
      {
        _obj: "delete",
        _target: [
          { _ref: "property", _property: "layerEffects" },
          { _ref: "layer", _enum: "ordinal", _value: "targetEnum" },
        ],
        _options: { dialogOptions: "dontDisplay" },
      },
    ], {
      continueOnError: true,
      synchronousExecution: true,
    });

    return !batchPlayHadError(results);
  } catch (_) {
    return false;
  }
}

async function restoreActiveLayersById(layerIds) {
  const ids = layerIds.filter((id) => Number.isFinite(id));
  if (ids.length === 0) return;

  try {
    await action.batchPlay([{
      _obj: "select",
      _target: ids.map((id) => ({ _ref: "layer", _id: id })),
      makeVisible: false,
      _options: { dialogOptions: "dontDisplay" },
    }], {
      continueOnError: true,
      synchronousExecution: true,
    });
  } catch (_) { }
}

async function removeLayerEffectsByIds(layerIds) {
  const doc = app.activeDocument;
  if (!doc) {
    setStatus("No document open", "error");
    return;
  }

  const uniqueLayerIds = [...new Set(layerIds)].filter((id) => Number.isFinite(id));
  if (uniqueLayerIds.length === 0) {
    setStatus("No layers selected", "error");
    return;
  }

  const originalLayerIds = Array.from(doc.activeLayers || [])
    .map((layer) => Number(layer.id))
    .filter((id) => Number.isFinite(id));

  setStatus(`Removing effects from ${uniqueLayerIds.length} layer(s)...`, "working");

  try {
    let removedCount = 0;

    await core.executeAsModal(async () => {
      for (const layerId of uniqueLayerIds) {
        const removed = await removeLayerEffectsProperty(layerId);
        if (removed) removedCount++;
      }

      await restoreActiveLayersById(originalLayerIds);
    }, { commandName: "Remove Layer Effects" });

    if (removedCount === uniqueLayerIds.length) {
      setStatus(`Removed effects from ${removedCount} layer(s).`, "success");
    } else if (removedCount > 0) {
      setStatus(`Removed effects from ${removedCount} of ${uniqueLayerIds.length} layer(s).`, "success");
    } else {
      setStatus("Could not remove effects from the selected layers", "error");
    }
  } catch (e) {
    showError("Remove effects failed", e);
  }
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

          const newDoc = await createDocumentCompat(layerW, layerH, "Export_" + i, constants.DocumentFill.TRANSPARENT);

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
      const originalDocId = doc.id;

      for (let i = 0; i < allLayers.length; i++) {
        const layer = allLayers[i];
        if (layer.locked) continue;
        if (layer.layers && layer.layers.length > 0) continue;

        const layerId = layer.id;
        const layerName = layer.name.replace(/[<>:"/\\|?*]/g, "_") || `Layer_${i + 1}`;

        try {
          const bounds = getLayerBoundsRect(layer) || {};
          const layerW = Math.max(1, Math.round((bounds.right || 0) - (bounds.left || 0)) || Math.round(Number(doc.width) || 1));
          const layerH = Math.max(1, Math.round((bounds.bottom || 0) - (bounds.top || 0)) || Math.round(Number(doc.height) || 1));
          const tempFill = format === "jpg"
            ? (constants.DocumentFill.WHITE || constants.DocumentFill.BACKGROUNDCOLOR || constants.DocumentFill.TRANSPARENT)
            : constants.DocumentFill.TRANSPARENT;
          const tempDoc = await createDocumentCompat(layerW, layerH, `Export_${i + 1}`, tempFill);

          app.activeDocument = doc;
          await action.batchPlay([
            {
              _obj: "select",
              _target: [{ _ref: "layer", _id: layerId }],
              makeVisible: false,
              _options: { dialogOptions: "dontDisplay" },
            }
          ], {
            synchronousExecution: true,
            continueOnError: true,
          });

          await action.batchPlay([{ _obj: "copy", _options: { dialogOptions: "dontDisplay" } }], {
            synchronousExecution: true,
            continueOnError: true,
          });

          app.activeDocument = tempDoc;
          if (format === "jpg") {
            await action.batchPlay([
              { _obj: "selectAll", _options: { dialogOptions: "dontDisplay" } },
              {
                _obj: "fill",
                using: { _enum: "fillContents", _value: "color" },
                color: { _obj: "RGBColor", red: 255, green: 255, blue: 255 },
                opacity: { _unit: "percentUnit", _value: 100 },
                mode: { _enum: "blendMode", _value: "normal" },
                _options: { dialogOptions: "dontDisplay" },
              },
              { _obj: "deselect", _options: { dialogOptions: "dontDisplay" } },
            ], {
              synchronousExecution: true,
              continueOnError: true,
            });
          }
          await action.batchPlay([{ _obj: "paste", _options: { dialogOptions: "dontDisplay" } }], {
            synchronousExecution: true,
            continueOnError: true,
          });
          if (format === "jpg") await tempDoc.flatten();

          const fileName = `${layerName}.${ext}`;
          const fileEntry = await exportDir.createFile(fileName, { overwrite: true });
          if (format === "jpg") {
            await tempDoc.saveAs.jpg(fileEntry, { quality: 12 }, true);
          } else {
            await tempDoc.saveAs.png(fileEntry, {}, true);
          }

          await tempDoc.close(constants.SaveOptions.DONOTSAVECHANGES);
          const originalDoc = app.documents.find((item) => item.id === originalDocId);
          if (originalDoc) app.activeDocument = originalDoc;
          exportedCount++;
          setStatus(`Exported ${exportedCount} layer(s)...`, "working");
        } catch (e) {
          console.warn(`Failed to export layer: ${layerName}`, e);
          const originalDoc = app.documents.find((item) => item.id === originalDocId);
          if (originalDoc) app.activeDocument = originalDoc;
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
// â”€â”€â”€ Layers Organization Tab Logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Flat layer list via batchPlay (guaranteed to work in all UXP versions) â”€â”€
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

// Map PS color label â†’ hex for the color dot
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

// Initialize Custom HTML Scrollbar
document.addEventListener("DOMContentLoaded", () => {
    const scrollArea = document.getElementById("main-scroll-area");
    const thumb = document.getElementById("custom-thumb");
    const track = document.getElementById("custom-scrollbar");

    if (scrollArea && thumb && track) {
        const updateScrollbar = () => {
            if (scrollArea.scrollHeight <= scrollArea.clientHeight) {
                track.style.opacity = "0";
                track.style.pointerEvents = "none";
                return;
            }
            
            track.style.opacity = "1";
            track.style.pointerEvents = "auto";
            
            const scrollRatio = scrollArea.scrollTop / (scrollArea.scrollHeight - scrollArea.clientHeight);
            const thumbHeight = Math.max(20, (scrollArea.clientHeight / scrollArea.scrollHeight) * track.clientHeight);
            thumb.style.height = `${thumbHeight}px`;
            const maxScroll = track.clientHeight - thumbHeight;
            thumb.style.transform = `translateY(${scrollRatio * maxScroll}px)`;
        };

        let isDragging = false;
        let startY = 0;
        let startScrollTop = 0;

        thumb.addEventListener("pointerdown", (e) => {
            isDragging = true;
            startY = e.clientY;
            startScrollTop = scrollArea.scrollTop;
            thumb.classList.add("active");
            document.body.style.userSelect = "none"; // Prevent text selection
            e.preventDefault();
        });

        window.addEventListener("pointermove", (e) => {
            if (!isDragging) return;
            const thumbHeight = Math.max(20, (scrollArea.clientHeight / scrollArea.scrollHeight) * track.clientHeight);
            const maxScroll = track.clientHeight - thumbHeight;
            const scrollableRatio = (scrollArea.scrollHeight - scrollArea.clientHeight) / maxScroll;
            const deltaY = e.clientY - startY;
            scrollArea.scrollTop = startScrollTop + (deltaY * scrollableRatio);
        });

        window.addEventListener("pointerup", () => {
            if (isDragging) {
                isDragging = false;
                thumb.classList.remove("active");
                document.body.style.userSelect = "";
            }
        });

        scrollArea.addEventListener("scroll", updateScrollbar);
        window.addEventListener("resize", updateScrollbar);
        // Delay to allow layout to settle
        setTimeout(updateScrollbar, 200);
        
        // Ensure scrollbar updates on DOM changes
        if (typeof MutationObserver === "function") {
          const observer = new MutationObserver(updateScrollbar);
          observer.observe(scrollArea, { childList: true, subtree: true, attributes: true });
        }
    }
});








// Force sp-dropdown menus to always scroll to top when opened and inject sleek scrollbar styles
document.addEventListener('sp-opened', (e) => {
    if (e.target && e.target.tagName === 'SP-DROPDOWN') {
        const dropdown = e.target;

        const applySleekStyles = () => {
            const menu = dropdown.querySelector('sp-menu');
            if (menu) {
                // Force scroll to top
                menu.scrollTop = 0;
                
                // Inject style directly into the sp-menu's shadowRoot
                if (menu.shadowRoot && !menu.shadowRoot.querySelector('#injected-scroll-style-menu')) {
                    const style = document.createElement('style');
                    style.id = 'injected-scroll-style-menu';
                    style.textContent = `
                        :host { scrollbar-width: thin !important; }
                        ::-webkit-scrollbar { width: 2px !important; height: 3px !important; }
                        ::-webkit-scrollbar-button { display: none !important; width: 0 !important; height: 0 !important; min-width: 0 !important; min-height: 0 !important; }
                        ::-webkit-scrollbar-track { background: transparent !important; }
                        ::-webkit-scrollbar-thumb { border-radius: 8px !important; background: rgba(128,128,128,0.35) !important; border: 0 !important; background-clip: padding-box !important; }
                        ::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.6) !important; }
                        * { scrollbar-width: thin !important; }
                        *::-webkit-scrollbar { width: 2px !important; height: 3px !important; }
                        *::-webkit-scrollbar-button { display: none !important; width: 0 !important; height: 0 !important; }
                    `;
                    menu.shadowRoot.appendChild(style);
                }
            }
            
            // Try to find the popover in the host's shadow root
            const popover = dropdown.shadowRoot ? dropdown.shadowRoot.querySelector("sp-popover") : null;
            if (popover && popover.shadowRoot && !popover.shadowRoot.querySelector('#injected-scroll-style-popover')) {
                const style = document.createElement('style');
                style.id = 'injected-scroll-style-popover';
                style.textContent = `
                    :host { scrollbar-width: thin !important; }
                    ::-webkit-scrollbar { width: 2px !important; height: 3px !important; }
                    ::-webkit-scrollbar-button { display: none !important; width: 0 !important; height: 0 !important; min-width: 0 !important; min-height: 0 !important; }
                    ::-webkit-scrollbar-track { background: transparent !important; }
                    ::-webkit-scrollbar-thumb { border-radius: 8px !important; background: rgba(128,128,128,0.35) !important; border: 0 !important; background-clip: padding-box !important; }
                    * { scrollbar-width: thin !important; }
                    *::-webkit-scrollbar { width: 2px !important; height: 3px !important; }
                    *::-webkit-scrollbar-button { display: none !important; width: 0 !important; height: 0 !important; }
                `;
                popover.shadowRoot.appendChild(style);
            }
        };

        // Run multiple times to ensure we catch the UI after UXP internal processing
        applySleekStyles();
        setTimeout(applySleekStyles, 10);
        setTimeout(applySleekStyles, 50);
        setTimeout(applySleekStyles, 150);
    }
});
