# Router VPN — dev tools

Not part of Scriptable on iPhone.

| Path | Role |
|------|------|
| `scripts/RouterVpnToggle.js` | Script to copy into Scriptable and run on the phone |
| `tools/router-vpn/smoke-test.mjs` | Optional LAN check from a Mac on home Wi‑Fi |

Same idea as FeedMe: widget/script in repo root paths, backend/dev helper elsewhere (`docs/feeding-gas-server.gs` for GAS).

```bash
ROUTER_PASSWORD=your_password node tools/router-vpn/smoke-test.mjs
# or
ROUTER_PASSWORD=your_password npm run test:router-vpn
```

Env overrides: `ROUTER_HOST`, `ROUTER_USER`, `ROUTER_CACHE_TOKEN`.
