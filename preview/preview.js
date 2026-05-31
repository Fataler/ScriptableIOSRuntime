import { installMocks } from "../runtime/browser-mocks.js";
import { runScriptableWidget } from "../runtime/loader.js";
import {
  PREVIEW_LOGICAL_SIZES,
  widgetFamilyForSize,
  widgetSizeForFamily
} from "../runtime/preview-config.js";

const widgetImg = document.getElementById("widget-preview");
const statusEl = document.getElementById("status");
const linkEl = document.getElementById("open-link");
const titleEl = document.getElementById("title");
const subtitleEl = document.getElementById("subtitle");
const widgetSelect = document.getElementById("widget");
const sizeSelect = document.getElementById("size");
const familySelect = document.getElementById("family");
const refreshBtn = document.getElementById("refresh");
const clearStorageBtn = document.getElementById("clear-storage");

const PREVIEW_QUERY_KEYS = new Set(["widget", "size", "family"]);

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

widgetSelect.addEventListener("change", () => {
  syncSizeOptions();
  syncFamilyFromSize(sizeSelect.value, { updateSelect: true });
  updateUrl();
  runPreview();
});

sizeSelect.addEventListener("change", () => {
  syncFamilyFromSize(sizeSelect.value, { updateSelect: true });
  updateUrl();
  runPreview();
});

familySelect.addEventListener("change", () => {
  syncSizeFromFamily(familySelect.value, { updateSelect: true });
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
    syncFamilyFromSize(sizeSelect.value, { updateSelect: true });
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

function syncFamilyFromSize(size, { updateSelect = false } = {}) {
  const family = widgetFamilyForSize(size);
  if (updateSelect && familySelect.value !== family) {
    familySelect.value = family;
  }
  return family;
}

function syncSizeFromFamily(family, { updateSelect = false } = {}) {
  const size = widgetSizeForFamily(family, getAllowedSizes());
  if (updateSelect && sizeSelect.value !== size) {
    sizeSelect.value = size;
  }
  return size;
}

function applyUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const widgetId = params.get("widget");
  const size = params.get("size");
  const family = params.get("family");

  if (widgetId && widgetsCatalog.some(w => w.id === widgetId)) {
    widgetSelect.value = widgetId;
  }

  syncSizeOptions();

  if (family && [...familySelect.options].some(o => o.value === family)) {
    familySelect.value = family;
    syncSizeFromFamily(family, { updateSelect: true });
  } else if (size && [...sizeSelect.options].some(o => o.value === size)) {
    sizeSelect.value = size;
    syncFamilyFromSize(size, { updateSelect: true });
  }
}

function updateUrl() {
  const w = getSelectedWidget();
  const params = new URLSearchParams(window.location.search);

  if (w?.id) params.set("widget", w.id);
  else params.delete("widget");

  if (sizeSelect.value) params.set("size", sizeSelect.value);
  else params.delete("size");

  if (familySelect.value) params.set("family", familySelect.value);
  else params.delete("family");

  const next = `${window.location.pathname}?${params}`;
  window.history.replaceState(null, "", next);
}

function queryParametersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const queryParameters = {};

  for (const [key, value] of params.entries()) {
    if (PREVIEW_QUERY_KEYS.has(key)) continue;
    if (value !== "") queryParameters[key] = value;
  }

  return queryParameters;
}

async function runPreview() {
  const w = getSelectedWidget();
  if (!w) return;

  const size = sizeSelect.value;
  const family = syncFamilyFromSize(size, { updateSelect: true });

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
