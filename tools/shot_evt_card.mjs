import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = 'file:///' + path.join(root, '变量相关', '突发事件卡片小样.html').replace(/\\/g, '/');
const out = path.join(root, 'artifacts', 'evt-card');
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1400 }, deviceScaleFactor: 2 });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);

await page.screenshot({ path: path.join(out, 'A-full.png'), fullPage: true });
const secs = await page.$$('.spec');
for (let i = 0; i < secs.length; i++) await secs[i].screenshot({ path: path.join(out, `A-${i}.png`) });
const first = await page.$('.evt');
if (first) await first.screenshot({ path: path.join(out, 'A-card.png') });

const report = await page.evaluate(() => {
  const r = { errors: [], cast: [], bonds: [], geom: {} };
  document.querySelectorAll('.evt-cast').forEach(c => {
    const img = c.querySelector('.evt-face img');
    const box = c.getBoundingClientRect();
    r.cast.push({
      name: c.querySelector('.nm').textContent.replace('同行', '').trim(),
      ac: c.style.getPropertyValue('--ac'),
      avatar: !!img && img.complete && img.naturalWidth > 0 ? 'OK' : '回退首字',
      faceSize: Math.round(c.querySelector('.evt-face').getBoundingClientRect().width),
      mood: c.querySelector('.evt-mood')?.textContent.trim(),
      abn: [...c.querySelectorAll('.evt-abn')].map(x => x.textContent.trim()),
      w: Math.round(box.width)
    });
  });
  r.bonds = [...document.querySelectorAll('.evt .evt-bond')].map(b => b.textContent.trim());
  // 关键几何：角色是否真的落在场景图内、没有溢出卡片
  const card = document.querySelector('.evt-a .evt-glass');
  const stage = document.querySelector('.evt-a .stage');
  const cast = document.querySelector('.evt-a .evt-cast');
  const body = document.querySelector('.evt-a .body');
  if (card && stage && cast && body) {
    const cb = card.getBoundingClientRect(), sb = stage.getBoundingClientRect();
    const kb = cast.getBoundingClientRect(), bb = body.getBoundingClientRect();
    r.geom = {
      卡片高: Math.round(cb.height),
      场景高: Math.round(sb.height),
      角色在场景内: kb.top >= sb.top - 1 && kb.bottom <= sb.bottom + 1,
      角色未压到选项: Math.round(bb.top - kb.bottom) >= 0,
      角色距场景底: Math.round(sb.bottom - kb.bottom),
      角色距卡左: Math.round(kb.left - cb.left),
      段数: '场景+选择 两段'
    };
  }
  r.overflow = [...document.querySelectorAll('.evt *')]
    .filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.className).slice(0, 6);
  r.hasOldActor = !!document.querySelector('.evt-actor');
  r.hasOldTrack = !!document.querySelector('.evt-track');

  // 可见性断言：确认关键文字真的画在最上层，没被场景图盖掉。
  // elementFromPoint 取该元素中心点的命中目标，被覆盖时会返回压在上面的那层。
  r.hit = {};
  const probe = (sel, label) => {
    const el = document.querySelector(sel);
    if (!el) { r.hit[label] = '缺失'; return; }
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) { r.hit[label] = '零尺寸'; return; }
    const top = document.elementFromPoint(b.left + Math.min(30, b.width / 2), b.top + b.height / 2);
    r.hit[label] = (el === top || el.contains(top)) ? '可见'
      : '被遮挡 ← ' + (top ? top.className || top.tagName : 'null');
  };
  probe('.evt-a .evt-title', '标题');
  probe('.evt-a .evt-eyebrow', 'eyebrow');
  probe('.evt-a .evt-brief', '悬念');
  probe('.evt-a .evt-mp', '时段丸');
  probe('.evt-a .evt-bond', '羁绊丸');
  probe('.evt-a .evt-cast .nm', '角色名');
  probe('.evt-a .plate', '场所铭牌');
  probe('.evt-a .evt-opt .act', '选项文案');
  return r;
});
report.errors = errs;

await page.setViewportSize({ width: 400, height: 1700 });
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(out, 'A-narrow-400.png'), fullPage: true });
report.narrow = await page.evaluate(() => {
  const s = document.querySelector('.evt-a .stage');
  const c = document.querySelector('.evt-a .evt-cast');
  return {
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    角色在场景内: c.getBoundingClientRect().bottom <= s.getBoundingClientRect().bottom + 1,
    faceSize: Math.round(c.querySelector('.evt-face').getBoundingClientRect().width)
  };
});

fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
