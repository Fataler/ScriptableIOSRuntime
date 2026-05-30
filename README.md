# Scriptable Widgets Runtime

## Overview
A lightweight JavaScript runtime that lets you create, configure, and run UI widgets on any macOS or iOS device. Widgets are plain JS modules that export a `render` function and optional lifecycle hooks.

## Core Capabilities
- **Declarative UI**: Build UI with JSX‑like syntax or plain DOM APIs.
- **Reactive State**: `useState`, `useEffect`‑style hooks for auto‑updates.
- **Cross‑Platform**: Works in Scriptable, Shortcuts, and native macOS apps.
- **Sandboxed Execution**: Secure sandbox prevents unwanted system access.
- **Hot‑Reload**: Changes to widget files reload instantly during development.
- **Theme Support**: Dark/light modes, custom color palettes.

## Example Widgets
### 1. Clock (`FClock.js`)
```js
export function render({ now }) {
  const h = now.getHours();
  const m = now.getMinutes();
  return `<div class="clock">${h}:${m.toString().padStart(2,'0')}</div>`;
}
```
### 2. Time Counter (`FTimeCounter.js`)
```js
import { useState, useEffect } from "runtime";
export function render() {
  const [seconds, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return `<span>${seconds}s</span>`;
}
```
### 3. Weather Card (`FWeather.js`)
```js
export async function render({ location }) {
  const data = await fetch(`https://api.weather.com/v3/wx/conditions/current?geocode=${location}&format=json`).then(r=>r.json());
  return `<div class="weather">${data.temperature}° – ${data.narrative}</div>`;
}
```

## Getting Started
1. Clone repo.
2. Run `npm install` (only dev deps).
3. Launch `npm run dev` – opens a preview window.
4. Edit any widget file; the preview updates instantly.

## Contribution
- Follow the coding style from `eslint-config-widget`.
- Write docs for new hooks in `HOOKS.md`.
- Submit PRs with test coverage (`npm test`).

---
*Runtime designed for scriptable, fast, and safe widget creation.*
