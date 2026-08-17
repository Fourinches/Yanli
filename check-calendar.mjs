import { HolidayUtil, Solar } from "lunar-javascript";
import { getDayInfo, getMonthGrid, getNextHolidayLabel, getTodayAlmanac } from "./src/calendar.js";

const samples = [
  [2026, 1, 1, "rest", "元旦"],
  [2026, 1, 4, "work", "元旦调休"],
  [2026, 2, 17, "rest", "春节"],
  [2026, 2, 14, "work", "春节调休"],
  [2026, 8, 16, "rest", "周日"],
  [2026, 8, 17, "workday", "周一工作日"],
  [2026, 10, 1, "rest", "国庆"],
  [2026, 10, 10, "work", "国庆调休"],
  [2026, 10, 31, "rest", "万圣节周末"],
  [2026, 2, 14, "work", "情人节兼调休"],
];

let failed = 0;
for (const [y, m, d, kind, label] of samples) {
  const info = getDayInfo(y, m, d);
  const ok =
    kind === "work"
      ? info.work
      : kind === "workday"
        ? !info.work && !info.rest
        : info.rest && !info.work;
  const mark = ok ? "OK" : "FAIL";
  if (!ok) failed += 1;
  console.log(`${mark} ${y}-${m}-${d} ${label} rest=${info.rest} work=${info.work} sub=${info.sub} festivals=${info.festivals.join("/") || "-"}`);
}

const aug = getMonthGrid(2026, 8).filter((c) => c.inMonth);
const restDays = aug.filter((c) => c.rest && !c.work).map((c) => c.day);
console.log(`2026-08 in-month days: ${aug.length}`);
console.log(`2026-08 rest days: ${restDays.join(",")}`);

const today = Solar.fromYmd(2026, 8, 17);
console.log(`HolidayUtil 2026-10-01: ${HolidayUtil.getHoliday(2026, 10, 1)}`);
console.log(`Solar 2026-08-17: ${today.toFullString()}`);

if (failed) {
  console.error(`failed: ${failed}`);
  process.exit(1);
}
const halloween = getDayInfo(2026, 10, 31);
if (!halloween.festivals.includes("万圣节")) {
  console.error("missing 万圣节");
  process.exit(1);
}
const valentine = getDayInfo(2026, 2, 14);
if (!valentine.festivals.includes("情人节")) {
  console.error("missing 情人节");
  process.exit(1);
}
const nextHoliday = getNextHolidayLabel(new Date(2026, 7, 17));
if (nextHoliday !== "距中秋还有 39 天") {
  console.error(`next holiday: ${nextHoliday}`);
  process.exit(1);
}
const laterDay = getNextHolidayLabel(new Date(2026, 7, 19));
if (laterDay !== "距中秋还有 37 天") {
  console.error(`later day: ${laterDay}`);
  process.exit(1);
}
const midHoliday = getNextHolidayLabel(new Date(2026, 9, 3));
if (midHoliday !== "假期中 · 国庆") {
  console.error(`mid holiday: ${midHoliday}`);
  process.exit(1);
}
const almanac = getTodayAlmanac(2026, 8, 17);
if (!almanac.yi || !almanac.ji) {
  console.error(almanac);
  process.exit(1);
}
console.log(`next holiday: ${nextHoliday}`);
console.log(`almanac: 宜 ${almanac.yi} · 忌 ${almanac.ji}`);
console.log("calendar checks passed");
