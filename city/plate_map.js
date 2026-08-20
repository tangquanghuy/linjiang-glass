/**
 * ============================================================
 * 临江市地图 · 底板 + 节点层（连续缩放分级）
 * ============================================================
 * 所有底板活在同一个世界坐标系里：总览那张就是世界，取值 0~1；
 * 每张区底板在总览上占一个矩形 footprint，区内节点的归一化坐标
 * 通过这个矩形映射到世界。于是缩放是连续的——
 *
 *   拉远  → 只剩总览 + 九个区卡
 *   推近  → 目标区的底板按"自己在屏幕上占多宽"淡入，区卡淡出
 *   再推近 → 地标 → 常去地点 → 次级地点 → 子场景，逐级显形
 *
 * 没有"换区"这个动作，也没有硬切换。判据只有一个量：
 * r = 该区 footprint 的屏幕宽度 / 视口宽度。底板淡入、区卡淡出、
 * 各级节点显形全挂在它上面，所以缩放过程里不会出现某一层突然跳出来。
 *
 * 老实说清楚：各张底板不是同一个相机拍的，几何上并不真的连续。
 * 所以这是一次对位溶解，不是真正的连续变焦——溶解发生在总览那块区域
 * 已经放得很大很软的时候，错位读起来是可以接受的。
 */
(function () {
  'use strict';

  const D = window.CITY_MAP_DATA;

  /** 所有底板都是 1536×1024，共用这个高宽比 */
  const R = 1024 / 1536;

  /**
   * 底板注册表。
   * frame 是这张区底板在总览上的 footprint，取总览的归一化坐标：
   * {x, y, w}，高度不用写——底板同比例，所以 ny 方向的高度就等于 w。
   * correct 是统一校正，把各自漂移的亮度色相拉回同一个调子。
   */
  const PLATES = {
    overview: {
      label: '全城', file: 'plate/overview_night.webp', kind: 'city',
      correct: 'brightness(1.0) saturate(1.0) contrast(1.0)'
    },
    wuxi: {
      label: '乌溪区', file: 'plate/wuxi_night.webp', kind: 'district',
      district: '乌溪区', frame: { x: 0.150, y: 0.520, w: 0.330 },
      correct: 'brightness(1.04) saturate(1.06) contrast(1.02)'
    },
    minghu: {
      label: '明湖区', file: 'plate/minghu_night.webp', kind: 'district',
      district: '明湖区', frame: { x: 0.395, y: 0.130, w: 0.320 },
      correct: 'brightness(0.98) saturate(1.02) contrast(1.03)'
    },
    guling: {
      label: '鼓岭区', file: 'plate/guling_night.webp', kind: 'district',
      district: '鼓岭区', frame: { x: 0.115, y: 0.170, w: 0.250 },
      correct: 'brightness(1.0) saturate(1.04) contrast(1.0)'
    },
    xizhou: {
      label: '西洲区', file: 'plate/xizhou_night.webp', kind: 'district',
      district: '西洲区', frame: { x: -0.010, y: 0.215, w: 0.230 },
      correct: 'brightness(1.02) saturate(1.0) contrast(1.0)'
    },
    luoxia: {
      label: '落霞区', file: 'plate/luoxia_night.webp', kind: 'district',
      district: '落霞区', frame: { x: 0.655, y: 0.385, w: 0.320 },
      correct: 'brightness(1.0) saturate(1.02) contrast(1.0)'
    },
    pujiang: {
      label: '浦江区', file: 'plate/pujiang_night.webp', kind: 'district',
      district: '浦江区', frame: { x: 0.045, y: -0.040, w: 0.340 },
      correct: 'brightness(1.0) saturate(1.0) contrast(1.0)'
    },
    yushi: {
      label: '雨石区', file: 'plate/yushi_night.webp', kind: 'district',
      district: '雨石区', frame: { x: 0.495, y: 0.645, w: 0.310 },
      correct: 'brightness(0.96) saturate(1.08) contrast(1.05)'
    }
  };

  /**
   * 节点在【自己那张区底板】上的归一化坐标，不是世界坐标。
   * 摆点方式是看着图放，不是让底板迁就已有坐标：
   * 镇淮门落在画面底部那座城门，文庙街落在临河那排亮灯的传统建筑，
   * 瓦坊街落在左下店面连成串的街，停工楼盘落在右侧现代楼群，
   * 顺通分拣点落在左下角那栋大体量建筑。
   * 换底板只要重调这一屏的点，一个区十几二十个，几分钟的事。
   */
  const PLACE = {
    wuxi: {
      wx_zhenhuai: [0.405, 0.860],
      wx_wenmiao: [0.628, 0.664],
      wx_wenmiao_stage: [0.702, 0.610],
      wx_wenmiao_square: [0.506, 0.742],
      wx_wafang: [0.284, 0.656],
      wx_store: [0.430, 0.584],
      wx_store_back: [0.470, 0.550],
      wx_mopan: [0.330, 0.470],
      wx_mopan_bike: [0.384, 0.442],
      wx_noodle: [0.212, 0.398],
      wx_market: [0.128, 0.520],
      wx_market_canteen: [0.171, 0.557],
      wx_home: [0.205, 0.288],
      wx_home_roof: [0.157, 0.251],
      wx_pawn: [0.560, 0.455],
      wx_bath: [0.868, 0.672],
      wx_ruin: [0.912, 0.442],
      wx_ruin_tower: [0.962, 0.399],
      wx_ruin_garage: [0.905, 0.492],
      wx_courier: [0.072, 0.812],
      wx_care: [0.108, 0.672]
    }
  };

  /**
   * 全城总览上的九个区。at 是区卡的锚点，照着 overview_night 摆；
   * 和 footprint 分开写——卡片要落在那片街区最好认的地方，
   * footprint 是整片辖区，两者中心并不重合。
   */
  /*
   * 可用带是算出来的不是估的：z=1 时底板按 cover 铺满，屏幕越宽纵向裁得越多，
   * 最窄的一档是 21:9——那时候只看得见 y ∈ [0.184, 0.816]，
   * 再留出圆盘加标签约 0.02，可用带就是 [0.204, 0.796]。
   * 除浦江以外八个锚点都落在里面，所以 4:3 到 21:9 都不用夹取，
   * 缩到最小一屏看全，不用拖。
   * 夹取的兜底留着给浦江和更极端的比例。区卡是进区的入口，
   * 够不着就等于这个区不存在。
   *
   * 锚点是照着 overview_night 逐个对的，不是均匀撒的：
   * 西洲落在左侧那片高塔和体育场，鼓岭落在高塔与老城之间的低层街区，
   * 明湖落在中央那簇尖顶写字楼，青屏山落在东侧山体，
   * 落霞落在带跑道的校区，乌溪落在密集老城，雨石落在波浪顶车站，
   * 东塘落在西南出城口。
   *
   * c / i 是区卡的颜色和图标，直接写死不走 GROUP 那套分类。
   * 这里的颜色只是身份——用来区分九个区，不是在声明"大学城属于公共服务"。
   * 之前九张卡共用一个蓝加一个楼房图标，等于把同一个章盖了九遍。
   */
  const DISTRICTS = [
    // 浦江真正的江北岸在总览最上面那 8%，min zoom 下正好在裁掉的那条里，
    // 之前就是这么没的。锚点下移到桥头这一侧——区卡是进区的入口，
    // 不是测绘点，落在通往江北的那座桥上一样读得懂，代价比看不见小
    // 浦江在江北，而江北那条建成带只占底板 ny 0~0.145，几乎全在裁掉的那条里。
    // 试过两个极端都不行：按到 0.225 迁就带宽，卡片浮在江面上；
    // 放在 0.112 的建成带中央，2:1 窗口就看不见了。
    // 网格量出来江北一侧最靠下的落脚点是过江桥的北端桥头（nx≈0.118, ny≈0.172），
    // 在岸上、又刚好进 2:1 的可用带，而且"过江去浦江"这层意思也对
    { key: 'pujiang', name: '浦江区', sub: '江北新区', at: [0.118, 0.172], c: '#4a63c8', i: 'office' },
    { key: 'qingping', name: '青屏山', sub: '城东山林', at: [0.900, 0.290], c: '#189e90', i: 'tree' },
    { key: 'minghu', name: '明湖区', sub: '市中心', at: [0.478, 0.360], c: '#dd7a2b', i: 'market' },
    { key: 'xizhou', name: '西洲区', sub: '直播产业带', at: [0.085, 0.372], c: '#c93f8f', i: 'depot' },
    { key: 'guling', name: '鼓岭区', sub: '文化街区', at: [0.228, 0.430], c: '#7c5cd0', i: 'heritage' },
    { key: 'wuxi', name: '乌溪区', sub: '老城南', at: [0.340, 0.612], c: '#2f9e5c', i: 'house' },
    { key: 'luoxia', name: '落霞区', sub: '大学城', at: [0.830, 0.640], c: '#2f7fd6', i: 'book' },
    { key: 'yushi', name: '雨石区', sub: '城南枢纽', at: [0.610, 0.752], c: '#3f7ea8', i: 'train' },
    // 原来在 0.785，正好压着左下角的时段条，标签只能往上让——
    // 一屏九张卡里唯一一个朝上的，看着就是"没规律"。
    // 挪到再往上一点那片大跨度仓库（网格量的 nx 0.075 / ny 0.640），
    // 空港物流带也说得通，而且九张卡的标签全都能朝下
    { key: 'dongtang', name: '东塘区', sub: '空港与温泉', at: [0.075, 0.640], c: '#c2673a', i: 'water' }
  ];

  /**
   * ============ 时段 ============
   * 底板只出夜景，其余时段靠滤镜加 tint 压出来。
   *
   * 「朝」原来是往上猛提亮度、把饱和砍到一半去凑白天，出来是一张发灰的
   * 洗白图：夜景里的窗光路灯还在，一提亮就变成脏白点，天空和地面一起糊成
   * 一片。硬拉是拉不出白天的——夜景照片里根本没有日光下的信息。
   *
   * 现在改成拂晓：06:20 的春天本来就还没大亮，是蓝调时刻。
   * 灯还亮着（现实里也是），只把整体提一点、往冷偏一点、对比压一档，
   * 天光从上方压下来，地平线留一线暖。这个方向不用凭空造信息，
   * 所以不会发灰，也比假白天可信。
   * 真要做白天，得单出一张昼景底板，滤镜做不到。
   */
  const PHASES = {
    朝: {
      label: '朝',
      plate: 'brightness(1.1) saturate(0.86) contrast(0.94) hue-rotate(-6deg)',
      // 上方压冷天光，下方留一线暖——拂晓的光是从天上来的
      tint: 'linear-gradient(180deg, rgba(150,186,232,.42) 0%, rgba(150,186,232,.16) 42%, rgba(255,196,150,.12) 100%)',
      tint2: 'linear-gradient(180deg, rgba(96,128,180,.20) 0%, transparent 55%)'
    },
    暮: {
      label: '暮',
      plate: 'brightness(1.1) saturate(1.06) contrast(0.98) hue-rotate(-10deg)',
      tint: 'linear-gradient(165deg, rgba(255,176,116,.44) 0%, rgba(196,128,150,.26) 55%, rgba(120,110,170,.28) 100%)',
      tint2: 'radial-gradient(80% 60% at 14% 16%, rgba(255,162,98,.20), transparent 64%)'
    },
    夜: {
      label: '夜',
      plate: 'brightness(1.0) saturate(1.0) contrast(1.0)',
      tint: 'none', tint2: 'none'
    },
    深夜: {
      label: '深夜',
      plate: 'brightness(0.78) saturate(0.88) contrast(1.05)',
      tint: 'none',
      tint2: 'linear-gradient(180deg, rgba(6,12,34,.40), rgba(4,8,26,.48))'
    }
  };
  const PHASE_ORDER = ['朝', '暮', '夜', '深夜'];

  /**
   * ============ 分级阈值 ============
   * 全部挂在同一个量上：r = frame.w * z（该区 footprint 相对 cover 尺度）。
   * 宽屏 cover 尺度就是视口宽，和「占视口几成」相同。
   * 竖屏窗口更窄，不代表已经推进区里——若仍除以视口宽，z=1 时每个区
   * 都被算成铺满，区底板叠上总览（接缝），地点针也提前冒出来。
   */
  const LOD = {
    // 淡入在 r=1.02 收满：r=1 正好是 footprint 铺满视口宽度的时刻，
    // 提前收满的话画面边上会露出底下总览那张，接缝很显眼
    plateIn: [0.48, 1.08],
    chipOut: [0.50, 0.86],   // 区卡淡出区间（和上面重叠，交接处才不空档）
    // rank 0 的门槛要比 chipOut 的终点早得多：区卡淡完的时候地标必须
    // 已经站住了，否则中间会出现一段整屏没有任何标签的空档
    rank: [0.62, 0.95, 1.22], // rank 0 / 1 / 2 地点的显形门槛
    scene: 1.66,             // 子场景
    detail: 0.90,            // 光带。规划路线是重要信息，区一读得出来它就该在
    // 立绘单独一条更陡的斜坡：脸半透明地挂着比不出现更难看，
    // 要么清楚地在，要么别来
    pin: [1.12, 1.20],
    exit: 1.15               // 出区方向
  };

  /** 卡片之间的最小间距，随 r 略微放宽——名字不会跟着缩那么多 */
  const GAP = 8;

  // ============ 图标 ============
  /**
   * 分组配色，沿用 city_map 那套。
   * 原来这里是一组浅色（#6aa9f0 之类）——那是给深色玻璃卡配的，
   * 现在圆盘是白底彩环、地标是实心彩盘，浅色在白底上压不住，
   * 得用饱和度高、明度低一档的实色。
   */
  const GROUP = {
    transit: '#2f7fd6', commerce: '#dd7a2b', food: '#d9563d', work: '#4a63c8',
    living: '#2f9e5c', culture: '#7c5cd0', leisure: '#c93f8f', civic: '#d9463d', nature: '#189e90'
  };
  const TYPE = {
    home: ['living', 'house'], street: ['commerce', 'shop'], store: ['commerce', 'shop'],
    diner: ['food', 'food'], foodstreet: ['food', 'food'], market: ['commerce', 'market'],
    pawn: ['commerce', 'shop'], heritage: ['culture', 'heritage'], gate: ['culture', 'gate'],
    bathhouse: ['leisure', 'water'], ruins: ['work', 'crane'], depot: ['work', 'depot'],
    care: ['civic', 'cross'], cafe: ['food', 'cup'], mall: ['commerce', 'market'],
    plaza: ['commerce', 'market'], library: ['culture', 'book'], park: ['nature', 'tree'],
    lake: ['nature', 'water'], station: ['transit', 'train'], metro: ['transit', 'train'],
    gov: ['civic', 'gate'], hospital: ['civic', 'cross'], office: ['work', 'office'],
    mcn: ['work', 'office'], studio: ['work', 'office'], gym: ['leisure', 'tree'],
    stadium: ['leisure', 'tree'], apartment: ['living', 'house'], residence: ['living', 'house'],
    pier: ['transit', 'water'], scene: ['living', 'shop']
  };
  const ICON = {
    house: 'M4.5 14.6L16 5l11.5 9.6M7.5 17v10h17V17M13 27v-6.6h6V27',
    shop: 'M5 13v13h22V13M3.4 13l2.4-6h20.4l2.4 6zM11 26v-7h10v7',
    food: 'M9 4v10a3.4 3.4 0 0 0 6.8 0V4M12.4 4v10M12.4 17.4V28M23.6 28V4c-2.6 1.2-4 4.2-4 8s1.4 5.4 4 5.6',
    cup: 'M6 11h16v7.4A6.6 6.6 0 0 1 15.4 25 6.6 6.6 0 0 1 8.8 18.4M21 13h2.6a3.2 3.2 0 0 1 0 6.4H21M5 28h20',
    market: 'M4 12h24l-2 4H6zM4 12l2.6-5h18.8L28 12M7 16v11h18V16M13 27v-6h6v6',
    heritage: 'M3 12.6L16 5l13 7.6M5.6 12.6h20.8M8 16v7M13.4 16v7M18.8 16v7M24.2 16v7M4.6 23h22.8M2.6 27h26.8',
    gate: 'M5 27V13h22v14M3 27h26M12 27v-8a4 4 0 0 1 8 0v8M5 13l11-6 11 6',
    water: 'M3 12c2.6 0 2.6 2.4 5.2 2.4S10.8 12 13.4 12s2.6 2.4 5.2 2.4S21.2 12 23.8 12s2.6 2.4 5.2 2.4M3 19c2.6 0 2.6 2.4 5.2 2.4S10.8 19 13.4 19s2.6 2.4 5.2 2.4S21.2 19 23.8 19s2.6 2.4 5.2 2.4',
    crane: 'M8 28V6h3v22M8 10h17M25 10v6M6 28h9M25 16h-3.4M25 16h3.4',
    depot: 'M4 27V12.6L16 6l12 6.6V27M2 27h28M10 27v-9h12v9M10 22.5h12',
    cross: 'M5 7h22v20H5zM16 12v10M11 17h10',
    book: 'M16 8.6C13.6 6.4 10 5.6 5 6v18c5-.4 8.6.4 11 2.6 2.4-2.2 6-3 11-2.6V6c-5-.4-8.6.4-11 2.6zM16 8.6v18',
    tree: 'M16 4l7.6 12H8.4zM11.4 21.6h9.2L16 14.4zM16 22v6M4 28h24',
    office: 'M6 27V9l9-5 9 5v18M3 27h26M11 12.5h2M18 12.5h2M11 17.5h2M18 17.5h2M13 27v-5h5v5',
    train: 'M8 4h16v17H8zM8 12h16M12.4 16.6h.1M19.6 16.6h.1M11 21l-3 6M21 21l3 6M10 27h12'
  };

  document.getElementById('icons').innerHTML = Object.keys(ICON).map(k =>
    `<symbol id="i-${k}" viewBox="0 0 32 32"><g fill="none" stroke="currentColor" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round"><path d="${ICON[k]}"/></g></symbol>`).join('');

  window.__PM = { D, R, PLATES, PLACE, DISTRICTS, PHASES, PHASE_ORDER, LOD, GAP, GROUP, TYPE };
})();

/**
 * ============================================================
 * 渲染
 * ============================================================
 */
(function () {
  'use strict';
  const M = window.__PM;
  const D = M.D, R = M.R, LOD = M.LOD;

  const stage = document.getElementById('stage');
  const platesHost = document.getElementById('plates');
  const tintEl = document.getElementById('tint');
  const tint2El = document.getElementById('tint2');
  const host = document.getElementById('nodes');
  const canvas = document.getElementById('link');
  const ctx = canvas.getContext('2d');

  /** 视野：世界坐标中心 + 缩放。z=1 时总览按 cover 铺满视口。
      竖屏一屏放不下整座城——那就 cover 铺满、左右拖，不要 contain 缩成一条。 */
  const view = { cx: 0.5, cy: 0.5, z: 1 };
  const Z_MAX = 6.4;
  let lastZMin = 1;

  function zMin() { return 1; }
  /** cover 比窗口更宽：竖屏、近正方形。这种窗口左右有图可拖。 */
  function cropsX() {
    const W = vw(), H = vh();
    if (W < 8 || H < 8) return false;
    return Math.max(W, H / R) > W * 1.05;
  }
  let phase = '夜';

  const byId = {};
  D.nodes.forEach(n => byId[n.id] = n);

  // ============ 运行时状态（示例注入） ============
  /**
   * 运行时状态。这里的值只是页面单独打开时的示例，
   * 嵌进宿主页面后由 PLATE_MAP.setState 灌进来。
   */
  const STATE = {
    district: 'wuxi',                 // 玩家所在区，总览上高亮它
    player: { at: 'wx_home' },
    actors: [
      { at: 'wx_store', name: '苏芸', img: '../art/girl1.png' },
      { at: 'wx_mopan', name: '老周', img: '../art/girl3.png' },
      { at: 'wx_wenmiao', name: '林小满', img: '../art/girl2.png' }
    ],
    events: [{ at: 'wx_wafang', n: 2 }, { at: 'wx_zhenhuai', n: 1 }],
    route: ['wx_home', 'wx_mopan', 'wx_store', 'wx_wenmiao']
  };

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  /** 线性斜坡，两端夹住。所有淡入淡出都走它 */
  const ramp = (v, a, b) => clamp((v - a) / (b - a), 0, 1);
  const vw = () => stage.clientWidth;
  const vh = () => stage.clientHeight;

  /** 每世界 x 单位多少屏幕像素。z=1 时总览按 cover 铺满 */
  function S() { return Math.max(vw(), vh() / R) * view.z; }

  /** 世界坐标 → 屏幕。y 方向乘 R，因为世界的 y 单位是按 x 宽度归一的 */
  function toScreen(wx, wy) {
    const s = S();
    return {
      x: vw() / 2 + (wx - view.cx) * s,
      y: vh() / 2 + (wy - view.cy) * s * R
    };
  }

  /** 屏幕 → 世界，滚轮以光标为锚点缩放要用 */
  function toWorld(sx, sy) {
    const s = S();
    return {
      x: view.cx + (sx - vw() / 2) / s,
      y: view.cy + (sy - vh() / 2) / (s * R)
    };
  }

  /** 区内归一化坐标 → 世界坐标。底板同比例，所以 y 也用 frame.w */
  function inFrame(f, px, py) {
    return { x: f.x + px * f.w, y: f.y + py * f.w };
  }

  /**
   * 区底板是矩形 footprint，彼此之间留得开——明湖南沿和乌溪北沿中间
   * 有一条没有区图的缝。光标停在缝上往里拉，锚点钉在总览上，
   * 越拉越糊、永远进不了旁边那区。进区时把锚点收进最近的 footprint。
   */
  function footprintHit(wx, wy) {
    let inside = null, near = null, nearD = Infinity;
    Object.keys(M.PLATES).forEach(k => {
      const f = M.PLATES[k].frame;
      if (!f) return;
      const x1 = f.x + f.w, y1 = f.y + f.w;
      const px = clamp(wx, f.x, x1), py = clamp(wy, f.y, y1);
      const d = Math.hypot(wx - px, (wy - py) * R);
      if (d < 1e-4) inside = { x: wx, y: wy, k };
      else if (d < nearD) {
        nearD = d;
        near = { x: f.x + f.w / 2, y: f.y + f.w / 2, k };
      }
    });
    return inside || near;
  }

  function zoomToAnchor(world, sx, sy, inward) {
    let target = world;
    if (inward) {
      const hit = footprintHit(world.x, world.y);
      /* 缝里：往区中心收一截，几下就能进区。已经在 footprint 里则钉住光标。 */
      if (hit && (hit.x !== world.x || hit.y !== world.y)) {
        target = {
          x: world.x + (hit.x - world.x) * 0.6,
          y: world.y + (hit.y - world.y) * 0.6
        };
      }
    }
    const s = S();
    view.cx = target.x - (sx - vw() / 2) / s;
    view.cy = target.y - (sy - vh() / 2) / (s * R);
    clampView();
  }

  function zoomAt(sx, sy, factor) {
    const before = toWorld(sx, sy);
    view.z = clamp(view.z * factor, zMin(), Z_MAX);
    zoomToAnchor(before, sx, sy, factor > 1);
  }

  /**
   * 分级判据：该区 footprint 相对 cover 尺度有多宽，等于 frame.w * z。
   * 底板淡入、区卡淡出、各级节点显形全看这一个量。
   */
  function ratio(key) {
    const f = M.PLATES[key].frame;
    return f ? f.w * view.z : 0;
  }

  // ============ 底板层 ============
  /** 每张底板一个 img，位置和透明度每帧更新，不做增删 */
  const layers = {};
  Object.keys(M.PLATES).forEach(k => {
    const img = document.createElement('img');
    img.src = M.PLATES[k].file;
    img.alt = '';
    img.dataset.k = k;
    if (k !== 'overview') img.className = 'dp';
    img.style.opacity = k === 'overview' ? 1 : 0;
    platesHost.appendChild(img);
    layers[k] = img;
  });

  /** 只在真的变了才写样式：重复写同样的值也会让浏览器重算图层 */
  function put(el, x, y, w, h, a) {
    const t = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    if (el.__t !== t) { el.style.transform = t; el.__t = t; }
    const sz = w.toFixed(1) + '/' + h.toFixed(1);
    if (el.__s !== sz) { el.style.width = w + 'px'; el.style.height = h + 'px'; el.__s = sz; }
    const o = a.toFixed(3);
    if (el.__o !== o) { el.style.opacity = o; el.__o = o; }
  }

  function layoutPlates() {
    const s = S(), W = vw(), H = vh();
    const order = [];

    // 总览是底，永远在场：区底板只覆盖自己那一块，
    // 剩下的画面得有东西垫着，否则边上会露黑。
    put(layers.overview, W / 2 - view.cx * s, H / 2 - view.cy * s * R, s, s * R, 1);

    Object.keys(M.PLATES).forEach(k => {
      if (k === 'overview') return;
      const f = M.PLATES[k].frame;
      const el = layers[k];
      const r = ratio(k);
      const p = toScreen(f.x, f.y);
      const w = f.w * s, h = f.w * s * R;

      // 完全在视口外的就别费劲了
      const off = p.x > W + 40 || p.y > H + 40 || p.x + w < -40 || p.y + h < -40;
      const a = off ? 0 : ramp(r, LOD.plateIn[0], LOD.plateIn[1]);
      // 离视野中心的距离，交叠处的层序按它排
      const dc = Math.hypot(f.x + f.w / 2 - view.cx, (f.y + f.w / 2 - view.cy) * R);
      // 透明的直接从合成里摘掉。八张放大的大图一起挂着，
      // 光合成就吃掉十几帧，而任一时刻真正有份的只有两三张
      if (a > 0) {
        if (el.__h) { el.style.display = ''; el.__h = false; }
        put(el, p.x, p.y, w, h, a);
      } else if (!el.__h) {
        el.style.opacity = 0; el.__o = '0.000';
        el.style.display = 'none'; el.__h = true;
      }
      order.push([k, dc]);
    });

    /* 相邻两区的 footprint 难免交叠（辖区本来就挨着，而矩形又是方的），
       交叠处谁压谁按"离视野中心多远"排——你正看着的那个区赢。
       按 r 排会出错：邻区的 footprint 更宽时 r 更大，
       于是它压在你正在看的区上面。 */
    order.sort((a, b) => b[1] - a[1]).forEach(([k], i) => {
      layers[k].style.zIndex = 2 + i;
      zOf[k] = 2 + i;
    });
    layers.overview.style.zIndex = 1;
    zOf.overview = 1;
  }

  /** 各底板当前的层序和屏幕矩形，判节点有没有被别的底板盖住要用 */
  const zOf = {};
  function plateRects() {
    const s = S(), out = [];
    Object.keys(M.PLATES).forEach(k => {
      const f = M.PLATES[k].frame;
      if (!f || layers[k].__h) return;
      const p = toScreen(f.x, f.y);
      out.push({
        k, z: zOf[k] || 0, a: +(layers[k].__o || 0),
        x: p.x, y: p.y, w: f.w * s, h: f.w * s * R
      });
    });
    return out;
  }
  /**
   * 时段滤镜挂在容器上，不是挂在每张图上。
   * 挂在图上的话，一张 1536 的底板在 z=3.6 时被放大到五千像素，
   * filter 会让整层每次变换都重新光栅化——实测帧率直接砍半（34 → 60）。
   * 挂容器只光栅化视口那么大一层。
   *
   * 代价是每张底板各自的统一校正没法在运行时上了。
   * 那个本来就该烘进素材：校正是把各张图拉到同一基准，属于素材归一化，
   * 不是每帧都要重算的东西。registry 里的 correct 现在是待烘的参数表。
   */
  function applyPhase() {
    const ph = M.PHASES[phase];
    platesHost.style.filter = ph.plate;
    tintEl.style.background = ph.tint;
    tintEl.style.opacity = ph.tint === 'none' ? 0 : 1;
    tint2El.style.background = ph.tint2;
    tint2El.style.opacity = ph.tint2 === 'none' ? 0 : 1;
    [...document.getElementById('phase').children].forEach(b =>
      b.classList.toggle('on', b.textContent === phase));
  }

  // ============ 节点池 ============
  /**
   * 节点 DOM 常驻，每帧只改位置和 class。
   * 每帧重建的话 CSS 过渡永远起不来，节点就成了硬跳出来。
   *
   * 结构照 city_map：
   *   .np  外壳，中心精确落在坐标上
   *   .ni  圆盘（分组配色）
   *   .nl  标签小牌，固定挂在圆盘正下方
   * 圆盘钉死在锚点上。标签不随视口换边——换边看起来像卡片在绕着钉子转。
   */
  const pool = new Map();

  /**
   * 角标向外溢出多少。和 CSS 里 .nj / .nv 的 top/right/left 是一对，
   * 改一头要同步另一头——量 DOM 更准，但事件红点是运行时才建的，
   * 量的时机永远赶不上排版，写死反而不容易错。
   */
  const JOB_OVER = { major: [18, 7], minor: [22, 9], '': [20, 8] };  // [右, 上]
  const EV_OVER = [12, 7];                                           // [左, 上]

  /**
   * 算圆盘的占位框要额外留出多少。
   * 不把角标算进去的话，标签会正好摆在角标上——第一版就是这个毛病。
   */
  function pads(it) {
    const [jr, jt] = JOB_OVER[it.el.dataset.tier] || JOB_OVER[''];
    it.padR = it.job ? jr + 3 : 0;
    it.padL = it.ev ? EV_OVER[0] + 3 : 0;
    it.padT = Math.max(it.job ? jt : 0, it.ev ? EV_OVER[1] : 0);
  }

  function acquire(key, tier, html) {
    let it = pool.get(key);
    if (!it) {
      const el = document.createElement('div');
      el.className = 'np';
      el.dataset.tier = tier;
      el.dataset.k = key;     // 调试和探测脚本按池键找元素，别靠标签文字猜
      el.innerHTML = html;
      host.appendChild(el);
      const lab = el.querySelector('.nl');
      it = { el, lab, ic: el.querySelector('.ni') };
      // 尺寸只量一次：内容不变，量了也不会变，
      // 每帧 getBoundingClientRect 会把布局抖成一团
      it.iw = it.ic.offsetWidth;
      it.ih = it.ic.offsetHeight;
      if (lab) { it.lw = lab.offsetWidth; it.lh = lab.offsetHeight; }
      it.job = !!el.querySelector('.nj');
      pads(it);
      pool.set(key, it);
    }
    it.seen = true;
    return it;
  }

  /**
   * 地图控件的矩形也算占用。
   * 现在只有缩放按钮、时段条和开发条——玩法 HUD 全撤了，
   * 这张图要嵌进别的页面，壳子归宿主管。
   */
  let hudCache = null, hudAt = 0;
  function hudBoxes() {
    const now = performance.now();
    if (hudCache && now - hudAt < 500) return hudCache;
    hudAt = now;
    hudCache = ['ctl', 'phase', 'dev']
      .map(id => document.getElementById(id))
      .filter(el => el && el.offsetParent !== null)
      .map(el => {
        const r = el.getBoundingClientRect();
        return { x: r.left - 6, y: r.top - 6, w: r.width + 12, h: r.height + 12 };
      });
    return hudCache;
  }

  /**
   * 让下一帧彻底重排。
   * hudBoxes 自己有 500ms 的 TTL，但那救不了：renderNodes 被 lastKey 挡着，
   * 视野不动就永远不重排，于是首帧那份"控件还没建好"的空矩形会一直用下去
   * ——东塘的标签压在时段条上就是这么来的。控件建完、字体加载完、
   * 窗口改了，都得从这里捅一下。
   */
  function invalidate() { hudCache = null; lastKey = ''; }

  /**
   * 摆一个节点：圆盘钉在锚点，名字永远在正下方。
   * 出了画面就把字藏掉、圆盘留着。不换到左右上——视口一动标签就绕圈，读成卡片在转。
   */
  function placeNode(it, s, boxes) {
    it.el.style.left = s.x + 'px';
    it.el.style.top = s.y + 'px';
    const icBox = {
      x: s.x - it.iw / 2 - it.padL, y: s.y - it.ih / 2 - it.padT,
      w: it.iw + it.padL + it.padR, h: it.ih + it.padT
    };
    if (!it.lab) return icBox;

    const g = 6;
    const dx = -it.lw / 2, dy = it.ih / 2 + g;
    const x = s.x + dx, y = s.y + dy;
    const pad = 10, W = vw(), H = vh();
    if (x < pad || y < pad || x + it.lw > W - pad || y + it.lh > H - pad) {
      it.lab.className = 'nl hide';
      return icBox;
    }
    it.lab.className = 'nl';
    it.lab.style.left = (it.iw / 2 + dx) + 'px';
    it.lab.style.top = (it.ih / 2 + dy) + 'px';
    it.slot = 0;
    return {
      x: Math.min(icBox.x, x), y: Math.min(icBox.y, y),
      w: Math.max(icBox.x + icBox.w, x + it.lw) - Math.min(icBox.x, x),
      h: Math.max(icBox.y + icBox.h, y + it.lh) - Math.min(icBox.y, y)
    };
  }

  const cfg = t => {
    const e = M.TYPE[t] || ['living', 'shop'];
    return { color: M.GROUP[e[0]], icon: e[1] };
  };
  const rankOf = n => (n.rank == null ? 1 : Math.min(2, n.rank));
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  /** 玩家、在场人物、事件、规划路线上的地点必须出现，不参与竞争 */
  function forcedIds() {
    const s = new Set();
    if (STATE.player.at) s.add(STATE.player.at);
    STATE.actors.forEach(a => { if (a.at) s.add(a.at); });
    STATE.events.forEach(e => { if (e.at) s.add(e.at); });
    STATE.route.forEach(id => { if (id) s.add(id); });
    return s;
  }
  let FORCED = forcedIds();
  /** 点节点的回调。地图自己不做任何事，把节点抛给宿主页面 */
  let onPick = null;

  /**
   * 视野没变就不重排。
   * 每帧唯一必须动的是光带那圈流动虚线，那只是 canvas 一次重画；
   * 底板变换、节点排版、碰撞检测都跟着跑的话白烧掉一半帧率。
   */
  let lastKey = '';
  function render() {
    const key = `${view.cx.toFixed(5)}|${view.cy.toFixed(5)}|${view.z.toFixed(5)}|${vw()}x${vh()}|${phase}`;
    if (key !== lastKey) { lastKey = key; renderNodes(); }
    drawCanvas();
  }

  function renderNodes() {
    const W = vw(), H = vh();
    layoutPlates();
    pool.forEach(it => it.seen = false);
    pins.forEach(it => it.seen = false);
    const boxes = hudBoxes().slice();

    // 区卡：自己那片 footprint 在屏幕上占到一定宽度就淡出，交给地点
    M.DISTRICTS.forEach(d => {
      const has = M.PLATES[d.key];
      const r = has ? ratio(d.key) : 0;
      // 没有底板的区跟着整体缩放退场，不然会一直挂在放大的图上
      const a = has ? 1 - ramp(r, LOD.chipOut[0], LOD.chipOut[1])
        : 1 - ramp(view.z, 1.5, 2.3);
      const here = d.key === STATE.district;
      const it = acquire('D:' + d.key, 'major',
        `<div class="ni"><svg viewBox="0 0 32 32"><use href="#i-${d.i}"/></svg></div>` +
        `<div class="nl"><b>${esc(d.name)}</b><i>${esc(d.sub)}</i><em class="nh">你在这</em></div>`);
      it.el.style.setProperty('--nc', d.c);
      // 绿环 + 卡上另起一行「你在这」，不顶掉城区介绍。
      if (it._here !== here) {
        it._here = here;
        it.el.dataset.here = here ? '1' : '';
        if (it.lab) { it.lw = it.lab.offsetWidth; it.lh = it.lab.offsetHeight; }
      }
      const labI = it.lab && it.lab.querySelector('i');
      if (labI && labI.textContent !== d.sub) {
        labI.textContent = d.sub;
        it.lw = it.lab.offsetWidth;
        it.lh = it.lab.offsetHeight;
      }
      if (!it.bound) { it.el.onclick = () => focus(d.key); it.bound = true; }

      const p = toScreen(d.at[0], d.at[1]);
      /* 总览档把出界的区卡拽回画面内——区卡是进区的入口，够不着就等于
         这个区不存在（底板 cover 铺，屏幕越宽上下裁得越多，浦江在最上面）。
         夹取量按 openT 渐隐：z=Z_MIN 时完全夹住，到 Z_OPEN 归零。
         写成 z<=1.02 的硬开关时，从最小档往里推一点区卡就"啪"地消失；
         现在是随着你推近慢慢滑出画面。
         夹取要排在可见性判断【之前】——反过来的话锚点已出界的那张会先被
         剔掉，兜底根本轮不到执行。
         注意这只影响出界的那几张，画面内的区卡 clamp 是空操作，不会偏。 */
      const t = openT();
      /* 只把「差一点出界」的区卡拽回来（宽屏裁掉的浦江）。
         竖屏 cover 大半张城都在左右外头，全拽进来会叠成一团。 */
      if (t > 0) {
        const slack = 72;
        const far = p.x < -slack || p.x > W + slack || p.y < -slack || p.y > H + slack;
        if (!far) {
          const m = 46;
          p.x += (clamp(p.x, m, W - m) - p.x) * t;
          p.y += (clamp(p.y, m, H - m - 20) - p.y) * t;
        }
      }
      const on = a > 0.02 && p.x > -80 && p.x < W + 80 && p.y > -80 && p.y < H + 80;
      it.el.style.opacity = on ? a : 0;
      it.el.classList.toggle('on', on);
      if (!on) return;
      boxes.push(placeNode(it, p, boxes));
    });

    // 地点：逐级显形
    Object.keys(M.PLATES).forEach(key => {
      if (M.PLACE[key]) drawDistrict(key, boxes);
    });

    // 没布点的区：底板起来了给个说明，免得看着像 bug
    Object.keys(M.PLATES).forEach(key => {
      const pl = M.PLATES[key];
      if (pl.kind !== 'district' || M.PLACE[key]) return;
      const a = ramp(ratio(key), 0.90, 1.05);
      const it = acquire('E:' + key, 'minor',
        `<div class="ni"><svg viewBox="0 0 32 32"><use href="#i-office"/></svg></div>` +
        `<div class="nl"><b>${esc(pl.district)}</b><i>底板已就位 · 尚未布点</i></div>`);
      it.el.style.setProperty('--nc', '#7d8ea8');
      const c = inFrame(pl.frame, 0.5, 0.5);
      const p = toScreen(c.x, c.y);
      // 锚点在视口外就别显：这卡跟当前视野没关系
      const on = a > 0.02 && p.x > 0 && p.x < W && p.y > 0 && p.y < H;
      it.el.style.opacity = on ? a : 0;
      it.el.classList.toggle('on', on);
      if (on) boxes.push(placeNode(it, p, boxes));
    });

    drawPeople();

    // 这一帧没露面的留在 DOM 里，只是关掉——下次进场还能接着过渡
    pool.forEach(it => {
      if (!it.seen) { it.el.classList.remove('on'); it.el.style.opacity = 0; }
    });
    /* 钉子也得扫。之前只置 seen 不回收，节点被剔掉之后钉子留在原位，
       于是推到明湖区，三张脸还浮在明湖的底板上——人明明在乌溪 */
    pins.forEach(it => {
      if (!it.seen) { it.el.classList.remove('on'); it.el.style.opacity = 0; }
    });
  }

  /**
   * 一个区内部的分级。
   * rank 0 地标先来，然后常去地点、次级地点，最后子场景；
   * 先占位的赢，所以地标优先——和原来那张全城图一个路子。
   */
  function drawDistrict(key, boxes) {
    const pl = M.PLATES[key], spots = M.PLACE[key];
    const r = ratio(key);
    if (r < LOD.rank[0] - 0.1) return;      // 还太远，整层不用算
    const W = vw(), H = vh();

    /* 节点只能出现在自己那张底板上。
       相邻区的 footprint 交叠时，压在下面那张的节点会飘到上面那张的画面里，
       看着就是"雨石区的火车站上挂着乌溪区的地点"。 */
    const rects = plateRects().filter(t => t.k !== key && t.z > (zOf[key] || 0) && t.a > 0.55);
    const buried = p => rects.some(t => p.x > t.x && p.x < t.x + t.w && p.y > t.y && p.y < t.y + t.h);

    const list = Object.keys(spots).map(id => byId[id]).filter(Boolean);
    const eventAt = {};
    STATE.events.forEach(e => eventAt[e.at] = e);

    // 强制显示的排在最前，其余按 rank
    const sorted = list.slice().sort((a, b) => pri(a) - pri(b));
    function pri(n) {
      if (FORCED.has(n.id)) return -1;
      if (n.parentId || n.type === 'scene') return 9;
      return rankOf(n);
    }

    sorted.forEach(n => {
      const scene = n.parentId || n.type === 'scene';
      const rk = rankOf(n);
      const tier = scene ? 'scene' : rk === 0 ? 'major' : rk >= 2 ? 'minor' : '';
      const gate = scene ? LOD.scene : (FORCED.has(n.id) ? LOD.rank[0] : LOD.rank[rk]);
      const a = ramp(r, gate, gate + (scene ? 0.3 : 0.22));
      const k = cfg(n.type);
      const wp = inFrame(pl.frame, spots[n.id][0], spots[n.id][1]);
      const p = toScreen(wp.x, wp.y);

      const it = acquire('N:' + n.id, tier,
        `<div class="ni"><svg viewBox="0 0 32 32"><use href="#i-${k.icon}"/></svg></div>` +
        `<div class="nl"><b>${esc(n.name)}</b></div>` +
        (n.job ? '<div class="nj">可打工</div>' : ''));
      it.el.style.setProperty('--nc', k.color);
      it.n = n;
      if (!it.bound) { it.el.onclick = () => onPick && onPick(it.n); it.bound = true; }

      /* 锚点出了视口就整个不显，不能只放宽到 ±120。
         放宽的后果是圆盘在屏外、标签被 padR 推回屏内——
         屏幕左边挂着一张"乌溪智慧农贸"，却没有任何东西指向它指的地方。
         标记的意义全在"它钉在哪儿"，锚点看不见，这张卡就不该在。 */
      const on = a > 0.02 && !buried(p) &&
        p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H;
      it.el.style.opacity = on ? a : 0;
      it.el.classList.toggle('on', on);
      it.el.dataset.here = n.id === STATE.player.at ? '1' : '';
      if (!on) return;

      /* 事件红点挂圆盘左上，可打工角标在右上，两边不打架。
         这一段也必须排在摆标签之前——它决定圆盘占多大地方 */
      const ev = eventAt[n.id];
      let evEl = it.el.querySelector('.nv');
      if (ev && !evEl) {
        evEl = document.createElement('div');
        evEl.className = 'nv';
        it.el.appendChild(evEl);
      }
      if (evEl) {
        evEl.textContent = ev ? (ev.n > 1 ? ev.n : '!') : '';
        evEl.style.display = ev ? '' : 'none';
      }
      if (it.ev !== !!ev) { it.ev = !!ev; pads(it); }

      boxes.push(placeNode(it, p, boxes));
    });
  }

  /** 在场人物的钉子也走池子 */
  const pins = new Map();
  function pinOf(ac) {
    let it = pins.get(ac.name);
    if (!it) {
      const el = document.createElement('div');
      el.className = 'pin';
      el.innerHTML = `<div class="pin-nm">${esc(ac.name)}</div>` +
        `<div class="pin-av"><img src="${ac.img || ''}" alt=""></div><div class="pin-tail"></div>`;
      host.appendChild(el);
      it = { el };
      pins.set(ac.name, it);
    }
    const img = it.el.querySelector('img');
    if (img && ac.img && img.getAttribute('src') !== ac.img) img.src = ac.img;
    const nm = it.el.querySelector('.pin-nm');
    if (nm && nm.textContent !== ac.name) nm.textContent = ac.name;
    return it;
  }

  /** 人物落点：有节点坐标就钉节点，否则钉所在区卡。总览也要看得见，不能等进区。 */
  function worldOfPerson(ac) {
    if (ac.at) {
      for (const key of Object.keys(M.PLACE)) {
        const spots = M.PLACE[key];
        if (!spots[ac.at]) continue;
        const f = M.PLATES[key].frame;
        if (f) return inFrame(f, spots[ac.at][0], spots[ac.at][1]);
      }
    }
    const d = M.DISTRICTS.find(x => x.key === ac.district);
    return d ? { x: d.at[0], y: d.at[1] } : null;
  }

  function drawPeople() {
    const W = vw(), H = vh();
    const groups = new Map();
    STATE.actors.forEach(ac => {
      const w = worldOfPerson(ac);
      if (!w) return;
      const key = `${w.x.toFixed(3)}|${w.y.toFixed(3)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ ac, w });
    });
    groups.forEach(list => {
      list.forEach((row, i) => {
        const p = toScreen(row.w.x, row.w.y);
        const x = p.x + (i - (list.length - 1) / 2) * 38;
        const y = p.y - 18;
        const on = x > -40 && x < W + 40 && y > -40 && y < H + 40;
        const pin = pinOf(row.ac);
        pin.el.style.left = x + 'px';
        pin.el.style.top = y + 'px';
        pin.el.style.opacity = on ? 1 : 0;
        pin.el.classList.toggle('on', on);
        pin.seen = true;
      });
    });
  }

  // ============ canvas 层 ============
  function drawCanvas() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const W = vw(), H = vh();
    if (canvas.width !== Math.round(W * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 光带压在卡片下面、底板上面
    Object.keys(M.PLACE).forEach(key => {
      const pl = M.PLATES[key], spots = M.PLACE[key];
      const a = ramp(ratio(key), LOD.detail, LOD.detail + 0.3);
      if (a < 0.02) return;
      const pts = STATE.route.filter(id => spots[id]).map(id => {
        const wp = inFrame(pl.frame, spots[id][0], spots[id][1]);
        const p = toScreen(wp.x, wp.y);
        return [p.x, p.y];
      });
      drawRoute(pts, a);
    });

    // 锚点小圆点撤了：圆盘现在就钉在锚点上，
    // 再画一个点就是同一个位置画两遍
    ctx.globalAlpha = 1;
  }

  /** 规划路线。底板上不需要沿街走，参考图里那些光带也是浮着的抽象线 */
  function drawRoute(pts, alpha) {
    if (pts.length < 2) return;
    // Catmull-Rom 平滑，直连的折线看着太像连线图
    const sm = [];
    const e = [pts[0], ...pts, pts[pts.length - 1]];
    for (let i = 1; i < e.length - 2; i++) {
      for (let k = 0; k < 16; k++) {
        const t = k / 16, t2 = t * t, t3 = t2 * t;
        const p0 = e[i - 1], p1 = e[i], p2 = e[i + 1], p3 = e[i + 2];
        sm.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        ]);
      }
    }
    sm.push(pts[pts.length - 1]);

    const trace = () => {
      ctx.beginPath();
      sm.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    };
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 三层：外阔、中亮、内芯
    [[16, 'rgba(96, 236, 190, .10)'], [7, 'rgba(120, 244, 200, .26)'], [2.6, 'rgba(224, 255, 244, .9)']]
      .forEach(([w, c]) => { trace(); ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke(); });
    // 流动虚线
    ctx.setLineDash([10, 22]);
    ctx.lineDashOffset = -(performance.now() / 34) % 32;
    trace();
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.restore();
  }

  // ============ 视野控制 ============
  /**
   * 平移边界：视野不许越出世界。
   * 可见的世界宽度是 1/z，所以中心的活动范围随缩放收窄；
   * 缩到比视口还小的方向直接钉在中间。
   */
  /** z=1（cover）时能看见的那块世界有多大。屏幕比底板宽就纵向裁，反之横向裁 */
  function band() {
    const s1 = Math.max(vw(), vh() / R);     // z=1 的 cover 尺度
    return { w: Math.min(1, vw() / s1), h: Math.min(1, vh() / (s1 * R)) };
  }

  /**
   * 可活动范围随缩放张开。
   *
   * 上一版是死按"z=1 能看见的那块"来夹，两个要求只满足了一个：
   * 最小缩放确实钉住了，但被裁掉的那条边【在任何缩放下都永远到不了】——
   * 浦江的锚点在 y=0.112，而视野上边最多只能到 0.126，
   * 于是拖不过去、点区卡也会被夹回来，那个区等于不存在。
   *
   * 现在让边距随缩放收：z=Z_MIN 时边距正好等于被裁掉的那条，
   * 活动区间收成零（一屏看全，不用拖也拖不动）；
   * 到 Z_OPEN 时边距归零，整张底板都能平移到。中间线性过渡，没有跳变。
   */
  const Z_OPEN_SPAN = 0.4;

  /** 1 = 还在总览档（收在可见带里），0 = 已经放开到整张底板 */
  function openT() {
    const z0 = zMin();
    const open = z0 + Z_OPEN_SPAN;
    return clamp((open - view.z) / (open - z0), 0, 1);
  }

  function clampView() {
    const z0 = zMin();
    /* 只在视口形状变了、最远档跟着变时，才把「正停在最远档」的镜头带过去。
       上一版每帧 |z-zMin|<0.05 就吸回去，指尖稍微捏一下会被钉死，进不了区。 */
    if (Math.abs(z0 - lastZMin) > 0.001 && Math.abs(view.z - lastZMin) < 0.08) {
      view.z = z0;
    }
    lastZMin = z0;
    view.z = clamp(view.z, z0, Z_MAX);
    const s = S(), b = band();
    const halfW = vw() / 2 / s, halfH = vh() / 2 / (s * R);
    const t = openT();
    /* 宽屏 cover 裁上下：总览档锁在设计构图里，推近再放行。
       竖屏 cover 裁左右：一屏本来就只是一条，锁死 X 等于西洲/落霞不存在。 */
    const insetX = cropsX() ? 0 : (0.5 - b.w / 2) * t;
    const insetY = (0.5 - b.h / 2) * t;
    const rx = Math.max(0, 0.5 - insetX - halfW), ry = Math.max(0, 0.5 - insetY - halfH);
    view.cx = clamp(view.cx, 0.5 - rx, 0.5 + rx);
    view.cy = clamp(view.cy, 0.5 - ry, 0.5 + ry);
  }

  let drag = null;
  const pointers = new Map();
  let pinch = null;

  platesHost.addEventListener('pointerdown', e => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    platesHost.setPointerCapture(e.pointerId);
    platesHost.classList.add('grabbing');
    if (pointers.size >= 2) {
      const pts = [...pointers.values()];
      pinch = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1, z: view.z };
      drag = null;
      anim = null;
      return;
    }
    drag = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy };
  });
  platesHost.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const midX = (pts[0].x + pts[1].x) / 2, midY = (pts[0].y + pts[1].y) / 2;
      const before = toWorld(midX, midY);
      const next = pinch.z * (dist / pinch.dist);
      const inward = next > view.z;
      view.z = next;
      zoomToAnchor(before, midX, midY, inward);
      return;
    }
    if (!drag) return;
    const s = S();
    view.cx = drag.cx - (e.clientX - drag.x) / s;
    view.cy = drag.cy - (e.clientY - drag.y) / (s * R);
    clampView();
  });
  const endPointer = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 1) {
      const p = [...pointers.values()][0];
      drag = { x: p.x, y: p.y, cx: view.cx, cy: view.cy };
      return;
    }
    drag = null;
    platesHost.classList.remove('grabbing');
  };
  platesHost.addEventListener('pointerup', endPointer);
  platesHost.addEventListener('pointercancel', endPointer);
  stage.addEventListener('touchmove', e => { e.preventDefault(); }, { passive: false });

  /** 滚轮以光标为锚点缩放：光标下那块地方缩放前后停在原处 */
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    anim = null;
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.13 : 1 / 1.13);
  }, { passive: false });

  /** 双击推近一档，也以光标为锚点 */
  stage.addEventListener('dblclick', e => {
    if (e.target.closest('.card, .exit, .devrow')) return;
    anim = null;
    zoomAt(e.clientX, e.clientY, 1.9);
  });

  // 平滑聚焦。点区卡不是切场景，是把镜头推过去
  let anim = null;
  function glide(cx, cy, z, ms) {
    anim = { t0: performance.now(), ms: ms || 620, from: { ...view }, to: { cx, cy, z } };
  }
  function stepAnim(now) {
    if (!anim) return;
    const k = clamp((now - anim.t0) / anim.ms, 0, 1);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;  // easeInOutCubic
    view.cx = anim.from.cx + (anim.to.cx - anim.from.cx) * e;
    view.cy = anim.from.cy + (anim.to.cy - anim.from.cy) * e;
    view.z = anim.from.z + (anim.to.z - anim.from.z) * e;
    clampView();
    if (k >= 1) anim = null;
  }

  /** 推到某个区：有底板就让 footprint 铺满；没有底板（青屏、东塘）也要能进去 */
  function focus(key) {
    const f = M.PLATES[key] && M.PLATES[key].frame;
    if (f) {
      // 1.1 倍略微溢出视口：正好铺满的话羽化带还在画面里，边上会透出总览
      glide(f.x + f.w / 2, f.y + f.w / 2, clamp(1.1 / f.w, zMin(), Z_MAX));
      return;
    }
    const d = M.DISTRICTS.find(item => item.key === key);
    if (d) glide(d.at[0], d.at[1], Math.min(Z_MAX, Math.max(2.2, view.z * 1.9)));
  }
  function fitAll(ms) {
    const z = zMin();
    const dur = typeof ms === 'number' ? ms : 520;
    if (dur === 0) {
      anim = null;
      view.cx = 0.5;
      view.cy = 0.5;
      view.z = z;
      clampView();
      return;
    }
    glide(0.5, 0.5, z, dur);
  }


  // ============ 主循环 ============
  // 光带的流动虚线要动，所以每帧都跑。节点是常驻 DOM，
  // 每帧只写 left/top/opacity，不碰布局查询，代价很低。
  (function tick(now) {
    stepAnim(now || performance.now());
    render();
    requestAnimationFrame(tick);
  })();

  window.addEventListener('resize', () => { invalidate(); clampView(); });

  // 控件尺寸一变就重排。时段条是 JS 建的，首帧量到的是个空盒子；
  // 开发条 ?dev=1 打开、按钮换行，高度也会跳
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => { invalidate(); clampView(); });
    ro.observe(stage);
    ['ctl', 'phase', 'dev'].forEach(id => {
      const el = document.getElementById(id);
      if (el) ro.observe(el);
    });
  }

  // 字体晚到会让标签宽度全部作废——量的是旧字体的宽度，
  // 碰撞盒就跟着错。整池推倒重建，重新量一次
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      pool.forEach(it => it.el.remove());
      pool.clear();
      invalidate();
    });
  }

  // ============ 樱花 ============
  // 氛围件，不是数据。宿主页面不想要就 PLATE_MAP.petals(false)
  const petalEls = [];
  (function petals() {
    for (let i = 0; i < 9; i++) {
      const el = document.createElement('div');
      el.className = 'petal';
      petalEls.push(el);
      const sz = 12 + Math.random() * 14;
      el.style.width = el.style.height = sz + 'px';
      stage.appendChild(el);
      const run = () => {
        const x0 = Math.random() * window.innerWidth;
        const dur = 11000 + Math.random() * 9000;
        el.animate([
          { transform: `translate(${x0}px,-40px) rotate(0deg)`, opacity: 0 },
          { transform: `translate(${x0 + 40}px,${window.innerHeight * .3}px) rotate(140deg)`, opacity: .5, offset: .3 },
          { transform: `translate(${x0 - 30}px,${window.innerHeight * .7}px) rotate(300deg)`, opacity: .38, offset: .7 },
          { transform: `translate(${x0 + 20}px,${window.innerHeight + 40}px) rotate(460deg)`, opacity: 0 }
        ], { duration: dur, easing: 'linear' }).onfinish = run;
      };
      setTimeout(run, Math.random() * 9000);
    }
  })();

  // ============ 控件 ============
  (function controls() {
    // 缩放：地图自己的东西，留着
    document.getElementById('c-in').onclick = () => { anim = null; zoomAt(vw() / 2, vh() / 2, 1.35); };
    document.getElementById('c-out').onclick = () => { anim = null; zoomAt(vw() / 2, vh() / 2, 1 / 1.35); };
    document.getElementById('c-fit').onclick = fitAll;

    const hb = document.getElementById('phase');
    M.PHASE_ORDER.forEach(k => {
      const b = document.createElement('button');
      b.textContent = k;
      b.onclick = () => { phase = k; applyPhase(); };
      hb.appendChild(b);
    });

    // 以下是开发用的，默认不出
    if (!/[?&]dev=1/.test(location.search)) return;
    document.getElementById('dev').hidden = false;

    const pb = document.getElementById('dev-plate');
    Object.keys(M.PLATES).forEach(k => {
      if (k === 'overview') return;
      const b = document.createElement('button');
      b.textContent = M.PLATES[k].label;
      b.onclick = () => focus(k);
      pb.appendChild(b);
    });

    // z / r 读数：调分级阈值时得看得见
    const zb = document.getElementById('dev-zoom');
    const ind = document.createElement('span');
    ind.className = 'zi';
    zb.append(ind);

    setInterval(() => {
      // 只看还在场的那些：最大的 r 常常属于一个早就移出视口的区，
      // 报它出来调阈值会被带跑
      // 报最上面那张（离视野中心最近的），不是 r 最大的那张
      let top = '', tr = 0, tz = -1;
      Object.keys(M.PLATES).forEach(k => {
        if (k === 'overview' || layers[k].__h) return;
        const z = zOf[k] || 0;
        if (z > tz) { tz = z; tr = ratio(k); top = M.PLATES[k].label; }
      });
      ind.textContent = `z ${view.z.toFixed(2)} · ${top} r ${tr.toFixed(2)}`;
    }, 120);
  })();

  applyPhase();
  clampView();
  invalidate();   // 控件刚建完，首帧那份空矩形作废

  /**
   * 对外接口。这张图要嵌进别的页面，所以玩法数据全部从外面灌进来：
   * 玩家在哪、谁在场、哪有事件、规划路线——地图自己不猜。
   *
   *   PLATE_MAP.setState({ player:{at:'wx_home'}, actors:[...], events:[...], route:[...] })
   *   PLATE_MAP.setPhase('暮')
   *   PLATE_MAP.focus('wuxi')     // 推镜头到某区
   *   PLATE_MAP.goto('wx_store')  // 推镜头到某个地点
   *   PLATE_MAP.onPick(fn)        // 点节点的回调，参数是节点数据
   */
  const API = {
    setState(s) {
      Object.assign(STATE, s);
      FORCED = forcedIds();
      lastKey = '';                 // 强制下一帧重排
    },
    setPhase(k) { if (M.PHASES[k]) { phase = k; applyPhase(); } },
    focus,
    fitAll,
    goto(id) {
      for (const key of Object.keys(M.PLACE)) {
        const spots = M.PLACE[key];
        if (!spots[id]) continue;
        const f = M.PLATES[key].frame;
        const w = inFrame(f, spots[id][0], spots[id][1]);
        glide(w.x, w.y, clamp(1.35 / f.w, zMin(), Z_MAX));
        return true;
      }
      return false;
    },
    onPick(fn) { onPick = fn; },
    petals(on) { petalEls.forEach(el => el.style.display = on ? '' : 'none'); },
    view: () => ({ ...view }),
    // 调阈值用的读数
    debug: () => ({ ...view, phase, zMin: +zMin().toFixed(4), ratios: Object.keys(M.PLATES).reduce((o, k) => (o[k] = +ratio(k).toFixed(3), o), {}) })
  };
  window.PLATE_MAP = API;

  // 截图和探测脚本沿用的短名
  window.__setPhase = API.setPhase;
  window.__focus = focus;
  window.__setView = (cx, cy, z) => { anim = null; Object.assign(view, { cx, cy, z }); clampView(); };
  window.__zoomAt = zoomAt;
  window.__view = API.debug;
})();
