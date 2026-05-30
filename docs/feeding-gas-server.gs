const KEY = "REPLACE_WITH_YOUR_SECRET";
const DATA_KEY = "feeding";

function doGet(e) {
  const params = getParams(e);
  if (params.key !== KEY) return json({ error: "forbidden" });

  const raw = PropertiesService.getScriptProperties().getProperty(DATA_KEY);
  return json(raw ? JSON.parse(raw) : defaultData());
}

function doPost(e) {
  const params = getParams(e);
  if (params.key !== KEY) return json({ error: "forbidden" });

  const body = JSON.parse(e.postData.contents);
  PropertiesService.getScriptProperties().setProperty(DATA_KEY, JSON.stringify(body));
  return json({ ok: true });
}

function getParams(e) {
  if (!e) return {};
  return e.parameter || {};
}

function defaultData() {
  return {
    version: 1,
    babyName: "Катя",
    feedings: [],
    updatedAt: new Date().toISOString()
  };
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
