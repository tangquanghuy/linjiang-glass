/* 把当前 dev 分支推到测试镜像仓库（linjiang-dev），让它的 Pages 重新构建。
   ==================================================================
   为什么要单独一个仓库
   ------------------------------------------------------------------
   状态栏是两半各自部署的：壳层是复制粘贴的（跟 git 无关，粘下去立刻生效），HUD 是构建产物、
   只能通过 GitHub Pages 到用户手上。而一个仓库只有一个 Pages 站点，生产那个绑在本仓库的
   main 上。于是想在真机 / 模拟器上验 HUD 侧的改动，以前只有两条路：合并到 main（等于对所有
   玩家上线），或者把 HUD 指到本机（要同网段，反复用很别扭）。

   镜像仓库是第三条路：它的 Pages 地址就是一个稳定的公网 HUD 地址，粘一次壳层就能一直用来验，
   而生产的 Pages 与 jsDelivr 一个字节都不受影响。

   为什么是快照而不是加个 remote 推历史
   ------------------------------------------------------------------
   本仓库的 .git 有 775MB（大量图片产物进过历史）。镜像只需要「现在这份代码」，不需要历史，
   所以取一份工作树（33MB）重新起一个单提交仓库，每次 force push 覆盖。
   镜像仓库的历史因此永远只有一两个提交 —— 它是产物，不是源头。

   为什么默认快照**工作区**，而不是某个 git 提交
   ------------------------------------------------------------------
   这一条改过一次，值得记住原因。原来默认 `git archive dev`，也就是只有**已提交**的代码才进
   镜像。理由当时是"镜像与预览文件同源，避免 404 在无关的地方"。

   但它和这个仓库存在的唯一目的相反：镜像是用来**验证还没上线的改动**的，而正在改的东西
   通常还没提交。实际后果是安静地验错东西 —— 改完 reading 配色发上去，手机上跑的还是上一版，
   因为新的 reading.<hash>.css 还没 commit，镜像里根本没有它；而粘贴文件从 git 读，指的还是
   旧那份 hash，所以连 404 都不报，就是"改了没效果"。

   现在默认快照工作区：`git ls-files -c -o --exclude-standard` 取「已跟踪 + 未跟踪但不被
   .gitignore 忽略」的全部文件。于是磁盘上是什么，镜像里就是什么，未提交的改动一并带上。
   404 那个担心反过来自动消失了 —— 未提交的文件现在**在**镜像里。

   .gitignore 仍然被尊重，所以 node_modules / dist / artifacts 不会进去。
   要回到"只发已提交的那一版"，用 --ref=<ref>。

   用法：
     node scripts/publish-hud-preview.mjs              # 推当前工作区（默认，含未提交改动）
     node scripts/publish-hud-preview.mjs --ref=dev    # 只推已提交的 dev
     node scripts/publish-hud-preview.mjs --dry        # 只准备本地快照，不推
*/
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { PROJECT_ROOT } from './lib/real-tavern-sources.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = args.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
/* 默认没有 ref —— 快照工作区。给了 --ref 才回到"只发已提交的那一版"。 */
const ref = arg('ref', '');
const dry = args.includes('--dry');

export const PREVIEW_REMOTE = 'git@github.com:tangquanghuy/linjiang-dev.git';
export const PREVIEW_PAGES = 'https://tangquanghuy.github.io/linjiang-dev/';
/* 每次用临时目录里的唯一路径，跑完就删。
   原来固定用仓库旁边的 ../_linjiang-dev，结果第二次发布就撞上 EPERM —— 只要有个终端的 cwd
   还在里面、或者编辑器打开过里面的文件，rmSync 就删不掉，而这个脚本的第一步正是"清空重建"。
   换成唯一临时目录之后这一整类问题都不存在了，也不会在仓库旁边留下一个看起来像源码的目录。 */
const STAGE = join(tmpdir(), `linjiang-preview-${process.pid}-${Date.now()}`);

const run = (cmd, argv, cwd = PROJECT_ROOT) =>
  execFileSync(cmd, argv, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const headSha = run('git', ['rev-parse', '--short', 'HEAD']);
const sha = ref ? run('git', ['rev-parse', '--short', ref]) : headSha;

/* 每次重建：镜像是产物，不该积累状态。 */
mkdirSync(STAGE, { recursive: true });

if (ref) {
  console.log(`快照来源：${ref} @ ${sha}（只含已提交的内容）`);
  const tar = join(tmpdir(), `linjiang-${sha}.tar`);
  run('git', ['archive', ref, '--format=tar', '-o', tar]);
  run('tar', ['-xf', tar, '-C', STAGE]);
  rmSync(tar, { force: true });
} else {
  /* -z 让 git 用 NUL 分隔并且**不转义**文件名。这个仓库里全是中文路径，默认输出会变成
     "\345\260\201..." 带引号的形式，逐个反转义既麻烦又容易错。
       -c  已跟踪
       -o  未跟踪
       --exclude-standard  仍然尊重 .gitignore（所以 node_modules / dist / artifacts 不进来） */
  const listed = run('git', ['ls-files', '-z', '-c', '-o', '--exclude-standard'])
    .split('\0').map((row) => row.trim()).filter(Boolean);
  /* 已跟踪但在工作区被删掉的文件，ls-files -c 仍会列出来 —— 跳过，否则复制会抛 ENOENT。
     这正是 reading.bab922d8.css 那种"换了 hash"的情形：旧的已删、新的未跟踪，两边都要处理对。 */
  let copied = 0;
  let missing = 0;
  for (const rel of listed) {
    const from = join(PROJECT_ROOT, rel);
    if (!existsSync(from)) { missing += 1; continue; }
    const to = join(STAGE, rel);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    copied += 1;
  }
  const dirty = run('git', ['status', '--porcelain']).split('\n').filter(Boolean).length;
  console.log(`快照来源：当前工作区（HEAD ${headSha} + ${dirty} 项未提交改动）`);
  console.log(`          ${copied} 个文件${missing ? `，跳过 ${missing} 个已删除的` : ''}`);
}

/* 工作流和 README 只住在镜像里 —— 它们描述的是「镜像怎么用」，不属于源仓库。
   从本仓库的模板目录取，这样它们仍然受版本控制、不会靠记忆维护。 */
const TEMPLATE_DIR = join(PROJECT_ROOT, 'scripts', 'preview-mirror');
for (const name of ['.github/workflows/pages.yml', 'README.md']) {
  const from = join(TEMPLATE_DIR, name.replace(/\//g, '\\'));
  if (!existsSync(from)) {
    console.error(`缺少镜像模板 ${name}（应在 scripts/preview-mirror/ 下）`);
    process.exit(1);
  }
  const to = join(STAGE, name);
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, readFileSync(from, 'utf8'), 'utf8');
}

const origin = ref ? `${ref} @ ${sha}` : `工作区（HEAD ${sha}）`;
run('git', ['init', '-q', '-b', 'main'], STAGE);
run('git', ['add', '-A'], STAGE);
run('git', [
  '-c', 'user.name=linjiang-preview', '-c', 'user.email=preview@local',
  'commit', '-q', '-m', `chore: linjiang-glass 快照（${origin}）\n\n测试镜像，只为真机验证 HUD 侧改动而存在。历史每次被覆盖 —— 它是产物，不是源头。`,
], STAGE);

/* 镜像那一侧的提交 sha。预览的 jsDelivr 外链要**钉在它上面**，不能用 @main —— 理由见下面
   purge 那段。所以这个值必须能传给 make-preview-deploy.mjs。 */
const mirrorSha = run('git', ['rev-parse', 'HEAD'], STAGE);

if (dry) {
  console.log(`已准备本地快照：${STAGE}（--dry，未推送，用完请自行删除）`);
  console.log(`镜像提交 sha：${mirrorSha}`);
  process.exit(0);
}

run('git', ['remote', 'add', 'origin', PREVIEW_REMOTE], STAGE);
console.log(run('git', ['push', '-q', '--force', 'origin', 'main'], STAGE) || '已推送');
console.log(`镜像提交：${mirrorSha}`);

/* purge jsDelivr 的 @main。
   ==================================================================
   实测记录，值得留着：镜像每次都是 force push，而 jsDelivr 对 @main 这种可变引用
   **除了文件缓存还另有一层「分支 → 提交」的映射缓存**。所以光 purge 文件路径救不回来：

       @main                 → 177613 字节，不含刚推上去的改动
       @<完整 sha>           → 187247 字节，正确
       raw.githubusercontent → 187247 字节，正确（证明仓库内容本身是对的）
       镜像 Pages /shell/…   → 187247 字节，正确

   purge 两次都返回 finished，文件也确实从 153684 变成了 177613 —— 也就是 purge 生效了，
   但映射仍停在上一个提交。表现是最坏的那种：不报错、不提示，只是手机上跑的不是你刚写的代码。

   结论落在 make-preview-deploy.mjs：预览的**壳层脚本改走镜像 Pages**（地址固定、每次部署即
   最新），不再依赖 jsDelivr 和这里的 purge。

   这里仍然 purge，为两件事：
     · 照顾之前已经粘过 @main 版本的角色卡；
     · 素材仍然走 jsDelivr。带内容哈希的（reading.<hash>.css / banner-<hash>.webp）改名即换
       路径、天然不会陈旧，所以只需要列**不带哈希**的那几个 —— 它们才是会被同一路径覆盖的。
   不整目录 purge（jsDelivr 按路径限流）。 */
const PURGE = [
  'public/shell/status-shell.js',
  'public/shell/aux-shell.js',
  'public/assets/opening-strip.webp',
  'public/assets/opening-background.png',
  'public/assets/mark-sakura.png',
];
for (const path of PURGE) {
  const url = `https://purge.jsdelivr.net/gh/${PREVIEW_REMOTE.replace(/^.*:/, '').replace(/\.git$/, '')}@main/${path}`;
  try {
    const response = await fetch(url);
    const body = await response.json().catch(() => ({}));
    console.log(`  purge ${path} → ${body.status || response.status}`);
  } catch (error) {
    /* purge 失败不该挡住发布：真正要紧的是内容，而边缘缓存最多 12 小时自己过期。 */
    console.log(`  purge ${path} → 失败（${error.message}），最多 12 小时后自然过期`);
  }
}

/* 收尾删掉临时快照。删不掉也不算失败：推送已经成功了，留一个临时目录不影响任何事。 */
try { rmSync(STAGE, { recursive: true, force: true }); } catch (e) { /* 下次开机 temp 会清 */ }

console.log('');
console.log(`镜像仓库已更新。Actions 会自动构建并部署到：\n  ${PREVIEW_PAGES}`);
console.log('');
console.log('首次使用需要在镜像仓库做一次设置：');
console.log('  Settings → Pages → Source 选 “GitHub Actions”');
console.log('');
console.log('然后生成整套指向它的外部部署文件：');
console.log('  node scripts/make-preview-deploy.mjs --verify');
