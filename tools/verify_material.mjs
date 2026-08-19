/* Checks the claim that the dock is the *same* glass as the shell rather than a
   lookalike -- and pins down the one place they are allowed to differ.
   
   MUST_MATCH is the material: refraction, scatter, frost, and the additive blend
   modes.  If any of these drift the two panels stop being the same substance.
   
   DOCUMENTED is the body tint alpha.  The shell's .56 was solved against the
   prototype's lower bar, which sits over dark desk and wall; the dock hangs over
   bright sky, where the same alpha buries the scene and the panel reads opaque.
   The test asserts the hue is identical and only the alpha differs, so a
   copy-paste drift in the colour itself still fails. */
import { chromium } from 'playwright';

const url = process.env.HUD_URL || 'http://127.0.0.1:5174/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1672, height: 941 } });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => [...document.querySelectorAll('.card-art')].every((i) => i.dataset.laid === '1'));
await page.locator('.card').first().click();
await page.waitForSelector('.dock-root');
await page.waitForTimeout(400);

const MUST_MATCH = [
  ['refraction', '.glass-blur', '.dock-blur', ['backdropFilter']],
  ['scatter', '.glass-scatter', '.dock-scatter', ['backdropFilter', 'mixBlendMode', 'opacity']],
  ['frost', '.glass-frost', '.dock-frost', ['opacity', 'mixBlendMode', 'backgroundImage']],
  ['edge light', '.glass-edge', '.dock-edge', ['mixBlendMode']],
  ['lens fog', '.glass-lens', '.dock-lens', ['mixBlendMode']],
];

const probe = await page.evaluate((pairs) => {
  const read = (sel, props) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return Object.fromEntries(props.map((p) => [p, cs[p]]));
  };
  return {
    rows: pairs.map(([name, aSel, bSel, props]) => ({
      name,
      shell: read(aSel, props),
      dock: read(bSel, props),
      props,
    })),
    tint: {
      shell: read('.glass-tint', ['backgroundColor'])?.backgroundColor,
      dock: read('.dock-tint', ['backgroundColor'])?.backgroundColor,
    },
  };
}, MUST_MATCH);

await browser.close();

let bad = 0;
const short = (v) => (v.length > 56 ? `${v.slice(0, 53)}...` : v);
for (const row of probe.rows) {
  if (!row.shell || !row.dock) { console.log(`MISSING  ${row.name}`); bad++; continue; }
  for (const p of row.props) {
    const same = row.shell[p] === row.dock[p];
    if (!same) bad++;
    console.log(`${same ? 'same' : 'DIFF'}  ${row.name.padEnd(11)} ${p.padEnd(16)} ` +
      (same ? short(row.shell[p]) : `\n        shell=${short(row.shell[p])}\n        dock =${short(row.dock[p])}`));
  }
}

/* The tint: hue must match, alpha is allowed to. */
const parse = (s) => {
  const n = s.match(/[\d.]+/g).map(Number);
  return { rgb: n.slice(0, 3).join(','), a: n[3] ?? 1 };
};
const st = parse(probe.tint.shell);
const dk = parse(probe.tint.dock);
console.log(`\nbody tint   shell rgb(${st.rgb}) a=${st.a}`);
console.log(`            dock  rgb(${dk.rgb}) a=${dk.a}`);
if (st.rgb !== dk.rgb) {
  console.log('DIFF  body tint hue drifted -- the two panels are no longer the same substance');
  bad++;
} else if (st.a === dk.a) {
  console.log('note  alpha is identical; the dock will read heavier than the mockups over bright sky');
} else {
  console.log(`same  hue identical, alpha differs by ${(st.a - dk.a).toFixed(2)} (documented: dock sits over bright sky)`);
}

console.log(bad ? `\n${bad} unexpected difference(s)` : '\nmaterial verified');
process.exitCode = bad ? 1 : 0;
