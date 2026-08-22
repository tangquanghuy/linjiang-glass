# 小手机脚本

贴进 SillyTavern 运行的单文件脚本。**`小手机脚本.js` 是构建产物，不要直接改**，
改 `src/` 下的分片，然后：

```bash
npm run phone:build    # 重新拼出 小手机脚本.js
npm run phone:check    # 校验产物是否与 src/ 同步（提交前跑）
npm run phone:shot     # 起 vite + Playwright，把各屏截图存到 artifacts/phone/
```

截图用的假酒馆环境在 `preview/`（`mock.js` 是假数据，改它就能换预览内容）。
正式环境由玻璃状态栏「更多 → 随身手机」唤起，脚本本身不再创建悬浮球。
迭代样式时只截需要的页面会快很多：

```bash
$env:PHONE_APPS='messages,friends'; npm run phone:shot   # 只截这两个 App
$env:PHONE_MOBILE='1'; npm run phone:shot                # 390×844 移动视口，产物带 m- 前缀
```

## 为什么是拼接，不是 ES 模块

脚本运行时所有函数共享同一个顶层作用域：内联 `onclick`、`window.xxx` 暴露、
跨区域直接调用都依赖这一点，酒馆那边也没有打包步骤。所以 `build.mjs` 只做
纯文本拼接 + CSS 内联。拆分那一次的产物去掉 4 行 banner 后与原文件 SHA256 完全相同。
**代价**：没有静态依赖检查，动手前先看清调用关系。

`build.mjs` 会拦住两类最容易复发的错误：
- `src/` 里有 `.js` 没登记进 `PARTS` → 直接报错，不会静默丢代码
- 某个 css 分片花括号没闭合，或 `@keyframes` 全局重名 → 直接报错（这两个坑都真的踩过，见下）

## 结构

`src/*.js` 按运行顺序编号，顺序在 `build.mjs` 的 `PARTS` 里。

| 分片 | 内容 |
| --- | --- |
| `01-font-awesome` | 图标库按需加载（酒馆一般自带，缺了才补） |
| `02-styles` | 样式注入壳；CSS 实体在 `src/css/`，构建时按 `/* @@include */` 内联 |
| `03-state` / `04-viewport` / `05-runtime-state` | 全局状态、视口工具、拖动/壁纸/聊天运行时状态 |
| `06-init` | `initializeMobilePhone`：建整个 DOM |
| `07-events` | `bindPhoneEvents`：事件绑定 |
| `09-page-swipe` | 主屏分页滑动 |
| `10-mvu-data` / `11-ui-update` | MVU 变量读取、数据 → UI |
| `12-phone-controls` | 开关手机、置顶、拖动手机、App 面板开关（App 标题在这里） |
| `13-message-sender` | `MessageSender` 类 + `window.messageSender` |
| `14-chat-panel` / `15-images` / `16-chat-extract` / `17-messages-panel` | 聊天相关；`17` 里还有共用的 `renderPhoneAvatar` / `renderAffection` |
| `18-cg-data` / `19-cg-gallery` / `29-cg-fullscreen` | CG 图鉴（同时被拆成独立页面，见下） |
| `20-friends-panel` | 好友列表与详情 |
| `21-forum-post-detail` / `22-api-config` / `23-forum-manager` / `24-forum-panel` | 论坛与独立 API 配置 |
| `25-calendar` / `26-settings-panel` / `27-phone-size` / `28-wallpaper` | 日历、设置、尺寸、壁纸 |
| `30-cleanup` / `31-global-exports` | 卸载清理、`window.*` 暴露 |
| `32-realtime-refresh` / `33-group-chat` / `34-confirm-dialog` | 自动刷新、群聊、确认弹窗 |
| `35-boot` | 等 Mvu 就绪后启动、ESC、unload |

### 样式（`src/css/`，按 `02-styles.js` 里的顺序内联）

`tokens.css` 是设计变量层（配色 / 圆角 / 阴影 / 动效曲线 / 字体栈），
**改外观优先改这里**，别在各分片里散着写死值。

之后依次是：基础 → 机身/屏幕 → 状态栏 → 主屏与图标 →
列表与行组件（`list-items.css` + `rows.css`）→ 表单与按钮（`forms.css`）→
聊天 / 设置 / 加载 / 确认弹窗 → 响应式覆盖 → 滚动条 → 壁纸相关。

响应式覆盖（`responsive-768.css` / `responsive-mobile.css`）必须排在组件样式之后，
否则窄屏适配会被组件样式压掉。

可复用的组件类：

| 类名 | 用途 |
| --- | --- |
| `ph-row` + `ph-avatar` / `ph-row-main` / `ph-row-title` / `ph-row-sub` / `ph-row-meta` / `ph-chevron` | iOS 列表行骨架，消息列表和羁绊列表共用 |
| `ph-badge--blue/purple/green/gray` | 小胶囊徽标（附近、同行…） |
| `ph-section-title` | 分组标题 |
| `ph-action-row` | 整行主操作（创建群聊那种） |
| `ph-group` + `ph-field` / `ph-field-label` / `ph-field-input` | iOS 分组表单 |
| `ph-chip` + `ph-chip-grid` | 次级按钮（机型预设） |
| `ph-btn--filled` / `--plain` / `--danger` | 主操作按钮 |

新写面板请优先用这些类，不要再往模板字符串里堆内联样式。

### CG 图鉴有第二个去处

`18-cg-data` / `19-cg-gallery` / `29-cg-fullscreen` 这三片同时供着 HUD 的「CG 鉴赏」——
那是一页独立页面 `cg/index.html`，由 `scripts/build-cg-page.mjs` 把这三片**原文**拼成
`cg/cg-app.js`，外壳（jQuery、返回栈、全屏看图、好感度来源）在手写的 `cg/cg-shell.js`。

所以改这三片之后要多跑一步：

```bash
npm run cg:build    # 重新拼出 cg/cg-app.js
npm run cg:check    # 校验产物是否与 phone/src/ 同步（提交前跑）
```

## 改动须知

- 顶层就地执行、对顺序敏感的分片：`13`（`new MessageSender()`）、
  `23`（`new PhoneForumManager()`）、`31`（暴露 `window.*`）、`35`（启动）。
  把它们往前挪会踩 TDZ。
- 内联 `onclick` 只看得到 `window.*`。不过整份脚本是普通 script（不是 module），
  顶层 `function` 声明会自动挂到 `window` 上；只有定义在函数内部、或用 `const`/`class`
  声明的才需要在 `31-global-exports` 里显式暴露。
- 确认弹窗（`34-confirm-dialog.js`）会被 append 到**父窗口** body，拿不到本脚本注入的
  `<style>`，所以它必须保留整套内联样式，`css/confirm-dialog.css` 只是 iframe 同源时的补充。
- 产物行尾统一 CRLF，由 `build.mjs` 强制，跟本地编辑器设置无关。

## 已修掉的坑（留个记录，别改回去）

- 确认弹窗整块样式原本写在 `@media (max-width: 768px)` 里面，宽屏下全部失效
  （作者当时是靠内联样式绕过去的）。现已提到顶层 `css/confirm-dialog.css`。
- 弹窗内部还重定义了 `fadeIn` / `slideUp` / `iconPulse`：`@keyframes` 是全局名字，
  于是窄屏下手机的开机动画被弹窗的版本覆盖。现已改名为 `confirm*` 前缀。
- `status-bar.css` 和 `chat.css` 各定义了一个 `pulse`，后者赢，状态栏指示灯拿到的是
  聊天「正在输入」的动画。现已拆成 `statusDotPulse` / `chatTypingPulse`。
- `25-calendar.js` 注入的 `<style>` 里有个没人用的 `@keyframes slideUp`，
  打开过一次全屏日历之后就会顶掉手机的开机动画。已删除。
- 确认弹窗两个按钮之间混进过一句字面量 `保留，但是`，会直接渲染出来。已删除。
- 时间天气卡是 `visibility:hidden` 但仍占约 110px 高，把图标挤到屏幕中间。
  改成 `display:none`，图标从顶部排下来。

## 还没做的

- 聊天气泡（`css/chat.css`）、CG 图鉴、论坛、日历、壁纸选择器这几屏还是旧视觉，
  面板内容也仍以内联样式为主，没换成上面那套组件类。
- `11-ui-update.js` 里 `updatePhoneData` 有 `case 'shop'` / `case 'checkin'`，
  调用的 `generateShopPanel` / `generateCheckInPanel` 在整个脚本里都不存在。
  目前没有入口能走到（主屏没这两个 App），属于死代码，清理时留意。
- 主屏底部还空着一大片，可以考虑加 iOS 那种毛玻璃 dock。
