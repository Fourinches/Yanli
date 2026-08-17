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

function officialAlerts(alarm) {
  if (!Array.isArray(alarm) || !alarm.length) return [];
  return alarm
    .map((item) => {
      const type = clean(item.signalType || item.signaltype || item.type);
      const level = clean(item.signalLevel || item.signallevel || item.level);
      const title = clean(item.title || item.issuecontent || item.description);
      const text = type && level ? `${type}${level}预警` : title;
      if (!text) return null;
      const danger = /红|橙/.test(`${level}${title}`);
      return { level: danger ? "danger" : "warn", text };
    })
    .filter(Boolean)
    .slice(0, 2);
}

const SEVERE = /雨|雪|雹|雷|台风|沙尘/;

function severeText(day) {
  const dayText = clean(day.dayText);
  const nightText = clean(day.nightText);
  if (SEVERE.test(dayText)) return dayText;
  if (SEVERE.test(nightText)) return nightText;
  return "";
}

function dayLabel(dateStr) {
  const match = String(dateStr || "").match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return match ? `${Number(match[3])}日` : "";
}

export function upcomingSevere(daily = []) {
  const tips = [];
  for (const day of daily.slice(1)) {
    const text = severeText(day);
    const label = dayLabel(day.date);
    if (!text || !label) continue;
    tips.push(`${label}${text}`);
    if (tips.length >= 2) break;
  }
  return tips;
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

export async function fetchWeather(place) {
  const station = resolveStation(place);
  if (!station) throw new Error("未选择城市");
  const bundle = await invoke("cma_get", { kind: "now", q: station });
  const parsed = parseCmaWeather(bundle);
  if (parsed.temp == null) throw new Error("天气获取失败");
  return parsed;
}
