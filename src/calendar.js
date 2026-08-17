import { HolidayUtil, Solar } from "lunar-javascript";
import { getExtraFestivals } from "./festivals.js";
import { getNextHoliday, getOfficialMark } from "./holidays.js";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function todayParts(date = new Date()) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

export function shiftMonth(year, month, delta) {
  const next = new Date(year, month - 1 + delta, 1);
  return { year: next.getFullYear(), month: next.getMonth() + 1 };
}

export function getDayInfo(year, month, day) {
  const solar = Solar.fromYmd(year, month, day);
  const lunar = solar.getLunar();
  const week = solar.getWeek();
  const official = getOfficialMark(year, month, day, HolidayUtil);
  const weekend = week === 0 || week === 6;
  const rest = official ? official.kind === "rest" : weekend;
  const work = official?.kind === "work";
  const jieqi = lunar.getJieQi() || "";
  const festivals = unique([
    ...solar.getFestivals(),
    ...lunar.getFestivals(),
    ...lunar.getOtherFestivals(),
    ...getExtraFestivals(year, month, day),
  ]);
  const lunarDay = lunar.getDayInChinese();
  const lunarMonth = lunar.getMonthInChinese();

  let sub = lunarDay === "初一" ? `${lunarMonth}月` : lunarDay;
  if (jieqi) sub = jieqi;
  else if (festivals[0]) sub = festivals[0];
  else if (official && official.kind === "rest") sub = official.name;

  return {
    year,
    month,
    day,
    week,
    weekday: WEEKDAYS[week],
    lunarText: `农历${lunarMonth}月${lunarDay}`,
    ganZhiYear: `${lunar.getYearInGanZhi()}年`,
    zodiac: lunar.getYearShengXiao(),
    jieqi,
    festivals,
    official,
    rest,
    work,
    weekend,
    sub,
    badge: work ? "班" : rest ? "休" : "",
  };
}

export function getMonthGrid(year, month) {
  const first = Solar.fromYmd(year, month, 1);
  const startWeek = first.getWeek();
  const daysInMonth = new Date(year, month, 0).getDate();
  const prev = shiftMonth(year, month, -1);
  const prevDays = new Date(prev.year, prev.month, 0).getDate();
  const cells = [];

  for (let i = 0; i < startWeek; i += 1) {
    const day = prevDays - startWeek + 1 + i;
    cells.push({
      ...getDayInfo(prev.year, prev.month, day),
      inMonth: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      ...getDayInfo(year, month, day),
      inMonth: true,
    });
  }

  const next = shiftMonth(year, month, 1);
  let nextDay = 1;
  while (cells.length % 7 !== 0 || cells.length < 42) {
    cells.push({
      ...getDayInfo(next.year, next.month, nextDay),
      inMonth: false,
    });
    nextDay += 1;
    if (cells.length >= 42) break;
  }

  return cells;
}

export function getMonthMeta(year, month) {
  const solar = Solar.fromYmd(year, month, 1);
  const lunar = solar.getLunar();
  return {
    year,
    month,
    monthLabel: `${month}月`,
    ganZhiYear: `${lunar.getYearInGanZhi()}年`,
    zodiac: lunar.getYearShengXiao(),
  };
}

export function getNextJieQiLabel(year, month, day) {
  const lunar = Solar.fromYmd(year, month, day).getLunar();
  const current = lunar.getJieQi();
  if (current) return `今日节气 · ${current}`;
  const next = lunar.getNextJieQi();
  if (!next) return "";
  const solar = next.getSolar();
  const target = new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay());
  const from = new Date(year, month - 1, day);
  const diff = Math.round((target - from) / 86400000);
  if (diff <= 0) return `节气 · ${next.getName()}`;
  return `距${next.getName()}还有 ${diff} 天`;
}

export function getTodayAlmanac(year, month, day) {
  const lunar = Solar.fromYmd(year, month, day).getLunar();
  const yi = (lunar.getDayYi() || []).slice(0, 2).join(" ");
  const ji = (lunar.getDayJi() || []).slice(0, 2).join(" ");
  return { yi, ji };
}

export function getNextHolidayLabel(from = new Date()) {
  const next = getNextHoliday(from);
  if (!next) return "";
  if (next.days === 0) return `假期中 · ${next.name}`;
  return `距${next.name}还有 ${next.days} 天`;
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

export { WEEKDAYS };
