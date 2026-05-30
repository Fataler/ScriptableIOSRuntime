// ============================================================
// Human Weather Canvas Widget for Scriptable v5
// Короткий полезный виджет погоды: крупный текст, минимум слов.
//
// Источник: Open-Meteo, без API-ключа.
// Тап по виджету открывает страницу погоды.
// ============================================================

const CONFIG = {
    // "auto" | "mini" | "normal"
    widgetSize: "auto",
  
    defaultLocation: {
      name: "Санкт-Петербург",
      latitude: 59.938784,
      longitude: 30.314997,
      timezone: "Europe/Moscow",
      openUrl: "https://yandex.ru/pogoda/ru/saint-petersburg"
    },
  
    yandexByCoordsUrl: "https://yandex.ru/pogoda/?lat={lat}&lon={lon}",
  
    temperatureUnit: "celsius",
    windSpeedUnit: "ms",
    precipitationUnit: "mm",
  
    forecastHours: 12,
  
    cacheMinutes: 20,
    refreshEveryMinutes: 20,
  
    previewSize: "normal",
    showDebugInManualRun: false,
  
    thresholds: {
      rainProbability: 35,
      lightRainProbability: 20,
  
      strongWind: 8,
      veryStrongWind: 12,
      unpleasantGusts: 11,
  
      coldFeelsLike: -5,
      coolFeelsLike: 5,
      mildFeelsLike: 14,
      warmFeelsLike: 22,
      hotFeelsLike: 27,
  
      lowHumidity: 30,
      highHumidity: 85,
      highUv: 5,
  
      pressureLowMmHg: 745,
      pressureHighMmHg: 770
    },
  
    dataFolder: "WeatherWidgets",
    cacheFile: "weather-cache-v5.json",
    settingsFile: "weather-settings-v5.json",
  
    ui: {
      bgNightTop: "#101225",
      bgNightBottom: "#080A16",
      bgDayTop: "#24466D",
      bgDayBottom: "#111B35",
      bgRainTop: "#1C2B3F",
      bgRainBottom: "#0A0E1C",
      bgSnowTop: "#364B68",
      bgSnowBottom: "#141B2C",
  
      text: "#FFFFFF",
      soft: "#E4E7F4",
      muted: "#B8BDD4",
      faint: "#8E93AA",
  
      good: "#72F1C1",
      warning: "#FFD166",
      bad: "#FF6B7A",
      cold: "#91C9FF",
      hot: "#FFB36B",
      rain: "#7FB7FF",
      snow: "#D8EDFF",
  
      card: "#FFFFFF",
      cardAlpha: 0.10,
      cardAlphaStrong: 0.16,
      cardBorder: 0.14,
  
      decorWhiteAlpha: 0.018,
      decorColorAlpha: 0.032,
  
      fontScale: 1.25
    }
  };
  
  const CANVAS = {
    mini: { w: 320, h: 320 },
    normal: { w: 680, h: 320 }
  };
  
  await main();
  
  async function main() {
    try {
      const settings = await loadSettings();
      const weather = await getWeatherWithCache(settings);
  
      if (!config.runsInWidget) {
        await showMenu(weather, settings);
        Script.complete();
        return;
      }
  
      const widget = await createWidget(weather, settings);
      Script.setWidget(widget);
      Script.complete();
    } catch (error) {
      const settings = await loadSettingsSafe();
      const widget = await createErrorWidget(error, settings);
  
      if (config.runsInWidget) Script.setWidget(widget);
      else await widget.presentMedium();
  
      Script.complete();
    }
  }
  
  // ============================================================
  // Меню
  // ============================================================
  
  async function showMenu(weather, settings) {
    const s = weather.summary;
    const loc = weather.location;
    const autoText = settings.locationMode === "auto" ? "вкл" : "выкл";
  
    const a = new Alert();
    a.title = "Погода";
    a.message =
      `${loc.name}\n` +
      `${signedRound(weather.current.temperature)}° · как ${signedRound(weather.current.feelsLike)}°\n` +
      `Локация: ${settings.locationMode === "auto" ? "авто" : "ручная"} · авто ${autoText}\n\n` +
      `${s.main}\n` +
      `${s.wear}\n` +
      (s.walk ? `🚶 ${s.walk}\n` : "") +
      `${s.extra}`;
  
    a.addAction("👀 Normal 2x1");
    a.addAction("👀 Mini 1x1");
    a.addAction("🌐 Открыть погоду");
    a.addAction("📍 Моё место сейчас");
    a.addAction(settings.locationMode === "auto" ? "🛰 Авто-локация: выкл" : "🛰 Авто-локация: вкл");
    a.addAction("✍️ Место вручную");
    a.addAction("🏠 Сброс на СПб");
    a.addAction("🔄 Обновить");
  
    if (CONFIG.showDebugInManualRun) a.addAction("🧪 JSON в консоль");
  
    a.addCancelAction("Закрыть");
  
    const choice = await a.presentSheet();
  
    if (choice === 0) {
      const widget = await createWidget(weather, settings, "normal");
      await widget.presentMedium();
    }
  
    if (choice === 1) {
      const widget = await createWidget(weather, settings, "mini");
      await widget.presentSmall();
    }
  
    if (choice === 2) Safari.open(getOpenUrl(weather.location));
    if (choice === 3) await setLocationFromGpsOnce(settings);
    if (choice === 4) await toggleAutoLocation(settings);
    if (choice === 5) await setLocationManually(settings);
    if (choice === 6) await resetLocationToDefault(settings);
    if (choice === 7) await refreshNow(settings);
  
    if (CONFIG.showDebugInManualRun && choice === 8) {
      console.log(JSON.stringify(weather.raw, null, 2));
    }
  }
  
  async function setLocationFromGpsOnce(settings) {
    try {
      const loc = await getCurrentLocationObject("Текущее место");
  
      settings.locationMode = "fixed";
      settings.fixedLocation = loc;
      settings.lastAutoLocation = loc;
      settings.updatedAt = new Date().toISOString();
  
      await saveSettings(settings);
      await clearCache();
  
      const fresh = await fetchWeather(settings);
      await saveCache(fresh, settings);
  
      await notify("Место обновлено", `${loc.name} · ${formatCoord(loc.latitude)}, ${formatCoord(loc.longitude)}`);
      await previewFresh(fresh, settings);
    } catch (error) {
      await notify("Не удалось получить место", errorMessage(error));
    }
  }
  
  async function toggleAutoLocation(settings) {
    try {
      if (settings.locationMode === "auto") {
        settings.locationMode = "fixed";
        settings.fixedLocation = settings.lastAutoLocation || settings.fixedLocation || makeDefaultLocation();
        settings.updatedAt = new Date().toISOString();
        await saveSettings(settings);
        await clearCache();
        await notify("Авто-локация выключена", settings.fixedLocation.name);
        return;
      }
  
      const loc = await getCurrentLocationObject("Текущее место");
      settings.locationMode = "auto";
      settings.lastAutoLocation = loc;
      settings.updatedAt = new Date().toISOString();
  
      await saveSettings(settings);
      await clearCache();
  
      const fresh = await fetchWeather(settings);
      await saveCache(fresh, settings);
  
      await notify("Авто-локация включена", loc.name);
      await previewFresh(fresh, settings);
    } catch (error) {
      await notify("Авто-локация не включена", errorMessage(error));
    }
  }
  
  async function setLocationManually(settings) {
    const current = getEffectiveLocationFromSettings(settings);
  
    const a = new Alert();
    a.title = "Место";
    a.message = "Название, координаты, timezone. URL можно пустым — откроется Яндекс по координатам.";
  
    a.addTextField("Название", current.name || "Моё место");
    a.addTextField("Широта", String(current.latitude));
    a.addTextField("Долгота", String(current.longitude));
    a.addTextField("Timezone", current.timezone || CONFIG.defaultLocation.timezone);
    a.addTextField("URL", current.openUrl || "");
  
    a.addAction("Сохранить");
    a.addCancelAction("Отмена");
  
    const result = await a.presentAlert();
    if (result === -1) return;
  
    const name = cleanText(a.textFieldValue(0)) || "Моё место";
    const lat = getNumber(normalizeCommaNumber(a.textFieldValue(1)), NaN);
    const lon = getNumber(normalizeCommaNumber(a.textFieldValue(2)), NaN);
    const timezone = cleanText(a.textFieldValue(3)) || CONFIG.defaultLocation.timezone;
    const openUrl = cleanText(a.textFieldValue(4));
  
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      await notify("Место не сохранено", "Координаты неверные");
      return;
    }
  
    settings.locationMode = "fixed";
    settings.fixedLocation = makeLocationObject(name, lat, lon, timezone, openUrl);
    settings.updatedAt = new Date().toISOString();
  
    await saveSettings(settings);
    await clearCache();
  
    const fresh = await fetchWeather(settings);
    await saveCache(fresh, settings);
  
    await notify("Место сохранено", `${name} · ${formatCoord(lat)}, ${formatCoord(lon)}`);
    await previewFresh(fresh, settings);
  }
  
  async function resetLocationToDefault(settings) {
    settings.locationMode = "fixed";
    settings.fixedLocation = makeDefaultLocation();
    settings.updatedAt = new Date().toISOString();
  
    await saveSettings(settings);
    await clearCache();
  
    const fresh = await fetchWeather(settings);
    await saveCache(fresh, settings);
  
    await notify("Сброшено на СПб", CONFIG.defaultLocation.name);
    await previewFresh(fresh, settings);
  }
  
  async function refreshNow(settings) {
    await clearCache();
  
    const fresh = await fetchWeather(settings);
    await saveCache(fresh, settings);
  
    await notify("Погода обновлена", fresh.location.name);
    await previewFresh(fresh, settings);
  }
  
  async function previewFresh(weather, settings) {
    const widget = await createWidget(weather, settings, CONFIG.previewSize);
    if (CONFIG.previewSize === "mini") await widget.presentSmall();
    else await widget.presentMedium();
  }
  
  // ============================================================
  // Виджет
  // ============================================================
  
  async function createWidget(weather, settings, forcedSize = null) {
    const sizeName = forcedSize || resolveWidgetSize();
  
    const widget = new ListWidget();
    widget.setPadding(0, 0, 0, 0);
    widget.backgroundImage = drawWidgetImage(weather, sizeName);
    widget.url = getOpenUrl(weather.location);
    widget.refreshAfterDate = new Date(Date.now() + CONFIG.refreshEveryMinutes * 60 * 1000);
  
    return widget;
  }
  
  function resolveWidgetSize() {
    if (CONFIG.widgetSize === "mini") return "mini";
    if (CONFIG.widgetSize === "normal") return "normal";
    return config.widgetFamily === "small" ? "mini" : "normal";
  }
  
  async function createErrorWidget(error, settings) {
    const sizeName = resolveWidgetSize();
    const size = CANVAS[sizeName];
  
    const ctx = new DrawContext();
    ctx.size = new Size(size.w, size.h);
    ctx.opaque = false;
    ctx.respectScreenScale = true;
  
    drawVerticalGradient(ctx, 0, 0, size.w, size.h, "#2A1320", "#0B0810", 100);
    drawText(ctx, "⚠️ Погода", 28, 30, 32, CONFIG.ui.text, "bold");
    drawTextInRect(ctx, "Нет прогноза. Проверь интернет или открой скрипт.", 28, 92, size.w - 56, 110, 26, CONFIG.ui.muted, "medium");
    drawTextInRect(ctx, errorMessage(error), 28, 220, size.w - 56, 70, 18, CONFIG.ui.faint, "regular");
  
    const widget = new ListWidget();
    widget.setPadding(0, 0, 0, 0);
    widget.backgroundImage = ctx.getImage();
    widget.url = getOpenUrl(getEffectiveLocationFromSettings(settings));
    widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  
    return widget;
  }
  
  // ============================================================
  // API + кэш + настройки
  // ============================================================
  
  async function getWeatherWithCache(settings) {
    const loc = await resolveLocation(settings);
    const cache = await loadCache();
  
    if (cache && isCacheFresh(cache) && isSameLocation(cache.location, loc)) {
      return normalizeWeather(cache.raw, cache.fetchedAt, true, false, loc);
    }
  
    try {
      const fresh = await fetchWeather(settings, loc);
      await saveCache(fresh, settings);
      return fresh;
    } catch (error) {
      if (cache && cache.raw && cache.location) {
        return normalizeWeather(cache.raw, cache.fetchedAt, true, true, cache.location);
      }
  
      throw error;
    }
  }
  
  async function fetchWeather(settings, forcedLocation = null) {
    const loc = forcedLocation || await resolveLocation(settings);
    const req = new Request(buildOpenMeteoUrl(loc));
    req.timeoutInterval = 12;
  
    const raw = await req.loadJSON();
  
    if (!raw || !raw.current || !raw.hourly || !raw.daily) {
      throw new Error("Open-Meteo: нет данных");
    }
  
    return normalizeWeather(raw, new Date().toISOString(), false, false, loc);
  }
  
  function buildOpenMeteoUrl(loc) {
    const base = "https://api.open-meteo.com/v1/forecast";
  
    const params = {
      latitude: loc.latitude,
      longitude: loc.longitude,
      timezone: loc.timezone || CONFIG.defaultLocation.timezone,
      forecast_days: 3,
      temperature_unit: CONFIG.temperatureUnit,
      wind_speed_unit: CONFIG.windSpeedUnit,
      precipitation_unit: CONFIG.precipitationUnit,
      current: [
        "temperature_2m",
        "relative_humidity_2m",
        "apparent_temperature",
        "precipitation",
        "rain",
        "showers",
        "snowfall",
        "weather_code",
        "cloud_cover",
        "pressure_msl",
        "wind_speed_10m",
        "wind_direction_10m",
        "wind_gusts_10m",
        "is_day"
      ].join(","),
      hourly: [
        "temperature_2m",
        "apparent_temperature",
        "relative_humidity_2m",
        "precipitation_probability",
        "precipitation",
        "rain",
        "snowfall",
        "weather_code",
        "cloud_cover",
        "pressure_msl",
        "wind_speed_10m",
        "wind_direction_10m",
        "wind_gusts_10m",
        "uv_index",
        "is_day"
      ].join(","),
      daily: [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_probability_max",
        "precipitation_sum",
        "wind_speed_10m_max",
        "wind_gusts_10m_max",
        "uv_index_max",
        "sunrise",
        "sunset"
      ].join(",")
    };
  
    return base + "?" + Object.keys(params)
      .map(k => encodeURIComponent(k) + "=" + encodeURIComponent(params[k]))
      .join("&");
  }
  
  function normalizeWeather(raw, fetchedAt, fromCache, staleCache, loc) {
    const hourly = extractNextHours(raw, new Date(), CONFIG.forecastHours);
    const c = raw.current;
  
    const weather = {
      location: loc,
      fetchedAt,
      fromCache,
      staleCache,
      raw,
      current: {
        time: c.time,
        temperature: c.temperature_2m,
        feelsLike: c.apparent_temperature,
        humidity: c.relative_humidity_2m,
        precipitation: c.precipitation,
        rain: c.rain,
        showers: c.showers,
        snowfall: c.snowfall,
        weatherCode: c.weather_code,
        cloudCover: c.cloud_cover,
        pressureHpa: c.pressure_msl,
        pressureMmHg: hpaToMmHg(c.pressure_msl),
        windSpeed: c.wind_speed_10m,
        windDirection: c.wind_direction_10m,
        windGusts: c.wind_gusts_10m,
        isDay: c.is_day === 1
      },
      hourly,
      daily: {
        code: raw.daily.weather_code[0],
        tempMax: raw.daily.temperature_2m_max[0],
        tempMin: raw.daily.temperature_2m_min[0],
        rainProbabilityMax: raw.daily.precipitation_probability_max[0],
        precipitationSum: raw.daily.precipitation_sum[0],
        windMax: raw.daily.wind_speed_10m_max[0],
        gustsMax: raw.daily.wind_gusts_10m_max[0],
        uvMax: raw.daily.uv_index_max[0],
        sunrise: raw.daily.sunrise[0],
        sunset: raw.daily.sunset[0]
      }
    };
  
    weather.analysis = analyzeWeather(weather);
    weather.summary = buildSummary(weather);
  
    return weather;
  }
  
  function extractNextHours(raw, now, count) {
    const h = raw.hourly;
    const result = [];
  
    for (let i = 0; i < h.time.length; i++) {
      const date = new Date(h.time[i]);
      if (date.getTime() < now.getTime() - 60 * 60 * 1000) continue;
  
      result.push({
        time: h.time[i],
        date,
        hour: date.getHours(),
        temperature: h.temperature_2m[i],
        feelsLike: h.apparent_temperature[i],
        humidity: h.relative_humidity_2m[i],
        rainProbability: h.precipitation_probability[i],
        precipitation: h.precipitation[i],
        rain: h.rain[i],
        snowfall: h.snowfall[i],
        weatherCode: h.weather_code[i],
        cloudCover: h.cloud_cover[i],
        pressureHpa: h.pressure_msl[i],
        pressureMmHg: hpaToMmHg(h.pressure_msl[i]),
        windSpeed: h.wind_speed_10m[i],
        windDirection: h.wind_direction_10m[i],
        windGusts: h.wind_gusts_10m[i],
        uvIndex: h.uv_index[i],
        isDay: h.is_day[i] === 1
      });
  
      if (result.length >= count) break;
    }
  
    return result;
  }
  
  async function resolveLocation(settings) {
    if (!settings) settings = await loadSettingsSafe();
  
    if (settings.locationMode === "auto") {
      try {
        const loc = await getCurrentLocationObject("Авто");
        settings.lastAutoLocation = loc;
        settings.updatedAt = new Date().toISOString();
        await saveSettings(settings);
        return loc;
      } catch (e) {
        return settings.lastAutoLocation || settings.fixedLocation || makeDefaultLocation();
      }
    }
  
    return settings.fixedLocation || makeDefaultLocation();
  }
  
  async function getCurrentLocationObject(defaultName) {
    if (typeof Location.setAccuracyToThreeKilometers === "function") {
      Location.setAccuracyToThreeKilometers();
    }
  
    const pos = await Location.current();
    let name = defaultName || "Текущее место";
  
    try {
      if (typeof Location.reverseGeocode === "function") {
        const places = await Location.reverseGeocode(pos.latitude, pos.longitude, "ru_RU");
        if (places && places.length > 0) {
          const p = places[0];
          name = p.locality || p.subLocality || p.name || name;
        }
      }
    } catch (e) {}
  
    return makeLocationObject(name, pos.latitude, pos.longitude, CONFIG.defaultLocation.timezone, "");
  }
  
  async function loadSettingsSafe() {
    try {
      return await loadSettings();
    } catch (e) {
      return createDefaultSettings();
    }
  }
  
  async function loadSettings() {
    const storage = getStorage();
    const fm = storage.fm;
    const path = storage.settingsPath;
  
    if (!fm.fileExists(path)) {
      const settings = createDefaultSettings();
      await saveSettings(settings);
      return settings;
    }
  
    if (typeof fm.isFileDownloaded === "function" && !fm.isFileDownloaded(path)) {
      await fm.downloadFileFromiCloud(path);
    }
  
    try {
      return normalizeSettings(JSON.parse(fm.readString(path)));
    } catch (e) {
      const settings = createDefaultSettings();
      await saveSettings(settings);
      return settings;
    }
  }
  
  async function saveSettings(settings) {
    const storage = getStorage();
    storage.fm.writeString(storage.settingsPath, JSON.stringify(normalizeSettings(settings), null, 2));
  }
  
  function createDefaultSettings() {
    return {
      version: 5,
      locationMode: "fixed",
      fixedLocation: makeDefaultLocation(),
      lastAutoLocation: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
  
  function normalizeSettings(settings) {
    const def = createDefaultSettings();
    const s = settings || def;
  
    return {
      version: 5,
      locationMode: s.locationMode === "auto" ? "auto" : "fixed",
      fixedLocation: normalizeLocationObject(s.fixedLocation || def.fixedLocation),
      lastAutoLocation: s.lastAutoLocation ? normalizeLocationObject(s.lastAutoLocation) : null,
      createdAt: s.createdAt || def.createdAt,
      updatedAt: s.updatedAt || new Date().toISOString()
    };
  }
  
  async function loadCache() {
    const storage = getStorage();
    const fm = storage.fm;
    const path = storage.cachePath;
  
    if (!fm.fileExists(path)) return null;
  
    if (typeof fm.isFileDownloaded === "function" && !fm.isFileDownloaded(path)) {
      await fm.downloadFileFromiCloud(path);
    }
  
    try {
      return JSON.parse(fm.readString(path));
    } catch (e) {
      return null;
    }
  }
  
  async function saveCache(weather, settings) {
    const storage = getStorage();
    const payload = {
      fetchedAt: weather.fetchedAt,
      location: weather.location,
      raw: weather.raw
    };
  
    storage.fm.writeString(storage.cachePath, JSON.stringify(payload, null, 2));
  }
  
  async function clearCache() {
    const storage = getStorage();
    if (storage.fm.fileExists(storage.cachePath)) storage.fm.remove(storage.cachePath);
  }
  
  function isCacheFresh(cache) {
    if (!cache || !cache.fetchedAt) return false;
    const ageMs = Date.now() - new Date(cache.fetchedAt).getTime();
    return ageMs < CONFIG.cacheMinutes * 60 * 1000;
  }
  
  function getStorage() {
    const fm = FileManager.iCloud();
    const base = fm.documentsDirectory();
    const folder = fm.joinPath(base, CONFIG.dataFolder);
  
    if (!fm.fileExists(folder)) fm.createDirectory(folder, true);
  
    return {
      fm,
      folder,
      cachePath: fm.joinPath(folder, CONFIG.cacheFile),
      settingsPath: fm.joinPath(folder, CONFIG.settingsFile)
    };
  }
  
  function getEffectiveLocationFromSettings(settings) {
    if (!settings) return makeDefaultLocation();
    if (settings.locationMode === "auto" && settings.lastAutoLocation) return settings.lastAutoLocation;
    return settings.fixedLocation || makeDefaultLocation();
  }
  
  function makeDefaultLocation() {
    return makeLocationObject(
      CONFIG.defaultLocation.name,
      CONFIG.defaultLocation.latitude,
      CONFIG.defaultLocation.longitude,
      CONFIG.defaultLocation.timezone,
      CONFIG.defaultLocation.openUrl
    );
  }
  
  function makeLocationObject(name, lat, lon, timezone, openUrl) {
    return normalizeLocationObject({ name, latitude: lat, longitude: lon, timezone, openUrl });
  }
  
  function normalizeLocationObject(loc) {
    const def = CONFIG.defaultLocation;
    const lat = getNumber(loc && loc.latitude, def.latitude);
    const lon = getNumber(loc && loc.longitude, def.longitude);
  
    return {
      name: cleanText(loc && loc.name) || def.name,
      latitude: lat,
      longitude: lon,
      timezone: cleanText(loc && loc.timezone) || def.timezone,
      openUrl: cleanText(loc && loc.openUrl) || ""
    };
  }
  
  function isSameLocation(a, b) {
    if (!a || !b) return false;
    const dLat = Math.abs(Number(a.latitude) - Number(b.latitude));
    const dLon = Math.abs(Number(a.longitude) - Number(b.longitude));
    return dLat < 0.02 && dLon < 0.02;
  }
  
  function getOpenUrl(loc) {
    const location = normalizeLocationObject(loc || makeDefaultLocation());
    if (location.openUrl) return location.openUrl;
  
    return CONFIG.yandexByCoordsUrl
      .replace("{lat}", encodeURIComponent(location.latitude))
      .replace("{lon}", encodeURIComponent(location.longitude));
  }
  
  // ============================================================
  // Аналитика
  // ============================================================
  
  function analyzeWeather(weather) {
    const c = weather.current;
    const hours = weather.hourly;
  
    const maxRainProbability = max(hours.map(x => x.rainProbability));
    const maxWind = max(hours.map(x => x.windSpeed));
    const maxGusts = max(hours.map(x => x.windGusts));
    const minFeels = min(hours.map(x => x.feelsLike));
    const maxFeels = max(hours.map(x => x.feelsLike));
    const maxUv = max(hours.map(x => x.uvIndex));
    const nextRain = findNextRain(hours);
    const walkWindow = findBestWalkWindow(hours);
  
    const flags = {
      rainingNow: hasCurrentRain(c) || isRainCode(c.weatherCode),
      umbrella: maxRainProbability >= CONFIG.thresholds.rainProbability || hasCurrentRain(c),
      rainRisk: maxRainProbability >= CONFIG.thresholds.lightRainProbability,
      windy: maxWind >= CONFIG.thresholds.strongWind || maxGusts >= CONFIG.thresholds.unpleasantGusts,
      veryWindy: maxWind >= CONFIG.thresholds.veryStrongWind || maxGusts >= CONFIG.thresholds.veryStrongWind + 3,
      cold: c.feelsLike <= CONFIG.thresholds.coldFeelsLike || minFeels <= CONFIG.thresholds.coldFeelsLike,
      cool: c.feelsLike <= CONFIG.thresholds.coolFeelsLike || minFeels <= CONFIG.thresholds.coolFeelsLike,
      hot: c.feelsLike >= CONFIG.thresholds.hotFeelsLike || maxFeels >= CONFIG.thresholds.hotFeelsLike,
      dry: c.humidity <= CONFIG.thresholds.lowHumidity,
      humid: c.humidity >= CONFIG.thresholds.highHumidity,
      uv: maxUv >= CONFIG.thresholds.highUv,
      snow: isSnowCode(c.weatherCode) || hours.some(x => isSnowCode(x.weatherCode)),
      thunder: isThunderCode(c.weatherCode) || hours.some(x => isThunderCode(x.weatherCode)),
      lowPressure: c.pressureMmHg <= CONFIG.thresholds.pressureLowMmHg,
      highPressure: c.pressureMmHg >= CONFIG.thresholds.pressureHighMmHg
    };
  
    return { maxRainProbability, maxWind, maxGusts, minFeels, maxFeels, maxUv, nextRain, walkWindow, flags };
  }
  
  function buildSummary(weather) {
    const c = weather.current;
    const a = weather.analysis;
    const desc = describeWeatherCode(c.weatherCode, c.isDay);
  
    let priority = "good";
    let main = shortWeatherText(desc.text);
  
    if (a.flags.thunder) {
      main = "⛈ гроза — дома";
      priority = "bad";
    } else if (a.flags.veryWindy) {
      main = "💨 сильный ветер";
      priority = "bad";
    } else if (a.flags.umbrella && a.nextRain) {
      main = `☔ дождь ${formatHourRangeHuman(a.nextRain.start, a.nextRain.end)}`;
      priority = "warning";
    } else if (a.flags.snow) {
      main = "🌨 идёт снег";
      priority = "warning";
    } else if (a.flags.windy) {
      main = "💨 ветрено";
      priority = "warning";
    } else if (a.flags.cold) {
      main = `🥶 ощущается ${signedRound(c.feelsLike)}°`;
      priority = "cold";
    } else if (a.flags.hot) {
      main = `🥵 ощущается ${signedRound(c.feelsLike)}°`;
      priority = "hot";
    } else if (a.flags.rainRisk) {
      main = "🌦 дождь возможен";
      priority = "warning";
    }
  
    if (weather.staleCache) {
      main = "⚠️ кэш";
      priority = "warning";
    }
  
    return {
      priority,
      main,
      wear: buildWearAdvice(weather),
      walk: buildWalkAdvice(weather),
      extra: buildExtraAdvice(weather)
    };
  }
  
  function buildWearAdvice(weather) {
    const feels = weather.current.feelsLike;
    const a = weather.analysis;
  
    let base;
  
    if (feels <= -10) base = "пуховик";
    else if (feels <= -2) base = "куртка, шапка";
    else if (feels <= 7) base = "куртка";
    else if (feels <= 14) base = "худи";
    else if (feels <= 21) base = "кофта";
    else if (feels <= 26) base = "футболка";
    else base = "легко одеться";
  
    const extras = [];
    if (a.flags.umbrella) extras.push("☔");
    if (a.flags.windy && feels <= 16) extras.push("💨");
    if (a.flags.uv) extras.push("SPF");
    if (a.flags.hot) extras.push("💧");
    if (a.flags.snow) extras.push("🥾");
    if (a.flags.cold && feels > -2) extras.push("🧢");
  
    let line = `🧥 ${base}`;
    if (extras.length > 0) line += ` · ${extras.join(" ")}`;
  
    return line;
  }
  
  function buildWalkAdvice(weather) {
    const a = weather.analysis;
  
    if (a.flags.thunder) return "не выходи";
    if (a.flags.veryWindy) return "ненадолго на улице";
    if (a.flags.umbrella && a.nextRain) return buildWalkAroundRain(a.nextRain);
    if (a.walkWindow) {
      return `можно ${formatHourRange(a.walkWindow.start, a.walkWindow.end)}`;
    }
    if (a.flags.hot) return "в тени лучше";
    if (a.flags.cold) return "ненадолго на улице";
    if (a.flags.windy) return "без открытых мест";
  
    return "";
  }
  
  function buildWalkAroundRain(nextRain) {
    const now = Date.now();
    const start = nextRain.start.getTime();
    const end = nextRain.end.getTime();
    const startH = two(nextRain.start.getHours());
    const endH = two(nextRain.end.getHours());
  
    if (now >= start && now < end) return `после ${endH}:00`;
    if (now < start) return `до ${startH}:00`;
  
    return "";
  }
  
  function buildExtraAdvice(weather) {
    const c = weather.current;
    const a = weather.analysis;
    const items = [];
  
    if (a.flags.humid) items.push("сыро");
    if (a.flags.dry) items.push("сухо");
    if (a.flags.lowPressure) items.push(`${round(c.pressureMmHg)}↓`);
    if (a.flags.highPressure) items.push(`${round(c.pressureMmHg)}↑`);
    if (c.cloudCover >= 85) items.push("пасмурно");
    if (a.flags.uv) items.push(`UV ${round(a.maxUv)}`);
  
    return items.length === 0 ? "всё спокойно" : items.join(" · ");
  }
  
  function findNextRain(hours) {
    let start = null;
    let end = null;
  
    for (let i = 0; i < hours.length; i++) {
      const h = hours[i];
      const rainy = h.rainProbability >= CONFIG.thresholds.rainProbability ||
        h.precipitation > 0.1 ||
        isRainCode(h.weatherCode) ||
        isSnowCode(h.weatherCode) ||
        isThunderCode(h.weatherCode);
  
      if (rainy && start === null) {
        start = h.date;
        end = new Date(h.date.getTime() + 60 * 60 * 1000);
      } else if (rainy && start !== null) {
        end = new Date(h.date.getTime() + 60 * 60 * 1000);
      } else if (!rainy && start !== null) {
        break;
      }
    }
  
    if (!start) return null;
    return { start, end };
  }
  
  function findBestWalkWindow(hours) {
    const good = hours.map(h => {
      const rainRisk = h.rainProbability >= CONFIG.thresholds.rainProbability || h.precipitation > 0.1;
      const badWind = h.windSpeed >= CONFIG.thresholds.strongWind || h.windGusts >= CONFIG.thresholds.veryStrongWind;
      const tooCold = h.feelsLike <= CONFIG.thresholds.coldFeelsLike;
      const tooHot = h.feelsLike >= CONFIG.thresholds.hotFeelsLike;
      return !rainRisk && !badWind && !tooCold && !tooHot;
    });
  
    let bestStart = -1;
    let bestLen = 0;
    let currentStart = -1;
    let currentLen = 0;
  
    for (let i = 0; i < good.length; i++) {
      if (good[i]) {
        if (currentStart === -1) currentStart = i;
        currentLen++;
  
        if (currentLen > bestLen) {
          bestLen = currentLen;
          bestStart = currentStart;
        }
      } else {
        currentStart = -1;
        currentLen = 0;
      }
    }
  
    if (bestStart === -1 || bestLen < 2) return null;
  
    const len = Math.min(bestLen, 3);
    return {
      start: hours[bestStart].date,
      end: new Date(hours[bestStart + len - 1].date.getTime() + 60 * 60 * 1000)
    };
  }
  
  function hasCurrentRain(c) {
    return c.precipitation > 0 || c.rain > 0 || c.showers > 0 || c.snowfall > 0;
  }
  
  // ============================================================
  // Canvas
  // ============================================================
  
  function drawWidgetImage(weather, sizeName) {
    const size = CANVAS[sizeName];
    const ctx = new DrawContext();
  
    ctx.size = new Size(size.w, size.h);
    ctx.opaque = false;
    ctx.respectScreenScale = true;
  
    const visual = getVisualTheme(weather);
  
    drawBackground(ctx, size.w, size.h, visual);
    drawDecor(ctx, size.w, size.h, visual, sizeName);
  
    if (sizeName === "mini") drawMini(ctx, weather, visual);
    else drawNormal(ctx, weather, visual);
  
    return ctx.getImage();
  }
  
  function getVisualTheme(weather) {
    const c = weather.current;
    const a = weather.analysis;
    const summary = weather.summary;
    const code = c.weatherCode;
  
    let top = c.isDay ? CONFIG.ui.bgDayTop : CONFIG.ui.bgNightTop;
    let bottom = c.isDay ? CONFIG.ui.bgDayBottom : CONFIG.ui.bgNightBottom;
    let accent = CONFIG.ui.good;
  
    if (isRainCode(code) || a.flags.umbrella) {
      top = CONFIG.ui.bgRainTop;
      bottom = CONFIG.ui.bgRainBottom;
      accent = CONFIG.ui.rain;
    }
  
    if (isSnowCode(code)) {
      top = CONFIG.ui.bgSnowTop;
      bottom = CONFIG.ui.bgSnowBottom;
      accent = CONFIG.ui.snow;
    }
  
    if (summary.priority === "cold") accent = CONFIG.ui.cold;
    if (summary.priority === "hot") accent = CONFIG.ui.hot;
    if (summary.priority === "warning") accent = CONFIG.ui.warning;
    if (summary.priority === "bad") accent = CONFIG.ui.bad;
  
    return { top, bottom, accent, icon: describeWeatherCode(code, c.isDay).icon };
  }
  
  function drawNormal(ctx, weather, visual) {
    const w = CANVAS.normal.w;
    const pad = 24;
    const c = weather.current;
    const s = weather.summary;
  
    const tempW = 200;
    const rightX = pad + tempW + 24;
    const rightW = w - rightX - pad;
  
    drawText(ctx, `${visual.icon} ${truncate(weather.location.name, 22)}`, pad, 22, 26, CONFIG.ui.text, "bold");
    drawStatusDot(ctx, w - pad - 12, 30, visual.accent);
    drawText(ctx, getStatusPillText(weather), w - pad - 88, 24, 14, visual.accent, "bold");
  
    drawText(ctx, `${signedRound(c.temperature)}°`, pad, 58, 76, CONFIG.ui.text, "heavy");
    drawText(ctx, `как ${signedRound(c.feelsLike)}°`, pad, 132, 23, CONFIG.ui.soft, "medium");
  
    drawTextInRect(ctx, s.main, rightX, 58, rightW, 50, 27, visual.accent, "bold");
  
    const panelLines = buildAdviceLines(s, 52);
    const panelH = panelHeight(panelLines, 28, 14);
    drawAdvicePanel(ctx, rightX, CANVAS.normal.h - pad - panelH, rightW, panelH, panelLines, 28, 18);
  }
  
  function drawMini(ctx, weather, visual) {
    const w = CANVAS.mini.w;
    const h = CANVAS.mini.h;
    const pad = 22;
    const innerW = w - pad * 2;
    const c = weather.current;
    const s = weather.summary;
  
    drawText(ctx, truncate(weather.location.name, 18), pad, 22, 15, CONFIG.ui.soft, "medium");
    drawText(ctx, visual.icon, w - pad - 42, 14, 38, CONFIG.ui.text, "bold");
  
    ctx.setFillColor(colorWithAlpha(visual.accent, 0.14));
    ctx.fillEllipse(new Rect(pad - 8, 44, 150, 88));
  
    drawText(ctx, `${signedRound(c.temperature)}°`, pad, 52, 68, CONFIG.ui.text, "heavy");
    drawText(ctx, `как ${signedRound(c.feelsLike)}°`, pad, 125, 19, CONFIG.ui.soft, "medium");
  
    drawTextInRect(ctx, s.main, pad, 146, innerW, 58, 22, visual.accent, "bold");
  
    const panelLines = buildAdviceLines(s, 30);
    const panelH = panelHeight(panelLines, 26, 12);
    drawAdvicePanel(ctx, pad, h - pad - panelH, innerW, panelH, panelLines, 26, 17);
  }
  
  function buildAdviceLines(summary, maxLen) {
    const lines = [];
  
    if (cleanText(summary.wear)) lines.push(truncate(summary.wear, maxLen));
    if (cleanText(summary.walk)) lines.push(truncate(`🚶 ${summary.walk}`, maxLen));
  
    return lines;
  }
  
  function panelHeight(lines, lineStep, verticalPad) {
    const step = fs(lineStep);
    const pad = fs(verticalPad);
  
    if (lines.length === 0) return pad * 2 + step;
  
    return pad * 2 + lines.length * step;
  }
  
  function drawAdvicePanel(ctx, x, y, w, h, lines, lineStep, fontSize) {
    const step = fs(lineStep);
    const textSize = fs(fontSize);
  
    drawGlassCard(ctx, x, y, w, h, 18);
  
    if (lines.length === 0) return;
  
    let ly = y + fs(12);
  
    for (let i = 0; i < lines.length; i++) {
      const color = i === 0 ? CONFIG.ui.text : CONFIG.ui.soft;
      const weight = i === 0 ? "bold" : "medium";
  
      drawTextInRect(ctx, lines[i], x + 16, ly, w - 32, step, textSize, color, weight);
      ly += step;
    }
  }
  
  function drawGlassCard(ctx, x, y, w, h, radius) {
    drawRoundedRect(ctx, x, y, w, h, radius, colorWithAlpha(CONFIG.ui.card, CONFIG.ui.cardAlphaStrong));
    drawRoundedRect(ctx, x + 1, y + 1, w - 2, 1, radius, colorWithAlpha("#FFFFFF", CONFIG.ui.cardBorder));
  }
  
  function drawStatusDot(ctx, x, y, colorHex) {
    ctx.setFillColor(colorWithAlpha(colorHex, 0.95));
    ctx.fillEllipse(new Rect(x, y, 8, 8));
  }
  
  function drawBackground(ctx, w, h, visual) {
    drawVerticalGradient(ctx, 0, 0, w, h, visual.top, visual.bottom, 100);
    ctx.setFillColor(colorWithAlpha(visual.accent, 0.09));
    ctx.fillEllipse(new Rect(w * 0.58, -h * 0.72, w * 0.80, h * 1.35));
  }
  
  function drawDecor(ctx, w, h, visual, sizeName = "normal") {
    if (sizeName === "mini") {
      ctx.setFillColor(colorWithAlpha(visual.accent, 0.07));
      ctx.fillEllipse(new Rect(w - 70, -24, 110, 110));
      ctx.setFillColor(colorWithAlpha("#FFFFFF", CONFIG.ui.decorWhiteAlpha));
      ctx.fillEllipse(new Rect(-16, h - 56, 64, 64));
      return;
    }
  
    ctx.setFillColor(colorWithAlpha("#FFFFFF", CONFIG.ui.decorWhiteAlpha));
    ctx.fillEllipse(new Rect(w - 120, 32, 40, 40));
    ctx.fillEllipse(new Rect(w - 64, 78, 16, 16));
  
    ctx.setFillColor(colorWithAlpha(visual.accent, CONFIG.ui.decorColorAlpha));
    ctx.fillEllipse(new Rect(w - 180, h - 130, 120, 120));
  }
  
  function drawRoundedRect(ctx, x, y, w, h, r, color) {
    const path = new Path();
    path.addRoundedRect(new Rect(x, y, w, h), r, r);
    ctx.addPath(path);
    ctx.setFillColor(color);
    ctx.fillPath();
  }
  
  function fs(size) {
    const scale = CONFIG.ui.fontScale;
    const n = Number(scale);
  
    if (!Number.isFinite(n) || n <= 0) return Math.max(1, Math.round(size));
  
    return Math.max(1, Math.round(size * n));
  }
  
  function drawText(ctx, text, x, y, size, colorHex, weight = "regular") {
    ctx.setTextAlignedLeft();
    ctx.setTextColor(new Color(colorHex));
    ctx.setFont(makeFont(fs(size), weight));
    ctx.drawText(String(text), new Point(x, y));
  }
  
  function drawTextInRect(ctx, text, x, y, w, h, size, colorHex, weight = "regular") {
    ctx.setTextAlignedLeft();
    ctx.setTextColor(new Color(colorHex));
    ctx.setFont(makeFont(fs(size), weight));
    ctx.drawTextInRect(String(text), new Rect(x, y, w, h));
  }
  
  function drawVerticalGradient(ctx, x, y, w, h, topHex, bottomHex, steps) {
    const top = hexToRgb(topHex);
    const bottom = hexToRgb(bottomHex);
  
    for (let i = 0; i < steps; i++) {
      const t = i / Math.max(1, steps - 1);
      const r = Math.round(lerp(top.r, bottom.r, t));
      const g = Math.round(lerp(top.g, bottom.g, t));
      const b = Math.round(lerp(top.b, bottom.b, t));
  
      ctx.setFillColor(new Color(rgbToHex(r, g, b)));
      const yy = y + Math.floor((h / steps) * i);
      const hh = Math.ceil(h / steps) + 1;
      ctx.fillRect(new Rect(x, yy, w, hh));
    }
  }
  
  function makeFont(size, weight) {
    if (weight === "heavy") return Font.heavySystemFont(size);
    if (weight === "bold") return Font.boldSystemFont(size);
    if (weight === "medium") return Font.mediumSystemFont(size);
    return Font.systemFont(size);
  }
  
  // ============================================================
  // WMO-коды и короткие статусы
  // ============================================================
  
  function describeWeatherCode(code, isDay) {
    const sun = isDay ? "☀️" : "🌙";
  
    const map = {
      0: { icon: sun, text: "Ясно" },
      1: { icon: isDay ? "🌤" : "🌙", text: "Почти ясно" },
      2: { icon: "⛅️", text: "Переменная облачность" },
      3: { icon: "☁️", text: "Пасмурно" },
      45: { icon: "🌫", text: "Туман" },
      48: { icon: "🌫", text: "Изморозь / туман" },
      51: { icon: "🌦", text: "Слабая морось" },
      53: { icon: "🌦", text: "Морось" },
      55: { icon: "🌧", text: "Сильная морось" },
      56: { icon: "🌧", text: "Ледяная морось" },
      57: { icon: "🌧", text: "Сильная ледяная морось" },
      61: { icon: "🌧", text: "Слабый дождь" },
      63: { icon: "🌧", text: "Дождь" },
      65: { icon: "🌧", text: "Сильный дождь" },
      66: { icon: "🌧", text: "Ледяной дождь" },
      67: { icon: "🌧", text: "Сильный ледяной дождь" },
      71: { icon: "🌨", text: "Слабый снег" },
      73: { icon: "🌨", text: "Снег" },
      75: { icon: "❄️", text: "Сильный снег" },
      77: { icon: "❄️", text: "Снежные зёрна" },
      80: { icon: "🌦", text: "Слабый ливень" },
      81: { icon: "🌧", text: "Ливень" },
      82: { icon: "⛈", text: "Сильный ливень" },
      85: { icon: "🌨", text: "Слабый снегопад" },
      86: { icon: "❄️", text: "Сильный снегопад" },
      95: { icon: "⛈", text: "Гроза" },
      96: { icon: "⛈", text: "Гроза с градом" },
      99: { icon: "⛈", text: "Сильная гроза с градом" }
    };
  
    return map[code] || { icon: "🌡", text: "Погода" };
  }
  
  function shortWeatherText(text) {
    const map = {
      "Ясно": "ясно",
      "Почти ясно": "ясно",
      "Переменная облачность": "облачно",
      "Пасмурно": "пасмурно",
      "Туман": "туман",
      "Изморозь / туман": "туман",
      "Слабая морось": "морось",
      "Морось": "морось",
      "Сильная морось": "морось",
      "Слабый дождь": "дождь",
      "Дождь": "дождь",
      "Сильный дождь": "ливень",
      "Ледяной дождь": "гололёд",
      "Слабый снег": "снег",
      "Снег": "снег",
      "Сильный снег": "снег",
      "Снежные зёрна": "снег",
      "Слабый ливень": "ливень",
      "Ливень": "ливень",
      "Сильный ливень": "ливень",
      "Слабый снегопад": "снег",
      "Сильный снегопад": "снег",
      "Гроза": "гроза",
      "Гроза с градом": "гроза",
      "Сильная гроза с градом": "гроза"
    };
  
    return map[text] || String(text || "погода").toLowerCase();
  }
  
  function isRainCode(code) {
    return [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code);
  }
  
  function isSnowCode(code) {
    return [71, 73, 75, 77, 85, 86].includes(code);
  }
  
  function isThunderCode(code) {
    return [95, 96, 99].includes(code);
  }
  
  function getStatusPillText(weather) {
    const a = weather.analysis;
    const c = weather.current;
  
    if (weather.staleCache) return "кэш";
    if (a.flags.thunder) return "гроза";
    if (a.flags.veryWindy) return "ветер";
    if (a.flags.umbrella) return "зонт";
    if (a.flags.snow) return "снег";
    if (a.flags.cold) return "холод";
    if (a.flags.hot) return "жара";
    if (c.humidity >= CONFIG.thresholds.highHumidity) return "сыро";
  
    return "ок";
  }
  
  // ============================================================
  // Утилиты
  // ============================================================
  
  async function notify(title, body) {
    const n = new Notification();
    n.title = title;
    n.body = body;
    await n.schedule();
  }
  
  function errorMessage(error) {
    return String(error && error.message ? error.message : error);
  }
  
  function formatHourRange(start, end) {
    return `${two(start.getHours())}–${two(end.getHours())}`;
  }
  
  function formatHourRangeHuman(start, end) {
    return `с ${two(start.getHours())} до ${two(end.getHours())}`;
  }
  
  function two(n) {
    return String(n).padStart(2, "0");
  }
  
  function round(n) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  
    return Math.round(Number(n));
  }
  
  function signedRound(n) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  
    const r = Math.round(Number(n));
    return r > 0 ? `+${r}` : String(r);
  }
  
  function hpaToMmHg(hpa) {
    if (hpa === null || hpa === undefined || Number.isNaN(Number(hpa))) return 0;
  
    return Number(hpa) * 0.750062;
  }
  
  function max(values) {
    const arr = values
      .filter(x => x !== null && x !== undefined && Number.isFinite(Number(x)))
      .map(Number);
  
    return arr.length === 0 ? 0 : Math.max(...arr);
  }
  
  function min(values) {
    const arr = values
      .filter(x => x !== null && x !== undefined && Number.isFinite(Number(x)))
      .map(Number);
  
    return arr.length === 0 ? 0 : Math.min(...arr);
  }
  
  function getNumber(value, fallback) {
    const n = Number(value);
  
    return Number.isFinite(n) ? n : fallback;
  }
  
  function normalizeCommaNumber(value) {
    return String(value || "").replace(",", ".");
  }
  
  function cleanText(value) {
    if (value === undefined || value === null) return "";
  
    return String(value).trim();
  }
  
  function formatCoord(value) {
    return Number(value).toFixed(4);
  }
  
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  
  function colorWithAlpha(hex, alpha) {
    return new Color(hex, alpha);
  }
  
  function hexToRgb(hex) {
    const clean = hex.replace("#", "");
  
    return {
      r: parseInt(clean.substring(0, 2), 16),
      g: parseInt(clean.substring(2, 4), 16),
      b: parseInt(clean.substring(4, 6), 16)
    };
  }
  
  function rgbToHex(r, g, b) {
    return "#" + toHex(r) + toHex(g) + toHex(b);
  }
  
  function toHex(n) {
    return Math.max(0, Math.min(255, n))
      .toString(16)
      .padStart(2, "0");
  }
  
  function truncate(text, maxLen) {
    const s = String(text || "");
  
    if (s.length <= maxLen) return s;
  
    return s.slice(0, Math.max(0, maxLen - 1)).trimEnd() + "…";
  }