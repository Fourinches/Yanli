import { formatHierarchy, officialChart, parseCmaWeather, parseTyphoons, searchPlaces, upcomingSevere, weatherFxText, weatherMood } from "./src/weather.js";

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
  weatherMood("台风") !== "rain" ||
  weatherMood("雾") !== "fog"
) {
  throw new Error("天气氛围分类错误");
}

const storms = parseTyphoons({
  views: [
    {
      typhoon: [
        3302529,
        "NANGKA",
        "浪卡",
        2617,
        2617,
        null,
        "",
        "start",
        [
          [1, "202608120000", 0, "TS", 141.7, 21.8, 998, 18, "NE", 36, [["30KTS", 300, 500, 600, 300, 1]], { BABJ: [[12, "t", 144.8, 24.3, 998, 18, "BABJ", "TS"]] }, null],
          [2, "202608121200", 0, "TS", 145.3, 22.9, 998, 18, "E", 24, [["30KTS", 300, 300, 600, 500, 2], ["50KTS", 80, 0, 0, 60, 2]], { BABJ: [[12, "t", 147.3, 26.1, 998, 18, "BABJ", "TS"]] }, null],
        ],
      ],
    },
    {
      typhoon: [1, "X", "已停编", 2601, 2601, null, "", "stop", [[1, "t", 0, "TD", 130, 20, 1000, 15, "N", 10, [], {}, null]]],
    },
  ],
});
if (
  storms.length !== 1 ||
  storms[0].title !== "今年第17号台风「浪卡」· 热带风暴" ||
  storms[0].tone !== "blue" ||
  storms[0].place !== "中心在日本以东洋面（22.9°N 145.3°E）" ||
  storms[0].meta !== "向东 24公里/时 · 中心附近8级 · 998百帕" ||
  storms[0].rings !== "七级风圈 300–600公里 · 十级风圈 60–80公里" ||
  storms[0].past.length !== 2 ||
  storms[0].forecast.length !== 1
) {
  console.error(storms);
  throw new Error("台风通报解析错误");
}

if (
  officialChart("https://image.nmc.cn/product/2026/08/14/TCBU/medium/SEVP_NMC_TCBU.JPG") !== "https://image.nmc.cn/product/2026/08/14/TCBU/medium/SEVP_NMC_TCBU.JPG"
  || officialChart("data:image/jpeg;base64,/9j/") !== "data:image/jpeg;base64,/9j/"
  || officialChart("https://evil.example/TCBU/x.jpg")
  || officialChart("https://image.nmc.cn/product/2026/08/14/SAT/x.jpg")
) {
  throw new Error("官方路径图地址校验错误");
}

if (weatherFxText({ text: "多云", alerts: [{ text: "雷雨大风黄色预警" }] }) !== "雷阵雨") {
  throw new Error("雷雨大风预警应带动雷阵雨特效");
}
if (weatherFxText({ text: "多云", alerts: [] }) !== "多云") {
  throw new Error("无预警时应跟随实况");
}

console.log("weather checks passed", shanghai[0].name, hangzhou[0].name, `北京 ${beijing.temp}° ${beijing.text}`);
