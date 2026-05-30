// ============================================================
// Baby Feeding Canvas Widget for Scriptable
// Виджет кормления ребёнка
//
//
// Тап по виджету = отметить кормление сейчас.
// ============================================================


// ============================================================
// 1. КОНФИГ
// ============================================================

const CONFIG = {
    // ----------------------------------------------------------
    // Размер виджета
    // ----------------------------------------------------------
    // "auto"   — small виджет iOS = mini, medium = normal
    // "mini"   — принудительно маленький 1x1
    // "normal" — принудительно средний 2x1
    widgetSize: "auto",
  
    // ----------------------------------------------------------
    // Ребёнок
    // ----------------------------------------------------------
    babyName: "Катя",
  
    // Интервал кормления в минутах:
    // 180 = 3 часа
    // 150 = 2.5 часа
    // 120 = 2 часа
    targetIntervalMinutes: 180,
  
    // Ночной интервал (null = как днём). Активен между nightHoursStart и nightHoursEnd.
    nightIntervalMinutes: 240,
    nightHoursStart: 22,
    nightHoursEnd: 7,
  
    // За сколько минут до кормления статус становится жёлтым
    warningMinutesBefore: 35,
  
    // Что записывается по тапу на виджет
    defaultAmountMl: 30,
    defaultFeedType: "грудь+смесь",
  
    // ----------------------------------------------------------
    // Хранилище
    // ----------------------------------------------------------
    // "googleAppsScript" — общий JSON через Google Apps Script (оба телефона)
    // "local" — только файлы Scriptable (+ опционально iCloud Drive ниже)
    storageBackend: "googleAppsScript",
    gasUrl: "https://script.google.com/macros/s/AKfycbzhYoCHE-YjvN8CAqSiuivdW-zvgAp3DOG5lUEYS_i5Jv2qz_6ysYiPgG8oJQuFZLHdog/exec",
    gasKey: "DOWEN",
    gasTimeoutSeconds: 15,

    storageLocation: "scriptable",
    syncToSharedFolder: false,
    dataFolder: "BabyWidgets",
    dataFile: "feeding-canvas-data.json",
  
    // Сколько записей хранить в истории
    keepLastRecords: 500,
  
    // Показывать уведомление после тапа
    showNotificationAfterTap: true,
  
    // ----------------------------------------------------------
    // Внешний вид
    // ----------------------------------------------------------
    ui: {
      bgTop: "#251247",
      bgBottom: "#090B1F",
  
      text: "#FFFFFF",
      muted: "#B9B6CC",
      faint: "#7E7894",
  
      good: "#7CF2C3",
      soon: "#FFD166",
      late: "#FF657A",
      empty: "#9EA7FF",
  
      card: "#FFFFFF",
      cardAlpha: 0.10,
  
      barBg: "#FFFFFF",
      barBgAlpha: 0.16,
  
      decorWhiteAlpha: 0.035,
      decorColorAlpha: 0.045
    },
  
    // Предпросмотр при запуске из Scriptable
    previewSize: "normal",
  
    // Отладка вёрстки в Scriptable (preview: ?debug=soon в URL)
    // scenario: "empty" | "ok" | "soon" | "late"
    debug: {
      debugSize : false,
      enabled: false,
      scenario: "soon",
      todayCount: 5,
      todayMl: 150,
      showLabel: true
    }
  };
  
  
  // ============================================================
  // 2. CANVAS-РАЗМЕРЫ
  // ============================================================
  
  const CANVAS = {
    mini: {
      w: 320,
      h: 320
    },
  
    normal: {
      w: 680,
      h: 320
    }
  };
  
  
  // ============================================================
  // 3. ЗАПУСК
  // ============================================================
  
  await main();
  
  async function main() {
    let data = await loadData();
  
    const params = args.queryParameters || {};
    const action = params.action || "";
  
    if (action === "feed") {
      const amount = getNumber(params.amount, CONFIG.defaultAmountMl);
      const type = cleanText(params.type) || CONFIG.defaultFeedType;
  
      addFeeding(data, {
        date: new Date(),
        amountMl: amount,
        type: type,
        source: "widget_tap"
      });
  
      await saveData(data);
  
      if (CONFIG.showNotificationAfterTap) {
        await notify(
          "Кормление отмечено",
          `${formatClock(new Date())} · ${amount} мл · ${type}`
        );
      }
  
      Script.complete();
      return;
    }
  
    if (!config.runsInWidget) {
      await showMenu(data);
      Script.complete();
      return;
    }
  
    const widget = await createWidget(data);
    Script.setWidget(widget);
    Script.complete();
  }
  
  
  // ============================================================
  // 4. МЕНЮ ПРИ РУЧНОМ ЗАПУСКЕ
  // ============================================================
  
  async function showHistory(data) {
    const feedings = (data.feedings || []).slice().sort((a, b) => new Date(b.at) - new Date(a.at));
    if (feedings.length === 0) {
      await notify("История пуста", "Нет записей кормления");
      return;
    }
  
    const recent = feedings.slice(0, 10);
    const a = new Alert();
    a.title = "История последних 10 записей";
    a.message = "Выберите запись для действия";
    recent.forEach((item, idx) => {
      const dateStr = formatClock(new Date(item.at));
      const label = `${dateStr} · ${item.amountMl} мл · ${item.type || CONFIG.defaultFeedType}`;
      a.addAction(label);
    });
    a.addCancelAction("Закрыть");
  
    const choice = await a.presentSheet();
    if (choice < 0 || choice >= recent.length) return; // cancelled
  
    const selected = recent[choice];
    // Find actual index in original array
    const actualIdx = data.feedings.findIndex(f => f.at === selected.at && f.amountMl === selected.amountMl && f.type === selected.type);
  
    const actAlert = new Alert();
    actAlert.title = "Действие над записью";
    actAlert.message = `${formatClock(new Date(selected.at))} · ${selected.amountMl} мл · ${selected.type || CONFIG.defaultFeedType}`;
    actAlert.addAction("Редактировать");
    actAlert.addAction("Удалить");
    actAlert.addCancelAction("Отмена");
    const actChoice = await actAlert.presentSheet();
    if (actChoice === 0) {
      await editFeedingAt(data, actualIdx);
    } else if (actChoice === 1) {
      await deleteFeedingAt(data, actualIdx);
    }
  }
  
  // Edit a feeding entry at a given index
  async function editFeedingAt(data, idx) {
    if (idx < 0 || idx >= (data.feedings || []).length) return false;
    const item = data.feedings[idx];
    const current = new Date(item.at);
  
    const a = new Alert();
    a.title = "Редактировать запись";
    a.message = `Текущие значения: ${formatClock(current)} · ${item.amountMl} мл · ${item.type || CONFIG.defaultFeedType}`;
    a.addTextField("Дата ДД.MM.YYYY", formatDateInput(current));
    a.addTextField("Время ЧЧ:ММ", formatClock(current));
    a.addTextField("Объём, мл", String(item.amountMl));
    a.addTextField("Тип", item.type || CONFIG.defaultFeedType);
    a.addAction("Сохранить");
    a.addCancelAction("Отмена");
    const res = await a.presentAlert();
    if (res === -1) return false;
  
    const when = parseDateTimeFields(a.textFieldValue(0), a.textFieldValue(1));
    if (!when) { await notify("Не сохранено", "Неверная дата/время"); return false; }
    const amountMl = getNumber(normalizeCommaNumber(a.textFieldValue(2)), NaN);
    if (!Number.isFinite(amountMl) || amountMl < 0) { await notify("Не сохранено", "Объём должен быть числом ≥ 0"); return false; }
  
    item.at = when.toISOString();
    item.amountMl = amountMl;
    item.type = cleanText(a.textFieldValue(3)) || CONFIG.defaultFeedType;
    item.editedAt = new Date().toISOString();
    await saveData(data);
    await notify("Запись обновлена", `${formatDateTime(when)} · ${amountMl} мл · ${item.type}`);
    return true;
  }
  
  // Delete a feeding entry at a given index
  async function deleteFeedingAt(data, idx) {
    const removed = (data.feedings || []).splice(idx, 1)[0];
    if (!removed) return false;
    await saveData(data);
    await notify("Запись удалена", `${formatClock(new Date(removed.at))}`);
    return true;
  }
  
  async function showMenu(data) {
    const stats = getStats(data);
    const actions = buildMenuActions(stats);
  
    const a = new Alert();
    a.title = "Кормление";
    a.message = buildMenuMessage(stats);
  
    for (const item of actions) {
      a.addAction(item.label);
    }
  
    a.addCancelAction("Закрыть");
  
    const choice = await a.presentSheet();
    if (choice < 0 || choice >= actions.length) return;
  
    const action = actions[choice].id;
  
    if (action === "feed_now") {
      addFeeding(data, {
        date: new Date(),
        amountMl: CONFIG.defaultAmountMl,
        type: CONFIG.defaultFeedType,
        source: "manual"
      });
  
      await saveData(data);
      await notify("Кормление отмечено", `${CONFIG.defaultAmountMl} мл · ${CONFIG.defaultFeedType}`);
      await preview(data, CONFIG.previewSize);
      return;
    }
  
    if (action === "history") {
      await showHistory(data);
      await preview(data, CONFIG.previewSize);
      return;
    }
  
    if (action === "feed_custom") {
      const custom = await askCustomFeeding();
      if (!custom) return;
  
      addFeeding(data, {
        date: new Date(),
        amountMl: custom.amountMl,
        type: custom.type,
        source: "manual_custom"
      });
  
      await saveData(data);
      await notify("Кормление отмечено", `${custom.amountMl} мл · ${custom.type}`);
      await preview(data, CONFIG.previewSize);
      return;
    }
  
    if (action === "feed_dated") {
      const saved = await addFeedingWithDateTime(data);
      if (saved) await preview(data, CONFIG.previewSize);
      return;
    }
  
    if (action === "edit_last") {
      const saved = await editLastFeeding(data);
      if (saved) await preview(data, CONFIG.previewSize);
      return;
    }
  
    if (action === "preview") {
      await preview(data, CONFIG.previewSize);
      return;
    }
  
    if (action === "delete_last") {
      const removed = removeLastFeeding(data);
  
      if (removed) {
        await saveData(data);
        await notify("Последняя запись удалена", formatClock(new Date(removed.at)));
      } else {
        await notify("Удалять нечего", "История кормлений пустая");
      }
    }
  }
  
  function buildMenuMessage(stats) {
    const intervalMinutes = stats.intervalMinutes || getTargetIntervalMinutes(new Date());
    const intervalLine = `Интервал: ${humanTime(intervalMinutes)}${stats.isNightInterval ? " (ночь)" : ""}`;
  
    if (!stats.hasData) {
      return `Пока нет записей.\n${intervalLine}`;
    }
  
    return (
      `Последнее: ${formatClock(stats.lastDate)}\n` +
      `Прошло: ${humanTime(stats.elapsedMinutes)}\n` +
      `Следующее: ${formatClock(stats.nextDate)}\n` +
      `${intervalLine}\n` +
      `Сегодня: ${stats.todayCount} ${ruWord(stats.todayCount, ["раз", "раза", "раз"])} / ${stats.todayMl} мл`
    );
  }
  
  function buildMenuActions(stats) {
    const isAuto = CONFIG.widgetSize === "auto";
    const actions = [
      { id: "feed_now", label: "🍼 Отметить сейчас" },
      { id: "feed_custom", label: "✍️ Другой объём и тип" },
      { id: "feed_dated", label: "📅 Запись с датой и временем" }
    ];
      actions.push({ id: "history", label: "📜 История последних" });
  
    if (CONFIG.debug.debugSize) {
      actions.push({ id: "size_mini", label: "👀 1×1" });
      actions.push({ id: "size_normal", label: "👀 2×1" });
    }
  
    if (stats.hasData) {
      actions.push({ id: "delete_last", label: "↩️ Удалить последнюю" });
    }
  
    return actions;
  }
  
  async function addFeedingWithDateTime(data) {
    const fields = await askFeedingFields(new Date());
    if (!fields) return false;
  
    addFeeding(data, {
      date: fields.when,
      amountMl: fields.amountMl,
      type: fields.type,
      source: "manual_dated"
    });
  
    await saveData(data);
    await notify(
      "Кормление записано",
      `${formatDateTime(fields.when)} · ${fields.amountMl} мл · ${fields.type}`
    );
  
    return true;
  }
  
  async function askFeedingFields(defaultDate = new Date()) {
    const a = new Alert();
    a.title = "Кормление";
    a.message = "Дата, время, объём и тип.";
  
    a.addTextField("Дата ДД.ММ.ГГГГ", formatDateInput(defaultDate));
    a.addTextField("Время ЧЧ:ММ", formatClock(defaultDate));
    a.addTextField("Объём, мл", String(CONFIG.defaultAmountMl));
    a.addTextField("Тип", CONFIG.defaultFeedType);
  
    a.addAction("Сохранить");
    a.addCancelAction("Отмена");
  
    const result = await a.presentAlert();
    if (result === -1) return null;
  
    const when = parseDateTimeFields(a.textFieldValue(0), a.textFieldValue(1));
  
    if (!when) {
      await notify("Не сохранено", "Неверная дата или время");
      return null;
    }
  
    const amountMl = getNumber(normalizeCommaNumber(a.textFieldValue(2)), NaN);
  
    if (!Number.isFinite(amountMl) || amountMl < 0) {
      await notify("Не сохранено", "Объём должен быть числом ≥ 0");
      return null;
    }
  
    return {
      when,
      amountMl,
      type: cleanText(a.textFieldValue(3)) || CONFIG.defaultFeedType
    };
  }
  
  async function askCustomFeeding() {
    const a = new Alert();
    a.title = "Новое кормление";
    a.message = "Укажи объём и тип кормления.";
  
    a.addTextField("Объём, мл", String(CONFIG.defaultAmountMl));
    a.addTextField("Тип", CONFIG.defaultFeedType);
  
    a.addAction("Сохранить");
    a.addCancelAction("Отмена");
  
    const result = await a.presentAlert();
    if (result === -1) return null;
  
    return {
      amountMl: getNumber(a.textFieldValue(0), CONFIG.defaultAmountMl),
      type: cleanText(a.textFieldValue(1)) || CONFIG.defaultFeedType
    };
  }
  
  async function editLastFeeding(data) {
    const last = getLastFeeding(data);
  
    if (!last) {
      await notify("Редактировать нечего", "История кормлений пустая");
      return false;
    }
  
    const current = new Date(last.at);
  
    const a = new Alert();
    a.title = "Последняя запись";
    a.message =
      `Сейчас: ${formatDateTime(current)}\n` +
      `${last.amountMl} мл · ${last.type || CONFIG.defaultFeedType}`;
  
    a.addTextField("Дата ДД.ММ.ГГГГ", formatDateInput(current));
    a.addTextField("Время ЧЧ:ММ", formatClock(current));
    a.addTextField("Объём, мл", String(last.amountMl ?? CONFIG.defaultAmountMl));
    a.addTextField("Тип", last.type || CONFIG.defaultFeedType);
  
    a.addAction("Сохранить");
    a.addCancelAction("Отмена");
  
    const result = await a.presentAlert();
    if (result === -1) return false;
  
    const when = parseDateTimeFields(a.textFieldValue(0), a.textFieldValue(1));
  
    if (!when) {
      await notify("Не сохранено", "Неверная дата или время");
      return false;
    }
  
    const amountMl = getNumber(normalizeCommaNumber(a.textFieldValue(2)), NaN);
  
    if (!Number.isFinite(amountMl) || amountMl < 0) {
      await notify("Не сохранено", "Объём должен быть числом ≥ 0");
      return false;
    }
  
    last.at = when.toISOString();
    last.amountMl = amountMl;
    last.type = cleanText(a.textFieldValue(3)) || CONFIG.defaultFeedType;
    last.editedAt = new Date().toISOString();
  
    await saveData(data);
    await notify(
      "Запись обновлена",
      `${formatDateTime(when)} · ${amountMl} мл · ${last.type}`
    );
  
    return true;
  }
  
  async function preview(data, size) {
    const widget = await createWidget(data, size);
  
    if (size === "mini") {
      await widget.presentSmall();
    } else {
      await widget.presentMedium();
    }
  }
  
  
  // ============================================================
  // 5. СОЗДАНИЕ ВИДЖЕТА
  // ============================================================
  
  async function createWidget(data, forcedSize = null) {
    const sizeName = forcedSize || resolveWidgetSize();
  
    const widget = new ListWidget();
    widget.setPadding(0, 0, 0, 0);
  
    const image = drawWidgetImage(data, sizeName);
    widget.backgroundImage = image;
  
    // Тап по виджету = записать кормление
    widget.url = makeUrl(URLScheme.forRunningScript(), {
      action: "feed"
    });
  
    // iOS не гарантирует точное обновление, но это мягкая просьба обновлять чаще
    widget.refreshAfterDate = new Date(Date.now() + 10 * 60 * 1000);
  
    return widget;
  }
  
  function resolveWidgetSize() {
    if (CONFIG.widgetSize === "mini") return "mini";
    if (CONFIG.widgetSize === "normal") return "normal";
  
    const family = config.widgetFamily;
  
    if (family === "small") return "mini";
    return "normal";
  }
  
  
  // ============================================================
  // 6. ОТРИСОВКА
  // ============================================================
  
  function drawWidgetImage(data, sizeName) {
    const size = CANVAS[sizeName];
  
    const ctx = new DrawContext();
    ctx.size = new Size(size.w, size.h);
    ctx.opaque = false;
    ctx.respectScreenScale = true;
  
    const stats = getStats(data);
    const state = getState(stats);
  
    drawBackground(ctx, size.w, size.h, state);
    drawDecor(ctx, size.w, size.h, state);
  
    if (sizeName === "mini") {
      drawMini(ctx, stats, state);
    } else {
      drawNormal(ctx, stats, state);
    }
  
    const debugLabel = getDebugLabel();
    if (debugLabel) {
      const pad = sizeName === "mini" ? 20 : 24;
      drawText(ctx, debugLabel, pad, size.h - 20, 11, CONFIG.ui.faint, "medium");
    }
  
    return ctx.getImage();
  }
  
  
  // ============================================================
  // 7. NORMAL 2x1
  // ============================================================
  
  function drawNormal(ctx, stats, state) {
    const w = CANVAS.normal.w;
  
    const pad = 34;
  
    drawText(ctx, `🍼 ${CONFIG.babyName}`, pad, 28, 28, CONFIG.ui.text, "bold");
  
    drawPill(
      ctx,
      w - pad - 150,
      22,
      150,
      40,
      state.label,
      state.color,
      0.18
    );
  
    drawText(ctx, state.main, pad, 92, 49, CONFIG.ui.text, "heavy");
    drawText(ctx, state.sub, pad, 150, 25, CONFIG.ui.muted, "medium");
  
    drawProgressBar(
      ctx,
      pad,
      193,
      w - pad * 2,
      15,
      stats.progress,
      state.color
    );
  
    const cardY = 230;
    const cardH = 75;
    const gap = 16;
    const cardW = 194;
    const intervalLabel = humanTime(stats.intervalMinutes || CONFIG.targetIntervalMinutes);
  
    drawInfoCard(
      ctx,
      pad,
      cardY,
      cardW,
      cardH,
      "Сегодня",
      `${stats.todayCount} ${ruWord(stats.todayCount, ["раз", "раза", "раз"])}`,
      stats.todayMl > 0 ? `${stats.todayMl} мл` : "без объёма"
    );
  
    drawInfoCard(
      ctx,
      pad + cardW + gap,
      cardY,
      cardW,
      cardH,
      "Следующее",
      stats.hasData ? formatClock(stats.nextDate) : "—",
      stats.hasData ? `интервал ${intervalLabel}` : "нажми виджет"
    );
  
    drawInfoCard(
      ctx,
      pad + (cardW + gap) * 2,
      cardY,
      cardW,
      cardH,
      "Последнее",
      stats.hasData ? formatClock(stats.lastDate) : "—",
      stats.hasData ? `${CONFIG.defaultAmountMl} мл по тапу` : "пусто"
    );
  }
  
  
  // ============================================================
  // 8. MINI 1x1
  // ============================================================
  
  function drawMini(ctx, stats, state) {
    const w = CANVAS.mini.w;
  
    const pad = 24;
  
    drawText(ctx, "🍼", pad, 22, 34, CONFIG.ui.text, "bold");
  
    drawPill(
      ctx,
      w - pad - 116,
      24,
      116,
      38,
      state.label,
      state.color,
      0.18
    );
  
    drawText(ctx, CONFIG.babyName, pad, 72, 25, CONFIG.ui.muted, "bold");
    drawText(ctx, state.miniMain, pad, 116, 45, CONFIG.ui.text, "heavy");
  
    drawTextInRect(
      ctx,
      state.miniSub,
      pad,
      168,
      w - pad * 2,
      54,
      22,
      CONFIG.ui.muted,
      "medium"
    );
  
    drawProgressBar(
      ctx,
      pad,
      232,
      w - pad * 2,
      15,
      stats.progress,
      state.color
    );
  
    drawText(ctx, "тап = покормил", pad, 270, 20, CONFIG.ui.faint, "medium");
  }
  
  
  // ============================================================
  // 9. СОСТОЯНИЕ
  // ============================================================
  
  function getState(stats) {
    if (!stats.hasData) {
      return {
        label: "старт",
        color: CONFIG.ui.empty,
        main: "Нажми, чтобы начать",
        sub: "Тап по виджету запишет первое кормление",
        miniMain: "Старт",
        miniSub: "Нажми, чтобы записать первое кормление"
      };
    }
  
    if (stats.remainingMinutes <= 0) {
      return {
        label: "пора",
        color: CONFIG.ui.late,
        main: "Пора кормить",
        sub: `Последнее ${formatClock(stats.lastDate)} · прошло ${humanTime(stats.elapsedMinutes)}`,
        miniMain: "Пора",
        miniSub: `Прошло ${humanTime(stats.elapsedMinutes)}`
      };
    }
  
    if (stats.remainingMinutes <= CONFIG.warningMinutesBefore) {
      return {
        label: "скоро",
        color: CONFIG.ui.soon,
        main: `Через ${humanTime(stats.remainingMinutes)}`,
        sub: `Последнее ${formatClock(stats.lastDate)} · следующее около ${formatClock(stats.nextDate)}`,
        miniMain: humanTimeShort(stats.remainingMinutes),
        miniSub: `Следующее около ${formatClock(stats.nextDate)}`
      };
    }
  
    return {
      label: "спокойно",
      color: CONFIG.ui.good,
      main: `Через ${humanTime(stats.remainingMinutes)}`,
      sub: `Последнее ${formatClock(stats.lastDate)} · следующее около ${formatClock(stats.nextDate)}`,
      miniMain: humanTimeShort(stats.remainingMinutes),
      miniSub: `Следующее около ${formatClock(stats.nextDate)}`
    };
  }
  
  function getTargetIntervalMinutes(date = new Date()) {
    const night = CONFIG.nightIntervalMinutes;
  
    if (night != null && Number.isFinite(Number(night)) && isNightTime(date)) {
      return Number(night);
    }
  
    return CONFIG.targetIntervalMinutes;
  }
  
  function isNightTime(date = new Date()) {
    const start = getNumber(CONFIG.nightHoursStart, 22);
    const end = getNumber(CONFIG.nightHoursEnd, 7);
  
    if (start === end) return false;
  
    const hour = date.getHours();
  
    if (start < end) return hour >= start && hour < end;
  
    return hour >= start || hour < end;
  }
  
  
  // ============================================================
  // 10. СТАТИСТИКА
  // ============================================================
  
  function getStats(data) {
    const debugScenario = resolveDebugScenario();
    if (debugScenario) return buildDebugStats(debugScenario);
  
    const feedings = (data.feedings || [])
      .slice()
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  
    if (feedings.length === 0) {
      return emptyStats();
    }
  
    const now = new Date();
    const last = feedings[0];
    const lastDate = new Date(last.at);
  
    const elapsedMinutes = Math.max(
      0,
      Math.floor((now.getTime() - lastDate.getTime()) / 60000)
    );
  
    const intervalMinutes = getTargetIntervalMinutes(now);
    const remainingMinutes = intervalMinutes - elapsedMinutes;
  
    const nextDate = new Date(lastDate.getTime() + intervalMinutes * 60 * 1000);
  
    const progress = clamp(elapsedMinutes / intervalMinutes, 0, 1);
  
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
  
    const today = feedings.filter(item => {
      return new Date(item.at).getTime() >= todayStart.getTime();
    });
  
    const todayMl = today.reduce((sum, item) => {
      return sum + getNumber(item.amountMl, 0);
    }, 0);
  
    return {
      hasData: true,
      lastDate,
      nextDate,
      elapsedMinutes,
      remainingMinutes,
      progress,
      intervalMinutes,
      isNightInterval: isNightTime(now),
      todayCount: today.length,
      todayMl
    };
  }
  
  function emptyStats() {
    const intervalMinutes = getTargetIntervalMinutes(new Date());
  
    return {
      hasData: false,
      lastDate: null,
      nextDate: null,
      elapsedMinutes: 0,
      remainingMinutes: 0,
      progress: 0,
      intervalMinutes,
      isNightInterval: isNightTime(new Date()),
      todayCount: 0,
      todayMl: 0
    };
  }
  
  function resolveDebugScenario() {
    const q = args && args.queryParameters ? cleanText(args.queryParameters.debug) : "";
    if (q) return q;
  
    const dbg = CONFIG.debug;
    if (!dbg || !dbg.enabled) return "";
  
    return cleanText(dbg.scenario) || "soon";
  }
  
  function getDebugLabel() {
    const scenario = resolveDebugScenario();
    if (!scenario) return "";
    if (CONFIG.debug && CONFIG.debug.showLabel === false) return "";
  
    return `DEBUG · ${scenario}`;
  }
  
  function buildDebugStats(scenario) {
    const key = String(scenario || "soon").toLowerCase();
  
    if (key === "empty" || key === "start") return emptyStats();
  
    const preset = {
      ok: { remainingMinutes: 95, todayCount: 3, todayMl: 90 },
      calm: { remainingMinutes: 95, todayCount: 3, todayMl: 90 },
      good: { remainingMinutes: 95, todayCount: 3, todayMl: 90 },
      soon: { remainingMinutes: 20, todayCount: 5, todayMl: 150 },
      warning: { remainingMinutes: 20, todayCount: 5, todayMl: 150 },
      late: { remainingMinutes: -30, todayCount: 6, todayMl: 180 },
      overdue: { remainingMinutes: -30, todayCount: 6, todayMl: 180 },
      pora: { remainingMinutes: -30, todayCount: 6, todayMl: 180 }
    };
  
    const p = preset[key] || preset.soon;
    const interval = getTargetIntervalMinutes(new Date());
    const remainingMinutes = getNumber(p.remainingMinutes, 20);
    const elapsedMinutes = interval - remainingMinutes;
  
    return statsFromElapsed(elapsedMinutes, {
      todayCount: getNumber(CONFIG.debug?.todayCount, p.todayCount),
      todayMl: getNumber(CONFIG.debug?.todayMl, p.todayMl)
    });
  }
  
  function statsFromElapsed(elapsedMinutes, extras = {}) {
    const now = new Date();
    const interval = getTargetIntervalMinutes(now);
    const elapsed = Math.round(elapsedMinutes);
    const lastDate = new Date(now.getTime() - elapsed * 60 * 1000);
    const remainingMinutes = interval - elapsed;
    const nextDate = new Date(lastDate.getTime() + interval * 60 * 1000);
    const progress = clamp(elapsed / interval, 0, 1);
  
    return {
      hasData: true,
      lastDate,
      nextDate,
      elapsedMinutes: elapsed,
      remainingMinutes,
      progress,
      intervalMinutes: interval,
      isNightInterval: isNightTime(now),
      todayCount: getNumber(extras.todayCount, 3),
      todayMl: getNumber(extras.todayMl, 90)
    };
  }
  
  
  // ============================================================
  // 11. ХРАНЕНИЕ
  // ============================================================

  function isGasBackend() {
    return (CONFIG.storageBackend || "local") === "googleAppsScript";
  }

  function buildGasUrl() {
    const base = cleanText(CONFIG.gasUrl);
    const key = cleanText(CONFIG.gasKey);

    if (!base || !key) return null;

    const sep = base.includes("?") ? "&" : "?";
    return base + sep + "key=" + encodeURIComponent(key);
  }

  async function fetchDataFromGas() {
    const url = buildGasUrl();
    if (!url) return null;

    try {
      const req = new Request(url);
      req.method = "GET";
      req.timeoutInterval = CONFIG.gasTimeoutSeconds || 15;

      const data = await req.loadJSON();

      if (!data || data.error) throw new Error(data && data.error ? data.error : "empty response");

      return normalizeFeedingData(data);
    } catch (e) {
      console.log("GAS load failed:", e.message || e);
      return null;
    }
  }

  async function postDataToGas(data) {
    const url = buildGasUrl();
    if (!url) return false;

    try {
      const req = new Request(url);
      req.method = "POST";
      req.headers = { "Content-Type": "application/json" };
      req.body = JSON.stringify(data);
      req.timeoutInterval = CONFIG.gasTimeoutSeconds || 15;

      const res = await req.loadJSON();

      if (res && res.error) throw new Error(res.error);

      return true;
    } catch (e) {
      console.log("GAS save failed:", e.message || e);
      return false;
    }
  }

  function mergeFeedingData(local, remote) {
    if (!local && !remote) return null;
    if (!local) return normalizeFeedingData(remote);
    if (!remote) return normalizeFeedingData(local);

    const map = new Map();

    for (const f of [...(remote.feedings || []), ...(local.feedings || [])]) {
      if (f && f.at) map.set(f.at, f);
    }

    const feedings = [...map.values()]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, CONFIG.keepLastRecords);

    const updatedAt = [local.updatedAt, remote.updatedAt]
      .filter(Boolean)
      .map(x => new Date(x).getTime())
      .filter(t => Number.isFinite(t))
      .sort((a, b) => b - a)[0];

    return normalizeFeedingData({
      version: Math.max(getNumber(local.version, 1), getNumber(remote.version, 1)),
      babyName: remote.babyName || local.babyName || CONFIG.babyName,
      createdAt: local.createdAt || remote.createdAt,
      updatedAt: updatedAt ? new Date(updatedAt).toISOString() : new Date().toISOString(),
      feedings
    });
  }

  function writeLocalCache(json) {
    const storage = getWritableStorage();
    storage.fm.writeString(storage.path, json);
  }

  async function loadBestLocalData() {
    const fm = FileManager.iCloud();
    const paths = getAllDataFilePaths(fm);
    let best = null;

    for (const path of paths) {
      try {
        const data = await readDataFile(fm, path);
        const ts = dataTimestamp(data);

        if (!best || ts >= dataTimestamp(best.data)) best = { path, data };
      } catch (e) {
        console.log("read failed:", path, e.message || e);

        try {
          const backup = path + ".broken-" + Date.now();
          fm.copy(path, backup);
        } catch (copyErr) {
          console.log("backup failed:", copyErr.message || copyErr);
        }
      }
    }

    return best ? best.data : null;
  }

  function getMobileDocumentsRoot(docs) {
    const marker = "Mobile Documents";
    const idx = docs.indexOf(marker);

    if (idx !== -1) return docs.substring(0, idx + marker.length);

    return null;
  }

  function getICloudDriveRoot(fm) {
    const docs = fm.documentsDirectory();
    if (!docs) return null;

    const cloudDocs = "com~apple~CloudDocs";
    const inCloud = docs.indexOf(cloudDocs);

    if (inCloud !== -1) return docs.substring(0, inCloud + cloudDocs.length);

    const mobile = getMobileDocumentsRoot(docs);
    if (!mobile) return null;

    return fm.joinPath(mobile, cloudDocs);
  }

  function getStorageFolderCandidates(fm) {
    const name = CONFIG.dataFolder;
    const mode = CONFIG.storageLocation || "scriptable";
    const list = [];
    const scriptableFolder = fm.joinPath(fm.documentsDirectory(), name);

    if (mode === "icloudDrive") {
      const root = getICloudDriveRoot(fm);

      if (root) {
        list.push(fm.joinPath(root, name));
        list.push(fm.joinPath(root, "Shared", name));
      }

      list.push(scriptableFolder);
      return list;
    }

    list.push(scriptableFolder);
    return list;
  }

  function getSharedDataPath(fm) {
    const root = getICloudDriveRoot(fm);
    if (!root) return null;

    return fm.joinPath(root, CONFIG.dataFolder, CONFIG.dataFile);
  }

  function getWritableStorage() {
    const fm = FileManager.iCloud();
    const folder = fm.joinPath(fm.documentsDirectory(), CONFIG.dataFolder);

    if (!fm.fileExists(folder)) {
      try {
        fm.createDirectory(folder, true);
      } catch (e) {
        console.log("createDirectory failed:", folder, e);
      }
    }

    return {
      fm,
      folder,
      path: fm.joinPath(folder, CONFIG.dataFile)
    };
  }

  function getAllDataFilePaths(fm) {
    const file = CONFIG.dataFile;
    const paths = [];

    for (const folder of getStorageFolderCandidates(fm)) {
      const path = fm.joinPath(folder, file);

      if (fm.fileExists(path)) paths.push(path);
    }

    return paths;
  }

  function dataTimestamp(data) {
    const t = data && data.updatedAt ? new Date(data.updatedAt).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  }

  async function ensureFileDownloaded(fm, path) {
    if (
      typeof fm.isFileDownloaded === "function" &&
      !fm.isFileDownloaded(path)
    ) {
      await fm.downloadFileFromiCloud(path);
    }
  }

  function normalizeFeedingData(data) {
    if (!data.feedings) data.feedings = [];

    data.feedings = data.feedings
      .filter(x => x && x.at)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return data;
  }

  async function readDataFile(fm, path) {
    await ensureFileDownloaded(fm, path);

    const raw = fm.readString(path);
    return normalizeFeedingData(JSON.parse(raw));
  }

  async function syncToSharedFolder(fm, json) {
    if (CONFIG.storageLocation !== "icloudDrive") return;
    if (CONFIG.syncToSharedFolder === false) return;

    const sharedPath = getSharedDataPath(fm);
    if (!sharedPath) return;

    const folder = fm.joinPath(getICloudDriveRoot(fm), CONFIG.dataFolder);

    try {
      if (!fm.fileExists(folder)) fm.createDirectory(folder, true);

      fm.writeString(sharedPath, json);
    } catch (e) {
      console.log("syncToSharedFolder skipped:", e.message || e);
    }
  }

  async function loadData() {
    const local = await loadBestLocalData();

    if (isGasBackend() && buildGasUrl()) {
      const remote = await fetchDataFromGas();
      const merged = mergeFeedingData(local, remote);

      if (merged) {
        writeLocalCache(JSON.stringify(merged, null, 2));
        return merged;
      }

      if (local) return local;

      const data = createDefaultData();
      await saveData(data);
      return data;
    }

    if (local) return local;

    const data = createDefaultData();
    await saveData(data);
    return data;
  }

  async function saveData(data) {
    data.updatedAt = new Date().toISOString();

    data.feedings = (data.feedings || [])
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, CONFIG.keepLastRecords);

    const normalized = normalizeFeedingData(data);
    const json = JSON.stringify(normalized, null, 2);

    writeLocalCache(json);

    if (isGasBackend() && buildGasUrl()) {
      await postDataToGas(normalized);
      return;
    }

    await syncToSharedFolder(getWritableStorage().fm, json);
  }
  
  function createDefaultData() {
    return {
      version: 1,
      babyName: CONFIG.babyName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      feedings: []
    };
  }
  
  function addFeeding(data, entry) {
    if (!data.feedings) data.feedings = [];
  
    data.feedings.unshift({
      at: entry.date.toISOString(),
      amountMl: entry.amountMl,
      type: entry.type,
      source: entry.source || "unknown"
    });
  }
  
  function removeLastFeeding(data) {
    if (!data.feedings || data.feedings.length === 0) return null;
  
    data.feedings.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  
    return data.feedings.shift();
  }
  
  function getLastFeeding(data) {
    if (!data.feedings || data.feedings.length === 0) return null;
  
    data.feedings.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  
    return data.feedings[0];
  }
  
  
  // ============================================================
  // 12. РИСОВАНИЕ: ФОН
  // ============================================================
  
  function drawBackground(ctx, w, h, state) {
    drawVerticalGradient(
      ctx,
      0,
      0,
      w,
      h,
      CONFIG.ui.bgTop,
      CONFIG.ui.bgBottom,
      100
    );
  
    // Мягкое цветное пятно состояния
    ctx.setFillColor(colorWithAlpha(state.color, 0.10));
    ctx.fillEllipse(new Rect(w * 0.58, -h * 0.65, w * 0.75, h * 1.25));
  }
  
  function drawDecor(ctx, w, h, state) {
    ctx.setFillColor(colorWithAlpha("#FFFFFF", CONFIG.ui.decorWhiteAlpha));
    ctx.fillEllipse(new Rect(w - 128, 38, 46, 46));
    ctx.fillEllipse(new Rect(w - 68, 88, 18, 18));
    ctx.fillEllipse(new Rect(30, h - 72, 28, 28));
  
    ctx.setFillColor(colorWithAlpha(state.color, CONFIG.ui.decorColorAlpha));
    ctx.fillEllipse(new Rect(w - 210, h - 150, 140, 140));
  
    ctx.setFillColor(colorWithAlpha(state.color, 0.035));
    ctx.fillEllipse(new Rect(w - 300, -120, 260, 230));
  }
  
  
  // ============================================================
  // 13. РИСОВАНИЕ: UI-ЭЛЕМЕНТЫ
  // ============================================================
  
  function drawText(ctx, text, x, y, size, colorHex, weight = "regular") {
    ctx.setTextAlignedLeft();
    ctx.setTextColor(new Color(colorHex));
    ctx.setFont(makeFont(size, weight));
    ctx.drawText(String(text), new Point(x, y));
  }
  
  function drawTextInRect(ctx, text, x, y, w, h, size, colorHex, weight = "regular") {
    ctx.setTextAlignedLeft();
    ctx.setTextColor(new Color(colorHex));
    ctx.setFont(makeFont(size, weight));
    ctx.drawTextInRect(String(text), new Rect(x, y, w, h));
  }
  
  function drawPill(ctx, x, y, w, h, text, colorHex, alpha) {
    drawRoundedRect(
      ctx,
      x,
      y,
      w,
      h,
      h / 2,
      colorWithAlpha(colorHex, alpha)
    );
  
    ctx.setTextColor(new Color(colorHex));
    ctx.setFont(Font.boldSystemFont(20));
    ctx.setTextAlignedCenter();
  
    ctx.drawTextInRect(
      String(text),
      new Rect(x, y + 2, w, h)
    );
  
    ctx.setTextAlignedLeft();
  }
  
  function drawProgressBar(ctx, x, y, w, h, progress, colorHex) {
    drawRoundedRect(
      ctx,
      x,
      y,
      w,
      h,
      h / 2,
      colorWithAlpha(CONFIG.ui.barBg, CONFIG.ui.barBgAlpha)
    );
  
    const p = clamp(progress, 0, 1);
  
    if (p <= 0) return;
  
    const fillW = Math.max(h, w * p);
  
    drawRoundedRect(
      ctx,
      x,
      y,
      fillW,
      h,
      h / 2,
      new Color(colorHex)
    );
  }
  
  function drawInfoCard(ctx, x, y, w, h, title, value, caption) {
    drawRoundedRect(
      ctx,
      x,
      y,
      w,
      h,
      20,
      colorWithAlpha(CONFIG.ui.card, CONFIG.ui.cardAlpha)
    );
  
    drawText(ctx, title, x + 18, y + 6, 19, CONFIG.ui.muted, "medium");
    drawText(ctx, value, x + 18, y + 28, 26, CONFIG.ui.text, "bold");
    drawText(ctx, caption, x + 18, y + 54, 16, CONFIG.ui.muted, "medium");
  }
  
  function drawRoundedRect(ctx, x, y, w, h, r, color) {
    const path = new Path();
  
    path.addRoundedRect(
      new Rect(x, y, w, h),
      r,
      r
    );
  
    ctx.addPath(path);
    ctx.setFillColor(color);
    ctx.fillPath();
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
  // 14. УТИЛИТЫ
  // ============================================================
  
  function makeUrl(baseUrl, params) {
    const parts = [];
  
    for (const key of Object.keys(params)) {
      parts.push(
        encodeURIComponent(key) + "=" + encodeURIComponent(params[key])
      );
    }
  
    const sep = baseUrl.includes("?") ? "&" : "?";
    return baseUrl + sep + parts.join("&");
  }
  
  async function notify(title, body) {
    const n = new Notification();
    n.title = title;
    n.body = body;
    await n.schedule();
  }
  
  function formatClock(date) {
    if (!date) return "—";
  
    return `${two(date.getHours())}:${two(date.getMinutes())}`;
  }
  
  function formatDateInput(date) {
    if (!date) return "";
  
    return `${two(date.getDate())}.${two(date.getMonth() + 1)}.${date.getFullYear()}`;
  }
  
  function formatDateTime(date) {
    if (!date) return "—";
  
    return `${formatDateInput(date)} ${formatClock(date)}`;
  }
  
  function parseDateTimeFields(dateStr, timeStr) {
    const rawDate = cleanText(dateStr).replace(/\//g, ".");
    const parts = rawDate.split(".").map(x => cleanText(x)).filter(Boolean);
  
    if (parts.length < 3) return null;
  
    let day = getNumber(parts[0], NaN);
    let month = getNumber(parts[1], NaN);
    let year = getNumber(parts[2], NaN);
  
    if (parts[0].length === 4) {
      year = getNumber(parts[0], NaN);
      month = getNumber(parts[1], NaN);
      day = getNumber(parts[2], NaN);
    }
  
    const timeRaw = cleanText(timeStr).replace(".", ":");
    const timeParts = timeRaw.split(":").map(x => cleanText(x));
    const hour = getNumber(timeParts[0], 0);
    const minute = getNumber(timeParts[1] || "0", 0);
  
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  
    const dt = new Date(year, month - 1, day, hour, minute, 0, 0);
  
    if (Number.isNaN(dt.getTime())) return null;
    if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
  
    return dt;
  }
  
  function normalizeCommaNumber(value) {
    return String(value || "").replace(",", ".");
  }
  
  function two(n) {
    return String(n).padStart(2, "0");
  }
  
  function humanTime(minutes) {
    minutes = Math.max(0, Math.round(minutes));
  
    if (minutes < 60) {
      return `${minutes} мин`;
    }
  
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
  
    if (m === 0) return `${h} ч`;
    return `${h} ч ${m} мин`;
  }
  
  function humanTimeShort(minutes) {
    minutes = Math.max(0, Math.round(minutes));
  
    if (minutes < 60) return `${minutes}м`;
  
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
  
    if (m === 0) return `${h}ч`;
    return `${h}ч ${m}м`;
  }
  
  function getNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  
  function cleanText(value) {
    if (value === undefined || value === null) return "";
  
    return String(value).trim();
  }
  
  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
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
  
  function ruWord(n, forms) {
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
  
    if (abs > 10 && abs < 20) return forms[2];
    if (last > 1 && last < 5) return forms[1];
    if (last === 1) return forms[0];
  
    return forms[2];
  }