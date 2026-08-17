import { formatHierarchy, parseCmaWeather, searchPlaces, upcomingSevere } from "./src/weather.js";

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
if (warned.text !== "微风" || warned.alerts[0]?.text !== "大风蓝色预警") {
  console.error(warned);
  throw new Error("官方预警解析错误");
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

if (formatHierarchy("朝阳", "中国, 北京, 朝阳") !== "朝阳区-北京-中国") {
  throw new Error("北京朝阳区划错误");
}
if (formatHierarchy("朝阳", "中国, 辽宁, 朝阳") !== "朝阳-辽宁-中国") {
  throw new Error("辽宁朝阳区划错误");
}
if (formatHierarchy("北京", "中国, 北京, 北京") !== "北京-中国") {
  throw new Error("北京区划错误");
}

console.log("weather checks passed", shanghai[0].name, hangzhou[0].name, `北京 ${beijing.temp}° ${beijing.text}`);
