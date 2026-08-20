import { PRESETS, presetById, portraitHud, isDesktop, portraitHudWidth, desktopHudBox } from './embed-contract.js';

const sheldEl = document.getElementById('sheld');
const presetEl = document.getElementById('preset');
const sheldSel = document.getElementById('sheldVw');
const wrapSel = document.getElementById('wrap');
const nestEl = document.getElementById('nest');
const sidebarEl = document.getElementById('sidebar');
const readout = document.getElementById('readout');
const params = new URLSearchParams(location.search);
const headless = params.get('chrome') === '0';

if (headless) document.body.classList.add('is-headless');

const chatMarkup = `
  <div class="chat" id="chat">
    <div class="mes user"><div class="who">你</div><div class="txt">今天先去云庭公寓看看。</div></div>
    <div class="mes ai">
      <div class="who">System Update</div>
      <div class="txt">状态栏嵌在这条消息里，宽度跟阅读栏走；外壳再把 HUD 提到酒馆 body。</div>
      <div id="status-slot"><iframe id="status" title="状态栏"></iframe></div>
    </div>
    <div class="mes user"><div class="who">你</div><div class="txt">再往下翻几条，看占位有没有把阅读流撑开。</div></div>
    <div class="mes ai"><div class="who">临江</div><div class="txt">客厅的灯还亮着。下面这些气泡只是为了让 #sheld 真的可以滚。</div></div>
    <div class="mes ai"><div class="who">临江</div><div class="txt">窄槽、50vw、再套一层 iframe，都是曾经把地点句折成竖排的条件。</div></div>
  </div>
`;

function hudUrl() {
  return new URL('../', location.href).href;
}

function shellUrl() {
  const url = new URL('./embed-shell.html', location.href);
  url.searchParams.set('hud', hudUrl());
  return url.href;
}

function applyChrome(state) {
  document.documentElement.style.setProperty('--sheldWidth', `${state.sheldVw}vw`);
  document.body.classList.toggle('has-sidebar', !!state.sidebar);
  sheldSel.value = String(state.sheldVw);
  wrapSel.value = state.wrapPx ? String(state.wrapPx) : '';
  nestEl.checked = !!state.nest;
  sidebarEl.checked = !!state.sidebar;
}

function currentState() {
  const preset = presetById(presetEl.value);
  return {
    ...preset,
    sheldVw: Number(sheldSel.value) || preset.sheldVw,
    wrapPx: wrapSel.value ? Number(wrapSel.value) : 0,
    nest: nestEl.checked,
    sidebar: sidebarEl.checked,
  };
}

function mountChat(host) {
  host.innerHTML = chatMarkup;
  const status = host.querySelector('#status');
  const slot = host.querySelector('#status-slot');
  const state = currentState();
  if (state.wrapPx && slot) {
    slot.classList.add('is-narrow');
    slot.style.width = `${state.wrapPx}px`;
  }
  status.src = shellUrl();
  return status;
}

function mountSheld() {
  const state = currentState();
  applyChrome(state);
  sheldEl.innerHTML = '';
  if (state.nest) {
    const reading = document.createElement('iframe');
    reading.id = 'reading';
    reading.setAttribute('title', '阅读栏');
    sheldEl.appendChild(reading);
    const doc = reading.contentDocument;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><style>
      html,body{margin:0;background:transparent;color:#d8dae6;font:13px/1.45 sans-serif;}
      .chat{padding:16px 14px 28px;overflow-x:hidden;max-width:100%;}
      .mes{margin:0 0 14px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);}
      .mes.user{background:rgba(140,122,230,.10);}
      .who{font-size:11px;color:#8c7ae6;margin-bottom:6px;}
      #status{display:block;width:100%;height:420px;margin:8px 0 0;border:0;background:#05040a;overflow:hidden;}
      #status-slot{width:100%;overflow:hidden;}
      #status-slot.is-narrow{margin-left:auto;margin-right:auto;}
    </style></head><body></body></html>`);
    doc.close();
    window.__statusFrame = mountChat(doc.body);
  } else {
    window.__statusFrame = mountChat(sheldEl);
  }
}

function liveHud() {
  return document.getElementById('linjiang-hud-live')
    || window.__statusFrame?.contentDocument?.getElementById('hud');
}

function frameBox(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  let x = r.left;
  let y = r.top;
  let win = el.ownerDocument.defaultView;
  while (win && win !== window) {
    const fe = win.frameElement;
    if (!fe) break;
    const fr = fe.getBoundingClientRect();
    x += fr.left;
    y += fr.top;
    win = win.parent;
  }
  return { left: x, top: y, width: r.width, height: r.height };
}

function measure() {
  const vw = innerWidth;
  const vh = innerHeight;
  const sheld = sheldEl.getBoundingClientRect();
  const status = frameBox(window.__statusFrame);
  const hud = liveHud();
  const box = frameBox(hud);
  const doc = hud?.contentDocument;
  const where = doc?.querySelector('.pworld-where b');
  const whereBox = where?.getBoundingClientRect();
  const html = doc?.documentElement;
  const portrait = !!doc?.querySelector('.pstage') && getComputedStyle(doc.querySelector('.pstage')).display !== 'none';
  const expectedW = portraitHud(vw, vh)
    ? portraitHudWidth(vw, status?.width || sheld.width)
    : isDesktop(vw) ? desktopHudBox(vw, vh).width : (status?.width || sheld.width);
  return {
    vw, vh,
    mode: portraitHud(vw, vh) ? 'portrait' : isDesktop(vw) ? 'desktop' : 'mobile-landscape',
    sheldW: Math.round(sheld.width),
    slotW: Math.round(status?.width || 0),
    hudW: Math.round(box?.width || 0),
    hudH: Math.round(box?.height || 0),
    hudLeft: Math.round(box?.left || 0),
    expectedW,
    lifted: hud?.id === 'linjiang-hud-live',
    portraitDom: portrait,
    pageOpen: !!html?.classList.contains('is-page-open'),
    overflowX: (html?.scrollWidth || 0) - (html?.clientWidth || 0),
    innerScroll: (html?.scrollHeight || 0) - (html?.clientHeight || 0),
    whereW: whereBox ? +whereBox.width.toFixed(1) : 0,
    whereH: whereBox ? +whereBox.height.toFixed(1) : 0,
    whereFs: where ? parseFloat(getComputedStyle(where).fontSize) : 0,
    whereText: where?.textContent || '',
  };
}

window.__linjiangEmbed = { measure, liveHud, mountSheld };

for (const p of PRESETS) {
  const opt = document.createElement('option');
  opt.value = p.id;
  opt.textContent = p.label;
  presetEl.appendChild(opt);
}

const initial = presetById(params.get('preset') || 'iphone-80');
presetEl.value = initial.id;
sheldSel.value = String(params.get('sheld') || initial.sheldVw);
wrapSel.value = params.get('wrap') || (initial.wrapPx ? String(initial.wrapPx) : '');
nestEl.checked = params.get('nest') === '1' || !!initial.nest;
sidebarEl.checked = params.get('sidebar') === '1' || !!initial.sidebar;

const syncQuery = () => {
  if (headless) return;
  const state = currentState();
  const next = new URL(location.href);
  next.searchParams.set('preset', presetEl.value);
  next.searchParams.set('sheld', String(state.sheldVw));
  if (state.wrapPx) next.searchParams.set('wrap', String(state.wrapPx));
  else next.searchParams.delete('wrap');
  if (state.nest) next.searchParams.set('nest', '1');
  else next.searchParams.delete('nest');
  if (state.sidebar) next.searchParams.set('sidebar', '1');
  else next.searchParams.delete('sidebar');
  history.replaceState(null, '', next);
};

const paintReadout = () => {
  const m = measure();
  readout.textContent =
    `${m.mode} · 窗 ${m.vw}×${m.vh} · 阅读 ${m.sheldW} · 槽 ${m.slotW} · HUD ${m.hudW}×${m.hudH}`
    + (m.lifted ? ' · 已提出' : ' · 仍在槽内');
};

presetEl.addEventListener('change', () => {
  const p = presetById(presetEl.value);
  sheldSel.value = String(p.sheldVw);
  wrapSel.value = p.wrapPx ? String(p.wrapPx) : '';
  nestEl.checked = !!p.nest;
  sidebarEl.checked = !!p.sidebar;
  syncQuery();
  mountSheld();
});

for (const el of [sheldSel, wrapSel, nestEl, sidebarEl]) {
  el.addEventListener('change', () => { syncQuery(); mountSheld(); });
}

document.getElementById('reload').addEventListener('click', mountSheld);

const syncReadingHeight = () => {
  const reading = document.getElementById('reading');
  if (!reading) return;
  const doc = reading.contentDocument;
  if (!doc) return;
  const h = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, 1);
  if (reading._h !== h) {
    reading._h = h;
    reading.style.height = `${h}px`;
  }
};

mountSheld();
setInterval(() => { syncReadingHeight(); paintReadout(); }, 400);
paintReadout();
