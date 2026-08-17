import { formatHierarchy, parseCmaWeather, searchPlaces, upcomingSevere, weatherMood } from "./src/weather.js";

const shanghai = await searchPlaces("上海");
if (shanghai.length !== 1 || shanghai[0].short !== "上海" || shanghai[0].station !== "58367" || shanghai[0].name !== "上海-中国") {
  console.error(shanghai);
  throw new Error("上海搜索应只返回直辖市站点");
}

const hangzhou = await searchPlaces("杭州");
if (!hangzhou.some((item) => item.short === "杭州" && item.station === "58457" && item.name === "杭州-浙江-中国")) {
  throw new Error("杭州应命中浙江省会");
}

const beijing = parseCmaWeather({
  now: {
    data: {
      now: {
        temperature: 28.7,
        humidity: 58,
        windDirection: "东北风",
        windScale: "微风",
      },
      alarm: [],
    },
  },
  weather: {
    data: {
      daily: [{ dayText: "晴" }],
    },
  },
});
if (beijing.temp !== 29 || beijing.text !== "晴" || beijing.alerts.length) {
  console.error(beijing);
  throw new Error("北京实况解析错误");
}

const warned = parseCmaWeather({
  now: {
    data: {
      now: { temperature: 18, windDirection: "9999", windScale: "微风" },
      alarm: [{ signalType: "大风", signalLevel: "蓝色", title: "北京市气象台发布大风蓝色预警" }],
    },
  },
  weather: { data: { daily: [] } },
});
if (
  warned.text !== "微风" ||
  warned.alerts[0]?.text !== "大风蓝色预警" ||
  warned.alerts[0]?.tone !== "blue" ||
  warned.alerts[0]?.tip !== "关好门窗，远离搭建物"
) {
  console.error(warned);
  throw new Error("官方预警解析错误");
}

const stacked = parseCmaWeather({
  now: {
    data: {
      now: { temperature: 28 },
      alarm: [
        { signalType: "暴雨", signalLevel: "黄色" },
        { signalType: "雷电", signalLevel: "黄色" },
      ],
    },
  },
  weather: { data: { daily: [] } },
});
if (
  stacked.alerts.length !== 2 ||
  stacked.alerts[0].tone !== "yellow" ||
  stacked.alerts[0].tip !== "减少外出，远离积水" ||
  stacked.alerts[1].tone !== "yellow" ||
  stacked.alerts[1].tip !== "请勿户外活动，关闭门窗"
) {
  console.error(stacked.alerts);
  throw new Error("多条预警应分行并给出不同提示");
}

const outlook = upcomingSevere([
  { date: "2026/08/17", dayText: "晴", nightText: "多云" },
  { date: "2026/08/18", dayText: "阴", nightText: "阴" },
  { date: "2026/08/19", dayText: "晴", nightText: "中雨" },
  { date: "2026/08/20", dayText: "雷阵雨", nightText: "多云" },
  { date: "2026/08/21", dayText: "多云", nightText: "晴" },
]);
if (outlook.join() !== "19日中雨,20日雷阵雨") {
  console.error(outlook);
  throw new Error("后几日降雨提示解析错误");
}

const week = upcomingSevere([
  { date: "2026/08/17", dayText: "晴", nightText: "多云" },
  { date: "2026/08/18", dayText: "雷阵雨", nightText: "多云" },
  { date: "2026/08/19", dayText: "多云", nightText: "多云" },
  { date: "2026/08/20", dayText: "雷阵雨", nightText: "多云" },
  { date: "2026/08/21", dayText: "雷阵雨", nightText: "雷阵雨" },
  { date: "2026/08/22", dayText: "雷阵雨", nightText: "雷阵雨" },
  { date: "2026/08/23", dayText: "多云", nightText: "多云" },
]);
if (week.join() !== "18日雷阵雨,20–22日雷阵雨") {
  console.error(week);
  throw new Error("7天预报里的连续降雨应全部显示");
}

if (formatHierarchy("朝阳", "中国, 北京, 朝阳") !== "朝阳区-北京-中国") {
  throw new Error("北京朝阳区划错误");
}
if (formatHierarchy("朝阳", "中国, 辽宁, 朝阳") !== "朝阳-辽宁-中国") {
  throw new Error("辽宁朝阳区划错误");
}
if (formatHierarchy("北京", "中国, 北京, 北京") !== "北京-中国") {
  throw new Error("北京区划错误");
}

if (
  weatherMood("晴") !== "sun" ||
  weatherMood("阴") !== "cloud" ||
  weatherMood("中雨") !== "rain" ||
  weatherMood("小雪") !== "snow" ||
  weatherMood("雷阵雨") !== "thunder" ||
  weatherMood("雾") !== "fog"
) {
  throw new Error("天气氛围分类错误");
}

console.log("weather checks passed", shanghai[0].name, hangzhou[0].name, `北京 ${beijing.temp}° ${beijing.text}`);
