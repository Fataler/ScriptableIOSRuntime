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
      latitude: 60.068857,
      longitude: 30.313631,
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
    debug: {
      enabled: false,
      scenario: "auto",
      forceSize: "",
      showLabel: false
    },
  
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
      bgNightTop: "#161A2A",
      bgNightBottom: "#0C1020",
      bgDayTop: "#3B5878",
      bgDayBottom: "#18263D",
      bgRainTop: "#2F4358",
      bgRainBottom: "#121B2D",
      bgSnowTop: "#536983",
      bgSnowBottom: "#1B2438",
  
      text: "#F7F8FC",
      soft: "#E7ECF6",
      muted: "#BEC8D8",
      faint: "#95A1B6",
  
      good: "#DCE8F8",
      warning: "#F5D38A",
      bad: "#FF9F8D",
      cold: "#B8D7FF",
      hot: "#FFC98A",
      rain: "#A9C9FF",
      snow: "#EAF3FF",
  
      card: "#FFFFFF",
      cardAlpha: 0.08,
      cardAlphaStrong: 0.12,
      cardBorder: 0.10,
  
      decorWhiteAlpha: 0.012,
      decorColorAlpha: 0.022,

      scale: {
        mini: 1.22,
        normal: 1.1
      }
    }
  };
  
  const CANVAS = {
    mini: { w: 320, h: 320 },
    normal: { w: 680, h: 320 }
  };

  let RUNTIME = {
    debugScenario: "",
    forcedSize: "",
    nowDate: null,
    debugBounds: false
  };
  
  await main();
  
  async function main() {
    try {
      const settings = await loadSettings();
      const runtime = resolveRuntimeOptions();
      RUNTIME = runtime;
      const weather = applyDebugScenario(await getWeatherWithCache(settings), runtime.debugScenario);
  
      if (!config.runsInWidget) {
        await showMenu(weather, settings, runtime);
        Script.complete();
        return;
      }
  
      const widget = await createWidget(weather, settings, runtime.forcedSize);
      Script.setWidget(widget);
      Script.complete();
    } catch (error) {
      const settings = await loadSettingsSafe();
      const runtime = resolveRuntimeOptions();
      RUNTIME = runtime;
      const widget = await createErrorWidget(error, settings, runtime.forcedSize);
  
      if (config.runsInWidget) Script.setWidget(widget);
      else await widget.presentMedium();
  
      Script.complete();
    }
  }
  
  // ============================================================
  // Меню
  // ============================================================
  
  async function showMenu(weather, settings, runtime = resolveRuntimeOptions()) {
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
      `${s.practical}\n` +
      (s.extra ? `${s.extra}\n` : "") +
      (runtime.debugScenario ? `\nDEBUG: ${runtime.debugScenario}` : "");
  
    a.addAction("👀 Normal 2x1");
    a.addAction("👀 Mini 1x1");
    a.addAction("🌐 Открыть погоду");
    a.addAction("📍 Моё место сейчас");
    a.addAction(settings.locationMode === "auto" ? "🛰 Авто-локация: выкл" : "🛰 Авто-локация: вкл");
    a.addAction("✍️ Место вручную");
    a.addAction("🏠 Сброс на СПб");
    a.addAction("🔄 Обновить");
  
    if (CONFIG.showDebugInManualRun) {
      a.addAction("🧪 Debug preset");
      a.addAction("🧾 JSON в консоль");
    }
  
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
      const scenarios = ["calm", "rain_now", "rain_soon", "snow", "wind", "hot"];
      const b = new Alert();
      b.title = "Debug preset";
      scenarios.forEach(x => b.addAction(x));
      b.addCancelAction("Отмена");
      const picked = await b.presentSheet();
      if (picked >= 0 && picked < scenarios.length) {
        const debugWeather = applyDebugScenario(weather, scenarios[picked]);
        await previewFresh(debugWeather, settings);
      }
      return;
    }

    if (CONFIG.showDebugInManualRun && choice === 9) {
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
    const runtime = resolveRuntimeOptions();
    const sizeName = runtime.forcedSize || CONFIG.previewSize;
    const widget = await createWidget(applyDebugScenario(weather, runtime.debugScenario), settings, sizeName);
    if (sizeName === "mini") await widget.presentSmall();
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
    widget.refreshAfterDate = new Date(runtimeNowMs() + CONFIG.refreshEveryMinutes * 60 * 1000);
  
    return widget;
  }
  
  function resolveWidgetSize() {
    const runtime = resolveRuntimeOptions();
    if (runtime.forcedSize) return runtime.forcedSize;
    if (CONFIG.widgetSize === "mini") return "mini";
    if (CONFIG.widgetSize === "normal") return "normal";
    if (!config.runsInWidget) return CONFIG.previewSize === "mini" ? "mini" : "normal";
    return config.widgetFamily === "small" ? "mini" : "normal";
  }
  
  async function createErrorWidget(error, settings, forcedSize = null) {
    const sizeName = forcedSize || resolveWidgetSize();
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
    widget.refreshAfterDate = new Date(runtimeNowMs() + 15 * 60 * 1000);
  
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
  
    return normalizeWeather(raw, runtimeNow().toISOString(), false, false, loc);
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
    const hourly = extractNextHours(raw, runtimeNow(), CONFIG.forecastHours);
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

  function resolveRuntimeOptions() {
    const params = args && args.queryParameters ? args.queryParameters : {};
    const cfg = CONFIG.debug || {};
    const debugScenario = cleanText(params.debug) || (cfg.enabled ? cleanText(cfg.scenario) : "");
    const size = cleanText(params.size) || cleanText(cfg.forceSize);
    const forcedSize = size === "mini" || size === "normal" ? size : "";
    const nowDate = parseRuntimeDate(cleanText(params.now));
    const debugBounds = cleanText(params.debug_bounds) === "1" || cleanText(params.debug_bounds).toLowerCase() === "true";

    return {
      debugScenario: debugScenario && debugScenario !== "auto" ? debugScenario : "",
      forcedSize,
      nowDate,
      debugBounds
    };
  }

  function parseRuntimeDate(value) {
    if (!value) return null;
    const dt = new Date(value);
    return isNaN(dt.getTime()) ? null : dt;
  }

  function runtimeNow() {
    return RUNTIME.nowDate ? new Date(RUNTIME.nowDate.getTime()) : new Date();
  }

  function runtimeNowMs() {
    return runtimeNow().getTime();
  }

  function applyDebugScenario(weather, scenario) {
    const key = cleanText(scenario).toLowerCase();
    if (!key) return weather;

    const preset = buildDebugPreset(key);
    if (!preset) return weather;

    const clone = JSON.parse(JSON.stringify(weather));
    clone.current.temperature = preset.temperature;
    clone.current.feelsLike = preset.feelsLike;
    clone.current.weatherCode = preset.weatherCode;
    clone.current.isDay = preset.isDay;
    clone.current.windSpeed = preset.windSpeed;
    clone.current.windGusts = preset.windGusts;
    clone.current.humidity = preset.humidity;
    clone.current.precipitation = preset.precipitation;
    clone.current.rain = preset.rain;
    clone.current.snowfall = preset.snowfall;
    clone.hourly = buildDebugHourly(preset);
    clone.analysis = analyzeWeather(clone);
    clone.summary = buildSummary(clone);
    clone.debugScenario = key;
    return clone;
  }

  function buildDebugPreset(key) {
    const map = {
      calm: { temperature: 11, feelsLike: 9, weatherCode: 3, isDay: 0, windSpeed: 3, windGusts: 5, humidity: 68, precipitation: 0, rain: 0, snowfall: 0 },
      rain_now: { temperature: 8, feelsLike: 5, weatherCode: 63, isDay: 0, windSpeed: 4, windGusts: 7, humidity: 90, precipitation: 1.6, rain: 1.6, snowfall: 0 },
      rain_soon: { temperature: 12, feelsLike: 10, weatherCode: 2, isDay: 1, windSpeed: 3, windGusts: 5, humidity: 72, precipitation: 0, rain: 0, snowfall: 0, precipSoon: "rain" },
      snow: { temperature: -3, feelsLike: -7, weatherCode: 73, isDay: 1, windSpeed: 5, windGusts: 9, humidity: 86, precipitation: 0.8, rain: 0, snowfall: 0.8 },
      wind: { temperature: 6, feelsLike: 2, weatherCode: 2, isDay: 1, windSpeed: 10, windGusts: 15, humidity: 55, precipitation: 0, rain: 0, snowfall: 0 },
      hot: { temperature: 29, feelsLike: 31, weatherCode: 1, isDay: 1, windSpeed: 2, windGusts: 4, humidity: 42, precipitation: 0, rain: 0, snowfall: 0 }
    };

    return map[key] || null;
  }

  function buildDebugHourly(preset) {
    const now = runtimeNow();
    const items = [];

    for (let i = 0; i < CONFIG.forecastHours; i++) {
      const date = new Date(now.getTime() + i * 60 * 60 * 1000);
      const rainSoonHour = preset.precipSoon && i >= 2 && i <= 4;
      items.push({
        time: date.toISOString(),
        date,
        hour: date.getHours(),
        temperature: preset.temperature + (preset.isDay ? (i > 5 ? -1 : 0) : 0),
        feelsLike: preset.feelsLike + (preset.isDay ? (i > 5 ? -1 : 0) : 0),
        humidity: preset.humidity,
        rainProbability: rainSoonHour ? 70 : (preset.rain > 0 || preset.snowfall > 0 ? 80 : 5),
        precipitation: rainSoonHour ? 1.2 : preset.precipitation,
        rain: rainSoonHour && preset.precipSoon === "rain" ? 1.2 : preset.rain,
        snowfall: rainSoonHour && preset.precipSoon === "snow" ? 0.8 : preset.snowfall,
        weatherCode: rainSoonHour ? 63 : preset.weatherCode,
        cloudCover: preset.weatherCode === 0 ? 5 : 78,
        pressureHpa: 1013,
        pressureMmHg: hpaToMmHg(1013),
        windSpeed: preset.windSpeed,
        windDirection: 180,
        windGusts: preset.windGusts,
        uvIndex: preset.isDay ? (preset.temperature >= 25 ? 6 : 2) : 0,
        isDay: preset.isDay
      });
    }

    return items;
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
    const ageMs = runtimeNowMs() - new Date(cache.fetchedAt).getTime();
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
    const nowWindow = hours.slice(0, Math.min(hours.length, 2));
    const soonWindow = hours.slice(0, Math.min(hours.length, 6));
  
    const maxRainProbability = max(hours.map(x => x.rainProbability));
    const maxWind = max(hours.map(x => x.windSpeed));
    const maxGusts = max(hours.map(x => x.windGusts));
    const minFeels = min(hours.map(x => x.feelsLike));
    const maxFeels = max(hours.map(x => x.feelsLike));
    const maxUv = max(hours.map(x => x.uvIndex));
    const nowFlags = analyzeWindow(nowWindow);
    const soonFlags = analyzeWindow(soonWindow);
    const nextPrecip = findNextPrecip(hours);
  
    const flags = {
      rainingNow: hasCurrentRain(c) || isRainCode(c.weatherCode),
      umbrella: soonFlags.rain || hasCurrentRain(c),
      rainRisk: maxRainProbability >= CONFIG.thresholds.lightRainProbability,
      windy: nowFlags.wind || c.windSpeed >= CONFIG.thresholds.strongWind || c.windGusts >= CONFIG.thresholds.unpleasantGusts,
      veryWindy: nowFlags.veryWind || c.windSpeed >= CONFIG.thresholds.veryStrongWind || c.windGusts >= CONFIG.thresholds.veryStrongWind + 3,
      cold: c.feelsLike <= CONFIG.thresholds.coldFeelsLike,
      cool: c.feelsLike <= CONFIG.thresholds.coolFeelsLike || minFeels <= CONFIG.thresholds.coolFeelsLike,
      hot: c.feelsLike >= CONFIG.thresholds.hotFeelsLike,
      dry: c.humidity <= CONFIG.thresholds.lowHumidity,
      humid: c.humidity >= CONFIG.thresholds.highHumidity,
      uv: c.isDay && maxUv >= CONFIG.thresholds.highUv,
      snow: isSnowCode(c.weatherCode) || nowFlags.snow,
      thunder: isThunderCode(c.weatherCode) || nowFlags.thunder,
      lowPressure: c.pressureMmHg <= CONFIG.thresholds.pressureLowMmHg,
      highPressure: c.pressureMmHg >= CONFIG.thresholds.pressureHighMmHg
    };
  
    return {
      maxRainProbability,
      maxWind,
      maxGusts,
      minFeels,
      maxFeels,
      maxUv,
      nextPrecip,
      flags,
      nowFlags,
      soonFlags
    };
  }
  
  function buildSummary(weather) {
    const c = weather.current;
    const a = weather.analysis;
    const desc = describeWeatherCode(c.weatherCode, c.isDay);

    let priority = "good";
    let main = shortWeatherText(desc.text);
    let detail = buildDetailLine(weather);
    let practical = buildPracticalLine(weather);

    if (weather.staleCache) {
      main = "кэш — обнови";
      detail = "данные могут быть неактуальны";
      practical = "обнови прогноз";
      priority = "warning";
    } else if (a.flags.thunder) {
      main = "⛈ гроза — лучше дома";
      priority = "bad";
    } else if (a.flags.veryWindy && a.flags.cold) {
      main = "💨 ветер и мороз";
      priority = "bad";
    } else if (a.flags.veryWindy) {
      main = "💨 сильный ветер";
      priority = "bad";
    } else if (a.flags.snow && a.flags.cold) {
      main = "🌨 снег и мороз";
      priority = "warning";
    } else if (a.nextPrecip && (a.nextPrecip.isNow || a.nextPrecip.startsSoon)) {
      const now = runtimeNowMs();
      const start = a.nextPrecip.start.getTime();
      const icon = precipitationIcon(a.nextPrecip.kind);
      const label = precipitationLabel(a.nextPrecip.kind);
      main = now >= start
        ? `${icon} ${label} до ${two(a.nextPrecip.end.getHours())}:00`
        : `${icon} ${label} ${formatHourRangeHuman(a.nextPrecip.start, a.nextPrecip.end)}`;
      priority = "warning";
    } else if (a.flags.windy && a.flags.cool) {
      main = "💨 ветрено и свежо";
      priority = "warning";
    } else if (a.flags.windy) {
      main = "💨 ветрено";
      priority = "warning";
    } else if (a.flags.cold) {
      main = "🥶 холодно";
      priority = "cold";
    } else if (a.flags.hot) {
      main = "🥵 жарко";
      priority = "hot";
    } else if (a.flags.rainRisk) {
      main = "🌦 дождь возможен";
      priority = "warning";
    }

    return {
      mode: summaryModeFromPriority(priority),
      priority,
      main,
      detail,
      wear: buildWearAdvice(weather),
      practical,
      extra: buildExtraAdvice(weather)
    };
  }
  
  function buildWearAdvice(weather) {
    const feels = weather.current.feelsLike;
    const c = weather.current;
    const a = weather.analysis;

    let base;

    if (feels <= -15) base = "Пуховик, шапка, перчатки";
    else if (feels <= -10) base = "Пуховик, шапка";
    else if (feels <= -2) base = "Куртка, шапка";
    else if (feels <= 7) base = "Куртка";
    else if (feels <= 14) base = "Худи";
    else if (feels <= 21) base = "Кофта";
    else if (feels <= 26) base = "Футболка";
    else base = "Лёгкая одежда";

    const mods = [];
    if (a.nextPrecip && a.nextPrecip.startsSoon) mods.push(precipitationIcon(a.nextPrecip.kind));
    if (a.flags.windy && c.windSpeed >= 5 && feels < c.temperature - 3) mods.push("ветрозащита");
    if (a.flags.uv) mods.push("SPF");
    if (weather.analysis.soonFlags.hot) mods.push("вода");
    if (a.nextPrecip && (a.nextPrecip.kind === "snow" || a.nextPrecip.kind === "mixed")) mods.push("непромокаемая обувь");

    let line = `🧥 ${base}`;
    if (mods.length > 0) line += ` · ${mods.join(" ")}`;

    return line;
  }
  
  function buildExtraAdvice(weather) {
    const a = weather.analysis;
    const items = [];

    if (a.soonFlags.hot && !a.flags.hot) items.push("позже теплее");
    if (a.soonFlags.cold && !a.flags.cold) items.push("позже холоднее");
    if (a.soonFlags.wind && !a.flags.windy) items.push("позже ветер");
    if (a.flags.humid) items.push("влажный воздух");
    if (a.flags.dry) items.push("сухой воздух");

    return items.join(" · ");
  }

  function buildPracticalLine(weather) {
    const a = weather.analysis;
    const next = a.nextPrecip;

    if (a.flags.thunder) return "⛈ Лучше дома";
    if (a.flags.veryWindy && a.flags.cold) return "🥶💨 Лучше дома";
    if (next && next.isNow) return `${precipitationIcon(next.kind)} до ${two(next.end.getHours())}:00`;
    if (next && next.startsSoon) return `${precipitationIcon(next.kind)} с ${two(next.start.getHours())}:00`;
    if (a.flags.veryWindy) return "💨 Сильный ветер";
    if (a.flags.snow) return "🌨 Скользко";
    if (a.flags.hot && a.flags.uv) return "☀️ Тень и SPF";
    if (a.flags.hot) return "💧 Возьми воду";
    if (a.flags.cold) return "🥶 Прохладно";
    if (a.flags.humid) return "💦 Влажно";
    if (a.flags.dry) return "🌵 Сухо";

    return "✨ Всё ок";
  }
  
  function analyzeWindow(hours) {
    return {
      rain: hours.some(h => isWetHour(h)),
      snow: hours.some(h => isSnowCode(h.weatherCode) || getNumber(h.snowfall, 0) > 0),
      thunder: hours.some(h => isThunderCode(h.weatherCode)),
      wind: hours.some(h => getNumber(h.windSpeed, 0) >= CONFIG.thresholds.strongWind || getNumber(h.windGusts, 0) >= CONFIG.thresholds.unpleasantGusts),
      veryWind: hours.some(h => getNumber(h.windSpeed, 0) >= CONFIG.thresholds.veryStrongWind || getNumber(h.windGusts, 0) >= CONFIG.thresholds.veryStrongWind + 3),
      cold: hours.some(h => getNumber(h.feelsLike, 99) <= CONFIG.thresholds.coldFeelsLike),
      hot: hours.some(h => getNumber(h.feelsLike, -99) >= CONFIG.thresholds.hotFeelsLike)
    };
  }

  function findNextPrecip(hours) {
    let start = null;
    let end = null;
    let kind = "";
  
    for (let i = 0; i < hours.length; i++) {
      const h = hours[i];
      const rainy = isWetHour(h);
  
      if (rainy && start === null) {
        start = h.date;
        end = new Date(h.date.getTime() + 60 * 60 * 1000);
        kind = precipitationKind(h);
      } else if (rainy && start !== null) {
        end = new Date(h.date.getTime() + 60 * 60 * 1000);
        kind = mergePrecipitationKinds(kind, precipitationKind(h));
      } else if (!rainy && start !== null) {
        break;
      }
    }
  
    if (!start) return null;

    const now = runtimeNowMs();
    return {
      start,
      end,
      kind,
      isNow: now >= start.getTime() && now < end.getTime(),
      startsSoon: start.getTime() - now <= 3 * 60 * 60 * 1000
    };
  }
  
  function buildDetailLine(weather) {
    const a = weather.analysis;

    if (a.nextPrecip && !a.nextPrecip.isNow && a.nextPrecip.startsSoon) {
      return `${precipitationIcon(a.nextPrecip.kind)} ${precipitationLabel(a.nextPrecip.kind)} ${formatHourRangeHuman(a.nextPrecip.start, a.nextPrecip.end)}`;
    }

    if (a.soonFlags.veryWind && !a.flags.veryWindy) return "позже усилится ветер";
    if (a.soonFlags.hot && !a.flags.hot) return "днём станет жарче";
    if (a.soonFlags.cold && !a.flags.cold) return "позже станет холоднее";

    return "без резких перемен";
  }

  function summaryModeFromPriority(priority) {
    if (priority === "bad") return "alert";
    if (priority === "warning" || priority === "cold" || priority === "hot") return "change";
    return "calm";
  }

  function isWetHour(h) {
    return getNumber(h.rainProbability, 0) >= CONFIG.thresholds.rainProbability ||
      getNumber(h.precipitation, 0) > 0.1 ||
      isRainCode(h.weatherCode) ||
      isSnowCode(h.weatherCode) ||
      isThunderCode(h.weatherCode);
  }

  function precipitationKind(h) {
    if (isThunderCode(h.weatherCode)) return "thunder";
    if (isSnowCode(h.weatherCode) || getNumber(h.snowfall, 0) > 0) return "snow";
    if ((isRainCode(h.weatherCode) || getNumber(h.rain, 0) > 0) && getNumber(h.snowfall, 0) > 0) return "mixed";
    if (isRainCode(h.weatherCode) || getNumber(h.rain, 0) > 0 || getNumber(h.precipitation, 0) > 0) return "rain";
    return "rain";
  }

  function mergePrecipitationKinds(a, b) {
    if (!a) return b;
    if (a === b) return a;
    if (a === "thunder" || b === "thunder") return "thunder";
    return "mixed";
  }

  function precipitationIcon(kind) {
    if (kind === "thunder") return "⛈";
    if (kind === "snow") return "🌨";
    if (kind === "mixed") return "🌨";
    return "🌧";
  }

  function precipitationLabel(kind) {
    if (kind === "thunder") return "гроза";
    if (kind === "snow") return "снег";
    if (kind === "mixed") return "осадки";
    return "дождь";
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

    drawDebugBounds(ctx, sizeName);
    drawDebugLabel(ctx, weather, sizeName);
  
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
  
    const blobAlpha = summary.mode === "alert" ? 0.075 : (summary.mode === "change" ? 0.06 : 0.045);
    const decorAlpha = summary.mode === "alert" ? CONFIG.ui.decorColorAlpha + 0.008 : CONFIG.ui.decorColorAlpha;

    return {
      top,
      bottom,
      accent,
      icon: describeWeatherCode(code, c.isDay).icon,
      mode: summary.mode,
      blobAlpha,
      decorAlpha
    };
  }
  
  function drawNormal(ctx, weather, visual) {
    const w = CANVAS.normal.w;
    const h = CANVAS.normal.h;
    const pad = 28;
    const c = weather.current;
    const s = weather.summary;

    const tempW = 232;
    const rightX = pad + tempW + 26;
    const rightW = w - rightX - pad;

    drawText(ctx, `${visual.icon} ${truncate(weather.location.name, 24)}`, pad, 22, 22, CONFIG.ui.soft, "medium", "normal");

    ctx.setFillColor(colorWithAlpha(visual.accent, 0.055));
    ctx.fillEllipse(new Rect(pad - 18, 48, 176, 98));

    drawText(ctx, `${signedRound(c.temperature)}°`, pad, 54, 70, CONFIG.ui.text, "heavy", "normal");
    drawText(ctx, `ощущается как ${signedRound(c.feelsLike)}°`, pad + 2, 128, 17, CONFIG.ui.muted, "medium", "normal");

    drawTextInRect(ctx, s.main, rightX, 54, rightW, 34, 23, CONFIG.ui.text, "bold", "normal");
    drawTextInRect(ctx, truncate(s.detail, 36), rightX, 92, rightW, 28, 17, CONFIG.ui.muted, "medium", "normal");

    const panelLines = buildAdviceLines(s, "normal");
    const panelH = panelHeight(panelLines, 22, 14, "normal");
    drawAdvicePanel(ctx, rightX, h - pad - panelH, rightW, panelH, panelLines, 22, 15, "normal");
  }
  
  function drawMini(ctx, weather, visual) {
    const w = CANVAS.mini.w;
    const h = CANVAS.mini.h;
    const pad = 22;
    const innerW = w - pad * 2;
    const c = weather.current;
    const s = weather.summary;

    drawText(ctx, `${visual.icon} ${truncate(weather.location.name, 16)}`, pad, 18, 18, CONFIG.ui.soft, "medium", "mini");

    ctx.setFillColor(colorWithAlpha(visual.accent, 0.05));
    ctx.fillEllipse(new Rect(pad - 8, 46, 142, 82));

    drawText(ctx, `${signedRound(c.temperature)}°`, pad, 48, 72, CONFIG.ui.text, "heavy", "mini");
    drawText(ctx, `как ${signedRound(c.feelsLike)}°`, pad + 2, 132, 19, CONFIG.ui.muted, "medium", "mini");

    drawTextInRect(ctx, truncate(s.main, 18), pad, 162, innerW, 34, 22, CONFIG.ui.text, "bold", "mini");

    const panelLines = buildAdviceLines(s, "mini");
    const panelH = panelHeight(panelLines, 24, 12, "mini");
    drawAdvicePanel(ctx, pad, h - pad - panelH, innerW, panelH, panelLines, 24, 17, "mini");
  }
  
  function buildAdviceLines(summary, sizeName) {
    const lines = [];
    const maxLen = sizeName === "mini" ? 22 : 42;

    if (cleanText(summary.wear)) {
      const wearLine = sizeName === "mini" ? compactMiniWearLine(summary.wear, maxLen) : truncate(summary.wear, maxLen);
      lines.push(wearLine);
    }
    if (cleanText(summary.practical)) {
      const practicalLine = sizeName === "mini" ? compactMiniPracticalLine(summary.practical, maxLen) : truncate(summary.practical, maxLen);
      lines.push(practicalLine);
    }
    if (sizeName !== "mini" && cleanText(summary.extra) && cleanText(summary.practical) !== "✨ Всё ок" && cleanText(summary.practical) !== "Всё ок") {
      lines.push(truncate(`✨ ${summary.extra}`, maxLen));
    }

    return lines;
  }
  
  function panelHeight(lines, lineStep, verticalPad, sizeName = "normal") {
    const step = fs(lineStep, sizeName);
    const pad = fs(verticalPad, sizeName);
  
    if (lines.length === 0) return pad * 2 + step;
  
    return pad * 2 + lines.length * step;
  }
  
  function drawAdvicePanel(ctx, x, y, w, h, lines, lineStep, fontSize, sizeName = "normal") {
    const step = fs(lineStep, sizeName);
  
    drawGlassCard(ctx, x, y, w, h, 18);
  
    if (lines.length === 0) return;
  
    let ly = y + fs(12, sizeName);
  
    for (let i = 0; i < lines.length; i++) {
      const color = i === 0 ? CONFIG.ui.text : CONFIG.ui.soft;
      const weight = i === 0 ? "medium" : "regular";
      const lineFontSize = getAdviceLineFontSize(lines[i], fontSize, sizeName);

      drawTextInRect(ctx, lines[i], x + 16, ly, w - 32, step, lineFontSize, color, weight, sizeName);
      ly += step;
    }
  }

  function compactMiniWearLine(text, maxLen) {
    const raw = cleanText(text).replace(/^🧥\s*/, "");
    const parts = raw.split(" · ");
    const baseMap = {
      "Пуховик, шапка, перчатки": "Пуховик + перчатки",
      "Пуховик, шапка": "Пуховик + шапка",
      "Куртка, шапка": "Куртка + шапка",
      "Лёгкая одежда": "Легко"
    };

    const base = baseMap[parts[0]] || parts[0];
    const mods = compactMiniWearMods(parts[1] || "");
    const withMods = mods ? `🧥 ${base} · ${mods}` : `🧥 ${base}`;

    if (withMods.length <= maxLen) return withMods;
    if (`🧥 ${base}`.length <= maxLen) return `🧥 ${base}`;
    return truncate(`🧥 ${base}`, maxLen);
  }

  function compactMiniWearMods(text) {
    const mods = cleanText(text)
      .replace(/непромокаемая обувь/gi, "сухая обувь")
      .replace(/ветрозащита/gi, "ветер")
      .replace(/вода/gi, "вода")
      .split(/\s+/)
      .filter(Boolean);

    const picked = [];

    for (const mod of mods) {
      if (picked.includes(mod)) continue;
      picked.push(mod);
      if (picked.join(" ").length >= 9) break;
    }

    return picked.join(" ");
  }

  function compactMiniPracticalLine(text, maxLen) {
    const raw = cleanText(text);
    const replacements = {
      "🥶💨 Лучше дома": "🏠 Лучше дома",
      "💨 Сильный ветер": "💨 Очень ветрено",
      "☀️ Тень и SPF": "☀️ Нужен SPF",
      "💧 Возьми воду": "💧 Возьми воду",
      "🥶 Прохладно": "🥶 Холодно"
    };

    const compact = replacements[raw] || raw;
    return compact.length <= maxLen ? compact : truncate(compact, maxLen);
  }

  function getAdviceLineFontSize(line, baseFontSize, sizeName) {
    if (sizeName !== "mini") return fs(baseFontSize, sizeName);
    if (String(line || "").length <= 18) return fs(baseFontSize, sizeName);
    if (String(line || "").length <= 22) return fs(baseFontSize - 1, sizeName);
    return fs(baseFontSize - 2, sizeName);
  }

  function drawDebugLabel(ctx, weather, sizeName) {
    const cfg = CONFIG.debug || {};
    const label = cleanText(weather && weather.debugScenario);
    if (!label || cfg.showLabel === false) return;

    const size = sizeName === "mini" ? 10 : 11;
    const x = sizeName === "mini" ? 22 : 28;
    const y = sizeName === "mini" ? CANVAS.mini.h - 18 : CANVAS.normal.h - 18;
    drawText(ctx, `DEBUG ${label}`, x, y, size, CONFIG.ui.faint, "medium", sizeName);
  }

  function drawDebugBounds(ctx, sizeName) {
    if (!RUNTIME.debugBounds) return;

    const color = new Color("#FF6B7A", 0.45);
    ctx.setStrokeColor(color);
    ctx.setLineWidth(2);

    if (sizeName === "mini") {
      strokeRect(ctx, 22, 18, 276, 24);
      strokeRect(ctx, 22, 46, 176, 96);
      strokeRect(ctx, 22, 162, 276, 32);
      strokeRect(ctx, 22, 212, 276, 86);
      return;
    }

    strokeRect(ctx, 28, 22, 360, 26);
    strokeRect(ctx, 28, 54, 232, 100);
    strokeRect(ctx, 286, 54, 366, 34);
    strokeRect(ctx, 286, 92, 366, 28);
    strokeRect(ctx, 286, 194, 366, 98);
  }

  function strokeRect(ctx, x, y, w, h) {
    if (typeof ctx.strokeRect === "function") {
      ctx.strokeRect(new Rect(x, y, w, h));
      return;
    }

    const path = new Path();
    path.addRoundedRect(new Rect(x, y, w, h), 0, 0);
    ctx.addPath(path);
    ctx.strokePath();
  }

  function drawGlassCard(ctx, x, y, w, h, radius) {
    drawRoundedRect(ctx, x, y, w, h, radius, colorWithAlpha(CONFIG.ui.card, CONFIG.ui.cardAlphaStrong));
    drawRoundedRect(ctx, x + 1, y + 1, w - 2, 1, radius, colorWithAlpha("#FFFFFF", CONFIG.ui.cardBorder));
  }
  
  function drawBackground(ctx, w, h, visual) {
    drawVerticalGradient(ctx, 0, 0, w, h, visual.top, visual.bottom, 100);
    ctx.setFillColor(colorWithAlpha(visual.accent, visual.blobAlpha || 0.09));
    ctx.fillEllipse(new Rect(w * 0.58, -h * 0.72, w * 0.80, h * 1.35));
  }
  
  function drawDecor(ctx, w, h, visual, sizeName = "normal") {
    if (sizeName === "mini") {
      ctx.setFillColor(colorWithAlpha(visual.accent, visual.blobAlpha || 0.07));
      ctx.fillEllipse(new Rect(w - 70, -24, 110, 110));
      ctx.setFillColor(colorWithAlpha("#FFFFFF", CONFIG.ui.decorWhiteAlpha));
      ctx.fillEllipse(new Rect(-16, h - 56, 64, 64));
      return;
    }
  
    ctx.setFillColor(colorWithAlpha("#FFFFFF", CONFIG.ui.decorWhiteAlpha));
    ctx.fillEllipse(new Rect(w - 120, 32, 40, 40));
    ctx.fillEllipse(new Rect(w - 64, 78, 16, 16));
  
    ctx.setFillColor(colorWithAlpha(visual.accent, visual.decorAlpha || CONFIG.ui.decorColorAlpha));
    ctx.fillEllipse(new Rect(w - 180, h - 130, 120, 120));
  }
  
  function drawRoundedRect(ctx, x, y, w, h, r, color) {
    const path = new Path();
    path.addRoundedRect(new Rect(x, y, w, h), r, r);
    ctx.addPath(path);
    ctx.setFillColor(color);
    ctx.fillPath();
  }
  
  function fs(size, sizeName = "normal") {
    const table = CONFIG.ui.scale || {};
    const scale = table[sizeName];
    const n = Number(scale);
  
    if (!Number.isFinite(n) || n <= 0) return Math.max(1, Math.round(size));
  
    return Math.max(1, Math.round(size * n));
  }
  
  function drawText(ctx, text, x, y, size, colorHex, weight = "regular", sizeName = "normal") {
    ctx.setTextAlignedLeft();
    ctx.setTextColor(new Color(colorHex));
    ctx.setFont(makeFont(fs(size, sizeName), weight));
    ctx.drawText(String(text), new Point(x, y));
  }
  
  function drawTextInRect(ctx, text, x, y, w, h, size, colorHex, weight = "regular", sizeName = "normal") {
    ctx.setTextAlignedLeft();
    ctx.setTextColor(new Color(colorHex));
    ctx.setFont(makeFont(fs(size, sizeName), weight));
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
