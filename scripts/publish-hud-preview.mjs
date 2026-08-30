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
   所以用 git archive 取一份 tracked 树（33MB）重新起一个单提交仓库，每次 force push 覆盖。
   镜像仓库的历史因此永远只有一两个提交 —— 它是产物，不是源头。

   用法：
     node scripts/publish-hud-preview.mjs              # 推 dev
     node scripts/publish-hud-preview.mjs --ref=HEAD   # 推别的 ref
     node scripts/publish-hud-preview.mjs --dry        # 只准备本地快照，不推
*/
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { PROJECT_ROOT } from './lib/real-tavern-sources.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = args.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const ref = arg('ref', 'dev');
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

const sha = run('git', ['rev-parse', '--short', ref]);
console.log(`快照来源：${ref} @ ${sha}`);

/* 每次重建：镜像是产物，不该积累状态。 */
mkdirSync(STAGE, { recursive: true });
const tar = join(tmpdir(), `linjiang-${sha}.tar`);
run('git', ['archive', ref, '--format=tar', '-o', tar]);
run('tar', ['-xf', tar, '-C', STAGE]);
rmSync(tar, { force: true });

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

run('git', ['init', '-q', '-b', 'main'], STAGE);
run('git', ['add', '-A'], STAGE);
run('git', [
  '-c', 'user.name=linjiang-preview', '-c', 'user.email=preview@local',
  'commit', '-q', '-m', `chore: linjiang-glass ${ref} 快照（${sha}）\n\n测试镜像，只为真机验证 HUD 侧改动而存在。历史每次被覆盖 —— 它是产物，不是源头。`,
], STAGE);

if (dry) {
  console.log(`已准备本地快照：${STAGE}（--dry，未推送，用完请自行删除）`);
  process.exit(0);
}

run('git', ['remote', 'add', 'origin', PREVIEW_REMOTE], STAGE);
console.log(run('git', ['push', '-q', '--force', 'origin', 'main'], STAGE) || '已推送');

/* purge jsDelivr。
   ------------------------------------------------------------------
   镜像每次都是 force push 一个新提交，而 @main 这种可变引用在 jsDelivr 有 12 小时边缘缓存。
   不 purge 的话，那几个**直接从 jsDelivr 取**的粘贴文件（引导壳取 status-shell.js、辅助计算
   脚本取 aux-shell.js）会继续吃旧版 —— 而且毫无迹象：不报错、不提示，只是行为对不上代码。
   生产的 pages.yml 里有同样一步，理由也写在那儿。

   只 purge 真的被引用的那几个路径，不整目录 purge（jsDelivr 按路径限流）。素材不在列：
   它们仍然指向 linjiang-glass@main，不受这次推送影响。 */
const PURGE = [
  'public/shell/status-shell.js',
  'public/shell/aux-shell.js',
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
