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

   为什么从 git 读而不是从工作区读
   ------------------------------------------------------------------
   镜像仓库是 `dev` 的快照。如果预览文件从工作区生成，而工作区里有别人正在改的东西（实测就
   遇到过：正文美化-外链素材版.html 已经指向 reading.0697f41a.css，而那个文件还没提交，镜像里
   根本没有），预览就会 404 在一个跟被测改动毫无关系的地方。

   所以一律 `git show <ref>:<path>`，跟镜像同源。工作区与 ref 不一致时会明确警告，而不是悄悄
   用了另一份。

   用法：
     node scripts/make-preview-deploy.mjs                 # 用 dev
     node scripts/make-preview-deploy.mjs --ref=HEAD
     node scripts/make-preview-deploy.mjs --repo=xxx/yyy   # 换镜像仓库
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
const ref = arg('ref', 'dev');
const mirror = arg('repo', 'tangquanghuy/linjiang-dev');
const mirrorName = mirror.split('/')[1];
const mirrorOwner = mirror.split('/')[0];

const DEPLOY_DIR = '外部部署/V20260826';
const OUT_DIR = join(PROJECT_ROOT, 'artifacts', 'preview');

const git = (argv) => execFileSync('git', argv, {
  cwd: PROJECT_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
});

/* 两条改写规则。刻意只认「仓库名」这一段，不去动 host：
     · Pages 的 host 两边都是 tangquanghuy.github.io，只有项目名不同；
     · jsDelivr 的 host 必须保持 testingcf（cdn.jsdelivr.net 在国内被墙）。
   素材缓存脚本.js 里只有主机白名单、没有仓库名，所以它天然不需要改写 —— 那不是漏掉。 */
const RULES = [
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
const files = git(['-c', 'core.quotePath=false', 'ls-tree', '--name-only', `${ref}:${DEPLOY_DIR}`])
  .trim().split('\n').map((row) => row.trim()).filter(Boolean);
if (!files.length) {
  console.error(`${ref}:${DEPLOY_DIR} 下没有文件 —— ref 或路径不对？`);
  process.exit(1);
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const report = [];
for (const name of files) {
  const path = `${DEPLOY_DIR}/${name}`;
  const source = git(['show', `${ref}:${path}`]);
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
     虽然大概不影响功能，但"被测物和线上物不是同一份"这种事不该主动引入。 */
  const local = join(PROJECT_ROOT, path);
  const localText = existsSync(local) ? readFileSync(local, 'utf8') : '';
  const localIsCrlf = localText.includes('\r\n');
  if (localIsCrlf) out = out.replace(/\r?\n/g, '\r\n');
  writeFileSync(join(OUT_DIR, name), out, 'utf8');

  /* 工作区跟 ref 不一致时必须说出来：预览用的是 ref 那一份，不是你眼前编辑器里那一份。
     比较前把换行统一掉，否则 CRLF/LF 的差异会让每个文件都误报。 */
  const lf = (text) => text.replace(/\r\n/g, '\n');
  let drift = '';
  if (localText && lf(localText) !== lf(source)) drift = '  ⚠ 工作区与 ref 不同（预览用的是 ref 那份）';

  report.push({ name, hits, drift });
}

const pad = Math.max(...report.map((row) => row.name.length));
for (const row of report) {
  console.log(`  ${row.name.padEnd(pad)}  ${(row.hits.join(' ') || '（无外链需改写）').padEnd(22)}${row.drift}`);
}

console.log('');
console.log(`来源  ${ref} @ ${git(['rev-parse', '--short', ref]).trim()}（与镜像仓库同源）`);
console.log(`镜像  https://${mirrorOwner}.github.io/${mirrorName}/`);
console.log(`      https://testingcf.jsdelivr.net/gh/${mirror}@main/`);
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
          /* 样本必须从 **git** 里取，不能从磁盘取。
             实测踩到：city/plate/* 整个在 .gitignore 里（只有 11 个文件被跟踪，磁盘上有 22 个），
             从磁盘挑到的那张 dongtang_night.png 根本进不了任何部署 —— 生产的同一个地址也是
             404。用 ls-tree 取样，验的才是「真能部署出去的那些」。 */
          let sample = '';
          try {
            sample = git(['-c', 'core.quotePath=false', 'ls-tree', '--name-only', `${ref}:${localPath}`])
              .trim().split('\n').map((row) => row.trim())
              .find((row) => row && /\.[a-z0-9]+$/i.test(row)) || '';
          } catch (e) { /* 这个路径在 ref 里不存在 —— 下面 continue 跳过 */ }
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

由 \`node scripts/make-preview-deploy.mjs\` 从 \`${ref}\` 生成（与测试镜像仓库同源），
里面所有指向生产的外链都已改写到镜像：

| | 生产 | 预览 |
|---|---|---|
| Pages | \`tangquanghuy.github.io/linjiang-glass\` | \`${mirrorOwner}.github.io/${mirrorName}\` |
| jsDelivr | \`gh/tangquanghuy/linjiang-glass@main\` | \`gh/${mirror}@main\` |

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

改完代码推 \`${ref}\`，然后：

    node scripts/publish-hud-preview.mjs      # 把快照推到镜像，Actions 自动部署
    node scripts/make-preview-deploy.mjs      # 重新生成这个目录

HUD 那一半是自动的；只有这些粘贴文件本身变了才需要重新粘。
`, 'utf8');
