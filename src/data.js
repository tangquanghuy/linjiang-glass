/* Content, described rather than positioned.
   ------------------------------------------------------------------
   Every row the HUD draws is an entry here.  A new stat column, a fifth girl or an
   extra chip on a card is an edit to this file only -- content.js turns each entry
   into the same row component and the layout flows around it.

   Field names, ranges and enums follow 变量相关/变量草稿 (the MVU schema):
     世界信息  年历 / 日期显示 / 时间{时钟,时段} / 位置{区域,场所,私密度} / 事件提示
     玩家信息  体力 / 金钱 / 同行 / 工作 / 居住地 / 粉丝身份 / 背包
     对象信息  羁绊 / 位置 / 性经历 / 开发度 / 生理 / 直播
   Keys here are the English view model the design note asks for -- one adapter
   layer, so no component reads a dozen slash-paths of its own.

   星期、季节、周次、时段 are not computed in this HUD. Live values are written
   back to MVU by 变量相关/辅助计算脚本.js (a tavern script, not this iframe).
   The numbers below are a sample snapshot so the prototype can render.

   Two things the draft states explicitly and this file must not contradict:
   性经历 has no 处女 flag and no "last time" record (「不记录最近一次性行为的时段与场所」,
   「禁止用它反推是否处女」), and 生理 no longer carries 湿润.

   Several strings in the reference image are garbled (it was generated, not
   typeset) -- "好應瘡总览", "菓3周", "心犒：开心" -- so they are written here as the
   text they were meant to be. */

/* How many art sets each category actually has, written by tools/export_item_icons.py.
   See the note in itemIcon for why the hash reads this rather than a constant. */
import artManifest from './item-art.json';
/* 素材根：本地相对路径或 jsDelivr 绝对地址，由构建期决定。见 src/asset.js。 */
import { ASSETS_ROOT } from './asset.js';

export const MOODS = ['开朗', '害羞', '委屈', '发情', '依恋', '困倦', '崩溃'];
export const PERIODS = ['朝', '昼', '暮', '夜', '深夜'];
/* 周一..周日, in the order a week is read.  world.calendar.weekday is one of these, and
   the 开播日程 grid needs the sequence rather than the single value -- the same reason
   PERIODS exists next to world.time.period. */
export const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/* 私密度 0~5, named per the draft's ladder. */
export const PRIVACY = ['闹市人潮', '开放公共', '独立包厢', '视线遮蔽', '偏僻野外', '绝对密闭'];

/* 开发度 档位 0~5.  只升不降. */
export const DEV_TIERS = ['未开发', '初触', '觉醒', '敏感', '熟开', '完全'];
export const DEV_PARTS = [
  ['oral', '口腔'],
  ['chest', '胸', '胸部'],
  ['vagina', '小穴'],
  ['anus', '肛门'],
];

/* 升档门槛，不是固定 100 一档.
   DEV_TIER_STEPS[n] 是从档位 n 升到 n+1 所需的进度；档位 5 封顶后不再累计，所以只有
   五个数.  每档比上一档多要 40/50/60/70 —— 一条“前松后紧”的线，跟这条轴想表达的东西
   一致：第一次被碰到就有反应，最后一档要的是身体被改写。

   DEV_DAILY_CAP 是同一个部位一天最多能吃下的进度，DEV_TURN_CAP 是单轮最多。两个数跟
   门槛是一套的：一天 60 = 三场满额，换算成游戏日就是 1/2/3/4/5 天，全程 15 天。
   （原来一天只给 30，等于两场里第二场只算一半，一档最多能拖到九天。）

   这三个常量在 public/shell/aux-shell.js 与 酒馆变量/mvuzod.js 里各有一份同样的副本：
   那两处跑在酒馆里，拿不到本模块。三处必须同时改。 */
export const DEV_TIER_STEPS = [40, 80, 130, 190, 260];
export const DEV_DAILY_CAP = 60;
export const DEV_TURN_CAP = 20;

/* 一个部位的进度条读数。
   `today` 是这个部位今天已经吃掉的进度（脚本记在 系统配置.进展控制 里）。面板要画它，
   不只是画个「今日已满」标签：一条只显示总量的条无法解释「为什么刚发生了事，条却没动」
   —— 那正是每日上限撞满的样子。所以条上带一段今日增量，撞满时整段换成暖色并挂标签。

   档位 5 没有下一档，进度恒为 0，条满并标 已封顶 —— 显示 0/0 会让人以为数据没读到。 */
export function devProgress(tier, value, today = 0) {
  const t = Math.max(0, Math.min(DEV_TIERS.length - 1, Math.floor(Number(tier) || 0)));
  const need = DEV_TIER_STEPS[t] || 0;
  const day = Math.max(0, Math.min(DEV_DAILY_CAP, Math.floor(Number(today) || 0)));
  const dayFull = day >= DEV_DAILY_CAP;
  const base = { tier: t, today: day, daily: DEV_DAILY_CAP, dayFull };
  if (!need) return { ...base, value: 0, need: 0, pct: 100, todayPct: 0, fromPct: 100, capped: true };
  const v = Math.max(0, Math.min(need, Math.floor(Number(value) || 0)));
  const pct = Math.round((v / need) * 100);
  /* 今日增量不能超过条上已有的长度：升档会把进度清回低位，而今日累计是不清的，
     两者不同步时宁可少画一点，也不要画出一段悬在条外面的高亮。 */
  const todayPct = Math.min(pct, Math.round((Math.min(day, v) / need) * 100));
  return { ...base, value: v, need, pct, todayPct, fromPct: pct - todayPct, capped: false };
}

/* 性经历: the 13 counters the draft now defines, in its own order.  近期性经验次数
   is a decaying window, not a lifetime total, so it is labelled separately.

   凌辱调教 and 催眠奸 were added to the schema after this file was first written.
   Both exist precisely to stop a neighbour from absorbing them, and the draft says
   so outright: 道具与凌辱不要双计 (a session that is mainly restraint and punishment
   counts as 凌辱 even if a toy appeared), and 催眠奸 requires 暗示/洗脑 with the
   subject awake -- drugged or exhausted sleep stays 睡奸, and mere 发情 or 微醺
   counts as neither. */
export const EXPERIENCE_FIELDS = [
  ['recentCount', '近期性经验次数'],
  ['exposure', '露出经验'],
  ['masturbation', '自慰经验'],
  ['excretion', '排泄调教经验'],
  ['toy', '道具调教经验'],
  ['abuse', '凌辱调教经验'],
  ['hidden', '隐奸经验'],
  ['outdoor', '青奸经验'],
  ['sleeping', '睡奸经验'],
  ['hypnosis', '催眠奸经验'],
  ['roleplay', '情趣扮演经验'],
  ['voyeur', '盗摄经验'],
  ['stream', '性直播经验'],
];

/* Reading a 性经历 tally as a bar.
   ------------------------------------------------------------------
   The counters are lifetime tallies with no ceiling anywhere in the schema, so unlike
   羁绊 and 生理 there is no max to divide by -- and inventing one ("/ 50") would state a
   limit the fiction does not have.  What the reader actually wants from these numbers is
   not a ratio but a magnitude: whether something has never happened, happened once, or
   become routine.

   So the scale is a ladder, not a fraction.  Five bands, each roughly double the last,
   because that is how a tally reads: the step from 0 to 1 is the largest one there is,
   the step from 23 to 24 is barely a step.  A band boundary lands on a fifth of the bar,
   and progress inside a band fills into the next fifth proportionally, so every +1 still
   moves the bar while the bands stay where they are.

   The hue ramp runs cool to hot across the bands -- the same reading the rest of the HUD
   uses (blue 体力, violet 顺从, pink/rose 性欲) extended one step past rose into amber.
   It is the band that picks the colour, not the raw number, so two characters with 4 and 5
   of something look alike and 1 against 30 does not. */
export const EXPERIENCE_TIERS = [
  { at: 0, name: '无', hue: 228 },
  { at: 1, name: '初次', hue: 208 },
  { at: 3, name: '尝试', hue: 262 },
  { at: 6, name: '熟悉', hue: 320 },
  { at: 12, name: '频繁', hue: 344 },
  { at: 24, name: '沉溺', hue: 22 },
];

/** Band, band name, hue and bar fill for one 性经历 tally. */
export function experienceLevel(value) {
  const v = Math.max(0, Math.round(value) || 0);
  let level = 0;
  while (level + 1 < EXPERIENCE_TIERS.length && v >= EXPERIENCE_TIERS[level + 1].at) level++;
  const tier = EXPERIENCE_TIERS[level];
  const next = EXPERIENCE_TIERS[level + 1];
  /* Bands are 1-indexed on the bar: band 1 (the first time it ever happened) fills the
     first fifth outright, so a 1 never looks like a 0.  Band 0 is the only empty bar, and
     the top band is full with nowhere left to go. */
  const within = next ? (v - tier.at) / (next.at - tier.at) : 0;
  const pct = next ? ((level + within) / (EXPERIENCE_TIERS.length - 1)) * 100 : 100;
  return { level, name: tier.name, hue: tier.hue, pct: Math.round(pct * 10) / 10 };
}

/* Thresholds the draft states outright, so a meter can mark them instead of
   leaving the player to remember which value unlocks what. */
export const THRESHOLDS = {
  obedience: [350, 600],   // 轻度羞耻服从 / 野外露天与当面小便服从
  desire: [91],            // 强烈渴求
  stamina: [20],           // 深度衰竭 -> 睡奸支线
  bladder: [60, 80],       // 轻度内急 / 极度憋尿
};

/** 牌子等级.  Live writer is 变量相关/辅助计算脚本.js; this only keeps the sample HUD in step. */
export function badgeLevel(tipped) {
  const x = Math.max(0, Number(tipped) || 0);
  if (x <= 0) return 0;
  if (x >= 200000) return 20;
  return Math.min(20, Math.floor(20 * (x / 200000) ** (1 / 3.5)));
}

export function fanLine(fan) {
  const yen = fan.tipped ? `￥${fan.tipped.toLocaleString('en-US')}` : '未打赏';
  const tier = fan.tier && fan.tier !== '无' ? fan.tier : '无牌子';
  const lv = `Lv.${fan.badge || 0}`;
  return { tier, lv, yen, follow: !!fan.follow };
}

function fan({ follow = false, tipped = 0, tier = '无', days = 0, mod = false, muted = false, muteDays = 0 } = {}) {
  return {
    follow,
    tipped,
    badge: badgeLevel(tipped),
    tier,
    days: tier === '无' ? 0 : days,
    mod,
    muted,
    muteDays: muted ? muteDays : 0,
  };
}

export const MAP_MARKER_ITEM = '城市规划蓝图';
/* 每次确定建设要付的建设费。蓝图是用品，使用不扣数量，所以它是可反复用的许可证，
   代价按次收：真正的扣款和拒绝都在宿主（外部部署/V20260826/状态栏.html 的 saveCustomMapNode）里做，
   这个常量只管 HUD 这一侧的显示与按钮禁用。改价时那边要一起改。 */
export const CITY_BUILD_COST = 1000000;
/* 描述是购买时抄进 MVU 的快照，老存档里存的还是没有建设费那一句的旧文案。
   宿主会在下一次写 MVU 时改正，但在那之前显示不该是错的——读的时候就地兜底。 */
export const CITY_BUILD_DESC = `使用后，在地图和世界书中添加你自己的地图节点，并自动将其拥有为自己的资产。每次确定建设另需支付 ￥${CITY_BUILD_COST.toLocaleString('en-US')} 建设费，金钱不足时无法开工；蓝图本身不消耗，可反复使用。`;
export const customMapNodes = [];

export const world = {
  /* 季节 and 周次 are separate fields, not one string: the landscape pane's 何时 line has
     room for 周几 and 季节 but not the week number, while 主角档案 and the portrait column
     want it.  One joined string forced whoever needed half of it to split it back
     apart. */
  calendar: {
    full: '2026年4月17日', date: '4月17日', weekday: '周五', season: '春季', week: '第16周',
  },
  time: { clock: '20:45', period: '夜' },
  location: { area: '鼓岭区 · 云庭公寓', place: '客厅', privacy: 5 },
};

export const player = {
  stamina: 82,
  money: 286450,
  /* 同行 decides whether 私下送礼 is available at all (see giftScenes below), so the
     sample state carries one -- with null the truthy branch of every 同行 readout in
     both layouts would never render. */
  companion: '东雪莲',
  work: {
    job: '便利店店员',
    place: '鼓岭区 · 梧桐里',
    daily: 12000,
    workedToday: false,
  },
  home: '鼓岭区 · 云庭公寓',
  watching: '璃亚梦',
  property: {
    云庭公寓: {
      name: '云庭公寓',
      area: '鼓岭区 · 云庭公寓',
      tenure: '租住',
      desc: '主播和自由职业者聚居的高层，一居，能把人带回来。',
    },
  },
  /* Every item carries a 类别 from its bucket's closed enum -- see
     变量相关/道具分类与图标素材.md.  The point is that this HUD serves an AI-driven
     RP, so which item *names* turn up is open-ended and no hand-authored per-item
     icon set can ever cover it.  The icon is therefore chosen by category, and the
     category is the one thing the model has to pick from a fixed list. */
  inventory: {
    materials: [
      { name: '蓝色野生花瓣', category: '植物', quantity: 6, source: '青屏山采集', description: '带有清凉香气的调配素材。' },
      { name: '月见草籽', category: '植物', quantity: 3, source: '梧桐里花市', description: '适合制作夜间使用的恢复类道具。' },
      { name: '玻璃露珠', category: '矿物', quantity: 2, source: '明湖区采集', description: '折射着浅蓝光泽的稀有素材。' },
    ],
    /* 消耗品: 强度 1~5 is universal now -- food, medicine and daily goods all use
       it, and the description carries what the thing does.  No 效果类型 field. */
    consumables: [
      { name: '微醺甜果酒', category: '饮料', quantity: 2, potency: 2, description: '果香柔和的便携气泡酒，喝下会微醺，防备略降。' },
      { name: '体能补给饮', category: '饮料', quantity: 3, potency: 3, description: '运动饮料，行动后饮用可较快恢复体力。' },
      /* 药物 rather than 食物: the rule is that anything which shifts a physiological
         value is 药物 and anything which only provides convenience is 日用, and this
         one is sold as a candy but its job is to hold off 困倦. */
      { name: '清醒薄荷糖', category: '药物', quantity: 5, potency: 1, description: '强薄荷含片，缓解困倦，适合长时间外出。' },
      { name: '便当', category: '食物', quantity: 1, potency: 3, description: '梧桐里便利店的照烧鸡便当，吃完能回不少体力。' },
    ],
    /* 用品: durable goods.  使用不扣数量; 佩戴 tracks whether it is on her now. */
    goods: [
      { name: '项圈与牵引绳', category: '器具', quantity: 1, worn: false, description: '细软皮革项圈配一条短绳，扣上后便于近距离带着走。' },
      { name: '无线遥控跳蛋', category: '器具', quantity: 1, worn: true, description: '静音款遥控跳蛋，放入后可远距离调节强度。' },
      { name: '护士服与白丝', category: '服装', quantity: 1, worn: false, description: '短款护士服配白色长袜，适合诊疗扮演。' },
    ],
  },
};

const ARCADE_PROFILE_VERSION = 3;
const ARCADE_PROFILE_MILESTONES = [
  { id: 'slot-golden-grape', unlock: 'slot_golden_grape', game: '幸运机', field: '旋转次数', target: 50 },
  { id: 'fish-golden-clown', unlock: 'fish_golden_clown', game: '捕鱼', field: '捕获次数', target: 100 },
  { id: 'fish-starlight-jelly', unlock: 'fish_starlight_jelly', game: '捕鱼', field: '捕获次数', target: 500 },
  { id: 'slot-mystery-cloud', unlock: 'slot_mystery_cloud', game: '幸运机', field: '旋转次数', target: 500 },
  { id: 'fish-deep-bomb', unlock: 'fish_deep_bomb', game: '捕鱼', field: '捕获次数', target: 2000 },
];

export const arcadeProfile = {
  版本: ARCADE_PROFILE_VERSION,
  统计: {
    刮刮乐: { 结算次数: 0, 中奖次数: 0, 最高倍率: 0, 累计返奖: 0 },
    幸运机: { 旋转次数: 0, 中奖次数: 0, 最高倍率: 0, 累计返奖: 0 },
    捕鱼: { 结算次数: 0, 捕获次数: 0, 最高倍率: 0, 累计返奖: 0, 清屏次数: 0 },
  },
  已解锁: {},
  已达成: {},
};

/* 类别 -> icon slug and hue.
   ------------------------------------------------------------------
   Bucket identity is carried by the slot's silhouette (round for 素材, soft square
   for 消耗品, harder square for 用品) and category identity by hue, so the two read
   independently: you can see at a glance that a row is 用品 and that one cell in it
   is 服装 rather than 器具.

   `slug` is the file that will live at /assets/items/<slug>.png.  Until the art
   lands the slot paints a hue-derived gem instead, which is why the hue is here and
   not only in CSS -- swapping in a PNG must not also mean re-picking a colour. */
const CATEGORY_TABLE = {
  植物: { bucket: 'material', slug: 'material-plant', hue: 152 },
  动物: { bucket: 'material', slug: 'material-animal', hue: 38 },
  矿物: { bucket: 'material', slug: 'material-mineral', hue: 262 },
  化学: { bucket: 'material', slug: 'material-chemical', hue: 22 },
  织物: { bucket: 'material', slug: 'material-fabric', hue: 200 },

  食物: { bucket: 'consumable', slug: 'consumable-food', hue: 32 },
  饮料: { bucket: 'consumable', slug: 'consumable-drink', hue: 196 },
  药物: { bucket: 'consumable', slug: 'consumable-medicine', hue: 320 },
  日用: { bucket: 'consumable', slug: 'consumable-daily', hue: 170 },

  服装: { bucket: 'goods', slug: 'goods-clothing', hue: 340 },
  饰品: { bucket: 'goods', slug: 'goods-accessory', hue: 44 },
  器具: { bucket: 'goods', slug: 'goods-implement', hue: 300 },
  器材: { bucket: 'goods', slug: 'goods-equipment', hue: 208 },
};

/* 其他 is per bucket, and it is also where anything unrecognised lands. */
const OTHER_CATEGORY = {
  material: { slug: 'material-other', hue: 228 },
  consumable: { slug: 'consumable-other', hue: 228 },
  goods: { slug: 'goods-other', hue: 228 },
};

/* One of the two normalisations 道具分类与图标素材.md asks the adapter to perform:
   a value outside the enum is rewritten to the bucket's 其他 rather than passed
   through, because a model will invent categories (饮品, 工具, 情趣) and an
   unrecognised one would resolve to no icon at all.  Coercing here means every
   component downstream can assume the category is valid. */
export function resolveCategory(bucket, category) {
  const hit = CATEGORY_TABLE[category];
  if (hit && hit.bucket === bucket) return { label: category, ...hit };
  return { label: '其他', bucket, ...OTHER_CATEGORY[bucket] };
}

/* Telling two items of the same category apart.
   ------------------------------------------------------------------
   One icon per category means 蓝色野生花瓣 and 月见草籽 -- both 植物 -- draw the same
   picture.  In the two full-screen pages that is fine, because the name is on the row
   next to it: the icon says what kind of thing this is and the name says which one.  In
   the drawer it is not, because a cell is icon-only.

   The eventual fix is art: two or three files per category, chosen by this same hash, so
   the two really are different pictures.  Until that exists, the hash instead varies how
   the one picture is *placed* -- a few degrees of tilt and a few percent of scale.  That
   does not say which item it is, but it does say that these are two items rather than one
   drawn twice, which is what was missing.

   Deliberately not a hue shift, which was the first idea and is wrong: the category's
   colour is the one piece of meaning the icon carries (植物 teal, 矿物 violet, 药物
   clinical white), and rotating it per item trades a signal for decoration.

   FNV-1a because it needs to be stable, not strong: the same name must land on the same
   variant on every device and in every save, with nothing stored and nothing for the
   model to decide. */
/* Where the category art is served from.  One constant because it will not stay local:
   moving to a CDN is then this line, the same way the character covers already read from
   a remote host through COVER below.
   —— 这件事已经发生了：ASSETS_ROOT 在 ASSET_CDN=1 的构建里就是 jsDelivr 的绝对地址。 */
export const ITEM_ART = `${ASSETS_ROOT}items`;

/* How many art sets a category can have: <slug>.png, <slug>-2.png, <slug>-3.png.
   This is only the ceiling -- how many a category *actually* has comes from
   src/item-art.json, written by tools/export_item_icons.py. */
export const ART_SETS = 3;

/* 强度 is 1~5 on 消耗品 and does not exist on the other two buckets. */
export const POTENCY_MAX = 5;

const VARIANT_TILT = [-7, -3.5, 0, 3.5, 7];
const VARIANT_SCALE = [0.96, 1.03, 1, 0.98, 1.05];

function nameHash(name) {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  /* FNV alone was not good enough here, and the sample bag showed it: six of ten items
     landed on the same variant, and the two 植物 -- the one pair this exists to tell
     apart -- collided.  FNV's avalanche is weak in the low bits, and `% 5` reads exactly
     those.  This is the lowbias32 finaliser, which mixes the high bits down before the
     modulo sees them. */
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** How many art sets a category actually has on disk, clamped to what the app supports. */
const availableSets = (slug) => Math.max(1, Math.min(ART_SETS, artManifest[slug] || 1));

/* Making sure two items of a category never draw the same picture.
   ------------------------------------------------------------------
   The hash alone cannot promise it.  With three sets, any pair of same-category items has a
   one-in-three chance of colliding, and the sample bag duly collided: 项圈与牵引绳 and
   无线遥控跳蛋 both landed on set 2 and drew the identical pouch.  Two indistinguishable cells
   is the exact problem the extra art was drawn to fix, so it should not be left to luck.

   So the hash picks first and a collision steps to the next free set.  That costs the property
   which made hashing attractive -- a name no longer maps to a picture on its own, so acquiring
   another 器具 can move an existing one.  It is the right trade: nobody is memorising which of
   three collar pictures is theirs, whereas two identical cells in an icon-only rail cannot be
   told apart at all.

   Computed once over the whole inventory rather than per view, because pages.js builds a cell
   straight from itemIcon() with no group context.  Resolving collisions per view would let the
   drawer and the full page disagree about the same item, which is worse than the collision. */
let setChoices = null;

function chooseSets() {
  const choices = new Map();
  for (const [key, , bucket] of INVENTORY_BUCKETS) {
    const taken = new Map();
    for (const item of player.inventory[key] || []) {
      const { slug } = resolveCategory(bucket, item.category);
      const sets = availableSets(slug);
      const used = taken.get(slug) || new Set();
      let set = nameHash(item.name) % sets;
      /* Only while a free one is left: a category holding more items than there are sets has
         to repeat, and stepping forever would hang. */
      while (used.size < sets && used.has(set)) set = (set + 1) % sets;
      used.add(set);
      taken.set(slug, used);
      choices.set(item.name, set);
    }
  }
  return choices;
}

/** Call after the inventory changes, so the spread across art sets is recomputed. */
export function resetItemArt() { setChoices = null; }

/** Everything a cell needs to draw one item: which art, which hue, and how to place it. */
export function itemIcon(bucket, item) {
  const icon = resolveCategory(bucket, item.category);
  const h = nameHash(item.name);
  if (!setChoices) setChoices = chooseSets();
  /* The hash still decides for anything the inventory does not list -- a preview, a test, an
     item being looked at before it is picked up. */
  const set = setChoices.get(item.name) ?? h % availableSets(icon.slug);
  /* Placing comes from a different byte of the same hash, so it stays independent of the set:
     correlating them would waste combinations, and it is worth having either way, because
     three sets across a bag of thirty repeat anyway. */
  const placing = (h >>> 8) % VARIANT_TILT.length;
  const base = `${ITEM_ART}/${icon.slug}.png`;
  return {
    ...icon,
    set,
    placing,
    tilt: VARIANT_TILT[placing],
    scale: VARIANT_SCALE[placing],
    src: set ? `${ITEM_ART}/${icon.slug}-${set + 1}.png` : base,
    /* Null when src *is* the base, so the tag builder knows there is nothing left to try. */
    fallback: set ? base : null,
  };
}

/* The <img> for an item cell, with its fallback chain.
   ------------------------------------------------------------------
   Three tiers, and the chain has exactly one definition here because getting it wrong
   does not throw -- it shows up as one cell in a row quietly missing its picture, which
   is the kind of thing nobody notices until a screenshot:

     <slug>-N.png   the art set this item's name hashes to
        v missing
     <slug>.png     the category's base art, always present
        v missing
     (removed)      the <img> deletes itself, revealing the hue placeholder behind it

   A string handler rather than a listener because these cells are built as markup and
   inserted with innerHTML, so there is no element to bind to at build time.  The second
   step installs the remover as the *new* handler before retrying, which is what makes a
   double failure land on the placeholder instead of looping. */
export function itemIconTag(icon, className) {
  const fallback = icon.fallback ? ` data-fallback-src="${icon.fallback}"` : '';
  return `<img class="${className}" src="${icon.src}" alt="" draggable="false"
    decoding="async" loading="lazy"${fallback} data-remove-on-error>`;
}

/* 强度, as notches filed into the cell's top-right corner.
   ------------------------------------------------------------------
   The previous reading of 强度 was the brightness of the well's glow, and it did not work:
   measured on an empty cell, 强度 1 against 强度 5 came to a mean difference of 3.79 of 255
   -- 1.5% -- and with a lit object sitting on top of it, nothing.  A 1~5 value wants to be
   counted, and a glow cannot be counted.

   Five marks with N lit rather than N marks, because the ceiling is part of the reading:
   three notches alone could be three of three.  They straddle the corner rather than
   sitting inside it, which is what makes them read as cut into the rim instead of drawn on
   the face -- and is why every host has to leave a little room outside the cell.

   Decorative for a screen reader: the cell's own aria-label already says 强度 N. */
export function potencyNotches(potency, className = 'item-notch') {
  if (!potency) return '';
  return `<span class="${className}" aria-hidden="true">${
    Array.from({ length: POTENCY_MAX }, (_, i) => `<i${i < potency ? ' class="on"' : ''}></i>`).join('')
  }</span>`;
}

/* The bottom drawer's rail: one continuous row, grouped by bucket, 用品 first.
   用品 lead because they are the bucket the fiction actually reaches for -- 佩戴 is
   live state and an event can require one by name (see dailyEvents evt-04) -- and
   素材 trail because they are inert until crafting. */
export const INVENTORY_BUCKETS = [
  ['goods', '用品', 'goods'],
  ['consumables', '消耗品', 'consumable'],
  ['materials', '素材', 'material'],
];

export function inventoryRail() {
  return INVENTORY_BUCKETS
    .map(([key, label, bucket]) => ({
      bucket,
      label,
      items: (player.inventory[key] || []).map((item) => ({
        ...item,
        bucket,
        icon: itemIcon(bucket, item),
      })),
    }))
    .filter((group) => group.items.length > 0);
}

/* 池条目 分类: 各分支分类并集
   '纯爱' | '日常' | '生理窘迫' | '调教' | '睡奸' | '催眠奸' | '特殊H' */
export const dailyEvents = [
  {
    id: 'evt-01', area: '鼓岭区 · 云庭公寓', place: '客厅', title: '晚风里的来电',
    category: '日常', priority: 88, status: '可触发',
    conditions: { 好感度: 600 },
    summary: '熟悉的头像在夜色中亮起，似乎有人正等着你的回应。',
  },
  {
    id: 'evt-02', area: '明湖区 · 湖滨商街', place: '日料包厢', title: '迟到的预约',
    category: ['纯爱', '调教'], priority: 72, status: '待触发',
    conditions: { 好感度: 700, 时段: ['暮', '夜'] },
    summary: '一场被临时推迟的晚餐，还留着重新赴约的可能。',
  },
  {
    id: 'evt-03', area: '青屏山风景区 · 青屏山密林', place: '观景崖边', title: '山雾中的微光',
    category: '生理窘迫', priority: 64, status: '待触发',
    conditions: { 顺从度: 600, 尿意: 80 },
    summary: '远处有一束反常的蓝光，附近却找不到任何遮蔽。',
  },
  {
    id: 'evt-04', area: '鼓岭区 · 云庭公寓', place: '自宅卧室', title: '力竭的夜',
    category: '睡奸', priority: 58, status: '待触发',
    conditions: { 体力上限: 20, 需携带道具: '无线遥控跳蛋' },
    summary: '她在沙发上睡得很沉，呼吸绵长，怎么叫都没有反应。',
  },
];

/* The order the draft asks for outright: 可触发 first, then priority, then the ones in
   the area the player is standing in.  It was never implemented -- both event views
   rendered the array as authored -- so it lives here rather than in either view, since
   "which event matters most" is not a property of a layout.

   The third key is only "same area or not".  区域 is a formatted string
   ("鼓岭区 · 梧桐里") with no adjacency anywhere in the schema, so a real distance is
   not available and pretending otherwise would be inventing data. */
const EVENT_STATUS_RANK = { 可触发: 0, 待触发: 1, 已完成: 2, 已过期: 3 };

export function sortedEvents() {
  const here = world.location.area;
  return [...dailyEvents].sort((a, b) =>
    (EVENT_STATUS_RANK[a.status] ?? 9) - (EVENT_STATUS_RANK[b.status] ?? 9)
    || (a.area === here ? 0 : 1) - (b.area === here ? 0 : 1)
    || b.priority - a.priority);
}

export const protagonist = {
  /* One stat, not three.
     ------------------------------------------------------------------
     日期 and 时间 were cells here too, so that both layouts could lay 资金 / 日期 / 时间 out
     as a row of equal numerals.  Neither layout does that any more: 资金 is the only one
     of the three the player spends, and both the portrait column and the landscape pane
     now demote the calendar and the clock to a caption-size context line which reads
     world.calendar and world.time directly.  Two cells whose whole content was a copy of
     those fields are therefore gone rather than left here unread.

     The shape stays a list because that is what a cell is: `unit` prefixes the value in a
     slightly smaller size, `sub.pill` trails it. */
  stats: [
    {
      icon: 'coin', label: '资金',
      valueIcon: 'wallet', unit: '￥', value: '286,450',
      sub: { pill: `+${player.work.daily.toLocaleString('en-US')}` },
    },
  ],
  stamina: { label: '体力', value: player.stamina, max: 100, action: '主角档案' },
};

const COVER = 'https://anchor.bolt.qzz.io/封面';
const cover = (name) => `${COVER}/${name}.webp`;

/* Same host as 封面.  Files are /部位/{人名}/{部位}.webp -- 口腔 胸部 小穴 肛门.
   The UI label can be shorter (胸); the optional third DEV_PARTS field is the
   filename.  Folder is the display name, not coverName: 璃亚梦's covers are
   梦见璃亚梦.webp, her parts live under 璃亚梦/. */
const PART = 'https://anchor.bolt.qzz.io/部位';
export const partFile = (key) => {
  const row = DEV_PARTS.find(([k]) => k === key);
  return row ? (row[2] || row[1]) : key;
};
export const partArt = (name, key) => `${PART}/${name}/${partFile(key)}.webp`;

/* One record per character, matching the MVU shape.  `art*` is the card crop:
   artFx/artFy mark the face in the source, artTx/artTy where it should land in
   the card, artZ the zoom against cover-fit and artOx a leftward composition
   correction.  Per-character values let a full-body cover and a close-up cover
   go through the same crop without one of them breaking.

   `development` carries the 档位, `developmentProgress` the 进度 toward the next one --
   the second is what the panel used to drop on the floor, so a part could sit at 档位 2
   for a week and look identical to the moment it got there.  The 评语 live in the authored matrices under
   变量相关/ (v2 preferred) and are pulled in by tools/extract_dev_matrix.py -> src/dev-matrix.json:
   the draft rewrites a 评语 only when that part's 档位 goes up, so the prose is a
   function of (character, part, tier) and a second copy here could only drift. */
const roster = [
  {
    name: '东雪莲', romaji: 'Lian', theme: 'ice', ornament: 'sparkle',
    artFx: 0.50, artFy: 0.20, artZ: 1.30, artOx: 0.03, artTx: 0.30, artTy: 0.36,
    bond: { favor: 780, obedience: 260, mood: '害羞' },
    physiology: { desire: 18, stamina: 88, bladder: 26, statuses: [] },
    experience: {
      recentCount: 0, exposure: 0, masturbation: 1, excretion: 0,
      toy: 0, abuse: 0, hidden: 0, outdoor: 0, sleeping: 0, hypnosis: 0,
      roleplay: 0, voyeur: 0, stream: 0,
    },
    development: { oral: 1, chest: 1, vagina: 0, anus: 0 },
    developmentProgress: { oral: 34, chest: 12, vagina: 21, anus: 0 },
    developmentToday: { oral: 20, chest: 0, vagina: 60, anus: 0 },
    location: { area: '鼓岭区 · 云庭公寓', place: '客厅', privacy: 5 },
    fan: fan({ follow: true }),
    /* `schedule` is her 档期 -- authored, stable, her habit.  `live` is the fact, written back
       by the tavern script.  The two are allowed to disagree, and the disagreement is the
       point: a 周五 夜 slot with live false is 今日休播, which is what the player wants to
       know.  See streamSchedule below. */
    stream: {
      live: false, title: '', heat: 0,
      schedule: { start: '21:30', end: '00:30', days: ['周一', '周二', '周三', '周四', '周五', '周六'], note: '深夜杂谈·周日休' },
    },
  },
  {
    name: '塔菲', romaji: 'Taffy', theme: 'rose', ornament: 'sparkle',
    artFx: 0.50, artFy: 0.20, artZ: 1.28, artOx: 0.02, artTx: 0.30, artTy: 0.36,
    bond: { favor: 860, obedience: 410, mood: '开朗' },
    physiology: { desire: 34, stamina: 76, bladder: 42, statuses: [] },
    experience: {
      recentCount: 2, exposure: 1, masturbation: 3, excretion: 0,
      toy: 2, abuse: 0, hidden: 1, outdoor: 0, sleeping: 0, hypnosis: 0,
      roleplay: 1, voyeur: 0, stream: 1,
    },
    development: { oral: 3, chest: 2, vagina: 2, anus: 0 },
    developmentProgress: { oral: 96, chest: 58, vagina: 40, anus: 6 },
    developmentToday: { oral: 60, chest: 18, vagina: 0, anus: 6 },
    location: { area: '西洲区 · 星芒电竞舱', place: '电竞舱主播位', privacy: 3 },
    fan: fan({ follow: true, tipped: 4200, tier: '舰长', days: 18 }),
    /* The one who keeps a real schedule, and she is on it right now -- 周五 夜 is a slot and
       live is true, so her cell reads 正在播 rather than 临时开播. */
    stream: {
      live: true, title: '王牌级杂谈：读SC与整活', heat: 18240,
      schedule: { start: '20:00', end: '23:30', days: ['周一', '周二', '周四', '周五', '周六', '周日'], note: '晚间主档·周三休' },
    },
  },
  {
    name: '沙花叉', romaji: 'Chloe', theme: 'crimson', ornament: 'sparkle',
    artFx: 0.50, artFy: 0.18, artZ: 1.16, artOx: 0.06, artTx: 0.30, artTy: 0.35,
    bond: { favor: 710, obedience: 335, mood: '困倦' },
    physiology: { desire: 27, stamina: 69, bladder: 31, statuses: ['微醺'] },
    experience: {
      recentCount: 1, exposure: 0, masturbation: 2, excretion: 0,
      toy: 1, abuse: 0, hidden: 1, outdoor: 0, sleeping: 1, hypnosis: 0,
      roleplay: 0, voyeur: 1, stream: 0,
    },
    development: { oral: 2, chest: 3, vagina: 2, anus: 1 },
    developmentProgress: { oral: 71, chest: 143, vagina: 24, anus: 62 },
    developmentToday: { oral: 0, chest: 40, vagina: 24, anus: 0 },
    location: { area: '明湖区 · 湖滨商街', place: '居酒屋卡座', privacy: 1 },
    fan: fan({ follow: true, tipped: 690, tier: '舰长', days: 12, muted: true }),
    stream: {
      live: false, title: '', heat: 0,
      schedule: { start: '21:00', end: '00:30', days: ['周一', '周二', '周四', '周五', '周日'], note: '历史常用晚间档' },
    },
  },
  {
    name: '时雨羽衣', romaji: 'Ui', theme: 'gold', ornament: 'star',
    artFx: 0.50, artFy: 0.20, artZ: 1.24, artOx: 0.02, artTx: 0.30, artTy: 0.36,
    bond: { favor: 830, obedience: 205, mood: '委屈' },
    physiology: { desire: 12, stamina: 61, bladder: 22, statuses: [] },
    experience: {
      recentCount: 0, exposure: 0, masturbation: 0, excretion: 0,
      toy: 0, abuse: 0, hidden: 0, outdoor: 0, sleeping: 0, hypnosis: 0,
      roleplay: 0, voyeur: 0, stream: 0,
    },
    development: { oral: 0, chest: 0, vagina: 0, anus: 0 },
    developmentProgress: { oral: 0, chest: 0, vagina: 0, anus: 0 },
    developmentToday: { oral: 0, chest: 0, vagina: 0, anus: 0 },
    location: { area: '鼓岭区 · 梧桐里', place: '画室', privacy: 4 },
    fan: fan(),
    /* 不开播的人.  Her schedule is intentionally sparse: the row shows only two weekly
       broadcast days, which is how the page says she is an occasional streamer rather than a daily one, and 时雨羽衣 is the case that
       keeps whoever builds it from assuming every character has a week. */
    stream: {
      live: false, title: '', heat: 0,
      schedule: { start: '22:00', end: '00:30', days: ['周三', '周日'], note: '周更型·日本晚间' },
    },
  },
  {
    name: '红蔷薇', romaji: 'Rose', theme: 'scarlet', ornament: 'sparkle',
    artFx: 0.58, artFy: 0.16, artZ: 1.32, artOx: 0.02, artTx: 0.30, artTy: 0.36,
    bond: { favor: 690, obedience: 480, mood: '发情' },
    physiology: { desire: 46, stamina: 73, bladder: 38, statuses: ['蓝色花粉催情中'] },
    experience: {
      recentCount: 3, exposure: 3, masturbation: 4, excretion: 1,
      toy: 4, abuse: 1, hidden: 2, outdoor: 1, sleeping: 0, hypnosis: 0,
      roleplay: 3, voyeur: 2, stream: 0,
    },
    development: { oral: 4, chest: 3, vagina: 4, anus: 2 },
    developmentProgress: { oral: 118, chest: 162, vagina: 205, anus: 88 },
    developmentToday: { oral: 0, chest: 12, vagina: 60, anus: 0 },
    location: { area: '乌溪区 · 夜巷', place: '情侣酒店', privacy: 5 },
    /* 路人 on the player's side and a streamer on her own: `fan` is the player's account on
       her channel, `schedule` is her schedule.  Keeping one of the two unfollowed streamers in
       the sample stops the grid from being read as "only the ones I follow". */
    fan: fan(),
    stream: {
      live: false, title: '', heat: 0,
      schedule: { start: '19:00', end: '22:00', days: ['周一', '周二', '周四', '周五', '周日'], note: '黄昏音乐台·周三六休' },
    },
  },
  {
    name: '斯黛拉', romaji: 'Stella', theme: 'violet', ornament: 'sparkle',
    artFx: 0.55, artFy: 0.20, artZ: 1.28, artOx: 0.02, artTx: 0.30, artTy: 0.36,
    bond: { favor: 740, obedience: 520, mood: '依恋' },
    physiology: { desire: 39, stamina: 84, bladder: 17, statuses: [] },
    experience: {
      recentCount: 4, exposure: 2, masturbation: 5, excretion: 1,
      toy: 3, abuse: 1, hidden: 3, outdoor: 1, sleeping: 0, hypnosis: 1,
      roleplay: 2, voyeur: 1, stream: 0,
    },
    development: { oral: 3, chest: 4, vagina: 3, anus: 1 },
    developmentProgress: { oral: 133, chest: 47, vagina: 176, anus: 29 },
    developmentToday: { oral: 30, chest: 0, vagina: 0, anus: 29 },
    location: { area: '西洲区 · 极光声学棚', place: '录音棚休息区', privacy: 4 },
    fan: fan({ follow: true, tipped: 80, tier: '办卡', days: 22 }),
    stream: {
      live: false, title: '', heat: 0,
      schedule: { start: '18:30', end: '21:30', days: ['周二', '周三', '周四', '周五', '周六', '周日'], note: '傍晚电台·周一休' },
    },
  },
  {
    name: '璃亚梦', romaji: 'Riamu', theme: 'candy', ornament: 'sparkle', coverName: '梦见璃亚梦',
    artFx: 0.52, artFy: 0.24, artZ: 0.90, artOx: 0.01, artTx: 0.30, artTy: 0.36,
    bond: { favor: 910, obedience: 615, mood: '发情' },
    physiology: { desire: 58, stamina: 72, bladder: 44, statuses: ['极度憋尿'] },
    experience: {
      recentCount: 6, exposure: 5, masturbation: 8, excretion: 3,
      toy: 6, abuse: 2, hidden: 4, outdoor: 2, sleeping: 1, hypnosis: 1,
      roleplay: 4, voyeur: 3, stream: 7,
    },
    development: { oral: 5, chest: 4, vagina: 5, anus: 3 },
    developmentProgress: { oral: 0, chest: 231, vagina: 0, anus: 154 },
    developmentToday: { oral: 0, chest: 60, vagina: 0, anus: 20 },
    location: { area: '鼓岭区 · 云庭公寓', place: '自宅卧室', privacy: 5 },
    fan: fan({ follow: true }),
    /* 深夜 is her slot every time, and she is live at 夜 -- one 时段 early.  So her row carries
       两个 cells today: 临时开播 at 夜 and 档期 at 深夜.  This is the case the schedule exists
       for, and the reason a cell cannot be a boolean. */
    stream: {
      live: true, title: '深夜emo小作文与观众互动', heat: 6310,
      schedule: { start: '23:00', end: '02:00', days: ['周一', '周三', '周四', '周五', '周六', '周日'], note: '深夜互动·周二休' },
    },
  },
];

/* 异常状态, on the card.
   ------------------------------------------------------------------
   This slot used to hold 心里话.  It could not: the card's text column is 97px in
   landscape and 282 in portrait, which is about eight characters either way -- and
   an eight-character window onto a monologue is noise, not a taste.  异常状态 fits
   (微醺 is 2, 蓝色花粉催情中 is 7), it is the one field that says something is
   happening to her *now*, and until now it was only visible after opening a detail
   panel.  心里话 itself stays in the data and in both detail panels, where there is
   room for it.

   The wording was written out three times with two different strings -- the dock and
   the portrait preview said 无异常状态, 羁绊总览 said 状态正常 -- so it is derived
   here instead, for the same reason the favour value is: one source, and the card,
   the dock, the preview and the index cannot disagree. */
export const NO_STATUS = '状态正常';

export const statusOf = (statuses) => ({
  abnormal: Array.isArray(statuses) && statuses.length > 0,
  /* The card slot holds one entry.  蓝色花粉催情中 already uses seven of its eight
     characters, so a second concurrent status is counted rather than joined. */
  text: Array.isArray(statuses) && statuses.length ? statuses[0] : NO_STATUS,
  extra: Math.max(0, (Array.isArray(statuses) ? statuses.length : 0) - 1),
  all: Array.isArray(statuses) ? statuses : [],
});

/* The seven authored characters still own their crop/theme defaults, but the active
   roster comes from MVU 对象信息.  Custom streamers therefore enter the exact same
   girls / characterDetails collections as the authored cast instead of being bolted
   onto the main rail only. */
const rosterByName = new Map(roster.map((c) => [c.name, c]));
const authoredNames = new Set(rosterByName.keys());
const CUSTOM_THEMES = ['rose', 'ice', 'violet', 'gold', 'crimson', 'scarlet', 'candy'];

function createGirlView(c) {
  return {
    name: c.name,
    romaji: c.romaji,
    theme: c.theme,
    ornament: c.ornament,
    art: c.art || cover(c.coverName || c.name),
    artFx: c.artFx, artFy: c.artFy, artZ: c.artZ, artOx: c.artOx, artTx: c.artTx, artTy: c.artTy,
    metric: { icon: 'heart', label: '好感度', value: c.bond.favor, max: 1000 },
    chip: { icon: 'smile', label: '心情', value: c.bond.mood },
    status: statusOf(c.physiology.statuses),
    live: !!c.stream?.live,
    custom: !!c.custom,
  };
}

function createCharacterDetail(c, index) {
  /* Materialised on the roster row, not defaulted into the detail: the detail holds
     references into `c`, so a fresh object here would be a second copy that the MVU
     ingest below never writes to -- the bars would render once and then freeze. */
  c.developmentProgress ||= emptyDevelopmentRecord();
  c.developmentToday ||= emptyDevelopmentRecord();
  return {
    bond: c.bond,
    physiology: c.physiology,
    experience: c.experience,
    development: c.development,
    developmentProgress: c.developmentProgress,
    developmentToday: c.developmentToday,
    developmentNotes: c.developmentNotes || {},
    location: c.location,
    fan: c.fan,
    stream: c.stream,
    index,
    custom: !!c.custom,
  };
}

/* The card shows name, romaji, the favour number, a mood chip and 异常状态.
   Deriving it here rather than duplicating it keeps one favour value in the file, so
   the card and the dock cannot disagree. */
/* Standalone preview keeps the authored sample.  Embedded HUDs start with an empty
   rail and wait for the first authoritative MVU snapshot, so the user never sees a
   false fixed-only roster before custom streamers arrive. */
const useSampleRoster = typeof window === 'undefined' || window.parent === window;
export const girls = useSampleRoster ? roster.map(createGirlView) : [];

export const characterDetails = useSampleRoster
  ? Object.fromEntries(roster.map((c, index) => [c.name, createCharacterDetail(c, index)]))
  : {};

/** 主角档案用：合同、是否到岗、今日是否已上班。点地图不等于上班。 */
export function workState() {
  const work = player.work || { job: null, place: null, daily: 0, workedToday: false };
  const unemployed = !work.job;
  const atWork = !unemployed && work.place === world.location.area;
  return {
    job: work.job,
    place: work.place,
    daily: work.daily || 0,
    workedToday: !!work.workedToday,
    unemployed,
    atWork,
    canClockIn: !unemployed && atWork && !work.workedToday && work.daily > 0,
    reason: unemployed ? '无业'
      : work.workedToday ? '今日已上班'
        : atWork ? '' : '未到岗',
  };
}

/* 今日到岗，as one label plus the tone that carries it.
   Read in three places now -- the landscape status pane's 工作 row, 主角档案 and the
   portrait column -- so it lives with workState rather than being spelled out again
   next to each of them: the four cases are a rule about the contract, not about any
   one panel. */
export function workBadge(work = workState()) {
  if (work.unemployed) return { label: '无业', tone: '' };
  if (work.workedToday) return { label: '已上班', tone: 'is-ok' };
  if (work.atWork) return { label: '在岗未上', tone: 'is-ready' };
  return { label: '未到岗', tone: 'is-warn' };
}

export function homeState() {
  const properties = Object.values(player.property || {});
  const current = properties.find((item) => item.area === player.home) || properties[0] || null;
  return {
    home: player.home,
    current,
    properties,
  };
}

/** 每个对象一行粉丝账。无键视为路人，不补空对象——展示层用默认 fan()。 */
export function fanAccounts() {
  const watching = player.watching || null;
  return girls.map((girl) => {
    const detail = characterDetails[girl.name];
    const record = detail.fan || fan();
    const stream = detail.stream || { live: false, title: '', heat: 0 };
    const fl = fanLine(record);
    const caption = [
      watching === girl.name ? '正在看' : '',
      stream.live
        ? (stream.heat ? `直播中 热度 ${stream.heat.toLocaleString('en-US')}` : '直播中')
        : record.follow ? '已关注' : '路人',
      record.mod ? '房管' : '',
      record.muted ? (record.muteDays > 0 ? `禁言 ${record.muteDays}天` : '禁言中') : '',
    ].filter(Boolean).join(' · ');
    return {
      name: girl.name,
      romaji: girl.romaji,
      art: girl.art,
      theme: girl.theme,
      live: !!stream.live,
      title: stream.title || '',
      heat: stream.heat || 0,
      watching: watching === girl.name,
      follow: !!record.follow,
      tipped: record.tipped || 0,
      badge: record.badge || 0,
      tier: record.tier || '无',
      days: record.days || 0,
      mod: !!record.mod,
      muted: !!record.muted,
      muteDays: record.muteDays || 0,
      caption,
      yen: fl.yen,
      lv: fl.lv,
    };
  }).sort((a, b) =>
    (b.watching - a.watching)
    || (b.live - a.live)
    || (b.follow - a.follow)
    || (b.tipped - a.tipped));
}

/* ------------------------------------------------------------- 开播日程 */

/* The weekly view is person-first: one row per streamer, with a run crossing the
   days she normally broadcasts and a gap on weekly rest days.  This avoids stacking
   several cards into the same time cell when multiple people are live together. */
export const SLOT_STATES = {
  live: { label: '正在播', tone: 'is-live' },
  unplanned: { label: '临时开播', tone: 'is-unplanned' },
  off: { label: '今日休播', tone: 'is-off' },
  booked: { label: '固定档', tone: 'is-booked' },
};

function clockMinutes(clock) {
  const [hour, minute] = String(clock || '00:00').split(':').map(Number);
  return (hour || 0) * 60 + (minute || 0);
}

function inScheduleWindow(now, start, end) {
  if (!start || !end) return false;
  const a = clockMinutes(start);
  const b = clockMinutes(end);
  return b <= a ? now >= a || now <= b : now >= a && now <= b;
}

export function streamSchedule() {
  const weekday = world.calendar.weekday;
  const dayIndex = Math.max(0, WEEKDAYS.indexOf(weekday));
  const watching = player.watching || null;

  const rows = girls.map((girl) => {
    const stream = characterDetails[girl.name].stream || {};
    const schedule = stream.schedule || { start: '', end: '', days: [], note: '' };
    const plannedDays = schedule.days || [];
    const plannedToday = plannedDays.includes(weekday);
    const nowInWindow = inScheduleWindow(clockMinutes(world.time.clock), schedule.start, schedule.end);
    const currentState = !plannedToday
      ? (stream.live ? 'unplanned' : null)
      : stream.live
        ? (nowInWindow ? 'live' : 'unplanned')
        : (nowInWindow ? 'off' : 'booked');

    const days = WEEKDAYS.map((day, index) => {
      const planned = plannedDays.includes(day);
      const isToday = index === dayIndex;
      const active = planned || (isToday && !!stream.live);
      const state = isToday ? currentState : (planned ? 'booked' : null);
      const previousActive = index > 0 && plannedDays.includes(WEEKDAYS[index - 1]);
      const nextActive = index < WEEKDAYS.length - 1 && plannedDays.includes(WEEKDAYS[index + 1]);
      return {
        day, isToday, planned, active, state,
        joinsPrevious: active && previousActive,
        joinsNext: active && nextActive,
      };
    });

    return {
      name: girl.name,
      romaji: girl.romaji,
      theme: girl.theme,
      start: schedule.start || '',
      end: schedule.end || '',
      note: schedule.note || '',
      startMinutes: clockMinutes(schedule.start),
      days,
      plannedToday,
      currentState,
      live: !!stream.live,
      title: stream.live ? stream.title || '' : '',
      heat: stream.live ? stream.heat || 0 : 0,
      watching: watching === girl.name,
    };
  }).sort((a, b) => a.startMinutes - b.startMinutes || a.name.localeCompare(b.name, 'zh-CN'));

  const today = rows.filter((row) => row.days[dayIndex]?.active);
  const liveNow = rows.filter((row) => row.live);
  return {
    weekday,
    clock: world.time.clock,
    now: world.time.period,
    dayIndex,
    days: WEEKDAYS.map((day, index) => ({ day, isToday: index === dayIndex })),
    rows,
    today,
    liveNow,
  };
}

/* scheduleHint used to live here: "7 人排班 · 在播 2 · 6 人今日有档 · 休播 2", four counts
   joined with 中点.  It is gone, and nothing replaced it.  Not one of the four answered a
   question a player has -- how many people are rostered this week is not a decision, and
   the two facts that are (who is live, who has a slot today) are already on the page as
   本人 with 名字: the 今日顺序 chips and the per-row 状态.  Counting them into a header line
   turned a roster into a dashboard, which this interface is not.  If a count is ever
   wanted again, it belongs next to the thing it counts, not in a summary strip. */

/* The tool pod holds four rings, and four is a hard ceiling rather than a preference.
   ------------------------------------------------------------------
   Geometry says the fifth does not fit: the landscape pod is 218 units wide with 22 of
   padding, so 40-unit rings at an 8 gap spend 184 of the 196 available and a fifth needs
   232.  The portrait pod is 356 and spends 340 of it, a fifth needs 428, and the flat run
   of top edge between the title ear and the pod fillet is only 57 units -- so the pod
   cannot be widened into it either.

   Touch says four is already the ceiling.  Measured as rendered pixels: the 44px hit
   areas the `::after` trick draws around each ring are wider than the ring pitch, so
   neighbours already overlap -- 3.8px at a 430px-wide portrait container, 12.2px at 320,
   and 17.8px on a phone held sideways where the rings draw at 20px.  Shrinking the rings
   to make room makes that worse, not better.

   四颗曾经是"三个去处 + 一颗叫更多的发射钮"，更多点开是一条悬浮托盘。托盘撤掉了：
   它是个要精准点的小浮层，而且任何去处都得两步才到。现在环里四颗全是直达去处，
   托盘那批改成 `destinations` 里带文字的按钮，各构图放在自己有空间的地方。

   留在环里的判断标准是"看着场景顺手按的"：事件、背包、地图、手机。它们没有文字标签，
   靠图形认——所以只适合这种按熟了的高频项。需要读一下名字才知道是什么的去处，
   都在 destinations 里带着标签。 */
export const tools = [
  { icon: 'mail', label: '事件提示', page: 'events', get badge() { return dailyEvents.length > 0; } },
  { icon: 'memo', label: '背包', page: 'inventory' },
  { icon: 'mapPin', label: '地图', page: 'map' },
  /* 从托盘提上来的：手机是这批里唯一"随时会摸一下"的，其余三个是特意去一趟的。 */
  { icon: 'phone', label: '随身手机', page: 'phone' },
];

/* 带标签的去处 —— pod 装不下的那些，也是加新功能时要动的注册表。
   ------------------------------------------------------------------
   这批以前藏在 更多 托盘里。托盘的问题不是装不下，是它把每个去处都变成两步，而且那些
   46 单位的小格子在手机上要瞄准点。现在它们是一排（横向）或一格网（竖屏）带文字的按钮，
   一步直达，触摸目标是原来的两倍多。

   为什么不干脆全塞进 pod：pod 是画在玻璃轮廓里的凸起，宽度是量出来的死数
   （横向 218、竖屏 356），第五颗环分别需要 232 和 428 单位，都放不下，而且缩小环会让
   44px 热区重叠得更厉害。见上面 tools 的注释。所以不是"要不要多几颗环"的问题，
   是这批去处从一开始就必须待在环之外。

   `soon` 让未完成的去处保持禁用。曾经还有个 `en` 喂胶囊里那行小拉丁字（SCHEDULE /
   ARCADE / …），已经撤掉：那行字不承载任何信息，中文标签旁边多一行大写拉丁只是装饰，
   撤掉之后胶囊从 52 单位矮到 38（见 dest.css 与 content.js 的 DEST_RAIL）。

   `short` 是给竖屏那一格网用的：格子只有 176~190 单位宽，"开播日程表" 五个字在
   --fs-caption 下正好顶满、会折成三行。所以竖屏只画图标 + 这个两字缩写（完整名字仍在
   aria-label 里），横向那排空间够，照旧用完整的 label。

   主角档案 和 羁绊总览 曾经也在这里，现在都不在，但两个页面都还活着 —— 删的是入口不是
   路由：两个构图的体力行上都有一颗人像钮直开 主角档案，竖屏的 主角档案 里有一行通到
   羁绊总览。PAGES / PORTRAIT_PAGES 里对应的条目都得留着，否则那几颗按钮指向空路由。 */
export const destinations = [
  {
    icon: 'calendar', label: '开播日程表', short: '日程', page: 'schedule',
    note: '本周谁在哪个时段开播',
  },
  {
    icon: 'arcade', label: '幸运街机', short: '街机', page: 'arcade',
    note: '刮刮乐、老虎机、钓鱼、祈愿',
  },
  {
    icon: 'shop', label: '代币商店', short: '商店', page: 'shop',
    note: '用街机代币兑换用品',
  },
  {
    icon: 'gallery', label: 'CG 鉴赏', short: 'CG', page: 'cg',
    note: '已解锁的场景回看',
  },
  /* 排最后，而且是唯一一个不是"游戏里的去处"的条目：这一颗是这台机器本身的开关。 */
  {
    icon: 'gear', label: '全局设置', short: '设置', page: 'settings',
    note: '默认停靠方式、背包按钮行为',
  },
];

/* ------------------------------------------------------------------- 送礼 */
/* Two scenes, and they are not one screen with two skins.
   ------------------------------------------------------------------
   什么在被花掉 differs (金钱 against 背包数量), 清单是否闭合 differs (a fixed
   platform menu against an open bag an AI keeps inventing names for), and 公开性
   differs.  So the two have separate menus, separate cell shapes and separate
   结算 -- see 变量相关/送礼与喜好.md, which is the authored source this mirrors.

   The single most important rule here comes from the world book rather than from
   game balance: 打赏 does not buy 好感.  vtuber.json's 真实直播规则 三 says money
   cannot make her do what she does not want to, and 合理性审查 四 says a few
   hundred is a ripple that at most earns your ID being read out.  So a tip's
   real currency is `notice` -- the chance of being seen -- and 好感 barely moves.
   私下送礼 is where 好感 actually moves. */

/* Where the platform gift art will live.  Nothing is drawn there yet: every cell
   falls back to the hue-derived gem, the same drop-in slot the item cells use, so
   dropping the PNGs in later is the whole integration.  See
   变量相关/直播礼物图标素材.md for the eleven files and their requirements. */
export const GIFT_ART = `${ASSETS_ROOT}gifts`;

/* 念ID 的概率档.  Deliberately words rather than a number: the world book gives no
   rate and inventing one would state a precision the fiction does not have. */
export const NOTICE = ['几乎不会', '偶尔', '较高', '几乎必然'];

/* The fixed menu.  `price` is ￥ at this game's own rate -- not a real platform's
   price list, which is why nothing here carries a platform name.
   `favor` is 0~3 for the whole ladder, and it is not proportional to price: 情书
   costs a fifth of 火箭 and reads warmer, which is what stops the ladder from being
   a straight "more money is more affection" line. */
export const GIFT_MENU = [
  {
    slug: 'gift-heart', name: '小心心', price: 0, group: '免费', hue: 344,
    notice: 0, favor: [0, 1], note: '观看时长兑换，数量有限。纯表态。',
  },
  {
    slug: 'gift-snack', name: '辣条', price: 1, group: '低价', hue: 22,
    notice: 0, favor: [0, 1], note: '刷量的起步价。单发没有任何水花。',
  },
  {
    slug: 'gift-cheers', name: '干杯', price: 20, group: '低价', hue: 196,
    notice: 1, favor: [0, 1], note: '够被顺手念一句谢谢，也可能被漏掉。',
  },
  {
    slug: 'gift-blindbox', name: '心愿盲盒', price: 50, group: '中价', hue: 262,
    notice: 1, favor: [0, 2], random: true,
    note: '随机开出，可能翻出高价礼物——所以效果无法预告。',
  },
  {
    slug: 'gift-letter', name: '情书', price: 100, group: '中价', hue: 340,
    notice: 2, favor: [1, 3],
    note: '同价位里念ID概率最高的一件：它表达的东西比价格明确。',
  },
  {
    slug: 'gift-plane', name: '小飞机', price: 200, group: '高价', hue: 208,
    notice: 2, favor: [1, 3], banner: true, note: '触发直播间飘屏。',
  },
  {
    slug: 'gift-tower', name: '摩天大楼', price: 520, group: '高价', hue: 44,
    notice: 2, favor: [1, 3], banner: true, note: '触发直播间飘屏。',
  },
  {
    slug: 'gift-rocket', name: '火箭', price: 1288, group: '顶价', hue: 8,
    notice: 3, favor: [2, 3], banner: true,
    note: '全站飘屏，几乎必然被念到ID并得到一句专门的感谢——上限就到这里。',
  },
];

/* 办卡 is not a gift, it is a subscription, and it is the only entry with a lasting
   effect: 真实直播规则 五 says a 舰长's 弹幕 gets seen first and their ID is actually
   remembered.  Three tiers, one at a time, never stacked -- which is why it cannot
   share the menu's quantity stepper and has to be its own group. */
/* Each tier says what it adds rather than repeating the mechanic, and the top one says
   what it does *not* buy -- 真实直播规则 五 is explicit that a 大老板 does not get
   obedience, because the platform has rules and the rest of the room is watching. */
export const GUARD_TIERS = [
  {
    slug: 'gift-guard-1', name: '舰长', price: 138, rank: 1, hue: 200,
    note: '入门档。弹幕会被优先看到。',
  },
  {
    slug: 'gift-guard-2', name: '提督', price: 1998, rank: 2, hue: 44,
    note: '中档。ID 会被真正记住，开播时会被点到。',
  },
  {
    slug: 'gift-guard-3', name: '总督', price: 19998, rank: 3, hue: 280,
    note: '顶档。她会照顾你的情绪，但平台有规矩、其他观众也在看——再往上买不到东西了。',
  },
];

export const GUARD_DAYS = 30;

/* Three bands in the tray, not five.
   `group` stays the fine label because the confirm card has room to say 顶价; the
   rail does not.  A divider costs 30 units of a 1573-unit rail and five of them plus
   办卡 is 180 -- more than a cell and a half spent on captions for groups of one. */
const GIFT_BANDS = [
  ['常规', ['免费', '低价', '中价']],
  ['高价', ['高价', '顶价']],
];

/** The tray's groups, in price order, with 办卡 last. */
export function giftRail() {
  const groups = GIFT_BANDS.map(([label, members]) => ({
    label,
    kind: 'gift',
    items: GIFT_MENU.filter((gift) => members.includes(gift.group)),
  })).filter((group) => group.items.length);
  groups.push({
    label: '办卡',
    kind: 'guard',
    items: GUARD_TIERS.map((tier) => ({ ...tier, guard: true, group: '办卡' })),
  });
  return groups;
}

/* Everything a platform-gift cell needs.  Same two-step fallback contract as
   itemIcon so itemIconTag can draw either kind: no art on disk yet, so `fallback`
   is null and the <img> removes itself, revealing the gem. */
export function giftIcon(gift) {
  return {
    label: gift.group,
    hue: gift.hue,
    src: `${GIFT_ART}/${gift.slug}.png`,
    fallback: null,
    tilt: 0,
    scale: 1,
    set: 0,
    placing: 0,
  };
}

/* ---------------------------------------------------------------- 场景 */

/* Which of the two scenes are open for her, right now.
   Derived rather than stored: 直播中 comes from her own 直播 record and 在身边 from
   /玩家信息/同行.  对象.位置 says where she is; 同行 is whether you are actually
   together.  Same building without 同行 is not 私下送礼. */
export function giftScenes(name) {
  const detail = characterDetails[name];
  const live = !!detail?.stream?.live;
  const near = player.companion === name;
  return {
    live,
    near,
    /* Both can be true: she is streaming while sitting next to you.  Rare, but it has
       to be defined or the tray would have to pick one and hide the other. */
    any: live || near,
    /* 私下 leads when she is actually here -- handing something over beats tipping
       someone in the same room. */
    primary: near ? 'private' : live ? 'stream' : null,
    reason: live || near ? '' : '未开播 · 不在身边',
  };
}

/** The button's label follows the scene, so it never promises the wrong panel. */
export function giftLabel(scenes) {
  if (scenes.near && scenes.live) return '送礼 / 打赏';
  if (scenes.near) return '送礼';
  if (scenes.live) return '打赏';
  return '送礼';
}

/* ------------------------------------------------------- the outgoing line */

/* What the player actually hands to the model.
   ------------------------------------------------------------------
   There is no transport yet -- no chat bridge, no MVU writer, nothing (see the note
   at the top of this file).  So this builds the string and the payload and hands them
   back; src/gifts.js logs them and marks the control 尚未发送 the same way the settings
   page marks its dead switches.

   The HUD does not judge the gift, and that is a decision rather than an omission.
   An earlier pass had it computing a 契合度 band from a per-character keyword table and
   showing the verdict on the cell.  It cannot work here: the bag is filled by an AI, so
   the item *names* are open-ended, and keyword matching against them is a guess that
   will regularly disagree with what the model then narrates -- at which point the HUD
   has told the player 最爱 about something she turns out to hate.  It also hands the
   player an answer that is meant to be discovered.

   The 喜好 rules live in the world book entry (变量相关/送礼与喜好.md), which is where
   the model reads them.  One copy, on the side that actually does the judging.  So this
   sends what the thing *is* and stops there. */
export function giftMessage(scene, target, gift, { qty = 1, remark = '' } = {}) {
  if (scene === 'guard') {
    return `[上舰] 你成为了${target}的${gift.name}（${GUARD_DAYS} 天）。`;
  }
  if (scene === 'stream') {
    const cost = gift.price * qty;
    return `消费${cost}，送出${qty}个${gift.name}`;
  }
  const tail = remark ? `，并说：「${remark}」` : '。';
  return `${gift.name}数量-${qty}\n你把「${gift.name}」递给了${target}${tail}`;
}

/* Facts only.  No 契合度, no expected 好感度 -- see the note above giftMessage for why
   the HUD deliberately does not judge the gift.  What the model gets is what the thing
   is; what it makes of that is its own call, against the 喜好 table in the world book
   entry (变量相关/送礼与喜好.md). */
export function giftPayload(scene, target, gift, { qty = 1, remark = '' } = {}) {
  const base = { scene, target, item: gift.name, qty, remark };
  if (scene === 'private') {
    return {
      ...base,
      category: gift.category,
      bucket: gift.bucket,
      description: gift.description,
      cost: 0,
    };
  }
  return {
    ...base,
    category: gift.group,
    bucket: scene,
    cost: gift.price * (scene === 'guard' ? 1 : qty),
    notice: NOTICE[gift.notice ?? 0] ?? null,
  };
}

/* One resolver for both layouts.
   ------------------------------------------------------------------
   The landscape tray and the portrait page pick gifts through completely different
   interactions -- a floating card against a row that expands in place -- but what
   leaves the HUD has to be identical, so the lookup and the two builders live here
   rather than once per layout.  `kind` is the caller's axis ('private' from the bag,
   'tip' from the platform menu); `scene` is the schema's, and 办卡 splits off it
   because a subscription is not a gift. */
export function resolveGift(name, kind, key) {
  if (kind === 'private') {
    const item = inventoryRail().flatMap((g) => g.items).find((row) => row.name === key);
    return item ? { scene: 'private', gift: item } : null;
  }
  const gift = giftRail().flatMap((group) => group.items).find((g) => g.slug === key);
  if (!gift) return null;
  return { scene: gift.guard ? 'guard' : 'stream', gift };
}

export function buildGift(name, kind, key, { qty = 1, remark = '' } = {}) {
  const hit = resolveGift(name, kind, key);
  if (!hit) return null;
  const { scene, gift } = hit;
  return {
    ...hit,
    message: giftMessage(scene, name, gift, { qty, remark }),
    payload: giftPayload(scene, name, gift, { qty, remark }),
  };
}

/* Live MVU snapshot → the view model this file already exports.
   ------------------------------------------------------------------
   The HUD never reads parent.Mvu.  变量相关/状态栏.html does that, then posts
   stat_data here.  Objects stay the same exports so every panel can keep its
   current imports; we mutate in place and tell listeners to repaint. */

const GIRL_NAME_ALIAS = {
  永雏塔菲: '塔菲',
  沙花叉克萝伊: '沙花叉',
  梦见璃亚梦: '璃亚梦',
  伊贺栖寅: '斯黛拉',
  '斯黛拉（伊贺栖寅）': '斯黛拉',
};

const liveListeners = new Set();
let lastSnapshotJson = '';

export function onLive(fn) {
  liveListeners.add(fn);
  return () => liveListeners.delete(fn);
}

/* Arcade / clock-in write 金钱 without waiting for the next full snapshot. */
export function applyArcadeProfile(raw, { notify = true } = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const sourceVersion = Math.max(0, Math.floor(asNum(src.版本, 0)));
  arcadeProfile.版本 = ARCADE_PROFILE_VERSION;
  const stats = src.统计 && typeof src.统计 === 'object' ? src.统计 : {};
  for (const [game, defaults] of Object.entries(arcadeProfile.统计)) {
    const row = stats[game] && typeof stats[game] === 'object' ? stats[game] : {};
    for (const key of Object.keys(defaults)) defaults[key] = Math.max(0, asNum(row[key], 0));
  }
  arcadeProfile.已解锁 = src.已解锁 && typeof src.已解锁 === 'object' ? { ...src.已解锁 } : {};
  arcadeProfile.已达成 = src.已达成 && typeof src.已达成 === 'object' ? { ...src.已达成 } : {};
  if (sourceVersion < ARCADE_PROFILE_VERSION) {
    for (const milestone of ARCADE_PROFILE_MILESTONES) {
      const reached = asNum(arcadeProfile.统计[milestone.game]?.[milestone.field]) >= milestone.target;
      if (reached) {
        arcadeProfile.已达成[milestone.id] = true;
        arcadeProfile.已解锁[milestone.unlock] = true;
      } else {
        delete arcadeProfile.已达成[milestone.id];
        delete arcadeProfile.已解锁[milestone.unlock];
      }
    }
  }
  if (notify) emitLive();
  return arcadeProfile;
}

export function applyMoney(value) {
  const n = Math.max(0, Math.round(asNum(value)));
  if (n === Math.round(asNum(player.money))) return false;
  player.money = n;
  syncViews();
  emitLive();
  return true;
}

function emitLive() {
  liveListeners.forEach((fn) => {
    try { fn(); }
    catch (err) { console.warn('[hud] live', err); }
  });
}

function canonGirlName(name) {
  if (name == null) return null;
  const key = String(name).trim();
  if (!key || key === 'null' || key === '无') return null;
  return GIRL_NAME_ALIAS[key] || escapeMarkupText(key);
}

function pickNamed(record, name) {
  if (!record || typeof record !== 'object') return null;
  if (record[name]) return record[name];
  for (const [key, value] of Object.entries(record)) {
    if (canonGirlName(key) === name) return value;
  }
  return null;
}

function asNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function escapeMarkupText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function asStr(value, fallback = '') {
  if (value == null) return fallback;
  const text = String(value).trim();
  return text ? escapeMarkupText(text) : fallback;
}

function shortDate(full) {
  const match = String(full || '').match(/(\d+)\s*月\s*(\d+)\s*日/);
  return match ? `${match[1]}月${match[2]}日` : asStr(full);
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function customTheme(name) {
  return CUSTOM_THEMES[stableHash(name) % CUSTOM_THEMES.length];
}

function configuredCustomTheme(room, name) {
  const selected = String(room?.代表色 || room?.主题色 || '').trim().toLowerCase();
  return CUSTOM_THEMES.includes(selected) ? selected : customTheme(name);
}

function placeholderCharacterArt(name, theme = customTheme(name)) {
  const palette = {
    rose: ['#48152d', '#f45b9f'], ice: ['#123849', '#57d8ff'], violet: ['#291842', '#a879ff'],
    gold: ['#453314', '#ffd56a'], crimson: ['#471522', '#ff5a73'], scarlet: ['#492115', '#ff8b52'],
    candy: ['#173d36', '#61e0b4'],
  }[theme] || ['#242438', '#9b82ff'];
  const label = String(name || '主播');
  const glyph = Array.from(label)[0] || '播';
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1080" viewBox="0 0 720 1080">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${palette[0]}"/><stop offset="1" stop-color="${palette[1]}"/></linearGradient></defs>
    <rect width="720" height="1080" fill="url(#g)"/><circle cx="360" cy="400" r="210" fill="rgba(255,255,255,.12)"/>
    <text x="360" y="470" text-anchor="middle" font-size="250" font-family="sans-serif" fill="rgba(255,255,255,.88)">${glyph}</text>
    <text x="360" y="840" text-anchor="middle" font-size="66" font-family="sans-serif" fill="white">${label}</text>
    <text x="360" y="910" text-anchor="middle" font-size="30" letter-spacing="9" font-family="sans-serif" fill="rgba(255,255,255,.66)">STREAMER</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
}

function safeCharacterArt(value, fallback) {
  const text = String(value || '').trim();
  if (/^data:image\/(?:png|jpe?g|webp|gif|avif);base64,/i.test(text)) return escapeMarkupText(text);
  try {
    const url = new URL(text);
    if (url.protocol === 'https:' || url.protocol === 'http:') return escapeMarkupText(url.href);
  } catch { /* fall through */ }
  return fallback;
}

function emptyExperienceRecord() {
  return Object.fromEntries(EXPERIENCE_FIELDS.map(([key]) => [key, 0]));
}

function emptyDevelopmentRecord() {
  return Object.fromEntries(DEV_PARTS.map(([key]) => [key, 0]));
}

function scheduleFromRoom(room, fallback = null) {
  const current = fallback || { start: '', end: '', days: [], note: '' };
  const text = String(room?.档期 || room?.常用直播时间 || '').trim();
  const match = text.match(/(\d{1,2}:\d{2})\s*(?:–|—|-|~|至|到)\s*(?:次日\s*)?(\d{1,2}:\d{2}|24:00)/);
  const start = match ? match[1].padStart(5, '0') : current.start || '';
  const end = match ? (match[2] === '24:00' ? '00:00' : match[2].padStart(5, '0')) : current.end || '';
  const namedDays = WEEKDAYS.filter((day) => text.includes(day));
  const days = namedDays.length
    ? namedDays
    : Array.isArray(current.days) && current.days.length
      ? current.days
      : (start && end ? [...WEEKDAYS] : []);
  return {
    start,
    end,
    days,
    note: asStr(text, current.note || (start && end ? '常用直播档' : '不固定')),
  };
}

function createDynamicCharacter(name, room, ui) {
  const theme = configuredCustomTheme(room, name);
  const coverArt = room?.封面 || pickNamed(ui?.characterCovers, name);
  const handle = room?.主播网名 ?? room?.网名 ?? pickNamed(ui?.characterHandles, name);
  const c = {
    name,
    romaji: asStr(handle, 'CUSTOM'),
    theme,
    ornament: stableHash(name) % 4 === 0 ? 'star' : 'sparkle',
    art: safeCharacterArt(coverArt, placeholderCharacterArt(name, theme)),
    artFx: 0.5, artFy: 0.22, artZ: 1.08, artOx: 0, artTx: 0.30, artTy: 0.36,
    bond: { favor: 0, obedience: 0, mood: '平静' },
    physiology: { desire: 0, stamina: 100, bladder: 0, statuses: [] },
    experience: emptyExperienceRecord(),
    development: emptyDevelopmentRecord(),
    developmentProgress: emptyDevelopmentRecord(),
    developmentToday: emptyDevelopmentRecord(),
    developmentNotes: {},
    location: { area: '', place: '', privacy: 0 },
    fan: fan(),
    stream: { live: false, title: '', heat: 0, followers: 0, schedule: scheduleFromRoom(room) },
    custom: true,
  };
  rosterByName.set(name, c);
  return c;
}

function syncDynamicPresentation(c, room, ui) {
  if (!c.custom) return;
  c.theme = configuredCustomTheme(room, c.name);
  const handle = room?.主播网名 ?? room?.网名 ?? pickNamed(ui?.characterHandles, c.name);
  if (handle != null && String(handle).trim()) c.romaji = asStr(handle, c.romaji || 'CUSTOM');
  const coverArt = room?.封面 || pickNamed(ui?.characterCovers, c.name);
  c.art = safeCharacterArt(coverArt, placeholderCharacterArt(c.name, c.theme));
  c.stream.schedule = scheduleFromRoom(room, c.stream.schedule);
}

function reconcileRoster(objects, rooms, ui) {
  if (!objects || typeof objects !== 'object' || Array.isArray(objects)) return;
  const next = [];
  const seen = new Set();
  Object.keys(objects).forEach((rawName) => {
    const name = canonGirlName(rawName);
    if (!name || seen.has(name)) return;
    seen.add(name);
    const room = pickNamed(rooms, name) || {};
    const c = rosterByName.get(name) || createDynamicCharacter(name, room, ui);
    c.stream.schedule = scheduleFromRoom(room, c.stream.schedule);
    syncDynamicPresentation(c, room, ui);
    next.push(c);
  });
  /* A just-created chat can briefly expose 世界信息 before 对象信息 is populated.
     Keep the authored preview for that transient frame, then switch to MVU order as
     soon as at least one object exists. */
  if (next.length) roster.splice(0, roster.length, ...next);
}

function mapCustomNodes(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
  return Object.entries(obj).map(([id, raw]) => {
    if (!raw || typeof raw !== 'object') return null;
    const name = String(raw.名称 || '').trim();
    const plate = String(raw.底板 || '').trim();
    const pos = Array.isArray(raw.区内坐标) ? raw.区内坐标.map(Number) : [];
    if (!id || !name || !plate || pos.length < 2 || !pos.every(Number.isFinite)) return null;
    const aliases = Array.isArray(raw.别名) ? raw.别名.map(v => String(v || '').trim()).filter(Boolean) : [];
    const hours = Array.isArray(raw.开放时段) ? raw.开放时段.map(v => String(v || '').trim()).filter(Boolean) : [];
    const special = Array.isArray(raw.特殊) ? raw.特殊.map(v => String(v || '').trim()).filter(Boolean) : [];
    const features = raw.功能 && typeof raw.功能 === 'object' ? raw.功能 : {};
    return {
      id: String(id), name, aliases,
      district: String(raw.区域 || '').trim(), plate,
      localPos: [Math.max(0, Math.min(1, pos[0])), Math.max(0, Math.min(1, pos[1]))],
      anchorId: String(raw.锚点 || '').trim(), anchorName: String(raw.锚点名称 || '').trim(),
      accessKm: Math.max(0, Number(raw.接驳距离) || 0),
      archetype: String(raw.类型 || 'living').trim() || 'living',
      privacy: Math.max(0, Math.min(5, Math.round(Number(raw.私密度) || 0))),
      openHours: hours.length ? hours : ['朝', '昼', '暮', '夜', '深夜'],
      intro: String(raw.简介 || '').trim(), draw: String(raw.看点 || '').trim(), special,
      features: { canGather: !!features.可采集, canDate: !!features.可约会, canWork: !!features.可工作, hasShop: !!features.有商店 },
      createdAt: String(raw.创建时间 || '').trim(), custom: true,
    };
  }).filter(Boolean);
}

function mapBag(obj, kind) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
  return Object.values(obj)
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const row = {
        name: asStr(item.名称),
        category: asStr(item.类别, '其他'),
        quantity: asNum(item.数量, 0),
        description: asStr(item.描述),
        rarity: asStr(item.品级),
      };
      if (kind === 'materials') row.source = asStr(item.来源);
      if (kind === 'consumables') row.potency = asNum(item.强度, 1);
      if (kind === 'goods') row.worn = !!item.佩戴;
      /* 蓝图的说明书里必须写着建设费，否则玩家点「使用」之前不知道要花钱。
         老存档存的是旧文案，这里覆盖掉——真源是 CITY_BUILD_DESC。 */
      if (row.name === MAP_MARKER_ITEM) row.description = CITY_BUILD_DESC;
      return row;
    })
    .filter((row) => row.name);
}

function mapProperty(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  Object.entries(obj).forEach(([key, value]) => {
    if (!value || typeof value !== 'object') return;
    out[key] = {
      name: asStr(value.名称, key),
      area: asStr(value.区域),
      tenure: asStr(value.产权),
      desc: asStr(value.描述),
    };
  });
  return out;
}

function mapEvents(pool) {
  if (!pool || typeof pool !== 'object') return [];
  return Object.entries(pool).map(([id, ev]) => {
    if (typeof ev === 'string') {
      return {
        id, area: '', place: '', title: id, category: '日常',
        priority: 50, status: '待处理', conditions: {}, summary: ev, notice: true,
      };
    }
    return {
      id,
      area: asStr(ev?.区域),
      place: asStr(ev?.场所),
      title: asStr(ev?.标题, id),
      category: ev?.分类 ?? '日常',
      priority: asNum(ev?.优先级, 0),
      status: asStr(ev?.状态, '待触发'),
      conditions: ev?.条件 && typeof ev.条件 === 'object' ? ev.条件 : {},
      summary: asStr(ev?.简述),
    };
  });
}
function syncViews() {
  const active = new Set(roster.map((c) => c.name));
  const nextGirls = roster.map((c, index) => {
    c.custom = !authoredNames.has(c.name);
    const current = girls.find((row) => row.name === c.name);
    const view = createGirlView(c);
    const g = current ? Object.assign(current, view) : view;
    const detail = characterDetails[c.name];
    if (detail) Object.assign(detail, createCharacterDetail(c, index));
    else characterDetails[c.name] = createCharacterDetail(c, index);
    return g;
  });
  girls.splice(0, girls.length, ...nextGirls);
  Object.keys(characterDetails).forEach((name) => {
    if (!active.has(name)) delete characterDetails[name];
  });

  const money = asNum(player.money);
  const daily = asNum(player.work?.daily);
  protagonist.stats[0].value = money.toLocaleString('en-US');
  protagonist.stats[0].sub.pill = `+${daily.toLocaleString('en-US')}`;
  protagonist.stamina.value = asNum(player.stamina);
}

export function applyStatData(stat, ui = {}) {
  if (!stat || typeof stat !== 'object' || !stat.世界信息) return false;
  let json = '';
  try { json = JSON.stringify([stat, ui]); }
  catch { json = ''; }
  if (json && json === lastSnapshotJson) return false;
  lastSnapshotJson = json;

  const info = stat.世界信息 || {};
  const cal = info.日期显示 || {};
  const time = info.时间 || {};
  const loc = info.位置 || {};
  world.calendar.full = asStr(info.年历, world.calendar.full);
  world.calendar.date = shortDate(world.calendar.full);
  world.calendar.weekday = asStr(cal.星期, world.calendar.weekday);
  world.calendar.season = asStr(cal.季节, world.calendar.season);
  world.calendar.week = cal.年内周次 != null ? `第${asNum(cal.年内周次)}周` : world.calendar.week;
  world.time.clock = asStr(time.时钟, world.time.clock);
  world.time.period = asStr(time.时段, world.time.period);
  world.location.area = asStr(loc.区域, world.location.area);
  world.location.place = asStr(loc.场所, world.location.place);
  world.location.privacy = asNum(loc.私密度, world.location.privacy);

  applyArcadeProfile(stat.系统配置?.街机, { notify: false });
  customMapNodes.splice(0, customMapNodes.length, ...mapCustomNodes(stat.系统配置?.地图?.自建节点));

  const me = stat.玩家信息 || {};
  const work = me.工作 || {};
  player.stamina = asNum(me.体力, player.stamina);
  player.money = asNum(me.金钱, player.money);
  player.companion = canonGirlName(me.同行);
  player.watching = canonGirlName(me.所在直播间);
  player.home = asStr(me.居住地, player.home);
  player.work.job = work.职业 == null || work.职业 === '' ? null : asStr(work.职业);
  player.work.place = work.地点 == null || work.地点 === '' ? null : asStr(work.地点);
  player.work.daily = asNum(work.日收入, 0);
  player.work.workedToday = !!work.今日已上班;
  player.property = mapProperty(me.房产);
  const bag = me.背包 || {};
  player.inventory.materials = mapBag(bag.素材, 'materials');
  player.inventory.consumables = mapBag(bag.消耗品, 'consumables');
  player.inventory.goods = mapBag(bag.用品, 'goods');
  resetItemArt();

  const events = mapEvents(info.事件提示);
  dailyEvents.length = 0;
  dailyEvents.push(...events);

  const objects = stat.对象信息 || {};
  const fans = me.粉丝身份 || {};
  const rooms = stat.系统配置?.直播间 || {};
  /* 当日累计进度 lives under 系统配置, not under the girl -- it is bookkeeping the
     tavern script owns, and the AI never sees it.  The panel needs it anyway: without
     it a part that has hit its daily ceiling looks identical to one that simply had
     nothing happen, which is the single most confusing state on this axis.
     The script zeroes the counter on the first update of a new game day, so whatever
     is in the snapshot is already scoped to today. */
  const devControls = stat.系统配置?.进展控制?.对象 || {};
  reconcileRoster(objects, rooms, ui);
  roster.forEach((c) => {
    const block = pickNamed(objects, c.name);
    if (block) {
      const bond = block.羁绊 || {};
      c.bond.favor = asNum(bond.好感度, c.bond.favor);
      c.bond.obedience = asNum(bond.顺从度, c.bond.obedience);
      c.bond.mood = asStr(bond.心情, c.bond.mood);
      const place = block.位置 || {};
      c.location.area = asStr(place.区域, c.location.area);
      c.location.place = asStr(place.场所, c.location.place);
      c.location.privacy = asNum(place.私密度, c.location.privacy);
      const phy = block.生理 || {};
      c.physiology.desire = asNum(phy.性欲度, c.physiology.desire);
      c.physiology.stamina = asNum(phy.体力, c.physiology.stamina);
      c.physiology.bladder = asNum(phy.尿意, c.physiology.bladder);
      const statuses = Array.isArray(phy.异常状态)
        ? phy.异常状态
        : (phy.异常状态 && typeof phy.异常状态 === 'object' ? Object.keys(phy.异常状态) : []);
      c.physiology.statuses = statuses.map((status) => asStr(status)).filter(Boolean);
      const exp = block.性经历 || {};
      EXPERIENCE_FIELDS.forEach(([key, label]) => {
        c.experience[key] = asNum(exp[label]?.次数 ?? exp[label], c.experience[key]);
      });
      const dev = block.开发度 || {};
      /* 进度 is read as well as 档位: it is the only part of this axis that moves
         between promotions, and without it four tiles sit frozen for days. A part
         written as a bare number (an old save, or the AI writing 开发度.口腔: 2) has a
         档位 and no 进度, so the progress falls back to what is already there rather
         than being reset to 0. */
      c.developmentProgress ||= emptyDevelopmentRecord();
      c.developmentToday ||= emptyDevelopmentRecord();
      const devDay = pickNamed(devControls, c.name)?.开发度 || {};
      DEV_PARTS.forEach(([key, label, fileLabel]) => {
        const part = dev[label] || (fileLabel ? dev[fileLabel] : null) || dev[key];
        const object = part && typeof part === 'object';
        const tier = object ? part.档位 : part;
        if (tier != null) c.development[key] = asNum(tier, c.development[key]);
        if (object && part.进度 != null) c.developmentProgress[key] = asNum(part.进度, c.developmentProgress[key]);
        /* Absent means zero here, unlike 进度: a girl with no 进展控制 block yet has
           spent nothing today, so falling back to the previous value would leave a
           stale 今日已满 tag on a part that is free again. */
        const day = (devDay[label] || (fileLabel ? devDay[fileLabel] : null) || devDay[key] || {}).当日累计进度;
        c.developmentToday[key] = asNum(day, 0);
        if (!c.developmentNotes) c.developmentNotes = {};
        if (object && typeof part.评语 === 'string') c.developmentNotes[key] = asStr(part.评语);
      });
      const stream = block.直播 || {};
      c.stream.live = !!stream.开播;
      c.stream.title = asStr(stream.标题);
      c.stream.heat = asNum(stream.热度, 0);
      c.stream.followers = asNum(stream.粉丝数, c.stream.followers || 0);
    }
    const fanRow = pickNamed(fans, c.name);
    if (fanRow) {
      c.fan = fan({
        follow: !!fanRow.关注,
        tipped: asNum(fanRow.累计打赏),
        tier: asStr(fanRow.牌子档位, '无'),
        days: asNum(fanRow.牌子剩余天数),
        mod: !!fanRow.房管,
        muted: !!fanRow.禁言中,
        muteDays: asNum(fanRow.禁言剩余天数),
      });
      if (fanRow.牌子等级 != null) c.fan.badge = asNum(fanRow.牌子等级, c.fan.badge);
    } else {
      c.fan = fan();
    }
  });

  syncViews();
  emitLive();
  return true;
}
