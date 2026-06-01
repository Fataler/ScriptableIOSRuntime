const KEY_PROPERTY = "FEEDING_API_KEY";
const DATA_KEY = "feeding";

function doGet(e) {
  try {
    const params = getParams(e);
    if (!isAuthorized(params.key)) return json({ error: "forbidden" });

    const raw = PropertiesService.getScriptProperties().getProperty(DATA_KEY);
    const data = raw ? normalizeData(JSON.parse(raw)) : defaultData();
    return json(data);
  } catch (err) {
    return handleError(err);
  }
}

function doPost(e) {
  let lock = null;

  try {
    const params = getParams(e);
    if (!isAuthorized(params.key)) return json({ error: "forbidden" });

    if (!e || !e.postData || !e.postData.contents) {
      return json({ error: "bad_request", message: "empty body" });
    }

    const body = JSON.parse(e.postData.contents);
    const normalized = normalizeData(body);

    lock = LockService.getScriptLock();
    lock.waitLock(5000);

    PropertiesService.getScriptProperties().setProperty(DATA_KEY, JSON.stringify(normalized));
    return json({ ok: true, updatedAt: normalized.updatedAt });
  } catch (err) {
    return handleError(err);
  } finally {
    if (lock) {
      try {
        lock.releaseLock();
      } catch (_) {}
    }
  }
}

function getParams(e) {
  if (!e) return {};
  return e.parameter || {};
}

function isAuthorized(key) {
  const secret = getSecretKey();
  return !!secret && key === secret;
}

function getSecretKey() {
  const key = PropertiesService.getScriptProperties().getProperty(KEY_PROPERTY);
  if (!key) throw new Error("config: missing " + KEY_PROPERTY);
  return key;
}

function defaultData() {
  return {
    version: 1,
    babyName: "Катя",
    feedings: [],
    updatedAt: new Date().toISOString()
  };
}

function normalizeData(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("validation: body must be object");
  }

  const version = toFiniteNumber(input.version, 1);
  const babyName = cleanText(input.babyName) || defaultData().babyName;
  const createdAt = normalizeIsoDate(input.createdAt) || new Date().toISOString();
  const updatedAt = normalizeIsoDate(input.updatedAt) || new Date().toISOString();
  const feedings = normalizeFeedings(input.feedings);

  return {
    version,
    babyName,
    createdAt,
    updatedAt,
    feedings
  };
}

function normalizeFeedings(feedings) {
  if (feedings == null) return [];
  if (!Array.isArray(feedings)) throw new Error("validation: feedings must be array");

  return feedings
    .map(normalizeFeeding)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

function normalizeFeeding(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error("validation: feeding must be object");
  }

  const at = normalizeIsoDate(item.at);
  if (!at) throw new Error("validation: feeding.at invalid");

  const amountMl = toFiniteNumber(item.amountMl, NaN);
  if (!Number.isFinite(amountMl) || amountMl < 0) {
    throw new Error("validation: feeding.amountMl invalid");
  }

  return {
    at,
    amountMl,
    type: cleanText(item.type),
    source: cleanText(item.source),
    editedAt: normalizeIsoDate(item.editedAt) || undefined
  };
}

function normalizeIsoDate(value) {
  if (value == null || value === "") return "";
  const dt = new Date(value);
  if (isNaN(dt.getTime())) return "";
  return dt.toISOString();
}

function cleanText(value) {
  return String(value == null ? "" : value).trim();
}

function toFiniteNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function handleError(err) {
  const message = err && err.message ? String(err.message) : String(err);
  const isValidation = message.indexOf("validation:") === 0;
  const isConfig = message.indexOf("config:") === 0;

  return json({
    error: isValidation ? "bad_request" : (isConfig ? "server_misconfigured" : "internal_error"),
    message
  });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
