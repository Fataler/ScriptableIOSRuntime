// ============================================================
// FTimeCounter — кольца прогресса дня / недели / месяца / года
// Стиль Apple Health Activity Rings (день — внешнее кольцо, год — внутреннее)
//
// Размеры:
// - micro  — блокировка (accessoryCircular)
// - mini   — домашний экран 1×1
// ============================================================

const CONFIG = {
  widgetSize: "auto",
  previewSize: "mini",

  // 0 = воскресенье, 1 = понедельник
  weekStartsOn: 1,

  ui: {
    bgTop: "#0D0F1A",
    bgBottom: "#05060D",

    text: "#FFFFFF",
    muted: "#9AA3BC",
    faint: "#5C6478",

    ringDay: "#FF375F",
    ringWeek: "#30D158",
    ringMonth: "#0A84FF",
    ringYear: "#BF5AF2",

    trackAlpha: 0.22,
    trackAlphaAccessory: 0.38,
    glowAlpha: 0.12,
    
    ringGapMicro: 3,

    ringGapMini: 9,
    miniY: 0.35,

    decorWhiteAlpha: 0.03,

    fontScale: 1.25,
    legendLabel: 16,
    legendPercent: 16,
  }
};

const CANVAS = {
  // accessoryCircular ~76pt; respectScreenScale даёт @2x/@3x
  micro: { w: 76, h: 76 },
  mini: { w: 320, h: 320 }
};

// 0° = 12 часов, далее по часовой (не 270° canvas = 3 часа)
const RING_START_DEG = 0;

// Отрисовка: изнутри наружу (год → день), день — внешнее кольцо
const RINGS_DRAW = [
  { key: "year", short: "Г", colorKey: "ringYear" },
  { key: "month", short: "М", colorKey: "ringMonth" },
  { key: "week", short: "Н", colorKey: "ringWeek" },
  { key: "day", short: "Д", colorKey: "ringDay" }
];

// Легенда: слева направо, сверху вниз — Д, Н, М, Г
const RINGS_LEGEND = [
  { key: "day", short: "Д", colorKey: "ringDay" },
  { key: "week", short: "Н", colorKey: "ringWeek" },
  { key: "month", short: "М", colorKey: "ringMonth" },
  { key: "year", short: "Г", colorKey: "ringYear" }
];

await main();

async function main() {
  if (!config.runsInWidget) {
    await showMenu();
    Script.complete();
    return;
  }

  const widget = await createWidget();
  Script.setWidget(widget);
  Script.complete();
}

async function showMenu() {
  const progress = getTimeProgress(new Date());
  const a = new Alert();

  a.title = "FTimeCounter";
  a.message =
    `Д ${formatPercent(progress.day)} · Н ${formatPercent(progress.week)}\n` +
    `М ${formatPercent(progress.month)} · Г ${formatPercent(progress.year)}`;

  a.addAction("👀 Предпросмотр micro");
  a.addAction("👀 Предпросмотр mini");
  a.addCancelAction("Закрыть");

  const choice = await a.presentSheet();

  if (choice === 0) await preview("micro");
  if (choice === 1) await preview("mini");
}

async function preview(sizeName) {
  const widget = await createWidget(sizeName);

  if (sizeName === "micro") await widget.presentAccessoryCircular();
  else await widget.presentSmall();
}

async function createWidget(forcedSize = null) {
  const sizeName = forcedSize || resolveWidgetSize();
  const widget = new ListWidget();
  const image = await getWidgetImage(sizeName);

  widget.setPadding(0, 0, 0, 0);
  widget.refreshAfterDate = getNextMinuteDate();

  if (isAccessoryWidget()) {
    widget.backgroundColor = new Color("#000000", 0);

    if (typeof widget.addStack === "function") {
      const stack = widget.addStack();
      stack.centerAlignContent();
      stack.layoutVertically();
      const img = stack.addImage(image);
      img.imageSize = new Size(CANVAS.micro.w, CANVAS.micro.h);
    } else {
      widget.backgroundImage = image;
    }
  } else {
    widget.backgroundImage = image;
  }

  return widget;
}

function isAccessoryWidget() {
  if (config.runsInAccessoryWidget) return true;

  const family = config.widgetFamily;

  return (
    family === "accessoryCircular" ||
    family === "accessoryInline" ||
    family === "accessoryRectangular"
  );
}

async function getWidgetImage(sizeName) {
  const resolved = sizeName || resolveWidgetSize();

  if (isAccessoryWidget() && typeof WebView !== "undefined") {
    try {
      return await drawAccessoryRingsWebView(getTimeProgress(new Date()));
    } catch (error) {
      console.log("WebView rings failed, fallback to DrawContext:", error);
    }
  }

  return drawWidgetImage(resolved);
}

async function drawAccessoryRingsWebView(progress) {
  const scale = 3;
  const layout = getRingLayout("micro");
  const size = CANVAS.micro.w * scale;
  const trackAlpha = CONFIG.ui.trackAlphaAccessory;
  const rings = [];

  for (let i = 0; i < RINGS_DRAW.length; i++) {
    const ring = RINGS_DRAW[i];
    const color = CONFIG.ui[ring.colorKey];
    const rgb = hexToRgb(color);

    rings.push({
      color: `rgb(${rgb.r},${rgb.g},${rgb.b})`,
      track: `rgba(${rgb.r},${rgb.g},${rgb.b},${trackAlpha})`,
      progress: clamp(progress[ring.key], 0, 1),
      radius: (layout.innerRadius + i * layout.step) * scale,
      lineWidth: layout.lineWidth * scale
    });
  }

  const w = new WebView();
  await w.loadHTML('<canvas id="c"></canvas>');

  const base64 = await w.evaluateJavaScript(
    `
    const rings = ${JSON.stringify(rings)};
    const size = ${size};
    const canvas = document.getElementById("c");
    const c = canvas.getContext("2d");
    canvas.width = size;
    canvas.height = size;
    const cx = size / 2;
    const cy = size / 2;

    function ringRad(clockDeg) {
      return ((clockDeg + ${RING_START_DEG}) - 90) * Math.PI / 180;
    }

    const start = ringRad(0);

    for (const ring of rings) {
      c.lineCap = "round";
      c.beginPath();
      c.arc(cx, cy, ring.radius, start, start + Math.PI * 2 * 0.998);
      c.strokeStyle = ring.track;
      c.lineWidth = ring.lineWidth;
      c.stroke();

      if (ring.progress > 0.001) {
        const cap = ring.lineWidth / ring.radius;
        const sweep = Math.max(0, Math.PI * 2 * ring.progress - cap);

        c.lineCap = "round";
        c.beginPath();
        c.arc(cx, cy, ring.radius, start, start + sweep);
        c.strokeStyle = ring.color;
        c.lineWidth = ring.lineWidth;
        c.stroke();
      }
    }

    completion(canvas.toDataURL().replace("data:image/png;base64,", ""));
    `,
    true
  );

  return Image.fromData(Data.fromBase64String(base64));
}

function resolveWidgetSize() {
  const preview = globalThis.__previewForceWidgetSize;
  if (preview === "micro" || preview === "mini") return preview;

  const q = args && args.queryParameters ? cleanText(args.queryParameters.size) : "";
  if (q === "micro" || q === "mini") return q;

  if (CONFIG.widgetSize === "micro") return "micro";
  if (CONFIG.widgetSize === "mini") return "mini";

  const family = config.widgetFamily;

  if (
    family === "accessoryCircular" ||
    family === "accessoryInline" ||
    family === "accessoryRectangular"
  ) {
    return "micro";
  }

  if (family === "small") return "mini";

  return "mini";
}

function drawWidgetImage(sizeName) {
  let resolved = sizeName || resolveWidgetSize();
  const size = CANVAS[resolved];

  if (!size) {
    resolved = "mini";
  }

  const canvas = CANVAS[resolved];
  const progress = getTimeProgress(new Date());

  const ctx = new DrawContext();
  ctx.size = new Size(canvas.w, canvas.h);
  ctx.opaque = resolved !== "micro";
  ctx.respectScreenScale = true;

  if (resolved !== "micro") {
    drawBackground(ctx, canvas.w, canvas.h, resolved);
    drawDecor(ctx, canvas.w, canvas.h, resolved);
  }

  if (resolved === "micro") drawMicro(ctx, progress, canvas.w, canvas.h);
  else drawMini(ctx, progress, canvas.w, canvas.h);

  return ctx.getImage();
}

function drawMicro(ctx, progress, w, h) {
  const cx = w / 2;
  const cy = h / 2;

  drawConcentricRings(ctx, cx, cy, progress, getRingLayout("micro"), CONFIG.ui.trackAlphaAccessory);
}

function drawMini(ctx, progress, w, h) {
  const cx = w / 2;
  const cy = h * CONFIG.ui.miniY;

  drawConcentricRings(ctx, cx, cy, progress, getRingLayout("mini"), CONFIG.ui.trackAlpha);
  drawRingLegendGrid(ctx, progress, w, h);
}

function drawConcentricRings(ctx, cx, cy, progress, layout, trackAlpha) {
  for (let i = 0; i < RINGS_DRAW.length; i++) {
    const ring = RINGS_DRAW[i];
    const radius = layout.innerRadius + i * layout.step;
    const color = CONFIG.ui[ring.colorKey];
    const value = progress[ring.key];

    drawRing(ctx, cx, cy, radius, layout.lineWidth, value, color, trackAlpha);
  }
}

function drawRing(ctx, cx, cy, radius, lineWidth, progress, colorHex, trackAlpha) {
  drawRingTrack(ctx, cx, cy, radius, lineWidth, colorHex, trackAlpha);
  drawRingProgress(ctx, cx, cy, radius, lineWidth, progress, colorHex);
}

function drawRingTrack(ctx, cx, cy, radius, lineWidth, colorHex, trackAlpha) {
  const d = radius * 2;
  const alpha = trackAlpha != null ? trackAlpha : CONFIG.ui.trackAlpha;

  ctx.setStrokeColor(colorWithAlpha(colorHex, alpha));
  ctx.setLineWidth(lineWidth);
  ctx.strokeEllipse(new Rect(cx - radius, cy - radius, d, d));
}

function drawRingProgress(ctx, cx, cy, radius, lineWidth, progress, colorHex) {
  const p = clamp(progress, 0, 1);
  if (p <= 0.001) return;

  const start = ringAngleRad(0);
  const sweep = progressSweepRad(p, lineWidth, radius);
  const end = start + sweep;
  const path = buildArcPath(cx, cy, radius, start, end);

  ctx.addPath(path);
  ctx.setStrokeColor(new Color(colorHex));
  ctx.setLineWidth(lineWidth);
  ctx.strokePath();
  drawRingRoundCaps(ctx, cx, cy, radius, lineWidth, start, end, colorHex);
}

function drawRingRoundCaps(ctx, cx, cy, radius, lineWidth, angleStart, angleEnd, colorHex) {
  const dot = lineWidth;
  const half = dot / 2;

  ctx.setFillColor(new Color(colorHex));

  for (const angle of [angleStart, angleEnd]) {
    const x = cx + radius * Math.cos(angle) - half;
    const y = cy + radius * Math.sin(angle) - half;

    ctx.fillEllipse(new Rect(x, y, dot, dot));
  }
}

function progressSweepRad(progress, lineWidth, radius) {
  const p = clamp(progress, 0, 1);
  let sweep = Math.PI * 2 * p;

  if (lineWidth > 0 && radius > 0) {
    sweep = Math.max(0, sweep - lineWidth / radius);
  }

  return sweep;
}

function buildArcPath(cx, cy, radius, angleStart, angleEnd) {
  const path = new Path();
  const sweep = angleEnd - angleStart;
  const steps = Math.max(48, Math.ceil(Math.abs(sweep) / (Math.PI / 96)));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = angleStart + sweep * t;
    const p = new Point(cx + radius * Math.cos(a), cy + radius * Math.sin(a));

    if (i === 0) path.move(p);
    else path.addLine(p);
  }

  return path;
}

function ringAngleRad(clockDeg) {
  return degToRad(clockDeg + RING_START_DEG - 90);
}

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function drawRingLegendGrid(ctx, progress, w, h) {
  const chipW = fs(92);
  const chipH = fs(28);
  const hGap = fs(28);
  const vGap = fs(12);

  const gridW = chipW * 2 + hGap;
  const gridH = chipH * 2 + vGap;
  const originX = (w - gridW) / 2;
  const originY = h - fs(18) - gridH;

  for (let i = 0; i < RINGS_LEGEND.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = originX + col * (chipW + hGap);
    const y = originY + row * (chipH + vGap);

    drawLegendChip(ctx, x, y, chipW, chipH, RINGS_LEGEND[i], progress[RINGS_LEGEND[i].key]);
  }
}

function drawLegendChip(ctx, x, y, w, h, ring, value) {
  const color = CONFIG.ui[ring.colorKey];
  const dot = fs(6);
  const labelSize = fs(CONFIG.ui.legendLabel);
  const percentSize = fs(CONFIG.ui.legendPercent);
  const dotY = y + (h - dot) / 2;
  const textY = y + fs(5);

  const dotX = x + fs(4);
  const labelX = dotX + dot + fs(8);
  const percentBoxW = fs(42);

  ctx.setFillColor(colorWithAlpha(color, 0.95));
  ctx.fillEllipse(new Rect(dotX, dotY, dot, dot));

  drawText(ctx, ring.short, labelX, textY, labelSize, CONFIG.ui.muted, "medium");
  drawText(
    ctx,
    formatPercent(value),
    x + w - fs(4),
    textY - fs(1),
    percentSize,
    color,
    "bold",
    "right",
    percentBoxW
  );
}

function getRingLayout(sizeName) {
  if (sizeName === "micro") {
    const lineWidth = 3.5;
    const gap = CONFIG.ui.ringGapMicro;

    return {
      innerRadius: 8,
      lineWidth,
      step: lineWidth + gap
    };
  }
  else if (sizeName === "mini") {
    const lineWidth = 15;
    const gap = CONFIG.ui.ringGapMini;

    return {
      innerRadius: 24,
      lineWidth,
      step: lineWidth + gap
    };
  }
}

function getTimeProgress(now = new Date()) {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const startOfWeek = getStartOfWeek(now);
  const endOfWeek = new Date(startOfWeek.getTime() + 7 * 86400000);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const endOfYear = new Date(now.getFullYear() + 1, 0, 1);

  return {
    now,
    day: (now - startOfDay) / (endOfDay - startOfDay),
    week: (now - startOfWeek) / (endOfWeek - startOfWeek),
    month: (now - startOfMonth) / (endOfMonth - startOfMonth),
    year: (now - startOfYear) / (endOfYear - startOfYear)
  };
}

function getStartOfWeek(date) {
  const d = new Date(date);
  const dayIndex = d.getDay();
  const startOn = CONFIG.weekStartsOn;
  let diff = dayIndex - startOn;

  if (diff < 0) diff += 7;

  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);

  return d;
}

function getNextMinuteDate() {
  const next = new Date();
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);
  return next;
}

function drawBackground(ctx, w, h, sizeName = "mini") {
  drawVerticalGradient(ctx, 0, 0, w, h, CONFIG.ui.bgTop, CONFIG.ui.bgBottom, sizeName === "micro" ? 40 : 80);

  if (sizeName === "micro") return;

  ctx.setFillColor(colorWithAlpha(CONFIG.ui.ringMonth, CONFIG.ui.glowAlpha));
  ctx.fillEllipse(new Rect(w * 0.55, -h * 0.35, w * 0.9, h * 0.85));

  ctx.setFillColor(colorWithAlpha(CONFIG.ui.ringDay, CONFIG.ui.glowAlpha * 0.7));
  ctx.fillEllipse(new Rect(-w * 0.25, h * 0.45, w * 0.65, h * 0.55));
}

function drawDecor(ctx, w, h, sizeName = "mini") {
  if (sizeName === "micro") return;

  ctx.setFillColor(colorWithAlpha("#FFFFFF", CONFIG.ui.decorWhiteAlpha));
  ctx.fillEllipse(new Rect(w - 36, 14, 14, 14));
  ctx.fillEllipse(new Rect(12, h - 28, 10, 10));
}

function fs(size) {
  const scale = CONFIG.ui.fontScale;
  const n = Number(scale);

  if (!Number.isFinite(n) || n <= 0) return Math.max(1, Math.round(size));

  return Math.max(1, Math.round(size * n));
}

function drawText(ctx, text, x, y, size, colorHex, weight = "regular", align = "left", boxW = 0) {
  ctx.setTextColor(new Color(colorHex));
  ctx.setFont(makeFont(fs(size), weight));
  const s = String(text);

  if (align === "center") {
    ctx.setTextAlignedCenter();
    ctx.drawText(s, new Point(x, y));
    ctx.setTextAlignedLeft();
    return;
  }

  if (align === "right" && boxW > 0) {
    ctx.setTextAlignedLeft();
    ctx.drawTextInRect(s, new Rect(x - boxW, y, boxW, fs(size) * 1.35));
    return;
  }

  ctx.setTextAlignedLeft();
  ctx.drawText(s, new Point(x, y));
}

function drawVerticalGradient(ctx, x, y, w, h, topHex, bottomHex, steps) {
  const top = hexToRgb(topHex);
  const bottom = hexToRgb(bottomHex);

  for (let i = 0; i < steps; i++) {
    const t = i / Math.max(1, steps - 1);
    const r = Math.round(lerp(top.r, bottom.r, t));
    const g = Math.round(lerp(top.g, bottom.g, t));
    const b = Math.round(lerp(top.b, bottom.b, t));

    ctx.setFillColor(new Color(rgbToHex(r, g, b)));

    const yy = y + Math.floor((h / steps) * i);
    const hh = Math.ceil(h / steps) + 1;

    ctx.fillRect(new Rect(x, yy, w, hh));
  }
}

function makeFont(size, weight) {
  if (weight === "heavy") return Font.heavySystemFont(size);
  if (weight === "bold") return Font.boldSystemFont(size);
  if (weight === "medium") return Font.mediumSystemFont(size);
  return Font.systemFont(size);
}

function formatPercent(value) {
  return `${Math.round(clamp(value, 0, 1) * 100)}%`;
}

function cleanText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function colorWithAlpha(hex, alpha) {
  return new Color(hex, alpha);
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");

  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16)
  };
}

function rgbToHex(r, g, b) {
  return "#" + toHex(r) + toHex(g) + toHex(b);
}

function toHex(n) {
  return Math.max(0, Math.min(255, n))
    .toString(16)
    .padStart(2, "0");
}
