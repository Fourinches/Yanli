import { invoke } from "@tauri-apps/api/core";

const CITIES = [
  ["北京", "直辖市", "54511"],
  ["上海", "直辖市", "58367"],
  ["天津", "直辖市", "54527"],
  ["重庆", "直辖市", "57516"],
  ["广州", "广东", "59287"],
  ["深圳", "广东", "59493"],
  ["东莞", "广东", "59289"],
  ["佛山", "广东", "59288"],
  ["珠海", "广东", "59488"],
  ["中山", "广东", "59485"],
  ["惠州", "广东", "59297"],
  ["汕头", "广东", "59316"],
  ["湛江", "广东", "59658"],
  ["杭州", "浙江", "58457"],
  ["宁波", "浙江", "58467"],
  ["温州", "浙江", "58659"],
  ["嘉兴", "浙江", "58452"],
  ["绍兴", "浙江", "58453"],
  ["金华", "浙江", "58549"],
  ["南京", "江苏", "58238"],
  ["苏州", "江苏", "58357"],
  ["无锡", "江苏", "58354"],
  ["常州", "江苏", "58343"],
  ["南通", "江苏", "58259"],
  ["徐州", "江苏", "58027"],
  ["扬州", "江苏", "58245"],
  ["成都", "四川", "56294"],
  ["绵阳", "四川", "56196"],
  ["武汉", "湖北", "57494"],
  ["宜昌", "湖北", "57461"],
  ["西安", "陕西", "57036"],
  ["郑州", "河南", "57083"],
  ["洛阳", "河南", "57073"],
  ["长沙", "湖南", "57687"],
  ["沈阳", "辽宁", "54342"],
  ["大连", "辽宁", "54662"],
  ["青岛", "山东", "54857"],
  ["济南", "山东", "54823"],
  ["烟台", "山东", "54765"],
  ["厦门", "福建", "59134"],
  ["福州", "福建", "58847"],
  ["泉州", "福建", "58936"],
  ["合肥", "安徽", "58321"],
  ["哈尔滨", "黑龙江", "50953"],
  ["长春", "吉林", "54161"],
  ["昆明", "云南", "56778"],
  ["南昌", "江西", "58606"],
  ["石家庄", "河北", "53698"],
  ["唐山", "河北", "54534"],
  ["太原", "山西", "53772"],
  ["南宁", "广西", "59431"],
  ["桂林", "广西", "57957"],
  ["海口", "海南", "59758"],
  ["三亚", "海南", "59948"],
  ["贵阳", "贵州", "57816"],
  ["兰州", "甘肃", "52889"],
  ["银川", "宁夏", "53614"],
  ["西宁", "青海", "52866"],
  ["乌鲁木齐", "新疆", "51463"],
  ["拉萨", "西藏", "55591"],
  ["呼和浩特", "内蒙古", "53463"],
  ["香港", "香港", "45007"],
  ["澳门", "澳门", "45011"],
  ["台北", "台湾", "58968"],
];

const DIRECT = new Set(["北京", "上海", "天津", "重庆"]);

function toPlace(name, region, station) {
  const admin = region && region !== "直辖市" && region !== name ? region : "";
  return {
    name: [name, admin, "中国"].filter(Boolean).join("-"),
    short: name,
    station,
  };
}

export function formatHierarchy(name, path = "") {
  const parts = String(path)
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const country = parts[0] || "中国";
  const rest = parts.slice(1);
  let leaf = rest[rest.length - 1] || name;
  const admins = rest.slice(0, -1).filter((item) => item && item !== leaf);
  const nearest = admins[admins.length - 1] || "";
  if (DIRECT.has(nearest) && leaf !== nearest && !/[区县市]$/.test(leaf)) {
    leaf += "区";
  }
  return [leaf, ...admins.slice().reverse(), country].filter(
    (item, index, list) => item && list.indexOf(item) === index,
  ).join("-");
}

function localMatches(query) {
  return CITIES.filter(([name, region]) => name.includes(query) || region.includes(query)).map(
    ([name, region, station]) => toPlace(name, region, station),
  );
}

export function resolveStation(place) {
  if (!place) return "";
  if (place.station) return String(place.station);
  const name = place.short || String(place.name || "").split(" · ")[0];
  return CITIES.find(([item]) => item === name)?.[2] || "";
}

function clean(value) {
  if (value == null) return "";
  const text = String(value).trim();
  if (!text || text === "9999") return "";
  return text;
}

const ALERT_TIPS = [
  { test: /台风|龙卷/, tip: "请勿外出，关好门窗" },
  { test: /暴雨/, tip: "减少外出，远离积水" },
  { test: /雷/, tip: "请勿户外活动，关闭门窗" },
  { test: /冰雹/, tip: "请勿外出，远离玻璃窗" },
  { test: /大风|狂风/, tip: "关好门窗，远离搭建物" },
  { test: /高温/, tip: "减少户外活动，注意防暑" },
  { test: /寒潮|霜冻|低温/, tip: "注意保暖，减少外出" },
  { test: /大雾|霾|雾/, tip: "减少外出，出行注意安全" },
  { test: /暴雪|雪/, tip: "减少外出，注意路面湿滑" },
  { test: /结冰|道路/, tip: "出行小心路滑" },
  { test: /火险|森林/, tip: "严禁野外用火" },
  { test: /沙尘/, tip: "减少外出，关好门窗" },
];

function alertTone(level, title) {
  const key = `${level}${title}`;
  if (/红/.test(key)) return "red";
  if (/橙/.test(key)) return "orange";
  if (/黄/.test(key)) return "yellow";
  if (/蓝/.test(key)) return "blue";
  return "yellow";
}

function alertTip(type, title) {
  const key = `${type}${title}`;
  return ALERT_TIPS.find((item) => item.test.test(key))?.tip || "注意防范，减少外出";
}

function officialAlerts(alarm) {
  if (!Array.isArray(alarm) || !alarm.length) return [];
  return alarm
    .map((item) => {
      const type = clean(item.signalType || item.signaltype || item.type);
      const level = clean(item.signalLevel || item.signallevel || item.level);
      const title = clean(item.title || item.issuecontent || item.description);
      const text = type && level ? `${type}${level}预警` : title;
      if (!text) return null;
      return { text, tone: alertTone(level, title), tip: alertTip(type, title) };
    })
    .filter(Boolean)
    .slice(0, 3);
}

const SEVERE = /雨|雪|雹|雷|台风|沙尘/;

function severeText(day) {
  const dayText = clean(day.dayText);
  const nightText = clean(day.nightText);
  if (SEVERE.test(dayText)) return dayText;
  if (SEVERE.test(nightText)) return nightText;
  return "";
}

function parseDayDate(dateStr) {
  const match = String(dateStr || "").match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function sameDate(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function nextDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

function rangeLabel(start, end, text) {
  if (sameDate(start, end)) return `${start.getDate()}日${text}`;
  return `${start.getDate()}–${end.getDate()}日${text}`;
}

export function upcomingSevere(daily = []) {
  const groups = [];
  for (const day of daily.slice(1)) {
    const text = severeText(day);
    const date = parseDayDate(day.date);
    if (!text || !date) continue;
    const last = groups[groups.length - 1];
    if (last && last.text === text && sameDate(nextDate(last.end), date)) {
      last.end = date;
    } else {
      groups.push({ start: date, end: date, text });
    }
  }
  return groups.map((item) => rangeLabel(item.start, item.end, item.text));
}

export function parseCmaWeather(bundle) {
  const nowWrap = bundle?.now?.data || {};
  const now = nowWrap.now || {};
  const daily = bundle?.weather?.data?.daily || [];
  const today = daily[0] || {};
  const text = clean(today.dayText) || [clean(now.windDirection), clean(now.windScale)].filter(Boolean).join("") || "天气";
  const temp = Number(now.temperature);
  return {
    temp: Number.isFinite(temp) ? Math.round(temp) : null,
    text,
    humidity: now.humidity,
    alerts: officialAlerts(nowWrap.alarm),
    outlook: upcomingSevere(daily),
  };
}

function parseSearchRow(row) {
  if (row && typeof row === "object") {
    if (!row.station || !row.name) return null;
    return {
      name: formatHierarchy(row.name, row.path || ""),
      short: row.name,
      station: String(row.station),
    };
  }
  const [station, name, , country] = String(row).split("|");
  if (!station || !name || country !== "中国") return null;
  return { name: formatHierarchy(name, ""), short: name, station };
}

export async function searchPlaces(query) {
  const name = query.trim().replace(/市$/, "");
  if (name.length < 1) return [];
  const local = localMatches(name);
  if (local.length && (name.length <= 3 || local.some((item) => item.short === name))) {
    return local.slice(0, 8);
  }

  const data = await invoke("cma_get", { kind: "search", q: name });
  const remote = (data.data || [])
    .map(parseSearchRow)
    .filter(Boolean)
    .filter((item, index, list) => list.findIndex((other) => other.station === item.station) === index);
  const merged = [...local];
  for (const item of remote) {
    if (!merged.some((other) => other.station === item.station)) {
      merged.push(item);
    }
  }
  merged.sort((a, b) => Number(b.name.startsWith(name)) - Number(a.name.startsWith(name)));
  return merged.slice(0, 8);
}

export function weatherMood(text = "") {
  const value = String(text);
  if (/雷/.test(value)) return "thunder";
  if (/台风/.test(value)) return "rain";
  if (/雪|雹/.test(value)) return "snow";
  if (/雨/.test(value)) return "rain";
  if (/雾|霾|沙尘|扬沙/.test(value)) return "fog";
  if (/阴|云/.test(value)) return "cloud";
  if (/晴/.test(value)) return "sun";
  return "haze";
}

export async function fetchWeather(place) {
  const station = resolveStation(place);
  if (!station) throw new Error("未选择城市");
  const bundle = await invoke("cma_get", { kind: "now", q: station });
  const parsed = parseCmaWeather(bundle);
  if (parsed.temp == null) throw new Error("天气获取失败");
  return parsed;
}

const GRADE = {
  TD: "热带低压",
  TS: "热带风暴",
  STS: "强热带风暴",
  TY: "台风",
  STY: "强台风",
  SuperTY: "超强台风",
};

const DIR = {
  N: "北",
  NNE: "东北北",
  NE: "东北",
  ENE: "东北东",
  E: "东",
  ESE: "东南东",
  SE: "东南",
  SSE: "东南南",
  S: "南",
  SSW: "西南南",
  SW: "西南",
  WSW: "西南西",
  W: "西",
  WNW: "西北西",
  NW: "西北",
  NNW: "西北北",
};

const RING = { "30KTS": "七级", "50KTS": "十级", "64KTS": "十二级" };

function stormNo(num) {
  const text = String(num || "");
  if (/^\d{4}$/.test(text)) return `今年第${Number(text.slice(2))}号`;
  if (/^20\d{6}$/.test(text)) return `今年第${Number(text.slice(4))}号`;
  return "";
}

function windScale(ms) {
  const speed = Number(ms);
  if (!Number.isFinite(speed)) return "";
  const steps = [0.3, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7, 37, 41.5, 46.2, 51, 56.1];
  let level = 0;
  for (let i = 0; i < steps.length; i += 1) {
    if (speed >= steps[i]) level = i + 1;
  }
  return level ? `${level}级` : "微风";
}

function stormTone(grade) {
  if (grade === "SuperTY" || grade === "STY") return "red";
  if (grade === "TY") return "orange";
  if (grade === "STS") return "yellow";
  return "blue";
}

function ringRadii(circles) {
  if (!Array.isArray(circles)) return [];
  return circles
    .map((row) => {
      if (!Array.isArray(row) || !RING[row[0]]) return 0;
      const radii = row.slice(1, 5).map(Number).filter((n) => n > 0);
      return radii.length ? Math.max(...radii) : 0;
    })
    .filter((km) => km > 0);
}

function ringText(circles) {
  if (!Array.isArray(circles)) return "";
  return circles
    .map((row) => {
      if (!Array.isArray(row)) return "";
      const label = RING[row[0]];
      const radii = row.slice(1, 5).map(Number).filter((n) => n > 0);
      if (!label || !radii.length) return "";
      const min = Math.min(...radii);
      const max = Math.max(...radii);
      return `${label}风圈 ${min === max ? `${min}公里` : `${min}–${max}公里`}`;
    })
    .filter(Boolean)
    .join(" · ");
}

function asPoint(row) {
  if (!Array.isArray(row) || row.length < 6) return null;
  const lon = Number(row[4]);
  const lat = Number(row[5]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return { lon, lat };
}

function parseStorm(typhoon) {
  if (!Array.isArray(typhoon) || typhoon.length < 9) return null;
  const [, , cn, num, , , , status, points] = typhoon;
  if (status === "stop" || !Array.isArray(points) || !points.length) return null;
  const latest = points[points.length - 1];
  if (!Array.isArray(latest) || latest.length < 10) return null;
  const grade = String(latest[3] || "TD");
  const named = Boolean(cn) && cn !== "热带低压" && cn !== "nameless";
  const no = stormNo(num);
  const title = named ? `${no}台风「${cn}」· ${GRADE[grade] || grade}` : `${no}${GRADE[grade] || "热带低压"}`;
  const dir = DIR[latest[8]] || "";
  const speed = Number(latest[9]);
  const pressure = Number(latest[6]);
  const move = [dir && `向${dir}`, Number.isFinite(speed) && speed > 0 ? `${Math.round(speed)}公里/时` : ""]
    .filter(Boolean)
    .join(" ");
  const center = [`中心附近${windScale(latest[7])}`, Number.isFinite(pressure) ? `${Math.round(pressure)}百帕` : ""]
    .filter(Boolean)
    .join(" · ");
  const forecast = Array.isArray(latest[11]?.BABJ) ? latest[11].BABJ.map((row) => asPoint([0, 0, 0, 0, row[2], row[3]])).filter(Boolean) : [];
  return {
    title: title.trim(),
    tone: stormTone(grade),
    named,
    lon: Number(latest[4]),
    meta: [move, center].filter(Boolean).join(" · "),
    rings: ringText(latest[10]),
    ringKm: ringRadii(latest[10]),
    past: points.map(asPoint).filter(Boolean),
    forecast,
  };
}

export function parseTyphoons(bundle) {
  return (bundle?.views || [])
    .map((view) => parseStorm(view?.typhoon || view))
    .filter(Boolean)
    .sort((a, b) => Number(b.named) - Number(a.named) || a.lon - b.lon)
    .slice(0, 2);
}

export async function fetchTyphoons() {
  const bundle = await invoke("cma_get", { kind: "typhoon", q: "" });
  return parseTyphoons(bundle);
}
