/* 把三份真实源码搬到本地可 fetch 的位置。
   ------------------------------------------------------------------
   tools/tavern-live-fixture.* 要在浏览器里跑真实的 SillyTavern 样式、真实的酒馆助手
   iframe 注入脚本、真实的 TauriTavern 移动端 compat 模块。三者都在仓库外面，vite 的
   dev server 默认不服务项目根之外的路径，所以每次跑测试前把需要的文件拷进
   artifacts/real-tavern/（已在 .gitignore 里），再由夹具用相对 URL 取。

   为什么是拷贝而不是 vendor 进仓库：这三个东西会各自升级，vendor 一份就会悄悄过期，
   而夹具"看起来还在测真实环境"是最坏的情况。拷贝 + 版本断言意味着源码一变，测试要么
   跟着变，要么当场报错。

   路径可以用环境变量覆盖：
     LINJIANG_ST_ROOT   SillyTavern 根目录（含 public/ 和 package.json）
     LINJIANG_TT_ROOT   TauriTavern 根目录（含 src/tauri/）
     LINJIANG_JSR_ROOT  酒馆助手根目录，默认在 ST 的 third-party 下

   缺文件就抛错，不做降级：夹具的全部价值在于它是真的。
*/
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(here, '../..');
export const STAGE_DIR = join(PROJECT_ROOT, 'artifacts', 'real-tavern');
/** 夹具从这个 URL 前缀取真实源码；vite 的 root 就是项目根。 */
export const STAGE_URL = '/artifacts/real-tavern';

const DEFAULT_ST_ROOT = 'D:\\Soft\\tavernLatest\\SillyTavern-release';
const DEFAULT_TT_ROOT = 'D:\\Code\\TauriTavern-main';

/* 期望的版本。跟 tools/tavern-real-contract.js 里的常量是同一件事，只是那边是给
   旧夹具用的手写近似，这边是对真实源码的断言。 */
export const EXPECT = {
  st: '1.18.0',
  jsr: '4.9.3',
};

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function requireDir(path, what) {
  if (!existsSync(path)) {
    throw new Error(
      `找不到${what}：${path}\n`
      + '用环境变量覆盖路径：LINJIANG_ST_ROOT / LINJIANG_TT_ROOT / LINJIANG_JSR_ROOT',
    );
  }
  return path;
}

function requireFile(path, what) {
  if (!existsSync(path)) throw new Error(`找不到${what}：${path}`);
  return path;
}

export function resolveRoots() {
  const stRoot = requireDir(process.env.LINJIANG_ST_ROOT || DEFAULT_ST_ROOT, 'SillyTavern 根目录');
  const ttRoot = requireDir(process.env.LINJIANG_TT_ROOT || DEFAULT_TT_ROOT, 'TauriTavern 根目录');
  const jsrRoot = requireDir(
    process.env.LINJIANG_JSR_ROOT
      || join(stRoot, 'public', 'scripts', 'extensions', 'third-party', 'JS-Slash-Runner'),
    '酒馆助手（JS-Slash-Runner）目录',
  );
  return { stRoot, ttRoot, jsrRoot };
}

/* 契约标记。真实源码里必须仍然存在这些片段，否则夹具复刻的那部分已经和上游脱节了，
   应该当场失败而不是继续跑一个过期的模拟。 */
const CONTRACT_MARKERS = [
  {
    file: 'jsr/panel-render-iframe.ts',
    label: '酒馆助手 createSrcContent 的 srcdoc 骨架',
    needles: [
      'html,body{margin:0!important;padding:0;overflow:hidden!important;max-width:100%!important;}',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      'adjust_iframe_height_url',
      'adjust_viewport_url',
    ],
  },
  {
    file: 'jsr/panel-render-Iframe.vue',
    label: '酒馆助手渲染 iframe 的属性与高度同步',
    needles: ['loading="lazy"', 'class="w-full"', 'frameborder="0"', 'TH_UPDATE_VIEWPORT_HEIGHT', 'TH-message--'],
  },
  {
    file: 'jsr/adjust_iframe_height.js',
    label: '酒馆助手的 iframe 高度同步实现',
    needles: ['body.scrollHeight', 'frameElement.style.height', 'ResizeObserver'],
  },
  {
    file: 'tt/mobile-overlay-surface-admission.js',
    label: 'TauriTavern 移动端浮层准入契约',
    needles: [
      "SURFACE_ATTR = 'data-tt-mobile-surface'",
      "HOST_ADMITTED_ATTR = 'data-tt-mobile-surface-admitted'",
      "ORIGINAL_TOP_VAR = '--tt-original-top'",
    ],
  },
  {
    file: 'tt/mobile-overlay-compat-controller.js',
    label: 'TauriTavern 准入的 declared-surface 退出分支',
    /* 状态栏壳层就是靠这一条退出的：预先声明 data-tt-mobile-surface="none"，
       且不带 admitted 标记。这个分支要是没了，退出方式就失效了。 */
    needles: ['if (declaredSurface && !isHostAdmittedSurface(element))'],
  },
  {
    file: 'tt/mobile-geometry-firewall.js',
    label: 'TauriTavern 会改写 edge-window 的 top',
    needles: ['data-tt-mobile-surface="edge-window"', 'var(--tt-original-top, 0px)'],
  },
  {
    file: 'st/style.css',
    label: 'SillyTavern 的阅读区就是 #chat，并且自带 backdrop-filter',
    needles: ['backdrop-filter: blur(var(--SmartThemeBlurStrength))', '--SmartThemeBlurStrength: calc(var(--blurStrength) * 1px)'],
  },
  {
    file: 'st/css/toggle-dependent.css',
    label: 'SillyTavern 的 fast_ui_mode 实现',
    needles: ['body.no-blur *'],
  },
  {
    file: 'jsr/index.css',
    label: '酒馆助手用来折叠已渲染代码块的 hidden! 类',
    /* tailwind 里 `hidden!` 会被转义成 .hidden\! —— 没有它，<pre><code> 会把整份源码
       当可见文本渲染，一条楼层高到四十万像素。 */
    needles: ['hidden\\!'],
  },
];

/**
 * 把真实源码拷到 artifacts/real-tavern/，校验版本与契约标记，返回元信息。
 * @param {{ quiet?: boolean }} [options]
 */
export function stageRealSources({ quiet = false } = {}) {
  const { stRoot, ttRoot, jsrRoot } = resolveRoots();

  const stVersion = String(readJson(join(stRoot, 'package.json')).version || '');
  const jsrPkg = readJson(join(jsrRoot, 'package.json'));
  const jsrVersion = String(jsrPkg.version || '');
  const jsrManifest = readJson(join(jsrRoot, 'manifest.json'));
  const ttVersion = String(readJson(join(ttRoot, 'package.json')).version || '');

  if (stVersion !== EXPECT.st) {
    throw new Error(
      `SillyTavern 版本变了：期望 ${EXPECT.st}，实际 ${stVersion}。\n`
      + '夹具是照某个版本的 DOM/CSS 复刻的，请先核对 tools/tavern-live-fixture.js 再更新 EXPECT。',
    );
  }
  if (jsrVersion !== EXPECT.jsr) {
    throw new Error(
      `酒馆助手版本变了：期望 ${EXPECT.jsr}，实际 ${jsrVersion}。\n`
      + '注入方式（createSrcContent / adjust_iframe_height）可能已变，请先核对再更新 EXPECT。',
    );
  }

  rmSync(STAGE_DIR, { recursive: true, force: true });
  mkdirSync(join(STAGE_DIR, 'st', 'css'), { recursive: true });
  mkdirSync(join(STAGE_DIR, 'st', 'themes'), { recursive: true });
  mkdirSync(join(STAGE_DIR, 'st', 'lib'), { recursive: true });
  mkdirSync(join(STAGE_DIR, 'jsr', 'lib'), { recursive: true });
  mkdirSync(join(STAGE_DIR, 'tt'), { recursive: true });

  const copy = (from, to, what) => {
    cpSync(requireFile(from, what), join(STAGE_DIR, to));
  };

  /* SillyTavern：真实的 index.html（夹具用 DOMParser 从里面取 #sheld / #message_template
     等真节点）、真实的 style.css 与整个 css/ 目录、以及内置主题。 */
  copy(join(stRoot, 'public', 'index.html'), 'st/index.html', 'SillyTavern index.html');
  copy(join(stRoot, 'public', 'style.css'), 'st/style.css', 'SillyTavern style.css');
  cpSync(requireDir(join(stRoot, 'public', 'css'), 'SillyTavern public/css'), join(STAGE_DIR, 'st', 'css'), { recursive: true });
  for (const theme of ['Dark Lite.json', 'Dark V 1.0.json']) {
    copy(join(stRoot, 'default', 'content', 'themes', theme), `st/themes/${theme}`, `SillyTavern 主题 ${theme}`);
  }
  /* 渲染 iframe 里要跑真实的 adjust_iframe_height.js，而它开头就用 `_.throttle` 且靠
     `$(() => ...)` 启动 —— 真实环境是 predefine.js 把 parent 的 lodash/jQuery 注入进去的。
     jQuery 用 ST 自己带的那一份（版本一致）；lodash 用本项目 node_modules 里的同版本，
     ST 把它打进了 bundle，没有单独的文件可拷。 */
  copy(join(stRoot, 'public', 'lib', 'jquery-3.5.1.min.js'), 'st/lib/jquery.min.js', 'SillyTavern 自带 jQuery');
  copy(join(PROJECT_ROOT, 'node_modules', 'lodash', 'lodash.min.js'), 'st/lib/lodash.min.js', 'lodash（本项目 devDependency，与 ST 同为 4.17.x）');

  /* 酒馆助手：注入到每个渲染 iframe 里的两个脚本按原文使用；两个源文件只用于契约断言。 */
  copy(join(jsrRoot, 'src', 'iframe', 'adjust_iframe_height.js'), 'jsr/adjust_iframe_height.js', '酒馆助手 adjust_iframe_height.js');
  copy(join(jsrRoot, 'src', 'iframe', 'adjust_viewport.js'), 'jsr/adjust_viewport.js', '酒馆助手 adjust_viewport.js');
  copy(join(jsrRoot, 'src', 'panel', 'render', 'iframe.ts'), 'jsr/panel-render-iframe.ts', '酒馆助手 createSrcContent');
  copy(join(jsrRoot, 'src', 'panel', 'render', 'Iframe.vue'), 'jsr/panel-render-Iframe.vue', '酒馆助手 Iframe.vue');
  copy(join(jsrRoot, 'src', 'iframe', 'third_party_message.html'), 'jsr/third_party_message.html', '酒馆助手注入的第三方依赖清单');
  /* 酒馆助手自己的样式表（manifest.json 的 "css" 字段）。少了它，被渲染的代码块上那个
     `hidden!` 类不生效，于是 <pre><code> 会把整份源码当可见文本铺出来 —— 一条 .mes 能高到
     四十万像素，任何按体积做的对比都会被它污染。踩过这个坑，所以现在必须加载它。 */
  copy(join(jsrRoot, 'dist', 'index.css'), 'jsr/index.css', '酒馆助手样式表 dist/index.css');
  /* third_party_message.html 里唯一的本地依赖。其余（fontawesome / jquery / jquery-ui /
     vue / vue-router / log.js）全是 jsdelivr，离线跑不到，夹具会跳过并记录。 */
  copy(join(jsrRoot, 'lib', 'tailwindcss.min.js'), 'jsr/lib/tailwindcss.min.js', '酒馆助手自带的 tailwind 浏览器版');

  /* TauriTavern：三个 compat 模块都是零依赖 ES module，夹具直接 import 并调用，
     所以移动端的准入与几何改写是真的在跑，不是复刻的。 */
  const ttCompat = join(ttRoot, 'src', 'tauri', 'main', 'compat', 'mobile');
  for (const name of [
    'mobile-overlay-surface-admission.js',
    'mobile-overlay-compat-controller.js',
    'mobile-geometry-firewall.js',
  ]) {
    copy(join(ttCompat, name), `tt/${name}`, `TauriTavern ${name}`);
  }
  copy(join(ttRoot, 'src', 'css', 'mobile-styles.css'), 'tt/mobile-styles.css', 'TauriTavern mobile-styles.css');

  const contractFailures = [];
  for (const { file, label, needles } of CONTRACT_MARKERS) {
    const text = readFileSync(join(STAGE_DIR, file), 'utf8');
    for (const needle of needles) {
      if (!text.includes(needle)) contractFailures.push(`${label}（${file}）缺少片段：${needle}`);
    }
  }
  if (contractFailures.length) {
    throw new Error('真实源码的契约标记对不上，夹具已与上游脱节：\n  - ' + contractFailures.join('\n  - '));
  }

  const meta = {
    stagedAt: new Date().toISOString(),
    roots: { stRoot, ttRoot, jsrRoot },
    versions: { sillytavern: stVersion, tavernHelper: jsrVersion, tauritavern: ttVersion },
    tavernHelperManifest: { display_name: jsrManifest.display_name, version: jsrManifest.version, hooks: jsrManifest.hooks },
  };
  writeFileSync(join(STAGE_DIR, 'meta.json'), JSON.stringify(meta, null, 2));
  if (!quiet) {
    console.log(`真实源码已就位  ST ${stVersion} · 酒馆助手 ${jsrVersion} · TauriTavern ${ttVersion}`);
  }
  return meta;
}
