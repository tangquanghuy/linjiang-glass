/* 源码驱动的酒馆夹具。
   ==================================================================
   tools/tavern-real-fixture.* 是手写的近似：它复刻了 JS-Slash-Runner 的 srcdoc 骨架和
   一份够用的 .mes 结构，但样式是自己写的。测滚动性能时这个差别是致命的 —— 真实的
   SillyTavern 给 #chat 自带 `backdrop-filter: blur(var(--SmartThemeBlurStrength))` 和
   text-shadow，也就是说阅读区本身就是一块要重采样的玻璃，而手写夹具里它是透明的。

   这个夹具换了做法：能用真实源码的地方一律用真实源码。

     · 样式    直接 <link> 真实的 public/style.css + public/css/*，主题变量按
               power-user.js 的 applyThemeColor 从真实主题 JSON 套上去
     · DOM     用 DOMParser 解析真实的 public/index.html，把 #top-bar /
               #top-settings-holder / #sheld / #message_template 整枝搬过来，
               消息是克隆真实模板填内容，不是手写 innerHTML
     · 酒馆助手 srcdoc 按 src/panel/render/iframe.ts 的 createSrcContent 组装，
               里面的 adjust_viewport.js 与 adjust_iframe_height.js 是原文照跑；
               iframe 属性（loading=lazy / class=w-full / frameborder / id 命名）
               照 Iframe.vue，window resize 时也照样 post TH_UPDATE_VIEWPORT_HEIGHT
     · TT      直接 import 真实的 mobile-geometry-firewall.js 与
               mobile-overlay-compat-controller.js 并调用其 install*，
               所以移动端的浮层准入和几何改写是真的在跑

   已知的不忠实之处（全部记在 meta.substitutions 里，读数栏也会显示）：
     · third_party_message.html 里除 tailwind 之外全是 jsdelivr CDN（fontawesome、
       jquery、jquery-ui、vue、vue-router、log.js），离线取不到。jQuery 用 ST 自带的
       同版本本地文件替代，其余跳过。
     · predefine.js 需要父窗口完整的 TavernHelper._bind，夹具给的是精简替身：
       只做 window._ / __TH_IFRAME_ID / Mvu / SillyTavern 这几件事。
     · TT 的安全区变量由夹具按 src/tauri/main/api/layout.js 的契约手工设置，
       没有真实的 Tauri 原生桥。

   查询参数：
     preset=<id>          尺寸预设（tavern-real-contract.js 的 REAL_PRESETS）
     sheld=<vw>           #sheld 宽度百分比，默认取主题的 chat_width
     theme=Dark+V+1.0     主题名，默认 Dark V 1.0（带模糊，是更贵也更常见的那一档）
     host=tauritavern     装上真实的 TT 移动端 compat 模块并设安全区
     floors=<n>           状态栏之后追加多少条普通楼层，默认 12
     rendered=<n>         其中多少条带酒馆助手渲染 iframe（模拟正文美化），默认 2
     reading=inline|external  楼层内容用真实的正文美化（内联图 / 外链图两版对比）
     thirdparty=0         不注入 tailwind（跑得快些）
     chrome=0             隐藏读数栏
*/
import {
  REAL_PRESETS,
  expectedHudMode,
  realPresetById,
  tavernUsesMobileChrome,
} from './tavern-real-contract.js';

const STAGE = '/artifacts/real-tavern';
const params = new URLSearchParams(location.search);
const headless = params.get('chrome') === '0';
if (headless) document.body.classList.add('fixture-headless');

const readoutEl = document.getElementById('fixture_readout');
const substitutions = [];
const note = (text) => { substitutions.push(text); };

const text = async (url) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`取不到 ${url}: HTTP ${response.status}`);
  return response.text();
};
const json = async (url) => JSON.parse(await text(url));

const meta = await json(`${STAGE}/meta.json`);

/* ---------------------------------------------------------------- 真实 ST 骨架 */

const stIndexSource = await text(`${STAGE}/st/index.html`);
const stDoc = new DOMParser().parseFromString(stIndexSource, 'text/html');

/** 从真实 index.html 里整枝搬一个元素过来。 */
function adoptFromTavern(selector, { required = true } = {}) {
  const node = stDoc.querySelector(selector);
  if (!node) {
    if (required) throw new Error(`真实 index.html 里找不到 ${selector}，ST 的结构变了`);
    return null;
  }
  return document.importNode(node, true);
}

/* body 的 class 也照抄真实的（ST 出厂就带 no-blur，随后由 power-user 按设置切换）。 */
for (const cls of Array.from(stDoc.body.classList)) document.body.classList.add(cls);

/* 背景层。#chat 的 backdrop-filter 采样的就是它，没有它模糊就没有输入，
   成本会被低估 —— 这是这个夹具存在的主要理由之一，不能省。 */
const bg = adoptFromTavern('#bg1', { required: false });
if (bg) {
  document.body.appendChild(bg);
  /* 真实安装里 #bg1 的 background-image 由 JS 按设置注入。给一张确定的渐变，
     免得依赖不存在的图片文件，同时保证模糊有东西可采。 */
  bg.style.backgroundImage =
    'linear-gradient(135deg,#1b1430 0%,#2d1f3f 28%,#123043 55%,#1a1030 100%)';
  bg.style.backgroundSize = 'cover';
} else {
  note('真实 index.html 里没有 #bg1，#chat 的 backdrop-filter 缺少采样源');
}

for (const selector of ['#top-settings-holder', '#top-bar', '#sheld']) {
  const node = adoptFromTavern(selector);
  document.body.appendChild(node);
}

const messageTemplate = adoptFromTavern('#message_template');
document.body.appendChild(messageTemplate);

const chatEl = document.getElementById('chat');
const sheldEl = document.getElementById('sheld');
if (!chatEl || !sheldEl) throw new Error('真实骨架里没有 #chat / #sheld');

/* ---------------------------------------------------------------- 真实主题 */

const themeName = params.get('theme') || 'Dark V 1.0';
const theme = await json(`${STAGE}/st/themes/${encodeURIComponent(themeName)}.json`);

/* 照 public/scripts/power-user.js 的 applyThemeColor / applyBlurStrength /
   applyShadowWidth / applyFontScale / applyChatWidth 来。变量名与那边一一对应。 */
function applyTheme(t) {
  const root = document.documentElement;
  const map = {
    '--SmartThemeBodyColor': t.main_text_color,
    '--SmartThemeEmColor': t.italics_text_color,
    '--SmartThemeUnderlineColor': t.underline_text_color,
    '--SmartThemeQuoteColor': t.quote_text_color,
    '--SmartThemeBlurTintColor': t.blur_tint_color,
    '--SmartThemeChatTintColor': t.chat_tint_color,
    '--SmartThemeUserMesBlurTintColor': t.user_mes_blur_tint_color,
    '--SmartThemeBotMesBlurTintColor': t.bot_mes_blur_tint_color,
    '--SmartThemeShadowColor': t.shadow_color,
    '--SmartThemeBorderColor': t.border_color,
  };
  for (const [name, value] of Object.entries(map)) {
    if (value) root.style.setProperty(name, value);
  }
  root.style.setProperty('--blurStrength', String(t.blur_strength ?? 10));
  root.style.setProperty('--shadowWidth', String(t.shadow_width ?? 2));
  root.style.setProperty('--fontScale', String(t.font_scale ?? 1));
  const sheldVw = Number(params.get('sheld')) || Number(t.chat_width) || 50;
  root.style.setProperty('--sheldWidth', `${sheldVw}vw`);
  /* switchUiMode / applyNoShadows / switchReducedMotion 就是三个 body class。 */
  document.body.classList.toggle('no-blur', !!t.fast_ui_mode);
  document.body.classList.toggle('noShadows', !!t.noShadows);
  document.body.classList.toggle('reduced-motion', !!t.reduced_motion);
  return { sheldVw };
}
const { sheldVw } = applyTheme(theme);

/* ---------------------------------------------------------------- TauriTavern */

const isTauriHost = params.get('host') === 'tauritavern';
const ttControllers = [];
if (isTauriHost) {
  /* 状态栏壳层的 isTauriTavernMobile() 认这个全局。 */
  window.__TAURITAVERN__ = { abiVersion: 1 };
  /* src/tauri/main/api/layout.js 的 ROOT_CONTRACT_VARS。真实值来自原生侧的安全区，
     这里按一台有刘海和手势条的手机手工给定。 */
  const root = document.documentElement;
  root.style.setProperty('--tt-inset-top', '47px');
  root.style.setProperty('--tt-inset-right', '0px');
  root.style.setProperty('--tt-inset-bottom', '34px');
  root.style.setProperty('--tt-inset-left', '0px');
  root.style.setProperty('--tt-base-viewport-height', `${innerHeight}px`);
  root.style.setProperty('--tt-ime-bottom', '0px');
  note('TT 安全区变量由夹具按 layout.js 的契约手工设置（无原生桥）');

  const ttMobileStyles = document.createElement('link');
  ttMobileStyles.rel = 'stylesheet';
  ttMobileStyles.href = `${STAGE}/tt/mobile-styles.css`;
  document.head.appendChild(ttMobileStyles);

  /* 真实模块，直接跑。geometry firewall 必须最后进 <head>（它自己用 MutationObserver
     保证这件事），所以在样式表都挂完之后再装。 */
  const [{ installMobileGeometryFirewall }, { installMobileOverlayCompatController }] = await Promise.all([
    import(`${STAGE}/tt/mobile-geometry-firewall.js`),
    import(`${STAGE}/tt/mobile-overlay-compat-controller.js`),
  ]);
  ttControllers.push(installMobileGeometryFirewall());
  ttControllers.push(installMobileOverlayCompatController());
}

/* ---------------------------------------------------------------- MVU 替身 */

/* 形状必须是真的 MVU 形状（酒馆变量/变量初始化 的顶层键），否则壳层的 pushSnapshot 会
   判定「等待 MVU 数据」而根本不发，HUD 一路画 data.js 的样本值，整套夹具就从没走过一次
   数据通路。同行 / 所在直播间 故意填了人：竖屏几条断言要看这两个字段真的渲染出来。 */
const fixtureStatData = {
  世界信息: {
    年历: '2026年4月17日',
    日期显示: { 星期: '周五', 季节: '春季', 年内周次: 16 },
    时间: { 时钟: '20:45', 时段: '夜' },
    位置: { 区域: '鼓岭区 · 云庭公寓', 场所: '客厅', 私密度: 5 },
    事件池: { 当日事件: {} },
  },
  玩家信息: {
    体力: 74,
    金钱: 512300,
    同行: '东雪莲',
    工作: { 职业: '便利店店员', 地点: '鼓岭区 · 梧桐里', 日收入: 215, 今日已上班: false },
    居住地: '鼓岭区 · 云庭公寓',
    房产: {},
    所在直播间: '璃亚梦',
    粉丝身份: {},
    背包: { 素材: {}, 消耗品: {}, 用品: {} },
  },
  对象信息: {
    东雪莲: {
      羁绊: { 好感度: 640, 顺从度: 210, 心情: '害羞' },
      位置: { 区域: '鼓岭区 · 云庭公寓', 场所: '客厅', 私密度: 5 },
      生理: { 性欲度: 12, 体力: 80, 尿意: 20, 异常状态: [] },
    },
  },
};
window.Mvu = {
  events: { VARIABLE_UPDATE_ENDED: 'variable_update_ended' },
  getMvuData() { return { stat_data: structuredClone(fixtureStatData) }; },
  replaceMvuData() { return true; },
};
window.eventSource = { on() {}, emit() {} };
window.eventOn = () => {};
window.sendMessageAsUser = async () => true;
window.sendTextareaMessage = async () => true;
/* predefine.js 的替身要 merge 它，给个空壳避免抛错。 */
window.TavernHelper = { _bind: {} };
window.SillyTavern = { getContext: () => ({ chatId: 'fixture-chat' }) };

/* ---------------------------------------------------------------- 酒馆助手注入 */

const [adjustViewportSource, adjustHeightSource, thirdPartySource] = await Promise.all([
  text(`${STAGE}/jsr/adjust_viewport.js`),
  text(`${STAGE}/jsr/adjust_iframe_height.js`),
  text(`${STAGE}/jsr/third_party_message.html`),
]);

const wantsThirdParty = params.get('thirdparty') !== '0';

/* third_party_message.html 里的本地依赖留下、CDN 的跳过。返回真实文件里出现过的
   依赖清单，好把"跳过了什么"如实记下来。 */
function rewriteThirdParty(source) {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  const kept = [];
  const skipped = [];
  const out = [];
  for (const el of doc.head.children) {
    const url = el.getAttribute('src') || el.getAttribute('href') || '';
    if (!url) continue;
    if (url.includes('JS-Slash-Runner/lib/tailwindcss.min.js')) {
      if (!wantsThirdParty) { skipped.push(url); continue; }
      kept.push(url);
      out.push(`<script src="${STAGE}/jsr/lib/tailwindcss.min.js"><\/script>`);
      continue;
    }
    skipped.push(url);
  }
  return { html: out.join('\n'), kept, skipped };
}
const thirdParty = rewriteThirdParty(thirdPartySource);
if (thirdParty.skipped.length) {
  note(`酒馆助手第三方依赖跳过 ${thirdParty.skipped.length} 个（jsdelivr 离线不可达）`);
}

/* predefine.js 的精简替身。真实那份要 merge 父窗口完整的 TavernHelper._bind，
   夹具没有；这里只保留后续脚本真正依赖的东西：_ 和 __TH_IFRAME_ID。
   第一行是原文照抄，而且必须照抄 —— adjust_iframe_height.js 一进来就 `_.throttle`，
   lodash 是从父窗口传进来的，不是 iframe 自己加载的。 */
const PREDEFINE_STAND_IN = `
window._ = window.parent._;
const iframeId = window.frameElement?.id || window.name;
if (iframeId) {
  window.__TH_IFRAME_ID = iframeId;
  if (!window.name) window.name = iframeId;
}
Object.defineProperty(window, 'SillyTavern', { get: () => window.parent.SillyTavern, configurable: true });
if (window.parent.Mvu) {
  Object.defineProperty(window, 'Mvu', { get: () => window.parent.Mvu, set: () => {}, configurable: true });
}
window.TavernHelper = window.parent.TavernHelper;
`;
note('predefine.js 使用精简替身（真实那份需要完整的 TavernHelper._bind）');

/**
 * 照 src/panel/render/iframe.ts 的 createSrcContent 组装 srcdoc。
 * 差异只有两处：CDN 依赖被替换/跳过，predefine 用替身。
 */
function createSrcContent(content) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*,*::before,*::after{box-sizing:border-box;}
html,body{margin:0!important;padding:0;overflow:hidden!important;max-width:100%!important;}
</style>
${thirdParty.html}
<script src="${STAGE}/st/lib/jquery.min.js"><\/script>
<script>${PREDEFINE_STAND_IN}<\/script>
<script>${adjustViewportSource}<\/script>
<script>${adjustHeightSource}<\/script>
</head>
<body>
${content}
</body>
</html>
`;
}

/* ---------------------------------------------------------------- 状态栏源码 */

let statusSourcePromise = null;
function loadProductionStatusSource() {
  if (!statusSourcePromise) {
    statusSourcePromise = text('/外部部署/状态栏.html')
      .then((source) => source
        .replace(/^\uFEFF?```(?:text|html)?\s*\r?\n/i, '')
        .replace(/\r?\n```\s*$/i, ''))
      .then((source) => {
        const localHud = new URL('/', location.href).href;
        const replaced = source.replace(
          /const\s+HUD_URL\s*=\s*(['"])[\s\S]*?\1\s*;/,
          `const HUD_URL = ${JSON.stringify(localHud)};`,
        );
        if (replaced === source) throw new Error('状态栏源码里找不到 HUD_URL');
        return replaced;
      });
  }
  return statusSourcePromise;
}

/* ---------------------------------------------------------------- 消息楼层 */

let mountGeneration = 0;
let statusFrame = null;
const renderFrames = [];

const AVATAR = (label, color) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="40" fill="${color}"/><text x="40" y="49" fill="white" text-anchor="middle" font-size="28" font-family="sans-serif">${label}</text></svg>`)}`;

/** 克隆真实的 #message_template，填上内容。 */
function buildMessage({ mesid, name, body, user = false }) {
  const mes = messageTemplate.firstElementChild.cloneNode(true);
  mes.setAttribute('mesid', String(mesid));
  mes.setAttribute('ch_name', name);
  mes.setAttribute('is_user', user ? 'true' : 'false');
  mes.setAttribute('is_system', 'false');
  const nameText = mes.querySelector('.name_text');
  if (nameText) nameText.textContent = name;
  const timestamp = mes.querySelector('.timestamp');
  if (timestamp) timestamp.textContent = '20:45';
  const img = mes.querySelector('.mesAvatarWrapper .avatar img');
  if (img) img.src = AVATAR(user ? '你' : '临', user ? '#675fa0' : '#44506f');
  const mesText = mes.querySelector('.mes_text');
  if (!mesText) throw new Error('真实模板里没有 .mes_text，ST 结构变了');
  mesText.replaceChildren(body);
  return mes;
}

/**
 * 造一个酒馆助手的渲染块。结构与属性照 Iframe.vue：.TH-render 里一个 <pre><code>
 * 装源码，旁边一个 iframe，Vue 用 Teleport 挂进去；渲染完成后原生代码块被加
 * hidden! 类。
 */
function buildRenderBlock(id, source) {
  const render = document.createElement('div');
  render.className = 'TH-render';
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = source;
  pre.appendChild(code);
  const iframe = document.createElement('iframe');
  const prefixedId = `TH-message--${id}`;
  iframe.id = prefixedId;
  iframe.name = prefixedId;
  iframe.className = 'w-full';
  iframe.loading = 'lazy';
  iframe.setAttribute('frameborder', '0');
  render.append(pre, iframe);
  /* onMounted 里 Vue 把非 iframe 的兄弟节点加 hidden!，也就是原始 <pre> 被藏起来。 */
  pre.classList.add('hidden!');
  return { render, iframe };
}

const FILLER_HTML = `
<div style="padding:8px 10px;font:13px/1.6 system-ui;color:#cfd3e6">
  <p>正文美化占位楼层。真实环境这里是 外部部署/正文美化.html，同样由酒馆助手注入成一个 srcdoc iframe。</p>
</div>`;

/* ?reading=1 时，带渲染 iframe 的楼层用**真实的** 外部部署/正文美化.html 当内容。
   它的部署方式是 SillyTavern 的正则把 AI 正文捕获成 $1 塞进这个模板，所以这里也照做：
   把 $1 换成一段样例叙事。这是量「每楼层一个 581KB 阅读器」真实代价的唯一诚实办法。 */
const SAMPLE_PROSE = `
<p>夜里十点半，鼓岭区的雨停了。云庭公寓十七层的窗玻璃上还挂着水痕，把楼下便利店的招牌拉成一条一条的橙色。</p>
<p>“你今天回来得早。”东雪莲把遥控器放到茶几上，声音里没什么起伏，只是抬眼看了一下门口。</p>
<p>客厅的灯只开了一半，另一半留给电视。屏幕里正在放一档深夜的谈话节目，主持人笑得很用力，声音被调到几乎听不见。</p>`;

/* reading=inline   用 外部部署/正文美化.html（5 张图内联 base64，现状）
   reading=external 用 外部部署/正文美化-外链素材版.html（同一份源生成，图改外链）
   兼容旧写法：reading=1 等于 inline。

   外链版里的前缀指向 jsDelivr，但夹具里要改写成本地的 /reading/ —— vite 把 public/ 挂在根
   上，所以那 5 张图在本地也取得到。这一步很重要：如果让它们 404，外链版就变成"根本不解码
   图片"，那量出来的差距是假的。 */
const READING_VARIANT = (() => {
  const raw = params.get('reading');
  if (!raw || raw === '0') return null;
  if (raw === '1' || raw === 'inline') return 'inline';
  if (raw === 'external') return 'external';
  throw new Error(`reading 参数只能是 inline / external / 1 / 0，收到 ${raw}`);
})();

const READING_FILES = {
  inline: '/外部部署/正文美化.html',
  external: '/外部部署/正文美化-外链素材版.html',
};

/* ?readingPad=<KB>：往 srcdoc 里塞这么多 KB 的惰性文本（HTML 注释 —— 要解析，但不产生元素、
   不编译、不执行）。用来把「srcdoc 体积」这一个变量单独拎出来：如果加 199KB 惰性文本几乎
   不涨每层成本，那把剩下那 199KB 内联 JS 外链也不会有收益，因为成本在执行而不在解析。 */
/* ?readingExternalJs=1：把外链版里最大的那个 <script>（约 199KB）也换成 <script src>，
   指向 harness 提供的 /harness/reading-body.js。用来量「再把 JS 外链还有多少收益」，
   不改动任何产物。抽取规则必须和 scripts/lib/fixture-server.mjs 的 harnessScriptPlugin
   一致（都取最大的一块），下面会断言体积对得上。 */
const READING_EXTERNAL_JS = params.get('readingExternalJs') === '1';
const READING_PAD_KB = Math.max(0, Number(params.get('readingPad') || 0));
const padComment = () => {
  if (!READING_PAD_KB) return '';
  /* 单行长注释会让某些解析器走特殊路径，所以按 120 字符换行，形状更接近真实代码。 */
  const line = 'x'.repeat(118);
  const lines = Math.ceil((READING_PAD_KB * 1024) / 120);
  return `\n<!-- 惰性填充 ${READING_PAD_KB}KB，用于隔离 srcdoc 体积这一个变量\n`
    + `${new Array(lines).fill(line).join('\n')}\n-->\n`;
};

let readingSourcePromise = null;
function loadReadingSource() {
  if (!readingSourcePromise) {
    readingSourcePromise = text(READING_FILES[READING_VARIANT])
      .then((source) => source
        .replace(/^\uFEFF?```(?:text|html)?\s*\r?\n/i, '')
        .replace(/\r?\n```\s*$/i, ''))
      .then((source) => {
        if (READING_VARIANT !== 'external') return source;
        /* 外链版的 HTML 里只剩一个 <link>：那 5 张图的 URL 已经跟着 CSS 一起搬进外链样式表了。
           所以这里只改 href，图片地址由 fixture-server 的 /reading/ 中间件在提供 CSS 时改写。
           两件事都必须成立，否则 external 变体会退化成「无样式」或「不解码图」，对比就是假的。 */
        const cssHits = (source.match(/href="https:\/\/[^"]*\/reading\/[^"]*\.css"/g) || []).length;
        const inlineImages = (source.match(/url\("(?:data:|https:\/\/[^"]*\/reading\/)/g) || []).length;
        if (cssHits !== 1) throw new Error(`外链版里应有 1 个外链样式表，实际 ${cssHits} 个（产物可能过期）`);
        if (inlineImages !== 0) throw new Error(`外链版 HTML 里不该还有图片 url()，实际 ${inlineImages} 处`);
        note('外链版：样式表 href 改写到本地 /reading/，其中的图片地址由 harness 中间件一并改写');
        return source.replace(/href="https:\/\/[^"]*\/reading\//g, 'href="/reading/');
      })
      /* 模板里 $1 就是正则的捕获组占位符，位置在 .reading-opening-mark 和
         .reading-end-mark 之间。 */
      .then(async (source) => {
        if (!READING_EXTERNAL_JS) return source;
        if (READING_VARIANT !== 'external') throw new Error('readingExternalJs 只对 external 变体有意义');
        const blocks = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)];
        if (!blocks.length) throw new Error('外链版里找不到内联 <script>');
        const biggest = blocks.reduce((a, b) => (b[1].length > a[1].length ? b : a));
        /* 断言 harness 抽出来的就是同一块，否则量的是两个不同的东西。 */
        const served = await text('/harness/reading-body.js');
        if (served.length !== biggest[1].length) {
          throw new Error(`harness 提供的脚本与本地抽取不一致：${served.length} vs ${biggest[1].length}`);
        }
        note(`最大的那块 <script>（${(biggest[1].length / 1024).toFixed(0)}KB）改成 <script src>`);
        return source.replace(biggest[0], '<script src="/harness/reading-body.js"></script>');
      })
      .then((source) => {
        if (!source.includes('$1')) throw new Error('正文美化模板里找不到 $1 占位符');
        return source.replace('$1', () => SAMPLE_PROSE);
      })
      .then((source) => {
        if (!READING_PAD_KB) return source;
        const pad = padComment();
        note(`srcdoc 额外塞了 ${READING_PAD_KB}KB 惰性注释（隔离体积变量）`);
        /* 放在 </body> 之前：位置对解析成本没影响，但不会挤到 head 的加载时序里。 */
        return source.replace('</body>', `${pad}</body>`);
      });
  }
  return readingSourcePromise;
}
const useRealReading = !!READING_VARIANT;

async function mountChat() {
  const generation = ++mountGeneration;
  statusFrame = null;
  renderFrames.length = 0;
  chatEl.replaceChildren();

  const floors = Math.max(0, Number(params.get('floors') ?? 12));
  const rendered = Math.max(0, Number(params.get('rendered') ?? 2));
  let mesid = 0;

  const paragraph = (content) => {
    const p = document.createElement('p');
    p.textContent = content;
    return p;
  };

  /* 状态栏之前放两条，保证它落在首屏内 —— iframe 是 loading="lazy" 的（照 Iframe.vue），
     一开始就在视口外的话根本不会加载。 */
  chatEl.appendChild(buildMessage({
    mesid: mesid++, name: '你', user: true,
    body: paragraph('先检查状态栏上方的消息。'),
  }));
  chatEl.appendChild(buildMessage({
    mesid: mesid++, name: '临江',
    body: paragraph('真实酒馆里滚动容器是 #chat，而且它自带 backdrop-filter。'),
  }));

  const statusSource = await loadProductionStatusSource();
  if (generation !== mountGeneration) return;
  const statusBlock = buildRenderBlock(`${mesid}--0`, statusSource);
  statusFrame = statusBlock.iframe;
  chatEl.appendChild(buildMessage({
    mesid: mesid++, name: 'System Update', body: statusBlock.render,
  }));

  const readingSource = useRealReading && rendered > 0 ? await loadReadingSource() : FILLER_HTML;
  if (generation !== mountGeneration) return;
  if (useRealReading) note(`楼层内容用真实的 ${READING_FILES[READING_VARIANT]}（$1 换成样例正文）`);

  for (let i = 0; i < floors; i += 1) {
    const user = i % 3 === 0;
    let body;
    if (i < rendered) {
      const block = buildRenderBlock(`${mesid}--0`, readingSource);
      renderFrames.push(block.iframe);
      body = block.render;
    } else {
      body = paragraph(
        `状态栏之后的长消息 ${i + 1}。用来制造真实的滚动范围，并检查滚动链和滚动锚定。`
        + '真实对话里每一条都比这长得多，而且大多带一个渲染 iframe。',
      );
    }
    chatEl.appendChild(buildMessage({ mesid: mesid++, name: user ? '你' : '临江', user, body }));
  }

  /* srcdoc 要在节点进 DOM 之后再赋值，否则 loading=lazy 的判定没有布局可依据。 */
  statusFrame.srcdoc = createSrcContent(statusSource);
  for (const frame of renderFrames) frame.srcdoc = createSrcContent(readingSource);
}

/* Iframe.vue: useEventListener(window, 'resize', ...) 通知每个渲染 iframe 重算视口高度。 */
addEventListener('resize', () => {
  for (const frame of [statusFrame, ...renderFrames]) {
    try { frame?.contentWindow?.postMessage({ type: 'TH_UPDATE_VIEWPORT_HEIGHT' }, '*'); }
    catch { /* 跨源时取不到，真实环境里同源 */ }
  }
});

/* ---------------------------------------------------------------- 量测 API */

function liveHud() {
  return document.getElementById('linjiang-hud-live')
    || statusFrame?.contentDocument?.getElementById('hud')
    || null;
}

function frameBox(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  let left = rect.left;
  let top = rect.top;
  let win = element.ownerDocument.defaultView;
  while (win && win !== window) {
    const frame = win.frameElement;
    if (!frame) break;
    const outer = frame.getBoundingClientRect();
    left += outer.left;
    top += outer.top;
    win = win.parent;
  }
  return { left, top, width: rect.width, height: rect.height, right: left + rect.width, bottom: top + rect.height };
}

function measure() {
  const hud = liveHud();
  const hudBox = frameBox(hud);
  const slot = frameBox(statusFrame);
  /* 刚被创建、还没导航完的 iframe 有 contentDocument 但 documentElement 是 null。
     measure() 会在轮询里被反复调用，所以这里必须挺得住那个中间态。 */
  const hudDoc = hud?.contentDocument?.documentElement ? hud.contentDocument : null;
  const hudRoot = hudDoc?.documentElement || null;
  const pstage = hudDoc?.querySelector('.pstage');
  const chatStyle = getComputedStyle(chatEl);
  return {
    versions: meta.versions,
    theme: theme.name,
    host: isTauriHost ? 'tauritavern' : 'browser',
    vw: innerWidth,
    vh: innerHeight,
    expectedMode: expectedHudMode(innerWidth, innerHeight),
    stMobileChrome: tavernUsesMobileChrome(innerWidth),
    sheldVw,
    /* 这两条是这个夹具相对手写夹具的关键增益：真实 #chat 是一块玻璃。 */
    chatBackdropFilter: chatStyle.backdropFilter || chatStyle.webkitBackdropFilter || 'none',
    chatTextShadow: chatStyle.textShadow,
    bodyClasses: [...document.body.classList],
    chatW: Math.round(chatEl.getBoundingClientRect().width),
    chatH: Math.round(chatEl.getBoundingClientRect().height),
    chatScrollTop: Math.round(chatEl.scrollTop),
    chatScrollHeight: Math.round(chatEl.scrollHeight),
    chatClientHeight: Math.round(chatEl.clientHeight),
    messages: chatEl.querySelectorAll('.mes').length,
    renderIframes: chatEl.querySelectorAll('.TH-render iframe').length,
    slotW: Math.round(slot?.width || 0),
    slotH: Math.round(slot?.height || 0),
    slotTop: Math.round(slot?.top || 0),
    hudW: Math.round(hudBox?.width || 0),
    hudH: Math.round(hudBox?.height || 0),
    hudTop: Math.round(hudBox?.top || 0),
    alignment: hudBox && slot ? +(hudBox.top - slot.top).toFixed(2) : null,
    lifted: hud?.id === 'linjiang-hud-live',
    portraitDom: !!pstage && !pstage.hasAttribute('hidden'),
    hudPerformanceMode: hudRoot?.dataset.hudPerformance || '',
    hudHostScrollActive: !!hudRoot?.classList.contains('host-scroll-active'),
    hudNodes: hudDoc ? hudDoc.querySelectorAll('*').length : 0,
    /* 资金那一行是"壳层的 MVU 快照有没有落到 HUD 上"的探针：样本数据 ￥286,450，
       夹具快照 ￥512,300。 */
    hudMoney: (hudDoc?.querySelector('.pmoney b') || hudDoc?.querySelector('.money-line .num'))
      ?.textContent.replace(/\s+/g, '').trim() || '',
    /* TT 的准入契约：状态栏必须始终保持"已声明 none 且未被接管"。 */
    ttSurface: hud?.getAttribute('data-tt-mobile-surface') ?? null,
    ttAdmitted: hud?.hasAttribute('data-tt-mobile-surface-admitted') ?? null,
    ttOriginalTop: hud?.style.getPropertyValue('--tt-original-top') || '',
    ttFirewallInstalled: !!document.getElementById('tt-mobile-geometry-firewall'),
    liveHudCount: document.querySelectorAll('#linjiang-hud-live').length
      + (statusFrame?.contentDocument?.getElementById('hud') ? 1 : 0),
    substitutions: [...substitutions],
  };
}

async function waitUntilReady(timeout = 30000) {
  const started = performance.now();
  let last = null;
  while (performance.now() - started < timeout) {
    last = measure();
    const scrollable = last.chatScrollHeight > last.chatClientHeight + 200;
    if (scrollable && last.slotH > 100 && last.hudW > 100) return last;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`真实源码夹具等待 HUD 超时：${JSON.stringify(last)}`);
}

/** 等到 HUD 真的把构图建完（不是 index.html 那几十个静态节点）。 */
async function waitUntilPainted(timeout = 30000) {
  const started = performance.now();
  while (performance.now() - started < timeout) {
    const hud = liveHud();
    const doc = hud?.contentDocument?.documentElement ? hud.contentDocument : null;
    const built = doc && (
      doc.querySelector('.pstage:not([hidden]) .pcontent > .ppanel')
      || doc.querySelector('#stage:not([hidden]) #content *')
    );
    if (built && doc.querySelectorAll('*').length > 150) return measure();
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('HUD 构图没有建起来');
}

function paintReadout() {
  if (headless) return;
  const m = measure();
  readoutEl.textContent = [
    `ST ${m.versions.sillytavern} · 助手 ${m.versions.tavernHelper} · TT ${m.versions.tauritavern} · 主题 ${m.theme} · 宿主 ${m.host}`,
    `${m.expectedMode} ${m.vw}×${m.vh} · sheld ${m.sheldVw}vw · chat ${m.chatW}×${m.chatH} · 楼层 ${m.messages} · 渲染 iframe ${m.renderIframes}`,
    `#chat backdrop=${m.chatBackdropFilter} · body=${m.bodyClasses.join(' ') || '(无)'}`,
    `HUD ${m.hudW}×${m.hudH} 对齐 ${m.alignment}px · perf=${m.hudPerformanceMode} · 资金 ${m.hudMoney || '(未落地)'}`
    + (m.ttSurface == null ? '' : ` · TT surface=${m.ttSurface} admitted=${m.ttAdmitted} originalTop=${m.ttOriginalTop || '(空)'}`),
    `替身：${m.substitutions.join('；') || '无'}`,
  ].join('\n');
}

window.__linjiangTavernLive = {
  meta,
  measure,
  waitUntilReady,
  waitUntilPainted,
  liveHud,
  get statusFrame() { return statusFrame; },
  get renderFrames() { return [...renderFrames]; },
  reload: mountChat,
  ttControllers,
  presets: REAL_PRESETS,
  presetById: realPresetById,
};

await mountChat();
if (!headless) {
  setInterval(paintReadout, 400);
  paintReadout();
}
