/* 生成一整套指向**测试镜像**的外部部署文件，供真机 / 模拟器验证。
   ==================================================================
   外部部署的那批文件（状态栏、正文美化、开局、辅助计算脚本、素材缓存脚本……）是复制粘贴进
   酒馆的，它们内部写着两类指向生产的外链：

     Pages      https://tangquanghuy.github.io/linjiang-glass/...
     jsDelivr   https://testingcf.jsdelivr.net/gh/tangquanghuy/linjiang-glass@main/...

   只改状态栏一份是不够的：正文美化要从 Pages 取城市底图页、从 jsDelivr 取那份外链样式表；
   开局要取三张素材；辅助计算脚本要取 aux-shell.js。任何一条还指着生产，验的就是「新壳层配旧
   资源」——一个现实中不存在的组合，而且出问题时根本分不清是哪一半。

   所以这里把整套都生成一遍，两类外链一起改写到镜像仓库。

   为什么默认从**工作区**读，而不是从某个 git 提交读
   ------------------------------------------------------------------
   这一条改过一次。原来一律 `git show <ref>:<path>`，理由是"跟镜像同源，避免 404 在无关的
   地方"—— 那时候镜像装的也只是已提交的代码，两边确实同源。

   但那套组合和这个仓库存在的唯一目的相反：镜像是用来验**还没上线、通常也还没提交**的改动的。
   实测撞到过：工作区的 正文美化-外链素材版.html 已经指向 reading.0697f41a.css，而那个文件
   还没提交；于是预览文件从 git 读到的是旧的 reading.bab922d8.css，手机上验的是**上一版配色**，
   而且连 404 都不报 —— 最坏的那种失败，安静地验错东西。

   现在两边都改成快照工作区（publish-hud-preview.mjs 同步改了），所以「同源」这个前提仍然成立，
   只是基准从"某个提交"变成了"磁盘上现在这份"。未提交的文件现在**在**镜像里，404 的担心自动
   消失。要回到"只发已提交的那一版"，两个脚本都用 --ref=<ref>。

   用法：
     node scripts/make-preview-deploy.mjs                 # 用当前工作区（默认）
     node scripts/make-preview-deploy.mjs --ref=dev       # 只用已提交的 dev
     node scripts/make-preview-deploy.mjs --repo=xxx/yyy  # 换镜像仓库
     node scripts/make-preview-deploy.mjs --sha=<sha>     # 手动指定镜像提交（默认自动探测）
*/
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ROOT } from './lib/real-tavern-sources.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = args.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
/* 默认没有 ref —— 从工作区读。给了 --ref 才回到"只用已提交的那一版"。 */
const ref = arg('ref', '');
const mirror = arg('repo', 'tangquanghuy/linjiang-dev');
const mirrorName = mirror.split('/')[1];
const mirrorOwner = mirror.split('/')[0];

const DEPLOY_DIR = '外部部署/V20260826';
const OUT_DIR = join(PROJECT_ROOT, 'artifacts', 'preview');

const git = (argv) => execFileSync('git', argv, {
  cwd: PROJECT_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
});

/* 预览的壳层脚本改走镜像的 **Pages**，不走 jsDelivr。
   ==================================================================
   实测（镜像刚 force push 完，同一时刻、同一个路径）：

       jsDelivr @main                 → 177613 字节，不含刚推上去的改动
       jsDelivr @<完整 sha>           → 187247 字节，正确
       raw.githubusercontent          → 187247 字节，正确（证明仓库内容没问题）
       镜像 Pages /shell/…            → 187247 字节，正确

   jsDelivr 对 @main 这种可变引用除了文件缓存，**另有一层「分支 → 提交」的映射缓存**，
   而镜像每次都是 force push。所以 purge 文件路径救不回来：purge 两次都返回 finished、
   文件也确实从 153684 变成 177613，但映射仍停在上一个提交。表现是最坏的那种 —— 不报错、
   不提示，只是手机上跑的不是你刚写的代码。

   为什么选 Pages 而不是钉 sha：钉 sha 也正确，但 sha 每次发布都变，于是 状态栏-引导壳.html
   和 辅助计算脚本.js 每次都得重新粘一遍 —— 而这两个文件存在的意义恰恰是"粘一次就不用再动"。
   镜像 Pages 的地址是固定的，而且每次 Actions 部署就是最新的，两头都要到了。
   Pages 也正是 HUD_URL 已经在用的通道，没有引入新依赖。

   素材不走这条路，仍然留在 jsDelivr（见下面 RULES 的第三条）：素材大（bg-plate 2MB），
   走 Pages 在国内实测 178~240 秒，那会把一份生产根本不存在的等待掺进测量里。
   而素材的陈旧风险很小 —— reading.<hash>.css / banner-<hash>.webp 这类内容哈希文件一改名字
   就变，jsDelivr 从没缓存过那个新路径，天然免疫；剩下 3 张不带哈希的开局图基本是静态的，
   publish 脚本每次会把它们一起 purge。 */
const SHELL_ON_PAGES = `https://${mirrorOwner}.github.io/${mirrorName}/shell/`;

/* 两条改写规则。刻意只认「仓库名」这一段，不去动 host：
     · Pages 的 host 两边都是 tangquanghuy.github.io，只有项目名不同；
     · jsDelivr 的 host 必须保持 testingcf（cdn.jsdelivr.net 在国内被墙）。
   素材缓存脚本.js 里只有主机白名单、没有仓库名，所以它天然不需要改写 —— 那不是漏掉。 */
const RULES = [
  {
    /* 必须排在下面那条通用 jsDelivr 规则**前面**：两条都能匹配壳层脚本，先到的赢。
       jsDelivr 路径里带 public/，Pages 上没有（vite 把 public/ 摊平成站点根）。 */
    label: '壳层→Pages',
    from: /https:\/\/[a-z]*\.?jsdelivr\.net\/gh\/tangquanghuy\/linjiang-glass@[^/]+\/public\/shell\//g,
    to: SHELL_ON_PAGES,
  },
  {
    label: 'Pages',
    from: /https:\/\/tangquanghuy\.github\.io\/linjiang-glass/g,
    to: `https://${mirrorOwner}.github.io/${mirrorName}`,
  },
  {
    label: 'jsDelivr',
    from: /(https:\/\/[a-z]*\.?jsdelivr\.net\/gh\/)tangquanghuy\/linjiang-glass(@[^/]+\/)/g,
    to: `$1${mirror}$2`,
  },
];

/* core.quotePath=false 是必须的：默认 git 会把非 ASCII 文件名转义成 "\345\260\201..." 并加
   引号，而这个目录里的文件名全是中文，拿去 git show 会一律 path does not exist。 */
const files = (ref
  ? git(['-c', 'core.quotePath=false', 'ls-tree', '--name-only', `${ref}:${DEPLOY_DIR}`])
    .trim().split('\n').map((row) => row.trim()).filter(Boolean)
  : readdirSync(join(PROJECT_ROOT, DEPLOY_DIR)))
  .filter(Boolean);
if (!files.length) {
  console.error(`${ref ? `${ref}:` : ''}${DEPLOY_DIR} 下没有文件 —— ref 或路径不对？`);
  process.exit(1);
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const report = [];
for (const name of files) {
  const path = `${DEPLOY_DIR}/${name}`;
  const local = join(PROJECT_ROOT, path);
  /* 工作区模式直接读磁盘那一份 —— 它就是你会复制粘贴的那一份，逐字节相同，也不需要
     下面的换行还原。ref 模式才要 git show。 */
  const source = ref ? git(['show', `${ref}:${path}`]) : readFileSync(local, 'utf8');
  let out = source;
  const hits = [];
  for (const rule of RULES) {
    const count = (source.match(rule.from) || []).length;
    if (!count) continue;
    out = out.replace(rule.from, rule.to);
    hits.push(`${rule.label}×${count}`);
  }

  /* 换行符要跟工作区那一份一致。
     git show 吐的是仓库里存的 LF，而这批粘贴产物在工作区是 CRLF（build-status-shell.mjs
     刻意的：「两份产物都用 CRLF」）。不还原的话预览文件和用户实际复制的那份逐字节不同 ——
     虽然大概不影响功能，但"被测物和线上物不是同一份"这种事不该主动引入。
     工作区模式下 source 本来就是那一份，没有可还原的差异。 */
  let drift = '';
  if (ref) {
    const localText = existsSync(local) ? readFileSync(local, 'utf8') : '';
    if (localText.includes('\r\n')) out = out.replace(/\r?\n/g, '\r\n');
    /* 工作区跟 ref 不一致时必须说出来：预览用的是 ref 那一份，不是你眼前编辑器里那一份。
       比较前把换行统一掉，否则 CRLF/LF 的差异会让每个文件都误报。 */
    const lf = (text) => text.replace(/\r\n/g, '\n');
    if (localText && lf(localText) !== lf(source)) drift = '  ⚠ 工作区与 ref 不同（预览用的是 ref 那份）';
  }
  writeFileSync(join(OUT_DIR, name), out, 'utf8');

  report.push({ name, hits, drift });
}

const pad = Math.max(...report.map((row) => row.name.length));
for (const row of report) {
  console.log(`  ${row.name.padEnd(pad)}  ${(row.hits.join(' ') || '（无外链需改写）').padEnd(22)}${row.drift}`);
}

console.log('');
console.log(ref
  ? `来源  ${ref} @ ${git(['rev-parse', '--short', ref]).trim()}（只含已提交的内容）`
  : `来源  当前工作区（HEAD ${git(['rev-parse', '--short', 'HEAD']).trim()} + 未提交改动）`);
console.log(`镜像  https://${mirrorOwner}.github.io/${mirrorName}/          HUD 与壳层脚本`);
console.log(`      https://testingcf.jsdelivr.net/gh/${mirror}@main/  素材`);
console.log(`产物  artifacts/preview/  （${report.length} 个文件）`);

/* --verify：把改写后的每个地址都请求一遍。
   ------------------------------------------------------------------
   改写成功不等于目标存在。真正会咬人的是这种：镜像是 dev 的快照，而某个粘贴文件引用的资源
   是工作区里刚生成、还没提交的（实测遇到过 reading.<hash>.css 换了名字），于是预览在一个跟
   被测改动毫无关系的地方 404，而且现场看起来像"新代码坏了"。

   所以生成完就把清单跑一遍。它也顺手覆盖了「jsDelivr 还没抓到新仓库」和「Pages 还没部署完」
   这两种等待状态 —— 那两种也该在粘贴之前就知道，而不是在手机上猜。 */
if (args.includes('--verify')) {
  const pattern = new RegExp(
    `https?://(?:${mirrorOwner}\\.github\\.io/${mirrorName}|[a-z]*\\.?jsdelivr\\.net/gh/${mirror})[^\\s"'\`)\\]]*`,
    'g',
  );
  /* URL → 仓库里的路径。Pages 把 city/ 这些目录按原样拷进 dist，jsDelivr 直接映射仓库路径，
     所以两种形态都能还原出本地路径，用来给「前缀型」地址找一个真实子文件。 */
  const localForUrl = (url) => {
    const pages = url.match(new RegExp(`${mirrorOwner}\\.github\\.io/${mirrorName}/(.*)$`));
    if (pages) return pages[1];
    const cdn = url.match(/jsdelivr\.net\/gh\/[^/]+\/[^/@]+@[^/]+\/(.*)$/);
    if (cdn) return cdn[1];
    return '';
  };

  const seen = new Map();
  for (const row of report) {
    if (!/\.(html|js)$/.test(row.name)) continue;
    const text = readFileSync(join(OUT_DIR, row.name), 'utf8');
    for (const hit of text.match(pattern) || []) {
      /* 去掉查询串再查：?v= 只是缓存旗标，不影响资源是否存在。 */
      let url = hit.replace(/\?.*$/, '');
      /* 以 / 结尾的是**前缀**，不是资源：正文美化里 city/plate/ 后面是运行时按事件类别拼上去
         的文件名。直接 HEAD 一个目录，Pages 一律 404（生产的同一个地址也是 404）—— 那是我的
         检查错了，不是部署坏了。所以从本地那个目录挑一个真实文件去验。 */
      if (url.endsWith('/')) {
        const localPath = localForUrl(url).replace(/\/$/, '');
        if (!localPath) {
          /* 站点根：探 index.html，而不是仓库根下的第一个文件。 */
          url += 'index.html';
        } else {
          /* 样本必须从「真能进镜像的那些文件」里取，不能直接 readdir 磁盘。
             实测踩到：city/plate/* 整个在 .gitignore 里（磁盘上 22 个文件，被跟踪的只有 11 个），
             从磁盘挑到的那张 dongtang_night.png 根本进不了任何部署 —— 生产的同一个地址也是 404。

             两种模式下"能进镜像"的定义不同，取样也要跟着变，否则验的还是别的东西：
               ref 模式  →  ls-tree，就是那个提交里的
               工作区模式 →  ls-files -c -o --exclude-standard，跟 publish 脚本挑文件的口径逐字一致
                             （含未跟踪的新素材，仍然排除被 .gitignore 忽略的） */
          let sample = '';
          try {
            const rows = ref
              ? git(['-c', 'core.quotePath=false', 'ls-tree', '--name-only', `${ref}:${localPath}`])
                .trim().split('\n')
              : git(['ls-files', '-z', '-c', '-o', '--exclude-standard', '--', localPath])
                .split('\0').map((row) => row.slice(localPath.length + 1));
            sample = rows.map((row) => row.trim())
              .find((row) => row && !row.includes('/') && /\.[a-z0-9]+$/i.test(row)) || '';
          } catch (e) { /* 这个路径不存在 —— 下面 continue 跳过 */ }
          if (!sample) continue;
          url += sample;
        }
      }
      if (!seen.has(url)) seen.set(url, row.name);
    }
  }
  console.log('');
  console.log(`--- 自检 ${seen.size} 个改写后的地址 ---`);
  let bad = 0;
  for (const [url, owner] of seen) {
    let status = 'ERR';
    try {
      const response = await fetch(url, { method: 'GET', headers: { range: 'bytes=0-0' } });
      status = String(response.status);
      if (!response.ok && response.status !== 206) bad += 1;
    } catch (error) {
      bad += 1;
      status = error?.cause?.code || 'ERR';
    }
    console.log(`  ${status.padStart(4)}  ${owner.padEnd(pad)}  ${url.replace('https://', '')}`);
  }
  console.log(bad === 0
    ? '  全部可达。'
    : `  有 ${bad} 个取不到 —— 粘贴之前先解决，否则会在无关的地方翻车。`);
  if (bad) process.exitCode = 1;
}

/* 刻意不叫 README.md：外部部署目录里本来就有一份 README.md（生产的部署清单），它会被上面的
   循环复制过来。同名会把它**静默覆盖**掉 —— 而那份 README 恰好是最该带在预览包里的参考。 */
writeFileSync(join(OUT_DIR, '说明-预览包.md'), `# 预览用的外部部署文件

**这些是测试用的副本，不要粘到正式角色卡上。**

由 \`node scripts/make-preview-deploy.mjs\` 从 ${ref ? `\`${ref}\`` : '**当前工作区**'} 生成
（与测试镜像仓库同源），里面所有指向生产的外链都已改写到镜像：

| | 生产 | 预览 |
|---|---|---|
| Pages（HUD） | \`tangquanghuy.github.io/linjiang-glass\` | \`${mirrorOwner}.github.io/${mirrorName}\` |
| 壳层脚本 | \`jsDelivr …@main/public/shell/\` | \`${mirrorOwner}.github.io/${mirrorName}/shell/\` |
| 素材 | \`gh/tangquanghuy/linjiang-glass@main\` | \`gh/${mirror}@main\` |

壳层脚本（\`status-shell.js\` / \`aux-shell.js\`）从 jsDelivr 换成了镜像的 **Pages**：镜像每次
force push，而 jsDelivr 对可变引用还有一层「分支 → 提交」映射缓存，purge 文件路径救不回来 ——
实测表现是不报错、不提示，只是手机上跑的不是你刚写的代码。Pages 地址固定、每次部署即最新，
所以这两个文件仍然**粘一次就行**。

素材留在 jsDelivr：它们大（bg-plate 2MB），走 Pages 在国内要 178~240 秒。带内容哈希的
（\`reading.<hash>.css\` 等）改名即换路径，天然不会陈旧；剩下几张开局图每次发布会被 purge。

\`素材缓存脚本.js\` 里只有主机白名单、没有仓库名，所以它无需改写 —— 两个环境的主机是同一批。

## 怎么用

粘进一张**测试角色卡**（别用你线上那张），对应关系跟生产一样：

| 文件 | 粘到哪 |
|---|---|
| \`状态栏-测试版-流内嵌入.html\` | 角色卡「状态栏」（当前基准版） |
| \`正文美化.html\` / \`正文美化-外链素材版.html\` | 正文美化的正则模板 |
| \`开局.html\` | 开局消息 |
| \`辅助计算脚本.js\` / \`格式修复脚本.js\` / \`素材缓存脚本.js\` / \`小手机脚本.js\` | 酒馆助手脚本库 |
| \`封面.html\` | 封面 |

## 怎么确认跑的是预览版

状态栏 → 全局设置 → 拉到底那行小字：\`HUD <构建号> / 壳层 <版本> / 原生流|抬升\`。
移动端应该是「原生流」。

## 更新

改完代码**不用提交**，直接：

    node scripts/publish-hud-preview.mjs      # 把当前工作区推到镜像，Actions 自动部署
    node scripts/make-preview-deploy.mjs      # 重新生成这个目录（顺便钉上新的 sha）

两个脚本默认都快照工作区，所以磁盘上是什么、镜像里就是什么。要只发已提交的那一版，
两边都加 \`--ref=dev\`。

HUD 和壳层脚本这两半都是自动的（都从镜像 Pages 取，地址固定），只有这些粘贴文件本身变了才
需要重新粘。注意自包含的 \`状态栏.html\` / \`状态栏-测试版-流内嵌入.html\` 是把壳层**内联**进去的，
壳层一改就必须重新粘 —— 想省这一步就用 \`状态栏-引导壳.html\`。
`, 'utf8');
