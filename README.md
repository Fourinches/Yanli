# 砚历

可贴在桌面上的中国日历：农历、节气、节日、法定放假与调休、中央气象台天气。

支持 **Windows** 与 **macOS**。

## 安装包

Windows 安装程序会询问：

- 是否创建桌面快捷方式
- 是否开机自动启动

macOS 为 **Intel + Apple Silicon 通用包**。把 `Yanli.app` 拖到「应用程序」后再打开。

若提示无法验证开发者：按住 Control 单击应用选「打开」，或在终端执行：

```bash
xattr -cr /Applications/Yanli.app
```

开机启动在应用右键菜单或设置里开关。

发布页：<https://github.com/Fourinches/Yanli/releases>

## 开发

```bash
npm install
npm run tauri dev
```

```bash
npm run tauri -- build --bundles nsis   # Windows
npm run tauri -- build --bundles dmg    # macOS
```

## 用法

- 拖动标题或月份区域移动窗口
- 右键：回到今天、设置、贴桌面、开机启动、隐藏、退出
- 设置里可改尺寸、配色、透明度、字体、显示层级、天气城市
- 托盘图标可再次打开日历

放假安排会自动从 [holiday-cn](https://github.com/NateScarlet/holiday-cn) 更新，离线时用内置的国务院通知。天气与预警来自[中央气象台](https://weather.cma.cn/)。
