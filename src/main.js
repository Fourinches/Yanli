import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import {
  WEEKDAYS,
  getDayInfo,
  getMonthGrid,
  getMonthMeta,
  getNextHolidayLabel,
  getNextJieQiLabel,
  shiftMonth,
  todayParts,
} from "./calendar.js";
import { syncHolidays } from "./holidays.js";
import { fetchTyphoons, fetchWeather, searchPlaces, weatherFxText, weatherMood } from "./weather.js";
import {
  FONTS,
  LAYERS,
  SIZES,
  THEMES,
  WEATHER_POS,
  fontValue,
  hasSavedSettings,
  loadSettings,
  saveSettings,
} from "./settings.js";

const POS_KEY = "yanli-pos";
const SELECTED_KEY = "yanli-selected";
const SKIP_UPDATE_KEY = "yanli-skip-update";

const state = {
  ...todayParts(),
  selected: todayParts(),
  settings: loadSettings(),
  weatherOutlook: [],
  calendarDay: "",
  pendingUpdate: null,
};

const els = {
  body: document.body,
  ganzhi: document.getElementById("ganzhi"),
  monthLabel: document.getElementById("month-label"),
  monthSub: document.getElementById("month-sub"),
  weekdays: document.getElementById("weekdays"),
  grid: document.getElementById("grid"),
  detail: document.getElementById("detail"),
  dock: document.getElementById("dock"),
  weatherTop: document.getElementById("weather-top"),
  weatherBottom: document.getElementById("weather-bottom"),
  weatherAlert: document.getElementById("weather-alert"),
  typhoon: document.getElementById("typhoon"),
  fxLayer: document.getElementById("weather-fx"),
  ctxDesktop: document.getElementById("ctx-desktop"),
  ctxAutostart: document.getElementById("ctx-autostart"),
  ctx: document.getElementById("ctx-menu"),
  settings: document.getElementById("settings"),
  size: document.getElementById("set-size"),
  theme: document.getElementById("set-theme"),
  font: document.getElementById("set-font"),
  layer: document.getElementById("set-layer"),
  weatherPos: document.getElementById("set-weather-pos"),
  weatherAnim: document.getElementById("set-weather-anim"),
  typhoonAlert: document.getElementById("set-typhoon-alert"),
  opacity: document.getElementById("set-opacity"),
  opacityVal: document.getElementById("opacity-val"),
  autostart: document.getElementById("set-autostart"),
  place: document.getElementById("set-place"),
  placeList: document.getElementById("place-list"),
  placeNow: document.getElementById("place-now"),
  appVersion: document.getElementById("app-version"),
  checkUpdate: document.getElementById("check-update"),
  updateHint: document.getElementById("update-hint"),
  chartSheet: document.getElementById("chart-sheet"),
  chartView: document.getElementById("chart-view"),
  chartZoom: document.getElementById("chart-zoom"),
  chartEmpty: document.getElementById("chart-empty"),
  updateSheet: document.getElementById("update-sheet"),
  updateCopy: document.getElementById("update-copy"),
  updateStatus: document.getElementById("update-status"),
  updateLater: document.getElementById("update-later"),
  updateNow: document.getElementById("update-now"),
  updateClose: document.getElementById("update-close"),
};

function sameDay(a, b) {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function fillSelect(select, items, current) {
  select.innerHTML = items
    .map((item) => {
      const id = item.id || item;
      const label = item.label || SIZES[id]?.label || id;
      return `<option value="${id}" ${id === current ? "selected" : ""}>${label}</option>`;
    })
    .join("");
}

function syncDragLock() {
  const locked = state.settings.layer === "desktop";
  document.querySelectorAll(".js-drag").forEach((el) => {
    if (locked) el.removeAttribute("data-tauri-drag-region");
    else el.setAttribute("data-tauri-drag-region", "");
  });
}

function applyAppearance() {
  const s = state.settings;
  els.body.dataset.theme = s.theme;
  els.body.dataset.size = s.size;
  els.body.dataset.layer = s.layer;
  els.body.style.setProperty("--card-alpha", String(s.opacity / 100));
  els.body.style.setProperty("--font-body", fontValue(s.font));
  if (els.opacity) els.opacity.value = String(s.opacity);
  if (els.opacityVal) els.opacityVal.textContent = `${s.opacity}%`;
  if (els.autostart) els.autostart.checked = Boolean(s.autostart);
  if (els.weatherAnim) els.weatherAnim.checked = s.weatherAnim !== false;
  if (els.typhoonAlert) els.typhoonAlert.checked = s.typhoonAlert !== false;
  if (els.placeNow) els.placeNow.textContent = s.weather?.name || "尚未选择位置";
  syncDragLock();
  refreshCtxLabels();
}

async function applyWindowSize() {
  const size = SIZES[state.settings.size] || SIZES.m;
  const extra = [els.weatherAlert, els.typhoon]
    .filter((el) => el && !el.hidden)
    .reduce((sum, el) => sum + el.offsetHeight, 0);
  try {
    await invoke("resize_window", { width: size.width, height: size.height + extra });
  } catch {
    // 浏览器预览
  }
}

async function applyWindowLayer() {
  try {
    await invoke("set_window_layer", { layer: state.settings.layer });
  } catch {
    // ignore
  }
}

async function applyWindowChrome() {
  await applyWindowSize();
  await applyWindowLayer();
}

async function applyAutostart() {
  if (!hasSavedSettings()) {
    try {
      state.settings.autostart = await invoke("is_autostart_on");
      persist();
      applyAppearance();
    } catch {
      // 沿用默认值
    }
  }
  try {
    await invoke("set_autostart", { enabled: Boolean(state.settings.autostart) });
  } catch {
    try {
      const enabled = await isEnabled();
      if (state.settings.autostart && !enabled) await enable();
      if (!state.settings.autostart && enabled) await disable();
    } catch {
      // 仍失败则保持设置值，下次安装包环境再生效
    }
  }
  refreshCtxLabels();
}

function refreshCtxLabels() {
  if (els.ctxDesktop) {
    els.ctxDesktop.textContent =
      state.settings.layer === "desktop" ? "取消贴桌面" : "贴桌面";
  }
  if (els.ctxAutostart) {
    els.ctxAutostart.textContent = state.settings.autostart
      ? "关闭开机启动"
      : "开启开机启动";
  }
}

function persist() {
  saveSettings(state.settings);
}

function renderWeekdays() {
  els.weekdays.innerHTML = WEEKDAYS.map((name, index) => {
    const weekend = index === 0 || index === 6;
    return `<span class="${weekend ? "is-weekend" : ""}">${name}</span>`;
  }).join("");
}

function renderMonth() {
  const today = todayParts();
  const meta = getMonthMeta(state.year, state.month);
  els.ganzhi.textContent = `${meta.ganZhiYear} · ${meta.zodiac}`;
  els.monthLabel.textContent = meta.monthLabel;
  els.monthSub.textContent = `${meta.year}`;

  const cells = getMonthGrid(state.year, state.month);
  els.grid.innerHTML = cells
    .map((cell) => {
      const classes = ["day"];
      if (!cell.inMonth) classes.push("is-out");
      if (cell.rest) classes.push("is-rest");
      if (cell.work) classes.push("is-work");
      if (sameDay(cell, today)) classes.push("is-today");
      if (sameDay(cell, state.selected)) classes.push("is-selected");
      const extra = [cell.jieqi, ...cell.festivals].filter(Boolean).join(" ");
      const label = `${cell.year}年${cell.month}月${cell.day}日 ${cell.lunarText} ${extra}`;
      const current = sameDay(cell, today) ? ' aria-current="date"' : "";
      const badgeClass = cell.work ? "is-work" : cell.rest ? "is-rest" : "";
      return `
        <button type="button" class="${classes.join(" ")}"
          data-year="${cell.year}" data-month="${cell.month}" data-day="${cell.day}"
          aria-label="${label}"${current}>
          <span class="day-num">${cell.day}</span>
          <span class="day-sub">${cell.sub}</span>
          ${cell.badge ? `<span class="day-badge ${badgeClass}">${cell.badge}</span>` : ""}
        </button>`;
    })
    .join("");
  renderDetail();
  renderDock();
}

function renderDetail() {
  const info = getDayInfo(state.selected.year, state.selected.month, state.selected.day);
  const jieqiLine = getNextJieQiLabel(info.year, info.month, info.day);
  const status = info.work ? "调休上班" : info.rest ? "休息日" : "工作日";
  const festival = info.festivals.slice(0, 3).join(" / ") || info.official?.name || "";
  els.detail.innerHTML = `
    <div class="detail-day" aria-hidden="true">${info.day}</div>
    <div class="detail-copy">
      <p class="detail-title">星期${info.weekday} · ${info.lunarText}</p>
      <p class="detail-meta">${[festival, status, jieqiLine].filter(Boolean).join("  ·  ")}</p>
    </div>`;
}

function renderDock() {
  if (!els.dock) return;
  const selected = state.selected;
  const from = new Date(selected.year, selected.month - 1, selected.day);
  const next = getNextHolidayLabel(from);
  const outlook = state.weatherOutlook.join(" · ");
  const text = [next, outlook].filter(Boolean).join("  ·  ");
  els.dock.hidden = !text;
  els.dock.textContent = text;
}

function selectDay(year, month, day) {
  state.year = year;
  state.month = month;
  state.selected = { year, month, day };
  localStorage.setItem(SELECTED_KEY, JSON.stringify(state.selected));
  renderMonth();
}

function goMonth(delta) {
  const next = shiftMonth(state.year, state.month, delta);
  state.year = next.year;
  state.month = next.month;
  const today = todayParts();
  state.selected =
    state.year === today.year && state.month === today.month
      ? today
      : { year: state.year, month: state.month, day: 1 };
  renderMonth();
}

function goToday() {
  const today = todayParts();
  state.year = today.year;
  state.month = today.month;
  state.selected = today;
  renderMonth();
}

function openSettings() {
  els.settings.hidden = false;
  if (els.place) {
    els.place.value = "";
    els.place.setAttribute("readonly", "");
    els.placeList.replaceChildren();
  }
}

function closeSettings() {
  els.settings.hidden = true;
}

const chartPan = { scale: 1, x: 0, y: 0, drag: null };

function paintChartPan() {
  if (!els.chartZoom) return;
  els.chartZoom.style.transform = `translate(${chartPan.x}px, ${chartPan.y}px) scale(${chartPan.scale})`;
  els.chartView?.classList.toggle("is-zoomed", chartPan.scale > 1.01);
  els.chartView?.classList.toggle("is-dragging", Boolean(chartPan.drag));
}

function resetChartPan() {
  chartPan.scale = 1;
  chartPan.x = 0;
  chartPan.y = 0;
  chartPan.drag = null;
  paintChartPan();
}

function zoomChart(event) {
  const view = els.chartView;
  if (!view) return;
  const next = Math.min(8, Math.max(1, chartPan.scale * (event.deltaY < 0 ? 1.2 : 1 / 1.2)));
  if (next === chartPan.scale) return;
  const rect = view.getBoundingClientRect();
  const cx = event.clientX - rect.left - rect.width / 2;
  const cy = event.clientY - rect.top - rect.height / 2;
  const k = next / chartPan.scale;
  chartPan.x = cx - (cx - chartPan.x) * k;
  chartPan.y = cy - (cy - chartPan.y) * k;
  chartPan.scale = next;
  if (next === 1) {
    chartPan.x = 0;
    chartPan.y = 0;
  }
  paintChartPan();
}

function showChartSheet(chart, page) {
  if (!els.chartSheet || !els.chartZoom || !chart) return;
  resetChartPan();
  els.chartZoom.hidden = false;
  els.chartZoom.src = chart;
  if (els.chartEmpty) els.chartEmpty.hidden = true;
  els.chartSheet.dataset.page = page || "https://typhoon.nmc.cn/web.html";
  els.chartSheet.hidden = false;
}

async function openChart(chart, page) {
  if (!chart) return;
  const nextPage = page || "https://typhoon.nmc.cn/web.html";
  try {
    await invoke("open_chart_window", { page: nextPage });
  } catch {
    showChartSheet(chart, nextPage);
  }
}

function closeChart() {
  if (!els.chartSheet) return;
  els.chartSheet.hidden = true;
  resetChartPan();
  if (els.chartZoom) {
    els.chartZoom.hidden = true;
    els.chartZoom.removeAttribute("src");
  }
  if (els.chartEmpty) els.chartEmpty.hidden = false;
}

function hideUpdateSheet() {
  if (els.updateSheet) els.updateSheet.hidden = true;
}

function showUpdateSheet(info) {
  if (!els.updateSheet) return;
  state.pendingUpdate = info;
  els.updateCopy.textContent = `当前 ${info.current}，可更新到 ${info.latest}`;
  els.updateStatus.textContent = "";
  els.updateNow.disabled = false;
  els.updateSheet.hidden = false;
}

async function checkForUpdate(manual = false) {
  try {
    const info = await invoke("check_update");
    if (els.appVersion) els.appVersion.textContent = `当前版本 ${info.current}`;
    if (!info.available) {
      if (manual && els.updateHint) els.updateHint.textContent = `已是最新版本 ${info.current}`;
      return;
    }
    if (!manual && localStorage.getItem(SKIP_UPDATE_KEY) === info.latest) return;
    if (els.updateHint) els.updateHint.textContent = `发现新版本 ${info.latest}`;
    showUpdateSheet(info);
  } catch {
    if (manual && els.updateHint) els.updateHint.textContent = "暂时无法检查更新";
  }
}

function skipUpdate() {
  if (state.pendingUpdate?.latest) {
    localStorage.setItem(SKIP_UPDATE_KEY, state.pendingUpdate.latest);
  }
  hideUpdateSheet();
}

async function startUpdate() {
  const info = state.pendingUpdate;
  if (!info?.url) return;
  els.updateNow.disabled = true;
  els.updateStatus.textContent = "正在下载新版本…";
  try {
    const path = await invoke("download_update", { url: info.url });
    els.updateStatus.textContent = "下载完成，即将安装并退出";
    await invoke("install_update", { path });
  } catch {
    els.updateNow.disabled = false;
    els.updateStatus.textContent = "更新失败，请稍后重试";
  }
}

function hideCtx() {
  els.ctx.hidden = true;
}

function showCtx(x, y) {
  els.ctx.hidden = false;
  const pad = 8;
  const maxX = window.innerWidth - els.ctx.offsetWidth - pad;
  const maxY = window.innerHeight - els.ctx.offsetHeight - pad;
  els.ctx.style.left = `${Math.max(pad, Math.min(x, maxX))}px`;
  els.ctx.style.top = `${Math.max(pad, Math.min(y, maxY))}px`;
}

async function hideWindow() {
  await saveWindowPos();
  try {
    await invoke("hide_to_tray");
  } catch {
    window.close();
  }
}

async function quitApp() {
  await saveWindowPos();
  try {
    await invoke("quit_app");
  } catch {
    window.close();
  }
}

function fxNode(className, style = {}) {
  const node = document.createElement("span");
  node.className = className;
  Object.assign(node.style, style);
  return node;
}

function applyWeatherFx(text) {
  const layer = els.fxLayer;
  if (!layer) return;
  const mood = state.settings.weatherAnim !== false && text ? weatherMood(text) : "";
  if (layer.dataset.mood === mood) return;
  layer.dataset.mood = mood;
  layer.replaceChildren();
  if (!mood) return;

  if (mood === "sun") {
    layer.append(fxNode("fx-sun"), fxNode("fx-shine"), fxNode("fx-shine is-late"));
  }
  if (mood === "cloud") {
    layer.append(
      fxNode("fx-puff", { top: "2%", left: "-6%" }),
      fxNode("fx-puff is-mid", { top: "8%", left: "42%" }),
      fxNode("fx-puff is-small", { top: "4%", left: "68%" }),
    );
  }
  if (mood === "haze") {
    layer.append(
      fxNode("fx-haze", { top: "8%", left: "-16%" }),
      fxNode("fx-haze is-late", { top: "42%", left: "10%" }),
      fxNode("fx-haze", { top: "70%", left: "-8%" }),
    );
  }
  if (mood === "rain" || mood === "thunder") {
    for (let i = 0; i < 36; i += 1) {
      layer.append(fxNode("fx-drop", {
        left: `${2 + ((i * 3) % 96)}%`,
        animationDelay: `${(i % 9) * 0.1}s`,
        animationDuration: `${0.5 + (i % 6) * 0.08}s`,
      }));
    }
  }
  if (mood === "thunder") {
    layer.append(
      fxNode("fx-storm"),
      fxNode("fx-flash"),
      fxNode("fx-flash is-late"),
      fxNode("fx-bolt", { left: "26%" }),
      fxNode("fx-bolt is-late", { left: "58%" }),
    );
  }
  if (mood === "fog") {
    layer.append(
      fxNode("fx-veil"),
      fxNode("fx-fog-band", { top: "8%" }),
      fxNode("fx-fog-band is-mid", { top: "38%" }),
      fxNode("fx-fog-band is-late", { top: "66%" }),
    );
  }
  if (mood === "snow") {
    layer.append(
      fxNode("fx-fog-band", { top: "0%" }),
      fxNode("fx-fog-band is-late", { top: "58%" }),
    );
    for (let i = 0; i < 18; i += 1) {
      layer.append(fxNode("fx-flake", {
        left: `${3 + ((i * 5) % 94)}%`,
        animationDelay: `${(i % 8) * 0.35}s`,
        animationDuration: `${3.6 + (i % 5) * 0.5}s`,
      }));
    }
  }
}

function renderWeather(target, data, name) {
  target.hidden = false;
  const live = `${name} ${data.temp}° ${data.text}`;
  target.textContent = data.summary ? `${live} · ${data.summary}` : live;
  applyWeatherFx(weatherFxText(data));
}

function renderAlerts(alerts) {
  els.weatherAlert.replaceChildren();
  if (!alerts?.length) {
    els.weatherAlert.hidden = true;
    return;
  }
  els.weatherAlert.hidden = false;
  els.weatherAlert.className = "alert";
  for (const item of alerts) {
    const row = document.createElement("div");
    row.className = `alert-item is-${item.tone || "yellow"}`;
    const mark = document.createElement("span");
    mark.className = "alert-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "⚠️";
    const copy = document.createElement("div");
    const title = document.createElement("p");
    title.className = "alert-title";
    title.textContent = item.text;
    const tip = document.createElement("p");
    tip.className = "alert-tip";
    tip.textContent = item.tip || "注意防范，减少外出";
    copy.append(title, tip);
    row.append(mark, copy);
    els.weatherAlert.append(row);
  }
}

function emptyTyphoon() {
  return { storms: [], chart: "", page: "" };
}

function renderChart(chart, page) {
  if (!chart) return null;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "typhoon-chart";
  btn.title = "放大查看台风路径图";
  const img = document.createElement("img");
  img.alt = "中央气象台台风路径图";
  img.src = chart;
  img.addEventListener("error", () => {
    btn.remove();
    applyWindowSize();
  });
  const lens = document.createElement("span");
  lens.className = "typhoon-lens";
  lens.setAttribute("aria-hidden", "true");
  lens.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.2"/><path d="m16 16 5 5"/></svg>';
  btn.append(img, lens);
  btn.addEventListener("click", () => openChart(chart, page));
  return btn;
}

function renderTyphoons(report) {
  const storms = report?.storms || [];
  els.typhoon.replaceChildren();
  if (!storms.length) {
    els.typhoon.hidden = true;
    return;
  }
  els.typhoon.hidden = false;
  storms.forEach((storm, index) => {
    const row = document.createElement("div");
    row.className = `typhoon-item is-${storm.tone || "blue"}`;
    const copy = document.createElement("div");
    copy.className = "typhoon-copy";
    const title = document.createElement("p");
    title.className = "typhoon-title";
    title.textContent = storm.title;
    const meta = document.createElement("p");
    meta.className = "typhoon-meta";
    meta.textContent = storm.place ? `${storm.place} · ${storm.meta}` : storm.meta;
    copy.append(title, meta);
    if (storm.rings) {
      const rings = document.createElement("p");
      rings.className = "typhoon-rings";
      rings.textContent = storm.rings;
      copy.append(rings);
    }
    row.append(copy);
    if (index === 0) {
      const chart = renderChart(report.chart, report.page);
      if (chart) row.append(chart);
    }
    els.typhoon.append(row);
  });
}

async function refreshWeather() {
  const s = state.settings;
  els.weatherTop.hidden = true;
  els.weatherBottom.hidden = true;
  els.weatherAlert.hidden = true;
  els.typhoon.hidden = true;
  state.weatherOutlook = [];
  const stormsP = s.weatherPos === "off" || s.typhoonAlert === false
    ? Promise.resolve(emptyTyphoon())
    : fetchTyphoons().catch(() => emptyTyphoon());
  if (s.weatherPos === "off") {
    applyWeatherFx("");
    renderTyphoons(emptyTyphoon());
    renderDock();
    await applyWindowSize();
    return;
  }
  if (!s.weather) {
    applyWeatherFx("");
    renderTyphoons(await stormsP);
    renderDock();
    await applyWindowSize();
    return;
  }
  const useBottom = s.size === "s" || s.weatherPos === "bottom";
  const box = useBottom ? els.weatherBottom : els.weatherTop;
  try {
    const [data, storms] = await Promise.all([fetchWeather(s.weather), stormsP]);
    state.weatherOutlook = data.outlook || [];
    renderWeather(box, data, s.weather.short || s.weather.name.split(" · ")[0]);
    renderAlerts(data.alerts);
    renderTyphoons(storms);
  } catch {
    box.hidden = false;
    box.textContent = "天气暂不可用";
    applyWeatherFx("");
    renderTyphoons(await stormsP);
  }
  renderDock();
  await applyWindowSize();
}

function watchCalendarDay() {
  const today = todayParts();
  const key = `${today.year}-${today.month}-${today.day}`;
  if (!state.calendarDay) {
    state.calendarDay = key;
    return;
  }
  if (key === state.calendarDay) return;
  const [year, month, day] = state.calendarDay.split("-").map(Number);
  state.calendarDay = key;
  if (sameDay(state.selected, { year, month, day })) {
    state.year = today.year;
    state.month = today.month;
    state.selected = today;
  }
  renderMonth();
  applyAppearance();
  refreshWeather();
}

function readSavedPos() {
  if (Number.isFinite(state.settings.x) && Number.isFinite(state.settings.y)) {
    return { x: state.settings.x, y: state.settings.y };
  }
  const raw = localStorage.getItem(POS_KEY);
  if (!raw) return null;
  try {
    const { x, y } = JSON.parse(raw);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  } catch {
    localStorage.removeItem(POS_KEY);
    return null;
  }
}

async function restorePosition() {
  const pos = readSavedPos();
  if (!pos) return;
  try {
    await invoke("move_window", pos);
  } catch {
    // 窗口未就绪时保留记忆，下次再恢复
  }
}

function rememberPos(x, y) {
  state.settings.x = x;
  state.settings.y = y;
  persist();
  localStorage.setItem(POS_KEY, JSON.stringify({ x, y }));
}

async function saveWindowPos() {
  try {
    const pos = await getCurrentWindow().outerPosition();
    rememberPos(pos.x, pos.y);
  } catch {
    // 浏览器预览
  }
}

function bindDrag(el) {
  el.addEventListener("mousedown", async (event) => {
    if (state.settings.layer === "desktop") return;
    if (event.button !== 0) return;
    if (event.target.closest("button, input, select, a, .weather")) return;

    try {
      window.addEventListener("mouseup", saveWindowPos, { once: true });
      await getCurrentWindow().startDragging();
      return;
    } catch {
      // 再走手动拖动
    }

    const start = { x: event.screenX, y: event.screenY };
    let origin = { x: event.screenX - event.clientX, y: event.screenY - event.clientY };
    try {
      origin = await getCurrentWindow().outerPosition();
    } catch {
      // 浏览器预览没有窗口坐标
    }
    let last = { x: origin.x, y: origin.y };
    const onMove = async (moveEvent) => {
      last = {
        x: origin.x + (moveEvent.screenX - start.x),
        y: origin.y + (moveEvent.screenY - start.y),
      };
      try {
        await invoke("move_window", last);
      } catch {
        // ignore
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      rememberPos(last.x, last.y);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

function bindSettingsForm() {
  fillSelect(els.size, Object.keys(SIZES).map((id) => ({ id, label: SIZES[id].label })), state.settings.size);
  fillSelect(els.theme, THEMES, state.settings.theme);
  fillSelect(els.font, FONTS, state.settings.font);
  fillSelect(els.layer, LAYERS, state.settings.layer);
  fillSelect(els.weatherPos, WEATHER_POS, state.settings.weatherPos);

  const onChange = async (key, value) => {
    state.settings[key] = value;
    persist();
    applyAppearance();
    if (key === "size") await applyWindowSize();
    if (key === "layer") await applyWindowLayer();
    if (key === "autostart") await applyAutostart();
    if (key === "size" || key === "weatherPos" || key === "weatherAnim" || key === "typhoonAlert") await refreshWeather();
  };

  els.size.addEventListener("change", () => onChange("size", els.size.value));
  els.theme.addEventListener("change", () => onChange("theme", els.theme.value));
  els.font.addEventListener("change", () => onChange("font", els.font.value));
  els.layer.addEventListener("change", () => onChange("layer", els.layer.value));
  els.weatherPos.addEventListener("change", () => onChange("weatherPos", els.weatherPos.value));
  els.weatherAnim?.addEventListener("change", () => onChange("weatherAnim", els.weatherAnim.checked));
  els.typhoonAlert?.addEventListener("change", () => onChange("typhoonAlert", els.typhoonAlert.checked));
  els.opacity.addEventListener("input", () => {
    state.settings.opacity = Number(els.opacity.value);
    persist();
    applyAppearance();
  });
  els.autostart.addEventListener("change", () => onChange("autostart", els.autostart.checked));
}

async function searchCity() {
  const query = els.place.value.trim();
  if (!query) return;
  els.placeList.textContent = "搜索中…";
  try {
    const places = await searchPlaces(query);
    if (!places.length) {
      els.placeList.textContent = "没有找到该地点";
      return;
    }
    els.placeList.innerHTML = places
      .map(
        (item, index) =>
          `<button type="button" data-index="${index}">${item.name}</button>`,
      )
      .join("");
    els.placeList.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", async () => {
        state.settings.weather = places[Number(btn.dataset.index)];
        persist();
        applyAppearance();
        els.place.value = "";
        els.placeList.innerHTML = "";
        await refreshWeather();
      });
    });
  } catch {
    els.placeList.textContent = "搜索失败，请检查网络";
  }
}

function bindEvents() {
  document.getElementById("prev-btn").addEventListener("click", () => goMonth(-1));
  document.getElementById("next-btn").addEventListener("click", () => goMonth(1));
  document.getElementById("today-btn").addEventListener("click", goToday);
  document.getElementById("close-btn").addEventListener("click", hideWindow);
  document.getElementById("settings-btn").addEventListener("click", openSettings);
  document.getElementById("settings-close").addEventListener("click", closeSettings);
  document.getElementById("chart-close")?.addEventListener("click", closeChart);
  els.chartSheet?.addEventListener("click", (event) => {
    if (event.target === els.chartSheet) closeChart();
  });
  els.chartView?.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomChart(event);
  }, { passive: false });
  els.chartView?.addEventListener("dblclick", resetChartPan);
  els.chartView?.addEventListener("pointerdown", (event) => {
    if (chartPan.scale <= 1) return;
    chartPan.drag = { x: event.clientX - chartPan.x, y: event.clientY - chartPan.y };
    els.chartView.setPointerCapture(event.pointerId);
    paintChartPan();
  });
  els.chartView?.addEventListener("pointermove", (event) => {
    if (!chartPan.drag) return;
    chartPan.x = event.clientX - chartPan.drag.x;
    chartPan.y = event.clientY - chartPan.drag.y;
    paintChartPan();
  });
  els.chartView?.addEventListener("pointerup", () => {
    chartPan.drag = null;
    paintChartPan();
  });
  els.chartView?.addEventListener("pointercancel", () => {
    chartPan.drag = null;
    paintChartPan();
  });
  document.getElementById("chart-site")?.addEventListener("click", () => {
    window.open(els.chartSheet?.dataset.page || "https://typhoon.nmc.cn/web.html", "_blank", "noopener");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (els.chartSheet && !els.chartSheet.hidden) closeChart();
  });
  els.checkUpdate?.addEventListener("click", () => checkForUpdate(true));
  els.updateClose?.addEventListener("click", hideUpdateSheet);
  els.updateLater?.addEventListener("click", skipUpdate);
  els.updateNow?.addEventListener("click", startUpdate);
  document.getElementById("place-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    searchCity();
  });
  els.place.addEventListener("focus", () => {
    els.place.removeAttribute("readonly");
  });
  els.grid.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-day]");
    if (!btn) return;
    selectDay(Number(btn.dataset.year), Number(btn.dataset.month), Number(btn.dataset.day));
  });
  document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    if (event.target.closest(".sheet")) return;
    refreshCtxLabels();
    showCtx(event.clientX, event.clientY);
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".ctx")) hideCtx();
  });
  els.ctx.addEventListener("click", async (event) => {
    const act = event.target.closest("button")?.dataset.act;
    hideCtx();
    if (act === "today") goToday();
    if (act === "settings") openSettings();
    if (act === "update") checkForUpdate(true);
    if (act === "desktop") {
      state.settings.layer = state.settings.layer === "desktop" ? "normal" : "desktop";
      persist();
      els.layer.value = state.settings.layer;
      applyAppearance();
      await applyWindowLayer();
    }
    if (act === "autostart") {
      state.settings.autostart = !state.settings.autostart;
      persist();
      applyAppearance();
      await applyAutostart();
    }
    if (act === "hide") hideWindow();
    if (act === "quit") quitApp();
  });
  bindDrag(document.getElementById("drag-bar"));
  bindDrag(document.getElementById("month-drag"));
}

function restoreSelected() {
  const raw = localStorage.getItem(SELECTED_KEY);
  if (!raw) return;
  try {
    const selected = JSON.parse(raw);
    if (selected.year && selected.month && selected.day) {
      state.year = selected.year;
      state.month = selected.month;
      state.selected = selected;
    }
  } catch {
    localStorage.removeItem(SELECTED_KEY);
  }
}

async function bindNativeEvents() {
  try {
    await listen("yanli://settings", openSettings);
    await listen("yanli://today", goToday);
    await listen("yanli://layer", (event) => {
      state.settings.layer = event.payload || "desktop";
      persist();
      els.layer.value = state.settings.layer;
      applyAppearance();
    });
  } catch {
    // 浏览器预览
  }
}

fillSelect(els.size, Object.keys(SIZES).map((id) => ({ id, label: SIZES[id].label })), state.settings.size);
restoreSelected();
bindSettingsForm();
bindEvents();
renderWeekdays();
applyAppearance();
renderMonth();
applyAutostart();
refreshCtxLabels();
refreshWeather();
bindNativeEvents();
document.addEventListener("visibilitychange", () => {
  if (document.hidden) saveWindowPos();
});
(async () => {
  await applyWindowChrome();
  await restorePosition();
})();
setTimeout(() => checkForUpdate(false), 2500);
syncHolidays()
  .then(() => renderMonth())
  .catch(() => {});
state.calendarDay = `${todayParts().year}-${todayParts().month}-${todayParts().day}`;
setInterval(refreshWeather, 30 * 60 * 1000);
setInterval(watchCalendarDay, 60 * 1000);
setInterval(() => {
  syncHolidays()
    .then(() => renderMonth())
    .catch(() => {});
}, 12 * 60 * 60 * 1000);
