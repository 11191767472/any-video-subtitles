# 任意视频字幕 · Any Video Subtitles

一个开源的 Chrome 扩展（Manifest V3，原生 JS、零依赖）：给**任意网页上的 `<video>`** 手动加载、编辑、打轴和调校字幕。功能对标 Substital / +Sub 这类「任意网页视频挂字幕」工具。

![license](https://img.shields.io/badge/license-MIT-green)
![manifest](https://img.shields.io/badge/manifest-V3-blue)
![deps](https://img.shields.io/badge/dependencies-0-brightgreen)

**仓库**：<https://github.com/11191767472/any-video-subtitles>

## 安装（开发者模式加载）

1. 打开 `chrome://extensions`
2. 右上角开启「开发者模式」
3. 「加载已解压的扩展程序」→ 选择本目录（含 `manifest.json`）
4. 需要给本地文件视频加字幕时，在扩展详情里打开「允许访问文件网址」

无任何构建步骤，改完代码刷新扩展 + 页面即可生效。

## 更新

拉取最新代码后，回到 `chrome://extensions` 点扩展卡片上的刷新按钮即可（若只改了内容脚本，刷新网页就够）：

```bash
git pull --rebase origin main
```

## 功能

- **任意网页**：内容脚本注入所有页面和 iframe，深度扫描 Shadow DOM，很多自定义播放器里藏着的 `<video>` 也能找到
- **格式**：SRT / WebVTT / ASS(SSA) 解析，纯文本台词（空行分段）按阅读速度自动铺时间轴
- **手动打轴**：`Alt+Z` 打点式做时间轴（上一句自动收尾并开新句），`Alt+X` 收尾，打完直接在列表里输入台词
- **同步**：字幕比人声早就「延后」、晚了就「提前」，±100ms / ±1s 按钮或直接输毫秒；`Alt+A` 把当前（或下一句）字幕起点一键对齐到此刻；`Alt+←/→` 边播边微调 250ms。每次调整都会在视频上方弹一个提示（`字幕延后 1.5s`），避免「点了看不出变化」
- **编辑**：可视化列表，改文本、改起止时间、增删、搜索；点时间码跳播
- **样式**：字号（随视频尺寸等比缩放）、文字/底衬颜色、描边、粗体、垂直位置、最大宽度
- **记忆**：按「站点 + 视频源指纹」存档到 `chrome.storage.local`，下次打开同一视频自动加载；跨 frame 同步（不掺时长，避免直播/渐进加载时反复重载）
- **导出**：SRT / VTT
- **全屏**：自动把字幕层挂进全屏元素，原生全屏可用
- **快捷键**：面板开关 `Alt+Shift+S`（可在 `chrome://extensions/shortcuts` 改）
- **默认收起**：打开网页时面板不自动弹出，只在右下角显示一个「字」浮动按钮；点它、按 `Alt+Shift+S`、或在弹出菜单点「打开面板」即可展开

## 快捷键

| 按键 | 作用 |
| --- | --- |
| `Alt+Shift+S` | 开 / 关字幕面板 |
| `Alt+Z` | 打点：结束上一句并在当前时刻开新句 |
| `Alt+X` | 结束当前句，停止连续打轴 |
| `Alt+←` / `Alt+→` | 字幕提前 / 延后 250ms（边播边调） |
| `Alt+A` | 当前字幕起点对齐到此刻（对轴神器） |
| `Alt+P` | 播放 / 暂停 |

## 本地测试

`demo/test-page.html` 是一个示例页（含示例视频和 `demo/sample.srt`）。也可以直接访问任意有视频的网站试。

## 目录结构

```
manifest.json          MV3 清单
src/lib/parser.js      SRT/VTT/ASS/纯文本 解析与导出（可独立复用，Node 也可跑）
src/content/overlay.js 字幕渲染层：fixed 定位跟随 video rect，shadow DOM 隔离
src/content/panel.js   控制面板 UI（shadow DOM）
src/content/content.js 主控：视频扫描、时间轴驱动、存储、快捷键、消息
src/popup/             工具栏弹窗：总开关、默认样式、字幕库管理
src/sw.js              service worker：安装默认值、全局快捷键转发
tools/                 图标生成脚本（make_icons.py，纯 Python 手写 PNG 编码器，无第三方依赖）
demo/                  本地测试页
```

## 已知边界

- 字幕层叠在原生 `<video>` 之上；对 **canvas 绘制型播放器**（极少数）和画中画窗口无效
- 跨域 iframe 里的视频：面板在顶层页面，iframe 内视频通过存储指纹自动匹配存档，若匹配不上请把该 iframe 页直接打开后加载
- Netflix 等用 EME 加密流的站点，视频可叠加字幕，但自定义样式不会作用于其自带的字幕轨
- 存档上限 40 个视频（自动清理最旧的）

## License

MIT
