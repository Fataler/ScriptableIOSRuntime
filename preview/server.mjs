import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 4177);
const shouldOpen = process.argv.includes("--open");

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

const IGNORED_SCRIPT_DIRS = new Set(["preview", "runtime", "node_modules", ".git"]);

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/api/widgets") {
    sendJson(res, listWidgets());
    return;
  }

  let filePathname = pathname;
  if (filePathname === "/") filePathname = "/preview/index.html";

  serveFile(res, filePathname);
});

server.listen(port, "127.0.0.1", () => {
  const previewUrl = `http://127.0.0.1:${port}/`;
  console.log(`Scriptable preview: ${previewUrl}`);
  console.log(`Widgets API: http://127.0.0.1:${port}/api/widgets`);
  console.log("Ctrl+C to stop");

  if (shouldOpen) openBrowser(previewUrl);
});

function listWidgets() {
  const manifest = loadManifest();
  const fromManifest = manifest.widgets || [];
  const knownFiles = new Set(fromManifest.map(w => normalizeWidgetFile(w.file)));

  const discovered = discoverWidgetScripts().filter(file => !knownFiles.has(file));

  const autoWidgets = discovered.map(file => ({
    id: fileToId(file),
    file,
    title: path.basename(file, ".js"),
    description: "",
    sizes: ["mini", "normal"],
    defaultSize: "normal"
  }));

  return { widgets: [...fromManifest, ...autoWidgets] };
}

function loadManifest() {
  const manifestPath = path.join(root, "widgets.json");
  if (!fs.existsSync(manifestPath)) return { widgets: [] };

  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (e) {
    console.warn("widgets.json parse error:", e.message);
    return { widgets: [] };
  }
}

function discoverWidgetScripts() {
  const files = [];
  const widgetsDir = path.join(root, "widgets");

  if (!fs.existsSync(widgetsDir)) return files;

  for (const name of fs.readdirSync(widgetsDir)) {
    if (!name.endsWith(".js")) continue;
    files.push(normalizeWidgetFile(`widgets/${name}`));
  }

  return files.sort();
}

function normalizeWidgetFile(file) {
  return file.replace(/^\//, "");
}

function fileToId(file) {
  return file
    .replace(/^widgets\//, "")
    .replace(/\.js$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

function serveFile(res, pathname) {
  const filePath = path.resolve(root, "." + pathname);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const parts = filePath.split(path.sep);
  if (parts.some(p => IGNORED_SCRIPT_DIRS.has(p) && pathname.endsWith(".js"))) {
    // allow runtime/*.js for modules — only block serving preview/*.js as widgets
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function sendJson(res, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  const args = platform === "win32" ? ["", url] : [url];
  spawn(cmd, args, { stdio: "ignore", shell: platform === "win32" });
}
