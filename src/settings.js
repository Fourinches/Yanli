const KEY = "yanli-settings";

export const SIZES = {
  s: { width: 316, height: 452, label: "小" },
  m: { width: 392, height: 596, label: "中" },
  l: { width: 468, height: 708, label: "大" },
};

export const THEMES = [
  { id: "frost", label: "霜白" },
  { id: "night", label: "夜墨" },
  { id: "paper", label: "宣纸" },
  { id: "moss", label: "青苔" },
];

export const FONTS = [
  { id: "yahei", label: "微软雅黑", value: '"Microsoft YaHei UI","PingFang SC","Noto Sans SC",sans-serif' },
  { id: "kaiti", label: "楷体", value: '"KaiTi","STKaiti","楷体","Microsoft YaHei UI",serif' },
  { id: "songti", label: "宋体", value: '"SimSun","Songti SC","宋体","Microsoft YaHei UI",serif' },
  { id: "heiti", label: "黑体", value: '"SimHei","Heiti SC","黑体","Microsoft YaHei UI",sans-serif' },
];

export const LAYERS = [
  { id: "desktop", label: "贴桌面" },
  { id: "normal", label: "普通窗口" },
  { id: "top", label: "浮在最前" },
];

export const WEATHER_POS = [
  { id: "top", label: "顶部" },
  { id: "bottom", label: "底部" },
  { id: "off", label: "不显示" },
];

export const DEFAULTS = {
  size: "m",
  theme: "frost",
  opacity: 86,
  font: "yahei",
  layer: "desktop",
  autostart: true,
  weatherPos: "top",
  weather: null,
};

export function hasSavedSettings() {
  return Boolean(localStorage.getItem(KEY));
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(next) {
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function fontValue(id) {
  return FONTS.find((item) => item.id === id)?.value || FONTS[0].value;
}
