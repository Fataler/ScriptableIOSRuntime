/**
 * Loads a Scriptable widget script without eval / AsyncFunction.
 * Uses dynamic import(blob) so it works under strict CSP and in all modern browsers.
 */

export async function runScriptableWidget(scriptUrl, options = {}) {
  const res = await fetch(scriptUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`${scriptUrl}: HTTP ${res.status}`);

  const src = await res.text();
  const moduleCode = prepareModuleSource(src, options);
  const blobUrl = URL.createObjectURL(new Blob([moduleCode], { type: "text/javascript" }));

  try {
    const mod = await import(/* @vite-ignore */ blobUrl);
    await mod.__scriptablePreviewRun();
    return globalThis.__previewWidget ?? null;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

export function detectConfigWidgetSize(src) {
  const match = String(src).match(/\bwidgetSize\s*:\s*(['"])([^'"]*)\1/);
  return match ? match[2] : null;
}

export function patchWidgetSize(source, size) {
  const re = /(\bwidgetSize\s*:\s*)(['"])[^'"]*\2/;
  if (!re.test(source)) return source;
  return source.replace(re, `$1"${size}"`);
}

export function prepareModuleSource(src, options = {}) {
  let code = String(src);

  code = code.replace(/^\s*await\s+main\s*\(\s*\)\s*;?\s*$/gm, "");
  code = code.replace(/^\s*await\s+run\s*\(\s*\)\s*;?\s*$/gm, "");

  const forceSize = options.forceWidgetSize;
  if (forceSize) {
    code = `globalThis.__previewForceWidgetSize = ${JSON.stringify(forceSize)};\n${code}`;

    const configSize = detectConfigWidgetSize(code);
    if (configSize && configSize !== "auto") {
      code = patchWidgetSize(code, forceSize);
    }
  }

  code += `
export async function __scriptablePreviewRun() {
  if (typeof main === "function") return await main();
  if (typeof run === "function") return await run();
  throw new Error("Script has no async main() or run()");
}
`;
  return code;
}
