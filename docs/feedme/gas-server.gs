const KEY_PROPERTY = "FEEDING_API_KEY";
const DATA_KEY = "feeding";
const DATA_VERSION = 2;

function doGet(e) {
  try {
    const params = getParams(e);
    if (!isAuthorized(params.key)) return json({ error: "forbidden" });

    const raw = PropertiesService.getScriptProperties().getProperty(DATA_KEY);
    const data = raw ? normalizeData(JSON.parse(raw)) : defaultData();
    if (isMetaRequest(params)) return json(buildMeta(data));
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
    const incoming = normalizeData(body);

    lock = LockService.getScriptLock();
    lock.waitLock(5000);

    const raw = PropertiesService.getScriptProperties().getProperty(DATA_KEY);
    const current = raw ? normalizeData(JSON.parse(raw)) : defaultData();
    const merged = mergeData(current, incoming);

    PropertiesService.getScriptProperties().setProperty(DATA_KEY, JSON.stringify(merged));
    if (isCompactRequest(params, body)) {
      return json({
        ok: true,
        updatedAt: merged.updatedAt,
        count: Array.isArray(merged.feedings) ? merged.feedings.length : 0
      });
    }
    return json({ ok: true, updatedAt: merged.updatedAt, data: merged });
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

function isMetaRequest(params) {
  return String(params && params.meta || "") === "1";
}

function isCompactRequest(params, body) {
  return String(params && params.compact || "") === "1" ||
    String(body && body.compactResponse || "") === "1";
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
    version: DATA_VERSION,
    babyName: "Катя",
    createdAt: new Date().toISOString(),
    feedings: [],
    deletedFeedings: [],
    updatedAt: new Date().toISOString()
  };
}

function buildMeta(data) {
  data = normalizeData(data || defaultData());
  return {
    version: data.version,
    updatedAt: data.updatedAt,
    count: Array.isArray(data.feedings) ? data.feedings.length : 0
  };
}

function normalizeData(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("validation: body must be object");
  }

  const version = Math.max(toFiniteNumber(input.version, 1), DATA_VERSION);
  const babyName = cleanText(input.babyName) || defaultData().babyName;
  const createdAt = normalizeIsoDate(input.createdAt) || new Date().toISOString();
  const updatedAt = normalizeIsoDate(input.updatedAt) || new Date().toISOString();
  const feedings = normalizeFeedings(input.feedings);
  const deletedFeedings = normalizeDeletedFeedings(input.deletedFeedings);
  const deletedMap = new Map(deletedFeedings.map((item) => [item.id, item]));

  return {
    version,
    babyName,
    createdAt,
    updatedAt,
    feedings: feedings.filter((feeding) => {
      const deleted = deletedMap.get(feeding.id);
      if (!deleted) return true;
      return getFeedingSyncTimestamp(feeding) > getDeletedSyncTimestamp(deleted);
    }),
    deletedFeedings
  };
}

function normalizeFeedings(feedings) {
  if (feedings == null) return [];
  if (!Array.isArray(feedings)) throw new Error("validation: feedings must be array");

  const map = new Map();

  for (const item of feedings.map(normalizeFeeding).filter(Boolean)) {
    const prev = map.get(item.id);
    if (!prev || getFeedingSyncTimestamp(item) >= getFeedingSyncTimestamp(prev)) {
      map.set(item.id, item);
    }
  }

  return [...map.values()]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

function normalizeDeletedFeedings(feedings) {
  if (feedings == null) return [];
  if (!Array.isArray(feedings)) throw new Error("validation: deletedFeedings must be array");

  const map = new Map();

  for (const item of feedings.map(normalizeDeletedFeeding).filter(Boolean)) {
    const prev = map.get(item.id);
    if (!prev || getDeletedSyncTimestamp(item) >= getDeletedSyncTimestamp(prev)) {
      map.set(item.id, item);
    }
  }

  return [...map.values()]
    .sort((a, b) => getDeletedSyncTimestamp(b) - getDeletedSyncTimestamp(a));
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

  const updatedAt = normalizeIsoDate(item.updatedAt || item.editedAt || item.at) || at;

  return {
    id: cleanText(item.id) || buildLegacyFeedingId(item),
    at,
    amountMl,
    type: cleanText(item.type),
    source: cleanText(item.source),
    updatedAt,
    editedAt: normalizeIsoDate(item.editedAt) || undefined
  };
}

function normalizeDeletedFeeding(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error("validation: deleted feeding must be object");
  }

  const id = cleanText(item.id);
  const deletedAt = normalizeIsoDate(item.deletedAt || item.updatedAt || item.at);
  if (!id || !deletedAt) throw new Error("validation: deleted feeding invalid");

  return { id, deletedAt };
}

function mergeData(current, incoming) {
  current = normalizeData(current || defaultData());
  incoming = normalizeData(incoming || defaultData());

  const feedingsMap = new Map();
  for (const feeding of [...current.feedings, ...incoming.feedings]) {
    const prev = feedingsMap.get(feeding.id);
    if (!prev || getFeedingSyncTimestamp(feeding) >= getFeedingSyncTimestamp(prev)) {
      feedingsMap.set(feeding.id, feeding);
    }
  }

  const deletedMap = new Map();
  for (const item of [...current.deletedFeedings, ...incoming.deletedFeedings]) {
    const prev = deletedMap.get(item.id);
    if (!prev || getDeletedSyncTimestamp(item) >= getDeletedSyncTimestamp(prev)) {
      deletedMap.set(item.id, item);
    }
  }

  const feedings = [...feedingsMap.values()]
    .filter((feeding) => {
      const deleted = deletedMap.get(feeding.id);
      if (!deleted) return true;
      return getFeedingSyncTimestamp(feeding) > getDeletedSyncTimestamp(deleted);
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const deletedFeedings = [...deletedMap.values()]
    .sort((a, b) => getDeletedSyncTimestamp(b) - getDeletedSyncTimestamp(a));

  return normalizeData({
    version: Math.max(current.version, incoming.version, DATA_VERSION),
    babyName: incoming.babyName || current.babyName || defaultData().babyName,
    createdAt: current.createdAt || incoming.createdAt,
    updatedAt: newestIso(current.updatedAt, incoming.updatedAt, new Date().toISOString()),
    feedings,
    deletedFeedings
  });
}

function getFeedingSyncTimestamp(item) {
  return toSyncTimestamp(item && (item.updatedAt || item.editedAt || item.at));
}

function getDeletedSyncTimestamp(item) {
  return toSyncTimestamp(item && (item.deletedAt || item.updatedAt));
}

function toSyncTimestamp(value) {
  const t = value ? new Date(value).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

function newestIso() {
  const best = Array.prototype.slice.call(arguments)
    .map(toSyncTimestamp)
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a)[0];
  return best ? new Date(best).toISOString() : new Date().toISOString();
}

function buildLegacyFeedingId(item) {
  return [
    "legacy",
    cleanText(item && item.at),
    String(toFiniteNumber(item && item.amountMl, "")),
    cleanText(item && item.type),
    cleanText(item && item.source)
  ].join("|");
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
