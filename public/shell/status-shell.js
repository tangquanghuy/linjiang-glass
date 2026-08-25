/* 状态栏壳层的全部逻辑。
   ==================================================================
   这份文件是**源**，两份 HTML 包装都由 scripts/build-status-shell.mjs 从它生成：

     外部部署/状态栏-引导壳.html   约 50 行，粘一次就不用再动。它只负责用 <script src>
                                   把本文件从 GitHub Pages 取下来执行。
     外部部署/状态栏.html          自包含版，把本文件内联回去。给已经装了旧版的用户继续粘。

   为什么要拆
   ------------------------------------------------------------------
   壳层是粘贴部署的（塞进角色卡），HUD 产物是 Pages 自动部署的。两者是同一个 RPC 契约的
   两端，却有完全不同的更新节奏：推一次 main，HUD 几秒后对所有玩家生效；壳层冻结在每个人
   安装的那一天。结果就是玩家手里握着一份越来越旧的权威代码，而依赖它的那一半在脚下持续更新。

   已经吃过一次亏：城市规划蓝图的建设费扣款只在壳层里（见下面的 saveCustomMapNode），
   HUD 侧的价钱显示和按钮禁用却随 Pages 上线了。旧壳层照样建节点、就是不扣钱，而 HUD 无从
   分辨「扣了」和「没扣」—— 于是变成静默的免费建设，不是报错。

   握手加版本号解决不了这件事：玩家不会因为看到「请更新状态栏」就去重新粘 118KB 代码，你也
   没法强制他们。唯一有用的做法是让粘贴的那部分不含逻辑 —— 没有逻辑就没有版本，没有版本就
   无从脱节。

   为什么从 CDN 取来的脚本还能写 MVU
   ------------------------------------------------------------------
   同源权限属于**文档**，不属于脚本的来源 URL。本文件在酒馆助手渲染出来的 srcdoc iframe 里
   执行，那个文档与酒馆顶层同源，所以 parent.Mvu 照样摸得到。两个可能的拦路虎都不存在：
   酒馆助手不给 srcdoc iframe 加 sandbox，SillyTavern 的 src/server-main.js 里是
   contentSecurityPolicy: false。

   「那 CDN 挂了怎么办」不是问题：壳层唯一的用途就是伺候 HUD，而 HUD 那 250KB 本来就从网络
   加载。取不到脚本的时候 HUD 也起不来，壳层活着也无事可做。把壳层留在本地换不来任何韧性，
   只是把这 2700 行钉死在每个玩家的存档里。

   本文件走 jsDelivr（testingcf）而不是 Pages，原因是延迟差 20 倍 —— 完整的实测数据和取舍写在
   scripts/build-status-shell.mjs 的 SHELL_URL 那一段。jsDelivr 的 12 小时边缘缓存由 CI 自动
   purge 抵掉，所以推一次 main 就对所有人生效。一次坏部署会作用到所有人，但修复同样是一次推送
   —— 这一点比「等所有人重新粘贴」强得多。
*/
(function () {
  /* 本页与酒馆同源，所以能摸到 parent.Mvu。
     玻璃 HUD 本身在跨域 iframe 里，只通过 postMessage 和这里说话。 */
  const SHELL_VERSION = '2026-08-25-split-v1';

  /* 记号要在两道守卫**之前**就落下。引导壳靠它判断「脚本到底有没有到」，语义必须是
     「本文件执行过了」而不是「装载成功了」—— 否则下面任何一条提前 return 都会让引导壳
     误报成网络失败，给用户一句错的提示。线上排查时它也能一眼看出玩家跑的是哪一版。 */
  try {
    document.documentElement.dataset.linjiangShell = SHELL_VERSION;
  } catch (e) {}

  /* 以下两道守卫是「脚本改成异步加载」之后才需要的，内联时代不可能触发。
     ------------------------------------------------------------------
     一、window.frameElement 为空。内联执行时这个 iframe 一定还在，异步就不一定了 ——
         酒馆助手重渲染楼层、或者用户在脚本到达前翻走，iframe 就已经被摘掉。文件末尾
         manager.register 要拿 window.frameElement 当锚点，传个 null 进去会让 messageRank
         炸在一个毫无意义的地方。这里直接不干活退出，交给下一次渲染。
     二、同一文档里重复执行。srcdoc 文档理论上只加载一次，但引导壳如果被谁复制了两份
         script 标签，两个 IIFE 会各自 register 一个 controller，manager 就会在两个假的
         候选之间反复改选。用一个文档级标记挡掉。 */
  if (!window.frameElement) {
    console.warn(`[临江状态栏] iframe 已不在文档里，跳过本次装载（${SHELL_VERSION}）`);
    return;
  }
  const GUARD = '__linjiangStatusShellLoaded';
  if (window[GUARD]) {
    console.warn(`[临江状态栏] 本文档已装载过壳层（${window[GUARD]}），跳过重复执行`);
    return;
  }
  window[GUARD] = SHELL_VERSION;
  const HUD_URL = 'https://tangquanghuy.github.io/linjiang-glass/?v=20260823-cg-bridge-v1';
  // const HUD_URL = 'http://127.0.0.1:5173/';
  const CHANNEL = 'linjiang-hud';
  const POLL_MS = 10000;

  /* 收回态改用酒馆的原生嵌入（实验开关，默认关）。
     ==================================================================
     生产行为：收回态（compacted）跟展开态一样，HUD 被抬到酒馆 body 上的裁剪台里，靠 followHud
     逐帧跟着栏位走。也就是说「收回嵌入框」只是**排版变体**，机制跟展开态完全相同。

     打开这个开关后，只有收回态改成真正的原生嵌入：HUD 直接挂在楼层自己的文档里，
     position:static、宽 100%，滚动/裁剪/层叠/高度全部交给酒馆和浏览器。展开态、全屏、竖屏整页
     一律走原来的生产路径，一个字没改。

     它是给 外部部署/状态栏-测试版-流内嵌入.html 用的（由 scripts/build-status-shell.mjs 生成，
     那份产物会在加载本脚本之前把这个全局设成 true）。生产的两份包装都不设它，所以走的还是老路。

     开着它必然要付的代价，也正是要观察的东西：
       · owner 交接（每来一条 AI 消息）要把 HUD 挪进新楼层的文档，而 iframe 换父节点必重载
         —— 已实测：同文档换父 1→2 次加载、跨文档挪 2→3、挪回来 3→4；只改 CSS 不重载。
       · 在收回↔展开之间切换同样是跨文档挪动，同样重载。 */
  const INLINE_DOCK = (() => {
    try { return !!window.__linjiangInlineDock; } catch (e) { return false; }
  })();

  const localHudFrame = document.getElementById('hud');
  let hudFrame = localHudFrame;
  const hint = document.getElementById('hint');
  const hudOrigin = (() => {
    try { return new URL(HUD_URL, location.href).origin; }
    catch (e) { return '*'; }
  })();

  const showHint = (text) => {
    hint.textContent = text || '';
    hint.classList.toggle('show', !!text);
  };

  const getCoreWindow = () => {
    const wins = [];
    try { if (window.parent) wins.push(window.parent); } catch (e) {}
    try { if (window.top && window.top !== window.parent) wins.push(window.top); } catch (e) {}
    wins.push(window);
    for (const win of wins) {
      try {
        if (win && win.Mvu && typeof win.Mvu.getMvuData === 'function') return win;
      } catch (e) {}
    }
    return window.parent || window;
  };

  const mvuState = {
    ready: false,
    mvu: null,
    check() {
      const win = getCoreWindow();
      if (!win || typeof win.Mvu === 'undefined'
          || typeof win.Mvu.getMvuData !== 'function'
          || typeof win.Mvu.replaceMvuData !== 'function') {
        this.ready = false;
        this.mvu = null;
        return false;
      }
      this.ready = true;
      this.mvu = win.Mvu;
      return true;
    },
  };

  const fetchLatestMvuData = () => {
    let finalData = {};
    try {
      if (mvuState.ready || mvuState.check()) {
        const messageData = mvuState.mvu.getMvuData({ type: 'message', message_id: 'latest' });
        const chatData = mvuState.mvu.getMvuData({ type: 'chat' });
        const messageStat = messageData?.stat_data || {};
        const chatStat = chatData?.stat_data || {};
        if (Object.keys(messageStat).length > 0) finalData = messageStat;
        else finalData = chatStat;
      }
    } catch (e) {
      console.warn('[临江状态栏] MVU 读取失败', e);
    }
    return finalData;
  };

  /* 网络图片 URL 可以随 MVU 保存；本地上传图只留在同源 localStorage，避免
     base64 膨胀每条消息的 stat_data。无痕窗口只会看到 MVU 中的网络 URL。 */
  const HUD_COVER_PREFIX = 'custom_char_cover_';
  const validRemoteCover = (value) => {
    const src = String(value || '').trim();
    return /^https?:\/\//i.test(src) ? src : '';
  };
  const validLocalCover = (value) => {
    const src = String(value || '').trim();
    return /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,/i.test(src) || /^https?:\/\//i.test(src) ? src : '';
  };
  const readHudUi = (stat) => {
    const characterCovers = {};
    const names = Object.keys((stat && stat.对象信息) || {});
    const rooms = stat?.系统配置?.直播间 || {};
    try {
      const core = getCoreWindow();
      const storage = core.localStorage || localStorage;
      names.forEach((name) => {
        const src = validRemoteCover(rooms?.[name]?.封面)
          || validLocalCover(storage.getItem(HUD_COVER_PREFIX + name));
        if (src) characterCovers[name] = src;
      });
    } catch (e) {
      names.forEach((name) => {
        const src = validRemoteCover(rooms?.[name]?.封面);
        if (src) characterCovers[name] = src;
      });
    }
    return { characterCovers };
  };

  const hudSnapshot = (stat) => ({ stat_data: stat, ui: readHudUi(stat) });

  const applyMvuPatches = (patches) => {
    try {
      if (!mvuState.ready && !mvuState.check()) return false;
      const mvuData = mvuState.mvu.getMvuData({ type: 'message', message_id: 'latest' });
      if (!mvuData?.stat_data) return false;
      (patches || []).forEach((patch) => {
        const parts = String(patch.path || '').split('/').filter(Boolean);
        if (!parts.length) return;
        if (patch.op === 'replace' || patch.op === 'add') {
          let obj = mvuData.stat_data;
          for (let i = 0; i < parts.length - 1; i++) {
            if (!obj[parts[i]]) obj[parts[i]] = {};
            obj = obj[parts[i]];
          }
          obj[parts[parts.length - 1]] = patch.value;
        } else if (patch.op === 'remove') {
          let obj = mvuData.stat_data;
          for (let i = 0; i < parts.length - 1; i++) {
            if (!obj[parts[i]]) return;
            obj = obj[parts[i]];
          }
          delete obj[parts[parts.length - 1]];
        }
      });
      mvuState.mvu.replaceMvuData(mvuData, { type: 'message', message_id: 'latest' });
      return true;
    } catch (e) {
      console.warn('[临江状态栏] MVU 写入失败', e);
      return false;
    }
  };

  const sendMessage = (text) => {
    const next = String(text || '').trim();
    if (!next) throw new Error('消息内容为空');
    const win = getCoreWindow();
    const doc = (win && win.document) ? win.document : document;
    const textarea = doc.getElementById('send_textarea');
    if (!textarea) throw new Error('未找到聊天输入框');
    const sendButton = doc.getElementById('send_but');
    textarea.value = next;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    if (sendButton) sendButton.click();
    try { textarea.focus(); } catch (e) {}
    return true;
  };

  const clockIn = () => {
    const data = fetchLatestMvuData() || {};
    const work = data.玩家信息?.工作 || {};
    const job = work.职业;
    const place = work.地点;
    const daily = Number(work.日收入) || 0;
    const done = !!work.今日已上班;
    const here = data.世界信息?.位置?.区域;
    if (!job) throw new Error('无业');
    if (done) throw new Error('今日已上班');
    if (here !== place) throw new Error('未到岗');
    if (daily <= 0) throw new Error('日收入为 0');
    const money = Number(data.玩家信息?.金钱) || 0;
    const ok = applyMvuPatches([
      { op: 'replace', path: '/玩家信息/金钱', value: money + daily },
      { op: 'replace', path: '/玩家信息/工作/今日已上班', value: true },
    ]);
    if (!ok) throw new Error('MVU 写入失败');
    return { money: money + daily, daily };
  };

  const ARCADE_MILESTONES = [
    { id: 'slot-golden-grape', unlock: 'slot_golden_grape', label: '黄金葡萄', game: 'slots', field: '旋转次数', target: 50 },
    { id: 'fish-golden-clown', unlock: 'fish_golden_clown', label: '黄金小丑鱼', game: 'fishing', field: '捕获次数', target: 100 },
    { id: 'fish-starlight-jelly', unlock: 'fish_starlight_jelly', label: '星光水母', game: 'fishing', field: '捕获次数', target: 500 },
    { id: 'slot-mystery-cloud', unlock: 'slot_mystery_cloud', label: '云雾问号', game: 'slots', field: '旋转次数', target: 500 },
    { id: 'fish-deep-bomb', unlock: 'fish_deep_bomb', label: '深海炸弹', game: 'fishing', field: '捕获次数', target: 2000 },
  ];

  const freshArcadeProfile = () => ({
    版本: 3,
    统计: {
      刮刮乐: { 结算次数: 0, 中奖次数: 0, 最高倍率: 0, 累计返奖: 0 },
      幸运机: { 旋转次数: 0, 中奖次数: 0, 最高倍率: 0, 累计返奖: 0 },
      捕鱼: { 结算次数: 0, 捕获次数: 0, 最高倍率: 0, 累计返奖: 0, 清屏次数: 0 },
    },
    已解锁: {},
    已达成: {},
  });

  const num = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const normalizeArcadeProfile = (raw) => {
    const base = freshArcadeProfile();
    const src = raw && typeof raw === 'object' ? raw : {};
    const stats = src.统计 && typeof src.统计 === 'object' ? src.统计 : {};
    for (const [game, defaults] of Object.entries(base.统计)) {
      const row = stats[game] && typeof stats[game] === 'object' ? stats[game] : {};
      for (const key of Object.keys(defaults)) defaults[key] = Math.max(0, num(row[key]));
    }
    base.已解锁 = src.已解锁 && typeof src.已解锁 === 'object' ? { ...src.已解锁 } : {};
    base.已达成 = src.已达成 && typeof src.已达成 === 'object' ? { ...src.已达成 } : {};
    const sourceVersion = Math.floor(num(src.版本));
    if (sourceVersion < 3) {
      const rows = { scratch: base.统计.刮刮乐, slots: base.统计.幸运机, fishing: base.统计.捕鱼 };
      for (const milestone of ARCADE_MILESTONES) {
        const reached = num(rows[milestone.game]?.[milestone.field]) >= milestone.target;
        if (reached) {
          base.已达成[milestone.id] = true;
          base.已解锁[milestone.unlock] = true;
        } else {
          delete base.已达成[milestone.id];
          delete base.已解锁[milestone.unlock];
        }
      }
    }
    base.版本 = 3;
    return base;
  };

  const recordArcadeEvent = (event) => {
    if (!mvuState.ready && !mvuState.check()) throw new Error('MVU 未就绪');
    const mvuData = mvuState.mvu.getMvuData({ type: 'message', message_id: 'latest' });
    if (!mvuData?.stat_data) throw new Error('MVU 数据为空');
    const stat = mvuData.stat_data;
    const profile = normalizeArcadeProfile(stat.系统配置?.街机);
    const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
    if (event?.game === 'scratch' && /:settled$/.test(String(event?.type))) {
      const row = profile.统计.刮刮乐;
      row.结算次数 += 1;
      if (num(detail.payout) > 0) row.中奖次数 += 1;
      row.最高倍率 = Math.max(row.最高倍率, num(detail.multiplier));
      row.累计返奖 += Math.max(0, num(detail.payout));
    } else if (event?.game === 'slots' && /:settled$/.test(String(event?.type))) {
      const row = profile.统计.幸运机;
      row.旋转次数 += 1;
      if (num(detail.payout) > 0) row.中奖次数 += 1;
      row.最高倍率 = Math.max(row.最高倍率, num(detail.multiplier));
      row.累计返奖 += Math.max(0, num(detail.payout));
    } else if (event?.game === 'fishing' && /:settled$/.test(String(event?.type))) {
      const row = profile.统计.捕鱼;
      row.结算次数 += 1;
      if (detail.captured) row.捕获次数 += 1;
      if (detail.special === 'clear' && detail.captured) row.清屏次数 += 1;
      row.最高倍率 = Math.max(row.最高倍率, num(detail.multiplier));
      row.累计返奖 += Math.max(0, num(detail.payout));
    } else {
      return { profile, unlocked: [], ignored: true };
    }

    const rows = { scratch: profile.统计.刮刮乐, slots: profile.统计.幸运机, fishing: profile.统计.捕鱼 };
    const unlocked = [];
    for (const milestone of ARCADE_MILESTONES) {
      if (profile.已达成[milestone.id]) continue;
      if (num(rows[milestone.game]?.[milestone.field]) < milestone.target) continue;
      profile.已达成[milestone.id] = true;
      profile.已解锁[milestone.unlock] = true;
      unlocked.push({ id: milestone.unlock, label: milestone.label, milestone: milestone.id });
    }

    if (!stat.系统配置 || typeof stat.系统配置 !== 'object') stat.系统配置 = {};
    stat.系统配置.街机 = profile;
    /* 蓝图是街机代币换的，玩街机的人正是持有它的人，这条又是最频繁的写入路径——
       挂在这儿，老存档的旧描述基本上下一次结算就被改正了。 */
    syncBlueprintDescription(stat);
    mvuState.mvu.replaceMvuData(mvuData, { type: 'message', message_id: 'latest' });
    return { profile, unlocked };
  };

  const hudWindow = () => hudFrame.contentWindow;
  const postToHud = (payload) => {
    const target = hudWindow();
    if (!target) return;
    try { target.postMessage(payload, hudOrigin === '*' ? '*' : hudOrigin); }
    catch (e) {}
  };

  const postHudMode = (mode) => {
    postToHud({
      channel: CHANNEL,
      kind: 'event',
      type: 'layoutMode',
      payload: { mode: mode === 'portrait' ? 'portrait' : 'landscape' },
    });
  };

  let lastSnap = '';
  const pushSnapshot = (force) => {
    if (!isOwner()) return;
    const stat = fetchLatestMvuData();
    const hasWorld = !!(stat && stat.世界信息);
    showHint(hasWorld ? '' : '等待 MVU 数据…');
    if (!hasWorld) return;
    const snapshot = hudSnapshot(stat);
    const json = JSON.stringify(snapshot);
    if (!force && json === lastSnap) return;
    lastSnap = json;
    postToHud({ channel: CHANNEL, kind: 'event', type: 'snapshot', context: manager.context(), payload: snapshot });
  };

  /* 唤起外部部署的小手机。
     ------------------------------------------------------------------
     本页不含任何小手机代码，只是替掉它原来的悬浮球：小手机脚本自己在酒馆里跑，
     我们只负责按下那颗钮。

     以前这里只在 top / parent / 自己身上找 __linjiangOpenMobilePhone，前提是小手机脚本
     能把函数挂到酒馆顶层。那一步只在同源时成立，而小手机通常跑在酒馆助手的脚本框架里，
     一旦中间有一层跨源/沙箱，赋值就静默失败，这边一个候选都命中不了 —— 于是点了没反应。

     现在两条路依次试：先把整棵框架树都翻一遍找同源的启动函数（indexed frame 访问和
     length 跨源也读得到，所以这棵树能完整走完，只是跨源的那些取不到属性）；再不行就往
     每个框架广播一条 postMessage，由小手机脚本自己应答（见 phone/src/31-global-exports.js）。 */
  const PHONE_CHANNEL = 'linjiang-phone';
  const PHONE_ACK_MS = 1500;
  let phoneSeq = 0;
  const phoneAcks = new Map();

  const frameTree = (root) => {
    const out = [];
    const walk = (win) => {
      if (!win || out.indexOf(win) !== -1) return;
      out.push(win);
      let count = 0;
      try { count = win.frames.length || 0; } catch (e) { count = 0; }
      for (let i = 0; i < count; i++) {
        let child = null;
        try { child = win.frames[i]; } catch (e) { child = null; }
        if (child) walk(child);
      }
    };
    try { walk(root); } catch (e) {}
    return out;
  };

  const phoneWindows = () => {
    const wins = frameTree(tavernWin());
    [window.top, window.parent, window].forEach((win) => {
      try { if (win && wins.indexOf(win) === -1) wins.push(win); } catch (e) {}
    });
    return wins;
  };

  const findPhoneLauncher = () => {
    for (const win of phoneWindows()) {
      try {
        const launch = win.__linjiangOpenMobilePhone || win.openMobilePhone;
        if (typeof launch === 'function') return launch;
      } catch (e) {}
    }
    return null;
  };

  const askPhoneByMessage = () => new Promise((resolve) => {
    const id = 'phone-' + (++phoneSeq) + '-' + Date.now();
    const timer = setTimeout(() => {
      phoneAcks.delete(id);
      resolve(false);
    }, PHONE_ACK_MS);
    phoneAcks.set(id, () => {
      clearTimeout(timer);
      phoneAcks.delete(id);
      resolve(true);
    });
    const payload = { channel: PHONE_CHANNEL, type: 'open', id };
    phoneWindows().forEach((win) => {
      if (win === window) return;
      try { win.postMessage(payload, '*'); } catch (e) {}
    });
  });

  const onPhoneAck = (event) => {
    const data = event.data;
    if (!data || data.channel !== PHONE_CHANNEL || data.type !== 'opened') return;
    const done = phoneAcks.get(data.id);
    if (done) done();
  };

  /* 正文插图和 HUD / 小手机分别住在不同 iframe 与 origin，localStorage 不共享。
     正文在图片 load 后向酒馆顶层发 record；当前状态栏 owner 负责持久转发：
       1. 走 HUD bridge，让 Pages origin 写入自己的 unlocked_cg；
       2. 向整棵 frame tree 广播 apply，让正在运行的小手机立即同步。 */
  const CG_UNLOCK_CHANNEL = 'linjiang-cg-unlock';
  const seenCGUnlocks = new Set();
  const onCGUnlockRecord = (event) => {
    const data = event.data;
    if (!isOwner() || !data || data.channel !== CG_UNLOCK_CHANNEL || data.type !== 'record') return;
    const character = String(data.character || '').trim();
    const scene = String(data.scene || '').trim();
    const count = Math.max(1, Math.floor(Number(data.count) || 1));
    if (!character || !scene) return;
    const id = String(data.id || `${character}/${scene}/${count}`);
    if (seenCGUnlocks.has(id)) return;
    seenCGUnlocks.add(id);
    if (seenCGUnlocks.size > 300) {
      const oldest = seenCGUnlocks.values().next().value;
      seenCGUnlocks.delete(oldest);
    }
    const payload = {
      id,
      category: data.category === 'SFW' ? 'SFW' : 'NSFW',
      character,
      scene,
      count
    };
    postToHud({
      channel: CHANNEL,
      kind: 'event',
      type: 'cgUnlock',
      context: manager.context(),
      payload
    });
    const applyMessage = { channel: CG_UNLOCK_CHANNEL, type: 'apply', ...payload };
    phoneWindows().forEach((win) => {
      try { win.postMessage(applyMessage, '*'); } catch (e) {}
    });
  };
  const openPhonePanel = async () => {
    const launch = findPhoneLauncher();
    if (launch) {
      launch();
      return true;
    }
    if (await askPhoneByMessage()) return true;
    throw new Error('没找到小手机脚本，请确认它已在酒馆里启用');
  };

  const DEV_PARTS = ['口腔', '胸', '小穴', '肛门'];

  const normalizeDevelopmentNotes = (raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('评语响应不是JSON对象');
    const notes = {};
    DEV_PARTS.forEach((part) => {
      const text = String(raw[part] || '').replace(/\s+/g, ' ').trim();
      if (!text) throw new Error(`评语响应缺少${part}`);
      notes[part] = text.slice(0, 1200);
    });
    return notes;
  };

  const parseDevelopmentNotes = (response) => {
    const text = String(response || '').trim();
    const tagged = text.match(/<development_notes>([\s\S]*?)<\/development_notes>/i);
    let body = tagged ? tagged[1].trim() : text;
    body = body.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('评语响应中没有JSON对象');
    try { return normalizeDevelopmentNotes(JSON.parse(body.slice(start, end + 1))); }
    catch (error) { throw new Error(`评语JSON解析失败：${error.message}`); }
  };

  const writeDevelopmentNotes = (name, rawNotes) => {
    const notes = normalizeDevelopmentNotes(rawNotes);
    const stat = fetchLatestMvuData();
    if (!stat?.对象信息?.[name]?.开发度) throw new Error(`MVU中找不到目标对象：${name}`);
    const patches = DEV_PARTS.map((part) => ({
      op: 'replace',
      path: `/对象信息/${name}/开发度/${part}/评语`,
      value: notes[part],
    }));
    if (!applyMvuPatches(patches)) throw new Error('评语写入MVU失败');
    pushSnapshot(true);
    return notes;
  };

  const generateDevelopmentNotes = async (payload) => {
    const name = String(payload?.name || '').trim();
    const prompt = String(payload?.prompt || '').trim();
    if (!name || !prompt) throw new Error('评语生成参数不完整');
    if (!prompt.includes(name)) throw new Error('生成提示词缺少目标对象姓名，无法激活对应世界书');
    const core = getCoreWindow();
    const helper = [core, window.parent, window.top, window].map((win) => {
      try { return win?.TavernHelper; } catch (e) { return null; }
    }).find((value) => value && typeof value.generate === 'function');
    if (!helper) throw new Error('TavernHelper.generate API 不可用');
    const userInput = `【目标对象世界书关键词】${name}\n【只处理目标对象】${name}\n\n${prompt}`;
    const response = await helper.generate({ user_input: userInput, max_chat_history: 10 });
    return writeDevelopmentNotes(name, parseDevelopmentNotes(response));
  };
  /* ============ 城市规划蓝图：建设费 ============
     蓝图是「用品」，按变量规则使用不扣数量，所以它是一张可反复用的许可证，不是一次性道具。
     代价改成按次收钱：每次在地图上确定建设，从 玩家信息.金钱 扣一笔建设费，钱不够就不许开工。

     这个数字是真源。跟着它走的还有三处，改价时一起改：
       shop/products.json  item-15 的 description / effect / goods.描述
       src/data.js         CITY_BUILD_COST（HUD 侧显示与按钮禁用）
       酒馆变量/变量更新规则 + 世界书/道具制作和使用（正文与 AI 侧的规则说明） */
  const CITY_BUILD_ITEM = '城市规划蓝图';
  const CITY_BUILD_COST = 1000000;
  const yuan = (value) => `￥${Math.round(Number(value) || 0).toLocaleString('en-US')}`;
  const CITY_BUILD_DESC = `使用后，在地图和世界书中添加你自己的地图节点，并自动将其拥有为自己的资产。每次确定建设另需支付 ${yuan(CITY_BUILD_COST)} 建设费，金钱不足时无法开工；蓝图本身不消耗，可反复使用。`;

  /* 老存档的背包里存着旧版描述（没有建设费那一句）。描述是购买时抄进 MVU 的快照，
     不会自己更新，所以在每一条已经要写 MVU 的路径上顺手改正一次——不为它单独发起写入。 */
  const syncBlueprintDescription = (stat) => {
    const row = stat?.玩家信息?.背包?.用品?.[CITY_BUILD_ITEM];
    if (!row || typeof row !== 'object') return false;
    if (String(row.描述 || '') === CITY_BUILD_DESC) return false;
    row.描述 = CITY_BUILD_DESC;
    return true;
  };

  const purchaseShopProduct = (product) => {
    const bucket = String(product?.storageBucket || '用品').trim();
    const name = String(product?.goods?.['名称'] || product?.name || '').trim();
    const category = String(product?.goods?.['类别'] || '').trim();
    const description = String(product?.goods?.['描述'] || product?.description || '').trim();
    const goodsCats = ['服装', '饰品', '器具', '器材', '其他'];
    const consumableCats = ['食物', '饮料', '药物', '日用', '其他'];
    if (!name) throw new Error('商品名称为空');
    if (bucket !== '用品' && bucket !== '消耗品') throw new Error('商品存储分类无效');
    if (bucket === '用品' && !goodsCats.includes(category)) throw new Error('用品类别无效');
    if (bucket === '消耗品' && !consumableCats.includes(category)) throw new Error('消耗品类别无效');
    if (!mvuState.ready && !mvuState.check()) throw new Error('MVU 未就绪');
    const mvuData = mvuState.mvu.getMvuData({ type: 'message', message_id: 'latest' });
    if (!mvuData?.stat_data) throw new Error('MVU 数据为空');
    const stat = mvuData.stat_data;
    stat.玩家信息 = stat.玩家信息 && typeof stat.玩家信息 === 'object' ? stat.玩家信息 : {};
    stat.玩家信息.背包 = stat.玩家信息.背包 && typeof stat.玩家信息.背包 === 'object' ? stat.玩家信息.背包 : {};
    const bag = stat.玩家信息.背包;
    if (bucket === '消耗品') {
      bag.消耗品 = bag.消耗品 && typeof bag.消耗品 === 'object' ? bag.消耗品 : {};
      const current = bag.消耗品[name] && typeof bag.消耗品[name] === 'object' ? bag.消耗品[name] : null;
      bag.消耗品[name] = { 名称: name, 类别: category, 数量: Math.max(0, Math.floor(Number(current?.数量) || 0)) + 1, 品级: String(product?.goods?.['品级'] || product?.rarity || current?.品级 || '').trim(), 强度: Math.max(1, Math.min(5, Math.floor(Number(product?.goods?.['强度']) || Number(current?.强度) || 1))), 描述: description || String(current?.描述 || '') };
      mvuState.mvu.replaceMvuData(mvuData, { type: 'message', message_id: 'latest' });
      return { bucket, item: bag.消耗品[name] };
    }
    bag.用品 = bag.用品 && typeof bag.用品 === 'object' ? bag.用品 : {};
    const current = bag.用品[name] && typeof bag.用品[name] === 'object' ? bag.用品[name] : null;
    bag.用品[name] = { 名称: name, 类别: category, 数量: Math.max(0, Math.floor(Number(current?.数量) || 0)) + 1, 品级: String(product?.goods?.['品级'] || product?.rarity || current?.品级 || '').trim(), 佩戴: category === '器材' ? false : !!current?.佩戴, 描述: description || String(current?.描述 || '') };
    syncBlueprintDescription(stat);
    mvuState.mvu.replaceMvuData(mvuData, { type: 'message', message_id: 'latest' });
    return { bucket, item: bag.用品[name] };
  };

  /* ============ 玩家自建地图节点 ============ */
  const customMapHelper = () => {
    const core = getCoreWindow();
    return [core, window.parent, window.top, window].map((win) => {
      try { return win?.TavernHelper; } catch (e) { return null; }
    }).find((helper) => helper && (
      typeof helper.getWorldbook === 'function'
      || typeof helper.getLorebookEntries === 'function'
      || typeof helper.createWorldbookEntries === 'function'
      || typeof helper.createLorebookEntries === 'function'
    ));
  };

  const customMapBookName = async (helper) => {
    try {
      const names = typeof helper.getCharWorldbookNames === 'function'
        ? helper.getCharWorldbookNames('current') : null;
      if (names?.primary) return names.primary;
      if (Array.isArray(names?.additional) && names.additional.length) return names.additional[0];
    } catch (e) {}
    for (const fn of ['getOrCreateChatWorldbook', 'getOrCreateChatLorebook']) {
      try {
        if (typeof helper[fn] !== 'function') continue;
        const name = await helper[fn]('current');
        if (name) return name;
      } catch (e) {}
    }
    return null;
  };

  const readCustomMapEntries = async (helper, bookName) => {
    for (const fn of ['getWorldbook', 'getLorebookEntries']) {
      try {
        if (typeof helper[fn] !== 'function') continue;
        const rows = await helper[fn](bookName);
        if (Array.isArray(rows)) return rows;
      } catch (e) {}
    }
    return [];
  };

  const customMapScalar = (value) => JSON.stringify(String(value ?? ''));
  const customMapWorldbookPayload = (node) => {
    const keys = [...new Set([node.name, ...(node.aliases || [])]
      .map(value => String(value || '').trim()).filter(Boolean))];
    const flags = [];
    if (node.features.canDate) flags.push('约会');
    if (node.features.canGather) flags.push('采集');
    if (node.features.canWork) flags.push('工作');
    if (node.features.hasShop) flags.push('商店');
    const lines = [
      `${node.name}:`,
      '  来源: 玩家自建地点',
      `  区域: ${customMapScalar(node.district)}`,
      `  类型: ${customMapScalar(node.archetype)}`,
      `  私密度: ${node.privacy}`,
      `  开放: [${node.openHours.map(customMapScalar).join(', ')}]`,
      `  详情: ${customMapScalar(node.intro)}`,
      `  看点: ${customMapScalar(node.draw)}`,
      `  功能: [${flags.map(customMapScalar).join(', ')}]`,
      '  地图接驳:',
      `    节点: ${customMapScalar(node.anchorName || node.anchorId)}`,
      `    步行距离: ${node.accessKm}km`,
    ];
    if (node.special.length) {
      lines.push('  特殊:');
      node.special.forEach(value => lines.push(`    - ${customMapScalar(value)}`));
    }
    return {
      name: `玩家地点 - ${node.name}`,
      comment: `玩家地点 - ${node.name}`,
      enabled: true,
      keys,
      key: keys,
      content: lines.join('\n'),
      strategy: {
        type: 'selective', keys,
        keys_secondary: { logic: 'and_any', keys: [] },
        scan_depth: 'same_as_global',
      },
      position: { type: 'after_character_definition', role: 'system', depth: 0, order: 34 },
      probability: 100,
      recursion: { prevent_incoming: true, prevent_outgoing: true, delay_until: null },
      effect: { sticky: null, cooldown: null, delay: null },
      extra: { linjiangCustomMapNode: { id: node.id, version: 1 } },
    };
  };

  const syncCustomMapWorldbook = async (node) => {
    const helper = customMapHelper();
    if (!helper) return { synced: false, uid: null };
    const bookName = await customMapBookName(helper);
    if (!bookName) return { synced: false, uid: null };
    const rows = await readCustomMapEntries(helper, bookName);
    const existing = rows.find(entry => String(entry?.extra?.linjiangCustomMapNode?.id || '') === node.id);
    const payload = customMapWorldbookPayload(node);
    if (existing && typeof helper.updateWorldbookWith === 'function') {
      await helper.updateWorldbookWith(bookName, list => (Array.isArray(list) ? list : [])
        .map(entry => entry?.uid === existing.uid ? { ...entry, ...payload } : entry));
      return { synced: true, uid: existing.uid };
    }
    if (existing && typeof helper.setLorebookEntries === 'function') {
      await helper.setLorebookEntries(bookName, [{ uid: existing.uid, ...payload }]);
      return { synced: true, uid: existing.uid };
    }
    for (const fn of ['createWorldbookEntries', 'createLorebookEntries']) {
      if (typeof helper[fn] !== 'function') continue;
      await helper[fn](bookName, [payload], { render: 'immediate' });
      const next = await readCustomMapEntries(helper, bookName);
      const created = next.find(entry => String(entry?.extra?.linjiangCustomMapNode?.id || '') === node.id);
      return { synced: true, uid: created?.uid ?? null };
    }
    return { synced: false, uid: null };
  };

  const removeCustomMapWorldbook = async (id) => {
    const helper = customMapHelper();
    if (!helper) return false;
    const bookName = await customMapBookName(helper);
    if (!bookName) return false;
    const rows = await readCustomMapEntries(helper, bookName);
    const existing = rows.find(entry => String(entry?.extra?.linjiangCustomMapNode?.id || '') === id);
    if (!existing) return true;
    if (typeof helper.updateWorldbookWith === 'function') {
      await helper.updateWorldbookWith(bookName, list => (Array.isArray(list) ? list : [])
        .filter(entry => entry?.uid !== existing.uid));
      return true;
    }
    if (typeof helper.setLorebookEntries === 'function') {
      await helper.setLorebookEntries(bookName, [{
        ...existing, uid: existing.uid, enabled: false, keys: [], key: [], content: '',
      }]);
      return true;
    }
    return false;
  };

  const saveCustomMapNode = async (draft) => {
    if (!mvuState.ready && !mvuState.check()) throw new Error('MVU 未就绪');
    const mvuData = mvuState.mvu.getMvuData({ type: 'message', message_id: 'latest' });
    if (!mvuData?.stat_data) throw new Error('MVU 数据为空');
    const stat = mvuData.stat_data;
    /* 建设费的门槛先过。地图那边也会拦一道，但它拿的是快照里的金钱，可能已经过时——
       这里是唯一权威：重新读一次当前 MVU。

       放在最前面是有意的：下面几行会给 系统配置.地图 补默认容器，getMvuData 给的又可能是
       活引用。钱不够就一个字段都不碰，拒绝之后这份数据跟进函数之前完全一样。 */
    const funds = Number(stat.玩家信息?.金钱) || 0;
    if (funds < CITY_BUILD_COST) {
      throw new Error(`金钱不足：建设需要 ${yuan(CITY_BUILD_COST)}，当前只有 ${yuan(funds)}，还差 ${yuan(CITY_BUILD_COST - funds)}`);
    }
    stat.系统配置 = stat.系统配置 && typeof stat.系统配置 === 'object' ? stat.系统配置 : {};
    stat.系统配置.地图 = stat.系统配置.地图 && typeof stat.系统配置.地图 === 'object' ? stat.系统配置.地图 : {};
    stat.系统配置.地图.版本 = 1;
    const saved = stat.系统配置.地图.自建节点;
    stat.系统配置.地图.自建节点 = saved && typeof saved === 'object' ? saved : {};
    const nodes = stat.系统配置.地图.自建节点;
    const id = String(draft?.id || `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`).trim();
    const name = String(draft?.name || '').trim().slice(0, 30);
    if (!name) throw new Error('地点名称为空');
    const pos = Array.isArray(draft?.localPos) ? draft.localPos.map(Number) : [];
    if (pos.length < 2 || !pos.every(Number.isFinite)) throw new Error('节点坐标无效');
    const duplicate = Object.entries(nodes).find(([key, value]) => key !== id && String(value?.名称 || '').trim() === name);
    if (duplicate) throw new Error('已有同名玩家节点');
    const aliases = Array.isArray(draft.aliases)
      ? draft.aliases.map(value => String(value || '').trim()).filter(Boolean).slice(0, 8) : [];
    const hours = Array.isArray(draft.openHours)
      ? draft.openHours.filter(value => ['朝', '昼', '暮', '夜', '深夜'].includes(value)) : [];
    const node = {
      id, name, aliases,
      district: String(draft.district || '').trim(),
      plate: String(draft.plate || '').trim(),
      localPos: [Math.max(0, Math.min(1, pos[0])), Math.max(0, Math.min(1, pos[1]))],
      anchorId: String(draft.anchorId || '').trim(),
      anchorName: String(draft.anchorName || '').trim(),
      accessKm: Math.max(0, Math.round((Number(draft.accessKm) || 0) * 100) / 100),
      archetype: String(draft.archetype || 'living').trim() || 'living',
      privacy: Math.max(0, Math.min(5, Math.round(Number(draft.privacy) || 0))),
      openHours: hours.length ? hours : ['朝', '昼', '暮', '夜', '深夜'],
      intro: String(draft.intro || '').trim().slice(0, 500),
      draw: String(draft.draw || '').trim().slice(0, 300),
      special: Array.isArray(draft.special)
        ? draft.special.map(value => String(value || '').trim()).filter(Boolean).slice(0, 12) : [],
      features: {
        canDate: !!draft.features?.canDate,
        canGather: !!draft.features?.canGather,
        canWork: !!draft.features?.canWork,
        hasShop: !!draft.features?.hasShop,
      },
      createdAt: `${String(stat.世界信息?.年历 || '').trim()} ${String(stat.世界信息?.时间?.时钟 || '').trim()}`.trim(),
    };
    let worldbook = { synced: false, uid: null };
    try { worldbook = await syncCustomMapWorldbook(node); }
    catch (error) { console.warn('[临江地图] 地点世界书同步失败', error); }
    nodes[id] = {
      名称: node.name, 别名: node.aliases, 区域: node.district, 底板: node.plate,
      区内坐标: node.localPos, 锚点: node.anchorId, 锚点名称: node.anchorName,
      接驳距离: node.accessKm, 类型: node.archetype, 私密度: node.privacy,
      开放时段: node.openHours,
      功能: {
        可约会: node.features.canDate, 可采集: node.features.canGather,
        可工作: node.features.canWork, 有商店: node.features.hasShop,
      },
      简介: node.intro, 看点: node.draw, 特殊: node.special, 创建时间: node.createdAt,
      世界书同步: { 状态: worldbook.synced ? '已同步' : '由地图加载动态注入', 条目UID: worldbook.uid },
    };
    /* 扣费和建节点是同一次 replaceMvuData：要么都落，要么都不落。
       不用 bridge 的 setMoney —— 那条是防抖 + 整字段覆盖的，街机并发推一次就能把这笔扣款冲掉。 */
    stat.玩家信息 = stat.玩家信息 && typeof stat.玩家信息 === 'object' ? stat.玩家信息 : {};
    stat.玩家信息.金钱 = funds - CITY_BUILD_COST;
    syncBlueprintDescription(stat);
    mvuState.mvu.replaceMvuData(mvuData, { type: 'message', message_id: 'latest' });
    return { node, worldbook, cost: CITY_BUILD_COST, money: stat.玩家信息.金钱 };
  };

  const deleteCustomMapNode = async (id) => {
    const nodeId = String(id || '').trim();
    if (!nodeId) throw new Error('节点 ID 为空');
    if (!mvuState.ready && !mvuState.check()) throw new Error('MVU 未就绪');
    const mvuData = mvuState.mvu.getMvuData({ type: 'message', message_id: 'latest' });
    const stat = mvuData?.stat_data;
    const nodes = stat?.系统配置?.地图?.自建节点;
    if (!nodes?.[nodeId]) return true;
    const row = nodes[nodeId];
    const needsWorldbook = String(row?.世界书同步?.状态 || '') === '已同步';
    let removed = false;
    try { removed = await removeCustomMapWorldbook(nodeId); }
    catch (error) { console.warn('[临江地图] 删除地点世界书失败', error); }
    if (needsWorldbook && !removed) throw new Error('地点世界书暂时未删除，请稍后重试');
    const deletedName = String(row?.名称 || '').trim();
    const fallbackArea = [String(row?.区域 || '').trim(), String(row?.锚点名称 || '').trim()]
      .filter(Boolean).join(' · ');
    const pointsAtDeleted = value => deletedName && String(value || '').includes(deletedName);
    if (pointsAtDeleted(stat?.世界信息?.位置?.区域) && fallbackArea) {
      stat.世界信息.位置.区域 = fallbackArea;
      stat.世界信息.位置.场所 = '地图接驳点';
    }
    if (pointsAtDeleted(stat?.玩家信息?.居住地) && fallbackArea) stat.玩家信息.居住地 = fallbackArea;
    if (pointsAtDeleted(stat?.玩家信息?.工作?.地点) && fallbackArea) stat.玩家信息.工作.地点 = fallbackArea;
    Object.values(stat?.对象信息 || {}).forEach(obj => {
      if (pointsAtDeleted(obj?.位置?.区域) && fallbackArea) {
        obj.位置.区域 = fallbackArea;
        obj.位置.场所 = '地图接驳点';
      }
    });
    delete nodes[nodeId];
    mvuState.mvu.replaceMvuData(mvuData, { type: 'message', message_id: 'latest' });
    return true;
  };

  const handleRequest = (action, payload) => {
    switch (action) {
      case 'handshake':
        return {
          ok: true,
          label: '临江玻璃状态栏',
          hasMvu: !!(mvuState.ready || mvuState.check()),
          context: manager.context(),
        };
      case 'getSnapshot':
        return hudSnapshot(fetchLatestMvuData());
      case 'patch':
        if (!applyMvuPatches(payload?.patches || [])) throw new Error('MVU 写入失败');
        return true;
      case 'clockIn':
        return clockIn();
      case 'arcadeEvent':
        return recordArcadeEvent(payload?.event || {});
      case 'purchaseShopProduct':
        return purchaseShopProduct(payload?.product || {});
      case 'saveCustomMapNode':
        return saveCustomMapNode(payload?.node || {});
      case 'deleteCustomMapNode':
        return deleteCustomMapNode(payload?.id);
      case 'sendMessage':
        return sendMessage(payload?.text);
      case 'collapseHud':
        return collapseHud();
      case 'openPhone':
        return openPhonePanel();
      case 'generateDevelopmentNotes':
        return generateDevelopmentNotes(payload);
      case 'restoreDevelopmentNotes':
        return writeDevelopmentNotes(String(payload?.name || '').trim(), payload?.notes || {});
      default:
        throw new Error('未知桥接动作: ' + action);
    }
  };

  const onHudRequest = async (event) => {
    const data = event.data;
    if (!isOwner() || !data || data.channel !== CHANNEL || data.kind !== 'request') return;
    if (event.source !== hudFrame.contentWindow) return;
    if (hudOrigin !== '*' && event.origin !== hudOrigin) return;
    const currentContext = manager.context();
    if (data.action !== 'handshake' && data.context
        && (Number(data.context.epoch) !== currentContext.epoch
          || String(data.context.chatKey || '') !== String(currentContext.chatKey || ''))) return;
    const reply = {
      channel: CHANNEL,
      kind: 'response',
      id: data.id,
      context: manager.context(),
    };
    try {
      const payload = await handleRequest(data.action, data.payload || {});
      event.source?.postMessage({ ...reply, ok: true, payload }, event.origin);
      if (data.action === 'handshake' || data.action === 'patch' || data.action === 'clockIn' || data.action === 'arcadeEvent' || data.action === 'purchaseShopProduct' || data.action === 'saveCustomMapNode' || data.action === 'deleteCustomMapNode') {
        pushSnapshot(true);
      }
    } catch (error) {
      event.source?.postMessage({
        ...reply,
        ok: false,
        error: error?.message || String(error),
      }, event.origin);
    }
  };

  /* 主体量自 geometry：dock 顶（花/耳 y≈54）到抽屉底（y=823），左右 23–1648。
     框按这块 1640×787 加宽并放大，不带整张 941 画布的上下空板。 */
  const BODY_W = 1640;
  const BODY_H = 787;
  const DESKTOP_MIN = 880;
  const HUD_WIDTH_VW = 90;
  /* Portrait breaks out of the reading column, but not to desktop 90vw.
     480 is a little past the portrait k ceiling (941 × 17/36 ≈ 444): the
     column stops growing and the extra is plate. 12px gutters keep a
     finger-width of tavern chrome on each side. */
  const PORTRAIT_WIDTH_MAX = 480;
  const PORTRAIT_GUTTER = 12;
  const MAX_VH = 0.78;
  const HUD_LIVE_ID = 'linjiang-hud-live';
  const HUD_STAGE_ID = 'linjiang-hud-stage';
  const HUD_FS_ID = 'linjiang-hud-fs';
  const HUD_SHRINK_ID = 'linjiang-hud-shrink';
  const HUD_FS_STYLE_ID = 'linjiang-hud-fs-style';
  const HUD_AUTOSCROLL_ID = 'linjiang-hud-autoscroll';
  let expanded = false;
  /* Persisted docking state. `compacted` is the current controller's local mirror,
     while manager.dockMode carries it across message/status-frame owner handovers and
     the HUD preference store carries it across full reloads. The shell cannot read the
     HUD origin's localStorage directly, so startup sync travels HUD -> shell and clicks
     on the top-right shrink button travel shell -> HUD. */
  let compacted = false;
  /* 这个会话的初始 compacted 由 HUD 的全局设置决定，但那个值存在 HUD origin 的
     localStorage 里，这边跨域读不到——只能等 HUD 开机后 postMessage 过来
     （bridge.js 的 reportDockDefault → 下面的 applyDockDefault）。

     于是有个先后问题：壳层排第一次版的时候还不知道用户的偏好，所以偏好到达时是一次
     "补正"，而不是初始值。两个标记就是为了让这次补正不越界：
       dockDefaultApplied —— 开机通报只认第一次。HUD 会因为横竖屏切换而重新加载并
         重新握手，那时候不该把用户中途的手动状态冲掉。
       shrinkTouched —— 用户只要手动点过一次缩小钮，本会话就完全不再听开机通报。
         手动操作盖过偏好，不是反过来。
     两个标记都不管 apply=true 的通报：那是用户正在设置页里改，必须当场生效。 */
  let dockDefaultApplied = false;
  let shrinkTouched = false;
  let uninstalled = false;
  let portraitPageOpen = false;
  /* 横向构图里 HUD 开了铺满视口的覆盖层（地图 / 街机 / CG）。见 bridge.js 的 reportOverlay：
     那两颗浮层钮住在酒馆顶层文档、层级压过 HUD 内部的一切，不收起来就挡着覆盖层自己的
     关闭钮。竖屏走的是 portraitPageOpen，那条路早就在做同一件事。 */
  let overlayOpen = false;
  let slotObserver = null;
  let frameObserver = null;
  let active = false;
  let destroyed = false;
  let controllerRecord = null;
  const isOwner = () => active && !destroyed && manager.owner?.id === INSTANCE_ID;

  const tavernWin = () => {
    try { if (window.top && window.top !== window) return window.top; } catch (e) {}
    try { if (window.parent && window.parent !== window) return window.parent; } catch (e) {}
    return window;
  };



  /* One controller per tavern page, one chat-scoped HUD runtime.  Message floors
     only register anchors; the manager elects the newest connected anchor and keeps
     the actual HUD iframe in the tavern document so a floor handover does not reload it. */
  const MANAGER_KEY = '__linjiangHudManagerV2';
  const MANAGER_VERSION = 3;
  const INSTANCE_ID = (globalThis.crypto?.randomUUID?.() || `hud-${Date.now()}-${Math.random()}`);

  const createManager = (host) => {
    const manager = {
      version: MANAGER_VERSION,
      host,
      sequence: 0,
      epoch: 1,
      chatKey: null,
      candidates: new Map(),
      owner: null,
      hudFrame: null,
      hudMode: '',
      /* Shared by every status-frame controller. The managed HUD survives floor
         re-renders, so its docking state must survive the owner handover too. */
      dockMode: null,
      electTick: 0,
      eventHooksBound: false,
      contextTimer: 0,
      context() { return { chatKey: this.chatKey, epoch: this.epoch }; },
      createHudFrame() {
        const frame = this.host.document.createElement('iframe');
        frame.title = '?????';
        frame.loading = 'eager';
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        frame.allow = 'clipboard-read; clipboard-write';
        frame.dataset.linjiangManaged = '1';
        /* TauriTavern mobile classifies unmarked fixed body children as host overlays.
           This iframe owns its own slot-following geometry, so host safe-area rules
           must leave its left/top/width/height untouched. */
        frame.dataset.ttMobileSurface = 'none';
        frame.addEventListener('load', () => {
          if (this.hudFrame === frame && this.hudMode) postHudMode(this.hudMode);
        });
        this.hudFrame = frame;
        this.hudMode = '';
        return frame;
      },
      ensureHudFrame() {
        return this.hudFrame || this.createHudFrame();
      },
      resetHudFrame() {
        try { this.hudFrame?.remove(); } catch (e) {}
        /* 裁剪台是挂在酒馆文档上的，不是 HUD 的子节点，所以拆 HUD 不会把它带走。
           留下来的话下一任 owner 会再建一个，酒馆 body 上就攒出一串空的 fixed 层。 */
        try { this.host.document.getElementById(HUD_STAGE_ID)?.remove(); } catch (e) {}
        this.hudFrame = null;
        this.hudMode = '';
      },
      messageRank(frame) {
        try {
          const mes = frame?.closest?.('.mes');
          const raw = mes?.getAttribute('mesid') ?? mes?.dataset?.mesid ?? mes?.dataset?.messageId;
          const value = Number(raw);
          if (Number.isFinite(value)) return value;
        } catch (e) {}
        return null;
      },
      register(controller) {
        const record = {
          ...controller,
          sequence: ++this.sequence,
          epoch: this.epoch,
          rank: this.messageRank(controller.frame),
        };
        this.candidates.set(record.id, record);
        if (this.owner && !this.owner.frame?.isConnected) {
          try { this.owner.deactivate('disconnected'); } catch (e) {}
          this.owner = null;
        }
        this.elect();
        return record;
      },
      unregister(id) {
        const record = this.candidates.get(id);
        if (!record) {
          if (this.owner?.id === id) this.owner = null;
          this.scheduleElect();
          return;
        }
        this.candidates.delete(id);
        if (this.owner?.id === id) {
          try { record.deactivate('removed'); } catch (e) {}
          this.owner = null;
        }
        this.scheduleElect();
      },
      scheduleElect() {
        if (this.electTick) return;
        this.electTick = this.host.requestAnimationFrame(() => {
          this.electTick = 0;
          this.elect();
        });
      },
      elect() {
        const rows = [...this.candidates.values()].filter((row) =>
          row.epoch === this.epoch && row.frame?.isConnected && !row.destroyed());
        rows.sort((a, b) => {
          if (a.rank != null || b.rank != null) return (a.rank ?? -Infinity) - (b.rank ?? -Infinity);
          try {
            if (a.frame.ownerDocument === b.frame.ownerDocument) {
              const pos = a.frame.compareDocumentPosition(b.frame);
              if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
              if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            }
          } catch (e) {}
          return a.sequence - b.sequence;
        });
        const next = rows.at(-1) || null;
        if (next?.id === this.owner?.id) return;
        const previous = this.owner;
        this.owner = next;
        try { previous?.deactivate('superseded'); } catch (e) {}
        if (next) {
          this.ensureHudFrame();
          try { next.activate(this.context()); } catch (e) { console.warn('[?????] ????', e); }
        } else if (this.hudFrame) {
          this.hudFrame.style.visibility = 'hidden';
          this.hudFrame.style.pointerEvents = 'none';
        }
      },
      switchContext(chatKey = null) {
        this.epoch += 1;
        this.chatKey = chatKey == null ? null : String(chatKey);
        const previous = this.owner;
        this.owner = null;
        try { previous?.deactivate('chat-switch'); } catch (e) {}
        this.resetHudFrame();
        clearTimeout(this.contextTimer);
        /* chatLoaded and the replacement status iframe are not ordered consistently.
           Adopt whichever registered anchors are still connected after the DOM burst;
           disconnected old-chat anchors are pruned by the same pass. */
        this.contextTimer = this.host.setTimeout(() => {
          for (const [id, row] of this.candidates) {
            if (!row.frame?.isConnected || row.destroyed()) this.candidates.delete(id);
            else row.epoch = this.epoch;
          }
          this.scheduleElect();
        }, 120);
      },
      bindEventHooks(core) {
        if (this.eventHooksBound) return;
        this.eventHooksBound = true;
        const chatKey = () => {
          try {
            const context = core?.SillyTavern?.getContext?.() || core?.getContext?.();
            return context?.chatId ?? context?.chat_id ?? context?.groupId ?? null;
          } catch (e) { return null; }
        };
        try {
          core?.eventSource?.on?.('mvu_data_updated', () => this.owner?.pushSnapshot(false));
          core?.eventSource?.on?.('chatUpdated', () => this.owner?.requestFollow());
          core?.eventSource?.on?.('chatLoaded', () => this.switchContext(chatKey()));
          core?.addEventListener?.('linjiang:opening-committed', () => this.owner?.pushSnapshot(true));
        } catch (e) {}
        try {
          if (typeof core?.eventOn === 'function' && core?.Mvu?.events?.VARIABLE_UPDATE_ENDED) {
            core.eventOn(core.Mvu.events.VARIABLE_UPDATE_ENDED, () => this.owner?.pushSnapshot(false));
          }
        } catch (e) {}
      },
    };
    return manager;
  };

  const managerHost = tavernWin();
  let manager = managerHost[MANAGER_KEY];
  if (!manager || manager.version !== MANAGER_VERSION) {
    try { manager?.resetHudFrame?.(); } catch (e) {}
    manager = createManager(managerHost);
    managerHost[MANAGER_KEY] = manager;
  }

  const tavernSize = () => {
    try {
      return {
        w: tavernWin().innerWidth || innerWidth,
        h: tavernWin().innerHeight || innerHeight,
      };
    } catch (e) {
      return { w: innerWidth, h: innerHeight };
    }
  };

  const isTauriTavernMobile = () => {
    try {
      const tavern = tavernWin();
      if (!tavern?.__TAURITAVERN__) return false;
      const nav = tavern.navigator;
      const ua = String(nav?.userAgent || '');
      if (/android|iphone|ipad|ipod/i.test(ua)) return true;
      return Number(nav?.maxTouchPoints || 0) > 0
        && !!tavern.matchMedia?.('(pointer: coarse)')?.matches;
    } catch (e) {
      return false;
    }
  };

  /* Phone / tablet held upright. Tauri WebViews can expose a CSS viewport wider
     than the screenshot/device pixels, so portrait orientation remains authoritative
     for a mobile runtime instead of relying only on the desktop width breakpoint. */
  const portraitHud = () => {
    const { w, h } = tavernSize();
    return w < h && (w < DESKTOP_MIN || isTauriTavernMobile());
  };

  const isDesktop = () => !portraitHud() && tavernSize().w >= DESKTOP_MIN;

  const anchorInReadingPane = (frame) => {
    if (!frame) return false;
    try {
      const tavern = tavernWin();
      const chat = tavern.document.getElementById('chat');
      if (!chat) return true;
      return frame.ownerDocument === tavern.document && chat.contains(frame);
    } catch (e) {
      return false;
    }
  };

  const isSafeOuterFrame = (frame) => {
    if (!frame) return false;
    /* TT auto/mobile-safe may move a JSR iframe into its 0x0 parking lot. The
       detached HUD must stop following it immediately; otherwise that parking
       rect is mistaken for a viewport/page anchor and the HUD covers the app. */
    if (isTauriTavernMobile() && !anchorInReadingPane(frame)) return false;
    try {
      const inner = frame.contentDocument;
      if (inner && inner.querySelector('.reading-content, #sheld, #chat')) return false;
    } catch (e) {}
    /* Phone chat is ~100vw and the portrait HUD is often >85vh, so the old
       size heuristic treated the status slot as the tavern shell and parked
       the HUD back inside a tall in-flow iframe.  That iframe then bled into
       the latest messages at the bottom of #chat. */
    try {
      if (frame.closest && frame.closest('#chat, .mes, .TH-render, .mes_block')) return true;
    } catch (e) {}
    const vw = tavernWin().innerWidth || 0;
    const vh = tavernWin().innerHeight || 0;
    if (vw && vh && frame.offsetWidth >= vw * 0.92 && frame.offsetHeight >= vh * 0.85) {
      return false;
    }
    return true;
  };

  const viewportPoint = (el) => {
    const tavern = tavernWin();
    const r = el.getBoundingClientRect();
    let x = r.left;
    let y = r.top;
    let win = el.ownerDocument.defaultView;
    while (win && win !== tavern) {
      const fe = win.frameElement;
      if (!fe) break;
      const fr = fe.getBoundingClientRect();
      x += fr.left;
      y += fr.top;
      win = win.parent;
    }
    return {
      left: x,
      top: y,
      width: r.width,
      height: r.height,
      vw: tavern.innerWidth,
      vh: tavern.innerHeight,
      win: tavern,
      doc: tavern.document,
    };
  };

  const parkHudInside = () => {
    if (hudFrame.parentNode !== document.body) {
      document.body.insertBefore(hudFrame, hint);
    }
    /* 回到本页里就没有裁剪台了，顺手拆掉，免得酒馆文档上留一个空的 fixed 层。 */
    removeHudStage();
    hudFrame.id = 'hud';
    hudFrame._linjiangCss = null;
    hudFrame._linjiangOffX = 0;
    hudFrame._linjiangOffY = 0;
    hudFrame.style.cssText = 'display:block;width:100%;height:100%;border:0;background:#05040a;';
  };

  const cleanupLeftovers = () => {
    const tavern = tavernWin();
    const doc = tavern.document;
    /* 全屏钮在 layout 里复用，不在每次重排时拆掉。 */
    const frame = window.frameElement;
    if (frame && (frame.parentNode === doc.body || frame.parentNode === doc.documentElement)) {
      const chat = doc.getElementById('chat');
      if (chat) chat.appendChild(frame);
    }
  };

  /* 原生嵌入下「楼层高度归谁」的交接。
     ==================================================================
     要交出去的其实是两样东西，缺一样都不行：

     一、楼层 iframe 上 setSpacer 写的那些 !important（尤其 height）。
         adjust_iframe_height.js 写的是不带 !important 的 frameElement.style.height，抢不过它。

     二、骨架里 html,body 的 `height:100%; overflow:hidden`。
         那让本文档的高度等于楼层 iframe 的高度 —— 于是 adjust_iframe_height 量到的
         body.scrollHeight 就是它自己刚写的值，自我循环，永远锁在旧数字上。
         实测竖屏锁在 841px（页面态留下的），而 HUD 只有 780px。原生嵌入要的是内容决定高度。

     交接必须是**一次性**的。第一版在每次重排里都撤一遍占位，等于每帧删掉酒馆助手刚写的高度，
     它再写、我再删 —— 真机上就是「疯狂闪烁」。 */
  let inlineDockHandedOver = false;
  let savedDocStyle = null;

  const handOverHeight = (frame) => {
    if (inlineDockHandedOver) return;
    inlineDockHandedOver = true;
    if (savedDocStyle == null) {
      savedDocStyle = {
        html: document.documentElement.getAttribute('style'),
        body: document.body.getAttribute('style'),
      };
    }
    clearSpacer(frame);
    const free = (el) => {
      ['height', 'min-height', 'max-height'].forEach((p) => el.style.setProperty(p, 'auto', 'important'));
      el.style.setProperty('overflow', 'visible', 'important');
    };
    free(document.documentElement);
    free(document.body);
  };

  const takeBackHeight = () => {
    if (!inlineDockHandedOver) return;
    inlineDockHandedOver = false;
    if (!savedDocStyle) return;
    const restore = (el, value) => {
      if (value == null) el.removeAttribute('style');
      else el.setAttribute('style', value);
    };
    restore(document.documentElement, savedDocStyle.html);
    restore(document.body, savedDocStyle.body);
    savedDocStyle = null;
  };

  const setSpacer = (frame, height) => {
    if (!isSafeOuterFrame(frame)) return;
    /* 走到 setSpacer 就说明当前排版是壳层拥有高度的那一类，把交出去的东西收回来。 */
    takeBackHeight();
    frame.setAttribute('scrolling', 'no');
    const apply = (prop, value) => frame.style.setProperty(prop, value, 'important');
    apply('position', 'relative');
    apply('transform', 'none');
    apply('width', '100%');
    apply('height', `${Math.round(height)}px`);
    apply('max-width', 'none');
    apply('margin', '0');
    apply('border', '0');
    apply('display', 'block');
    apply('visibility', 'visible');
    apply('opacity', '0');
    apply('pointer-events', 'none');
    apply('overflow', 'hidden');
    apply('left', 'auto');
    apply('top', 'auto');
    apply('z-index', 'auto');
    apply('background', 'transparent');
  };

  /* setSpacer 的反操作。原生嵌入时楼层 iframe 不再是透明占位，而是**真正装着 HUD 的容器**，
     所以那些 !important 覆盖必须全部撤掉，让酒馆助手的 adjust_iframe_height 重新按内容量它。
     dataset.linjiangH 也要清掉，否则切回生产路径时会以为占位高度没变而跳过 setSpacer。 */
  const SPACER_PROPS = ['position', 'transform', 'width', 'height', 'max-width', 'margin',
    'border', 'display', 'visibility', 'opacity', 'pointer-events', 'overflow',
    'left', 'top', 'z-index', 'background'];
  const clearSpacer = (frame) => {
    if (!frame) return;
    SPACER_PROPS.forEach((prop) => { try { frame.style.removeProperty(prop); } catch (e) {} });
    try { frame.removeAttribute('scrolling'); } catch (e) {}
    try { delete frame.dataset.linjiangH; } catch (e) {}
  };

  const FS_SIZE = 36;
  const FS_GAP = 8;
  /* Directly above dock close (1602,96,d=30). 12px gap; 36px circle sits on the
     body crop's top edge (y 48) so it is not clipped. */
  const FS_CANVAS_X = 1617;
  const FS_CANVAS_Y = 66;
  const FS_ICON_EXPAND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H4v4M16 3h4v4M8 21H4v-4M16 21h4v-4"/></svg>';
  const FS_ICON_RESTORE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v4H4M16 3v4h4M8 21v-4H4M16 21v-4h4"/></svg>';
  const SHRINK_ICON_IN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
  const SHRINK_ICON_OUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
  const FS_CSS = [
    '#' + HUD_FS_ID + ',#' + HUD_SHRINK_ID + '{',
    'position:fixed;left:0;top:0;width:' + FS_SIZE + 'px;height:' + FS_SIZE + 'px;padding:0;',
    'display:grid;place-items:center;',
    'border:1px solid rgba(232,236,255,.55);border-radius:50%;',
    'background:rgba(24,30,62,.82);',
    'color:rgba(255,255,255,.94);cursor:pointer;pointer-events:auto;user-select:none;',
    'backdrop-filter:blur(14px) saturate(1.2);-webkit-backdrop-filter:blur(14px) saturate(1.2);',
    'box-shadow:0 6px 16px rgba(7,8,27,.38),inset 0 1px 0 rgba(255,255,255,.28);',
    'will-change:transform;',
    '}',
    '#' + HUD_FS_ID + ' svg,#' + HUD_SHRINK_ID + ' svg{display:block;width:18px;height:18px;margin:0;}',
    '#' + HUD_FS_ID + ':hover,#' + HUD_SHRINK_ID + ':hover{border-color:rgba(255,255,255,.82);background:rgba(48,58,110,.9);',
    'color:#fff;filter:drop-shadow(0 0 8px rgba(255,210,240,.4));}',
  ].join('');

  const syncFsButton = (btn) => {
    if (!btn) return;
    btn.innerHTML = expanded ? FS_ICON_RESTORE : FS_ICON_EXPAND;
    btn.setAttribute('aria-pressed', expanded ? 'true' : 'false');
    btn.setAttribute('aria-label', expanded ? '还原' : '全屏');
    btn.title = expanded ? '还原' : '全屏';
  };

  const syncShrinkButton = (btn) => {
    if (!btn) return;
    btn.innerHTML = compacted ? SHRINK_ICON_OUT : SHRINK_ICON_IN;
    btn.setAttribute('aria-pressed', compacted ? 'true' : 'false');
    btn.setAttribute('aria-label', compacted ? '展开到页面' : '收回嵌入框');
    btn.title = compacted ? '展开到页面' : '收回嵌入框';
  };

  const chromeBtn = (id) => {
    try { return tavernWin().document.getElementById(id); } catch (e) { return null; }
  };

  const hideChromeButtons = () => {
    [HUD_FS_ID, HUD_SHRINK_ID].forEach((id) => {
      const btn = chromeBtn(id);
      if (btn) btn.style.visibility = 'hidden';
    });
  };

  const hudScreenRect = () => {
    const tavern = tavernWin();
    const r = hudFrame.getBoundingClientRect();
    let left = r.left;
    let top = r.top;
    let win = hudFrame.ownerDocument.defaultView;
    while (win && win !== tavern) {
      const fe = win.frameElement;
      if (!fe) break;
      const fr = fe.getBoundingClientRect();
      left += fr.left;
      top += fr.top;
      win = win.parent;
    }
    return { left, top, width: r.width, height: r.height };
  };

  const placeFsButton = () => {
    /* 覆盖层期间一律收起：placeFsButton 的调用点很多（重排、跟随滚动、补正），
       在这里挡一次比在每个调用点各判一次可靠。 */
    if (overlayOpen) { hideChromeButtons(); return; }
    const tavern = tavernWin();
    const btn = tavern.document.getElementById(HUD_FS_ID);
    if (!btn || !hudFrame || !hudFrame.parentNode) return;
    const box = hudScreenRect();
    if (!box.width || !box.height) return;
    const k = Math.min(box.width / BODY_W, box.height / BODY_H);
    const drawW = BODY_W * k;
    const drawH = BODY_H * k;
    const ox = box.left + (box.width - drawW) / 2;
    const oy = box.top + (box.height - drawH) / 2;
    const x = ox + (FS_CANVAS_X - 16) * k - FS_SIZE / 2;
    const y = oy + (FS_CANVAS_Y - 48) * k - FS_SIZE / 2;
    const z = expanded ? '2147483646' : '50';
    btn.style.zIndex = z;
    btn.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    btn.style.visibility = 'visible';
    const shrink = tavern.document.getElementById(HUD_SHRINK_ID);
    if (shrink) {
      shrink.style.zIndex = z;
      shrink.style.transform = 'translate3d(' + (x - FS_SIZE - FS_GAP) + 'px,' + y + 'px,0)';
      shrink.style.visibility = 'visible';
    }
  };

  const onFsClick = (event) => {
    if (!isOwner()) return;
    try { event.preventDefault(); event.stopPropagation(); } catch (e) {}
    if (uninstalled) return;
    expanded = !expanded;
    if (expanded) compacted = false;
    const tavern = tavernWin();
    try { syncFsButton(tavern.document.getElementById(HUD_FS_ID)); } catch (e) {}
    try { syncShrinkButton(tavern.document.getElementById(HUD_SHRINK_ID)); } catch (e) {}
    fitParentFrame();
  };

  const collapseHud = () => {
    if (!isOwner()) return false;
    if (!expanded) return true;
    expanded = false;
    const tavern = tavernWin();
    try { syncFsButton(tavern.document.getElementById(HUD_FS_ID)); } catch (e) {}
    try { syncShrinkButton(tavern.document.getElementById(HUD_SHRINK_ID)); } catch (e) {}
    fitParentFrame();
    return true;
  };

  const onShrinkClick = (event) => {
    if (!isOwner()) return;
    try { event.preventDefault(); event.stopPropagation(); } catch (e) {}
    if (uninstalled) return;
    /* 手动切过之后，本会话不再接受 HUD 的开机默认值。 */
    shrinkTouched = true;
    compacted = !compacted;
    if (compacted) expanded = false;
    const mode = compacted ? 'embedded' : 'page';
    manager.dockMode = mode;
    /* This button and the settings row are two views of one persisted value. */
    postToHud({
      channel: CHANNEL,
      kind: 'event',
      type: 'dockState',
      context: manager.context(),
      payload: { mode },
    });
    const tavern = tavernWin();
    try { syncFsButton(tavern.document.getElementById(HUD_FS_ID)); } catch (e) {}
    try { syncShrinkButton(tavern.document.getElementById(HUD_SHRINK_ID)); } catch (e) {}
    fitParentFrame();
  };

  /* Apply the persisted docking state reported by the HUD settings store. `apply`
     means the user just changed the settings row and therefore overrides the current
     layout immediately; the startup report is accepted once unless the top-right button
     was already used in this controller. */
  const applyDockDefault = (payload) => {
    if (uninstalled) return;
    const embedded = payload?.mode === 'embedded';
    const mode = embedded ? 'embedded' : 'page';
    const forced = !!payload?.apply;
    if (!forced) {
      if (dockDefaultApplied || shrinkTouched) return;
      dockDefaultApplied = true;
    }
    /* Save before the equality return: a newly elected controller may already have
       the right local boolean but the shared manager still needs the source of truth. */
    manager.dockMode = mode;
    if (compacted === embedded) return;
    compacted = embedded;
    if (compacted) expanded = false;
    const tavern = tavernWin();
    try { syncFsButton(tavern.document.getElementById(HUD_FS_ID)); } catch (e) {}
    try { syncShrinkButton(tavern.document.getElementById(HUD_SHRINK_ID)); } catch (e) {}
    fitParentFrame();
  };

  const mountChromeButton = (id, onClick) => {
    const doc = tavernWin().document;
    let btn = doc.getElementById(id);
    if (btn && (btn.dataset.linjiangOwner !== INSTANCE_ID || !btn.querySelector('svg'))) {
      btn.remove();
      btn = null;
    }
    if (!btn) {
      btn = doc.createElement('button');
      btn.id = id;
      btn.type = 'button';
      btn.dataset.linjiangOwner = INSTANCE_ID;
      btn.dataset.ttMobileSurface = 'none';
      btn.style.visibility = 'hidden';
      doc.body.appendChild(btn);
      listen(btn, 'click', onClick);
    }
    /* Also repair buttons retained by the current controller. */
    btn.dataset.ttMobileSurface = 'none';
    return btn;
  };

  const ensureFsChrome = () => {
    const doc = tavernWin().document;
    if (!doc || !doc.body) return;
    let style = doc.getElementById(HUD_FS_STYLE_ID);
    if (!style) {
      style = doc.createElement('style');
      style.id = HUD_FS_STYLE_ID;
      style.dataset.linjiangOwner = INSTANCE_ID;
      (doc.head || doc.documentElement).appendChild(style);
    }
    style.textContent = FS_CSS;
    syncFsButton(mountChromeButton(HUD_FS_ID, onFsClick));
    syncShrinkButton(mountChromeButton(HUD_SHRINK_ID, onShrinkClick));
  };

  /* 铺满视口的两种情形（全屏、竖屏整页）。裁剪台跟着铺满，HUD 归位到 (0,0)：整页时
     HUD 自己要能滚，所以这里不提升合成层。 */
  const paintHudFill = (vw, vh) => {
    hudFrame.id = HUD_LIVE_ID;
    const stage = hudFrame._linjiangStage;
    if (stage) setStageBox(stage, 0, vh, vw, 2147483000);
    hudFrame._linjiangOffX = 0;
    hudFrame._linjiangOffY = 0;
    hudFrame._linjiangCss = null;
    hudFrame.style.cssText = [
      'position:absolute',
      'left:0',
      'top:0',
      'transform:none',
      `width:${vw}px`,
      `height:${vh}px`,
      'max-width:none',
      'margin:0',
      'border:0',
      'display:block',
      'background:#05040a',
      'pointer-events:auto',
      'overflow:auto',
      'will-change:auto',
    ].join(';');
    hudFrame.setAttribute('scrolling', 'yes');
    hudFrame._linjiangBox = { width: vw, height: vh };
  };

  const layoutExpanded = () => {
    const tavern = tavernWin();
    const doc = tavern.document;
    const vw = tavern.innerWidth || innerWidth;
    const vh = tavern.innerHeight || innerHeight;
    cleanupLeftovers();
    const frame = window.frameElement;
    if (isSafeOuterFrame(frame)) {
      const box = hudBox(vw, vh);
      if (frame.dataset.linjiangH !== String(box.height)) {
        setSpacer(frame, box.height);
        frame.dataset.linjiangH = String(box.height);
      }
    }
    mountHud(doc);
    paintHudFill(vw, vh);
    placeFsButton();
  };

  const layoutCompact = () => {
    const frame = window.frameElement;
    if (!frame || !isSafeOuterFrame(frame)) return;
    cleanupLeftovers();
    const view = viewportPoint(frame);
    const width = Math.max(120, Math.round(view.width || frame.getBoundingClientRect().width || 0));
    const height = Math.min(Math.round(width * BODY_H / BODY_W), Math.round(view.vh * MAX_VH));
    const box = { width, height };
    if (frame.dataset.linjiangH !== String(height)) {
      setSpacer(frame, height);
      frame.dataset.linjiangH = String(height);
    }
    const after = viewportPoint(frame);
    mountHud(after.doc);
    paintHud(box);
    hudFrame._linjiangAlign = 'slot';
    hudFrame._linjiangBox = box;
    moveHud(after, box);
    placeFsButton();
  };

  const hudBox = (vw, vh) => {
    let width = Math.min(Math.round(vw * HUD_WIDTH_VW / 100), vw - 40);
    let height = Math.round(width * BODY_H / BODY_W);
    const maxH = Math.round(vh * MAX_VH);
    if (height > maxH) {
      height = maxH;
      width = Math.round(height * BODY_W / BODY_H);
    }
    return { width, height };
  };

  /* Wider than the reading slot when the slot is a phone-narrow column;
     if the slot is already past PORTRAIT_WIDTH_MAX, only bleed 24px.
     Height is the column's own content, reported by the HUD — never a
     viewport fraction, or the iframe grows a nested scrollbar. */
  const portraitHudBox = (vw, vh, readingW) => {
    const maxW = Math.max(280, vw - PORTRAIT_GUTTER * 2);
    const width = readingW >= PORTRAIT_WIDTH_MAX
      ? Math.min(maxW, readingW + 24)
      : Math.min(maxW, PORTRAIT_WIDTH_MAX);
    const reported = Math.round(hudFrame._portraitRestH || 0);
    const height = reported > 1
      ? reported
      : Math.max(360, Math.round(width * 0.9));
    return { width: Math.round(width), height };
  };

  const readingPane = () => {
    try {
      const doc = tavernWin().document;
      return doc.getElementById('chat') || doc.getElementById('sheld') || null;
    } catch (e) {
      return null;
    }
  };

  /* 裁剪台。
     ==================================================================
     被抬起的 HUD 是 position:fixed，透明占位留在消息流里，所以每次宿主滚动都要把它搬到
     新位置，并且把露出阅读区上下沿的那部分裁掉。这两件事以前都直接做在 iframe 上：写
     left/top 挪，写 clip-path 裁。代价是每帧都要把整块玻璃重新光栅一遍 —— 390×844 的
     手机上一段一秒的手势要 450ms 光栅、300 多个光栅任务；把 HUD 内容换成一块纯色则只剩
     15ms，也就是说钱全花在「重画玻璃」上，而不是「移动」上。

     现在把两件事分开：

       裁剪台  position:fixed，钉在阅读区上，overflow:hidden，pointer-events:none。
               它的几何只在阅读区自己变化时才写（旋转、软键盘、栏宽变化），滚动时不动。
       HUD     裁剪台里的 position:absolute 元素，只用 transform: translate3d 平移，
               并且 will-change:transform 提升为合成层。

     于是逐帧变化的只剩一个 transform，合成器可以整块搬运已经光栅好的纹理。实测同一段手势
     447ms → 87ms 光栅，主线程 Paint 从每帧一次（~80ms / 80 次）降到 8 次。

     两点都是必要条件，缺一个就没有收益：只改 transform 不提升，层照样要重画（489ms）；
     提升了但 clip-path 仍逐帧改，反而更慢（527ms）—— 改 clip-path 会让合成器丢掉层缓存。

     原注释担心「transform 会晚一帧合成，出现可见的一格跳动」。transform 是在 scroll 事件
     和 rAF 里同步写的，和 left/top 落在同一个样式轮次；实测 180 多帧里 HUD 顶边与栏位顶边
     的错位始终是 0px。注意这是主线程读数，读不到合成器实际呈现的位置，真机仍值得肉眼确认。 */
  const ensureHudStage = (doc) => {
    let stage = hudFrame._linjiangStage;
    if (stage && stage.isConnected && stage.ownerDocument === doc) return stage;
    stage = doc.getElementById(HUD_STAGE_ID);
    if (!stage) {
      stage = doc.createElement('div');
      stage.id = HUD_STAGE_ID;
      /* TauriTavern 会把 body 下未标记的 fixed 子元素当成宿主浮层接管几何。裁剪台是
         pointer-events:none，本来就不会被它的 classifySurface 选中，但显式声明一次，
         免得将来判定规则变化。见 mobile-overlay-surface-admission.js。 */
      stage.dataset.ttMobileSurface = 'none';
    }
    if (stage.parentNode !== doc.body) doc.body.appendChild(stage);
    hudFrame._linjiangStage = stage;
    return stage;
  };

  /** 把 HUD 挂进 doc 的裁剪台，返回裁剪台。 */
  const mountHud = (doc) => {
    const stage = ensureHudStage(doc);
    if (hudFrame.parentNode !== stage) stage.appendChild(hudFrame);
    return stage;
  };

  /** HUD 是否已经挂在酒馆文档的裁剪台里。 */
  const hudMounted = () => {
    const stage = hudFrame._linjiangStage;
    return !!stage && stage.isConnected && hudFrame.parentNode === stage;
  };

  /* 只在真的变了才写：写同样的值也会触发样式失效，而这里是滚动路径上的热点。 */
  const setStageBox = (stage, top, height, width, zIndex) => {
    const next = `${Math.round(top)}|${Math.round(height)}|${Math.round(width)}|${zIndex}`;
    if (stage._linjiangGeom === next) return;
    stage._linjiangGeom = next;
    stage.style.cssText = [
      'position:fixed',
      'left:0',
      `top:${Math.round(top)}px`,
      `width:${Math.round(width)}px`,
      `height:${Math.round(height)}px`,
      'margin:0',
      'padding:0',
      'border:0',
      'overflow:hidden',
      'pointer-events:none',
      'background:transparent',
      `z-index:${zIndex}`,
    ].join(';');
  };

  /** HUD 在裁剪台内的位移。逐帧只走这一条。 */
  const setHudOffset = (x, y) => {
    const nx = Math.round(x);
    const ny = Math.round(y);
    if (hudFrame._linjiangOffX === nx && hudFrame._linjiangOffY === ny) return;
    hudFrame._linjiangOffX = nx;
    hudFrame._linjiangOffY = ny;
    hudFrame.style.transform = `translate3d(${nx}px,${ny}px,0)`;
  };

  const removeHudStage = () => {
    const stage = hudFrame?._linjiangStage;
    try { stage?.remove(); } catch (e) {}
    if (hudFrame) hudFrame._linjiangStage = null;
  };

  /* Mirror an ordinary in-flow iframe: keep every part whose spacer still intersects
     #chat, and hide it only once it has left the reading pane entirely. Hiding as soon
     as the slot's top 32px left the pane made the whole HUD vanish after one small
     wheel/touch scroll while its blank spacer remained, which was especially
     destructive on portrait phones.

     裁剪本身已经交给裁剪台，这里只管「整块看不见时收起来」，不再写 clip-path。 */
  const applySlotVisibility = (view, box, paneRect = null) => {
    if (expanded || portraitPageOpen || hudFrame._linjiangAlign === 'page') {
      hudFrame.style.visibility = 'visible';
      hudFrame.style.pointerEvents = 'auto';
      return;
    }
    const rr = paneRect || (() => {
      const pane = readingPane();
      return pane ? pane.getBoundingClientRect() : {
        left: 0, top: 0, right: view.vw, bottom: view.vh,
      };
    })();
    const hudBottom = view.top + box.height;
    const visibleTop = Math.max(view.top, rr.top);
    const visibleBottom = Math.min(hudBottom, rr.bottom);
    const intersects = visibleBottom - visibleTop > 1;
    if (!intersects) {
      hudFrame.style.visibility = 'hidden';
      hudFrame.style.pointerEvents = 'none';
      try { hideChromeButtons(); } catch (e) {}
      return;
    }
    hudFrame.style.visibility = 'visible';
    hudFrame.style.pointerEvents = 'auto';
  };

  /** 当前该用的裁剪窗口，酒馆视口坐标。 */
  const clipWindow = (view, paneRect = null) => {
    if (expanded || portraitPageOpen || hudFrame._linjiangAlign === 'page') {
      return { top: 0, bottom: view.vh };
    }
    const rr = paneRect || (() => {
      const pane = readingPane();
      return pane ? pane.getBoundingClientRect() : null;
    })();
    if (!rr) return { top: 0, bottom: view.vh };
    return { top: rr.top, bottom: rr.bottom };
  };

  const moveHud = (view, box, paneRect = null) => {
    const align = hudFrame._linjiangAlign || 'window';
    let x = (view.vw - box.width) / 2;
    if (align === 'slot') {
      const slotW = view.width || 0;
      x = view.left + (slotW - box.width) / 2;
      const minX = PORTRAIT_GUTTER;
      const maxX = view.vw - box.width - PORTRAIT_GUTTER;
      if (maxX >= minX) x = Math.max(minX, Math.min(x, maxX));
    }
    const stage = hudFrame._linjiangStage;
    if (stage) {
      const clip = clipWindow(view, paneRect);
      setStageBox(stage, clip.top, Math.max(0, clip.bottom - clip.top), view.vw, 40);
      setHudOffset(x, view.top - clip.top);
    }
    applySlotVisibility(view, box, paneRect);
    if (align === 'slot') {
      try { hideChromeButtons(); } catch (e) {}
    } else if (hudFrame.style.visibility !== 'hidden') {
      placeFsButton();
    }
  };

  /* HUD 在裁剪台里是 absolute，位置全部由 transform 给。两套构图都提升为合成层：竖屏
     原来刻意不提升，怕把一块 480×78vh 的 backdrop-filter 纹理留一整场；但不提升的代价是
     每帧重新光栅整块玻璃（447ms vs 87ms），而那块纹理本来每帧都在重新生成，常驻一份反而
     更省。TauriTavern 移动端另外走 data-hud-performance=low，那边根本没有 backdrop 纹理。 */
  const paintHud = (box) => {
    hudFrame.id = HUD_LIVE_ID;
    const cssText = [
      'position:absolute',
      'left:0',
      'top:0',
      `width:${box.width}px`,
      `height:${box.height}px`,
      'max-width:none',
      'margin:0',
      'border:0',
      'display:block',
      'background:#05040a',
      'pointer-events:auto',
      'overflow:hidden',
      'will-change:transform',
      `transform:translate3d(${hudFrame._linjiangOffX || 0}px,${hudFrame._linjiangOffY || 0}px,0)`,
    ].join(';');
    /* 每次重排都会调到这里；尺寸没变就别重写 cssText，否则等于把 transform 抹掉再设回去，
       白白多一次样式失效。 */
    if (hudFrame._linjiangCss !== cssText) {
      hudFrame._linjiangCss = cssText;
      hudFrame.style.cssText = cssText;
    }
    hudFrame.setAttribute('scrolling', 'no');
  };

  const layoutDesktop = () => {
    const frame = window.frameElement;
    if (!frame) return;
    cleanupLeftovers();
    const view = viewportPoint(frame);
    const box = hudBox(view.vw, view.vh);
    if (frame.dataset.linjiangH !== String(box.height)) {
      setSpacer(frame, box.height);
      frame.dataset.linjiangH = String(box.height);
    }
    const after = viewportPoint(frame);
    mountHud(after.doc);
    paintHud(box);
    hudFrame._linjiangAlign = 'window';
    moveHud(after, box);
    hudFrame._linjiangBox = box;
    placeFsButton();
  };

  const followHud = () => {
    if (expanded || portraitPageOpen) return;
    const frame = window.frameElement;
    if (isTauriTavernMobile() && !anchorInReadingPane(frame)) {
      hudFrame.style.visibility = 'hidden';
      hudFrame.style.pointerEvents = 'none';
      try { hideChromeButtons(); } catch (e) {}
      return;
    }
    const box = hudFrame._linjiangBox;
    /* 原生嵌入没有裁剪台，hudMounted() 本来就会是 false，但把判断写在前面更直白：
       这条路径下 HUD 是普通流内元素，滚动跟随是浏览器的事，这里一步都不该做。 */
    if (hudFrame._linjiangAlign === 'inline') return;
    if (!frame || !box || !hudMounted()) return;
    if (hudFrame._linjiangAlign === 'page') return;
    /* compacted 以前在这里单独走一条分支，只挪角上那两颗钮就 return 了 —— 于是收回
       嵌入框之后 HUD 再也不跟着栏位走：它是 position:fixed 的，不 moveHud 就等于钉死
       在屏幕上，滚动时脱离原位，而且 applySlotVisibility 不再重跑，连"滚出阅读区就
       该藏起来"的裁剪也停了，所以会一直盖在别的界面上。

       compacted 和竖屏/手机是同一种排版（align 'slot'，浮层跟着栏位走），本来就该走
       同一条跟随路径，唯一的差别在下面那三行。 */
    const view = viewportPoint(frame);
    const pane = readingPane();
    const paneRect = pane ? pane.getBoundingClientRect() : null;
    moveHud(view, box, paneRect);
    /* moveHud 对 align 'slot' 一律收掉全屏/缩小钮 —— 竖屏用不到它们。但"收回嵌入框"
       恰恰必须留着缩小钮，否则没有任何入口能再展开回去。所以这里补放一次，
       并且只在 applySlotVisibility 判定 HUD 还看得见时补：滚出阅读区时保持藏起来。 */
    if (compacted && hudFrame.style.visibility !== 'hidden') placeFsButton();
  };

  const layoutPortraitCompact = () => {
    const frame = window.frameElement;
    if (!frame || !isSafeOuterFrame(frame)) return;
    cleanupLeftovers();
    const view = viewportPoint(frame);
    const width = Math.max(120, Math.round(view.width || frame.getBoundingClientRect().width || 0));
    const reported = Math.round(hudFrame._portraitRestH || 0);
    const height = reported > 1 ? reported : Math.max(360, Math.round(width * 0.9));
    const box = { width, height };
    if (frame.dataset.linjiangH !== String(height)) {
      setSpacer(frame, height);
      frame.dataset.linjiangH = String(height);
    }
    const after = viewportPoint(frame);
    mountHud(after.doc);
    paintHud(box);
    hudFrame._linjiangAlign = 'slot';
    moveHud(after, box);
    hudFrame._linjiangBox = box;
    try { hideChromeButtons(); } catch (e) {}
  };

  /* 收回态的原生嵌入（只在 INLINE_DOCK 打开时走到）。
     ==================================================================
     它替代的是 layoutCompact 和 layoutPortraitCompact。那两支做的是：把楼层 iframe 变成透明占位、
     把 HUD 抬进酒馆 body 上的裁剪台、paintHud 提升合成层、再 moveHud 逐帧跟随。
     这一支反过来 —— 什么都不做，把活儿还给酒馆：

       · removeHudStage()      拆掉裁剪台
       · 把 HUD 挂进**本楼层的文档**，position:static、宽 100%
       · clearSpacer()         撤掉楼层 iframe 上的占位覆盖，让 adjust_iframe_height 按内容量它
       · 不 moveHud、不 applySlotVisibility、不写 clip-path、不提升合成层

     高度是唯一还要算的东西，而且用的是跟生产同一个来源：竖屏取 HUD 自报的 _portraitRestH
     （HUD 的 reportPortraitSize），横屏按 BODY_H/BODY_W 的宽高比。 */
  const layoutInlineDock = () => {
    const frame = window.frameElement;
    if (!frame) return;
    removeHudStage();
    if (hudFrame.parentNode !== document.body) document.body.appendChild(hudFrame);
    /* 从整页状态退回来时先还原楼层 iframe，否则它还钉在满视口上。 */
    leaveInlineDockPage(frame);

    /* 楼层 iframe 的高度在原生嵌入下**归酒馆助手**，壳层必须彻底放手。
       ------------------------------------------------------------------
       JS-Slash-Runner/src/iframe/adjust_iframe_height.js 跑在本文档里，由 body 上的
       ResizeObserver 驱动，直接写 frameElement.style.height = body.scrollHeight。

       所以占位覆盖只能在**进入**这个状态时撤一次。第一版在每次重排里都调 clearSpacer，
       而它含 removeProperty('height') —— 于是每帧把酒馆助手刚写的高度删掉，它再写、我再删，
       在真机上就是「疯狂闪烁」。夹具当时也露出了症状（楼层停在 150px 而 HUD 是 780px），
       那是这场抢夺停在了「删掉之后 body 尺寸没再变、ResizeObserver 不再触发」的那一帧，
       我没认出来。

       交接的两样东西和它的一次性要求，都写在 handOverHeight 上面那段。 */
    handOverHeight(frame);

    const width = Math.max(120, Math.round(
      document.documentElement.clientWidth || frame.getBoundingClientRect().width || 0,
    ));
    const reported = Math.round(hudFrame._portraitRestH || 0);
    const height = portraitHud()
      ? (reported > 1 ? reported : Math.max(360, Math.round(width * 0.9)))
      : Math.round(width * BODY_H / BODY_W);

    hudFrame.id = HUD_LIVE_ID;
    /* 刻意不带 position / transform / will-change / clip-path —— 那些正是这一支要证明可以不要的。 */
    const cssText = [
      'position:static',
      'width:100%',
      `height:${height}px`,
      'max-width:none',
      'margin:0',
      'border:0',
      'display:block',
      'background:#05040a',
      'pointer-events:auto',
      'visibility:visible',
      'overflow:hidden',
    ].join(';');
    if (hudFrame._linjiangCss !== cssText) {
      hudFrame._linjiangCss = cssText;
      hudFrame.style.cssText = cssText;
    }
    hudFrame.setAttribute('scrolling', 'no');
    hudFrame._linjiangAlign = 'inline';
    hudFrame._linjiangBox = { width, height };
    hudFrame._linjiangOffX = 0;
    hudFrame._linjiangOffY = 0;
    /* 那两颗角钮是注入酒馆顶层文档、按抬起后的 HUD 位置摆的，原生嵌入下没有对应位置。 */
    try { hideChromeButtons(); } catch (e) {}
  };

  /* 原生嵌入下的「整页」状态（次级页面 / 全屏）。
     ==================================================================
     为什么不能直接复用 layoutPortraitPage / layoutExpanded：它们靠 mountHud() 把 HUD 挪到酒馆
     文档上再铺满视口，而**挪动必重载**。重载会把 HUD 内部刚打开的那一页丢掉，于是点「日程」
     「档案」这类按钮的结果是整个面板被全屏化、而不是那一页被打开 —— 真机上就是这个症状。

     所以这里达成的是同一个状态（HUD 铺满视口），但换用这个模式下唯一可行的手段：HUD 一步不动，
     改让**楼层 iframe** 铺满视口。楼层 iframe 在酒馆文档里，本文件与酒馆同源，改它的样式是允许的。
     这不是新增交互，也没有新按钮 —— 触发它的仍然是 HUD 自己那两条通报（portraitPage / 全屏）。 */
  let inlinePageOn = false;
  let savedFloorStyle = null;

  /* 让楼层 iframe 的 position:fixed 真的锚到视口。
     ==================================================================
     这是「点日程/档案，整个面板消失」的根因，而且只在带模糊的主题上出现。

     position:fixed 默认锚视口，但只要有祖先带 transform / filter / backdrop-filter /
     perspective / will-change / contain 之类，那个祖先就成了 fixed 后代的**包含块**，
     fixed 于是退化成「相对该祖先的绝对定位」，跟着它的滚动走、并被它的 overflow 裁掉。

     实测（scripts/_probe-fixed-cb.mjs 的受控实验，真实 ST 样式 + 真实 TT 模块）：
     SillyTavern 自己的 #chat 带 backdrop-filter: blur(13px)，而楼层 iframe 就在 #chat 里。
     于是把楼层设成 fixed;top:0;left:0 之后，它的 rect.top 等于 -chat.scrollTop：

         chat.scrollTop  178 →  楼层 top  -96   视口内可见 259074 px²
         chat.scrollTop  328 →  楼层 top -246   视口内可见 200724 px²
         chat.scrollTop  628 →  楼层 top -546   视口内可见  84024 px²
         chat.scrollTop 1117 →  楼层 top -1035  视口内可见      0 px²   ← 面板消失

     同一时刻只把 #chat 的 backdrop-filter 去掉，楼层立刻回到 top:0、可见 329160 px²
     （整个视口）。单变量、效果即时且彻底，所以因果是定的。
     Dark Lite 这种 no-blur 主题的 #chat 没有 backdrop-filter，所以它一直是好的 ——
     这也是为什么这个 bug 看起来时好时坏。

     引导壳不受影响：它从不把楼层设成 fixed，而是把 HUD 抬到酒馆 body 下（#chat 之外）。

     能逃出 #chat 的只有两条路：成为 body 的子节点，或者真正锚住视口。前者要挪 iframe，
     而**挪动必重载**（已实测：同文档换父 1→2 次加载、跨文档 2→3），重载会丢掉 HUD 刚打开
     的那一页 —— 那正是这一支存在的原因。所以只剩后者：把这条链上建立包含块的属性临时中和掉。

     只在整页期间中和，退出时按原样精确还原（连 !important 优先级一起存）。整页把视口盖满了，
     所以这期间 #chat 少一层模糊在视觉上看不见。 */
  /* 第二件事：光锚住视口还不够，酒馆自己的 chrome 还压在整页上面。
     ------------------------------------------------------------------
     命中测试（整页开着，视口坐标）：
         (195,70)  → div#top-bar      顶栏，z-index 3005
         (195,830) → div#form_sheld   底部输入栏，z-index 31
     上下各有一条被盖住且不可点，而次级页面的返回钮就在顶上那条里 —— 页面关不掉。

     为什么不能靠 z-index 解决：楼层 iframe 在 #chat 里，而 #chat 是
     position:static（z-index 对 static 无效），所以整个 #chat 子树在 #sheld 内部是按
     常规流绘制的，排在 positioned 的 #form_sheld 之前。实测把楼层 z-index 提到
     2147483647 仍然输给 z-index:31 的 #form_sheld；只有把 #form_sheld 自己压下去或
     藏起来才行。也就是说这个位置根本抬不出去。

     生产壳层不受影响：它把裁剪台挂在酒馆 body 下、z-index 2147483000（见 paintHudFill），
     在根层叠上下文里比，所以它的全屏本来就盖住了顶栏和输入栏。
     这一支不能挪（挪动必重载，会丢掉刚打开的那一页），所以改为整页期间把这几件 chrome
     临时藏起来 —— 效果与生产的全屏一致，不是新增行为。

     退出时按原样精确还原（连 !important 优先级一起存）。 */
  const CB_PROPS = ['backdrop-filter', '-webkit-backdrop-filter', 'filter',
    'transform', 'perspective', 'will-change', 'contain', 'container-type'];
  /* 中和值不能一律用 none：will-change 的初始值是 auto，contain 是 none，container-type 是 normal。 */
  const CB_NEUTRAL = { 'will-change': 'auto', 'contain': 'none', 'container-type': 'normal' };
  /* SillyTavern 的 chrome。整页盖不住它们，只能藏。 */
  const HOST_CHROME_IDS = ['top-bar', 'top-settings-holder', 'form_sheld'];
  let cbPatched = null;

  const createsFixedCb = (s) => {
    if (!s) return false;
    const has = (v) => v && v !== 'none';
    return has(s.transform) || has(s.perspective) || has(s.filter)
      || has(s.backdropFilter) || has(s.webkitBackdropFilter)
      || /transform|perspective|filter/.test(s.willChange || '')
      || /paint|layout|strict|content/.test(s.contain || '')
      || ((s.containerType || 'normal') !== 'normal');
  };

  const escapeFixedContainingBlock = (frame) => {
    /* 只在进入整页时补一次。补过之后 computed 已经是中和值，再跑一遍就什么都记不下来了。 */
    if (cbPatched) return;
    cbPatched = [];
    try {
      const tavern = tavernWin();
      const body = tavern.document.body;
      const patch = (el, props, value) => {
        const saved = {};
        props.forEach((p) => {
          saved[p] = [el.style.getPropertyValue(p), el.style.getPropertyPriority(p)];
        });
        cbPatched.push({ el, saved });
        props.forEach((p) => el.style.setProperty(p, value(p), 'important'));
      };

      /* 一、把这条链上建立 fixed 包含块的祖先中和掉，让 position:fixed 真的锚视口。 */
      let el = frame.parentElement;
      while (el) {
        if (createsFixedCb(tavern.getComputedStyle(el))) {
          patch(el, CB_PROPS, (p) => CB_NEUTRAL[p] || 'none');
        }
        if (el === body) break;
        el = el.parentElement;
      }

      /* 二、藏掉盖在整页上面、又抬不出去的宿主 chrome。 */
      HOST_CHROME_IDS.forEach((id) => {
        const chrome = tavern.document.getElementById(id);
        if (chrome) patch(chrome, ['visibility'], () => 'hidden');
      });
    } catch (e) {}
  };

  const restoreFixedContainingBlock = () => {
    if (!cbPatched) return;
    const patched = cbPatched;
    cbPatched = null;
    for (const entry of patched) {
      try {
        Object.keys(entry.saved).forEach((p) => {
          const [value, priority] = entry.saved[p];
          if (value) entry.el.style.setProperty(p, value, priority);
          else entry.el.style.removeProperty(p);
        });
      } catch (e) {}
    }
  };

  const layoutInlineDockPage = () => {
    const frame = window.frameElement;
    if (!frame) return;
    removeHudStage();
    if (hudFrame.parentNode !== document.body) document.body.appendChild(hudFrame);

    if (!inlinePageOn) {
      inlinePageOn = true;
      if (savedFloorStyle === null) savedFloorStyle = frame.getAttribute('style');
    }
    /* 必须在下面写 position:fixed 之前做：否则这一帧的 fixed 仍然锚在 #chat 上。 */
    escapeFixedContainingBlock(frame);
    const tavern = tavernWin();
    const vv = tavern.visualViewport;
    const vw = Math.round((vv && vv.width) || tavern.innerWidth || innerWidth);
    const vh = Math.round((vv && vv.height) || tavern.innerHeight || innerHeight);
    /* 楼层 iframe 铺满视口。跟 layoutPortraitPage 用的是同一套数字，只是作用在楼层而不是 HUD。 */
    const floorCss = [
      'position:fixed', 'left:0', 'top:0',
      `width:${vw}px`, `height:${vh}px`,
      'max-width:none', 'max-height:none',
      'margin:0', 'border:0', 'display:block',
      'visibility:visible', 'opacity:1', 'pointer-events:auto',
      'overflow:hidden', 'z-index:2147483000', 'background:#05040a',
    ].join(';');
    if (frame.style.cssText !== floorCss) frame.style.cssText = floorCss;
    /* TT 移动端会把 body 下未标记的 fixed 元素当宿主浮层接管几何，显式退出。 */
    try { frame.dataset.ttMobileSurface = 'none'; } catch (e) {}
    frame.setAttribute('scrolling', 'no');

    /* 本文档现在就是视口，让它满铺；整页要能内部滚动，所以 HUD 给 scrolling=yes。 */
    const fill = (el) => {
      el.style.setProperty('height', '100%', 'important');
      el.style.setProperty('overflow', 'hidden', 'important');
    };
    fill(document.documentElement);
    fill(document.body);

    const cssText = [
      'position:static', 'width:100%', 'height:100%',
      'max-width:none', 'margin:0', 'border:0', 'display:block',
      'background:#05040a', 'pointer-events:auto', 'visibility:visible', 'overflow:auto',
    ].join(';');
    if (hudFrame._linjiangCss !== cssText) {
      hudFrame._linjiangCss = cssText;
      hudFrame.style.cssText = cssText;
    }
    hudFrame.setAttribute('scrolling', 'yes');
    hudFrame.id = HUD_LIVE_ID;
    hudFrame._linjiangAlign = 'inline';
    hudFrame._linjiangBox = { width: vw, height: vh };
    try { hideChromeButtons(); } catch (e) {}
  };

  /* 从整页退回普通的原生嵌入：把楼层 iframe 还原成酒馆自己设的样子，然后重新走一次交接
     （handOverHeight 会把 html/body 放回内容决定高度）。 */
  const leaveInlineDockPage = (frame) => {
    if (!inlinePageOn) return;
    inlinePageOn = false;
    /* 先把祖先的模糊/变换还回去，再还原楼层样式：顺序不重要，但两件事必须成对，
       漏掉这一句的后果是 #chat 永久失去 backdrop-filter。 */
    restoreFixedContainingBlock();
    if (savedFloorStyle === null) frame.removeAttribute('style');
    else frame.setAttribute('style', savedFloorStyle);
    savedFloorStyle = null;
    inlineDockHandedOver = false;   // 让 handOverHeight 重新撤一次占位与 height:100%
    hudFrame._linjiangCss = null;
  };

  const layoutPortrait = () => {
    const frame = window.frameElement;
    if (!frame || !isSafeOuterFrame(frame)) {
      layoutMobile();
      return;
    }
    cleanupLeftovers();
    const view = viewportPoint(frame);
    const box = portraitHudBox(view.vw, view.vh, view.width);
    if (frame.dataset.linjiangH !== String(box.height)) {
      setSpacer(frame, box.height);
      frame.dataset.linjiangH = String(box.height);
    }
    const after = viewportPoint(frame);
    mountHud(after.doc);
    paintHud(box);
    hudFrame._linjiangAlign = 'slot';
    moveHud(after, box);
    hudFrame._linjiangBox = box;
    try { hideChromeButtons(); } catch (e) {}
  };

  const lockTavernScroll = () => {
    try {
      const el = tavernWin().document.documentElement;
      if (el.dataset.linjiangLock != null) return;
      el.dataset.linjiangLock = el.style.overflow || '';
      el.style.overflow = 'hidden';
    } catch (e) {}
  };

  const unlockTavernScroll = () => {
    try {
      const el = tavernWin().document.documentElement;
      if (el.dataset.linjiangLock == null) return;
      el.style.overflow = el.dataset.linjiangLock;
      delete el.dataset.linjiangLock;
    } catch (e) {}
  };

  /* Same idea as 外置状态栏.js fusion-popup-overlay: pin to the visual
     viewport (100dvh), not to the reading column. */
  const layoutPortraitPage = () => {
    const frame = window.frameElement;
    if (!frame || !isSafeOuterFrame(frame)) {
      layoutMobile();
      return;
    }
    const tavern = tavernWin();
    const vv = tavern.visualViewport;
    const vw = Math.round((vv && vv.width) || tavern.innerWidth || innerWidth);
    const vh = Math.round((vv && vv.height) || tavern.innerHeight || innerHeight);
    cleanupLeftovers();
    const rest = Math.max(1, Math.round(hudFrame._portraitRestH || 0));
    if (rest && frame.dataset.linjiangH !== String(rest)) {
      setSpacer(frame, rest);
      frame.dataset.linjiangH = String(rest);
    }
    mountHud(tavern.document);
    paintHudFill(vw, vh);
    hudFrame._linjiangAlign = 'page';
    lockTavernScroll();
    try { hideChromeButtons(); } catch (e) {}
  };

  const applyPortraitHeight = (h) => {
    if (portraitPageOpen || expanded || !portraitHud()) return;
    /* 原生嵌入（INLINE_DOCK 的收回态）必须在这里就地返回，绝对不能落到下面那句 layoutPortrait()。
       ------------------------------------------------------------------
       这是一个真实撞出来的死循环，值得记清楚：那句兜底会调 mountHud() 把 HUD 挪回酒馆文档，
       而 iframe 换父节点必重载；重载后的 HUD 又会报一次 portraitSize，又走到这里，又被挪回去 ——
       同时 fitParentFrame 那边还在把它挪进楼层文档。两边对着挪，HUD 每秒重载十几次，最后停在
       about:blank。竖屏才报 portraitSize，所以桌面完全正常，只有竖屏炸 —— 很容易误判成别的原因。

       原生嵌入下高度就是普通的流内高度，直接写在 iframe 上，酒馆助手的 adjust_iframe_height
       会跟着把楼层量对。 */
    if (hudFrame._linjiangAlign === 'inline') {
      const inlineNext = Math.max(1, Math.round(h));
      if (hudFrame._linjiangBox) hudFrame._linjiangBox.height = inlineNext;
      if (hudFrame.style.height !== `${inlineNext}px`) {
        hudFrame.style.height = `${inlineNext}px`;
        hudFrame._linjiangCss = null;   // cssText 缓存已失效，下次重排要重写
      }
      return;
    }
    const next = Math.max(1, Math.round(h));
    const box = hudFrame._linjiangBox;
    if (box && hudFrame._linjiangAlign === 'slot' && hudMounted()) {
      if (box.height === next) return;
      box.height = next;
      hudFrame.style.height = `${next}px`;
      hudFrame._linjiangBox = box;
      const frame = window.frameElement;
      if (isSafeOuterFrame(frame) && frame.dataset.linjiangH !== String(next)) {
        setSpacer(frame, next);
        frame.dataset.linjiangH = String(next);
      }
      followHud();
      return;
    }
    layoutPortrait();
  };

  const layoutMobile = () => {
    const frame = window.frameElement;
    if (!frame || !isSafeOuterFrame(frame)) return;
    cleanupLeftovers();
    const view = viewportPoint(frame);
    const width = Math.max(120, Math.round(view.width || frame.getBoundingClientRect().width || 0));
    const height = Math.max(180, Math.min(Math.round(width * BODY_H / BODY_W), Math.round(view.vh * MAX_VH)));
    const box = { width, height };
    if (frame.dataset.linjiangH !== String(height)) {
      setSpacer(frame, height);
      frame.dataset.linjiangH = String(height);
    }
    const after = viewportPoint(frame);
    mountHud(after.doc);
    paintHud(box);
    hudFrame._linjiangAlign = 'slot';
    hudFrame._linjiangBox = box;
    moveHud(after, box);
    placeFsButton();
  };

  const hudSrc = () => {
    try {
      const url = new URL(HUD_URL, location.href);
      const portrait = portraitHud();
      url.searchParams.set('mode', portrait ? 'portrait' : 'landscape');
      if (portrait) url.searchParams.delete('fit');
      else url.searchParams.set('fit', 'body');
      if (isTauriTavernMobile()) url.searchParams.set('host', 'tauritavern-mobile');
      else url.searchParams.delete('host');
      url.searchParams.set('v', 'body33-tt-parking-guard');
      return url.toString();
    } catch (e) {
      return HUD_URL;
    }
  };

  const syncHudSrc = () => {
    const mode = portraitHud() ? 'portrait' : 'landscape';
    const hasSrc = !!hudFrame.getAttribute('src');
    if (!hasSrc) {
      manager.hudMode = mode;
      hudFrame.src = hudSrc();
      return;
    }
    if (manager.hudMode === mode) return;
    manager.hudMode = mode;
    /* Keep the managed iframe/document alive across orientation changes. The HUD
       bridge applies this host decision and schedules its own local layout switch. */
    postHudMode(mode);
  };

  const fitParentFrame = () => {
    if (!isOwner()) return;
    try {
      const anchor = window.frameElement;

      /* 只要这一帧不该处于「原生嵌入的整页」状态，就先把它拆干净。
         ------------------------------------------------------------------
         必须在这里做，不能只靠 layoutInlineDock() 里那一次：整页开着的时候用户去改
         全局设置里的「HUD 停靠方式」或「适配宽度」，compacted / portraitHud() 一变，
         下面的分支链就直接走去生产路径了，layoutInlineDockPage 的收尾永远不会执行。

         症状是「切换设置把面板主体全屏化」：楼层 iframe 会被生产路径复位，但
         #chat 的 backdrop-filter 停在 none、#top-bar 和 #form_sheld 停在
         visibility:hidden —— 顶栏和输入栏消失了，看起来就像整个面板铺满了屏幕。
         而且这些是对**宿主**的改动，不还原就一直留着。

         也刻意放在下面那道 TT 停车守卫之前：守卫会 return，锚点离开阅读区时同样得先拆，
         否则会留下一个盖住整个视口的楼层。 */
      const wantInlinePage = INLINE_DOCK && compacted && !!anchor
        && (expanded || portraitPageOpen);
      if (!wantInlinePage && anchor) leaveInlineDockPage(anchor);

      if (isTauriTavernMobile() && portraitHud() && !anchorInReadingPane(anchor)) {
        hudFrame.style.visibility = 'hidden';
        hudFrame.style.pointerEvents = 'none';
        try { hideChromeButtons(); } catch (e) {}
        return;
      }
      ensureFsChrome();
      /* INLINE_DOCK 截的是「收回态」这一整支，包括它的整页/全屏子状态。
         整页也必须由它接住：走生产的 layoutPortraitPage 会 mountHud 把 HUD 挪回酒馆文档，
         而挪动必重载，重载会丢掉 HUD 刚打开的那一页 —— 症状是「点日程/档案变成整个面板全屏」。
         详见 layoutInlineDockPage 上面那段。 */
      if (INLINE_DOCK && compacted && window.frameElement) {
        if (expanded || portraitPageOpen) layoutInlineDockPage();
        else layoutInlineDock();
      }
      else if (expanded) layoutExpanded();
      else if (compacted && isDesktop() && window.frameElement) layoutCompact();
      else if (isDesktop() && window.frameElement) layoutDesktop();
      else if (portraitHud() && window.frameElement) {
        if (portraitPageOpen) layoutPortraitPage();
        else {
          unlockTavernScroll();
          if (compacted) layoutPortraitCompact();
          else layoutPortrait();
        }
      }
      else layoutMobile();
      syncHudSrc();
    } catch (e) {}
  };

  let followTick = 0;
  const requestFollow = () => {
    if (!isOwner() || followTick) return;
    followTick = requestAnimationFrame(() => {
      followTick = 0;
      try { followHud(); } catch (e) {}
    });
  };

  const followNow = () => {
    if (!isOwner()) return;
    if (followTick) {
      cancelAnimationFrame(followTick);
      followTick = 0;
    }
    try { followHud(); } catch (e) {}
  };

  /* A moving top-level iframe forces every backdrop-filter inside it to be
     recomposited against a new screen position. Temporarily ask the HUD to use
     its flat glass fills while the tavern scrolls; restore the blur shortly
     after the last scroll event. The tint/rims stay visible, so the transient
     downgrade is hard to notice in motion but removes the expensive blur pass. */
  let hostScrollIdleTimer = 0;
  let hostScrollActive = false;
  let lastScrollEventStamp = -1;
  let lastReadingScrollTop = null;
  /* A forwarded touch keeps scrolling the same host pane even though the lifted
     HUD moves under the finger during the gesture. */
  let touchScrollPoint = null;
  const setHostScrollActive = (next) => {
    const activeNow = !!next;
    if (hostScrollActive === activeNow) return;
    hostScrollActive = activeNow;
    /* Tauri mobile uses a permanently flat glass surface. Toggling a universal
       backdrop-filter selector at gesture boundaries makes Android WebView
       reallocate the iframe layer and appear to flash. */
    if (isTauriTavernMobile()) return;
    postToHud({
      channel: CHANNEL,
      kind: 'event',
      type: 'hostScrollState',
      context: manager.context(),
      payload: { active: activeNow },
    });
  };
  const nudgePortraitHud = (before, after) => {
    const delta = (Number(after) || 0) - (Number(before) || 0);
    lastReadingScrollTop = Number(after) || 0;
    if (!delta || !portraitHud() || hudFrame._linjiangAlign !== 'slot') return;
    /* 这一步是「不读布局就把 HUD 挪到手指位置上」，所以只能动 transform，绝不能读 rect。
       以前它改的是 style.top —— 那是布局属性，逐帧写等于逐帧重排 + 重画整块玻璃，
       而且会把 followHud 里刚提升好的合成层废掉。 */
    const y = hudFrame._linjiangOffY;
    if (Number.isFinite(y)) setHudOffset(hudFrame._linjiangOffX || 0, y - delta);
  };
  const noteHostScroll = (event) => {
    if (!isOwner()) return;
    const stamp = Number(event?.timeStamp);
    if (Number.isFinite(stamp) && stamp === lastScrollEventStamp) return;
    if (Number.isFinite(stamp)) lastScrollEventStamp = stamp;
    setHostScrollActive(true);
    const pane = readingPane();
    if (portraitHud() && pane) {
      const current = Number(pane.scrollTop) || 0;
      if (lastReadingScrollTop != null) nudgePortraitHud(lastReadingScrollTop, current);
      else lastReadingScrollTop = current;
    }
    clearTimeout(hostScrollIdleTimer);
    hostScrollIdleTimer = setTimeout(() => {
      hostScrollIdleTimer = 0;
      setHostScrollActive(false);
    }, 160);
    /* Scroll and layout in one animation frame. Calling followHud synchronously
       from every scroll event forces a frame -> layout -> style cycle on phones,
       and touch forwarding can call this twice for one gesture update. */
    if (portraitHud()) requestFollow();
    else followNow();
  };

  const wheelPixels = (payload, win) => {
    const dy = Number(payload?.deltaY) || 0;
    const mode = Number(payload?.deltaMode) || 0;
    if (mode === 1) return dy * 40;
    if (mode === 2) return dy * ((win && win.innerHeight) || 800);
    return dy;
  };

  const isRootScroller = (el, doc) => (
    el === doc.scrollingElement || el === doc.documentElement || el === doc.body
  );

  const isWheelScrollable = (el, doc) => {
    if (!el || !doc) return false;
    const room = (el.scrollHeight || 0) - (el.clientHeight || 0);
    if (room <= 1) return false;
    if (isRootScroller(el, doc)) return true;
    try {
      const overflowY = doc.defaultView.getComputedStyle(el).overflowY;
      return overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
    } catch (e) {
      return false;
    }
  };

  /* Return the unconsumed part of a wheel delta.  Keeping the remainder is
     important near a nested scroller's edge: native wheel scrolling chains the
     rest into its parent instead of dropping the whole gesture. */
  const applyScroll = (el, dy, doc) => {
    if (!dy || !isWheelScrollable(el, doc)) return dy;
    const max = Math.max(0, (el.scrollHeight || 0) - (el.clientHeight || 0));
    const before = Number(el.scrollTop) || 0;
    const target = Math.max(0, Math.min(max, before + dy));
    if (Math.abs(target - before) < 0.01) return dy;
    el.scrollTop = target;
    const consumed = (Number(el.scrollTop) || 0) - before;
    return dy - consumed;
  };

  const scrollChain = (start, dy, doc) => {
    let remaining = dy;
    let node = start && start.nodeType === 1 ? start : start?.parentElement;
    const seen = new Set();
    while (node && node !== doc && Math.abs(remaining) > 0.01) {
      if (!seen.has(node)) {
        seen.add(node);
        remaining = applyScroll(node, remaining, doc);
      }
      if (node === doc.documentElement || node === doc.body) break;
      node = node.parentElement;
    }
    const root = doc.scrollingElement || doc.documentElement;
    if (root && !seen.has(root) && Math.abs(remaining) > 0.01) {
      remaining = applyScroll(root, remaining, doc);
    }
    return remaining;
  };

  const pointInFrame = (iframe, x, y) => {
    const r = iframe.getBoundingClientRect();
    return { x: x - r.left, y: y - r.top, win: iframe.contentWindow };
  };

  const scrollAtPoint = (win, x, y, dy) => {
    if (!win || !dy) return dy;
    try {
      const doc = win.document;
      let target = null;
      try { target = doc.elementFromPoint(x, y); } catch (e) {}
      if (!target) target = doc.scrollingElement || doc.documentElement;

      let remaining = dy;
      if (target && target.tagName === 'IFRAME') {
        try {
          const p = pointInFrame(target, x, y);
          remaining = scrollAtPoint(p.win, p.x, p.y, remaining);
        } catch (e) {}
        target = target.parentElement;
      }
      return scrollChain(target, remaining, doc);
    } catch (e) {
      return dy;
    }
  };

  const hudPointerPoint = (payload) => {
    const box = hudScreenRect();
    const px = Number(payload?.clientX);
    const py = Number(payload?.clientY);
    const x = Number.isFinite(px) ? Math.max(0, Math.min(box.width - 1, px)) : box.width / 2;
    const y = Number.isFinite(py) ? Math.max(0, Math.min(box.height - 1, py)) : Math.min(80, box.height / 4);
    return { x: box.left + x, y: box.top + y };
  };

  const nearestWheelScroller = (start, doc) => {
    let node = start && start.nodeType === 1 ? start : start?.parentElement;
    while (node && node !== doc) {
      if (isWheelScrollable(node, doc)) return node;
      if (node === doc.documentElement || node === doc.body) break;
      node = node.parentElement;
    }
    const root = doc.scrollingElement || doc.documentElement;
    return isWheelScrollable(root, doc) ? root : null;
  };

  const scrollTargetAtPoint = (win, x, y) => {
    if (!win) return null;
    try {
      const doc = win.document;
      let target = doc.elementFromPoint(x, y);
      if (target && target.tagName === 'IFRAME') {
        try {
          const p = pointInFrame(target, x, y);
          const nested = scrollTargetAtPoint(p.win, p.x, p.y);
          if (nested) return nested;
        } catch (e) {}
        target = target.parentElement;
      }
      const el = nearestWheelScroller(target, doc);
      return el ? { el, doc } : null;
    } catch (e) {
      return null;
    }
  };

  const readingTargetAtPoint = (payload) => {
    const tavern = tavernWin();
    try {
      const point = hudPointerPoint(payload);
      const stack = tavern.document.elementsFromPoint(point.x, point.y) || [];
      for (let i = 0; i < stack.length; i++) {
        let el = stack[i];
        if (!el || el === hudFrame || el.id === HUD_LIVE_ID
            || el.id === HUD_FS_ID || el.id === HUD_AUTOSCROLL_ID) continue;
        if (el.tagName === 'IFRAME') {
          try {
            const p = pointInFrame(el, point.x, point.y);
            const nested = scrollTargetAtPoint(p.win, p.x, p.y);
            if (nested) return { ...nested, point };
          } catch (e) {}
          el = el.parentElement;
        }
        const target = nearestWheelScroller(el, tavern.document);
        if (target) return { el: target, doc: tavern.document, point };
        break;
      }

      const wins = [window.parent, tavern];
      const visited = new Set();
      for (let i = 0; i < wins.length; i++) {
        const win = wins[i];
        if (!win || visited.has(win)) continue;
        visited.add(win);
        try {
          const doc = win.document;
          const target = nearestWheelScroller(
            doc.getElementById('chat') || doc.scrollingElement || doc.documentElement,
            doc,
          );
          if (target) return { el: target, doc, point };
        } catch (e) {}
      }
    } catch (e) {}
    return null;
  };

  const toTavernPoint = (win, x, y) => {
    const tavern = tavernWin();
    let current = win;
    let px = x;
    let py = y;
    try {
      while (current && current !== tavern) {
        const frame = current.frameElement;
        if (!frame) break;
        const rect = frame.getBoundingClientRect();
        px += rect.left;
        py += rect.top;
        current = current.parent;
      }
    } catch (e) {}
    return { x: px, y: py };
  };

  const autoscroll = {
    active: false,
    target: null,
    doc: null,
    anchorX: 0,
    anchorY: 0,
    pointerX: 0,
    pointerY: 0,
    raf: 0,
    lastTime: 0,
  };

  const notifyAutoscrollState = (active) => {
    try {
      hudFrame.contentWindow?.postMessage({
        channel: CHANNEL,
        kind: 'event',
        context: manager.context(),
        type: 'autoscrollState',
        payload: { active },
      }, hudOrigin === '*' ? '*' : hudOrigin);
    } catch (e) {}
  };

  const removeAutoscrollMarker = () => {
    try { tavernWin().document.getElementById(HUD_AUTOSCROLL_ID)?.remove(); } catch (e) {}
  };

  const syncAutoscrollCursor = (overlay) => {
    if (!overlay) return;
    const dy = autoscroll.pointerY - autoscroll.anchorY;
    overlay.style.cursor = Math.abs(dy) < 12 ? 'all-scroll' : (dy < 0 ? 'n-resize' : 's-resize');
  };

  const stopAutoscroll = () => {
    if (!autoscroll.active && !autoscroll.raf) {
      removeAutoscrollMarker();
      return;
    }
    if (autoscroll.raf) {
      try { tavernWin().cancelAnimationFrame(autoscroll.raf); } catch (e) {}
    }
    autoscroll.active = false;
    autoscroll.target = null;
    autoscroll.doc = null;
    autoscroll.raf = 0;
    autoscroll.lastTime = 0;
    removeAutoscrollMarker();
    notifyAutoscrollState(false);
  };

  const autoscrollSpeed = (offset) => {
    const DEAD_ZONE = 12;
    const distance = Math.abs(offset) - DEAD_ZONE;
    if (distance <= 0) return 0;
    const pxPerSecond = Math.min(2400, distance * 5 + distance * distance * 0.025);
    return Math.sign(offset) * pxPerSecond;
  };

  const autoscrollFrame = (time) => {
    if (!autoscroll.active || !autoscroll.target || !autoscroll.doc) return;
    const last = autoscroll.lastTime || time;
    const elapsed = Math.min(50, Math.max(0, time - last));
    autoscroll.lastTime = time;
    const speed = autoscrollSpeed(autoscroll.pointerY - autoscroll.anchorY);
    if (speed && elapsed) {
      const dy = speed * elapsed / 1000;
      const remaining = applyScroll(autoscroll.target, dy, autoscroll.doc);
      if (Math.abs(remaining - dy) > 0.01) {
        try { followHud(); } catch (e) {}
      }
    }
    autoscroll.raf = tavernWin().requestAnimationFrame(autoscrollFrame);
  };

  const startAutoscroll = (payload) => {
    const found = readingTargetAtPoint(payload);
    if (!found) {
      notifyAutoscrollState(false);
      return;
    }
    stopAutoscroll();
    autoscroll.active = true;
    autoscroll.target = found.el;
    autoscroll.doc = found.doc;
    autoscroll.anchorX = found.point.x;
    autoscroll.anchorY = found.point.y;
    autoscroll.pointerX = found.point.x;
    autoscroll.pointerY = found.point.y;

    try {
      const doc = tavernWin().document;
      const overlay = doc.createElement('div');
      overlay.id = HUD_AUTOSCROLL_ID;
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.cssText = [
        'position:fixed',
        'inset:0',
        'z-index:2147483647',
        'cursor:all-scroll',
        'background:transparent',
      ].join(';');
      overlay.innerHTML = [
        '<div data-origin="1">',
        '<svg viewBox="0 0 32 32" width="36" height="36">',
        '<circle cx="16" cy="16" r="14.5" fill="rgba(18,20,28,.78)" stroke="rgba(255,255,255,.72)" stroke-width="1.2"/>',
        '<path d="M16 5.5l5.2 7.2H10.8z" fill="rgba(255,255,255,.92)"/>',
        '<path d="M16 26.5l-5.2-7.2h10.4z" fill="rgba(255,255,255,.92)"/>',
        '<circle cx="16" cy="16" r="2.1" fill="rgba(255,255,255,.92)"/>',
        '</svg></div>',
      ].join('');
      const origin = overlay.querySelector('[data-origin]');
      origin.style.cssText = [
        'position:absolute',
        `left:${found.point.x}px`,
        `top:${found.point.y}px`,
        'width:36px',
        'height:36px',
        'margin:-18px 0 0 -18px',
        'pointer-events:none',
        'filter:drop-shadow(0 2px 8px rgba(0,0,0,.45))',
      ].join(';');
      const onMove = (event) => {
        autoscroll.pointerX = event.clientX;
        autoscroll.pointerY = event.clientY;
        syncAutoscrollCursor(overlay);
      };
      const onCancel = (event) => {
        try { event.preventDefault(); event.stopPropagation(); } catch (e) {}
        stopAutoscroll();
      };
      overlay.addEventListener('mousemove', onMove, { passive: true });
      overlay.addEventListener('mousedown', onCancel, true);
      overlay.addEventListener('wheel', onCancel, { capture: true, passive: false });
      overlay.addEventListener('contextmenu', onCancel, true);
      overlay.addEventListener('auxclick', (event) => {
        try { event.preventDefault(); } catch (e) {}
      }, true);
      doc.body.appendChild(overlay);
    } catch (e) {}

    notifyAutoscrollState(true);
    autoscroll.raf = tavernWin().requestAnimationFrame(autoscrollFrame);
  };

  const toggleAutoscroll = (payload) => {
    if (autoscroll.active) stopAutoscroll();
    else startAutoscroll(payload);
  };

  const moveAutoscrollFromHud = (payload) => {
    if (!autoscroll.active) return;
    try {
      const point = hudPointerPoint(payload);
      autoscroll.pointerX = point.x;
      autoscroll.pointerY = point.y;
    } catch (e) {}
  };

  const onHudAutoscroll = (event) => {
    const data = event.data;
    if (!isOwner() || !data || data.channel !== CHANNEL || data.kind !== 'event') return;
    if (event.source !== hudFrame.contentWindow) return;
    if (data.type !== 'autoscrollToggle' && data.type !== 'autoscrollMove') return;
    if (hudOrigin !== '*' && event.origin !== hudOrigin) return;
    if (data.type === 'autoscrollToggle') toggleAutoscroll(data.payload || {});
    else moveAutoscrollFromHud(data.payload || {});
  };

  const onHostMouseMove = (event) => {
    if (!autoscroll.active) return;
    const point = toTavernPoint(event.view || event.currentTarget?.defaultView, event.clientX, event.clientY);
    autoscroll.pointerX = point.x;
    autoscroll.pointerY = point.y;
  };

  const onHostMouseDown = (event) => {
    if (!autoscroll.active) return;
    event.preventDefault();
    event.stopPropagation();
    stopAutoscroll();
  };

  const onHostKeyDown = (event) => {
    if (autoscroll.active && event.key === 'Escape') stopAutoscroll();
  };

  const scrollReading = (payload, stablePoint = null) => {
    const tavern = tavernWin();
    const dy = wheelPixels(payload, tavern);
    if (!dy) return;
    const pane = readingPane();
    const paneBefore = Number(pane?.scrollTop) || 0;
    noteHostScroll();

    let remaining = dy;
    try {
      const point = stablePoint || hudPointerPoint(payload);
      const stack = tavern.document.elementsFromPoint(point.x, point.y) || [];
      for (let i = 0; i < stack.length && Math.abs(remaining) > 0.01; i++) {
        let el = stack[i];
        /* 裁剪台也要跳过：它是 HUD 的父节点，会跟着出现在命中栈里；落到 scrollChain
           上就会去滚文档根而不是 #chat，转发出来的滚动量就错了。 */
        if (!el || el === hudFrame || el.id === HUD_LIVE_ID || el.id === HUD_STAGE_ID
            || el.id === HUD_FS_ID) continue;
        if (el.tagName === 'IFRAME') {
          try {
            const p = pointInFrame(el, point.x, point.y);
            remaining = scrollAtPoint(p.win, p.x, p.y, remaining);
          } catch (e) {}
          el = el.parentElement;
        }
        remaining = scrollChain(el, remaining, tavern.document);
        /* elementsFromPoint contains the same ancestor chain repeatedly.  Once
           the hit target has been handled, the chain above already reached the
           document scroller, so continuing would apply the delta twice. */
        break;
      }
    } catch (e) {}

    if (Math.abs(remaining) > 0.01) {
      const fallback = [window.parent, tavern];
      const visited = new Set();
      for (let i = 0; i < fallback.length && Math.abs(remaining) > 0.01; i++) {
        try {
          const win = fallback[i];
          if (!win || visited.has(win)) continue;
          visited.add(win);
          const doc = win.document;
          const chat = doc.getElementById('chat');
          remaining = scrollChain(chat || doc.scrollingElement || doc.documentElement, remaining, doc);
        } catch (e) {}
      }
    }

    /* On portrait the chat scroll delta is already known. Move the detached
       iframe by that delta immediately without a layout read, then reconcile its
       exact geometry/clip once in RAF. This keeps the compositor-facing layer on
       the finger while avoiding synchronous getBoundingClientRect work. */
    if (Math.abs(remaining - dy) > 0.01) {
      if (portraitHud()) {
        const paneAfter = Number(pane?.scrollTop) || 0;
        nudgePortraitHud(paneBefore, paneAfter);
        requestFollow();
      } else followNow();
    }
  };

  const onHudLayout = (event) => {
    const data = event.data;
    if (!isOwner() || !data || data.channel !== CHANNEL || data.kind !== 'event') return;
    if (event.source !== hudFrame.contentWindow) return;
    if (data.type !== 'portraitSize' && data.type !== 'portraitPage'
        && data.type !== 'dockDefault' && data.type !== 'overlay') return;
    if (hudOrigin !== '*' && event.origin !== hudOrigin) return;
    if (data.type === 'dockDefault') {
      try { applyDockDefault(data.payload || {}); } catch (e) {}
      return;
    }
    if (data.type === 'overlay') {
      const next = !!data.payload?.open;
      const page = !!data.payload?.page;
      if (next === overlayOpen && !page) return;
      overlayOpen = next;
      /* On a portrait mobile host, a modal/overlay must be promoted to the
         viewport page path even if the HUD initially booted in landscape mode. */
      if (isTauriTavernMobile() && tavernSize().w < tavernSize().h
          && (page || next || portraitPageOpen)) {
        portraitPageOpen = next || page;
        try { fitParentFrame(); } catch (e) {}
        return;
      }
      /* A secondary page is an application page, not a shell overlay. Keep the
         desktop chrome visible and only use the signal for mobile promotion. */
      if (page) return;
      /* 开的时候只需要收钮，不用重排（覆盖层是 HUD 内部的事）；关的时候按当前布局
         把钮放回去 —— 走 placeFsButton 而不是 fitParentFrame，省掉一次无谓的重排。 */
      if (overlayOpen) { try { hideChromeButtons(); } catch (e) {} }
      else if (!portraitPageOpen && hudFrame._linjiangAlign !== 'slot'
               && hudFrame.style.visibility !== 'hidden') {
        try { placeFsButton(); } catch (e) {}
      }
      return;
    }
    if (data.type === 'portraitSize') {
      const h = Math.round(Number(data.payload?.height) || 0);
      if (h <= 1 || portraitPageOpen) return;
      hudFrame._portraitRestH = h;
      try { applyPortraitHeight(h); } catch (e) {}
      return;
    }
    portraitPageOpen = !!data.payload?.open;
    try { fitParentFrame(); } catch (e) {}
  };

  const onHudWheel = (event) => {
    const data = event.data;
    if (!isOwner() || !data || data.channel !== CHANNEL || data.kind !== 'event') return;
    if (event.source !== hudFrame.contentWindow) return;
    if (hudOrigin !== '*' && event.origin !== hudOrigin) return;
    if (data.type === 'touchScrollEnd') {
      touchScrollPoint = null;
      return;
    }
    if (data.type !== 'wheel' && data.type !== 'touchScroll') return;
    if (autoscroll.active) stopAutoscroll();
    const payload = data.payload || {};
    if (data.type === 'touchScroll' && (payload.gestureStart || !touchScrollPoint)) {
      touchScrollPoint = hudPointerPoint(payload);
    }
    scrollReading(payload, data.type === 'touchScroll' ? touchScrollPoint : null);
  };

  let pollTimer = 0;
  const hostWins = [];
  const hostListens = [];
  const listen = (target, type, fn, opts) => {
    if (!target || !target.addEventListener) return;
    target.addEventListener(type, fn, opts);
    hostListens.push({ target, type, fn, opts });
  };

  const bindHostMessages = (win) => {
    if (!win || hostWins.indexOf(win) !== -1) return;
    hostWins.push(win);
    listen(win, 'message', onHudRequest);
    listen(win, 'message', onHudWheel);
    listen(win, 'message', onHudAutoscroll);
    listen(win, 'message', onHudLayout);
    /* 小手机的 ack 回到发信的那个窗口（也就是本页），但顺手也在酒馆窗口上听一份：
       多绑一次没有副作用，phoneAcks 认 id，先到的那条把它取走。 */
    listen(win, 'message', onPhoneAck);
    listen(win, 'message', onCGUnlockRecord);
  };

  const clearHostListeners = () => {
    while (hostListens.length) {
      const item = hostListens.pop();
      try { item.target.removeEventListener(item.type, item.fn, item.opts); } catch (e) {}
    }
    hostWins.length = 0;
  };

  const removeOwnedChrome = () => {
    try {
      const doc = tavernWin().document;
      for (const id of [HUD_FS_ID, HUD_SHRINK_ID, HUD_AUTOSCROLL_ID]) {
        const element = doc.getElementById(id);
        if (element?.dataset.linjiangOwner === INSTANCE_ID || id === HUD_AUTOSCROLL_ID) element?.remove();
      }
      const style = doc.getElementById(HUD_FS_STYLE_ID);
      if (style?.dataset.linjiangOwner === INSTANCE_ID) style.remove();
    } catch (e) {}
  };

  const collapseAnchor = () => {
    try {
      const frame = window.frameElement;
      if (!frame) return;
      frame.style.setProperty('height', '0px', 'important');
      frame.style.setProperty('min-height', '0px', 'important');
      frame.style.setProperty('opacity', '0', 'important');
      frame.style.setProperty('pointer-events', 'none', 'important');
      frame.dataset.linjiangH = '0';
    } catch (e) {}
  };

  const deactivate = () => {
    if (!active) { collapseAnchor(); return; }
    clearTimeout(hostScrollIdleTimer);
    hostScrollIdleTimer = 0;
    setHostScrollActive(false);
    active = false;
    portraitPageOpen = false;
    try { unlockTavernScroll(); } catch (e) {}
    /* 跟 unlockTavernScroll 同一类：对宿主做过的改动，交还控制权时必须撤干净。
       漏掉它的后果是壳层卸载/换主时 #chat 永久失去 backdrop-filter、顶栏和输入栏一直隐藏。
       走完整的 leaveInlineDockPage 而不是只还原祖先样式，楼层自己的样式也要交回去。 */
    try {
      const anchor = window.frameElement;
      if (anchor) leaveInlineDockPage(anchor);
      else restoreFixedContainingBlock();
    } catch (e) {}
    try { stopAutoscroll(); } catch (e) {}
    try { slotObserver?.disconnect(); } catch (e) {}
    slotObserver = null;
    try { clearInterval(pollTimer); } catch (e) {}
    pollTimer = 0;
    if (followTick) {
      try { cancelAnimationFrame(followTick); } catch (e) {}
      followTick = 0;
    }
    clearHostListeners();
    removeOwnedChrome();
    if (hudFrame) {
      hudFrame.style.visibility = 'hidden';
      hudFrame.style.pointerEvents = 'none';
    }
    collapseAnchor();
  };

  const bindActiveRuntime = () => {
    bindHostMessages(window);
    try { bindHostMessages(tavernWin()); } catch (e) {}
    listen(window, 'resize', fitParentFrame);
    try {
      const tavern = tavernWin();
      const opts = { passive: true, capture: true };
      const pointerDocs = [tavern.document];
      try {
        if (window.parent?.document && window.parent.document !== tavern.document) pointerDocs.push(window.parent.document);
      } catch (e) {}
      pointerDocs.forEach((doc) => {
        listen(doc, 'mousemove', onHostMouseMove, opts);
        listen(doc, 'mousedown', onHostMouseDown, { capture: true, passive: false });
        listen(doc, 'keydown', onHostKeyDown, true);
        listen(doc, 'wheel', () => { if (autoscroll.active) stopAutoscroll(); }, opts);
      });
      listen(tavern, 'mousedown', onHostMouseDown, { capture: true, passive: false });
      listen(tavern, 'keydown', onHostKeyDown, true);
      listen(tavern, 'blur', () => { if (autoscroll.active) stopAutoscroll(); });
      listen(tavern, 'resize', fitParentFrame);
      listen(tavern, 'orientationchange', fitParentFrame);
      if (tavern.visualViewport) listen(tavern.visualViewport, 'resize', fitParentFrame, { passive: true });
      listen(tavern, 'scroll', noteHostScroll, opts);
      listen(tavern.document, 'scroll', noteHostScroll, opts);
      const chat = tavern.document.getElementById('chat');
      if (chat) {
        lastReadingScrollTop = Number(chat.scrollTop) || 0;
        listen(chat, 'scroll', noteHostScroll, opts);
      }
      if (window.parent && window.parent !== window && window.parent !== tavern) {
        listen(window.parent, 'scroll', noteHostScroll, opts);
        listen(window.parent.document, 'scroll', noteHostScroll, opts);
        listen(window.parent, 'resize', fitParentFrame);
      }
      const frame = window.frameElement;
      const pane = readingPane();
      if (frame && typeof IntersectionObserver === 'function') {
        slotObserver = new IntersectionObserver(() => requestFollow(), {
          root: pane && pane.contains(frame) ? pane : null,
          threshold: [0, 0.01, 0.08, 0.2, 0.5, 1],
        });
        slotObserver.observe(frame);
      }
      [50, 150, 400, 900].forEach((ms) => {
        setTimeout(() => { if (isOwner()) requestFollow(); }, ms);
      });
    } catch (e) {}
  };

  const activate = (context) => {
    if (destroyed) return;
    active = true;
    uninstalled = false;
    /* A message/status re-render elects a new controller without reloading the
       managed HUD iframe. Restore the shared docking state before the first layout,
       otherwise the new owner falls back to the viewport-wide desktop box. */
    if (manager.dockMode === 'embedded' || manager.dockMode === 'page') {
      compacted = manager.dockMode === 'embedded';
      dockDefaultApplied = true;
    }
    /* 新接手的 HUD 身上没有覆盖层；上一任留下的标记不能带过来，否则两颗钮再也不出现。 */
    overlayOpen = false;
    hudFrame = manager.ensureHudFrame();
    hudFrame.dataset.linjiangOwner = INSTANCE_ID;
    /* Repair a managed frame that survived a message-floor handover from an
       earlier controller before the mobile-surface opt-out was introduced. */
    hudFrame.dataset.ttMobileSurface = 'none';
    hudFrame.removeAttribute('data-tt-mobile-surface-admitted');
    hudFrame.style.removeProperty('--tt-original-top');
    try { localHudFrame.remove(); } catch (e) {}
    bindActiveRuntime();
    fitParentFrame();
    showHint('?? HUD / MVU?');
    pollTimer = setInterval(() => pushSnapshot(false), POLL_MS);
    postToHud({ channel: CHANNEL, kind: 'event', type: 'context', context });
    pushSnapshot(true);
  };

  const uninstall = () => {
    if (destroyed) return;
    destroyed = true;
    uninstalled = true;
    deactivate('removed');
    try { frameObserver?.disconnect(); } catch (e) {}
    frameObserver = null;
    manager.unregister(INSTANCE_ID);
  };

  addEventListener('pagehide', uninstall);
  addEventListener('unload', uninstall);
  try {
    const fe = window.frameElement;
    if (fe && fe.parentNode && typeof MutationObserver === 'function') {
      frameObserver = new MutationObserver(() => {
        if (!fe.isConnected) { uninstall(); return; }
        if (isOwner()) fitParentFrame();
      });
      frameObserver.observe(fe.parentNode, { childList: true });
    }
  } catch (e) {}

  localHudFrame.style.display = 'none';
  manager.bindEventHooks(getCoreWindow());
  controllerRecord = manager.register({
    id: INSTANCE_ID,
    frame: window.frameElement,
    activate,
    deactivate,
    pushSnapshot,
    requestFollow,
    destroyed: () => destroyed,
  });

})();
