import { PREVIEW_DEVICE_PIXEL_RATIO } from "./preview-config.js";

const STORAGE_ROOT = "scriptable-preview";

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif';

export function installMocks(options = {}) {
  const {
    runsInWidget = true,
    widgetFamily = "medium",
    widgetId = "default",
    latitude = 59.938784,
    longitude = 30.314997,
    locationName = "Санкт-Петербург",
    devicePixelRatio = PREVIEW_DEVICE_PIXEL_RATIO
  } = options;

  const storagePrefix = `${STORAGE_ROOT}:${widgetId}:`;

  globalThis.__previewDevicePixelRatio = devicePixelRatio;

  const accessory =
    widgetFamily === "accessoryCircular" ||
    widgetFamily === "accessoryInline" ||
    widgetFamily === "accessoryRectangular";

  globalThis.config = {
    runsInWidget,
    runsInAccessoryWidget: accessory,
    widgetFamily
  };

  globalThis.args = {
    queryParameters: options.queryParameters ?? {},
    widgetParameter: options.widgetParameter ?? null
  };

  globalThis.URLScheme = {
    forRunningScript() {
      return `scriptable-preview://${widgetId}`;
    }
  };

  globalThis.Script = {
    setWidget(widget) {
      globalThis.__previewWidget = widget;
    },
    complete() {}
  };

  globalThis.Safari = {
    open(url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  globalThis.Notification = class Notification {
    constructor() {
      this.title = "";
      this.body = "";
    }

    async schedule() {
      console.log("[Notification]", this.title, this.body);
    }
  };

  globalThis.Alert = class Alert {
    constructor() {
      this.title = "";
      this.message = "";
      this._actions = [];
      this._cancel = null;
      this._fields = [];
    }

    addAction(title) {
      this._actions.push(title);
    }

    addCancelAction(title) {
      this._cancel = title;
    }

    addTextField(placeholder, value = "") {
      this._fields.push({ placeholder, value });
    }

    textFieldValue(index) {
      return this._fields[index]?.value ?? "";
    }

    async presentSheet() {
      const labels = this._actions.map((a, i) => `${i}: ${a}`).join("\n");
      const raw = window.prompt(
        `${this.title}\n\n${this.message}\n\n${labels}\n\nВведи номер действия (Cancel = закрыть):`,
        "0"
      );
      if (raw === null) return -1;
      const n = Number(raw);
      return Number.isFinite(n) ? n : -1;
    }

    async presentAlert() {
      const fields = this._fields.map(f => {
        const v = window.prompt(`${f.placeholder}:`, f.value);
        if (v === null) return null;
        f.value = v;
        return v;
      });

      if (fields.includes(null)) return -1;
      return 0;
    }
  };

  globalThis.Location = {
    setAccuracyToThreeKilometers() {},
    async current() {
      return { latitude, longitude };
    },
    async reverseGeocode() {
      return [{ locality: locationName }];
    }
  };

  globalThis.Request = class Request {
    constructor(url) {
      this.url = url;
      this.timeoutInterval = 30;
      this.method = "GET";
      this.headers = {};
      this.body = null;
    }

    async loadJSON() {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutInterval * 1000);

      try {
        const init = {
          signal: controller.signal,
          method: this.method || "GET",
          headers: { ...this.headers }
        };

        if (this.body != null && this.body !== "") {
          init.body = this.body;
        }

        const res = await fetch(this.url, init);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } finally {
        clearTimeout(timer);
      }
    }
  };

  globalThis.FileManager = {
    iCloud() {
      return createFileManager(storagePrefix);
    },
    local() {
      return createFileManager(storagePrefix);
    }
  };

  globalThis.Size = class Size {
    constructor(w, h) {
      this.width = w;
      this.height = h;
      this.w = w;
      this.h = h;
    }
  };

  globalThis.Point = class Point {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }
  };

  globalThis.Rect = class Rect {
    constructor(x, y, w, h) {
      this.x = x;
      this.y = y;
      this.width = w;
      this.height = h;
    }
  };

  globalThis.Path = class Path {
    constructor() {
      this._ops = [];
    }

    addRoundedRect(rect, rx, ry) {
      this._ops.push({ type: "roundRect", rect, rx, ry: ry ?? rx });
    }

    addArc(center, radius, startAngle, endAngle) {
      this._ops.push({
        type: "arc",
        center: { x: center.x, y: center.y },
        radius,
        startAngle,
        endAngle
      });
    }

    move(point) {
      this._ops.push({ type: "move", point: { x: point.x, y: point.y } });
    }

    addLine(point) {
      this._ops.push({ type: "line", point: { x: point.x, y: point.y } });
    }
  };

  globalThis.Color = class Color {
    constructor(hex, alpha = 1) {
      const rgb = parseHex(hex);
      this.r = rgb.r;
      this.g = rgb.g;
      this.b = rgb.b;
      this.a = alpha;
    }

    toCss() {
      return `rgba(${this.r}, ${this.g}, ${this.b}, ${this.a})`;
    }
  };

  globalThis.Font = {
    systemFont(size) {
      return { size, weight: "regular" };
    },
    mediumSystemFont(size) {
      return { size, weight: "medium" };
    },
    boldSystemFont(size) {
      return { size, weight: "bold" };
    },
    heavySystemFont(size) {
      return { size, weight: "heavy" };
    }
  };

  globalThis.DrawContext = createDrawContextClass();
  globalThis.ListWidget = createListWidgetClass();
}

function createFileManager(storagePrefix) {
  const root = `${storagePrefix}files:`;

  return {
    documentsDirectory() {
      return `${root}com~apple~CloudDocs/iCloud~preview/Scriptable/Documents`;
    },
    joinPath(a, b) {
      return `${a}/${b}`;
    },
    fileExists(path) {
      return localStorage.getItem(path) !== null;
    },
    createDirectory() {},
    isFileDownloaded() {
      return true;
    },
    async downloadFileFromiCloud() {},
    readString(path) {
      const v = localStorage.getItem(path);
      if (v === null) throw new Error(`Missing file: ${path}`);
      return v;
    },
    writeString(path, text) {
      localStorage.setItem(path, text);
    },
    remove(path) {
      localStorage.removeItem(path);
    }
  };
}

class WidgetImageRef {
  set imageSize(_size) {
    // Scriptable API parity; preview uses full canvas image
  }
}

function createWidgetStackClass() {
  return class WidgetStack {
    constructor(widget) {
      this._widget = widget;
    }

    centerAlignContent() {
      return this;
    }

    layoutVertically() {
      return this;
    }

    layoutHorizontally() {
      return this;
    }

    addImage(image) {
      this._widget.backgroundImage = image;
      return new WidgetImageRef();
    }

    addText(text) {
      return { text: String(text) };
    }

    addSpacer() {
      return {};
    }
  };
}

function createListWidgetClass() {
  const WidgetStack = createWidgetStackClass();

  return class ListWidget {
    constructor() {
      this.url = "";
      this.refreshAfterDate = null;
      this._padding = [0, 0, 0, 0];
      this.backgroundImage = null;
      this.backgroundColor = null;
    }

    setPadding(t, r, b, l) {
      this._padding = [t, r, b, l];
    }

    addStack() {
      return new WidgetStack(this);
    }

    async presentMedium() {
      publishPreview(this, "normal");
    }

    async presentSmall() {
      publishPreview(this, "mini");
    }

    async presentAccessoryCircular() {
      publishPreview(this, "micro");
    }

    getPreviewDataUrl() {
      return this.backgroundImage;
    }
  };
}

function publishPreview(widget, sizeName) {
  globalThis.__previewWidget = widget;
  globalThis.__previewSize = sizeName;
}

function createDrawContextClass() {
  return class DrawContext {
    constructor() {
      this.size = new Size(100, 100);
      this.opaque = true;
      this.respectScreenScale = true;
      this._canvas = null;
      this._ctx = null;
      this._textAlign = "left";
      this._font = Font.systemFont(16);
      this._fill = new Color("#000000");
      this._stroke = new Color("#FFFFFF");
      this._lineWidth = 1;
      this._path = null;
    }

    getPreviewScale() {
      if (!this.respectScreenScale) return 1;
      const forced = globalThis.__previewDevicePixelRatio;
      return Number.isFinite(forced) && forced > 0 ? forced : PREVIEW_DEVICE_PIXEL_RATIO;
    }

    ensureCanvas() {
      const scale = this.getPreviewScale();
      const w = Math.round(this.size.width);
      const h = Math.round(this.size.height);
      const pixelW = Math.max(1, Math.round(w * scale));
      const pixelH = Math.max(1, Math.round(h * scale));

      if (!this._canvas) {
        this._canvas = document.createElement("canvas");
        this._ctx = this._canvas.getContext("2d");
        this._pixelW = 0;
        this._pixelH = 0;
      }

      if (this._pixelW !== pixelW || this._pixelH !== pixelH) {
        this._canvas.width = pixelW;
        this._canvas.height = pixelH;
        this._pixelW = pixelW;
        this._pixelH = pixelH;
        this._ctx.setTransform(scale, 0, 0, scale, 0, 0);

        if (!this.opaque) {
          this._ctx.clearRect(0, 0, w, h);
        }
      }

      this._canvas.style.width = `${w}px`;
      this._canvas.style.height = `${h}px`;

      return { w, h, scale };
    }

    setFillColor(color) {
      this._fill = color;
    }

    setStrokeColor(color) {
      this._stroke = color;
    }

    setLineWidth(width) {
      this._lineWidth = width;
    }

    setTextColor(color) {
      this._textColor = color;
    }

    setFont(font) {
      this._font = font;
    }

    setTextAlignedLeft() {
      this._textAlign = "left";
    }

    setTextAlignedCenter() {
      this._textAlign = "center";
    }

    fillRect(rect) {
      this.ensureCanvas();
      const ctx = this._ctx;
      ctx.fillStyle = this._fill.toCss();
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }

    fillEllipse(rect) {
      this.ensureCanvas();
      const ctx = this._ctx;
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const rx = rect.width / 2;
      const ry = rect.height / 2;

      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = this._fill.toCss();
      ctx.fill();
    }

    strokeEllipse(rect) {
      this.ensureCanvas();
      const ctx = this._ctx;
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const rx = rect.width / 2;
      const ry = rect.height / 2;

      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = this._stroke.toCss();
      ctx.lineWidth = this._lineWidth;
      ctx.lineCap = "round";
      ctx.stroke();
    }

    addPath(path) {
      this._path = path;
    }

    fillPath() {
      if (!this._path) return;
      this.ensureCanvas();
      const ctx = this._ctx;

      for (const op of this._path._ops) {
        if (op.type === "roundRect") {
          const r = op.rect;
          roundRectPath(ctx, r.x, r.y, r.width, r.height, op.rx, op.ry);
          ctx.fillStyle = this._fill.toCss();
          ctx.fill();
        }
      }

      this._path = null;
    }

    strokePath() {
      if (!this._path) return;
      this.ensureCanvas();
      const ctx = this._ctx;

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = this._stroke.toCss();
      ctx.lineWidth = this._lineWidth;

      let started = false;

      for (const op of this._path._ops) {
        if (op.type === "arc") {
          ctx.beginPath();
          ctx.arc(op.center.x, op.center.y, op.radius, op.startAngle, op.endAngle);
          ctx.stroke();
          started = false;
          continue;
        }

        if (op.type === "move") {
          if (started) ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(op.point.x, op.point.y);
          started = true;
          continue;
        }

        if (op.type === "line") {
          if (!started) {
            ctx.beginPath();
            ctx.moveTo(op.point.x, op.point.y);
            started = true;
          } else {
            ctx.lineTo(op.point.x, op.point.y);
          }
        }
      }

      if (started) ctx.stroke();

      this._path = null;
    }

    drawText(text, point) {
      this.ensureCanvas();
      const ctx = this._ctx;
      applyTextStyle(ctx, this._font, this._textColor, this._textAlign);
      ctx.fillText(String(text), point.x, point.y);
    }

    drawTextInRect(text, rect) {
      this.ensureCanvas();
      const ctx = this._ctx;
      applyTextStyle(ctx, this._font, this._textColor, this._textAlign);

      const lineHeight = this._font.size * 1.2;
      const lines = wrapText(ctx, String(text), rect.width);
      const blockHeight = lines.length * lineHeight;
      let y = rect.y + Math.max(0, (rect.height - blockHeight) / 2);

      for (const line of lines) {
        if (y > rect.y + rect.height) break;
        let x = rect.x;
        if (this._textAlign === "center") x = rect.x + rect.width / 2;
        ctx.fillText(line, x, y);
        y += lineHeight;
      }
    }

    getImage() {
      if (!this._canvas) this.ensureCanvas();
      return this._canvas.toDataURL("image/png");
    }
  };
}

function applyTextStyle(ctx, font, color, align) {
  const weight =
    font.weight === "heavy"
      ? "800"
      : font.weight === "bold"
        ? "700"
        : font.weight === "medium"
          ? "500"
          : "400";

  ctx.font = `${weight} ${font.size}px ${FONT_STACK}`;
  ctx.fillStyle = color ? color.toCss() : "#fff";
  ctx.textAlign = align === "center" ? "center" : "left";
  ctx.textBaseline = "top";
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }

  if (line) lines.push(line);
  if (lines.length === 0) lines.push(text);

  return lines;
}

function roundRectPath(ctx, x, y, w, h, rx, ry) {
  const radiusX = Math.min(rx, w / 2);
  const radiusY = Math.min(ry ?? rx, h / 2);

  if (Math.abs(radiusX - radiusY) < 0.01) {
    const radius = Math.min(radiusX, radiusY);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(x + radiusX, y);
  ctx.lineTo(x + w - radiusX, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radiusY);
  ctx.lineTo(x + w, y + h - radiusY);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radiusX, y + h);
  ctx.lineTo(x + radiusX, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radiusY);
  ctx.lineTo(x, y + radiusY);
  ctx.quadraticCurveTo(x, y, x + radiusX, y);
  ctx.closePath();
}

function parseHex(hex) {
  let clean = String(hex || "#000000")
    .trim()
    .replace(/^#/, "");

  if (clean.length === 3) {
    clean = clean
      .split("")
      .map(ch => ch + ch)
      .join("");
  }

  if (clean.length === 8) {
    clean = clean.substring(0, 6);
  }

  if (clean.length !== 6) {
    clean = "000000";
  }

  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16)
  };
}
