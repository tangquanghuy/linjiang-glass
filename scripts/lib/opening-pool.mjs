/**
 * 开局可选住所／岗位的唯一真源是 opening.js 的 HOMES / JOBS。
 *
 * 这个池子以前在仓库里有四份手抄副本（opening.js、city/plate_map.js、
 * scripts/export-ai-map.mjs、scripts/build-worldbook-map.mjs），加一处住所要改四个
 * 地方，漏一个的失败方式还都不一样：漏 plate_map 是牌子不画、节点点不动；
 * 漏 export-ai-map 是新住所没有精确通勤；漏 build-worldbook 是给 AI 的岗位基线
 * 和开局页对不上。
 *
 * 凡是跑在 node 里的地方都改成从这里读，副本就只剩 opening.js（真源）和
 * city/plate_map.js（在 iframe 里独立运行、拿不到 opening.js，只能抄一份，
 * 由 scripts/check-opening-nodes.mjs 逐条比对兜住）。
 */
import fs from 'node:fs';

const OPENING = 'opening.js';

/** 括号配平地抠出 `const NAME=[...]`，不依赖缩进和换行位置 */
function cutArray(src, name) {
  const at = src.indexOf(`const ${name}=[`);
  if (at < 0) throw new Error(`${OPENING} 里找不到 const ${name}=[`);
  let depth = 0;
  for (let i = src.indexOf('[', at); i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']' && !--depth) {
      return new Function(`${src.slice(at, i + 1)}; return ${name};`)();
    }
  }
  throw new Error(`${name} 的括号没配平`);
}

/** { HOMES, JOBS, homeIds, jobIds }。JOBS 含「暂时无业」，jobIds 已剔除它 */
export function readOpeningPool(path = OPENING) {
  const src = fs.readFileSync(path, 'utf8');
  const HOMES = cutArray(src, 'HOMES');
  const JOBS = cutArray(src, 'JOBS');
  return {
    HOMES,
    JOBS,
    homeIds: HOMES.map(h => h.id),
    // 「暂时无业」没有 node，不是地图上的点
    jobIds: JOBS.filter(j => j.node).map(j => j.node),
  };
}
