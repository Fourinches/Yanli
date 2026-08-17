/**
 * 法定放假与调休。
 * 内置 2026 年国办发明电〔2025〕7号作为离线兜底；
 * 启动后会向 holiday-cn / timor.tech 拉取当年与次年数据并覆盖。
 */
const BUNDLED = {
  "2026-01-01": { name: "元旦", kind: "rest" },
  "2026-01-02": { name: "元旦", kind: "rest" },
  "2026-01-03": { name: "元旦", kind: "rest" },
  "2026-01-04": { name: "元旦调休", kind: "work" },
  "2026-02-14": { name: "春节调休", kind: "work" },
  "2026-02-15": { name: "春节", kind: "rest" },
  "2026-02-16": { name: "春节", kind: "rest" },
  "2026-02-17": { name: "春节", kind: "rest" },
  "2026-02-18": { name: "春节", kind: "rest" },
  "2026-02-19": { name: "春节", kind: "rest" },
  "2026-02-20": { name: "春节", kind: "rest" },
  "2026-02-21": { name: "春节", kind: "rest" },
  "2026-02-22": { name: "春节", kind: "rest" },
  "2026-02-23": { name: "春节", kind: "rest" },
  "2026-02-28": { name: "春节调休", kind: "work" },
  "2026-04-04": { name: "清明", kind: "rest" },
  "2026-04-05": { name: "清明", kind: "rest" },
  "2026-04-06": { name: "清明", kind: "rest" },
  "2026-05-01": { name: "劳动节", kind: "rest" },
  "2026-05-02": { name: "劳动节", kind: "rest" },
  "2026-05-03": { name: "劳动节", kind: "rest" },
  "2026-05-04": { name: "劳动节", kind: "rest" },
  "2026-05-05": { name: "劳动节", kind: "rest" },
  "2026-05-09": { name: "劳动节调休", kind: "work" },
  "2026-06-19": { name: "端午", kind: "rest" },
  "2026-06-20": { name: "端午", kind: "rest" },
  "2026-06-21": { name: "端午", kind: "rest" },
  "2026-09-20": { name: "国庆调休", kind: "work" },
  "2026-09-25": { name: "中秋", kind: "rest" },
  "2026-09-26": { name: "中秋", kind: "rest" },
  "2026-09-27": { name: "中秋", kind: "rest" },
  "2026-10-01": { name: "国庆", kind: "rest" },
  "2026-10-02": { name: "国庆", kind: "rest" },
  "2026-10-03": { name: "国庆", kind: "rest" },
  "2026-10-04": { name: "国庆", kind: "rest" },
  "2026-10-05": { name: "国庆", kind: "rest" },
  "2026-10-06": { name: "国庆", kind: "rest" },
  "2026-10-07": { name: "国庆", kind: "rest" },
  "2026-10-10": { name: "国庆调休", kind: "work" },
};

const CACHE_KEY = "yanli-holiday-cache";
let remote = loadCache();

function storage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function loadCache() {
  try {
    const raw = storage()?.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed.days && typeof parsed.days === "object" ? parsed.days : {};
  } catch {
    return {};
  }
}

function saveCache(days) {
  storage()?.setItem(CACHE_KEY, JSON.stringify({ days, fetchedAt: Date.now() }));
}

export function dateKey(year, month, day) {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export function holidayMap() {
  return { ...BUNDLED, ...remote };
}

export function getOfficialMark(year, month, day, holidayUtil) {
  const key = dateKey(year, month, day);
  const hit = remote[key] || BUNDLED[key];
  if (hit) return hit;
  if (!holidayUtil) return null;
  const holiday = holidayUtil.getHoliday(year, month, day);
  if (!holiday) return null;
  return {
    name: holiday.getName(),
    kind: holiday.isWork() ? "work" : "rest",
  };
}

function fromHolidayCn(data) {
  const map = {};
  for (const item of data.days || []) {
    if (!item.date) continue;
    map[item.date] = {
      name: item.isOffDay ? item.name : `${item.name}调休`,
      kind: item.isOffDay ? "rest" : "work",
    };
  }
  return map;
}

function fromTimor(data) {
  const map = {};
  const holiday = data.holiday || {};
  for (const item of Object.values(holiday)) {
    if (!item?.date) continue;
    map[item.date] = {
      name: item.holiday ? item.name : item.name || "调休",
      kind: item.holiday ? "rest" : "work",
    };
  }
  return map;
}

async function fetchYear(year) {
  const sources = [
    `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`,
    `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`,
    `https://timor.tech/api/holiday/year/${year}`,
  ];
  for (const url of sources) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data.days)) return fromHolidayCn(data);
      if (data.holiday) return fromTimor(data);
    } catch {
      // 试下一个源
    }
  }
  return {};
}

export async function syncHolidays(now = new Date()) {
  const years = [now.getFullYear(), now.getFullYear() + 1];
  const merged = {};
  let got = false;
  for (const year of years) {
    const part = await fetchYear(year);
    if (Object.keys(part).length) {
      Object.assign(merged, part);
      got = true;
    }
  }
  if (!got) return holidayMap();
  remote = merged;
  saveCache(merged);
  return holidayMap();
}

export function getNextHoliday(from = new Date()) {
  const map = holidayMap();
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < 400; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = dateKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
    const mark = map[key];
    if (!mark || mark.kind !== "rest") continue;
    const prev = new Date(date);
    prev.setDate(date.getDate() - 1);
    const prevKey = dateKey(prev.getFullYear(), prev.getMonth() + 1, prev.getDate());
    const prevMark = map[prevKey];
    if (i > 0 && prevMark?.kind === "rest" && prevMark.name === mark.name) continue;
    return {
      name: mark.name.replace(/调休$/, ""),
      date: key,
      days: i,
    };
  }
  return null;
}
