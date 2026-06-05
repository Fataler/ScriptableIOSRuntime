import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, "data", "game-of-day", "game-day-calendar.json");
const PRIMARY_OUTPUT_PATH = path.join(ROOT, "data", "game-of-day", "game-day-calendar.json");
const OUTPUT_PATH = path.join(ROOT, "data", "game-of-day", "game-day-calendar.covers.json");
const API_KEY = clean(process.env.STEAMGRIDDB_API_KEY);
const BASE = "https://www.steamgriddb.com/api/v2";
const DELAY_MS = 120;
const TITLE_ALIASES = {
  "Yooka‑Laylee": ["Yooka-Laylee"],
  "FTL iPad": ["FTL: Faster Than Light", "Faster Than Light"],
  "Zelda TOTK": ["The Legend of Zelda: Tears of the Kingdom"],
  "ME Legendary Edition": ["Mass Effect: Legendary Edition"],
  "MGS Peace Walker": ["Metal Gear Solid: Peace Walker"],
  "TESO Tamriel Unl.": ["The Elder Scrolls Online: Tamriel Unlimited", "The Elder Scrolls Online"],
  "FFVII Remake Int.": ["Final Fantasy VII Remake Intergrade", "Final Fantasy VII Remake"],
  "Half‑Life Blue Shift": ["Half-Life: Blue Shift", "Half-Life Blue Shift"],
  "MGS PW (JP)": ["Metal Gear Solid: Peace Walker"],
  "Zelda OoT 3D": ["The Legend of Zelda: Ocarina of Time 3D"],
  "Smash Brawl EU": ["Super Smash Bros. Brawl"],
  "LEGO SW TFA": ["LEGO Star Wars: The Force Awakens"],
  "Banjo‑Kazooie": ["Banjo-Kazooie", "Banjo Kazooie"],
  "FFXIV Shadowbringers": ["Final Fantasy XIV Online", "Final Fantasy XIV: Shadowbringers"],
  "FFXII Zodiac Age": ["Final Fantasy XII: The Zodiac Age"],
  "SMT IV": ["Shin Megami Tensei IV"],
  "FF XIV: A Realm Reborn": ["Final Fantasy XIV Online", "Final Fantasy XIV: A Realm Reborn"],
  "Okami": ["Ōkami", "Okami HD", "Ōkami HD"],
  "Faster Than Light (iPad)": ["FTL: Faster Than Light", "Faster Than Light"]
};

async function main() {
  if (!API_KEY) {
    throw new Error("Missing STEAMGRIDDB_API_KEY");
  }

  const calendar = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));
  const days = calendar.days || {};
  const entries = Object.values(days);
  const cache = new Map();
  const stats = {
    total: entries.length,
    updated: 0,
    skippedExisting: 0,
    noMatch: 0,
    errors: 0
  };

  for (const entry of entries) {
    if (entry.coverUrl) {
      stats.skippedExisting++;
      continue;
    }

    const key = `${entry.title}__${entry.year || ""}`;

    try {
      let match = cache.get(key);
      if (!match) {
        match = await findSteamGridCover(entry.title, entry.year);
        cache.set(key, match);
        await sleep(DELAY_MS);
      }

      if (!match) {
        stats.noMatch++;
        continue;
      }

      entry.coverUrl = match.coverUrl || null;
      entry.backgroundUrl = entry.backgroundUrl || match.heroUrl || null;
      entry.sgdb = {
        gameId: match.gameId,
        gameName: match.gameName,
        matchScore: match.matchScore,
        gridId: match.gridId || null,
        heroId: match.heroId || null
      };
      stats.updated++;
    } catch (error) {
      stats.errors++;
      console.error(`Cover enrich failed for ${entry.key} ${entry.title}: ${error.message}`);
    }

    const done = stats.updated + stats.skippedExisting + stats.noMatch + stats.errors;
    if (done % 25 === 0 || done === stats.total) {
      console.log(`progress ${done}/${stats.total} updated=${stats.updated} noMatch=${stats.noMatch} errors=${stats.errors}`);
    }
  }

  calendar.meta = {
    ...(calendar.meta || {}),
    coverEnrichedAt: new Date().toISOString(),
    coverProvider: "SteamGridDB"
  };

  const payload = JSON.stringify(calendar, null, 2) + "\n";
  fs.writeFileSync(PRIMARY_OUTPUT_PATH, payload);
  fs.writeFileSync(OUTPUT_PATH, payload);
  console.log(JSON.stringify({
    output: [
      path.relative(ROOT, PRIMARY_OUTPUT_PATH),
      path.relative(ROOT, OUTPUT_PATH)
    ],
    stats
  }, null, 2));
}

async function findSteamGridCover(title, year) {
  const ranked = await searchCandidates(title, year);
  const picked = ranked[0];
  if (!picked || picked.score < 40) return null;

  const gameId = picked.item?.id;
  if (!gameId) return null;

  const [grids, heroes] = await Promise.all([
    api(`/grids/game/${gameId}?dimensions=600x900,660x930,342x482&mimes=image/png,image/jpeg&types=static&nsfw=false`),
    api(`/heroes/game/${gameId}?dimensions=1600x650,1920x620&mimes=image/png,image/jpeg&types=static&nsfw=false`)
  ]);

  const grid = pickBestAsset(grids?.data);
  const hero = pickBestAsset(heroes?.data);

  if (!grid && !hero) return null;

  return {
    gameId,
    gameName: picked.item?.name || title,
    matchScore: picked.score,
    matchQuery: picked.query,
    gridId: grid?.id || null,
    heroId: hero?.id || null,
    coverUrl: grid?.url || grid?.thumb || null,
    heroUrl: hero?.url || hero?.thumb || null
  };
}

async function searchCandidates(title, year) {
  const ranked = [];
  const seen = new Set();
  const searchTerms = [title, ...(TITLE_ALIASES[title] || [])];

  for (const query of searchTerms) {
    const term = clean(query);
    if (!term) continue;

    const norm = normalize(term);
    if (seen.has(norm)) continue;
    seen.add(norm);

    const search = await api(`/search/autocomplete/${encodeURIComponent(term)}`);
    const candidates = Array.isArray(search?.data) ? search.data : [];

    for (const item of candidates) {
      ranked.push({
        item,
        query: term,
        score: scoreCandidate(term, year, item)
      });
    }
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

function pickBestAsset(list) {
  if (!Array.isArray(list) || !list.length) return null;

  const ranked = list
    .map(item => ({
      item,
      score:
        getNumber(item?.score, 0) * 10 +
        (item?.style === "official" ? 30 : 0) +
        (item?.style === "white_logo" ? 10 : 0) +
        (item?.nsfw ? -100 : 0) +
        (item?.humor ? -30 : 0)
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0]?.item;
  if (!best) return null;

  return {
    id: best.id || null,
    url: best.url || best.thumb || best.thumbnail || null,
    thumb: best.thumb || best.thumbnail || null
  };
}

function scoreCandidate(title, year, item) {
  const wanted = normalize(title);
  const got = normalize(item?.name || "");
  let score = 0;

  if (wanted === got) score += 100;
  else if (got.includes(wanted) || wanted.includes(got)) score += 70;
  else score += overlapScore(wanted, got);

  if (item?.verified === true) score += 12;
  if (matchesYear(item?.release_date, year)) score += 5;

  return score;
}

function matchesYear(releaseDate, year) {
  if (!year || !releaseDate) return false;
  const n = Number(releaseDate);
  if (!Number.isFinite(n)) return false;
  const d = new Date(n * 1000);
  return d.getUTCFullYear() === Number(year);
}

function overlapScore(a, b) {
  const aa = new Set(a.split(" ").filter(Boolean));
  const bb = new Set(b.split(" ").filter(Boolean));
  let same = 0;
  for (const token of aa) {
    if (bb.has(token)) same++;
  }
  return same * 12;
}

async function api(pathname) {
  const res = await fetch(`${BASE}${pathname}`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: "application/json"
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${pathname}`);
  }

  return await res.json();
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function getNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clean(value) {
  return String(value ?? "").trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
