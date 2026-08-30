/* AIRP 鉴宝竞拍 · 规则引擎
 * ---------------------------------------------------------------
 * 纯逻辑，不碰 DOM，不发网络请求。竞拍人（NPC）的出价全部由本文件
 * 的参数化模型决定，配合可重放的种子随机源，因此同一个 seed + 同一
 * 串玩家动作永远得到同一场拍卖 —— 这是能跑蒙特卡洛调平数值的前提。
 *
 * 竞价机制：5 个回合，每回合所有人**各自填一次价**（自由金额，不是固定
 * 阶梯），填完当回合公开。回合之间拍卖师和玩家的仪器会陆续给出情报，
 * 所以后面的回合出价更贴近真值。全场出价最高者得，成交价就是他那口价。
 *
 * 载入方式：
 *   浏览器  <script src="auction-engine.js"></script> → globalThis.AIRPAuctionEngine
 *   Node    new Function(readFileSync(...))() 后读 globalThis.AIRPAuctionEngine
 * 故意写成传统脚本而不是 ES module：arcade 的页面要能用 file:// 直接打开。
 * --------------------------------------------------------------- */
(function (root, factory) { root.AIRPAuctionEngine = factory(); })(
  typeof globalThis !== 'undefined' ? globalThis : this,
  function () {
'use strict';

const VERSION = '0.2.0';

/* ================================================================
 * 1. 可重放随机源
 * ============================================================== */
function makeRng(seed) {
  let a = (Number(seed) >>> 0) || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    range: (lo, hi) => lo + next() * (hi - lo),
    intRange: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    norm: () => {
      let u = 0, v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      return Math.max(-3, Math.min(3, z));
    },
    weighted: (list, weightOf) => {
      let total = 0;
      for (const x of list) total += weightOf(x);
      let roll = next() * total;
      for (const x of list) { roll -= weightOf(x); if (roll <= 0) return x; }
      return list[list.length - 1];
    },
    shuffle: (arr) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/* 出价金额取整到「好看的档位」，量级越大档位越粗，跟真实喊价一样 */
function tidy(v) {
  v = Math.max(1, Math.round(v));
  const unit = v >= 1e6 ? 10000 : v >= 1e5 ? 1000 : v >= 1e4 ? 100 : v >= 1000 ? 10 : 1;
  return Math.round(v / unit) * unit;
}

/* ================================================================
 * 2. 藏品数据表
 * ----------------------------------------------------------------
 * density = 每格基准价值。刻意让「占格大小」和「价值」脱钩：钱币 1 格
 * 抵家具好几格。所以只探到轮廓的玩家拿到的是**有歧义**的情报，大轮廓
 * 可能是重器也可能是柜子 —— 这个歧义是「探种类」那一层情报的存在理由。
 *
 * 跨度压在 3.5 倍以内。早期版本跨 10 倍，箱子的品类构成直接决定价值量
 * 级，真值/先验 的中位数只有 0.71、p10 0.23，做不出捡漏，只能做出
 * 「箱箱亏钱、偶尔暴富」。
 * ============================================================== */
const CATEGORIES = [
  { id: 'porcelain', name: '瓷器', icon: '🏺', density: 1250, volatility: 0.26, fakeRate: 0.18,
    shapes: [[2, 2], [1, 2], [2, 3]], hint: '釉色' },
  { id: 'jade',      name: '玉器', icon: '💠', density: 2300, volatility: 0.28, fakeRate: 0.20,
    shapes: [[1, 1], [1, 2]], hint: '沁色' },
  { id: 'bronze',    name: '青铜', icon: '🔔', density: 1450, volatility: 0.27, fakeRate: 0.15,
    shapes: [[2, 2], [2, 3], [1, 2]], hint: '锈层' },
  { id: 'painting',  name: '书画', icon: '🖼️', density: 1300, volatility: 0.30, fakeRate: 0.20,
    shapes: [[1, 3], [1, 2], [2, 3]], hint: '题跋' },
  { id: 'coin',      name: '钱币', icon: '🪙', density: 2600, volatility: 0.32, fakeRate: 0.18,
    shapes: [[1, 1]], hint: '包浆' },
  { id: 'curio',     name: '杂项', icon: '🧿', density: 1000, volatility: 0.22, fakeRate: 0.12,
    shapes: [[1, 1], [1, 2], [2, 2]], hint: '工痕' },
  { id: 'furniture', name: '家具', icon: '🪑', density: 740,  volatility: 0.18, fakeRate: 0.06,
    shapes: [[2, 3], [3, 3], [2, 2]], hint: '榫卯' },
];
const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

/* 倍率跨度决定「一件东西能不能单独撑起整箱」。跨度过大时整箱价值退化成
   「有没有摸到那一件」的伯努利抽奖，回合制的渐进情报就失去意义。 */
const RARITIES = [
  { id: 'common', name: '普品', mul: 1.0, weight: 44, color: '#8b97a8' },
  { id: 'fine',   name: '精品', mul: 1.9, weight: 31, color: '#35c1e8' },
  { id: 'rare',   name: '珍品', mul: 3.6, weight: 18, color: '#b478f5' },
  { id: 'unique', name: '孤品', mul: 7.0, weight: 7,  color: '#ffb02e' },
];
const RARITY_BY_ID = Object.fromEntries(RARITIES.map((r) => [r.id, r]));
const RARITY_RANK = Object.fromEntries(RARITIES.map((r, i) => [r.id, i]));

const CONDITIONS = [
  { id: 'broken', name: '残',   mul: 0.45, weight: 12 },
  { id: 'worn',   name: '旧',   mul: 0.80, weight: 34 },
  { id: 'whole',  name: '全',   mul: 1.00, weight: 40 },
  { id: 'mint',   name: '极美', mul: 1.25, weight: 14 },
];

/* 赝品：外观信息（轮廓/种类/稀有度）与真品完全一致，只有鉴伪类仪器能识破。
   它是本作唯一的下行风险来源，也是「稀有度情报不能直接当价值情报」的原因。 */
const FAKE_VALUE_RANGE = [0.06, 0.16];
const FAKE_MEAN = (FAKE_VALUE_RANGE[0] + FAKE_VALUE_RANGE[1]) / 2;

const RARITY_TOTAL = RARITIES.reduce((s, r) => s + r.weight, 0);
const RARITY_MEAN = RARITIES.reduce((s, r) => s + r.weight * r.mul, 0) / RARITY_TOTAL;
const COND_TOTAL = CONDITIONS.reduce((s, c) => s + c.weight, 0);
const COND_MEAN = CONDITIONS.reduce((s, c) => s + c.weight * c.mul, 0) / COND_TOTAL;

/* calib：装箱损耗校正。放不进格子的拍品会被丢弃，实际件数低于抽样件数，
   解析式先验会系统性高估。由 scripts/sim-auction-dist.mjs 实测得出；
   改动 GRID / 形状池 / 件数区间之后必须重跑重新标定。 */
const THEMES = [
  { id: 'porcelain-heavy', name: '官窑专场', announce: '本场以瓷器为主，杂项若干',
    calib: 1.00, bias: { porcelain: 5, curio: 2, painting: 1.2 } },
  { id: 'jade-coin',       name: '文玩小件专场', announce: '本场多小件，玉器钱币居多',
    calib: 1.05, bias: { jade: 4, coin: 3.5, curio: 1.6 } },
  { id: 'bronze-heavy',    name: '青铜重器专场', announce: '本场以青铜为主，间有家具',
    calib: 1.00, bias: { bronze: 5, furniture: 2, curio: 1.4 } },
  { id: 'painting-heavy',  name: '书画专场', announce: '本场以书画立轴为主',
    calib: 1.02, bias: { painting: 5.5, curio: 1.5, porcelain: 1.2 } },
  { id: 'estate',          name: '旧宅清仓', announce: '整宅清仓，品类杂乱，大件偏多',
    calib: 0.98, bias: { furniture: 3.5, curio: 3, porcelain: 1.6, painting: 1.4 } },
  { id: 'mixed',           name: '综合杂拍', announce: '综合杂拍，品类不定',
    calib: 1.01, bias: {} },
];
const THEME_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t]));

/* ================================================================
 * 3. 仓库与拍品生成
 * ============================================================== */
const GRID = { cols: 7, rows: 6 };
const ITEM_COUNT_RANGE = [4, 9];

function themeWeight(theme, category) {
  const bias = theme.bias || {};
  return bias[category.id] != null ? bias[category.id] : 1;
}

/* 主题下的平均每格密度：只探到轮廓时，唯一能用的就是这个数 */
function priorDensity(theme) {
  let w = 0, v = 0;
  for (const cat of CATEGORIES) {
    const k = themeWeight(theme, cat);
    w += k; v += k * cat.density;
  }
  return v / w;
}

function priorItemValue(theme) {
  let wSum = 0, vSum = 0;
  for (const cat of CATEGORIES) {
    const w = themeWeight(theme, cat);
    const cells = cat.shapes.reduce((s, sh) => s + sh[0] * sh[1], 0) / cat.shapes.length;
    const real = cat.density * cells * RARITY_MEAN * COND_MEAN;
    const mean = real * (1 - cat.fakeRate) + real * FAKE_MEAN * cat.fakeRate;
    wSum += w; vSum += w * mean;
  }
  return vSum / wSum;
}

function priorLotValue(theme) {
  const mid = (ITEM_COUNT_RANGE[0] + ITEM_COUNT_RANGE[1]) / 2;
  return priorItemValue(theme) * mid * (theme.calib != null ? theme.calib : 1);
}

function makeItem(rng, theme, index) {
  const cat = rng.weighted(CATEGORIES, (c) => themeWeight(theme, c));
  const shape = rng.pick(cat.shapes);
  const rarity = rng.weighted(RARITIES, (r) => r.weight);
  const condition = rng.weighted(CONDITIONS, (c) => c.weight);
  const fake = rng.chance(cat.fakeRate);
  const cells = shape[0] * shape[1];
  const noise = Math.exp(rng.norm() * cat.volatility);
  const honest = cat.density * cells * rarity.mul * condition.mul * noise;
  const value = fake ? honest * rng.range(FAKE_VALUE_RANGE[0], FAKE_VALUE_RANGE[1]) : honest;
  return {
    uid: 'it' + index,
    category: cat.id, categoryName: cat.name, icon: cat.icon,
    rarity: rarity.id, rarityName: rarity.name, rarityColor: rarity.color,
    condition: condition.id, conditionName: condition.name,
    fake, w: shape[0], h: shape[1], cells,
    value: Math.round(value),
    x: -1, y: -1,
  };
}

function packItems(rng, items) {
  const occupied = Array.from({ length: GRID.rows }, () => new Array(GRID.cols).fill(null));
  const placed = [];
  /* 大件先放，否则大件总是挤不进去，箱子会变成一堆小格子 */
  for (const item of items.slice().sort((a, b) => b.cells - a.cells)) {
    const slots = [];
    for (let y = 0; y + item.h <= GRID.rows; y++) {
      for (let x = 0; x + item.w <= GRID.cols; x++) slots.push([x, y]);
    }
    for (const [x, y] of rng.shuffle(slots)) {
      let free = true;
      for (let dy = 0; dy < item.h && free; dy++) {
        for (let dx = 0; dx < item.w; dx++) if (occupied[y + dy][x + dx]) { free = false; break; }
      }
      if (!free) continue;
      for (let dy = 0; dy < item.h; dy++) {
        for (let dx = 0; dx < item.w; dx++) occupied[y + dy][x + dx] = item.uid;
      }
      item.x = x; item.y = y; placed.push(item);
      break;
    }
  }
  return { placed, occupied };
}

/* valueScale 把整套价值量级缩放到与共享钱包匹配。数据表用的是真实古玩
   市场量级（整箱几万），街机钱包默认只有 ¥1000。只缩金额不动任何概率与
   比例，平衡结论因此完全不受影响。 */
function makeLot(rng, theme, lotIndex, valueScale) {
  const scale = valueScale > 0 ? valueScale : 1;
  const wanted = rng.intRange(ITEM_COUNT_RANGE[0], ITEM_COUNT_RANGE[1]);
  const raw = [];
  for (let i = 0; i < wanted; i++) raw.push(makeItem(rng, theme, i));
  const { placed, occupied } = packItems(rng, raw);
  for (const it of placed) it.value = Math.max(1, Math.round(it.value * scale));
  return {
    index: lotIndex,
    theme: theme.id,
    items: placed,
    occupied,
    trueValue: placed.reduce((s, it) => s + it.value, 0),
    fakeCount: placed.filter((it) => it.fake).length,
    topRarity: placed.reduce(
      (best, it) => (RARITY_RANK[it.rarity] > RARITY_RANK[best] ? it.rarity : best), 'common'),
    prior: priorLotValue(theme) * scale,
    density: priorDensity(theme) * scale,
  };
}

/* ================================================================
 * 4. 情报层
 * ----------------------------------------------------------------
 * 三层信息，作用完全不同，这是整套数值的骨架：
 *
 *   公开情报（拍卖师逐回合透露）——所有竞拍人同时看到，价格随之抬升。
 *       它只降低玩家的风险，不产生利润。
 *   私有情报（玩家带的仪器）——只有玩家看到。这是利润的唯一来源，
 *       而且**越早拿到越值钱**：晚期情报到手时别人的出价已经涨上去了。
 *   行为情报（竞拍人每回合公开的出价）——谁突然跳价说明谁看到了好东西。
 * ============================================================== */
const ROUNDS = 5;

/* 各类公开情报对「市场看清程度」的贡献。调这张表 = 调价格随回合上涨的
   斜率，也就是玩家「早出手 vs 等情报」的取舍强度。 */
const PUBLIC_WEIGHT = {
  'avg-value': 0.06, outline: 0.05, category: 0.09, 'top-rarity': 0.10, 'fake-count': 0.12,
};

/* 一个回合可以有多条。第 1 回合必须至少掀开两件轮廓 —— 否则不带早期仪器
   的玩家开局面对一个全黑的仓库和「当前估价 0」，既没有判断依据也没有观感。 */
const AUCTIONEER_SCHEDULE = [
  { round: 1, kind: 'avg-value' },
  { round: 1, kind: 'outline', count: 2 },
  { round: 2, kind: 'outline', count: 2 },
  { round: 3, kind: 'category', count: 2 },
  { round: 4, kind: 'top-rarity' },
  { round: 5, kind: 'fake-count' },
];

/* 玩家仪器。slot 是装备位消耗，出场前共 4 位。
   定价逻辑：同样是「看清全部」，第 1 回合要 3 位，第 4 回合只要 1 位 ——
   因为到第 4 回合，公开情报已经把别人的出价推到接近真值，看清了也没得赚。 */
const INSTRUMENTS = [
  { id: 'scope-s', name: '小型品鉴仪', slot: 1, icon: '🔬', kind: 'outline', count: 3, rounds: [1],
    desc: '第 1 回合随机展示 3 件藏品的轮廓。' },
  { id: 'scope-m', name: '中型品鉴仪', slot: 2, icon: '🔭', kind: 'rarity', count: 3, rounds: [2],
    desc: '第 2 回合随机展示 3 件藏品的品质。' },
  { id: 'scope-l', name: '大型品鉴仪', slot: 1, icon: '📡', kind: 'category-all', rounds: [4],
    desc: '第 4 回合展示全部藏品的品类。' },
  { id: 'tea', name: '下午茶', slot: 2, icon: '🍰', kind: 'outline', count: 2, rounds: [1, 3],
    desc: '第 1、3 回合各随机展示 2 件藏品的轮廓。' },
  { id: 'loupe', name: '估价镜', slot: 3, icon: '💎', kind: 'full', count: 1, rounds: [1],
    tightness: 0.18, desc: '第 1 回合完整看清 1 件：品类、品质、品相与价值区间。' },
  { id: 'uv-lamp', name: '验伪灯', slot: 2, icon: '🔦', kind: 'mark-fakes', rounds: [2],
    desc: '第 2 回合标出箱内所有不开门的位置（不显示是什么）。' },
  { id: 'earpiece', name: '耳报机', slot: 2, icon: '🎧', kind: 'read-rival', perRound: 1,
    desc: '每回合可读出一位竞拍人的心理价位区间。' },
  { id: 'hand-drill', name: '开箱钻', slot: 2, icon: '🪛', kind: 'probe-cell', perRound: 1, feeRate: 0.03,
    tightness: 0.28, desc: '每回合可花当前估价 3% 钻验一格，得到该件的品类与品质。' },
  { id: 'sealed-bid', name: '加密出价器', slot: 1, icon: '🔒', kind: 'hide-bid',
    desc: '你每回合的出价不向其他竞拍人公开，他们无法针对你抬价。' },
  { id: 'regular', name: '熟客名牌', slot: 1, icon: '🎫', kind: 'commission', rate: 0.03,
    desc: '佣金从 8% 降到 3%。' },
];
const INSTRUMENT_BY_ID = Object.fromEntries(INSTRUMENTS.map((s) => [s.id, s]));
const INSTRUMENT_SLOTS = 4;
const BASE_COMMISSION = 0.08;

/* ---------------- 情报账本 ---------------- */
function makeBook() {
  const map = new Map();
  return {
    /* weight 只在公开账本上有意义：它是「市场整体有多接近真相」，
       每条公开情报都往上加，直接抬高全体竞拍人的估值精度。 */
    weight: 0,
    fakeCount: null, topRarity: null, avgNote: null, fakeCells: null,
    get: (uid) => map.get(uid) || null,
    all: () => map,
    ensure(uid) {
      if (!map.has(uid)) map.set(uid, { uid, outline: false });
      return map.get(uid);
    },
    categoryOf(uid) { const e = map.get(uid); return e ? e.category || null : null; },
    merge(other) {
      const out = makeBook();
      out.weight = Math.max(this.weight || 0, other.weight || 0);
      out.fakeCount = other.fakeCount != null ? other.fakeCount : this.fakeCount;
      out.topRarity = other.topRarity || this.topRarity;
      out.avgNote = other.avgNote || this.avgNote;
      out.fakeCells = other.fakeCells || this.fakeCells;
      for (const src of [this.all(), other.all()]) {
        for (const [uid, e] of src) Object.assign(out.ensure(uid), e);
      }
      return out;
    },
  };
}

function noteOutline(book, item) {
  const e = book.ensure(item.uid);
  e.outline = true; e.w = item.w; e.h = item.h; e.cells = item.cells;
  e.x = item.x; e.y = item.y;
  return e;
}
function noteCategory(book, item) {
  const e = noteOutline(book, item);
  e.category = item.category; e.categoryName = item.categoryName;
  e.icon = item.icon; e.hint = CATEGORY_BY_ID[item.category].hint;
  return e;
}
function noteRarity(book, item) {
  const e = noteOutline(book, item);
  e.rarity = item.rarity; e.rarityName = item.rarityName; e.rarityColor = item.rarityColor;
  return e;
}
function valueBand(item, tightness) {
  const t = clamp(tightness, 0.08, 0.9);
  return [tidy(item.value * (1 - t)), tidy(item.value * (1 + t))];
}
function noteFull(book, item, tightness) {
  const e = noteCategory(book, item);
  noteRarity(book, item);
  e.condition = item.condition; e.conditionName = item.conditionName;
  e.band = valueBand(item, tightness);
  return e;
}

/* ---------------- 当前估价 ----------------
 * 只把「已经探到东西的格子」算进去，没探到的一律算 0。所以它是一个随情报
 * 增加而单调上升的**下限**，而不是对整箱的猜测。这样玩家看到的数字永远是
 * 「我已经确认的价值」，不会被一个虚高的期望值误导着去抬价。 */
function knownEstimate(book, lot) {
  let sum = 0;
  for (const item of lot.items) {
    const e = book.get(item.uid);
    if (!e || !e.outline) continue;
    if (e.band) { sum += (e.band[0] + e.band[1]) / 2; continue; }
    const cat = e.category ? CATEGORY_BY_ID[e.category] : null;
    const density = cat ? cat.density * (lot.density / priorDensity(THEME_BY_ID[lot.theme])) : lot.density;
    const rar = e.rarity ? RARITY_BY_ID[e.rarity].mul : RARITY_MEAN;
    let v = density * e.cells * rar * COND_MEAN;
    if (e.fake) v *= FAKE_MEAN;
    else if (cat) v *= 1 - cat.fakeRate * (1 - FAKE_MEAN);
    else v *= 1 - 0.16 * (1 - FAKE_MEAN);
    sum += v;
  }
  return Math.round(sum);
}

/* ================================================================
 * 5. 竞拍人
 * ----------------------------------------------------------------
 *   insight     眼力：只决定他估值噪声的大小，**不是**能看见真值。
 *               这一条是全局平衡的地基。竞拍人一旦能看穿箱子，市场就是
 *               有效的：好箱子被他们抢走，烂箱子留给玩家，无论带什么仪器
 *               都是亏（实测拿下率 1.3%、成交价是真值的 4.2 倍）。
 *               反过来，把真值信息删干净，他们的低价就不含坏消息，玩家跟
 *               着捡就是白拿钱（实测盲拍 ROI +67%）。所以要的是「弱但真实
 *               的信号」，强度由 α 控制。
 *   margin      期望利润率，与 aggression 的乘积 k 是他愿意出到估值的几成。
 *               现有人格 k 落在 0.42~0.78：行家都要留转手利润，那部分就是
 *               玩家的捡漏空间。
 * ============================================================== */
const PERSONAS = [
  /* 头像一律用单码点 emoji：带 ZWJ 的组合序列（🧑‍🎓 之类）在不少环境里会
     退化成两个并排的字形，把名牌挤歪。 */
  { id: 'shopkeeper', name: '古玩城老板', face: '🏮', insight: 0.55, aggression: 0.90, margin: 0.40,
    patience: 0.85, tilt: 0.10, bias: 'porcelain', budgetMul: 1.05, jump: 0.10,
    quip: ['做了三十年，不打眼', '这价我还能吃', '过了就过了'] },
  { id: 'collector', name: '本地收藏家', face: '🎩', insight: 0.40, aggression: 0.95, margin: 0.30,
    patience: 0.70, tilt: 0.28, bias: 'painting', budgetMul: 1.20, jump: 0.22,
    quip: ['我就要那张画', '钱不是问题', '再加一点也行'] },
  { id: 'runner', name: '跑货的', face: '🧢', insight: 0.30, aggression: 0.80, margin: 0.48,
    patience: 0.90, tilt: 0.05, bias: null, budgetMul: 0.70, jump: 0.06,
    quip: ['转手要留够利', '高了我就不要了', '这箱不值'] },
  { id: 'newbie', name: '新入行的', face: '🎓', insight: 0.12, aggression: 0.92, margin: 0.32,
    patience: 0.55, tilt: 0.40, bias: null, budgetMul: 0.85, jump: 0.30,
    quip: ['看着挺开门的', '再加一口试试', '我是不是买贵了'] },
  { id: 'appraiser', name: '退休鉴定师', face: '👓', insight: 0.78, aggression: 0.78, margin: 0.36,
    patience: 0.95, tilt: 0.03, bias: 'bronze', budgetMul: 1.00, jump: 0.05,
    quip: ['里面有东西，但没那么多', '过了，不值', '沉住气'] },
  { id: 'tycoon', name: '外来豪客', face: '🕶️', insight: 0.18, aggression: 1.00, margin: 0.22,
    patience: 0.50, tilt: 0.45, bias: 'jade', budgetMul: 1.45, jump: 0.45,
    quip: ['直接翻倍', '我不还价', '这点钱算什么'] },
];

/* 每回合的出价节奏。竞拍人不会一上来就顶到自己的上限 —— 前面几回合先试
   水，后面情报明了再往上压。这条曲线决定了「早出价便宜」这件事成立。 */
const BID_RAMP = [0.46, 0.62, 0.76, 0.89, 1.0];

function seatRivals(rng, lot, theme, count, priceScale) {
  const roster = rng.shuffle(PERSONAS).slice(0, count);
  return roster.map((persona, i) => {
    /* 瞥见：极小概率真的看到了一件东西，于是这一箱他异常自信。它是玩家能
       「读」到的行为情报来源，不是让竞拍人变全知。 */
    let insider = 0;
    if (rng.chance(persona.insight * 0.22)) insider = 0.22;
    const sigma = 0.35 * (1 - persona.insight) + 0.08;
    return {
      seat: i, id: persona.id, name: persona.name, face: persona.face, persona,
      insider, noise: Math.exp(rng.norm() * sigma),
      baseAlpha: 0.10 + 0.32 * persona.insight + insider,
      budget: tidy(lot.prior * persona.budgetMul * rng.range(0.9, 1.25) * priceScale),
      quipIndex: rng.int(persona.quip.length),
      active: true, out: false, tilted: false,
      bids: new Array(ROUNDS).fill(null),
      best: 0, cap: 0, lastEstimate: 0, readBand: null,
    };
  });
}

/* est = 真值^α · 先验^(1−α) · exp(N(0,σ))
   α=0 时竞拍人纯噪声出价，玩家白捡；α=1 时市场有效，玩家必亏。
   公开情报会把所有人的 α 一起推高，所以拍卖师每透露一条，成交价就更贴近
   真值，玩家的可赚空间同步收窄。 */
function rivalEstimate(rival, lot, book) {
  const alpha = clamp(rival.baseAlpha + (book.weight || 0), 0, 0.88);
  const truth = Math.max(1, lot.trueValue);
  const prior = Math.max(1, lot.prior);
  return Math.pow(truth, alpha) * Math.pow(prior, 1 - alpha) * rival.noise;
}

function rivalCap(rival, estimate, lot, book) {
  const p = rival.persona;
  let cap = estimate * (1 - p.margin) * p.aggression;
  if (p.bias) {
    /* 只有「已公开的」偏好品才会让他上头，不能让 NPC 用玩家看不见的信息作弊 */
    const seen = lot.items.some((it) => it.category === p.bias && book.categoryOf(it.uid) === p.bias);
    if (seen) cap *= 1.15;
  }
  return Math.min(cap, rival.budget);
}

/* 单回合密封出价。返回金额，或 null 表示放弃本箱。 */
function rivalBid(state, rival) {
  const { rng } = state;
  const round = state.round;
  const high = visibleHigh(state);
  if (high >= rival.cap) {
    if (!rival.tilted && rng.chance(rival.persona.tilt) && high * 1.12 <= rival.budget) {
      rival.tilted = true;
      return tidy(high * rng.range(1.04, 1.14));
    }
    return null;
  }
  const ramp = BID_RAMP[Math.min(BID_RAMP.length - 1, round - 1)];
  let target = rival.cap * ramp * rng.range(0.94, 1.06);
  /* 必须压过明面上的最高价才有意义；跳价幅度由人格决定 */
  const minBeat = high > 0 ? high * (1 + rng.range(0.02, 0.04 + rival.persona.jump)) : state.floorPrice;
  target = Math.max(target, minBeat);
  if (target > rival.cap) {
    /* 追不上就看耐性：耐性高的人干脆不出，耐性低的人会硬顶到上限 */
    if (rng.chance(rival.persona.patience)) return null;
    target = rival.cap;
  }
  return tidy(Math.min(target, rival.budget));
}

/* 明面最高价。玩家带了加密出价器时，他的出价不进这个数 —— 竞拍人因此
   无法针对玩家抬价，这是该仪器唯一但相当实在的作用。 */
function visibleHigh(state) {
  let high = 0;
  for (const r of state.rivals) if (r.best > high) high = r.best;
  if (!state.hideBid && state.playerBest > high) high = state.playerBest;
  return high;
}

/* ================================================================
 * 6. 一场拍卖的状态机
 * ============================================================== */
const GRADES = [
  { id: 'S', min: 0.55, color: '#ffb02e', quip: '一眼开门，捡了个大漏。' },
  { id: 'A', min: 0.22, color: '#35c1e8', quip: '眼力配得上这口价。' },
  { id: 'B', min: -0.12, color: '#5b8cff', quip: '落槌无悔，血本无归。' },
  { id: 'C', min: -0.32, color: '#8b97a8', quip: '学费不算贵，记住这箱。' },
  { id: 'D', min: -0.58, color: '#d98a3a', quip: '这箱货，你替别人扛了。' },
  { id: 'F', min: -Infinity, color: '#e0526a', quip: '全是仿的，回去练眼。' },
];
function gradeOf(gross, paid) {
  const ratio = paid > 0 ? (gross - paid) / paid : 0;
  return GRADES.find((g) => ratio >= g.min) || GRADES[GRADES.length - 1];
}

function card(source, icon, title, text, tone) {
  return { source, icon, title, text, tone: tone || 'plain' };
}

function applyAuctioneer(state) {
  return AUCTIONEER_SCHEDULE.filter((e) => e.round === state.round)
    .map((entry) => auctioneerCard(state, entry))
    .filter(Boolean);
}

function auctioneerCard(state, entry) {
  const { lot, publicBook, rng } = state;
  publicBook.weight += PUBLIC_WEIGHT[entry.kind] || 0;
  const title = '拍卖师公开情报';
  if (entry.kind === 'avg-value') {
    /* 报一个真实的统计量：某个品质档的均价。它是纯公开情报，人人可用。 */
    const present = RARITIES.filter((r) => lot.items.some((it) => it.rarity === r.id));
    const pick = present.length ? rng.pick(present) : RARITIES[0];
    const group = lot.items.filter((it) => it.rarity === pick.id);
    const avg = tidy(group.reduce((s, it) => s + it.value, 0) / group.length);
    publicBook.avgNote = { rarity: pick.id, rarityName: pick.name, avg };
    return card('auctioneer', '📋', title, `本箱内所有${pick.name}藏品的平均价值为 ${avg}。`, 'gold');
  }
  if (entry.kind === 'outline') {
    const pool = lot.items.filter((it) => !(publicBook.get(it.uid) || {}).outline);
    const picked = rng.shuffle(pool).slice(0, entry.count);
    for (const it of picked) noteOutline(publicBook, it);
    return card('auctioneer', '📋', title,
      picked.length ? `随机展示 ${picked.length} 件藏品的轮廓。` : '轮廓都掀过了。', 'gold');
  }
  if (entry.kind === 'category') {
    const pool = lot.items.filter((it) => !publicBook.categoryOf(it.uid));
    const picked = rng.shuffle(pool).slice(0, entry.count);
    for (const it of picked) noteCategory(publicBook, it);
    return card('auctioneer', '📋', title,
      picked.length ? `随机展示 ${picked.length} 件藏品的品类。` : '品类都报过了。', 'gold');
  }
  if (entry.kind === 'top-rarity') {
    publicBook.topRarity = lot.topRarity;
    return card('auctioneer', '📋', title,
      `本箱最高品质为${RARITY_BY_ID[lot.topRarity].name}。`, 'gold');
  }
  publicBook.fakeCount = lot.fakeCount;
  return card('auctioneer', '📋', title,
    lot.fakeCount ? `照规矩报一句：本箱有 ${lot.fakeCount} 件不开门。` : '本箱件件开门。', 'gold');
}

function applyInstruments(state) {
  const out = [];
  const { lot, privateBook, rng } = state;
  for (const kit of state.kits) {
    if (!Array.isArray(kit.rounds) || !kit.rounds.includes(state.round)) continue;
    if (kit.kind === 'outline') {
      const pool = lot.items.filter((it) => !(privateBook.get(it.uid) || {}).outline);
      const picked = rng.shuffle(pool).slice(0, kit.count);
      for (const it of picked) noteOutline(privateBook, it);
      out.push(card('instrument', kit.icon, kit.name,
        picked.length ? `随机展示 ${picked.length} 件藏品的轮廓。` : '没有新的轮廓可看。'));
    } else if (kit.kind === 'rarity') {
      const pool = lot.items.filter((it) => !(privateBook.get(it.uid) || {}).rarity);
      const picked = rng.shuffle(pool).slice(0, kit.count);
      for (const it of picked) noteRarity(privateBook, it);
      out.push(card('instrument', kit.icon, kit.name,
        picked.length ? `随机展示 ${picked.length} 件藏品的品质。` : '品质都看过了。'));
    } else if (kit.kind === 'category-all') {
      for (const it of lot.items) noteCategory(privateBook, it);
      out.push(card('instrument', kit.icon, kit.name, '展示全部藏品的品类。'));
    } else if (kit.kind === 'full') {
      const pool = lot.items.filter((it) => !(privateBook.get(it.uid) || {}).band);
      const picked = rng.shuffle(pool).slice(0, kit.count);
      for (const it of picked) noteFull(privateBook, it, kit.tightness);
      out.push(card('instrument', kit.icon, kit.name, picked.length
        ? picked.map((it) => {
            const e = privateBook.get(it.uid);
            return `${it.rarityName}${it.categoryName}，品相${it.conditionName}，约 ${e.band[0]}~${e.band[1]}`;
          }).join('；')
        : '没有新东西可看。'));
    } else if (kit.kind === 'mark-fakes') {
      privateBook.fakeCells = lot.items.filter((it) => it.fake)
        .map((it) => ({ uid: it.uid, x: it.x, y: it.y, w: it.w, h: it.h }));
      for (const it of lot.items) if (it.fake) { noteOutline(privateBook, it); privateBook.ensure(it.uid).fake = true; }
      out.push(card('instrument', kit.icon, kit.name, privateBook.fakeCells.length
        ? `标出 ${privateBook.fakeCells.length} 处不开门的位置。` : '一处赝品也没有。'));
    }
  }
  return out;
}

function refreshRivals(state) {
  for (const r of state.rivals) {
    if (!r.active) continue;
    r.lastEstimate = rivalEstimate(r, state.lot, state.publicBook);
    r.cap = rivalCap(r, r.lastEstimate, state.lot, state.publicBook);
  }
}

/* ================================================================
 * 7. 对外 API
 * ============================================================== */
const DEFAULT_CONFIG = {
  seed: 1, budget: 20000, lots: 3, rivalCount: 4,
  kits: [], themeId: null, priceScale: 1, valueScale: 1,
};

function createSession(config) {
  const cfg = { ...DEFAULT_CONFIG, ...(config || {}) };
  const rng = makeRng(cfg.seed);
  const kits = (cfg.kits || []).map((id) => INSTRUMENT_BY_ID[id]).filter(Boolean);
  const used = kits.reduce((s, k) => s + k.slot, 0);
  if (used > INSTRUMENT_SLOTS) throw new RangeError(`装备位超额：${used}/${INSTRUMENT_SLOTS}`);

  const session = {
    version: VERSION, seed: cfg.seed, config: cfg, kits, slotUsed: used,
    budget: cfg.budget, spent: 0, gained: 0, lotIndex: -1, ledger: [], finished: false,
  };
  let state = null;

  const kitOf = (kind) => kits.find((k) => k.kind === kind) || null;
  const commissionRate = () => { const k = kitOf('commission'); return k ? k.rate : BASE_COMMISSION; };

  function beginLot() {
    if (session.finished) return null;
    session.lotIndex++;
    if (session.lotIndex >= cfg.lots) { session.finished = true; return null; }
    const theme = cfg.themeId ? THEME_BY_ID[cfg.themeId] : rng.pick(THEMES);
    const lot = makeLot(rng, theme, session.lotIndex, cfg.valueScale);
    state = {
      rng, kits, theme, lot,
      publicBook: makeBook(), privateBook: makeBook(),
      rivals: seatRivals(rng, lot, theme, cfg.rivalCount, cfg.priceScale),
      round: 0,
      floorPrice: tidy(lot.prior * 0.12),
      suggest: tidy(lot.prior * 0.95),
      hideBid: !!kitOf('hide-bid'),
      playerBids: new Array(ROUNDS).fill(null),
      playerBest: 0, playerActive: true,
      probeLeft: 0, readLeft: 0, probeFees: 0,
      cards: [], phase: 'bidding',
      hammerPrice: 0, won: false, winnerName: null,
    };
    session.current = state;
    return openRound();
  }

  function openRound() {
    state.round++;
    state.probeLeft = (kitOf('probe-cell') || { perRound: 0 }).perRound || 0;
    state.readLeft = (kitOf('read-rival') || { perRound: 0 }).perRound || 0;
    const fresh = applyAuctioneer(state);
    fresh.push(...applyInstruments(state));
    for (const c of fresh) state.cards.unshift({ ...c, round: state.round });
    refreshRivals(state);
    return { cards: fresh, view: view() };
  }

  /* 玩家出价。amount 为 null / 0 表示本回合放弃（退出本箱）。 */
  function bid(amount) {
    if (!state || state.phase !== 'bidding') return { ok: false, events: [], view: view() };
    const events = [];
    const high = visibleHigh(state);
    if (amount == null) {
      state.playerActive = false;
      events.push({ kind: 'pass', player: true, text: '你放下了牌子' });
    } else {
      const v = Math.round(Number(amount) || 0);
      if (!state.playerActive) return fail('你已经退出本箱');
      if (v < state.floorPrice) return fail(`不能低于起拍价 ${state.floorPrice}`);
      if (v <= state.playerBest) return fail('这口价不比你上一口高');
      if (v * (1 + commissionRate()) > session.budget - session.spent) return fail('超出你的可用资金');
      state.playerBids[state.round - 1] = v;
      state.playerBest = v;
      events.push({ kind: 'bid', player: true, amount: v, text: `你出价 ${v}` });
    }

    for (const rival of state.rng.shuffle(state.rivals.filter((r) => r.active))) {
      const amt = rivalBid(state, rival);
      if (amt == null) {
        rival.active = false; rival.out = true;
        events.push({ kind: 'out', seat: rival.seat, name: rival.name, text: `${rival.name}放弃了本箱` });
        continue;
      }
      rival.bids[state.round - 1] = amt;
      rival.best = Math.max(rival.best, amt);
      events.push({ kind: 'bid', seat: rival.seat, name: rival.name, amount: amt,
        text: `${rival.name}出价 ${amt}` });
      if (rival.tilted) { rival.active = false; rival.out = true; }
    }

    if (state.round >= ROUNDS || (!state.playerActive && !state.rivals.some((r) => r.active))) {
      events.push(hammer());
      return { ok: true, events, view: view() };
    }
    if (!state.playerActive) {
      /* 玩家退出后把剩下的回合跑完，让他看到「我放弃的这箱最后被谁以多少拿走」 */
      while (state.round < ROUNDS && state.rivals.some((r) => r.active)) {
        const next = openRound();
        events.push(...next.cards.map((c) => ({ kind: 'card', text: c.title + '：' + c.text })));
        for (const rival of state.rng.shuffle(state.rivals.filter((r) => r.active))) {
          const amt = rivalBid(state, rival);
          if (amt == null) { rival.active = false; rival.out = true; continue; }
          rival.bids[state.round - 1] = amt;
          rival.best = Math.max(rival.best, amt);
        }
      }
      events.push(hammer());
      return { ok: true, events, view: view() };
    }
    const next = openRound();
    return { ok: true, events, cards: next.cards, view: next.view };
  }

  function fail(text) {
    return { ok: false, events: [{ kind: 'error', text }], view: view() };
  }

  function hammer() {
    state.phase = 'hammered';
    let best = state.playerBest, winner = 'player';
    for (const r of state.rivals) {
      if (r.best > best) { best = r.best; winner = r.seat; }
    }
    state.hammerPrice = best;
    state.won = winner === 'player' && best > 0;
    state.winnerName = best <= 0 ? null : state.won ? '你' : state.rivals[winner].name;
    return {
      kind: 'hammer', price: best, won: state.won,
      text: best <= 0 ? '无人应价，本箱流拍'
        : state.won ? `落槌！${best} 归你` : `落槌，被${state.winnerName}以 ${best} 拿走`,
    };
  }

  function probe(x, y) {
    const kit = kitOf('probe-cell');
    if (!kit) return { ok: false, text: '没带开箱钻' };
    if (state.probeLeft <= 0) return { ok: false, text: '本回合的钻验次数用完了' };
    const merged = state.publicBook.merge(state.privateBook);
    const fee = tidy(Math.max(1, knownEstimate(merged, state.lot) * kit.feeRate));
    const uid = state.lot.occupied[y] && state.lot.occupied[y][x];
    state.probeLeft--;
    state.probeFees += fee;
    session.spent += fee;
    if (!uid) return { ok: true, empty: true, fee, text: `这一格是空的（花了 ${fee}）` };
    const item = state.lot.items.find((it) => it.uid === uid);
    noteCategory(state.privateBook, item);
    noteRarity(state.privateBook, item);
    state.privateBook.ensure(uid).band = valueBand(item, kit.tightness);
    state.cards.unshift({ ...card('instrument', kit.icon, kit.name,
      `钻验（${x + 1},${y + 1}）：${item.rarityName}${item.categoryName}`), round: state.round });
    return { ok: true, fee, uid, text: `${item.rarityName}${item.categoryName}（花了 ${fee}）` };
  }

  function readRival(seat) {
    if (!kitOf('read-rival')) return { ok: false, text: '没带耳报机' };
    if (state.readLeft <= 0) return { ok: false, text: '本回合已经听过了' };
    const rival = state.rivals[seat];
    if (!rival) return { ok: false, text: '没有这个人' };
    state.readLeft--;
    rival.readBand = [tidy(rival.cap * 0.85), tidy(rival.cap * 1.15)];
    return { ok: true, seat, band: rival.readBand,
      text: `${rival.name}的心理价位大约 ${rival.readBand[0]}~${rival.readBand[1]}` };
  }

  function settle() {
    if (!state || state.phase !== 'hammered') return null;
    state.phase = 'settled';
    const rate = commissionRate();
    const won = state.won;
    const price = won ? state.hammerPrice : 0;
    const commission = won ? Math.round(price * rate) : 0;
    const paid = price + commission + state.probeFees;
    const gross = state.lot.trueValue;
    const grade = won ? gradeOf(gross, paid) : null;
    const net = won ? gross - paid : -state.probeFees;
    if (won) { session.spent += price + commission; session.gained += gross; }
    /* 从低到高翻，把最贵的一件留到最后 */
    const reveals = state.lot.items.slice().sort((a, b) => a.value - b.value).map((it) => ({
      uid: it.uid, x: it.x, y: it.y, w: it.w, h: it.h, icon: it.icon,
      category: it.category, categoryName: it.categoryName,
      rarity: it.rarity, rarityName: it.rarityName, rarityColor: it.rarityColor,
      conditionName: it.conditionName, fake: it.fake, value: it.value,
    }));
    const entry = {
      lot: state.lot.index, theme: state.theme.id, themeName: state.theme.name,
      won, price, commission, probeFees: state.probeFees, paid, gross, net,
      grade: grade ? grade.id : '—', gradeColor: grade ? grade.color : '#8b97a8',
      quip: grade ? grade.quip : (gross > state.hammerPrice * 1.2 ? '走宝了，这箱是好的。' : '躲过一劫，这箱不值。'),
      rounds: state.round, winner: state.winnerName || '流拍',
      itemCount: state.lot.items.length, fakeCount: state.lot.fakeCount,
      categories: [...new Set(state.lot.items.map((it) => it.category))],
    };
    session.ledger.push(entry);
    return { entry, reveals, items: state.lot.items.slice() };
  }

  /* 玩家视角快照。刻意只暴露「玩家该知道的」，避免 UI 顺手把真值画出来。 */
  function view() {
    if (!state) return null;
    const merged = state.publicBook.merge(state.privateBook);
    const cells = Array.from({ length: GRID.rows }, () => new Array(GRID.cols).fill(null));
    for (const item of state.lot.items) {
      const info = merged.get(item.uid);
      if (!info || !info.outline) continue;
      for (let dy = 0; dy < item.h; dy++) {
        for (let dx = 0; dx < item.w; dx++) {
          cells[item.y + dy][item.x + dx] = {
            uid: item.uid, head: dy === 0 && dx === 0, x: item.x, y: item.y,
            w: item.w, h: item.h,
            icon: info.icon || null,
            category: info.category || null, categoryName: info.categoryName || null,
            rarity: info.rarity || null, rarityName: info.rarityName || null,
            rarityColor: info.rarityColor || null,
            conditionName: info.conditionName || null,
            band: info.band || null, fake: !!info.fake,
          };
        }
      }
    }
    return {
      lotIndex: state.lot.index, lotsTotal: cfg.lots,
      theme: { id: state.theme.id, name: state.theme.name, announce: state.theme.announce },
      round: state.round, roundsTotal: ROUNDS, phase: state.phase,
      estimate: knownEstimate(merged, state.lot),
      floorPrice: state.floorPrice, suggest: state.suggest,
      high: visibleHigh(state), hideBid: state.hideBid,
      commissionRate: commissionRate(),
      playerBids: state.playerBids.slice(), playerBest: state.playerBest,
      playerActive: state.playerActive,
      probeLeft: state.probeLeft, readLeft: state.readLeft, probeFees: state.probeFees,
      budgetLeft: session.budget - session.spent,
      grid: { cols: GRID.cols, rows: GRID.rows, cells },
      book: {
        topRarity: merged.topRarity, fakeCount: merged.fakeCount,
        fakeCells: merged.fakeCells, avgNote: merged.avgNote,
      },
      cards: state.cards.slice(),
      rivals: state.rivals.map((r) => ({
        seat: r.seat, name: r.name, face: r.face, active: r.active,
        bids: r.bids.slice(), best: r.best, readBand: r.readBand,
        quip: r.persona.quip[r.quipIndex],
      })),
      hammerPrice: state.hammerPrice, won: state.won, winnerName: state.winnerName,
    };
  }

  return Object.assign(session, { beginLot, bid, probe, readRival, settle, view,
    /* 仅供模拟与调试：暴露真值。UI 不要用。 */
    _truth: () => (state ? { lot: state.lot, rivals: state.rivals } : null),
  });
}

return Object.freeze({
  version: VERSION,
  createSession, makeRng, tidy, gradeOf,
  CATEGORIES, RARITIES, CONDITIONS, THEMES, INSTRUMENTS, PERSONAS, GRADES,
  GRID, ROUNDS, INSTRUMENT_SLOTS, BASE_COMMISSION, ITEM_COUNT_RANGE,
  priorItemValue, priorLotValue, priorDensity,
});
});
