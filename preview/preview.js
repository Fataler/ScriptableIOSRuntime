import { installMocks } from "../runtime/browser-mocks.js";
import { runScriptableWidget } from "../runtime/loader.js";
import {
  PREVIEW_LOGICAL_SIZES,
  widgetFamilyForSize
} from "../runtime/preview-config.js";

const widgetImg = document.getElementById("widget-preview");
const statusEl = document.getElementById("status");
const linkEl = document.getElementById("open-link");
const titleEl = document.getElementById("title");
const subtitleEl = document.getElementById("subtitle");
const widgetSelect = document.getElementById("widget");
const sizeSelect = document.getElementById("size");
const debugSelect = document.getElementById("debug");
const nowInput = document.getElementById("now");
const boundsInput = document.getElementById("bounds");
const queryInput = document.getElementById("query");
const controlDebugWrap = document.getElementById("control-debug-wrap");
const controlNowWrap = document.getElementById("control-now-wrap");
const controlBoundsWrap = document.getElementById("control-bounds-wrap");
const controlQueryWrap = document.getElementById("control-query-wrap");
const familyBadgeEl = document.getElementById("family-badge");
const debugCardEl = document.getElementById("debug-card");
const presetChipsEl = document.getElementById("preset-chips");
const copyUrlBtn = document.getElementById("copy-url");
const resetControlsBtn = document.getElementById("reset-controls");
const metaWidgetEl = document.getElementById("meta-widget");
const metaSizeEl = document.getElementById("meta-size");
const metaFamilyEl = document.getElementById("meta-family");
const metaDebugRowEl = document.getElementById("meta-debug-row");
const metaDebugEl = document.getElementById("meta-debug");
const metaNowRowEl = document.getElementById("meta-now-row");
const metaNowEl = document.getElementById("meta-now");
const metaQueryEl = document.getElementById("meta-query");
const refreshBtn = document.getElementById("refresh");
const clearStorageBtn = document.getElementById("clear-storage");

const PREVIEW_QUERY_KEYS = new Set(["widget", "size", "debug", "query", "now", "bounds"]);

let widgetsCatalog = [];

refreshBtn.addEventListener("click", () => runPreview());

clearStorageBtn.addEventListener("click", () => {
  const widgetId = getSelectedWidget()?.id ?? "";
  const prefix = `scriptable-preview:${widgetId}:`;
  const keys = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) keys.push(key);
  }

  keys.forEach(k => localStorage.removeItem(k));
  runPreview();
});

copyUrlBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    setStatus("URL скопирован", "ok");
  } catch (error) {
    setStatus("Не удалось скопировать URL", "error");
  }
});

resetControlsBtn.addEventListener("click", () => {
  debugSelect.value = "";
  nowInput.value = "";
  boundsInput.checked = false;
  queryInput.value = "";
  syncPresetChips();
  updateUrl();
  runPreview();
});

widgetSelect.addEventListener("change", () => {
  syncSizeOptions();
  syncDebugOptions();
  syncWidgetSpecificControls();
  syncFamilyBadge(sizeSelect.value);
  updateUrl();
  runPreview();
});

sizeSelect.addEventListener("change", () => {
  syncFamilyBadge(sizeSelect.value);
  updateUrl();
  runPreview();
});

debugSelect.addEventListener("change", () => {
  syncPresetChips();
  updateUrl();
  runPreview();
});

nowInput.addEventListener("change", () => {
  updateUrl();
  runPreview();
});

boundsInput.addEventListener("change", () => {
  updateUrl();
  runPreview();
});

queryInput.addEventListener("change", () => {
  updateUrl();
  runPreview();
});

window.addEventListener("scriptable-preview-ready", e => {
  const { dataUrl, url, size } = e.detail;
  const dims = PREVIEW_LOGICAL_SIZES[size] || PREVIEW_LOGICAL_SIZES.medium;

  widgetImg.width = dims.w;
  widgetImg.height = dims.h;
  widgetImg.classList.toggle("is-micro", size === "micro");

  widgetImg.onerror = () => setStatus("Не удалось показать изображение виджета", "error");
  widgetImg.onload = () => setStatus("Готово", "ok");
  widgetImg.src = dataUrl;
  widgetImg.alt = "Widget preview";

  if (widgetImg.complete && widgetImg.naturalWidth > 0) setStatus("Готово", "ok");

  linkEl.href = url || "#";
  linkEl.textContent = url ? "Открыть URL виджета" : "URL не задан";
});

init();

async function init() {
  try {
    const data = await fetch("/api/widgets", { cache: "no-store" }).then(r => {
      if (!r.ok) throw new Error(`API: HTTP ${r.status}`);
      return r.json();
    });

    widgetsCatalog = data.widgets || [];
    if (widgetsCatalog.length === 0) {
      setStatus("Нет виджетов. Добавь .js в widgets/ или запись в widgets.json", "error");
      return;
    }

    fillWidgetSelect();
    applyUrlParams();
    syncSizeOptions();
    syncDebugOptions();
    syncWidgetSpecificControls();
    syncPresetChips();
    syncFamilyBadge(sizeSelect.value);
    await runPreview();
  } catch (error) {
    console.error(error);
    setStatus(errorMessage(error), "error");
  }
}

function fillWidgetSelect() {
  widgetSelect.innerHTML = "";

  for (const w of widgetsCatalog) {
    const opt = document.createElement("option");
    opt.value = w.id;
    opt.textContent = w.title || w.id;
    opt.title = w.description || "";
    widgetSelect.appendChild(opt);
  }
}

function getSelectedWidget() {
  const id = widgetSelect.value;
  return widgetsCatalog.find(w => w.id === id) ?? widgetsCatalog[0];
}

function getAllowedSizes() {
  const w = getSelectedWidget();
  return w?.sizes?.length ? w.sizes : ["mini", "normal"];
}

function syncSizeOptions() {
  const w = getSelectedWidget();
  const sizes = getAllowedSizes();
  const current = sizeSelect.value;
  const sizeLabels = {
    micro: "Micro lock (76×76)",
    mini: "Mini 1×1 (320×320)",
    medium: "Medium 2×1 (680×320)",
    large: "Large 2×2 (680×680)"
  };

  sizeSelect.innerHTML = "";
  for (const size of sizes) {
    const opt = document.createElement("option");
    opt.value = size;
    opt.textContent = sizeLabels[size] || size;
    sizeSelect.appendChild(opt);
  }

  if (sizes.includes(current)) sizeSelect.value = current;
  else sizeSelect.value = w?.defaultSize || sizes[0];
}

function syncFamilyFromSize(size) {
  const family = widgetFamilyForSize(size);
  return family;
}

function syncFamilyBadge(size) {
  const family = syncFamilyFromSize(size);
  familyBadgeEl.textContent = family;
  metaFamilyEl.textContent = family;
}

function syncDebugOptions() {
  const w = getSelectedWidget();
  const presets = Array.isArray(w?.debugPresets) && w.debugPresets.length
    ? w.debugPresets
    : [{ value: "", label: "Реальные данные" }];
  const current = debugSelect.value;

  debugSelect.innerHTML = "";
  for (const preset of presets) {
    const opt = document.createElement("option");
    opt.value = preset.value || "";
    opt.textContent = preset.label || preset.value || "preset";
    debugSelect.appendChild(opt);
  }

  if (presets.some(x => String(x.value || "") === current)) debugSelect.value = current;
  else debugSelect.value = "";
}

function getWidgetCapabilities() {
  const w = getSelectedWidget();
  const controls = w?.previewControls || {};

  return {
    debugPresets: controls.debugPresets === true && Array.isArray(w?.debugPresets) && w.debugPresets.some(x => x.value),
    now: controls.now === true,
    bounds: controls.bounds === true,
    query: controls.query !== false
  };
}

function syncWidgetSpecificControls() {
  const caps = getWidgetCapabilities();

  if (!caps.debugPresets) debugSelect.value = "";
  if (!caps.now) nowInput.value = "";
  if (!caps.bounds) boundsInput.checked = false;
  if (!caps.query) queryInput.value = "";

  controlDebugWrap.hidden = !caps.debugPresets;
  controlNowWrap.hidden = !caps.now;
  controlBoundsWrap.hidden = !caps.bounds;
  controlQueryWrap.hidden = !caps.query;
  debugCardEl.hidden = !caps.debugPresets;
  metaDebugRowEl.hidden = !caps.debugPresets;
  metaNowRowEl.hidden = !caps.now;
  resetControlsBtn.hidden = !(caps.debugPresets || caps.now || caps.bounds || caps.query);
}

function syncPresetChips() {
  const caps = getWidgetCapabilities();
  const w = getSelectedWidget();
  const presets = Array.isArray(w?.debugPresets) ? w.debugPresets : [];
  presetChipsEl.innerHTML = "";

  if (!caps.debugPresets) return;

  const realBtn = document.createElement("button");
  realBtn.type = "button";
  realBtn.className = `chip${debugSelect.value ? "" : " active"}`;
  realBtn.textContent = "Реальные данные";
  realBtn.addEventListener("click", () => {
    debugSelect.value = "";
    syncPresetChips();
    updateUrl();
    runPreview();
  });
  presetChipsEl.appendChild(realBtn);

  for (const preset of presets) {
    if (!preset.value) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `chip${debugSelect.value === preset.value ? " active" : ""}`;
    btn.textContent = preset.label || preset.value;
    btn.addEventListener("click", () => {
      debugSelect.value = preset.value;
      syncPresetChips();
      updateUrl();
      runPreview();
    });
    presetChipsEl.appendChild(btn);
  }
}

function applyUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const widgetId = params.get("widget");
  const size = params.get("size");
  const debug = params.get("debug");
  const query = params.get("query");
  const now = params.get("now");
  const bounds = params.get("bounds");

  if (widgetId && widgetsCatalog.some(w => w.id === widgetId)) {
    widgetSelect.value = widgetId;
  }

  syncSizeOptions();
  syncDebugOptions();
  syncWidgetSpecificControls();

  if (size && [...sizeSelect.options].some(o => o.value === size)) {
    sizeSelect.value = size;
  }

  if (debug && [...debugSelect.options].some(o => o.value === debug)) {
    debugSelect.value = debug;
  }

  nowInput.value = now || "";
  boundsInput.checked = bounds === "1";
  queryInput.value = query || "";
  syncWidgetSpecificControls();
  syncFamilyBadge(sizeSelect.value);
  syncPresetChips();
}

function updateUrl() {
  const w = getSelectedWidget();
  const caps = getWidgetCapabilities();
  const params = new URLSearchParams(window.location.search);

  if (w?.id) params.set("widget", w.id);
  else params.delete("widget");

  if (sizeSelect.value) params.set("size", sizeSelect.value);
  else params.delete("size");

  if (caps.debugPresets && debugSelect.value) params.set("debug", debugSelect.value);
  else params.delete("debug");

  if (caps.now && nowInput.value.trim()) params.set("now", nowInput.value.trim());
  else params.delete("now");

  if (caps.bounds && boundsInput.checked) params.set("bounds", "1");
  else params.delete("bounds");

  if (caps.query && queryInput.value.trim()) params.set("query", queryInput.value.trim());
  else params.delete("query");

  const nextQuery = params.toString();
  const next = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
  window.history.replaceState(null, "", next);
}

function queryParametersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const caps = getWidgetCapabilities();
  const queryParameters = {};

  for (const [key, value] of params.entries()) {
    if (PREVIEW_QUERY_KEYS.has(key)) continue;
    if (value !== "") queryParameters[key] = value;
  }

  const debug = caps.debugPresets ? params.get("debug") : "";
  if (debug) queryParameters.debug = debug;

  const now = caps.now ? params.get("now") : "";
  if (now) queryParameters.now = now;

  if (caps.bounds && params.get("bounds") === "1") queryParameters.debug_bounds = "1";

  const extra = caps.query ? params.get("query") : "";
  if (extra) {
    const extraParams = new URLSearchParams(extra);
    for (const [key, value] of extraParams.entries()) {
      if (value !== "") queryParameters[key] = value;
    }
  }

  return queryParameters;
}

async function runPreview() {
  const w = getSelectedWidget();
  if (!w) return;

  const size = sizeSelect.value;
  const family = syncFamilyFromSize(size);
  syncFamilyBadge(size);
  metaWidgetEl.textContent = w.title || w.id;
  metaSizeEl.textContent = size;
  metaDebugEl.textContent = debugSelect.value || "real";
  metaNowEl.textContent = nowInput.value || "device";
  metaQueryEl.textContent = buildMetaQuery();

  titleEl.textContent = w.title || w.id;
  subtitleEl.textContent = w.description || "Scriptable preview";
  setStatus("Загрузка…", "busy");

  try {
    installMocks({
      runsInWidget: true,
      widgetFamily: family,
      widgetId: w.id,
      queryParameters: queryParametersFromUrl()
    });

    const scriptUrl = `/${w.file.replace(/^\//, "")}`;
    const widget = await runScriptableWidget(scriptUrl, {
      forceWidgetSize: size
    });

    const dataUrl = widget?.getPreviewDataUrl?.();
    if (!dataUrl) throw new Error("Виджет не отрисовался (нет backgroundImage)");

    window.dispatchEvent(
      new CustomEvent("scriptable-preview-ready", {
        detail: {
          dataUrl,
          size,
          url: widget.url
        }
      })
    );
  } catch (error) {
    console.error(error);
    setStatus(errorMessage(error), "error");
  }
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind || "";
}

function errorMessage(error) {
  return String(error && error.message ? error.message : error);
}

function buildMetaQuery() {
  const params = queryParametersFromUrl();
  const entries = Object.entries(params);
  if (entries.length === 0) return "—";
  return entries.map(([key, value]) => `${key}=${value}`).join("&");
}
