/* 直接比两份 streamScale 的实现，不经过浏览器：
   开局页那份是 辅助计算脚本.js 的镜像，逐档比一遍，漂了就非零退出。 */
const fs = require('fs');
const cut = (src, name) => {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('找不到 ' + name);
  let d = 0;
  for (let j = src.indexOf('{', at); j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}' && !--d) return src.slice(at, j + 1);
  }
  throw new Error(name + ' 括号不配平');
};

/* 读逻辑那份：streamScale / TIER_LABELS / roundNice 都在 public/shell/aux-shell.js 里，
   粘贴的 外部部署/V20260826/辅助计算脚本.js 拆分后只剩礼物表。见 scripts/build-aux-shell.mjs。 */
const auxSrc = fs.readFileSync('public/shell/aux-shell.js', 'utf8');
const table = auxSrc.slice(auxSrc.indexOf('const TIER_LABELS'), auxSrc.indexOf('function roundNice'));
const aux = new Function(table + cut(auxSrc, 'roundNice') + cut(auxSrc, 'tierLabel')
  + cut(auxSrc, 'streamScale') + cut(auxSrc, 'tierOfFollowers')
  + 'return { streamScale, tierOfFollowers };')();

const pageSrc = fs.readFileSync('opening.js', 'utf8');
const page = new Function(cut(pageSrc, 'clampTier') + cut(pageSrc, 'tierLabel') + cut(pageSrc, 'roundNice')
  + cut(pageSrc, 'streamScale') + cut(pageSrc, 'tierOfFollowers')
  + 'return { streamScale, tierOfFollowers };')();

let bad = 0;
for (let t = 0; t <= 1000; t++) {
  const x = t / 10;
  const a = aux.streamScale(x);
  const b = page.streamScale(x);
  const same = a.档位名 === b.label && a.粉丝数 === b.followers && a.底盘热度 === b.base
    && a.舰长数 === b.guards && a.提督数 === b.admirals && a.总督数 === b.governors;
  if (!same) { bad++; if (bad < 4) console.log('✗ 档位', x, JSON.stringify(a), JSON.stringify(b)); }
}
console.log(bad ? `两份实现有 ${bad} 档不一致` : '两份 streamScale 逐档一致（0–100，步长 0.1，共 1001 档）');

console.log('\n七位主播（粉丝数为作者定值，其余全部反解）:');
for (const [n, f] of [['塔菲', 550000], ['红蔷薇', 400000], ['东雪莲', 300000], ['沙花叉', 150000], ['时雨羽衣', 130000], ['斯黛拉', 90000], ['璃亚梦', 60000]]) {
  const t = aux.tierOfFollowers(f);
  const s = aux.streamScale(t);
  const p = page.streamScale(page.tierOfFollowers(f));
  const ok = s.底盘热度 === p.base && s.舰长数 === p.guards;
  console.log(`  ${n.padEnd(5)} 粉丝 ${String(f).padStart(7)} → 档位 ${String(t).padStart(5)} ${s.档位名.padEnd(5)} 热度 ${String(s.底盘热度).padStart(7)} 舰长 ${String(s.舰长数).padStart(5)} 提督 ${String(s.提督数).padStart(3)} 总督 ${s.总督数} ${ok ? '' : ' ← 两份不一致'}`);
}
process.exitCode = bad ? 1 : 0;
