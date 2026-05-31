// ============================================================
// TP-Link VPN Client toggle (Scriptable script, not a widget)
// AX5400 / luci firmware — uses router crypto libs via WebView
// ============================================================

const CONFIG = {
  host: "http://192.168.0.1",
  username: "admin",
  password: "Fataler69",

  // Cache-bust token from index.html (?t=...) — update if UI stops loading
  cacheToken: "4bf9c1df",

  // Run on home Wi‑Fi only (Scriptable cannot reach 192.168.x.x remotely)
  requireWifi: true
};

await main();

async function main() {
  assertHomeNetworkIfRequired();

  if (!CONFIG.password || CONFIG.password === "CHANGE_ME") {
    throw new Error("Set CONFIG.password in the script.");
  }

  const result = await runViaWebView();

  if (!result.ok) throw new Error(result.error || "Router request failed");

  const alert = new Alert();
  alert.title = "VPN Client";
  alert.message = result.message;
  alert.addAction("OK");
  await alert.present();
}

async function runViaWebView() {
  const host = CONFIG.host.replace(/\/$/, "");
  const t = CONFIG.cacheToken;
  const base = `${host}/webpages/`;

  const w = new WebView();
  await w.loadHTML("<!DOCTYPE html><html><head></head><body></body></html>", base);

  await waitSeconds(0.3);

  const payload = {
    host,
    username: CONFIG.username,
    password: CONFIG.password,
    cacheToken: t
  };

  await w.evaluateJavaScript(
    `document.body.removeAttribute("data-scriptable-result");`,
    false
  );

  await w.evaluateJavaScript(buildRunnerScript(payload), false);

  const raw = await pollWebViewResult(w, 50);

  return parseWebViewResult(raw);
}

async function pollWebViewResult(w, maxAttempts) {
  const readResult = `
(function() {
  var v = document.body.getAttribute("data-scriptable-result");
  if (!v || v.charAt(0) !== "{") return null;
  return v;
})()
`;

  for (let i = 0; i < maxAttempts; i++) {
    const raw = await w.evaluateJavaScript(readResult, false);

    if (isValidResultPayload(raw)) return raw;

    await waitSeconds(0.5);
  }

  const last = await w.evaluateJavaScript(readResult, false);
  throw new Error(
    "Router toggle timed out (no result in WebView). Last payload: " +
      String(last == null ? "null" : last).slice(0, 120)
  );
}

function isValidResultPayload(raw) {
  if (raw == null || raw === "") return false;
  if (typeof raw !== "string") return false;

  const text = raw.trim();
  if (!text.startsWith("{")) return false;

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed.ok === "boolean";
  } catch {
    return false;
  }
}

function parseWebViewResult(raw) {
  if (raw == null || raw === "") {
    throw new Error("WebView returned empty result");
  }

  if (typeof raw === "object") return raw;

  if (typeof raw !== "string") {
    throw new Error("WebView returned unsupported type: " + typeof raw);
  }

  const text = raw.trim();

  if (text.startsWith("{") || text.startsWith("[")) {
    return JSON.parse(text);
  }

  throw new Error("WebView returned non-JSON (router hijacked completion?): " + text.slice(0, 80));
}

function buildRunnerScript(payload) {
  return `
(function() {
  const CFG = ${JSON.stringify(payload)};

  function finish(obj) {
    document.body.setAttribute("data-scriptable-result", JSON.stringify(obj));
  }

  function fail(msg) {
    finish({ ok: false, error: String(msg) });
  }

  function sleep(ms) {
    return new Promise(function(resolve) {
      setTimeout(resolve, ms);
    });
  }

  function loadScript(src) {
    return new Promise(function(resolve, reject) {
      var el = document.createElement("script");
      el.src = src;
      el.onload = function() { resolve(); };
      el.onerror = function() { reject(new Error("Script load failed: " + src)); };
      document.head.appendChild(el);
    });
  }

  async function loadRouterLibs() {
    var base = CFG.host + "/webpages/";
    var t = CFG.cacheToken;
    await loadScript(base + "js/libs/jquery.min.js?t=" + t);
    await loadScript(base + "js/libs/cryptoJS.min.js?t=" + t);
    await loadScript(base + "js/libs/encrypt.js?t=" + t);
    await loadScript(base + "js/libs/tpEncrypt.js?t=" + t);
  }

  async function waitLibs() {
    for (var i = 0; i < 60; i++) {
      if (window.jQuery && jQuery.encrypt && jQuery.encrypt.encryptor && jQuery.su && jQuery.su.encrypt) return;
      await sleep(100);
    }
    throw new Error("Router crypto libraries did not load");
  }

  function decryptResponse(json, enc) {
    if (!json || !json.data) return json;
    if (typeof json.data === "object") return json;
    try {
      const plain = enc.dataDecrypt(json.data);
      return JSON.parse(plain);
    } catch (e) {
      return json;
    }
  }

  async function httpForm(url, fields, extraHeaders) {
    const body = typeof fields === "string" ? fields : new URLSearchParams(fields).toString();
    const r = await fetch(url, {
      method: "POST",
      headers: Object.assign({
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": CFG.host + "/webpages/index.html",
        "Origin": CFG.host
      }, extraHeaders || {}),
      credentials: "include",
      body
    });
    const text = await r.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Error("Invalid JSON: " + text.slice(0, 200));
    }
    return { json, response: r };
  }

  async function loginV1(enc) {
    const keysUrl = CFG.host + "/cgi-bin/luci/;stok=/login?form=keys";
    const authUrl = CFG.host + "/cgi-bin/luci/;stok=/login?form=auth";
    const loginUrl = CFG.host + "/cgi-bin/luci/;stok=/login?form=login";

    const keys = await httpForm(keysUrl, "operation=read");
    if (!keys.json.success) throw new Error("keys: " + JSON.stringify(keys.json));

    const [pwdNN, pwdEE] = keys.json.data.password;
    const useSimple = pwdNN && pwdNN.length >= 512;

    if (useSimple) {
      const cryptedPwd = jQuery.su.encrypt(CFG.password, [pwdNN, pwdEE]);
      const login = await httpForm(loginUrl, "operation=login&password=" + cryptedPwd);
      if (!login.json.success) throw new Error("login: " + JSON.stringify(login.json));
      const stok = login.json.data.stok;
      let sysauth = "";
      const sc = login.response.headers.get("set-cookie") || "";
      const m = sc.match(/sysauth=([^;]+)/);
      if (m) sysauth = m[1];
      return { stok, sysauth, enc: null, mode: "simple" };
    }

    const auth = await httpForm(authUrl, "operation=read");
    if (!auth.json.success) throw new Error("auth: " + JSON.stringify(auth.json));

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
    if (!decrypted.success) throw new Error("login: " + JSON.stringify(login.json));

    const stok = decrypted.data.stok;
    let sysauth = "";
    const sc = login.response.headers.get("set-cookie") || "";
    const m = sc.match(/sysauth=([^;]+)/);
    if (m) sysauth = m[1];

    return { stok, sysauth, enc, mode: "aes" };
  }

  async function apiCall(session, path, params) {
    const url = CFG.host + "/cgi-bin/luci/;stok=" + session.stok + "/" + path;
    const headers = {
      "Referer": CFG.host + "/webpages/index.html",
      "Origin": CFG.host,
      "Cookie": session.sysauth ? "sysauth=" + session.sysauth : ""
    };

    if (session.mode === "simple") {
      headers["Content-Type"] = "application/json";
      const r = await fetch(url, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(params)
      });
      const text = await r.text();
      return unwrapApi(JSON.parse(text));
    }

    const enc = session.enc;
    const plainBody = new URLSearchParams(params).toString();
    const encrypted = enc.dataEncrypt(plainBody, false);
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    const r = await fetch(url, {
      method: "POST",
      headers,
      credentials: "include",
      body: new URLSearchParams(encrypted).toString()
    });
    const text = await r.text();
    let json = JSON.parse(text);
    json = decryptResponse(json, enc);
    return unwrapApi(json);
  }

  function unwrapApi(json) {
    if (!json) return json;
    if (json.success === true && json.data != null) return json.data;
    return json;
  }

  (async function run() {
    try {
      await loadRouterLibs();
      await waitLibs();
      const enc = new jQuery.encrypt.encryptor();
      const session = await loginV1(enc);

      const block = await apiCall(session, "admin/vpn?form=enable", { operation: "read" });
      const enabled = block && block.enable === "on";
      const next = enabled ? "off" : "on";

      await apiCall(session, "admin/vpn?form=enable", {
        operation: "write",
        enable: next
      });

      finish({
        ok: true,
        wasEnabled: enabled,
        nowEnabled: next === "on",
        message: next === "on" ? "VPN client enabled" : "VPN client disabled"
      });
    } catch (e) {
      fail(e && e.message ? e.message : e);
    }
  })();
})();
`;
}

function waitSeconds(sec) {
  const ms = Math.max(0, sec * 1000);

  return new Promise(resolve => {
    Timer.schedule(ms, false, () => resolve());
  });
}

function assertHomeNetworkIfRequired() {
  if (!CONFIG.requireWifi) return;

  if (typeof Device.networkInterfaces !== "function") return;

  const ifaces = Device.networkInterfaces() || [];
  const onLan = ifaces.some(iface => {
    const ip = String(iface.ipAddress || "");
    return ip.startsWith("192.168.") || ip.startsWith("10.");
  });

  if (!onLan) {
    throw new Error("Connect to home Wi‑Fi first (router is not reachable over cellular).");
  }
}
