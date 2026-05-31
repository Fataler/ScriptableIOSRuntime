# ScriptableWidgets

A collection of hand-crafted widgets for the [Scriptable](https://scriptable.app/) iOS app, with a local preview server for development on macOS.

## Widgets

### 🌤 FWeather
A weather widget powered by [Open-Meteo](https://open-meteo.com/) — no API key required.

- Shows current temperature, feels-like, wind, precipitation probability and UV index
- Large readable text, minimal design
- Tapping the widget opens a weather page (Yandex Погода or custom URL)
- Caches data locally, updates every 20 minutes
- Sizes: **mini** (1×1) and **normal** (2×1)

### 🍼 FeedMe
A baby feeding tracker widget.

- Shows time since last feeding and countdown to next
- Color-coded status: green (ok) → yellow (soon) → red (time to feed)
- **Tap the widget** to log a feeding instantly
- Supports Google Apps Script backend for syncing between multiple phones
- Sizes: **mini** (1×1) and **normal** (2×1)

### 🔵 FTimeCounter
Activity rings showing progress through the current day, week, month and year — inspired by Apple Health.

- Concentric rings, each representing a time period (day/week/month/year)
- Sizes: **micro** (lock screen `accessoryCircular`) and **mini** (1×1 home screen)

### 🔐 RouterVpnToggle (script)
Standalone Scriptable script (not a widget): toggles **VPN Client** on a TP-Link AX5400-class router over LAN.

- **On iPhone:** `scripts/RouterVpnToggle.js` — set `host`, `password`, run on home Wi‑Fi
- Uses the router’s own `tpEncrypt.js` via WebView (same API as the web UI)
- **Dev only (Mac, LAN):** `tools/router-vpn/smoke-test.mjs` — see `tools/router-vpn/README.md`

---

## Local Preview

The repo includes a Node.js preview server that runs widgets in a browser during development — no need to copy code to your phone on every change.

```bash
node preview/server.mjs
# or
node preview/server.mjs --open   # opens browser automatically
```

The server watches `widgets/` and reloads instantly on file changes.  
It mocks Scriptable APIs (`ListWidget`, `DrawContext`, `Color`, `Font`, etc.) in the browser environment so widgets render visually.

---

## Widget structure

Each widget is a single self-contained `.js` file that runs in Scriptable:

- Has a top-level `CONFIG` object with all tunable parameters
- Calls `await main()` on start
- Uses Scriptable APIs: `ListWidget`, `DrawContext`, `Script`, `Alert`, `FileManager`, etc.
- No npm dependencies — each file is standalone and can be pasted directly into Scriptable

---

## Requirements

- **On device:** [Scriptable](https://scriptable.app/) (free, iOS/iPadOS)
- **For local preview:** Node.js 18+

---

## License

MIT
