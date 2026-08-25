/* 候选外链源的可达性实测。
   ------------------------------------------------------------------
   正文美化里那 5 张内联 base64 WebP 要挪成外链，托管位置必须是国内直连可用的。这支脚本
   从**当前这台机器**实测各候选源：DNS、TLS、首字节、总耗时，以及有没有
   Access-Control-Allow-Origin（决定 外部部署/V20260826/素材缓存脚本.js 能不能把它们收进 IndexedDB）。

   注意结论只对跑这支脚本的网络环境成立。换网络要重跑。

   用法：node scripts/probe-cdn-reach.mjs [--repeat 3]
*/
const argv = process.argv.slice(2);
const repeatIndex = argv.indexOf('--repeat');
const REPEAT = repeatIndex >= 0 ? Number(argv[repeatIndex + 1]) || 3 : 3;

const TARGETS = [
  {
    id: '项目 Pages（本文件已依赖）',
    url: 'https://tangquanghuy.github.io/linjiang-glass/',
    note: 'EVT_PLATE_CDN 就指向这个源',
  },
  {
    id: 'jsDelivr testingcf',
    url: 'https://testingcf.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js',
    note: '酒馆助手自己用的就是这个端点',
  },
  { id: 'jsDelivr fastly', url: 'https://fastly.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js' },
  { id: 'jsDelivr gcore', url: 'https://gcore.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js' },
  { id: 'jsDelivr 主域', url: 'https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js', note: '2022 年起国内被墙，作为对照' },
  { id: 'raw.githubusercontent', url: 'https://raw.githubusercontent.com/jquery/jquery/3.7.1/dist/jquery.min.js', note: '正文美化 2435 行的字体在用' },
  { id: 'unpkg', url: 'https://unpkg.com/jquery@3.7.1/dist/jquery.min.js' },
  { id: '图床 anchor.bolt.qzz.io', url: 'https://anchor.bolt.qzz.io/', note: '素材缓存脚本说它不给 ACAO' },
];

const once = async (url) => {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'linjiang-cdn-probe' },
    });
    /* 读完 body 才算真的通，只看响应头会漏掉传输中被重置的情况。 */
    const buffer = await response.arrayBuffer();
    return {
      ok: response.ok,
      status: response.status,
      ms: Math.round(performance.now() - started),
      bytes: buffer.byteLength,
      acao: response.headers.get('access-control-allow-origin') || '',
      cache: response.headers.get('cache-control') || '',
      server: response.headers.get('server') || '',
    };
  } catch (error) {
    return { ok: false, ms: Math.round(performance.now() - started), error: error.name === 'AbortError' ? '超时(12s)' : error.message };
  } finally {
    clearTimeout(timer);
  }
};

console.log(`从本机实测，每个源 ${REPEAT} 次\n`);
const rows = [];
for (const target of TARGETS) {
  const runs = [];
  for (let i = 0; i < REPEAT; i += 1) runs.push(await once(target.url));
  const good = runs.filter((run) => run.ok);
  const row = {
    id: target.id,
    note: target.note || '',
    成功: `${good.length}/${REPEAT}`,
    最快: good.length ? `${Math.min(...good.map((r) => r.ms))}ms` : '-',
    中位: good.length ? `${good.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(good.length / 2)]}ms` : '-',
    字节: good.length ? good[0].bytes : 0,
    ACAO: good.length ? (good[0].acao || '(无)') : '-',
    错误: good.length ? '' : (runs[0].error || `HTTP ${runs[0].status}`),
  };
  rows.push(row);
  console.log(
    `${row.id.padEnd(28)} 成功 ${row.成功}  最快 ${row.最快.padStart(7)}  中位 ${row.中位.padStart(7)}  `
    + `${String(row.字节).padStart(7)}B  ACAO ${row.ACAO.padEnd(6)} ${row.错误}${row.note ? `  ← ${row.note}` : ''}`,
  );
}
