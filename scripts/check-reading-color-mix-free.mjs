/**
 * 正文美化：color-mix 退场守卫。
 *
 * 背景：旧 WebView（Chromium < 111 / WKWebView < 16.2）不认 color-mix()。而原来那批
 * color-mix 里都套着 var()，含 var() 的声明在解析期算合法、到计算期才作废，属性会
 * 掉成 unset —— 「前面补一条纯色打底」救不回来。所以混色一律改成预先算好的
 * 通道变量（--X-rgb / --X-a）和实色变量（--X-wNN / --char-hover-bg / …）。
 *
 * 这个脚本盯两件事：
 *   1. 源码里不能再出现 color-mix( 调用；
 *   2. 每个替换表达式在它真正生效的 scope 里，解析结果必须和原来的 color-mix 一致。
 *      比对是在真实层叠下做的（Chromium 支持 color-mix，所以能拿到"正确答案"），
 *      顺带还校验了 --X-rgb/--X-a 和基色 --X 没有走偏。
 *
 * 用法：node scripts/check-reading-color-mix-free.mjs
 */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const FILE = '外部部署/V20260826/正文美化.html';
const source = readFileSync(FILE, 'utf8')
  .replace(/^```\s*\r?\n/, '')
  .replace(/\r?\n```\s*$/, '');

const failures = [];

/* ── 1. 源码里不能再有 color-mix( 调用 ─────────────────────── */
{
  // 注释里可以提 color-mix（讲清楚为什么不用它），但不能再有调用。
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const hits = (stripped.match(/color-mix\(/g) || []).length;
  if (hits) failures.push(`源码里还有 ${hits} 处 color-mix( 调用（注释外）`);
  console.log(`${hits ? 'FAIL' : 'ok  '}  color-mix() 调用残留: ${hits}`);
}

/* ── 2. 表达式等价性比对 ───────────────────────────────────── */
const HOVER = 'rgba(60, 72, 128, .42)';
const cm = (base, p, other) => `color-mix(in srgb, ${base} ${p}%, ${other})`;
const A = (tok, p) => `rgb(var(--${tok}-rgb) / ${p})`;
const AA = (tok, p) => `rgb(var(--${tok}-rgb) / calc(var(--${tok}-a) * ${p}))`;

/** 不透明基色：alpha 缩放 + 通道自洽 */
const opaquePairs = (tok, ps) => [
  [`var(--${tok})`, `rgb(var(--${tok}-rgb))`],
  ...ps.map(p => [cm(`var(--${tok})`, p * 100, 'transparent'), A(tok, String(p).replace(/^0/, ''))]),
];
/** 自带 alpha 的基色 */
const alphaPairs = (tok, ps) => [
  [`var(--${tok})`, `rgb(var(--${tok}-rgb) / calc(var(--${tok}-a) * 1))`],
  ...ps.map(p => [cm(`var(--${tok})`, p * 100, 'transparent'), AA(tok, String(p).replace(/^0/, ''))]),
];
/** 与 #fff 混出的实色 */
const whitePairs = (tok, ps) => ps.map(p => [cm(`var(--${tok})`, p, '#fff'), `var(--${tok}-w${p})`]);

const THEME_PAIRS = [
  ...opaquePairs('paper', [0.88, 0.7, 0.94]),
  ...opaquePairs('paper-soft', [0.82]),
  ...opaquePairs('stage', [0.48, 0.42]),
  ...opaquePairs('accent', [0.34, 0.46, 0.52, 0.72]),
  ...alphaPairs('edge', [0.56, 0.36]),
  ...alphaPairs('rule', [0.68, 0.82]),
  ...alphaPairs('quote-bg', [0.42, 0.36, 0.78, 0.76]),
  [cm('var(--accent-soft)', 72, 'var(--paper-deep)'), 'var(--char-hover-bg)'],
  [cm('var(--paper)', 55, 'var(--accent)'), 'var(--dlg-node-mid)'],
  [cm('var(--ink)', 88, 'var(--paper)'), 'var(--bubble-ink)'],
  [cm('var(--speech-ink)', 58, 'var(--ink-faint)'), 'var(--dialogue-em-ink)'],
  // .named-inner-voice 那处带 fallback，单独确认 fallback 也对齐
  [cm('var(--accent, #668578)', 52, 'transparent'), 'rgb(var(--accent-rgb, 102 133 120) / .52)'],
];

const EVT_PAIRS = [
  ...opaquePairs('signal', [0.7]),
  ...whitePairs('signal', [72, 88, 60]),
  ...alphaPairs('wash', [0.48, 0.34, 0.3, 0.78, 0.24]),
  ...alphaPairs('glow', [0.22, 0.66, 0.85]),
  ...alphaPairs('rim', [0.88]),
];
const OPT_PAIRS = [
  ...opaquePairs('signal', [0.8, 0.62, 0.55, 0.52, 0.2, 0.16]),
  ...whitePairs('signal', [96, 40, 30]),
  ...alphaPairs('glow', [0.85]),
  ...alphaPairs('rim', [0.88]),
  [cm('var(--signal)', 22, HOVER), 'var(--signal-hover-bg)'],
];
const GAIN_PAIRS = [...opaquePairs('gc', [0.55]), ...whitePairs('gc', [82, 88])];
const BOND_PAIRS = [...opaquePairs('bc', [0.34, 0.48]), ...whitePairs('bc', [76, 86])];
const CAST_PAIRS = [...opaquePairs('ac', [0.6, 0.42, 0.4, 0.16]), ...whitePairs('ac', [70, 34, 30])];

const CATS = ['纯爱', '日常', '生理窘迫', '调教', '睡奸', '催眠奸', '特殊H'];
const TONES = ['rose', 'violet', 'crimson', 'mint', 'amber', 'sky', 'gold', 'coin'];
const THEMES = ['warm-white', 'paper-white', 'dark', 'green'];

/** 探针 DOM：只要 selector 对得上就够，不需要真实卡片结构 */
function buildProbes() {
  const evt = [{ cat: null }, ...CATS.map(c => ({ cat: c }))];
  return {
    evt,
    // 每个 scope 一个 key，页面里按 key 建一个探针元素
    scopes: [
      ...evt.map(e => ({ key: `evt:${e.cat || '-'}`, pairs: 'EVT', cat: e.cat })),
      ...evt.map(e => ({ key: `opt:${e.cat || '-'}`, pairs: 'OPT', cat: e.cat })),
      { key: 'gain:-', pairs: 'GAIN', tone: null },
      ...TONES.map(t => ({ key: `gain:${t}`, pairs: 'GAIN', tone: t })),
      { key: 'gain-down:rose', pairs: 'GAIN', tone: 'rose', down: true },
      { key: 'gain-down:violet', pairs: 'GAIN', tone: 'violet', down: true },
      { key: 'bond:好感度', pairs: 'BOND', k: '好感度' },
      { key: 'bond:顺从度', pairs: 'BOND', k: '顺从度' },
      { key: 'cast:default', pairs: 'CAST', ac: null },
      { key: 'cast:runtime', pairs: 'CAST', ac: '#ff5fa8' },
      { key: 'cast:hsl', pairs: 'CAST', ac: 'hsl(212 46% 62%)' },
    ],
  };
}

const port = 5241;
const server = await createServer({ server: { port }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await page.route('https://fonts.gstatic.com/**', r => r.fulfill({ status: 204, body: '' }));
await page.route('https://fontsapi.zeoseven.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
await page.setContent('<iframe id="reader" style="display:block;width:100%;height:100%;border:0"></iframe>');
await page.locator('#reader').evaluate((frame, html) => { frame.srcdoc = html; }, source);
const reader = page.frameLocator('#reader');
await reader.locator('body').waitFor({ timeout: 20000 });
await page.waitForTimeout(600);

// Chromium 支持 color-mix，否则这份"正确答案"就无从取得
const supportsColorMix = await reader.locator('body').evaluate(() => CSS.supports('color', 'color-mix(in srgb, red, blue)'));
if (!supportsColorMix) {
  console.log('FAIL  跑测的 Chromium 不支持 color-mix，拿不到基准值');
  process.exit(1);
}

const PROBES = buildProbes();
const PAIRS = { EVT: EVT_PAIRS, OPT: OPT_PAIRS, GAIN: GAIN_PAIRS, BOND: BOND_PAIRS, CAST: CAST_PAIRS };

const results = await reader.locator('body').evaluate((body, { scopes, pairs, themePairs, themes }) => {
  /* 解析 computed color：可能是 rgb()/rgba()，也可能是 color(srgb …) */
  function toRgba(s) {
    s = String(s).trim();
    let m = /^rgba?\(([^)]+)\)$/.exec(s);
    if (m) {
      const p = m[1].split(/[,/]/).map(x => parseFloat(x));
      return [p[0], p[1], p[2], p.length > 3 && !Number.isNaN(p[3]) ? p[3] : 1];
    }
    m = /^color\(srgb\s+([^)]+)\)$/.exec(s);
    if (m) {
      const p = m[1].split(/[\s/]+/).filter(Boolean).map(x => parseFloat(x));
      return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1];
    }
    return null;
  }

  const out = [];
  const measure = (host, list, scopeKey) => {
    const probe = document.createElement('span');
    host.appendChild(probe);
    for (const [orig, repl] of list) {
      probe.style.color = '';
      probe.style.color = orig;
      const a = getComputedStyle(probe).color;
      probe.style.color = '';
      probe.style.color = repl;
      const b = getComputedStyle(probe).color;
      out.push({ scope: scopeKey, orig, repl, a, b, ra: toRgba(a), rb: toRgba(b) });
    }
    probe.remove();
  };

  const content = document.getElementById('readingContent');
  [...content.children].forEach(el => { if (el.id !== 'inlineControls' && el.id !== 'settingsPanel') el.remove(); });

  /* 主题层：逐个主题切换，探针放在 .reading-content 下 */
  for (const t of themes) {
    body.dataset.theme = t;
    measure(content, themePairs, `theme:${t}`);
  }
  body.dataset.theme = 'warm-white';

  /* 事件卡：按 scope 造探针宿主 */
  for (const s of scopes) {
    const evt = document.createElement('div');
    evt.className = 'evt';
    if (s.cat) evt.dataset.cat = s.cat;
    content.appendChild(evt);
    let host = evt;
    if (s.pairs === 'OPT') {
      const opt = document.createElement('button');
      opt.className = 'evt-opt';
      if (s.cat) opt.dataset.cat = s.cat;
      evt.appendChild(opt);
      host = opt;
    } else if (s.pairs === 'GAIN') {
      const g = document.createElement('span');
      g.className = 'evt-gain' + (s.down ? ' down' : '');
      if (s.tone) g.dataset.tone = s.tone;
      evt.appendChild(g);
      host = g;
    } else if (s.pairs === 'BOND') {
      const b2 = document.createElement('span');
      b2.className = 'evt-bond';
      b2.dataset.k = s.k;
      evt.appendChild(b2);
      host = b2;
    } else if (s.pairs === 'CAST') {
      const c = document.createElement('div');
      c.className = 'evt-cast';
      // 运行期路径：让页面自己的 evtAcVars() 生成 style，顺带校验它的算法
      if (s.ac) c.setAttribute('style', window.evtAcVars ? window.evtAcVars(s.ac) : '--ac:' + s.ac);
      evt.appendChild(c);
      host = c;
    }
    measure(host, pairs[s.pairs], s.key);
    evt.remove();
  }
  return out;
}, { scopes: PROBES.scopes, pairs: PAIRS, themePairs: THEME_PAIRS, themes: THEMES });

let checked = 0;
let quantized = 0;
for (const r of results) {
  checked++;
  if (!r.ra || !r.rb) { failures.push(`${r.scope}: 解析失败 ${r.orig} -> ${r.a} / ${r.b}`); continue; }
  /* 比"真正画出来的那个值"。color-mix 的结果 Chromium 序列化成 color(srgb …) 保留全精度，
     而实色/rgba() 会按 8bit 往回收，直接比字符串会被序列化精度误伤。两边都量化到 8bit
     再比，允许 1 档误差（预算实色本身就落在 8bit 上）。 */
  const q = v => Math.round(Math.max(0, Math.min(255, v)));
  const qa = a => Math.round(Math.max(0, Math.min(1, a)) * 255);
  const da = [q(r.ra[0]), q(r.ra[1]), q(r.ra[2]), qa(r.ra[3])];
  const db = [q(r.rb[0]), q(r.rb[1]), q(r.rb[2]), qa(r.rb[3])];
  const diff = Math.max(...da.map((v, i) => Math.abs(v - db[i])));
  if (diff > 1) {
    failures.push(`${r.scope}\n      原: ${r.orig}\n        = ${r.a}  -> [${da}]\n      新: ${r.repl}\n        = ${r.b}  -> [${db}]\n      8bit 偏差 ${diff}`);
  } else if (diff === 1) {
    quantized++;
  }
}
console.log(`${failures.length ? 'FAIL' : 'ok  '}  表达式等价比对: ${checked} 项（其中 ${quantized} 项存在 1/255 量化差）`);

await browser.close();
await server.close();

if (failures.length) {
  console.log(`\ncolor-mix 兜底校验失败 ${failures.length} 项：`);
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
console.log(`\n正文美化 color-mix 兜底：${checked} 项等价比对全部通过（最大偏差 ≤ 1/255）`);
