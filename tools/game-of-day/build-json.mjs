import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const CSV_PATH = path.join(ROOT, "temp", "game-of-day", "Календарь великих игр - Лист 1.csv");
const DATA_DIR = path.join(ROOT, "data", "game-of-day");
const CALENDAR_PATH = path.join(DATA_DIR, "game-day-calendar.json");
const COVERS_PATH = path.join(DATA_DIR, "game-day-calendar.covers.json");
const DEBUG_PATH = path.join(DATA_DIR, "game-day-debug.json");
const OVERRIDES_PATH = path.join(DATA_DIR, "manual-overrides.json");

const MONTHS = {
  января: "01",
  февраля: "02",
  марта: "03",
  апреля: "04",
  мая: "05",
  июня: "06",
  июля: "07",
  августа: "08",
  сентября: "09",
  октября: "10",
  ноября: "11",
  декабря: "12"
};

const HEADER_ALIASES = {
  date: ["дата", "date"],
  title: ["названиеигры", "название", "игра", "title", "game"],
  platforms: ["платформы", "платформаы", "платформа", "platforms", "platform"],
  year: ["годрелиза", "год", "releaseyear", "year"],
  summary: ["описание", "summary", "description"],
  comment: ["комментарий", "reason", "line", "comment"],
  coverUrl: ["coverurl", "cover", "обложка", "обложкаurl", "image", "imageurl", "img", "imgurl"],
  backgroundUrl: ["backgroundurl", "background", "фон", "фонurl", "bgurl"],
  igdbUrl: ["igdburl", "url", "gameurl"],
  genres: ["genres", "genre", "жанры", "жанр"],
  rating: ["rating", "рейтинг"],
  ratingCount: ["ratingcount", "количестворейтингов", "votes", "count"]
};

main();

function main() {
  ensureFileExists(CSV_PATH);
  ensureDir(DATA_DIR);

  const rows = parseCsv(fs.readFileSync(CSV_PATH, "utf8").replace(/^\uFEFF/, ""));
  const headers = rows[0] || [];
  const index = buildHeaderIndex(headers);
  const overrides = readOverrides();
  const existingAssets = readExistingAssets();

  const entries = [];
  const debug = {};

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(cell => clean(cell) === "")) continue;

    const rawDate = getCell(row, index.date);
    const dateInfo = parseRussianDate(rawDate);
    if (!dateInfo) {
      throw new Error(`Bad date at row ${i + 1}: ${JSON.stringify(rawDate)}`);
    }

    const title = clean(getCell(row, index.title));
    if (!title) {
      throw new Error(`Missing title at row ${i + 1}`);
    }

    const year = parseYear(getCell(row, index.year));
    const summary = clean(getCell(row, index.summary));
    const comment = clean(getCell(row, index.comment));
    const platforms = splitList(getCell(row, index.platforms));
    const genres = splitList(getCell(row, index.genres));
    const rating = parseNumber(getCell(row, index.rating));
    const ratingCount = parseNumber(getCell(row, index.ratingCount));
    const coverUrl = clean(getCell(row, index.coverUrl));
    const backgroundUrl = clean(getCell(row, index.backgroundUrl));
    const igdbUrl = clean(getCell(row, index.igdbUrl));

    const preservedAssets = existingAssets[dateInfo.key] || {};
    const baseEntry = {
      key: dateInfo.key,
      title,
      year,
      releaseDateHuman: year ? `${dateInfo.label} ${year}` : dateInfo.label,
      displayDate: dateInfo.label,
      platforms,
      genres,
      summary: summary || comment,
      reason: summary && comment && summary !== comment ? comment : null,
      coverUrl: coverUrl || preservedAssets.coverUrl || null,
      backgroundUrl: backgroundUrl || preservedAssets.backgroundUrl || null,
      igdbUrl: igdbUrl || preservedAssets.igdbUrl || null,
      rating,
      ratingCount,
      quality: "curated",
      source: {
        row: i + 1,
        csv: path.relative(ROOT, CSV_PATH)
      }
    };

    const entry = normalizeEntry({
      ...baseEntry,
      ...(overrides[dateInfo.key] || {})
    });

    entries.push(entry);
    debug[dateInfo.key] = {
      selected: entry.title,
      sourceRow: i + 1,
      incomplete: collectIncompleteFlags(entry),
      original: {
        date: rawDate,
        title,
        year,
        platforms,
        summary,
        comment
      }
    };
  }

  const days = Object.fromEntries(entries.map(entry => [entry.key, entry]));
  if (!days["02-29"]) {
    const fallback = days["02-28"] ? cloneForLeapDay(days["02-28"]) : null;
    if (fallback) {
      days["02-29"] = fallback;
      debug["02-29"] = {
        selected: fallback.title,
        sourceRow: fallback.source?.row || null,
        incomplete: collectIncompleteFlags(fallback),
        fallbackFrom: "02-28"
      };
    }
  }

  const calendar = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: path.relative(ROOT, CSV_PATH),
      version: 2,
      totalDays: Object.keys(days).length
    },
    days
  };

  fs.writeFileSync(CALENDAR_PATH, JSON.stringify(calendar, null, 2) + "\n");
  fs.writeFileSync(DEBUG_PATH, JSON.stringify({
    meta: calendar.meta,
    stats: buildStats(days),
    days: debug
  }, null, 2) + "\n");

  if (!fs.existsSync(OVERRIDES_PATH)) {
    fs.writeFileSync(OVERRIDES_PATH, "{}\n");
  }

  console.log(`Wrote ${path.relative(ROOT, CALENDAR_PATH)} and ${path.relative(ROOT, DEBUG_PATH)}`);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === "\"") {
        if (text[i + 1] === "\"") {
          cell += "\"";
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === "\"") {
      quoted = true;
      continue;
    }

    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    if (ch !== "\r") cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function buildHeaderIndex(headers) {
  const out = {};

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    out[field] = headers.findIndex(header => aliases.includes(normalizeHeader(header)));
  }

  return out;
}

function normalizeHeader(value) {
  return clean(value)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, "");
}

function getCell(row, idx) {
  if (idx == null || idx < 0) return "";
  return row[idx] ?? "";
}

function parseRussianDate(value) {
  const m = /^(\d{1,2})\s+([а-яё]+)$/i.exec(clean(value));
  if (!m) return null;

  const day = String(Number(m[1])).padStart(2, "0");
  const monthName = m[2].toLowerCase();
  const month = MONTHS[monthName];
  if (!month) return null;

  return {
    key: `${month}-${day}`,
    label: `${Number(m[1])} ${monthName}`
  };
}

function parseYear(value) {
  const n = Number.parseInt(clean(value), 10);
  return Number.isFinite(n) ? n : null;
}

function parseNumber(value) {
  const raw = clean(value).replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function splitList(value) {
  return clean(value)
    .split(/\s*,\s*/)
    .map(x => clean(x))
    .filter(Boolean);
}

function normalizeEntry(entry) {
  return {
    key: entry.key,
    title: clean(entry.title),
    year: Number.isFinite(entry.year) ? entry.year : null,
    releaseDateHuman: clean(entry.releaseDateHuman),
    displayDate: clean(entry.displayDate),
    platforms: Array.isArray(entry.platforms) ? entry.platforms.filter(Boolean) : [],
    genres: Array.isArray(entry.genres) ? entry.genres.filter(Boolean) : [],
    summary: clean(entry.summary),
    reason: clean(entry.reason) || null,
    coverUrl: clean(entry.coverUrl) || null,
    backgroundUrl: clean(entry.backgroundUrl) || null,
    igdbUrl: clean(entry.igdbUrl) || null,
    rating: Number.isFinite(entry.rating) ? entry.rating : null,
    ratingCount: Number.isFinite(entry.ratingCount) ? entry.ratingCount : null,
    quality: clean(entry.quality) || "curated",
    source: entry.source || null,
    fallbackFrom: clean(entry.fallbackFrom) || null
  };
}

function cloneForLeapDay(source) {
  return normalizeEntry({
    ...source,
    key: "02-29",
    displayDate: "29 февраля",
    releaseDateHuman: source.year ? `29 февраля ${source.year}` : "29 февраля",
    fallbackFrom: "02-28",
    reason: clean(source.reason) || "Фолбэк для високосного дня."
  });
}

function collectIncompleteFlags(entry) {
  const flags = [];
  if (!entry.year) flags.push("missing_year");
  if (!entry.platforms.length) flags.push("missing_platforms");
  if (!entry.summary) flags.push("missing_summary");
  if (!entry.coverUrl) flags.push("missing_cover");
  return flags;
}

function buildStats(days) {
  const list = Object.values(days);

  return {
    totalDays: list.length,
    withCover: list.filter(x => !!x.coverUrl).length,
    withoutCover: list.filter(x => !x.coverUrl).length,
    missingYear: list.filter(x => !x.year).length,
    missingPlatforms: list.filter(x => !x.platforms.length).length,
    missingSummary: list.filter(x => !x.summary).length,
    fallbackDays: list.filter(x => !!x.fallbackFrom).length
  };
}

function readOverrides() {
  if (!fs.existsSync(OVERRIDES_PATH)) return {};

  try {
    return JSON.parse(fs.readFileSync(OVERRIDES_PATH, "utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON in ${path.relative(ROOT, OVERRIDES_PATH)}: ${error.message}`);
  }
}

function readExistingAssets() {
  const merged = {};

  for (const filePath of [CALENDAR_PATH, COVERS_PATH]) {
    if (!fs.existsSync(filePath)) continue;

    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const days = raw.days && typeof raw.days === "object" ? raw.days : {};

      for (const [key, entry] of Object.entries(days)) {
        const prev = merged[key] || {};
        merged[key] = {
          coverUrl: clean(entry?.coverUrl) || prev.coverUrl || null,
          backgroundUrl: clean(entry?.backgroundUrl) || prev.backgroundUrl || null,
          igdbUrl: clean(entry?.igdbUrl) || prev.igdbUrl || null
        };
      }
    } catch (error) {
      throw new Error(`Invalid JSON in ${path.relative(ROOT, filePath)}: ${error.message}`);
    }
  }

  return merged;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function ensureFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${path.relative(ROOT, filePath)}`);
  }
}

function clean(value) {
  return String(value ?? "").trim();
}
