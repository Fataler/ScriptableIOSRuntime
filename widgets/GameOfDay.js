const CONFIG = {
  widgetSize: "auto",
  previewSize: "normal",

  dataFolder: "GameOfDay",
  dataFile: "game-day-calendar.json",
  cacheFolder: "cache",
  previewCalendarUrl: "/data/game-of-day/game-day-calendar.json",

  openUrlFallback: "https://www.backloggd.com/",

  debug: {
    enabled: false,
    scenario: "",
    showLabel: true
  }
};

const CANVAS = {
  mini: {
    w: 320,
    h: 320,
    text: {
      label: 10,
      title: 28,
      meta: 17,
      body: 17,
      debug: 10,
      display: 22,
      error: {
        title: 18,
        body: 11
      }
    }
  },
  normal: {
    w: 680,
    h: 320,
    text: {
      label: 12,
      title: 36,
      meta: 22,
      body: 24,
      debug: 10,
      display: 24,
      error: {
        title: 18,
        body: 12
      }
    }
  }
};

const DEMO_CALENDAR = {
  meta: { generatedAt: "preview", previewFallback: true },
  days: {
    "06-01": {
      key: "06-01",
      title: "Deus Ex",
      year: 2000,
      displayDate: "1 июня",
      releaseDateHuman: "1 июня 2000",
      platforms: ["PC"],
      genres: ["Immersive sim"],
      summary: "Культовый иммерсив-сим с нелинейными миссиями, заговорами и свободой подхода.",
      reason: "Классика системного дизайна, где почти любую задачу можно решить по-своему.",
      coverUrl: null,
      backgroundUrl: null,
      igdbUrl: null,
      rating: null,
      ratingCount: null,
      quality: "preview"
    }
  }
};

let RUNTIME = {
  debugScenario: "",
  debugBounds: false
};

await main();

async function main() {
  const sizeName = resolveWidgetSize();
  const runtime = resolveRuntimeOptions();
  RUNTIME = runtime;

  try {
    const calendar = applyDebugScenario(await loadCalendar(), runtime.debugScenario);
    const entry = getEntryForToday(calendar);
    const widget = await createWidget(entry, sizeName);

    if (config.runsInWidget) Script.setWidget(widget);
    else await presentWidget(widget, sizeName);
  } catch (error) {
    const widget = createErrorWidget(error, sizeName);
    if (config.runsInWidget) Script.setWidget(widget);
    else await presentWidget(widget, sizeName);
  }

  Script.complete();
}

async function createWidget(entry, sizeName) {
  const widget = new ListWidget();
  widget.setPadding(0, 0, 0, 0);
  widget.backgroundImage = await drawWidgetImage(entry, sizeName);
  widget.refreshAfterDate = getNextMorningDate();
  widget.url = entry.igdbUrl || CONFIG.openUrlFallback;
  return widget;
}

function createErrorWidget(error, sizeName) {
  const widget = new ListWidget();
  widget.setPadding(0, 0, 0, 0);
  widget.backgroundImage = drawErrorImage(error, sizeName);
  widget.refreshAfterDate = getNextMorningDate();
  return widget;
}

async function presentWidget(widget, sizeName) {
  if (sizeName === "mini") await widget.presentSmall();
  else await widget.presentMedium();
}

async function loadCalendar() {
  const storage = getStorage();
  const fm = storage.fm;

  if (!fm.fileExists(storage.dataPath)) {
    if (isPreviewMode()) {
      const previewCalendar = await loadPreviewCalendar();
      if (previewCalendar) return previewCalendar;
      return DEMO_CALENDAR;
    }
    throw new Error("Нет базы game-day-calendar.json\nСкопируй файл в Scriptable/GameOfDay");
  }

  await ensureFileDownloaded(fm, storage.dataPath);

  try {
    return normalizeCalendar(JSON.parse(fm.readString(storage.dataPath)));
  } catch (error) {
    throw new Error(`Не читается JSON: ${error.message}`);
  }
}

async function loadPreviewCalendar() {
  try {
    const req = new Request(CONFIG.previewCalendarUrl);
    req.timeoutInterval = 10;
    return normalizeCalendar(await req.loadJSON());
  } catch (error) {
    return null;
  }
}

function normalizeCalendar(raw) {
  const days = raw && raw.days && typeof raw.days === "object" ? raw.days : raw;
  if (!days || typeof days !== "object") throw new Error("В JSON нет days");

  return {
    meta: raw && raw.meta ? raw.meta : {},
    days
  };
}

function getEntryForToday(calendar) {
  const forcedKey = getForcedDayKey() || clean(calendar && calendar.meta && calendar.meta.debugForcedDay);
  const now = getNow();
  const key = forcedKey || formatKey(now);
  let entry = calendar.days[key] || null;

  if (!entry && key === "02-29" && calendar.days["02-28"]) {
    entry = {
      ...calendar.days["02-28"],
      key: "02-29",
      displayDate: "29 февраля",
      fallbackFrom: "02-28"
    };
  }

  if (!entry) throw new Error(`Нет записи на ${key}`);
  return normalizeEntry(entry, key, calendar.meta);
}

function normalizeEntry(entry, key, meta = {}) {
  const previewMode = isPreviewMode();
  return {
    key: clean(entry.key) || key,
    title: clean(entry.title) || "Неизвестная игра",
    year: Number.isFinite(Number(entry.year)) ? Number(entry.year) : null,
    displayDate: clean(entry.displayDate) || clean(entry.releaseDateHuman) || formatDateKey(key),
    releaseDateHuman: clean(entry.releaseDateHuman),
    platforms: Array.isArray(entry.platforms) ? entry.platforms.filter(Boolean) : [],
    genres: Array.isArray(entry.genres) ? entry.genres.filter(Boolean) : [],
    summary: clean(entry.summary),
    reason: clean(entry.reason),
    coverUrl: rewritePreviewAssetUrl(clean(entry.coverUrl) || null, previewMode),
    backgroundUrl: rewritePreviewAssetUrl(clean(entry.backgroundUrl) || null, previewMode),
    igdbUrl: clean(entry.igdbUrl) || null,
    rating: Number.isFinite(Number(entry.rating)) ? Number(entry.rating) : null,
    ratingCount: Number.isFinite(Number(entry.ratingCount)) ? Number(entry.ratingCount) : null,
    quality: clean(entry.quality) || "curated",
    fallbackFrom: clean(entry.fallbackFrom) || null,
    isDemo: meta && meta.previewFallback === true
  };
}

async function drawWidgetImage(entry, sizeName) {
  const size = CANVAS[sizeName] || CANVAS.normal;
  const ctx = new DrawContext();
  ctx.size = new Size(size.w, size.h);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  drawBackground(ctx, size, entry);

  if (sizeName === "mini") await drawMiniWidget(ctx, size, entry);
  else await drawNormalWidget(ctx, size, entry);

  drawDebugLabel(ctx, size, entry);
  drawDebugBounds(ctx, sizeName);

  return ctx.getImage();
}

async function drawMiniWidget(ctx, size, entry) {
  const text = size.text;
  const pad = 18;
  const coverX = 18;
  const coverY = 44;
  const coverW = 150;
  const coverH = 184;
  const textY = 232;

  drawChip(ctx, "ИГРА ДНЯ", pad, 16, 94, 24, text.label);
  if (entry.fallbackFrom) drawChip(ctx, "29/02", size.w - 72, 16, 54, 24, text.label);
  if (entry.isDemo) drawChip(ctx, "DEMO", size.w - 136, 16, 58, 24, text.label);

  const cover = await getCoverImage(entry, "mini");
  drawImageCard(ctx, cover, coverX, coverY, coverW, coverH, 16);

  drawGlassCard(ctx, 12, textY - 10, size.w - 24, 80, 20, 0.3);
  drawTextBlock(ctx, shorten(entry.title, 16), pad, textY - 2, size.w - pad * 2, 36, text.title, "#FFF9F2", "bold");
  drawTextBlock(ctx, buildMiniMeta(entry), pad, textY + 34, size.w - pad * 2, 20, text.meta, "#E7D9C9", "medium");
}

async function drawNormalWidget(ctx, size, entry) {
  const text = size.text;
  const pad = 24;
  const coverX = 24;
  const coverY = 36;
  const coverW = 190;
  const coverH = 250;
  const textX = 238;
  const textW = size.w - textX - pad;

  drawChip(ctx, "ИГРА ДНЯ", pad, 18, 98, 24, text.label);
  if (entry.fallbackFrom) drawChip(ctx, "29/02", 132, 18, 54, 24, text.label);
  if (entry.isDemo) drawChip(ctx, entry.fallbackFrom ? "DEMO" : "DEMO", entry.fallbackFrom ? 192 : 132, 18, 58, 24, text.label);

  const cover = await getCoverImage(entry, "normal");
  drawImageCard(ctx, cover, coverX, coverY, coverW, coverH, 18);

  drawGlassCard(ctx, textX - 14, 36, textW + 18, 250, 24, 0.26);
  drawTextBlock(ctx, shorten(entry.title, 24), textX, 52, textW, 62, text.title, "#FFF9F2", "bold");
  drawTextBlock(ctx, buildSubtitle(entry), textX, 118, textW, 32, text.meta, "#EBDCCB", "medium");
  drawTextBlock(ctx, buildDescription(entry), textX, 164, textW, 96, text.body, "#FFF7EF", "regular");
}

function drawErrorImage(error, sizeName) {
  const size = CANVAS[sizeName] || CANVAS.normal;
  const text = size.text;
  const ctx = new DrawContext();
  ctx.size = new Size(size.w, size.h);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  ctx.setFillColor(new Color("#1B1012"));
  ctx.fillRect(new Rect(0, 0, size.w, size.h));

  drawTextBlock(ctx, "Игра дня", 18, 18, size.w - 36, 24, text.error.title, "#FFFFFF", "bold");
  drawTextBlock(
    ctx,
    String(error && error.message ? error.message : error),
    18,
    54,
    size.w - 36,
    size.h - 72,
    text.error.body,
    "#F1C4C4",
    "medium"
  );

  drawDebugBounds(ctx, sizeName);

  return ctx.getImage();
}

async function getCoverImage(entry, sizeName) {
  const cached = await readCachedImage(entry.key);
  if (cached) return cached;

  if (entry.coverUrl) {
    const downloaded = await downloadAndCacheImage(entry.coverUrl, `${entry.key}.jpg`);
    if (downloaded) return downloaded;
  }

  return drawPlaceholderCover(entry, sizeName);
}

async function readCachedImage(key) {
  const storage = getStorage();
  const fm = storage.fm;
  const path = fm.joinPath(storage.cacheDir, `${key}.jpg`);

  if (!fm.fileExists(path)) return null;
  if (typeof fm.readImage !== "function") return null;

  try {
    await ensureFileDownloaded(fm, path);
    return fm.readImage(path);
  } catch (error) {
    return null;
  }
}

async function downloadAndCacheImage(url, fileName) {
  if (typeof Request === "undefined") return null;

  try {
    const req = new Request(url);
    req.timeoutInterval = 20;
    if (typeof req.loadImage !== "function") return null;

    const image = await req.loadImage();
    const storage = getStorage();

    if (typeof storage.fm.writeImage === "function") {
      storage.fm.writeImage(storage.fm.joinPath(storage.cacheDir, fileName), image);
    }

    return image;
  } catch (error) {
    return null;
  }
}

function drawPlaceholderCover(entry, sizeName) {
  const w = sizeName === "mini" ? 240 : 232;
  const h = sizeName === "mini" ? 288 : 312;
  const text = (CANVAS[sizeName] || CANVAS.normal).text;
  const ctx = new DrawContext();
  ctx.size = new Size(w, h);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  const palette = paletteFromString(entry.title);
  ctx.setFillColor(new Color(palette.bg));
  ctx.fillRect(new Rect(0, 0, w, h));

  ctx.setFillColor(new Color(palette.accent, 0.18));
  ctx.fillEllipse(new Rect(w * 0.48, -16, w * 0.7, w * 0.7));
  ctx.fillEllipse(new Rect(-w * 0.16, h * 0.62, w * 0.82, w * 0.82));

  drawTextBlock(ctx, "GAME OF DAY", 18, 16, w - 36, 18, text.label + 6, "#FFF8ED", "medium");
  drawTextBlock(ctx, shorten(entry.title, sizeName === "mini" ? 36 : 42), 18, 52, w - 36, h - 120, text.display, "#FFF8ED", "bold");
  drawTextBlock(ctx, buildMiniMeta(entry), 18, h - 54, w - 36, 36, text.meta - 2, "#FFF8ED", "medium");

  return ctx.getImage();
}

function drawBackground(ctx, size, entry) {
  const palette = paletteFromString(entry.title + (entry.platforms[0] || ""));

  ctx.setFillColor(new Color(palette.deep));
  ctx.fillRect(new Rect(0, 0, size.w, size.h));

  ctx.setFillColor(new Color(palette.bg, 0.82));
  ctx.fillEllipse(new Rect(size.w * 0.42, -size.h * 0.1, size.w * 0.76, size.h * 0.84));

  ctx.setFillColor(new Color(palette.accent, 0.1));
  ctx.fillEllipse(new Rect(-size.w * 0.08, size.h * 0.62, size.w * 0.42, size.w * 0.42));
  ctx.fillEllipse(new Rect(size.w * 0.72, size.h * 0.64, size.w * 0.22, size.w * 0.22));

  const shell = new Path();
  shell.addRoundedRect(new Rect(12, 12, size.w - 24, size.h - 24), 24, 24);
  ctx.addPath(shell);
  ctx.setFillColor(new Color("#FFFFFF", 0.05));
  ctx.fillPath();

  const bottomShade = new Path();
  bottomShade.addRoundedRect(new Rect(12, size.h - 86, size.w - 24, 74), 24, 24);
  ctx.addPath(bottomShade);
  ctx.setFillColor(new Color("#050608", 0.24));
  ctx.fillPath();

  const topShade = new Path();
  topShade.addRoundedRect(new Rect(18, 18, size.w - 36, 30), 16, 16);
  ctx.addPath(topShade);
  ctx.setFillColor(new Color("#0A0B0F", 0.16));
  ctx.fillPath();
}

function drawChip(ctx, label, x, y, w, h, fontSize) {
  const path = new Path();
  path.addRoundedRect(new Rect(x, y, w, h), 10, 10);
  ctx.addPath(path);
  ctx.setFillColor(new Color("#E9C07A"));
  ctx.fillPath();
  drawTextBlock(ctx, label, x + 8, y + 5, w - 16, h - 10, fontSize, "#1A130C", "bold");
}

function drawImageCard(ctx, image, x, y, w, h, radius) {
  const path = new Path();
  path.addRoundedRect(new Rect(x, y, w, h), radius, radius);
  ctx.addPath(path);
  ctx.setFillColor(new Color("#FFFFFF", 0.08));
  ctx.fillPath();

  const border = new Path();
  border.addRoundedRect(new Rect(x, y, w, h), radius, radius);
  ctx.addPath(border);
  ctx.setStrokeColor(new Color("#FFFFFF", 0.12));
  ctx.setLineWidth(1);
  ctx.strokePath();

  if (image && typeof ctx.drawImageInRect === "function" && typeof image !== "string") {
    try {
      ctx.drawImageInRect(image, new Rect(x, y, w, h));
      return;
    } catch (error) {}
  }

  drawTextBlock(ctx, "NO COVER", x + 14, y + h - 34, w - 28, 16, 13, "#FFF8ED", "bold");
}

function drawTextBlock(ctx, text, x, y, w, h, size, colorHex, weight = "regular") {
  ctx.setFont(getFont(size, weight));
  ctx.setTextColor(new Color(colorHex));
  ctx.setTextAlignedLeft();
  ctx.drawTextInRect(String(text || ""), new Rect(x, y, w, h));
}

function drawGlassCard(ctx, x, y, w, h, radius, alpha = 0.2) {
  const fill = new Path();
  fill.addRoundedRect(new Rect(x, y, w, h), radius, radius);
  ctx.addPath(fill);
  ctx.setFillColor(new Color("#090A0D", alpha));
  ctx.fillPath();

  const top = new Path();
  top.addRoundedRect(new Rect(x + 1, y + 1, w - 2, 1), radius, radius);
  ctx.addPath(top);
  ctx.setFillColor(new Color("#FFFFFF", 0.08));
  ctx.fillPath();
}

function getFont(size, weight) {
  if (weight === "bold") return Font.boldSystemFont(size);
  if (weight === "medium") return Font.mediumSystemFont(size);
  if (weight === "heavy" && typeof Font.heavySystemFont === "function") return Font.heavySystemFont(size);
  return typeof Font.systemFont === "function" ? Font.systemFont(size) : Font.mediumSystemFont(size);
}

function paletteFromString(value) {
  const hash = hashString(value || "game");
  const palettes = [
    { bg: "#30263A", deep: "#111319", accent: "#F0BF72" },
    { bg: "#27384A", deep: "#10151C", accent: "#E6B66C" },
    { bg: "#26332C", deep: "#0F1311", accent: "#DDBA73" },
    { bg: "#3A2825", deep: "#121111", accent: "#EA9D69" },
    { bg: "#23323D", deep: "#0D1217", accent: "#D9B276" }
  ];
  return palettes[Math.abs(hash) % palettes.length];
}

function buildMiniMeta(entry) {
  const bits = [];
  if (entry.year) bits.push(String(entry.year));
  if (entry.platforms.length) bits.push(shorten(entry.platforms[0], 16));
  if (!bits.length && entry.genres.length) bits.push(shorten(entry.genres[0], 18));
  return bits.join(" · ") || "Календарь великих игр";
}

function buildSubtitle(entry) {
  const parts = [];
  if (entry.releaseDateHuman) parts.push(entry.releaseDateHuman);
  else if (entry.year) parts.push(String(entry.year));
  else parts.push("Дата не указана");

  if (entry.platforms.length) {
    parts.push(shorten(entry.platforms.slice(0, 2).join(", "), 22));
  }

  return parts.join(" · ");
}

function buildDescription(entry) {
  const text = joinDescriptionParts(entry.summary, entry.reason) || buildReleaseLine(entry.title, entry.year);
  if (text) return text;
  if (entry.genres.length) return `Игра дня в жанре ${entry.genres[0]}.`;
  return "Запись без описания. Можно дописать текст в CSV и пересобрать JSON.";
}

function joinDescriptionParts(summary, reason) {
  const left = clean(summary);
  const right = clean(reason);
  if (!left) return right;
  if (!right || left === right) return left;
  if (/[.!?…:]$/.test(left)) return `${left} ${right}`;
  return `${left}. ${right}`;
}

function buildReleaseLine(title, year) {
  const cleanTitle = clean(title) || "Неизвестная игра";
  if (year) return `В этот день в ${year} вышла ${cleanTitle}.`;
  return `${cleanTitle} вышла в этот день.`;
}


function resolveRuntimeOptions() {
  const params = args && args.queryParameters ? args.queryParameters : {};
  const cfg = CONFIG.debug || {};
  const raw = clean(params.debug) || (cfg.enabled ? clean(cfg.scenario) : "");
  const debugScenario = raw && raw !== "real" ? raw : "";
  const debugBounds = clean(params.debug_bounds) === "1" || clean(params.debug_bounds).toLowerCase() === "true";

  return {
    debugScenario,
    debugBounds
  };
}

function applyDebugScenario(calendar, scenario) {
  if (!scenario) return calendar;

  const clone = {
    meta: { ...(calendar.meta || {}) },
    days: { ...(calendar.days || {}) }
  };

  if (scenario === "demo") {
    return DEMO_CALENDAR;
  }

  if (scenario === "leap") {
    clone.meta.debugForcedDay = "02-29";
    return clone;
  }

  if (scenario === "coverless") {
    const key = getForcedDayKey() || formatKey(getNow());
    const base = clone.days[key] || clone.days["02-28"] || Object.values(clone.days)[0];
    if (base) {
      clone.days[key] = {
        ...base,
        key,
        coverUrl: null,
        backgroundUrl: null,
        reason: base.reason || base.summary || "Проверка без обложки."
      };
    }
    clone.meta.debugForcedDay = key;
    return clone;
  }

  if (scenario === "fallback") {
    const ref = clone.days["02-28"] || Object.values(clone.days)[0];
    if (ref) {
      clone.days["02-29"] = {
        ...ref,
        key: "02-29",
        displayDate: "29 февраля",
        fallbackFrom: "02-28"
      };
      clone.meta.debugForcedDay = "02-29";
    }
    return clone;
  }

  return clone;
}

function resolveWidgetSize() {
  const forced = globalThis.__previewForceWidgetSize;
  if (forced === "mini" || forced === "normal") return forced;

  const q = args && args.queryParameters ? clean(args.queryParameters.size) : "";
  if (q === "mini" || q === "normal") return q;

  if (CONFIG.widgetSize === "mini" || CONFIG.widgetSize === "normal") return CONFIG.widgetSize;
  if (config.widgetFamily === "small") return "mini";
  return "normal";
}

function getStorage() {
  const fm = FileManager.iCloud();
  const baseDir = fm.joinPath(fm.documentsDirectory(), CONFIG.dataFolder);
  const cacheDir = fm.joinPath(baseDir, CONFIG.cacheFolder);

  if (!fm.fileExists(baseDir)) fm.createDirectory(baseDir, true);
  if (!fm.fileExists(cacheDir)) fm.createDirectory(cacheDir, true);

  return {
    fm,
    baseDir,
    cacheDir,
    dataPath: fm.joinPath(baseDir, CONFIG.dataFile)
  };
}

async function ensureFileDownloaded(fm, path) {
  if (typeof fm.isFileDownloaded === "function" && !fm.isFileDownloaded(path)) {
    await fm.downloadFileFromiCloud(path);
  }
}

function getNow() {
  const nowRaw = args && args.queryParameters ? clean(args.queryParameters.now) : "";
  if (nowRaw) {
    const date = new Date(nowRaw);
    if (!Number.isNaN(date.getTime())) return date;
  }

  return new Date();
}

function getForcedDayKey() {
  const raw = args && args.queryParameters ? clean(args.queryParameters.day) : "";
  if (!raw) return "";

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return `${iso[2]}-${iso[3]}`;

  const md = /^(\d{2})-(\d{2})$/.exec(raw);
  if (md) return `${md[1]}-${md[2]}`;

  return "";
}

function rewritePreviewAssetUrl(url, previewMode) {
  if (!url) return null;
  if (!previewMode) return url;
  if (String(url).startsWith("/api/proxy-image?url=")) return url;
  return `/api/proxy-image?url=${encodeURIComponent(url)}`;
}

function drawDebugLabel(ctx, size, entry) {
  const cfg = CONFIG.debug || {};
  const bits = [];
  if (RUNTIME.debugScenario) bits.push(`DEBUG ${RUNTIME.debugScenario}`);
  if (entry && entry.isDemo) bits.push("DEMO");
  if (!bits.length || cfg.showLabel === false) return;

  drawTextBlock(ctx, bits.join(" · "), 18, size.h - 18, size.w - 36, 12, size.text.debug, "#8E97AA", "medium");
}

function drawDebugBounds(ctx, sizeName) {
  if (!RUNTIME.debugBounds) return;

  ctx.setStrokeColor(new Color("#FF6B7A", 0.45));
  ctx.setLineWidth(2);

  if (sizeName === "mini") {
    strokeRect(ctx, 18, 16, 90, 22);
    strokeRect(ctx, 18, 46, 120, 144);
    strokeRect(ctx, 18, 203, 284, 52);
    strokeRect(ctx, 18, 260, 284, 28);
    return;
  }

  strokeRect(ctx, 24, 18, 94, 22);
  strokeRect(ctx, 24, 52, 126, 170);
  strokeRect(ctx, 176, 52, 480, 60);
  strokeRect(ctx, 176, 118, 480, 34);
  strokeRect(ctx, 176, 160, 480, 86);
}

function strokeRect(ctx, x, y, w, h) {
  if (typeof ctx.strokeRect === "function") {
    ctx.strokeRect(new Rect(x, y, w, h));
    return;
  }

  const path = new Path();
  path.addRoundedRect(new Rect(x, y, w, h), 0, 0);
  ctx.addPath(path);
  ctx.strokePath();
}

function getNextMorningDate() {
  const now = getNow();
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(5, 5, 0, 0);
  return next;
}

function formatKey(date) {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}

function formatDateKey(key) {
  const parts = String(key || "").split("-");
  if (parts.length !== 2) return key;

  const monthNames = {
    "01": "января",
    "02": "февраля",
    "03": "марта",
    "04": "апреля",
    "05": "мая",
    "06": "июня",
    "07": "июля",
    "08": "августа",
    "09": "сентября",
    "10": "октября",
    "11": "ноября",
    "12": "декабря"
  };

  return `${Number(parts[1])} ${monthNames[parts[0]] || ""}`.trim();
}

function shorten(value, max) {
  const text = clean(value);
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

function clean(value) {
  return String(value ?? "").trim();
}

function hashString(value) {
  let hash = 0;
  const text = String(value || "");

  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }

  return hash;
}

function isPreviewMode() {
  return typeof globalThis.__previewDevicePixelRatio !== "undefined";
}
