/* 临时：线上 fishing.html 是不是已经瘦下来、素材是不是指向 CDN。用完即删。 */
const URL_ = 'https://tangquanghuy.github.io/linjiang-glass/arcade/fishing.html';
const DEADLINE = Date.now() + 8 * 60 * 1000;

while (Date.now() < DEADLINE) {
    const t0 = Date.now();
    let html = '';
    try {
        const res = await fetch(`${URL_}?t=${Date.now()}`, { cache: 'no-store' });
        html = await res.text();
    } catch (e) {
        console.log(`  取不到(${e.name})，15 秒后重试`);
        await new Promise((r) => setTimeout(r, 15000));
        continue;
    }
    const ms = Date.now() - t0;
    const kb = Math.round(Buffer.byteLength(html) / 1024);
    const b64 = [...html.matchAll(/data:[a-z/+.-]+;base64,/g)].length;
    const cdn = [...html.matchAll(/testingcf\.jsdelivr\.net[^"']*arcade\/assets\/games\//g)].length;
    const local = [...html.matchAll(/(?<!jsdelivr\.net\/gh\/[^"']{0,80})["']assets\/games\//g)].length;
    console.log(`[${new Date().toLocaleTimeString()}] ${String(ms).padStart(6)}ms  ${String(kb).padStart(5)}KB  base64=${b64}  指向CDN的素材=${cdn}`);

    if (kb < 200 && cdn > 0) {
        console.log('\n=== 线上结论 ===');
        console.log(`  [通过] fishing.html 已瘦到 ${kb}KB（之前 2753KB），取回 ${ms}ms`);
        console.log(`  [${b64 === 0 ? '通过' : '失败'}] 内联 base64 数 = ${b64}`);
        console.log(`  [通过] ${cdn} 处素材指向 testingcf`);
        /* 顺手量一下最大的那张素材从 CDN 取要多久。 */
        const one = 'https://testingcf.jsdelivr.net/gh/tangquanghuy/linjiang-glass@main/arcade/assets/games/fishing-background.webp';
        const t1 = Date.now();
        const r2 = await fetch(one, { cache: 'no-store' });
        const kb2 = Math.round((await r2.arrayBuffer()).byteLength / 1024);
        console.log(`  [${r2.ok ? '通过' : '失败'}] 最大精灵图 ${kb2}KB 取回 ${Date.now() - t1}ms`);
        process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 20000));
}
console.log('超时：8 分钟内没看到线上瘦身生效，CI 可能还在跑');
process.exit(1);
