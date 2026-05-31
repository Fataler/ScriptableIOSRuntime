#!/usr/bin/env node
/**
 * Optional LAN smoke test for RouterVpnToggle (Mac/Linux, same Wi‑Fi as router).
 * Not used on iPhone — Scriptable runs scripts/RouterVpnToggle.js instead.
 *
 * Usage:
 *   ROUTER_PASSWORD=secret node tools/router-vpn/smoke-test.mjs
 *   npm run test:router-vpn   # with ROUTER_PASSWORD in env
 */

import vm from "node:vm";

const HOST = (process.env.ROUTER_HOST || "http://192.168.0.1").replace(/\/$/, "");
const USER = process.env.ROUTER_USER || "admin";
const PASS = process.env.ROUTER_PASSWORD || "";
const CACHE_TOKEN = process.env.ROUTER_CACHE_TOKEN || "4bf9c1df";

if (!PASS) {
  console.error("Set ROUTER_PASSWORD (router admin password).");
  process.exit(1);
}

async function loadScript(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.text();
}

const base = `${HOST}/webpages/`;
const libs = [
  `${base}js/libs/jquery.min.js?t=${CACHE_TOKEN}`,
  `${base}js/libs/cryptoJS.min.js?t=${CACHE_TOKEN}`,
  `${base}js/libs/encrypt.js?t=${CACHE_TOKEN}`,
  `${base}js/libs/tpEncrypt.js?t=${CACHE_TOKEN}`
];

const context = vm.createContext({
  console,
  setTimeout,
  clearTimeout,
  fetch,
  URLSearchParams,
  Promise,
  JSON,
  window: {},
  document: { head: { appendChild() {} } },
  globalThis: {}
});
context.window = context;
context.globalThis = context;

for (const url of libs) {
  vm.runInContext(await loadScript(url), context, { filename: url });
}

const runner = `
const CFG = ${JSON.stringify({ host: HOST, username: USER, password: PASS, cacheToken: CACHE_TOKEN })};

function decryptResponse(json, enc) {
  if (!json || !json.data) return json;
  if (typeof json.data === "object") return json;
  try {
    return JSON.parse(enc.dataDecrypt(json.data));
  } catch (e) {
    return json;
  }
}

async function httpForm(url, fields) {
  const body = typeof fields === "string" ? fields : new URLSearchParams(fields).toString();
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: CFG.host + "/webpages/index.html",
      Origin: CFG.host
    },
    credentials: "include",
    body
  });
  const text = await r.text();
  return { json: JSON.parse(text), response: r };
}

async function loginV1(enc) {
  const keysUrl = CFG.host + "/cgi-bin/luci/;stok=/login?form=keys";
  const authUrl = CFG.host + "/cgi-bin/luci/;stok=/login?form=auth";
  const loginUrl = CFG.host + "/cgi-bin/luci/;stok=/login?form=login";

  const keys = await httpForm(keysUrl, "operation=read");
  const [pwdNN, pwdEE] = keys.json.data.password;
  const useSimple = pwdNN && pwdNN.length >= 512;

  if (useSimple) {
    const cryptedPwd = jQuery.su.encrypt(CFG.password, [pwdNN, pwdEE]);
    const login = await httpForm(loginUrl, "operation=login&password=" + cryptedPwd);
    const stok = login.json.data.stok;
    return { stok, mode: "simple" };
  }

  const auth = await httpForm(authUrl, "operation=read");
  const seq = auth.json.data.seq;
  const [nn, ee] = auth.json.data.key;
  enc.setSeq(seq);
  enc.setRSAKey(nn, ee);
  enc.genAESKey();
  enc.setHash(CFG.username, CFG.password);

  const cryptedPwd = jQuery.su.encrypt(CFG.password, [pwdNN, pwdEE]);
  const loginPlain = "operation=login&password=" + cryptedPwd + "&confirm=true";
  const payload = enc.dataEncrypt(loginPlain, true);
  const login = await httpForm(loginUrl, payload);
  const decrypted = decryptResponse(login.json, enc);
  return { stok: decrypted.data.stok, enc, mode: "aes" };
}

function unwrapApi(json) {
  if (!json) return json;
  if (json.success === true && json.data != null) return json.data;
  return json;
}

async function apiCall(session, path, params) {
  const url = CFG.host + "/cgi-bin/luci/;stok=" + session.stok + "/" + path;

  if (session.mode === "simple") {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Referer: CFG.host + "/webpages/index.html",
        Origin: CFG.host
      },
      credentials: "include",
      body: JSON.stringify(params)
    });
    return unwrapApi(JSON.parse(await r.text()));
  }

  const encrypted = session.enc.dataEncrypt(new URLSearchParams(params).toString(), false);
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: CFG.host + "/webpages/index.html",
      Origin: CFG.host
    },
    credentials: "include",
    body: new URLSearchParams(encrypted).toString()
  });
  let json = JSON.parse(await r.text());
  json = decryptResponse(json, session.enc);
  return unwrapApi(json);
}

(async function() {
  const enc = new jQuery.encrypt.encryptor();
  const session = await loginV1(enc);
  const block = await apiCall(session, "admin/vpn?form=enable", { operation: "read" });
  const enabled = block && block.enable === "on";
  const next = enabled ? "off" : "on";
  await apiCall(session, "admin/vpn?form=enable", { operation: "write", enable: next });
  const verify = await apiCall(session, "admin/vpn?form=enable", { operation: "read" });
  globalThis.__result = {
    ok: true,
    wasEnabled: enabled,
    toggledTo: next,
    verifyEnable: verify && verify.enable
  };
})();
`;

vm.runInContext(runner, context, { filename: "runner.js" });

const result = await new Promise((resolve, reject) => {
  const start = Date.now();
  const tick = () => {
    if (context.__result) {
      resolve(context.__result);
      return;
    }
    if (Date.now() - start > 60000) {
      reject(new Error("Runner timed out after 60s"));
      return;
    }
    setTimeout(tick, 250);
  };
  tick();
});

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
