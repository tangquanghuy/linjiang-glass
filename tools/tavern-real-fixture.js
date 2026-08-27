import {
  REAL_PRESETS,
  ST_VERSION,
  TAVERN_HELPER_VERSION,
  expectedHudMode,
  realPresetById,
  tavernUsesMobileChrome,
} from './tavern-real-contract.js';

const params = new URLSearchParams(location.search);
const headless = params.get('chrome') === '0';
const presetEl = document.getElementById('fixture_preset');
const widthEl = document.getElementById('fixture_width');
const wrapEl = document.getElementById('fixture_wrap');
const reloadEl = document.getElementById('fixture_reload');
const readoutEl = document.getElementById('fixture_readout');
const chatEl = document.getElementById('chat');

if (headless) document.body.classList.add('fixture-headless');

/* The production shell looks for Mvu on parent/top.  This keeps the same API
   shape while leaving the fixture deterministic and independent of chat data.

   形状必须是真的 MVU 形状（酒馆变量/变量初始化 的顶层键）。以前这里是 `世界:{日期,时间,地点}`
   —— 谁都不认的三个字段，于是壳层的 pushSnapshot 判定"等待 MVU 数据"直接不发，HUD 一路画
   data.js 的样本值，整套夹具从来没走过一次数据通路。src/bridge.js 里丢掉全部壳层消息的那个
   bug 就是这么漏过去的。

   同行 / 所在直播间 故意填了人：竖屏那几条断言要看 同行、在看 两个字段真的渲染出来。 */
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

let statusSourcePromise = null;
let mountGeneration = 0;
let statusFrame = null;
let helperHeightSamples = [];
let helperHeightObserver = null;

function stripMarkdownFence(source) {
  return String(source)
    .replace(/^\uFEFF?```(?:text|html)?\s*\r?\n/i, '')
    .replace(/\r?\n```\s*$/i, '');
}

async function loadProductionStatusSource() {
  if (!statusSourcePromise) {
    statusSourcePromise = fetch('../外部部署/V20260826/状态栏.html', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`状态栏源码读取失败: HTTP ${response.status}`);
        return response.text();
      })
      .then(stripMarkdownFence)
      .then((source) => {
        const localHud = new URL('../', location.href).href;
        const replaced = source.replace(
          /const\s+HUD_URL\s*=\s*(['"])[\s\S]*?\1\s*;/,
          `const HUD_URL = ${JSON.stringify(localHud)};`,
        );
        if (replaced === source) throw new Error('状态栏源码中没有找到 HUD_URL');
        return replaced;
      });
  }
  return statusSourcePromise;
}

function helperSrcdoc(statusSource) {
  /* Mirrors JS-Slash-Runner 4.9.3 createSrcContent() and
     adjust_iframe_height.js. The production content is inserted into body in
     the same way as a rendered frontend code block. */
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*,*::before,*::after{box-sizing:border-box;}
html,body{margin:0!important;padding:0;overflow:hidden!important;max-width:100%!important;}
</style>
<script>
window.__TH_IFRAME_ID = window.frameElement?.id || window.name;
document.documentElement.style.setProperty('--TH-viewport-height', window.parent.innerHeight + 'px');
window.addEventListener('message', function(event) {
  if (event.data?.type === 'TH_UPDATE_VIEWPORT_HEIGHT') {
    document.documentElement.style.setProperty('--TH-viewport-height', window.parent.innerHeight + 'px');
  }
});
<\/script>
<script>
(function () {
  let scheduled = false;
  function measureAndPost() {
    scheduled = false;
    try {
      const height = document.body?.scrollHeight || 0;
      if (Number.isFinite(height) && height > 0 && frameElement) {
        frameElement.style.height = height + 'px';
        window.parent.postMessage({ type: 'FIXTURE_HELPER_HEIGHT', height }, '*');
      }
    } catch (e) {}
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(measureAndPost);
  }
  addEventListener('DOMContentLoaded', function () {
    schedule();
    if (document.body && typeof ResizeObserver === 'function') {
      new ResizeObserver(schedule).observe(document.body);
    }
  });
})();
<\/script>
</head>
<body>
${statusSource}
</body>
</html>`;
}

function avatarSvg(label, color) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="40" fill="${color}"/><text x="40" y="49" fill="white" text-anchor="middle" font-size="28" font-family="sans-serif">${label}</text></svg>`)}`;
}

function messageElement({ name, text, user = false, status = false, filler = false }) {
  const mes = document.createElement('div');
  mes.className = `mes${status ? ' fixture-status-message' : ''}${filler ? ' fixture-filler' : ''}`;
  mes.setAttribute('is_user', user ? 'true' : 'false');
  mes.setAttribute('is_system', 'false');
  mes.innerHTML = `
    <div class="for_checkbox"></div>
    <div class="mesAvatarWrapper">
      <div class="avatar"><img alt="" src="${avatarSvg(user ? '你' : '临', user ? '#675fa0' : '#44506f')}"></div>
    </div>
    <div class="swipe_left"></div>
    <div class="mes_block">
      <div class="ch_name"><span class="name_text"></span><small class="timestamp">20:45</small></div>
      <div class="mes_text"></div>
      <div class="mes_media_wrapper"></div>
      <div class="mes_file_wrapper"></div>
    </div>
    <div class="swipeRightBlock"></div>`;
  mes.querySelector('.name_text').textContent = name;
  const textEl = mes.querySelector('.mes_text');
  if (status) {
    const render = document.createElement('div');
    render.className = 'TH-render';
    const pre = document.createElement('pre');
    pre.innerHTML = '<code>production status source</code>';
    const iframe = document.createElement('iframe');
    iframe.id = `TH-message--fixture--${mountGeneration}`;
    iframe.name = iframe.id;
    iframe.className = 'w-full';
    iframe.loading = 'eager';
    iframe.setAttribute('frameborder', '0');
    iframe.style.height = '150px';
    render.append(pre, iframe);
    textEl.appendChild(render);
    statusFrame = iframe;
  } else {
    const p = document.createElement('p');
    p.textContent = text;
    textEl.appendChild(p);
  }
  return mes;
}

function currentState() {
  const preset = realPresetById(presetEl.value);
  return {
    ...preset,
    sheldVw: Number(widthEl.value) || preset.sheldVw || 50,
    wrapPx: Number(wrapEl.value) || 0,
  };
}

function applyState(state) {
  document.documentElement.style.setProperty('--sheldWidth', `${state.sheldVw}vw`);
  document.body.classList.toggle('fixture-wrap', state.wrapPx > 0);
  document.documentElement.style.setProperty('--fixture-wrap-width', `${state.wrapPx || 140}px`);
  widthEl.value = String(state.sheldVw);
  wrapEl.value = String(state.wrapPx || 0);
}

function syncQuery() {
  if (headless) return;
  const state = currentState();
  const url = new URL(location.href);
  url.searchParams.set('preset', presetEl.value);
  url.searchParams.set('sheld', String(state.sheldVw));
  if (state.wrapPx) url.searchParams.set('wrap', String(state.wrapPx));
  else url.searchParams.delete('wrap');
  history.replaceState(null, '', url);
}

async function mountChat() {
  const generation = ++mountGeneration;
  helperHeightSamples = [];
  helperHeightObserver?.disconnect();
  chatEl.replaceChildren();

  const before = [
    ['你', '先检查状态栏上方的消息。', true],
    ['临江', '真实酒馆中，滚动容器是 #chat，不是 #sheld。', false],
    ['你', '下面一条消息通过酒馆助手的 srcdoc iframe 加载状态栏。', true],
  ];
  before.forEach(([name, text, user]) => chatEl.appendChild(messageElement({ name, text, user, filler: true })));
  chatEl.appendChild(messageElement({ name: 'System Update', status: true }));
  for (let i = 0; i < 12; i++) {
    chatEl.appendChild(messageElement({
      name: i % 3 === 0 ? '你' : '临江',
      user: i % 3 === 0,
      filler: true,
      text: `状态栏后的长消息 ${i + 1}。用于制造真实的聊天滚动范围，并检查滚动链和滚动锚定。`,
    }));
  }

  const source = await loadProductionStatusSource();
  if (generation !== mountGeneration || !statusFrame) return;
  statusFrame.srcdoc = helperSrcdoc(source);
  helperHeightObserver = new ResizeObserver(() => {
    const height = Math.round(statusFrame?.getBoundingClientRect().height || 0);
    if (height > 0 && helperHeightSamples.at(-1) !== height) helperHeightSamples.push(height);
  });
  helperHeightObserver.observe(statusFrame);
}

function liveHud() {
  return document.getElementById('linjiang-hud-live')
    || statusFrame?.contentDocument?.getElementById('linjiang-mobile-native-root')
    || statusFrame?.contentDocument?.getElementById('hud')
    || null;
}

function hudDocument(hud = liveHud()) {
  if (!hud) return null;
  if (hud.tagName === 'IFRAME') return hud.contentDocument?.documentElement ? hud.contentDocument : null;
  return hud.ownerDocument?.documentElement ? hud.ownerDocument : null;
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
  const sheld = document.getElementById('sheld').getBoundingClientRect();
  const chat = chatEl.getBoundingClientRect();
  const slot = frameBox(statusFrame);
  const hud = liveHud();
  const hudBox = frameBox(hud);
  const hudDoc = hudDocument(hud);
  const portraitDom = !!hudDoc?.querySelector('.pstage')
    && getComputedStyle(hudDoc.querySelector('.pstage')).display !== 'none';
  return {
    stVersion: ST_VERSION,
    helperVersion: TAVERN_HELPER_VERSION,
    vw: innerWidth,
    vh: innerHeight,
    expectedMode: expectedHudMode(innerWidth, innerHeight),
    stMobileChrome: tavernUsesMobileChrome(innerWidth),
    sheldW: Math.round(sheld.width),
    sheldH: Math.round(sheld.height),
    chatW: Math.round(chat.width),
    chatH: Math.round(chat.height),
    chatScrollTop: Math.round(chatEl.scrollTop),
    chatScrollHeight: Math.round(chatEl.scrollHeight),
    chatClientHeight: Math.round(chatEl.clientHeight),
    sheldScrollable: document.getElementById('sheld').scrollHeight - document.getElementById('sheld').clientHeight,
    slotW: Math.round(slot?.width || 0),
    slotH: Math.round(slot?.height || 0),
    slotTop: Math.round(slot?.top || 0),
    hudW: Math.round(hudBox?.width || 0),
    hudH: Math.round(hudBox?.height || 0),
    hudTop: Math.round(hudBox?.top || 0),
    alignment: hudBox && slot ? +(hudBox.top - slot.top).toFixed(2) : null,
    lifted: hud?.id === 'linjiang-hud-live' && hud?.tagName === 'IFRAME',
    nativeFlow: hud?.id === 'linjiang-mobile-native-root',
    portraitDom,
    portraitStatus: hudDoc ? {
      whoLabels: [...hudDoc.querySelectorAll('.pworld-who em')].map((element) => element.textContent.trim()),
      lifeLabels: [...hudDoc.querySelectorAll('.plife-label')].map((element) => element.textContent.trim()),
      placeMeta: hudDoc.querySelector('.pworld-place em')?.textContent.trim() || '',
      timeMeta: hudDoc.querySelector('.pmeta')?.textContent.replace(/\s+/g, ' ').trim() || '',
    } : null,
    hudOverflowX: hudDoc?.documentElement ? hudDoc.documentElement.scrollWidth - hudDoc.documentElement.clientWidth : null,
    /* 资金那一行，两套排版各一个选择器。它是"壳层的 MVU 快照到底有没有落到 HUD 上"的探针：
       样本数据是 ￥286,450，夹具的快照是 ￥512,300。 */
    hudMoney: (hudDoc?.querySelector('.money-line .num') || hudDoc?.querySelector('.pmoney b'))
      ?.textContent.replace(/\s+/g, '').trim() || '',
    helperHeightSamples: [...helperHeightSamples],
    liveHudCount: document.querySelectorAll('#linjiang-hud-live').length
      + (statusFrame?.contentDocument?.getElementById('linjiang-mobile-native-root') ? 1 : 0)
      + (statusFrame?.contentDocument?.getElementById('hud') ? 1 : 0),
    autoscrollMarker: !!document.getElementById('linjiang-hud-autoscroll'),
  };
}

async function waitUntilReady(timeout = 20000) {
  const started = performance.now();
  while (performance.now() - started < timeout) {
    const result = measure();
    if (result.chatScrollHeight > result.chatClientHeight + 300
        && result.slotH > 100 && result.hudW > 100) return result;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('真实酒馆夹具等待 HUD 超时');
}

function paintReadout() {
  const m = measure();
  const target = realPresetById(presetEl.value);
  const viewportNote = target.vw === m.vw && target.vh === m.vh
    ? ''
    : ` · 目标 ${target.vw}×${target.vh}（自动化会设置，手动页需调整窗口）`;
  readoutEl.textContent = `${m.expectedMode} · 实际 ${m.vw}×${m.vh}${viewportNote} · sheld ${m.sheldW} · chat ${m.chatW} · slot ${m.slotW}×${m.slotH} · HUD ${m.hudW}×${m.hudH}`;
}

addEventListener('message', (event) => {
  if (event.data?.type === 'FIXTURE_HELPER_HEIGHT') {
    const height = Math.round(Number(event.data.height) || 0);
    if (height > 0 && helperHeightSamples.at(-1) !== height) helperHeightSamples.push(height);
  }
});

for (const preset of REAL_PRESETS) {
  const option = document.createElement('option');
  option.value = preset.id;
  option.textContent = preset.label;
  presetEl.appendChild(option);
}
const initial = realPresetById(params.get('preset') || 'desktop-fhd');
presetEl.value = initial.id;
widthEl.value = params.get('sheld') || String(initial.sheldVw || 50);
wrapEl.value = params.get('wrap') || '0';
applyState(currentState());

presetEl.addEventListener('change', () => {
  const preset = realPresetById(presetEl.value);
  widthEl.value = String(preset.sheldVw || 50);
  wrapEl.value = '0';
  applyState(currentState());
  syncQuery();
  mountChat();
});
for (const element of [widthEl, wrapEl]) {
  element.addEventListener('change', () => {
    applyState(currentState());
    syncQuery();
    mountChat();
  });
}
reloadEl.addEventListener('click', mountChat);
addEventListener('resize', () => {
  statusFrame?.contentWindow?.postMessage({ type: 'TH_UPDATE_VIEWPORT_HEIGHT' }, '*');
});

window.__linjiangTavernReal = {
  measure,
  waitUntilReady,
  liveHud,
  get statusFrame() { return statusFrame; },
  reload: mountChat,
};

await mountChat();
setInterval(paintReadout, 300);
paintReadout();
