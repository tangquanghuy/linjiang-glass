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
   *
   * ------------------------------------------------------------
   * frame 已按 overview_night 重对过位
   * ------------------------------------------------------------
   * 上一版是照淡入淡出的观感调的，没照着照片量辖区真正落在哪儿。
   * 以前这不影响任何东西——节点只在自己那张底板上显示，世界坐标只拿来
   * 算屏幕位置，没人会拿它跟照片对。
   *
   * 加了路网之后它变成硬问题：节点的世界坐标同时是「距离」的来源，也是
   * 地铁线和换乘环落点的来源。最干净的一次验证是换乘环——五个环里三个
   * （三牌楼 / 明湖广场 / 德泰百货）浮在开阔江面上，那是没法辩解的。
   * 按区卡锚点（那个逐个对过照片）量出来的旧偏差：
   *   浦江 2.4 · 明湖 2.2 · 鼓岭 2.2 · 落霞 1.6 · 乌溪 1.3
   *   雨石 1.2 · 西洲 0.8 · 青屏山 / 东塘 ≈ 0（单位 km）
   *
   * 现在这组是照着照片上各区的【地面】范围量的，不是楼顶：老城的城墙弧线、
   * CBD 塔基、湖岸、站房屋顶、操场跑道。绕行比也跟着好一档（1.16~1.35 → 1.00~1.26）。
   *
   * 三件必须说清楚的：
   *
   * 1. 完美对位做不到。总览是约 60° 斜俯视的透视图，纵向随景深非线性压缩，
   *    而 frame 是正方形（w × w）。明湖在照片上「宽 0.48 / 高 0.21」，
   *    正方形怎么摆都对不齐。要真几何对位，底板得是接近正交的俯视图。
   *
   * 2. 浦江和东塘是硬受限的，不是没量准。江北那条建成带在照片上只有
   *    0.078~0.141 这 0.06 高；机场和南郊农田几乎全在照片下边界外。
   *    这两个只能取「进得了 z=1 可见带、且落在照片上说得通的位置」。
   *
   * 3. 改这里会连带影响地铁站位和干道走向——但不用手改它们：
   *    city_net.js 里的折点全部锚在节点上（{n} / {a,b,t}），会自己跟着走。
   *    水系折线是绝对坐标，那个要一起改，它是跨江边的剔除依据。
   *
   * ?dev=1 会把九个 frame 的矩形、中心十字、区卡锚点和两者之间的连线都画出来，
   * 那条白线有多长就是还差多少。
   */
  const PLATES = {
    overview: {
      label: '全城', file: 'plate/overview_night.webp', kind: 'city',
      correct: 'brightness(1.0) saturate(1.0) contrast(1.0)'
    },
    wuxi: {
      label: '乌溪区', file: 'plate/wuxi_night.webp', kind: 'district',
      district: '乌溪区', frame: { x: 0.172, y: 0.475, w: 0.330 },
      correct: 'brightness(1.04) saturate(1.06) contrast(1.02)'
    },
    minghu: {
      label: '明湖区', file: 'plate/minghu_night.webp', kind: 'district',
      district: '明湖区', frame: { x: 0.470, y: 0.280, w: 0.320 },
      correct: 'brightness(0.98) saturate(1.02) contrast(1.03)'
    },
    guling: {
      label: '鼓岭区', file: 'plate/guling_night.webp', kind: 'district',
      district: '鼓岭区', frame: { x: 0.155, y: 0.295, w: 0.250 },
      correct: 'brightness(1.0) saturate(1.04) contrast(1.0)'
    },
    xizhou: {
      label: '西洲区', file: 'plate/xizhou_night.webp', kind: 'district',
      district: '西洲区', frame: { x: -0.005, y: 0.295, w: 0.230 },
      correct: 'brightness(1.02) saturate(1.0) contrast(1.0)'
    },
    luoxia: {
      label: '落霞区', file: 'plate/luoxia_night.webp', kind: 'district',
      district: '落霞区', frame: { x: 0.705, y: 0.520, w: 0.320 },
      correct: 'brightness(1.0) saturate(1.02) contrast(1.0)'
    },
    pujiang: {
      label: '浦江区', file: 'plate/pujiang_night.webp', kind: 'district',
      district: '浦江区', frame: { x: 0.080, y: 0.013, w: 0.340 },
      correct: 'brightness(1.0) saturate(1.0) contrast(1.0)'
    },
    yushi: {
      label: '雨石区', file: 'plate/yushi_night.webp', kind: 'district',
      district: '雨石区', frame: { x: 0.455, y: 0.615, w: 0.310 },
      correct: 'brightness(0.96) saturate(1.08) contrast(1.05)'
    },
    qingping: {
      label: '青屏山', file: 'plate/qingpingshan_night.webp', kind: 'district',
      district: '青屏山风景区', frame: { x: 0.795, y: 0.310, w: 0.260 },
      correct: 'brightness(1.02) saturate(1.08) contrast(1.02)'
    },
    dongtang: {
      label: '东塘区', file: 'plate/dongtang_night.webp', kind: 'district',
      district: '东塘区', frame: { x: 0.025, y: 0.655, w: 0.250 },
      correct: 'brightness(0.98) saturate(0.98) contrast(1.04)'
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
      wx_home: [0.205, 0.288],
      wx_dye: [0.220, 0.500],
      wx_adult_shop: [0.284, 0.656],
      wx_foot: [0.320, 0.540],
      wx_teahouse: [0.360, 0.460],
      wx_theme_hotel: [0.420, 0.500],
      wx_script: [0.460, 0.400],
      wx_story: [0.520, 0.460],
      wx_mendong: [0.500, 0.580],
      wx_arch: [0.560, 0.720],
      wx_huafang: [0.640, 0.640],
      wx_inn: [0.700, 0.560],
      wx_bathhouse: [0.868, 0.672],
      wx_riverhouse: [0.780, 0.420]
    },
    minghu: {
      mh_yunque: [0.540, 0.280],
      mh_cinema: [0.400, 0.340],
      mh_hospital: [0.260, 0.400],
      mh_lake_island: [0.880, 0.380],
      mh_lake: [0.800, 0.440],
      mh_dept: [0.480, 0.460],
      mh_plaza: [0.320, 0.480],
      mh_underpass: [0.500, 0.500],
      mh_bank: [0.440, 0.520],
      mh_civic: [0.360, 0.540],
      mh_wedding: [0.580, 0.560],
      mh_pool: [0.280, 0.620],
      mh_mart: [0.400, 0.640],
      mh_gym: [0.340, 0.700],
      mh_lanting: [0.700, 0.660],
      mh_youth_apt: [0.520, 0.740],
      mh_skyloft: [0.660, 0.300]
    },
    guling: {
      gl_florist: [0.380, 0.360],
      gl_cross_books: [0.560, 0.380],
      gl_boutique: [0.400, 0.400],
      gl_darkroom: [0.340, 0.420],
      gl_music: [0.600, 0.440],
      gl_wutong: [0.480, 0.460],
      gl_pharmacy: [0.300, 0.480],
      gl_cafe: [0.360, 0.500],
      gl_tailor: [0.520, 0.500],
      gl_barber: [0.320, 0.540],
      gl_pet: [0.620, 0.540],
      gl_laundry: [0.440, 0.540],
      gl_market: [0.240, 0.580],
      gl_parcel: [0.540, 0.600],
      gl_clinic: [0.280, 0.640],
      gl_agency: [0.660, 0.660],
      gl_yunting: [0.700, 0.740],
      gl_gongguan: [0.720, 0.380]
    },
    xizhou: {
      xz_jiangyan: [0.740, 0.200],
      xz_refuge: [0.260, 0.260],
      xz_run: [0.720, 0.320],
      xz_theatre: [0.400, 0.360],
      xz_yoga: [0.560, 0.400],
      xz_jiayuan: [0.220, 0.420],
      xz_yongchu: [0.420, 0.460],
      xz_sound_studio: [0.680, 0.460],
      xz_esports: [0.620, 0.500],
      xz_zhoumen: [0.500, 0.540],
      xz_livehouse: [0.380, 0.580],
      xz_izakaya: [0.460, 0.620],
      xz_sales: [0.580, 0.680],
      xz_mech_garage: [0.300, 0.740],
      xz_bonded: [0.200, 0.680],
      xz_warehouse: [0.160, 0.780],
      xz_jiangwan: [0.780, 0.300]
    },
    luoxia: {
      lx_lab: [0.540, 0.300],
      lx_archive: [0.480, 0.360],
      lx_dorm_roof: [0.580, 0.400],
      lx_schoolclinic: [0.460, 0.400],
      lx_library: [0.420, 0.460],
      lx_canteen: [0.400, 0.500],
      lx_gym: [0.640, 0.500],
      lx_print: [0.440, 0.540],
      lx_netcafe: [0.520, 0.560],
      lx_backstreet: [0.360, 0.620],
      lx_share: [0.500, 0.660],
      lx_capsule: [0.340, 0.680],
      lx_bus: [0.300, 0.740],
      lx_faculty: [0.700, 0.360]
    },
    pujiang: {
      pj_apt: [0.560, 0.220],
      pj_village: [0.400, 0.300],
      ys_rdpark: [0.640, 0.340],
      pj_yunju: [0.720, 0.420],
      pj_morning: [0.360, 0.380],
      pj_nightshift: [0.480, 0.720],
      ys_container: [0.580, 0.800]
    },
    yushi: {
      ys_reedbed: [0.800, 0.360],
      ys_station: [0.500, 0.480],
      ys_breakwater: [0.840, 0.540],
      ys_riverside: [0.560, 0.300],
      ys_fishmkt: [0.320, 0.560],
      ys_ferry: [0.720, 0.640],
      ys_shipyard: [0.280, 0.680],
      ys_carferry: [0.680, 0.720]
    },
    qingping: {
      qp_observatory: [0.520, 0.160],
      qp_glass: [0.580, 0.260],
      qp_temple: [0.440, 0.340],
      qp_villa: [0.680, 0.360],
      qp_shade: [0.180, 0.380],
      qp_teahouse: [0.480, 0.420],
      qp_camp: [0.620, 0.480],
      qp_main: [0.220, 0.500],
      qp_fall: [0.280, 0.540],
      qp_cycle: [0.740, 0.560],
      qp_cable: [0.340, 0.620],
      qp_farm: [0.780, 0.740],
      qp_visitor: [0.400, 0.840],
      qp_foothill_share: [0.520, 0.760],
      qp_hillhouse: [0.280, 0.240]
    },
    dongtang: {
      dt_nursery: [0.780, 0.200],
      dt_berry: [0.740, 0.260],
      dt_onsen: [0.160, 0.280],
      dt_park: [0.360, 0.320],
      dt_reservoir: [0.860, 0.340],
      dt_stay: [0.180, 0.400],
      dt_airport: [0.500, 0.420],
      dt_outlet: [0.240, 0.480],
      dt_fish: [0.820, 0.480],
      dt_kart: [0.580, 0.580],
      dt_gas: [0.300, 0.640],
      dt_drive: [0.640, 0.720],
      dt_service: [0.440, 0.800],
      dt_townhouse: [0.400, 0.880],
      dt_town_rental: [0.240, 0.760],
      dt_farmhouse: [0.580, 0.220]
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
    // 原来在 0.640，那是照片左侧那片仓库——「南郊空港」放在城西，
    // 加了地铁之后这个错读得很清楚（从乌溪家到空港直线只有 3.3 km）。
    // 现在挪到照片左下那片农田与出城高速，方位说得通，也进得了 z=1 可见带
    // （真正的南郊在照片下边界外面，摆过去在总览档就看不见了）。
    // 注意别再往下：0.785 会压着左下角的时段条，标签只能往上让，
    // 一屏九张卡里唯一一个朝上的，看着就是"没规律"
    { key: 'dongtang', name: '东塘区', sub: '空港与温泉', at: [0.110, 0.755], c: '#c2673a', i: 'water' }
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
    nature: ['nature', 'tree'],
    hotspring: ['leisure', 'water'],
    medical: ['civic', 'cross'],
    commercial: ['commerce', 'shop'],
    adult: ['leisure', 'shop'],
    academy: ['culture', 'book'],
    live: ['work', 'office'],
    living: ['living', 'house']
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

  window.__PM = { D, R, PLATES, PLACE, DISTRICTS, PHASES, PHASE_ORDER, LOD, GROUP, TYPE };
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
  const OPENING_MODE = new URLSearchParams(location.search).get('mode') === 'opening';
  let openingTarget = new URLSearchParams(location.search).get('target') || 'home';
  const OPENING_HOME_META = {
    lx_share: { cost: '月租 RMB 1,800 / 押二付一', note: '普通合租 / 大学城南侧通勤', tier: 'starter' },
    pj_apt: { cost: '月租 RMB 2,600 / 押二付一', note: '园区人才公寓 / 配套完整', tier: 'starter' },
    gl_yunting: { cost: '月租 RMB 3,200 / 押二付一', note: '私厨后院厢房 / 安静', tier: 'starter' },
    xz_jiayuan: { cost: '月租 RMB 3,900 / 押二付一', note: '大平层分租主卧 / 靠近直播产业带', tier: 'starter' },
    gl_wutong: { cost: '月租 RMB 2,200 / 押二付一', note: '老洋房步行房 / 离生活配套近', tier: 'starter' },
    pj_village: { cost: '月租 RMB 1,500 / 押二付一', note: '城中村自建房 / 公共空间紧凑', tier: 'starter' },
    wx_home: { cost: '自有房产 / 无月租', note: '前店后住的康养馆 / 无初始租金', tier: 'starter' },
    mh_youth_apt: { cost: '月租 RMB 3,200 / 押一付一', note: '城区小单间 / 公交与生活配套方便', tier: 'starter' },
    dt_town_rental: { cost: '月租 RMB 1,400 / 押一付一', note: '镇口低租单间 / 进城通勤较长', tier: 'starter' },
    qp_foothill_share: { cost: '月租 RMB 1,800 / 押一付一', note: '山脚合租卧室 / 末班公交较早', tier: 'starter' },
    // 五种"住法不同"的补充档，cost 与 opening.js 的 HOMES.cost 逐字一致
    lx_capsule: { cost: '月租 RMB 900 / 押一付一', note: '胶囊舱铺位 / 洗漱全公用', tier: 'starter' },
    dt_stay: { cost: '月租 RMB 2,000 / 押一付一', note: '民宿长包厢房 / 旺季要腾房', tier: 'starter' },
    wx_inn: { cost: '月租 RMB 1,900 / 押一付一', note: '临水客栈包月房 / 邻居换得勤', tier: 'starter' },
    qp_farm: { cost: '月租 RMB 800 / 押一付一 / 含三餐', note: '农家乐帮工房 / 早晚要搭手', tier: 'starter' },
    pj_nightshift: { cost: '月租 RMB 700 / 押一付一', note: '司机驿站铺位 / 通宵有人进出', tier: 'starter' }
  };
  const OPENING_JOB_META = {
    lx_print: { label: '\u6253\u5370\u5e97\u5e97\u5458', pay: 'RMB 4,500 / \u6708', hours: '09:00-18:00' },
    gl_parcel: { label: '\u5feb\u9012\u9a7f\u7ad9\u5e97\u5458', pay: 'RMB 4,800 / \u6708', hours: '08:30-18:30' },
    mh_mart: { label: '\u4fbf\u5229\u5e97\u5e97\u5458', pay: 'RMB 4,700 / \u6708', hours: '14:00-22:00' },
    xz_esports: { label: '\u7535\u7ade\u8231\u503c\u73ed\u5458', pay: 'RMB 5,200 / \u6708', hours: '16:00-00:00' },
    dt_gas: { label: '\u52a0\u6cb9\u7ad9\u591c\u73ed\u5e97\u5458', pay: 'RMB 5,600 / \u6708', hours: '20:00-06:00' },
    xz_sound_studio: { label: '\u5f55\u97f3\u68da\u52a9\u7406', pay: 'RMB 5,400 / \u6708', hours: '11:00-20:00' },
    xz_theatre: { label: '\u5267\u9662\u573a\u52a1', pay: 'RMB 4,600 / \u6708', hours: '13:00-22:00' },
    gl_pet: { label: '\u5ba0\u7269\u8bca\u7597\u6240\u52a9\u7406', pay: 'RMB 5,000 / \u6708', hours: '10:00-19:00' },
    mh_hospital: { label: '\u533b\u9662\u524d\u53f0\u52a9\u7406', pay: 'RMB 5,800 / \u6708', hours: '08:00-17:00' },
    lx_lab: { label: '\u5b9e\u9a8c\u697c\u503c\u73ed\u52a9\u7406', pay: 'RMB 6,000 / \u6708', hours: '18:00-02:00' },
    ys_rdpark: { label: '\u7814\u521b\u56ed\u884c\u653f\u52a9\u7406', pay: 'RMB 6,200 / \u6708', hours: '09:30-18:30' },
    wx_dye: { label: '\u624e\u67d3\u4f5c\u574a\u5b66\u5f92', pay: 'RMB 4,200 / \u6708', hours: '10:00-19:00' },
    // 每区补到 3 个岗位；label/pay/hours 与 opening.js 的 JOBS 逐字一致
    dt_outlet: { label: '奥莱店铺导购', pay: 'RMB 4,300 / 月', hours: '10:00-19:00' },
    dt_airport: { label: '航站楼地服引导员', pay: 'RMB 5,200 / 月', hours: '06:00-14:00' },
    wx_teahouse: { label: '茶馆跑堂', pay: 'RMB 4,000 / 月', hours: '09:00-18:00' },
    wx_script: { label: '实景剧场NPC演员', pay: 'RMB 4,800 / 月', hours: '14:00-23:00' },
    mh_cinema: { label: '影城放映助理', pay: 'RMB 4,400 / 月', hours: '12:00-21:00' },
    lx_canteen: { label: '食堂帮厨', pay: 'RMB 4,100 / 月', hours: '06:00-14:00' },
    ys_station: { label: '高铁站务引导员', pay: 'RMB 5,000 / 月', hours: '07:00-16:00' },
    pj_morning: { label: '生煎馆早班帮工', pay: 'RMB 4,300 / 月', hours: '05:00-13:00' },
    qp_visitor: { label: '游客中心咨询员', pay: 'RMB 4,500 / 月', hours: '08:30-17:30' },
    qp_cable: { label: '索道值守员', pay: 'RMB 4,700 / 月', hours: '08:00-17:00' },
    qp_teahouse: { label: '半山茶舍服务员', pay: 'RMB 4,200 / 月', hours: '09:00-18:00' },
    gl_cafe: { label: '洋房咖啡师', pay: 'RMB 4,600 / 月', hours: '08:00-17:00' }
  };
  function openingNodeAllowed(n) {
    if (!OPENING_MODE) return true;
    // 选工作那一档也要留住已选的住所：路线两头都得有牌子，
    // 不然画出来是一条从空白处伸出来的线。
    if (openingTarget === 'work') return !!OPENING_JOB_META[n.id] || n.id === STATE.player.at;
    return OPENING_STARTER_IDS.has(n.id);
  }
  /** 开局档的牌面：住所粉、工作蓝，跟宿主页面的图例对得上 */
  function openingKind(n) {
    if (!OPENING_MODE) return '';
    if (OPENING_JOB_META[n.id] && n.id !== STATE.player.at) return 'work';
    if (OPENING_HOME_META[n.id] || OPENING_STARTER_IDS.has(n.id)) return 'home';
    return '';
  }
  /** 牌子上的副行：住所写租金，工作写月薪，省得来回点节点比价 */
  function openingSub(n) {
    const h = OPENING_HOME_META[n.id], job = OPENING_JOB_META[n.id];
    if (openingTarget === 'work' && job) return job.pay;
    if (h) return h.cost;
    return n.district || '';
  }

  const OPENING_STARTER_IDS = new Set(Object.keys(OPENING_HOME_META));
  /* 牌子挤在一起时把锚点推开几十像素。同一个区里两个开局选项落得太近，
     后画的那张会压住前一张的名字，压过一半基本就点不到了。
     偏移量用 scripts/probe-pin-overlap.mjs 量出来的重叠尺寸定，成对反向推。 */
  const OPENING_NODE_OFFSET = {
    xz_sound_studio: [-20, -13],
    xz_esports: [20, 13],
    // 青屏山脚合租院 × 林下柴火农家乐：住所层里压了 87%
    qp_farm: [-26, -22],
    qp_foothill_share: [26, 22],
    // 大学城第一食堂 × 图文天下24h快印
    lx_canteen: [4, 26],
    lx_print: [-4, -22],
    // 杉杉奥特莱斯 × 东塘加油站洗车房
    dt_outlet: [-22, -16],
    dt_gas: [22, 16],
    // 芭比堂宠物医院 × 菜鸟驿站老街店（顺带避开梧桐里花园洋房）
    gl_pet: [-8, -18],
    gl_parcel: [14, 18]
  };
  const HOUSING_TIER_LABEL = { starter: '\u521d\u59cb\u4f4f\u5b85', advanced: '\u8fdb\u9636\u4f4f\u5b85', upper: '\u4e2d\u9ad8\u7ea7\u4f4f\u5b85', luxury: '\u9ad8\u7ea7\u4f4f\u5b85' };
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
  const STATIC_IDS = new Set(D.nodes.map(n => n.id));
  const customIds = new Set();
  let customRevision = 0;

  // ============ Runtime state ============
  /**
   * Start empty. The host injects player, actor, and event state through
   * PLATE_MAP.setState. Keeping demo actors here makes stale people flash while
   * an iframe is loading and masks integration failures.
   */
  const MAP_REV = '20260823-custom-nodes-v1';
  const STATE = {
    district: '',
    player: { at: '' },
    actors: [],
    events: []
  };

  /**
   * ============ 出行 ============
   * 路线不再由宿主灌进来。宿主只管"玩家在哪"，
   * "怎么去那儿"是地图自己算的——这才是这张图该负的责。
   *
   * all 里四种方式各存一份，因为 tab 上要同时摆出四个时长做对比。
   * 真实地图 App 就是这么做的，也是让"选哪种"变成一个真决定的唯一办法：
   * 只显示当前那一种，玩家没有比较对象，选择就退化成随手点。
   */
  const TRIP = { to: '', mode: 'transit', all: null, result: null };
  let onTravel = null;
  let onCustomCreate = null;
  let onCustomDelete = null;
  let customMode = false;
  let customDraft = null;

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

  // ============ 节点的世界坐标 ============
  /**
   * 把 PLACE（区内归一化）摊平成一张 id → [wx, wy] 的世界坐标表。
   * 这份表是路网、寻路、人物钉子、goto 的共同真源——
   * 以前 worldOfPerson 和 API.goto 各写了一遍同样的查找，
   * 现在谁要节点在哪儿都来问这里。
   *
   * 注意它依赖 PLATES[].frame。谁哪天挪了某个区的 footprint，
   * 这张表跟着变，自动生成的支路会重连；手写的地铁线和干道折点
   * 是绝对世界坐标，不会跟着动，得回 city_net.js 里对一遍。
   */
  const NODE_W = {};
  Object.keys(M.PLACE).forEach(key => {
    const f = M.PLATES[key] && M.PLATES[key].frame;
    if (!f) return;
    Object.keys(M.PLACE[key]).forEach(id => {
      const p = M.PLACE[key][id];
      NODE_W[id] = [f.x + p[0] * f.w, f.y + p[1] * f.w];
    });
  });
  const worldOf = id => NODE_W[id] || null;
  /** 这个节点在哪张底板上。判"节点有没有被别的底板盖住"要用 */
  const PLATE_OF = {};
  Object.keys(M.PLACE).forEach(key => {
    Object.keys(M.PLACE[key]).forEach(id => { PLATE_OF[id] = key; });
  });

  // ============ 路网 ============
  const NET = window.CITY_NET;
  const STATIC_NODE_W = { ...NODE_W };
  let G = NET ? NET.build({
    nodeWorld: NODE_W,
    nameOf: id => (byId[id] && byId[id].name) || id,
    anchorOf: id => byId[id]?.custom ? byId[id].anchorId : ''
  }) : null;

  function rebuildGraph() {
    G = NET ? NET.build({ nodeWorld: NODE_W, nameOf: id => (byId[id] && byId[id].name) || id, anchorOf: id => byId[id]?.custom ? byId[id].anchorId : '' }) : null;
    /* localEdges() 会把 G.E 的本地支路压成屏幕绘制缓存。只换 G 而不清它，
       删除节点后旧接驳线仍会继续画，直到整个地图 iframe 重载。 */
    localCache = null;
    customRevision++;
    lastKey = '';
  }

  function normalizeCustomNode(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    const plate = String(raw.plate || '').trim();
    const frame = M.PLATES[plate] && M.PLATES[plate].frame;
    const pos = Array.isArray(raw.localPos) ? raw.localPos.map(Number) : [];
    if (!id || !String(raw.name || '').trim() || !frame || pos.length < 2 || !pos.every(Number.isFinite)) return null;
    return {
      id,
      name: String(raw.name).trim(),
      aliases: Array.isArray(raw.aliases) ? raw.aliases.map(v => String(v || '').trim()).filter(Boolean) : [],
      fullName: `${String(raw.district || M.PLATES[plate].district || '').trim()} · ${String(raw.name).trim()}`,
      district: String(raw.district || M.PLATES[plate].district || '').trim(),
      archetype: String(raw.archetype || 'living').trim() || 'living',
      privacy: clamp(Number(raw.privacy) || 0, 0, 5),
      openHours: Array.isArray(raw.openHours) && raw.openHours.length ? raw.openHours.slice() : ['朝', '昼', '暮', '夜', '深夜'],
      intro: String(raw.intro || '').trim(),
      draw: String(raw.draw || '').trim(),
      special: Array.isArray(raw.special) ? raw.special.slice() : [],
      features: { canGather: !!raw.features?.canGather, canDate: !!raw.features?.canDate, canWork: !!raw.features?.canWork, hasShop: !!raw.features?.hasShop },
      plate, localPos: [clamp(pos[0], 0, 1), clamp(pos[1], 0, 1)],
      anchorId: String(raw.anchorId || '').trim(), anchorName: String(raw.anchorName || '').trim(),
      accessKm: Math.max(0, Number(raw.accessKm) || 0), createdAt: String(raw.createdAt || '').trim(), custom: true,
    };
  }

  function setCustomNodes(rows) {
    customIds.forEach(id => {
      const plate = PLATE_OF[id];
      if (plate && M.PLACE[plate]) delete M.PLACE[plate][id];
      delete PLATE_OF[id]; delete NODE_W[id]; delete byId[id];
      pool.get('N:' + id)?.el?.remove(); pool.delete('N:' + id);
    });
    customIds.clear();
    (Array.isArray(rows) ? rows : []).forEach(raw => {
      const n = normalizeCustomNode(raw);
      if (!n || STATIC_IDS.has(n.id)) return;
      const f = M.PLATES[n.plate].frame;
      if (!M.PLACE[n.plate]) M.PLACE[n.plate] = {};
      M.PLACE[n.plate][n.id] = n.localPos.slice();
      PLATE_OF[n.id] = n.plate;
      NODE_W[n.id] = [f.x + n.localPos[0] * f.w, f.y + n.localPos[1] * f.w];
      byId[n.id] = n;
      customIds.add(n.id);
    });
    rebuildGraph();
    /* 图结构一变，旧行程的 pts/legs 也属于旧图。终点或起点消失就清空，
       两端仍存在则按新图重算，避免 Canvas 留着删除前的路线光带。 */
    if (TRIP.to) {
      if (!NODE_W[TRIP.to] || !NODE_W[STATE.player.at]) clearTrip();
      else recompute();
    }
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
    document.querySelectorAll('#phase button[data-ph]').forEach(b =>
      b.classList.toggle('on', b.dataset.ph === phase));
    if (selId && byId[selId]) renderSpot(byId[selId]);
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
      pool.set(key, it);
    }
    it.seen = true;
    return it;
  }

  /** 让下一帧彻底重排。字体加载完、窗口改了、状态换了都得从这里捅一下 */
  function invalidate() { lastKey = ''; }

  /**
   * 摆一个节点：圆盘钉在锚点，名字永远在正下方。
   * 出了画面就把字藏掉、圆盘留着。不换到左右上——视口一动标签就绕圈，读成卡片在转。
   *
   * 这里【不做】标签互相避让。上一版把占位框一路收集下来、还按角标溢出算了 padding，
   * 但从来没做过相交测试——那套东西是有意不要的：
   * 挤开之后标签就不在它指的地方了，一屏下来全是"名字在飘"，比叠着更难读。
   * 真正的密度控制手段是 LOD：远了少显几级，不是把字推来推去。
   */
  /* 开局档的标签占位。这一档所有可选点【同时】全程显示（不走 LOD），
     西洲那几个点彼此只隔三四十像素，牌子必然叠。
     处理方式仍然不挪位置——挪了名字就不在它指的地方——而是叠上去的那张
     整块撤掉，只留圆盘；圆盘照样能点，信息在侧栏里读。
     先摆的赢：排序里选中项和已选住所在最前。 */
  let openLabRects = [];
  function placeNode(it, s) {
    it.el.style.left = s.x + 'px';
    it.el.style.top = s.y + 'px';
    if (!it.lab) return;

    /* 宽度得等牌子真正在场了才量。acquire 里那次是在 .np 还没 on 的时候量的，
       量回来的是圆盘那点宽度（绝对定位的牌子按包含块收缩），
       于是 dx=-lw/2 只挪了十几像素——所有名字都偏在圆盘右边，
       而且按这个宽度做的相交测试永远测不出叠。量一次就够，之后内容不变。 */
    if (!it.lm && it.el.classList.contains('on')) {
      // acquire() runs before the node enters its visible state. At that point some
      // browsers report the icon as 0 ? 0, which pins the plaque to the node's
      // top-left corner instead of below the disc. Unhide first, then measure the
      // actual rendered icon and plaque together.
      it.lab.className = 'nl';
      it.iw = it.ic.offsetWidth;
      it.ih = it.ic.offsetHeight;
      it.lw = it.lab.offsetWidth;
      it.lh = it.lab.offsetHeight;
      it.lm = true;
    }

    const g = 6;
    const left = (it.iw - it.lw) / 2;
    const top = it.ih + g;
    const x = s.x - it.lw / 2, y = s.y + it.ih / 2 + g;
    const pad = 10, W = vw(), H = vh();
    if (x < pad || y < pad || x + it.lw > W - pad || y + it.lh > H - pad) {
      it.lab.className = 'nl hide';
      return;
    }
    it.lab.style.left = left + 'px';
    it.lab.style.top = top + 'px';
    if (OPENING_MODE && it.n) {
      const m = 4;
      const box = { x: x - m, y: y - m, w: it.lw + m * 2, h: it.lh + m * 2 };
      // 当前选中和已选住所是这一步的主角，永远保留牌子；让别人给它让
      const keep = it.n.id === selId || it.n.id === STATE.player.at;
      const hit = !keep && openLabRects.some(r =>
        box.x < r.x + r.w && box.x + box.w > r.x && box.y < r.y + r.h && box.y + box.h > r.y);
      /* 被叠掉的那张位置照样算好——dup 是"暂时收起来"，指到圆盘上就放出来。
         每个选项都得能读到名字，否则地图上会剩几个不知道是什么的圆点。 */
      if (hit) { it.lab.className = 'nl hide dup'; return; }
      openLabRects.push(box);
    }
    it.lab.className = 'nl';
  }

  const cfg = t => {
    const e = M.TYPE[t] || ['living', 'shop'];
    return { color: M.GROUP[e[0]], icon: e[1] };
  };
  const RANK0 = new Set([
    'qp_main', 'qp_visitor',
    'dt_airport', 'dt_onsen',
    'mh_hospital', 'mh_lake', 'mh_dept',
    'gl_wutong', 'gl_market',
    'wx_home', 'wx_mendong',
    'lx_library', 'lx_gym',
    'xz_theatre', 'xz_zhoumen', 'xz_jiangyan',
    'ys_station', 'pj_village'
  ]);
  const rankOf = n => {
    if (RANK0.has(n.id)) return 0;
    if (n.privacy >= 4 && !n.features?.hasShop && !n.features?.canWork) return 2;
    return 1;
  };
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  /** 玩家、在场人物、事件、当前行程两端的地点必须出现，不参与竞争 */
  function forcedIds() {
    const s = new Set();
    if (STATE.player.at) s.add(STATE.player.at);
    STATE.actors.forEach(a => { if (a.at) s.add(a.at); });
    STATE.events.forEach(e => { if (e.at) s.add(e.at); });
    if (TRIP.to) s.add(TRIP.to);
    return s;
  }
  let FORCED = forcedIds();
  /** 点节点的回调。详情页由地图自己打开；宿主若还要接，走 onPick */
  let onPick = null;
  let selId = '';

  /**
   * 视野没变就不重排。
   * 每帧唯一必须动的是光带那圈流动虚线，那只是 canvas 一次重画；
   * 底板变换和节点排版跟着每帧跑的话白烧掉一半帧率。
   */
  let lastKey = '';
  function render() {
    const key = `${view.cx.toFixed(5)}|${view.cy.toFixed(5)}|${view.z.toFixed(5)}|${vw()}x${vh()}|${phase}|c${customRevision}`;
    if (key !== lastKey) { lastKey = key; renderNodes(); drawScale(); }
    drawCanvas();
  }

  function renderNodes() {
    const W = vw(), H = vh();
    openLabRects = [];
    layoutPlates();
    pool.forEach(it => it.seen = false);
    pins.forEach(it => it.seen = false);

    // 区卡：自己那片 footprint 在屏幕上占到一定宽度就淡出，交给地点
    M.DISTRICTS.forEach(d => {
      const has = M.PLATES[d.key];
      const r = has ? ratio(d.key) : 0;
      // 没有底板的区跟着整体缩放退场，不然会一直挂在放大的图上
      /* 路网视图里区卡整个撤掉。
         区卡是「进哪个区」的入口，属于氛围那一档；打开路网是要查线路，
         两组标签抢同一块地方——探测出来五个换乘站名全在场、opacity 都是 1，
         但乌溪门东压在乌溪区卡下面、临江南站压在雨石区卡下面，看不见。
         标签避让那套是你让删的，也不该加回来：挤开之后名字就不在它指的
         地方了。所以按视图分层——这一档显示轨道，那一档显示区。 */
      /* 开局档同理：那一档只有七八个可选点，且它们全程 opacity=1，
         区卡跟它们钉在同一片地方——西洲区压着西洲嘉苑、鼓岭区压着云庭公寓。
         区名改挂在地点牌的副行上，谁在哪个区照样读得出来。 */
      const a = (netView || OPENING_MODE ? 0 : 1) * (has ? 1 - ramp(r, LOD.chipOut[0], LOD.chipOut[1])
        : 1 - ramp(view.z, 1.5, 2.3));
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
      placeNode(it, p);
    });

    // 地点：逐级显形
    Object.keys(M.PLATES).forEach(key => {
      if (M.PLACE[key]) drawDistrict(key);
    });

    /* 站名排在地点之后：它要判「这个地点的白牌在不在场」来决定是否补站名，
       排在前面读到的是上一帧的状态，切换缩放时会闪一帧重复标签 */
    drawStations();

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
      if (on) placeNode(it, p);
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
   * rank 0 地标先来，然后常去地点、次级地点，最后子场景——
   * 这个顺序现在只决定 DOM 里谁在前，密度靠 LOD 门槛控制，不靠互相挤。
   */
  function drawDistrict(key) {
    const pl = M.PLATES[key], spots = M.PLACE[key];
    const r = ratio(key);
    if (r < LOD.rank[0] - 0.1 && !OPENING_MODE) return;      // 还太远，整层不用算
    const W = vw(), H = vh();

    /* 节点只能出现在自己那张底板上。
       相邻区的 footprint 交叠时，压在下面那张的节点会飘到上面那张的画面里，
       看着就是"雨石区的火车站上挂着乌溪区的地点"。 */
    const rects = plateRects().filter(t => t.k !== key && t.z > (zOf[key] || 0) && t.a > 0.55);
    const buried = p => rects.some(t => p.x > t.x && p.x < t.x + t.w && p.y > t.y && p.y < t.y + t.h);

    const list = Object.keys(spots).map(id => byId[id]).filter(Boolean).filter(openingNodeAllowed);
    const eventAt = {};
    STATE.events.forEach(e => eventAt[e.at] = e);

    // 强制显示的排在最前，其余按 rank
    const sorted = list.slice().sort((a, b) => pri(a) - pri(b));
    function pri(n) {
      if (OPENING_MODE && n.id === selId) return -2;
      if (FORCED.has(n.id)) return -1;
      if (n.parentId || n.type === 'scene') return 9;
      return rankOf(n);
    }

    sorted.forEach(n => {
      const scene = n.parentId || n.type === 'scene';
      const rk = rankOf(n);
      const tier = scene ? 'scene' : rk === 0 ? 'major' : rk >= 2 ? 'minor' : '';
      const openingNode = OPENING_MODE && openingNodeAllowed(n);
      const gate = openingNode ? 0 : (scene ? LOD.scene : (FORCED.has(n.id) ? LOD.rank[0] : LOD.rank[rk]));
      const a = openingNode ? 1 : ramp(r, gate, gate + (scene ? 0.3 : 0.22));
      const k = cfg(n.archetype);
      const wp = inFrame(pl.frame, spots[n.id][0], spots[n.id][1]);
      const p = toScreen(wp.x, wp.y);
      const openingOffset = OPENING_MODE && OPENING_NODE_OFFSET[n.id];
      if (openingOffset) { p.x += openingOffset[0]; p.y += openingOffset[1]; }
      /* 开局节点也必须服从地图本体的世界坐标。竖屏只能看到城市的一部分，
         视口外的选项留在原地，玩家拖动地图后再进入画面；不能把它们 clamp 到
         屏幕边缘，否则不同城区会被压成两列，节点与底图也失去空间对应。 */

      const okind = openingKind(n);
      const it = acquire('N:' + n.id, tier,
        `<div class="ni"><svg viewBox="0 0 32 32"><use href="#i-${k.icon}"/></svg></div>` +
        `<div class="nl"><b>${esc(n.name)}</b>` +
        (OPENING_MODE ? `<i>${esc(openingSub(n))}</i>` : '') + '</div>' +
        /* 「可打工」角标在开局档是噪声：选住所时它跟这一步无关，
           选工作时留在场的每个牌子都是岗位，说了也是废话 */
        (!OPENING_MODE && n.features && n.features.canWork ? '<div class="nj">可打工</div>' : ''));
      it.el.style.setProperty('--nc', okind === 'work' ? '#4b9bdd' : okind === 'home' ? '#e0559a' : k.color);
      it.el.classList.toggle('custom', !!n.custom);
      if (it._ok !== okind) { it._ok = okind; it.el.dataset.opening = okind; }
      it.n = n;
      if (!it.bound) {
        it.el.onclick = () => {
          if (OPENING_MODE) {
            selId = it.n.id;
            invalidate();
            if (onPick) onPick(it.n);
            return;
          }
          openSpot(it.n);
          if (onPick) onPick(it.n);
        };
        it.bound = true;
      }
      /* 选中的那张牌多带一行租金/月薪。默认不带是因为牌子宽度直接决定
         有多少张能同时露名字——七个选项里三个被挤掉，就不成选择界面了。 */
      const selNow = n.id === selId ? '1' : '';
      if (it.el.dataset.sel !== selNow) { it.el.dataset.sel = selNow; it.lm = false; }

      /* 锚点出了视口就整个不显，不能只放宽到 ±120。
         放宽的后果是圆盘在屏外、标签被 padR 推回屏内——
         屏幕左边挂着一张"乌溪智慧农贸"，却没有任何东西指向它指的地方。
         标记的意义全在"它钉在哪儿"，锚点看不见，这张卡就不该在。 */
      const on = a > 0.02 && (OPENING_MODE || !buried(p)) &&
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

      placeNode(it, p);
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
    const w = ac.at && worldOf(ac.at);
    if (w) return { x: w[0], y: w[1] };
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
  /**
   * 画在这一层的东西，从下到上：水系 → 干道 → 地铁 → 站点 → 当前路线。
   * 这一层是这张图的「中频」：底板是高频的噪，节点牌是高频的锐，
   * 中间原来什么都没有，所以标记不管怎么调都读作贴在照片上。
   * 河、路、线是低频、规则、有秩序的，缝的就是这条缝。
   */
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
    if (!NET) return;

    domNow = plateDominance();
    /* 水系仍然只在 ?dev=1 出：它作为寻路障碍是有用的（RNG 靠它剔掉跨江的边），
       但作为图形，位置取决于底板对位，而对位还没定——湖的轮廓现在落在照片里
       对岸的山坡上。照片本身已经把江和湖交代清楚了，不缺这一层。 */
    if (showNet) { drawLocal(); drawWays(); drawMetro(); }
    drawTrip();
    if (DEV) { drawWater(); drawFrames(); }
    ctx.globalAlpha = 1;
  }
  let domNow = 0;
  const DEV = /[?&]dev=1/.test(location.search);
  let showNet = true;

  const sp = p => { const q = toScreen(p[0], p[1]); return [q.x, q.y]; };
  const trace = pts => {
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
  };

  /**
   * 向心 Catmull-Rom（alpha = 0.5）过点采样。
   *
   * 为什么不是普通的均匀 Catmull-Rom：站间距差很多（市区 1.4 km、郊区 2.6 km），
   * 均匀参数化在间距不匀又转角大的地方会甩出去——上一版从明湖往落霞那一段
   * 直接鼓成一个大圆弧，比原来的硬折线还离谱。向心参数化的性质就是
   * 不产生尖点也不过冲，同时仍然精确过每一个点，所以站台圆点还是落在线上。
   *
   * 也不用圆角折线：那个不过点，在明湖广场那种 V 形转角上站点会掉到线外面。
   */
  function smooth(pts, seg) {
    if (pts.length < 3) return pts;
    const n = seg || 12;
    const e = [pts[0], ...pts, pts[pts.length - 1]];
    const out = [];
    const knot = (a, b) => Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])) || 1e-4;
    for (let i = 1; i < e.length - 2; i++) {
      const p0 = e[i - 1], p1 = e[i], p2 = e[i + 1], p3 = e[i + 2];
      const t0 = 0, t1 = t0 + knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3);
      for (let k = 0; k < n; k++) {
        const t = t1 + (t2 - t1) * (k / n);
        const mix = (a, b, ta, tb) => {
          const d = tb - ta || 1e-4, u = (t - ta) / d;
          return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
        };
        const a1 = mix(p0, p1, t0, t1), a2 = mix(p1, p2, t1, t2), a3 = mix(p2, p3, t2, t3);
        const b1 = mix(a1, a2, t0, t2), b2 = mix(a2, a3, t1, t3);
        out.push(mix(b1, b2, t1, t2));
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  /**
   * 底板占了多大份。用来让水系随进区淡出——
   * 矢量的河压在写实的河上会很假，所以进区之后交回底板像素，
   * 只在总览到中景这一段用它把九张不同相机的底板缝成一座城。
   */
  function plateDominance() {
    let m = 0;
    Object.keys(M.PLATES).forEach(k => {
      if (k === 'overview' || !M.PLATES[k].frame) return;
      const a = +(layers[k].__o || 0);
      if (a > m) m = a;
    });
    return m;
  }

  function drawWater() {
    const a = (1 - domNow * 0.85) * 0.9;
    if (a < 0.03) return;
    const s = S();
    ctx.save();
    ctx.globalAlpha = a;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const river = smooth(NET.WATER.river.pts.map(sp), 10);
    const wpx = NET.WATER.river.width * s;
    // 水体本身：一条压暗的冷带，不是不透明的蓝
    trace(river);
    ctx.strokeStyle = 'rgba(14, 32, 62, .40)';
    ctx.lineWidth = wpx;
    ctx.stroke();
    // 两道岸线亮边。真正让人读出"这是一条连续的河"的是边，不是面
    ctx.strokeStyle = 'rgba(150, 200, 246, .26)';
    ctx.lineWidth = Math.max(1, wpx * 0.06);
    [-1, 1].forEach(side => {
      trace(river.map((p, i) => {
        const q = river[Math.min(i + 1, river.length - 1)];
        const r = river[Math.max(i - 1, 0)];
        const dx = q[0] - r[0], dy = q[1] - r[1];
        const L = Math.hypot(dx, dy) || 1;
        return [p[0] - dy / L * side * wpx / 2, p[1] + dx / L * side * wpx / 2];
      }));
      ctx.stroke();
    });
    // 江心洲
    trace(smooth(NET.WATER.isle.map(sp), 8)); ctx.closePath();
    ctx.fillStyle = 'rgba(26, 48, 40, .45)';
    ctx.fill();

    NET.WATER.lakes.forEach(l => {
      // 闭合轮廓：首尾各补一点，不然接缝处会出一个尖角
      const raw = l.pts.map(sp);
      const pts = smooth([raw[raw.length - 1], ...raw, raw[0]], 8);
      trace(pts); ctx.closePath();
      ctx.fillStyle = 'rgba(14, 32, 62, .42)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(150, 200, 246, .24)';
      ctx.lineWidth = Math.max(1, s * 0.0016);
      ctx.stroke();
    });
    ctx.restore();
  }

  /**
   * ============ 路网的画法 ============
   * 照 dragon_map 那套航路的语言来：细、虚、淡、按种类分色，没有发光也没有描边。
   * 那边的数值是 lineWidth 1.1~2.0、dash [2,6]~[7,6]、alpha 0.42~0.55，
   * 而且线宽和虚线间隔都跟着缩放走。
   *
   * 唯一要翻过来的是明暗：那张图是浅底，所以用深色低透明；
   * 这张是夜景照片，深色描上去等于没画，所以换成浅色低透明，alpha 取值更低
   * （照片本身是花的，同样的 alpha 在这儿会比在纯色底上更显）。
   *
   * 三次返工的教训写在这儿：饱和实色 → 一团电线；纯加法发光 → 亮部消失、
   * 暗部过曝；暗垫 + 发光 + 亮芯 → 作为「画」合格了，但它在抢戏。
   * 路网是背景信息，读得出走向就够，不该比地点牌还显眼。
   */
  const WAY_STYLE = {
    express: { c: 'rgba(255, 206, 148, ', a: 0.34, w: 1.5, dash: [11, 7], bow: 0.030 },
    arterial: { c: 'rgba(198, 216, 248, ', a: 0.18, w: 1.2, dash: [7, 6], bow: 0.055 },
    bridge: { c: 'rgba(222, 236, 255, ', a: 0.34, w: 1.5, dash: [5, 5], bow: 0.018 },
    tunnel: { c: 'rgba(172, 194, 234, ', a: 0.22, w: 1.1, dash: [2, 7], bow: 0.020 }
  };

  /** 虚线和线宽跟着缩放走，不然推近之后虚线密得像实线 */
  function dashScale() { return clamp(view.z * 0.72, 0.8, 2.4); }

  /**
   * 折线画成一串微弯的二次贝塞尔。
   * 控制点沿法向偏 len × curve，和 dragon_map 的 buildEdgePath 是同一个式子；
   * curve 由「路的 id + 第几段」哈希出来，所以每帧都一样、不会抖，
   * 而且每段各弯各的，读起来像路在拐，不像谁用尺子画的。
   *
   * 逐段独立的二次曲线在折点处只有 C0 连续——对路来说这正好，
   * 路口本来就是要有个折的。轨道不走这条，走下面平滑的那个。
   */
  function traceBowed(pts, amp, seed) {
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      let h = Math.sin((seed + i * 37.13) * 12.9898) * 43758.5453;
      h = h - Math.floor(h);                       // 0~1，稳定
      const c = amp * (h * 2 - 1);
      ctx.quadraticCurveTo(
        (a[0] + b[0]) / 2 - dy * c,
        (a[1] + b[1]) / 2 + dx * c,
        b[0], b[1]
      );
    }
  }
  const hashOf = s => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
    return h;
  };

  /**
   * 点与点之间的连线——自动生成的那层支路（RNG）。
   * 这一层一直在图里跑（寻路走的就是它），但之前从来没画出来，
   * 所以玩家看到的"路网"其实缺了最底下也是最密的一级。
   *
   * 它是最细一级，所以门槛也最高：z<1.5 完全不出。
   * 总览档 250 条线糊满全城，读不出任何东西，而那一档要看的是区和轨道；
   * 推近之后它才有意义——"从这个点能直接走到哪几个点"。
   * 参考 dragon_map 里 scene 那一档的处理（SCENE_VISIBLE_SCALE 之下不画）。
   */
  let localCache = null;
  function localEdges() {
    if (!localCache) {
      localCache = G.E.filter(e => e.kind === 'local').map(e => {
        const a = G.V.get(e.a), b = G.V.get(e.b);
        return [[a.x, a.y], [b.x, b.y], hashOf(e.a + e.b)];
      });
    }
    return localCache;
  }

  function drawLocal() {
    /* 这一档的参数返工过两次，两次都太淡，所以把目标写下来：
       区级要能一眼看出「这个点直接连到哪几个点」，亮度大致和照片自己的
       街道灯带相当——明确在场、可追踪，但明显退在白色地点牌后面。
       两处错误：
         1) 乘了 (1 - domNow * 0.35)。压制方向是反的——支路是区内信息，
            进区正是该看它的时候，不该跟着底板淡出。干道和轨道压是对的
            （那两层在区级几何上对不齐），支路连的是同一张底板上的点。
         2) 套了全量 dashScale。z=3.3 时虚线被拉成 [5.9, 13]，
            稀疏短划 + 低透明度叠起来等于没画。支路的虚线间隔要收着。 */
    const fade = ramp(view.z, 1.2, 1.9);
    if (fade < 0.04) return;
    const W = vw(), H = vh();
    ctx.save();
    ctx.lineCap = 'round';
    // 比主干道淡一档、虚线更碎——它读的是「能走过去」，不是「有一条路」
    ctx.strokeStyle = `rgba(198, 216, 246, ${(0.42 * fade * boost()).toFixed(3)})`;
    ctx.lineWidth = 1 * clamp(view.z * 0.5, 0.7, 1.5);
    ctx.setLineDash([2.5, 4].map(v => v * clamp(view.z * 0.5, 0.8, 1.6)));

    /* 250 条边共用同一套样式，所以攒成一条 path 一次 stroke。
       上一版是每条边各 beginPath + stroke，帧率掉了 6 帧（58 → 52）；
       canvas 的开销主要在 stroke 调用次数上，不在路径长度。 */
    ctx.beginPath();
    localEdges().forEach(([wa, wb, h]) => {
      const a = sp(wa), b = sp(wb);
      // 两端都在同一侧屏外的直接跳过，一屏之内大半都是
      if ((a[0] < 0 && b[0] < 0) || (a[0] > W && b[0] > W) ||
        (a[1] < 0 && b[1] < 0) || (a[1] > H && b[1] > H)) return;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      let k = Math.sin(h * 12.9898) * 43758.5453;
      k = (k - Math.floor(k)) * 2 - 1;
      const c = 0.045 * k;
      /* 折成两段直线而不是画二次曲线。给曲线做虚线很贵——光栅化要先把曲线
         展平再沿弧长量每一段划，250 条叠起来掉了 10 帧。
         二次曲线的顶点就在 (起点+终点)/2 + 法向偏移 的一半处，
         所以取那个点连两段直线，1px 虚线上看不出差别。 */
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo((a[0] + b[0]) / 2 - dy * c * 0.5, (a[1] + b[1]) / 2 + dx * c * 0.5);
      ctx.lineTo(b[0], b[1]);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawWays() {
    const fade = 1 - domNow * 0.55;
    if (fade < 0.05) return;
    const ds = dashScale();
    ctx.save();
    ctx.lineCap = 'round';
    NET.WAYS.forEach(w => {
      const g = G.wayGeom(w);
      if (g.length < 2) return;
      const st = WAY_STYLE[w.kind] || WAY_STYLE.arterial;
      traceBowed(g.map(sp), st.bow, hashOf(w.id));
      ctx.strokeStyle = st.c + Math.min(0.9, st.a * fade * boost()).toFixed(3) + ')';
      ctx.lineWidth = st.w * clamp(view.z * 0.62, 0.7, 1.9);
      ctx.setLineDash(st.dash.map(v => v * ds));
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.restore();
  }

  /**
   * 地铁线。画在节点牌下面（canvas 是 z-index 8，#nodes 是 9）。
   *
   * 进区之后压到三成。原因不是好看，是几何上站不住：
   * 区底板是斜俯视的透视图，而这条线是平面的。
   * 平面线画在透视图上，它会从前排楼的楼顶穿过去——
   * 在总览那种小而软的画面上读作示意图还行，
   * 推到区级、楼有几百像素高的时候就是明显的错。
   * 真要在区级也对得上，底板得是接近正交的俯视图。
   */
  /**
   * 轨道。比干道略强一档（它是骨架），但仍然是细虚淡，不发光。
   * 走平滑曲线而不是逐段微弯——轨道是大半径缓和曲线，路才是一路拐。
   * 这一点差别让两层不用靠颜色也分得开。
   */
  function drawMetro() {
    const fade = (0.86 + ramp(view.z, 1, 2.4) * 0.14) * (1 - domNow * 0.6);
    if (fade < 0.05) return;
    const ds = dashScale();
    const lw = 1.6 * clamp(view.z * 0.66, 0.75, 2);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    NET.METRO.forEach(line => {
      const pts = stationPts(line);
      if (pts.length < 2) return;
      trace(smooth(pts, 12));
      /* 0.55 而不是 0.42，虚线 16/6 而不是 13/7。
         上一版和干道一个量级，五条线的身份色在花底子上全糊掉了，
         最显眼的反而是琥珀色的快速路——层级正好反了。
         轨道要比路强一档：它是唯一需要「从头描到尾」的那层。
         虚线也得拉长，短划太密会读成点串而不是一笔。 */
      ctx.strokeStyle = hexA(line.glow || line.color, Math.min(0.92, 0.55 * fade * boost()));
      ctx.lineWidth = lw;
      ctx.setLineDash([16, 6].map(v => v * ds));
      ctx.stroke();
    });
    ctx.setLineDash([]);

    /* 只标换乘站，一屏五个。普通站的点和站名都撤了——
       五十个白点加五十个名字就是在抢戏，而"哪儿能换乘"才是看这张图时
       真正想知道的事。具体到哪一站上车，行程面板里写着。 */
    /* 换乘点。上一版是 1.8px / 50% 的实心点——那个参数下它等于没画，
       嘴上说「只标换乘站」，图上其实一个都看不见。
       现在做成小白环：3px 起、0.85 不透明，中心填暗色把虚线挡掉，
       不然线会从环里穿过去，读成一段线上的疙瘩而不是一个站。
       全城只有五个（三牌楼 1/2、门东 1/3、明湖广场 2/4、德泰百货 2/5、
       临江南站 3/5），视觉成本比一张图例或五十个站名低得多，
       而「哪儿能换乘」恰恰是看全城图时唯一真会用到的那条信息。 */
    const r = clamp(3 + (view.z - 1) * 0.34, 3, 5);
    stationList().forEach(s => {
      if (s.lines.length < 2) return;
      const p = sp([s.x, s.y]);
      if (p[0] < -20 || p[0] > vw() + 20 || p[1] < -20 || p[1] > vh() + 20) return;
      ctx.beginPath();
      ctx.arc(p[0], p[1], r, 0, 6.284);
      ctx.fillStyle = `rgba(10, 16, 32, ${(0.62 * fade).toFixed(3)})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(238, 246, 255, ${Math.min(1, 0.85 * fade * boost()).toFixed(3)})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    });
    ctx.restore();
  }

  /** #rrggbb + alpha → rgba()。线色是十六进制写的，这儿要按透明度用 */
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a.toFixed(3)})`;
  }

  /**
   * ?dev=1：把九个 footprint 的矩形和区卡锚点都画出来。
   *
   * 这是给「底板对位」用的尺子。PLATES[].frame 当初是照着淡入淡出的
   * 观感调的，没有照着总览图上那片辖区真正在哪儿量——所以地铁线一画上去
   * 就露馅了：明湖的节点落在江面上，因为 minghu 的 frame 比照片上的
   * 市中心整体高了约 0.2（3 km 左右）。
   * 锚点（实心小圈）是照着照片逐个对过的，矩形不是，两者差多少一眼就看得见。
   */
  function drawFrames() {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = '600 11px Outfit, sans-serif';
    M.DISTRICTS.forEach(d => {
      const f = M.PLATES[d.key] && M.PLATES[d.key].frame;
      if (!f) return;
      const a = sp([f.x, f.y]), b = sp([f.x + f.w, f.y + f.w]);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = d.c;
      ctx.globalAlpha = 0.9;
      ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      ctx.setLineDash([]);
      // frame 中心
      const c = sp([f.x + f.w / 2, f.y + f.w / 2]);
      ctx.strokeStyle = d.c;
      ctx.beginPath(); ctx.moveTo(c[0] - 6, c[1]); ctx.lineTo(c[0] + 6, c[1]);
      ctx.moveTo(c[0], c[1] - 6); ctx.lineTo(c[0], c[1] + 6); ctx.stroke();
      // 区卡锚点（这个是对过照片的）
      const p = sp(d.at);
      ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, 6.284);
      ctx.fillStyle = d.c; ctx.fill();
      // 两者连线：这条线有多长就是错了多少
      ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(p[0], p[1]);
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke();
      ctx.fillStyle = d.c;
      ctx.fillText(d.name, a[0] + 4, a[1] + 13);
    });
    ctx.restore();
  }

  /** 一条线的站点屏幕坐标序列 */
  function stationPts(line) {
    return line.stations.map(st => {
      const key = st.node || st.key;
      const s = G.stations.get(key);
      return s ? sp([s.x, s.y]) : null;
    }).filter(Boolean);
  }
  let _stList = null;
  function stationList() {
    if (!_stList) _stList = [...G.stations.values()];
    return _stList;
  }

  // ============ 站点标签 ============
  /**
   * 和地点用两套标签语言，这是分层级最省的一招：
   * 站点是线色文字 + 暗托，没有白牌；白牌只留给地点。
   * 全城 50 个站的名字一次全上会糊，所以换乘站先出、普通站要推近才出。
   */
  const stPool = new Map();
  /* 站名默认不出。五十个名字压在照片上就是在抢戏，而且地点牌本来就已经
     占满了标签这一档。"在哪儿上车、哪儿换乘"由行程面板逐段写清楚，
     图上只留换乘站那几个小圆点。要看名字的话 PLATE_MAP.showStationNames(true)。 */
  let showStNames = false;

  // ============ 路网视图 ============
  /**
   * 一级视图，不是一直开着的图层。
   * 关：路网退在氛围后面，只剩五个换乘环。
   * 开：站名 + 图例上场，线提一档到读得清的亮度（NET_BOOST）。
   *
   * 分成两档是因为「看得见」和「不抢戏」在同一档里是矛盾的——
   * 前面三次调参就一直在这两头之间来回。信息按需出现就没这个矛盾了。
   */
  let netView = false;
  const NET_BOOST = { on: 1.45, off: 1 };
  const boost = () => netView ? NET_BOOST.on : NET_BOOST.off;

  function setNetView(on) {
    netView = !!on;
    syncNetView();
    return netView;
  }
  function syncNetView() {
    showStNames = netView;
    const lg = document.getElementById('legend');
    if (lg) lg.hidden = !netView;
    const b = document.querySelector('#phase button.net');
    if (b) b.classList.toggle('on', netView);
    invalidate();
  }

  /** 图例照着 CITY_NET 的线路表生成，色标就是线在画布上那一份的样子 */
  function buildLegend() {
    const lg = document.getElementById('legend');
    if (!lg || !NET) return;
    const line = (col, w, dash) =>
      `<i class="lg-line" style="border-top-color:${col};border-top-width:${w}px;` +
      `border-top-style:${dash}"></i>`;
    const rows = NET.METRO.map(l =>
      `<div class="lg-row">${line(l.glow || l.color, 2.4, 'solid')}<span>${esc(l.name)}</span></div>`
    ).join('');
    const ways = [
      ['express', '快速路 · 高速'], ['arterial', '主干道'],
      ['bridge', '跨江桥'], ['tunnel', '过江隧道']
    ].map(([k, label]) => {
      const st = WAY_STYLE[k];
      return `<div class="lg-row">${line(st.c + '0.95)', st.w + 0.6, 'dashed')}` +
        `<span>${label}</span></div>`;
    }).join('');
    lg.innerHTML =
      `<h4>轨道交通</h4>${rows}` +
      `<hr><h4>道路</h4>${ways}` +
      `<div class="lg-row">${line('rgba(198,216,246,.9)', 1.6, 'dotted')}<span>步行可达</span></div>` +
      `<hr><div class="lg-row"><i class="lg-ring"></i><span>换乘站</span></div>`;
  }
  function drawStations() {
    if (!NET || !showNet || !showStNames) {
      stPool.forEach(it => { it.el.classList.remove('on'); it.el.style.opacity = 0; });
      return;
    }
    const W = vw(), H = vh();
    stPool.forEach(it => it.seen = false);
    stationList().forEach(s => {
      const inter = s.lines.length > 1;
      /* 挂在地点上的站，只有那个地点自己的白牌【当前没在场】时才补站名。
         上一版是「挂在地点上就一律不画」——但五个换乘站里有四个是挂节点的
         （明湖广场 / 德泰百货 / 门东 / 临江南站），而总览档地点牌根本不出，
         结果它们两头都没有标签，打开路网视图一个站名也看不见。 */
      const nodeId = s.vid.startsWith('p:') ? s.vid.slice(2) : null;
      const dup = nodeId && (() => {
        const it = pool.get('N:' + nodeId);
        return !!(it && it.el.classList.contains('on'));
      })();
      /* 换乘站在这一档一直显示，不挂缩放——全城只有五个，
         而「哪儿能换乘」正是打开这一档要查的第一件事。
         普通站等推近一点再出，免得 z=1 挤四十九个名字。 */
      const a = dup ? 0 : (inter ? 1 : ramp(view.z, 1.55, 1.9));
      const key = 'S:' + s.key;
      let it = stPool.get(key);
      if (!it) {
        const el = document.createElement('div');
        el.className = 'st';
        el.innerHTML = `<b>${esc(s.name)}</b>`;
        host.appendChild(el);
        it = { el, b: el.querySelector('b') };
        stPool.set(key, it);
      }
      it.seen = true;
      it.el.dataset.inter = inter ? '1' : '';
      const col = NET.lineOf(s.lines[0]);
      it.el.style.setProperty('--sc', inter ? '#f2f6ff' : (col ? col.color : '#9fb0cc'));
      const p = sp([s.x, s.y]);
      const on = a > 0.03 && p[0] > 0 && p[0] < W && p[1] > 0 && p[1] < H;
      it.el.style.left = p[0] + 'px';
      it.el.style.top = (p[1] + 9) + 'px';
      it.el.style.opacity = on ? a : 0;
      it.el.classList.toggle('on', on);
    });
    stPool.forEach(it => {
      if (!it.seen) { it.el.classList.remove('on'); it.el.style.opacity = 0; }
    });
  }

  // ============ 当前路线 ============
  /**
   * 路线【不】受 LOD.detail 管。原来的门槛是 r>=0.90，等于必须已经推进
   * 那个区才看得见；而"从这儿去那儿"这件事恰恰是要在总览档上看的。
   * 而且原来是按底板逐个 filter 路线上的点，一条横穿两区的路线会被
   * 拆成两段互不相连的光带，中间那一跳直接丢了。现在整条线走世界坐标。
   */
  function drawTrip() {
    const r = TRIP.result;
    if (!r || !r.pts || r.pts.length < 2) return;
    // 图上的路径是一串折点，直连出来全是硬拐，跟地铁线一个毛病
    const pts = smooth(r.pts.map(sp), 10);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    [[15, 'rgba(96, 236, 190, .10)'], [7, 'rgba(120, 244, 200, .28)'], [2.8, 'rgba(224, 255, 244, .92)']]
      .forEach(([w, c]) => { trace(pts); ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke(); });
    ctx.setLineDash([10, 22]);
    ctx.lineDashOffset = -(performance.now() / 34) % 32;
    trace(pts);
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 2.8;
    ctx.stroke();
    ctx.setLineDash([]);

    // 终点靶心
    const e = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(e[0], e[1], 7, 0, 6.284);
    ctx.strokeStyle = 'rgba(224, 255, 244, .95)';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.restore();
  }

  // ============ 玩家自建节点 ============
  const customModebar = document.getElementById('custom-modebar');
  const customEditor = document.getElementById('custom-editor');
  const customSave = document.getElementById('custom-save');

  /* 建设费。每次确定建设都要从 玩家信息.金钱 付一笔，蓝图本身不消耗。
     宿主（状态栏的 saveCustomMapNode）是唯一权威，它写入前会重新读一次金钱并可能拒绝。
     这里这两个数只是宿主推过来的镜像，作用有两个：把价钱显示出来，以及在钱明显不够时
     就地拦住——省一趟白跑的桥，也让按钮不至于点下去才知道不行。 */
  let buildCost = 0;
  let buildFunds = 0;
  /* 保存在飞行中。renderBuildCost 会被宿主的实时刷新反复调用，
     不挡一下就会把「正在写入…」覆盖成「支付…并建设」，看起来像是没点上。 */
  let customSaving = false;
  const yuan = (value) => `￥${Math.round(Number(value) || 0).toLocaleString('en-US')}`;
  const canAffordBuild = () => !buildCost || buildFunds >= buildCost;

  function syncCustomSave() {
    if (customSaving || customEditor.hidden) return;
    const broke = !canAffordBuild();
    customSave.disabled = broke;
    customSave.textContent = broke ? '金钱不足，无法建设'
      : buildCost ? `支付 ${yuan(buildCost)} 并建设` : '保存节点';
  }

  function renderBuildCost() {
    const chip = customModebar.querySelector('.custom-mode-cost');
    if (chip) {
      chip.hidden = !buildCost;
      chip.textContent = buildCost ? `建设费 ${yuan(buildCost)} · 持有 ${yuan(buildFunds)}` : '';
      chip.classList.toggle('is-broke', !canAffordBuild());
    }
    const row = document.getElementById('custom-cost');
    if (row) {
      row.hidden = !buildCost;
      row.classList.toggle('is-broke', !canAffordBuild());
      if (buildCost) {
        row.innerHTML = canAffordBuild()
          ? `<span>建设费</span><b>${yuan(buildCost)}</b><small>确定建设时从金钱扣除，建成后余 ${yuan(buildFunds - buildCost)}。蓝图不消耗，可继续使用。</small>`
          : `<span>建设费</span><b>${yuan(buildCost)}</b><small>金钱不足，还差 ${yuan(buildCost - buildFunds)}（当前持有 ${yuan(buildFunds)}）。攒够钱再回来，草稿不会保存。</small>`;
      }
    }
    syncCustomSave();
  }

  /** 宿主推建设费和当前金钱。每次实时刷新都会调一遍，所以显示跟着钱变。 */
  function setBuildBudget(budget = {}) {
    if (Number.isFinite(Number(budget.cost))) buildCost = Math.max(0, Math.round(Number(budget.cost)));
    if (Number.isFinite(Number(budget.funds))) buildFunds = Math.max(0, Math.round(Number(budget.funds)));
    renderBuildCost();
    return { cost: buildCost, funds: buildFunds };
  }

  function plateAtWorld(w) {
    return Object.entries(M.PLATES)
      .filter(([key, pl]) => key !== 'overview' && pl.frame
        && w.x >= pl.frame.x && w.x <= pl.frame.x + pl.frame.w
        && w.y >= pl.frame.y && w.y <= pl.frame.y + pl.frame.w)
      .sort((a, b) => a[1].frame.w - b[1].frame.w)[0] || null;
  }

  function enterCustomMode(options = {}) {
    if (OPENING_MODE) return false;
    customMode = true;
    if (options && typeof options === 'object') setBuildBudget(options);
    closeSpot();
    clearTrip();
    customModebar.hidden = false;
    renderBuildCost();
    document.documentElement.classList.add('custom-placing');
    return true;
  }

  function exitCustomMode() {
    customMode = false;
    customDraft = null;
    customSaving = false;
    customModebar.hidden = true;
    customEditor.hidden = true;
    document.documentElement.classList.remove('custom-placing');
  }

  function closeCustomEditor() {
    customEditor.hidden = true;
    customDraft = null;
    customSaving = false;
  }

  function openCustomEditorAt(sx, sy) {
    const w = toWorld(sx, sy);
    const hit = plateAtWorld(w);
    if (!hit) {
      customModebar.querySelector('span').textContent = '请先放大并点击某个城区的底板';
      return false;
    }
    const [plate, pl] = hit;
    const localPos = [clamp((w.x - pl.frame.x) / pl.frame.w, 0, 1), clamp((w.y - pl.frame.y) / pl.frame.w, 0, 1)];
    const anchor = NET ? NET.nearest(STATIC_NODE_W, w.x, w.y) : null;
    customDraft = {
      plate, localPos, district: pl.district || pl.label || '',
      anchorId: anchor?.id || '', anchorName: anchor ? ((byId[anchor.id] && byId[anchor.id].name) || anchor.id) : '',
      accessKm: anchor ? Math.round(anchor.km * 100) / 100 : 0,
    };
    document.getElementById('custom-name').value = '';
    document.getElementById('custom-aliases').value = '';
    document.getElementById('custom-type').value = 'living';
    document.getElementById('custom-privacy').value = '3';
    document.getElementById('custom-intro').value = '';
    document.getElementById('custom-draw').value = '';
    document.getElementById('custom-special').value = '';
    ['custom-date', 'custom-gather', 'custom-work', 'custom-shop'].forEach(id => { document.getElementById(id).checked = false; });
    document.getElementById('custom-anchor-note').textContent = anchor
      ? `${customDraft.district} · 接驳到「${customDraft.anchorName}」，约 ${customDraft.accessKm} km`
      : `${customDraft.district} · 附近没有可用接驳节点`;
    /* 先取消隐藏再排版：syncCustomSave 在面板隐藏时会直接返回，
       顺序颠倒的话按钮文案就停在上一次的状态。 */
    customSaving = false;
    customEditor.hidden = false;
    renderBuildCost();
    setTimeout(() => document.getElementById('custom-name').focus(), 0);
    return true;
  }

  function customRowsWith(next, removeId = '') {
    const rows = [...customIds].filter(id => id !== removeId).map(id => byId[id]).filter(Boolean);
    if (next) {
      const i = rows.findIndex(n => n.id === next.id);
      if (i >= 0) rows[i] = next; else rows.push(next);
    }
    return rows;
  }

  async function saveCustomDraft() {
    if (!customDraft) return;
    const name = document.getElementById('custom-name').value.trim();
    if (!name) { document.getElementById('custom-name').focus(); return; }
    const normalized = name.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
    const conflict = Object.values(byId).find(n => n && n.name
      && String(n.name).normalize('NFKC').replace(/\s+/g, '').toLowerCase() === normalized);
    if (conflict) {
      document.getElementById('custom-anchor-note').textContent = `名称已被「${conflict.name}」使用，请换一个名称。`;
      return;
    }
    /* 钱不够就别过桥。宿主还会自己再查一遍（那边才是权威），
       这一道只是让拒绝就地发生，不用等一次往返。 */
    if (!canAffordBuild()) {
      document.getElementById('custom-anchor-note').textContent =
        `金钱不足：建设需要 ${yuan(buildCost)}，当前只有 ${yuan(buildFunds)}，还差 ${yuan(buildCost - buildFunds)}。`;
      renderBuildCost();
      return;
    }
    const draft = {
      ...customDraft, name,
      aliases: document.getElementById('custom-aliases').value.split(/[,，]/).map(v => v.trim()).filter(Boolean),
      archetype: document.getElementById('custom-type').value,
      privacy: clamp(Math.round(Number(document.getElementById('custom-privacy').value) || 0), 0, 5),
      openHours: ['朝', '昼', '暮', '夜', '深夜'],
      intro: document.getElementById('custom-intro').value.trim(),
      draw: document.getElementById('custom-draw').value.trim(),
      special: document.getElementById('custom-special').value.split(/\r?\n/).map(v => v.trim()).filter(Boolean),
      features: {
        canDate: document.getElementById('custom-date').checked,
        canGather: document.getElementById('custom-gather').checked,
        canWork: document.getElementById('custom-work').checked,
        hasShop: document.getElementById('custom-shop').checked,
      },
      custom: true,
    };
    customSaving = true;
    customSave.disabled = true;
    customSave.textContent = buildCost ? `正在支付 ${yuan(buildCost)}…` : '正在写入…';
    try {
      const saved = onCustomCreate ? await onCustomCreate(draft) : { ...draft, id: `usr_${Date.now().toString(36)}` };
      const node = normalizeCustomNode(saved);
      if (!node) throw new Error('宿主返回的节点资料不完整');
      /* 宿主已经扣过了。本地镜像跟着减，免得在下一次快照到达之前
         面板还显示着扣款前的金额、把第二次建设错判成付得起。 */
      if (buildCost) buildFunds = Math.max(0, buildFunds - buildCost);
      customSaving = false;
      setCustomNodes(customRowsWith(node));
      customEditor.hidden = true;
      customDraft = null;
      exitCustomMode();
      API.goto(node.id);
      setTimeout(() => openSpot(byId[node.id]), 420);
    } catch (error) {
      /* 宿主拒绝（含金钱不足）也走这里。它的原话已经把差额说清楚了，直接透出来。

         顺序：先趁 customSaving 还是 true 刷费用行——那会儿 syncCustomSave 是空转的，
         不会动按钮；之后再自己写「重新保存」，就不会被覆盖回「支付…并建设」。 */
      renderBuildCost();
      customSaving = false;
      document.getElementById('custom-anchor-note').textContent = `保存失败：${error?.message || error}`;
      customSave.disabled = false;
      customSave.textContent = '重新保存';
    }
  }

  async function deleteCustomNode(n) {
    if (!n?.custom || !customIds.has(n.id)) return false;
    if (!confirm(`删除玩家节点「${n.name}」？地图与对应地点世界书会一起停用。`)) return false;
    const button = document.getElementById('spot-delete');
    if (button) { button.disabled = true; button.textContent = '删除中…'; }
    try {
      if (onCustomDelete) await onCustomDelete(n);
      setCustomNodes(customRowsWith(null, n.id));
      closeSpot();
      return true;
    } catch (error) {
      if (button) { button.disabled = false; button.textContent = '删除节点'; }
      alert(`删除失败：${error?.message || error}`);
      return false;
    }
  }

  document.getElementById('custom-mode-close').onclick = exitCustomMode;
  document.getElementById('custom-cancel').onclick = closeCustomEditor;
  customSave.onclick = saveCustomDraft;
  customEditor.addEventListener('click', e => { if (e.target === customEditor) closeCustomEditor(); });

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
  let placementGesture = null;
  const pointers = new Map();
  let pinch = null;

  /**
   * 在图上随手标一个点当终点。
   * 吸附到最近的地点，不吸附到最近的路——地点才是玩法的单位，
   * 落在马路中间的一个坐标在这个游戏里没有意义。
   * 容差按屏幕像素算：按世界距离算的话，推近之后容差会变成好几个街区。
   */
  function markAt(sx, sy) {
    if (!G) return false;
    const w = toWorld(sx, sy);
    const hit = NET.nearest(NODE_W, w.x, w.y);
    if (!hit) return false;
    const px = (hit.km / NET.KM_PER_UNIT) * S();
    if (px > 150) return false;
    return plan(hit.id);
  }

  let pressT = 0, pressAt = null;
  const cancelPress = () => { if (pressT) { clearTimeout(pressT); pressT = 0; } };

  const PAN_BLOCKED = '#spot, #trip, #ctl, #phase, #dev, #custom-modebar, #custom-editor';
  let suppressedNodeClick = null;

  /* Listen on the whole map stage, not only the low #plates layer. Nodes and their
     labels live in the higher #nodes sibling; a gesture starting there previously
     never reached the pan controller and often ended as an accidental node click. */
  stage.addEventListener('pointerdown', e => {
    /* Any new contact is a new intent. A compatibility click from the previous
       release is dispatched before another pointerdown, so clearing here lets a
       quick real tap immediately after a drag through instead of swallowing it. */
    suppressedNodeClick = null;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest(PAN_BLOCKED)) return;
    if (e.target.closest('button, input, select, textarea, summary, a') && !e.target.closest('.np')) return;
    anim = null; // a manual gesture always wins over glide/focus animation
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const node = e.target.closest('.np');
    if (customMode && e.button === 0 && !node) {
      placementGesture = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    }
    platesHost.classList.add('grabbing');
    if (pointers.size >= 2) {
      for (const id of pointers.keys()) { try { stage.setPointerCapture(id); } catch (error) {} }
      const pts = [...pointers.values()];
      pinch = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1, z: view.z };
      drag = null;
      cancelPress();
      return;
    }
    drag = {
      x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy,
      axis: null, moved: false, node: !!node, pointerType: e.pointerType,
    };
    /* Long-press marking remains a background gesture. Holding a location card
       should not drop a new marker underneath that card. */
    pressAt = { x: e.clientX, y: e.clientY };
    cancelPress();
    if (!customMode && !node) pressT = setTimeout(() => { pressT = 0; markAt(pressAt.x, pressAt.y); }, 520);
  });
  stage.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pressT && pressAt && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 8) cancelPress();
    if (placementGesture && placementGesture.id === e.pointerId
        && Math.hypot(e.clientX - placementGesture.x, e.clientY - placementGesture.y) > 8) {
      placementGesture.moved = true;
    }
    if (pinch && pointers.size >= 2) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const midX = (pts[0].x + pts[1].x) / 2, midY = (pts[0].y + pts[1].y) / 2;
      const before = toWorld(midX, midY);
      const next = pinch.z * (dist / pinch.dist);
      const inward = next > view.z;
      view.z = next;
      zoomToAnchor(before, midX, midY, inward);
      e.preventDefault();
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.axis) {
      if (Math.hypot(dx, dy) < 6) return;
      /* A finger never travels perfectly straight. At portrait z=1 vertical range
         is clamped, so free 2-D tracking displayed only the tiny horizontal wobble.
         Lock clearly directional touch gestures; genuinely diagonal gestures stay free. */
      if (drag.pointerType === 'touch' || drag.pointerType === 'pen') {
        if (Math.abs(dy) > Math.abs(dx) * 1.2) drag.axis = 'y';
        else if (Math.abs(dx) > Math.abs(dy) * 1.2) drag.axis = 'x';
        else drag.axis = 'free';
      } else drag.axis = 'free';
      drag.moved = true;
      cancelPress();
      try { stage.setPointerCapture(e.pointerId); } catch (error) {}
    }
    const moveX = drag.axis === 'y' ? 0 : dx;
    const moveY = drag.axis === 'x' ? 0 : dy;
    const scale = S();
    view.cx = drag.cx - moveX / scale;
    view.cy = drag.cy - moveY / (scale * R);
    clampView();
    e.preventDefault();
  });
  const endPointer = e => {
    cancelPress();
    const moved = !!drag?.moved;
    const draggedNode = moved && !!drag?.node;
    const place = customMode && placementGesture && placementGesture.id === e.pointerId && !placementGesture.moved;
    placementGesture = null;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 1) {
      const p = [...pointers.values()][0];
      drag = { x: p.x, y: p.y, cx: view.cx, cy: view.cy, axis: null, moved: true, node: false, pointerType: 'touch' };
      return;
    }
    if (draggedNode) {
      suppressedNodeClick = { pointerId: e.pointerId, until: performance.now() + 500 };
    }
    drag = null;
    platesHost.classList.remove('grabbing');
    if (place) openCustomEditorAt(e.clientX, e.clientY);
  };
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  /* Capture before the node's direct onclick. A completed drag is navigation, not
     selection, even when it began and ended over the same card. */
  stage.addEventListener('click', e => {
    const blocked = suppressedNodeClick;
    if (!blocked || performance.now() >= blocked.until || !e.target.closest('.np')) return;
    /* Chromium exposes the originating pointerId on the synthesized click. Older
       engines may expose only MouseEvent; for those, the first immediate node click
       after the dragged release is still the compatibility click. */
    if (Number.isFinite(e.pointerId) && e.pointerId !== blocked.pointerId) return;
    suppressedNodeClick = null;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  stage.addEventListener('touchmove', e => {
    if (e.target.closest('#spot, #trip')) return;
    e.preventDefault();
  }, { passive: false });

  /** 右键标点。桌面上比长按顺手 */
  stage.addEventListener('contextmenu', e => {
    if (e.target.closest('#spot, #trip, #ctl, #phase, #dev')) return;
    e.preventDefault();
    if (customMode) openCustomEditorAt(e.clientX, e.clientY);
    else markAt(e.clientX, e.clientY);
  });

  /** 滚轮以光标为锚点缩放：光标下那块地方缩放前后停在原处。
   *  面板、行程表这些自带滚动的浮层要先放过，否则在它们上面滚轮会去缩放地图。 */
  stage.addEventListener('wheel', e => {
    if (e.target.closest('#spot, #trip')) return;
    e.preventDefault();
    anim = null;
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.13 : 1 / 1.13);
  }, { passive: false });

  /** 双击推近一档，也以光标为锚点 */
  stage.addEventListener('dblclick', e => {
    if (e.target.closest('.card, .exit, .devrow, .spot-sheet')) return;
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

  // ============ 地点详情 ============
  const ARCH_LABEL = {
    nature: '郊野', hotspring: '汤苑', medical: '医疗', commercial: '商圈',
    adult: '成人', academy: '文教', live: '演播', living: '生活'
  };
  const PRIVACY_LABEL = ['公开', '街面', '转角', '僻静', '私密', '独用'];
  const CARD_KIND = {
    pureLove: 'love', mischief: 'mischief', sexAction: 'sex'
  };
  const TAG_KIND = { 纯爱: 'love', 调教: 'mischief', 日常: 'daily' };

  function featChips(n) {
    const f = n.features || {};
    const bits = [];
    if (f.canDate) bits.push('约会');
    if (f.canGather) bits.push('采集');
    if (f.canWork) bits.push('打工');
    if (f.hasShop) bits.push('店面');
    return bits;
  }

  /** Event conditions are compacted into player-facing chips. */
  function trigChips(t) {
    if (!t) return '';
    const out = [];
    const rng = (v, label) => {
      if (!Array.isArray(v) || v[0] == null) return;
      const [a, b] = v;
      out.push(b == null || b >= 100 ? `${label} ≥${a}` : `${label} ${a}–${b}`);
    };
    if (Array.isArray(t['时段']) && t['时段'].length) out.push(t['时段'].join(' / '));
    rng(t['好感度'], '好感');
    rng(t['顺从度'], '顺从');
    rng(t['性欲度'], '性欲');
    rng(t['尿意'], '尿意');
    if (t['体力上限'] != null) out.push(`体力 ≤${t['体力上限']}`);
    if (t['异常状态含']) out.push(`前置:${t['异常状态含']}`);
    if (t['需携带道具']) out.push(`需要:${t['需携带道具']}`);
    if (t['需同行']) out.push('需同行');
    else out.push('可独行');
    return out.length
      ? `<div class="spot-req">${out.map(s => `<em>${esc(s)}</em>`).join('')}</div>`
      : '';
  }

  function splitFacts(value) {
    return String(value || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
  }

  function cardRows(card) {
    if (!card) return '';
    return ['pureLove', 'mischief', 'sexAction'].map(key => {
      const c = card[key];
      if (!c) return '';
      const label = esc(c['分类'] || { pureLove: '纯爱', mischief: '调教', sexAction: '欲望' }[key]);
      const kind = TAG_KIND[c['分类']] || CARD_KIND[key] || 'daily';
      const gate = c['门槛']
        ? splitFacts(c['门槛']).map(s => `<em>${esc(s)}</em>`).join('')
        : `<em class="free">无额外门槛</em>`;
      const result = splitFacts(c['结算']);
      return `<div class="spot-opt ${kind}">` +
        `<div class="spot-opt-head"><em class="spot-tag ${kind}">${label}</em><span>行动路线</span></div>` +
        (c['选项'] ? `<p class="spot-action">${esc(c['选项'])}</p>` : '') +
        `<div class="spot-opt-foot"><div class="spot-gate-label">需要</div><div class="spot-gate">${gate}</div>` +
        (result.length ? `<div class="spot-result">${result.map(s => `<em>${esc(s)}</em>`).join('')}</div>` : '') +
        `</div></div>`;
    }).join('');
  }

  function housingCost(h) {
    if (!h) return '';
    const parts = [];
    if (h.sale) parts.push('RMB ' + Number(h.sale).toLocaleString());
    if (h.rent) parts.push('RMB ' + Number(h.rent).toLocaleString() + ' / 月');
    if (h.deposit) parts.push('押金 RMB ' + Number(h.deposit).toLocaleString());
    return parts.join(' / ');
  }
  function openingInfo(n) {
    const openingHome = OPENING_HOME_META[n.id];
    const raw = OPENING_MODE && openingHome ? openingHome : (n.housing || openingHome);
    const job = OPENING_JOB_META[n.id];
    if (raw) {
      const h = raw;
      const tier = HOUSING_TIER_LABEL[h.tier] || '住宅';
      const cost = h.cost || housingCost(h);
      const unlock = h.unlock && h.unlock.minMoney ? ' / 解锁资金 RMB ' + Number(h.unlock.minMoney).toLocaleString() : '';
      return '<section class="spot-opening"><div class="spot-opening-top"><span>Housing</span><b>'+esc(tier)+'</b></div><strong>'+esc(cost)+'</strong><p>'+esc((h.note || n.draw || '') + unlock)+'</p></section>';
    }
    if (job) return '<section class="spot-opening spot-opening-job"><div class="spot-opening-top"><span>Opening</span><b>可选工作</b></div><strong>'+esc(job.label)+'</strong><p>'+esc(job.pay)+' / '+esc(job.hours)+'</p></section>';
    return '';
  }
  function renderSpot(n) {
    const hours = (n.openHours || []).map(h =>
      `<em class="${h === phase || (h === '昼' && phase === '朝') ? 'on' : ''}">${esc(h)}</em>`
    ).join('');
    const priv = Math.max(0, Math.min(5, n.privacy == null ? 2 : n.privacy));
    const chips = featChips(n).map(t => `<em class="spot-chip">${esc(t)}</em>`).join('');
    /* special：一条一句的门道清单，直白功能性。shop 已废除。 */
    const spec = Array.isArray(n.special) ? n.special.filter(Boolean) : [];
    const shopHtml = spec.length ? (
      `<section class="spot-sec"><div class="spot-k"><span>Special</span><b>门道</b></div>` +
      `<ul class="spot-spec">${spec.map(s => `<li>${esc(s)}</li>`).join('')}</ul></section>`
    ) : '';
    const gather = n.gather ? (
      `<section class="spot-sec"><div class="spot-k"><span>Gather</span><b>采集</b></div>` +
      `<p class="spot-gather">${esc(n.gather.desc || '')}</p>` +
      (n.gather.materials && n.gather.materials.length
        ? `<div class="spot-mats">${n.gather.materials.map(m => `<em class="spot-chip">${esc(m)}</em>`).join('')}</div>`
        : '') +
      `</section>`
    ) : '';
    const eventList = n.events || [];
    const events = eventList.map((ev, index) =>
      `<details class="spot-evt">` +
      `<summary class="spot-evt-summary"><div class="spot-evt-main">` +
      `<span class="spot-evt-index">事件 ${String(index + 1).padStart(2, '0')}</span>` +
      `<h3>${esc(ev.title)}</h3>` +
      (ev['场所'] ? `<div class="where">${esc(ev['场所'])}</div>` : '') +
      `</div><span class="spot-evt-toggle" aria-hidden="true"></span></summary>` +
      `<div class="spot-evt-content">` +
      (ev.opportunity ? `<div class="spot-scene"><span>现场</span><p>${esc(ev.opportunity)}</p></div>` : '') +
      `<div class="spot-conditions"><span>条件</span>${trigChips(ev.trigger)}</div>` +
      `<div class="spot-routes"><div class="spot-routes-title"><span>Choose</span><b>怎么做</b></div>${cardRows(ev.card)}</div>` +
      `</div></details>`
    ).join('');
    const evHtml = events
      ? `<section class="spot-sec spot-events-sec"><div class="spot-k"><span>Play</span><b>在场事件</b><small>${eventList.length} 个</small></div>${events}</section>`
      : '';

    const placeInfo = (n.intro || shopHtml || gather)
      ? `<details class="spot-more"><summary><span>Info</span><b>\u5730\u70b9\u4fe1\u606f</b><i>\u5c55\u5f00</i></summary><div class="spot-more-body">` +
        (n.intro ? `<p class="spot-intro">${esc(n.intro)}</p>` : '') +
        shopHtml + gather +
        `</div></details>`
      : '';

    const full = n.fullName && n.fullName !== n.name
      && n.fullName !== (n.district ? n.district + ' · ' + n.name : '')
      ? `<p class="spot-full">${esc(n.fullName)}</p>` : '';
    /* 「到这里去」放在头里，不放在正文底下——它是这张卡最可能被按的东西，
       埋在商店和事件后面等于藏起来。已经在这儿了就不给按钮，给一行状态。 */
    const here = n.id === STATE.player.at;
    const nav = here
      ? `<span class="spot-nav-here">你在这里</span>`
      : (G && NODE_W[n.id] ? `<button class="spot-nav" type="button" id="spot-nav">到这里去</button>` : '');
    const customActions = n.custom
      ? `<div class="spot-custom-actions"><button class="spot-delete" type="button" id="spot-delete">删除节点</button></div>`
      : '';

    document.getElementById('spot-head').innerHTML =
      `<span class="spot-eye">${esc(n.district || '')}${n.archetype ? '  ·  ' + (ARCH_LABEL[n.archetype] || n.archetype) : ''}</span>` +
      `<h2 id="spot-title">${esc(n.name)}</h2>` +
      full +
      `<div class="spot-meta"><div class="spot-hours">${hours}</div>` +
      `<span class="spot-priv">${esc(PRIVACY_LABEL[priv] || '私密')}` +
      `<i><b style="width:${(priv / 5) * 100}%"></b></i></span></div>` +
      (nav ? `<div class="spot-navrow">${nav}</div>` : '') + customActions;

    const navBtn = document.getElementById('spot-nav');
    if (navBtn) navBtn.onclick = () => { plan(n.id); closeSpot(); };
    const deleteBtn = document.getElementById('spot-delete');
    if (deleteBtn) deleteBtn.onclick = () => deleteCustomNode(n);

    document.getElementById('spot-body').innerHTML =
      openingInfo(n) +
      (n.draw ? `<p class="spot-draw">${esc(n.draw)}</p>` : '') +
      (chips ? `<div class="spot-feats">${chips}</div>` : '') +
      placeInfo + evHtml;
  }

  function markSel() {
    pool.forEach(it => {
      it.el.dataset.sel = (it.n && it.n.id === selId) ? '1' : '';
    });
  }

  function closeSpot() {
    selId = '';
    const el = document.getElementById('spot');
    el.hidden = true;
    el.classList.remove('on');
    markSel();
  }

  function openSpot(n) {
    if (!n) return;
    selId = n.id;
    renderSpot(n);
    const el = document.getElementById('spot');
    el.hidden = false;
    el.classList.add('on');
    markSel();
    const body = document.getElementById('spot-body');
    if (body) body.scrollTop = 0;
  }

  document.getElementById('spot-close').onclick = closeSpot;
  document.getElementById('spot-shade').onclick = closeSpot;
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && selId) { e.preventDefault(); closeSpot(); }
  });


  // ============ 行程面板 ============
  const tripEl = document.getElementById('trip');
  const fmtKm = k => k < 1 ? Math.round(k * 1000) + ' m' : (Math.round(k * 10) / 10) + ' km';
  const nameOfId = id => (byId[id] && byId[id].name) || id;

  function plan(toId) {
    if (!G) return false;
    // 没有起点就不该有行程。少了这一句，TRIP.to 会在 player.at 为空时被写进去，
    // 留下一个「有终点没起点」的半状态——面板一旦被显示出来就是空壳带按钮。
    if (!STATE.player.at) { clearTrip(); return false; }
    if (!toId || toId === STATE.player.at) { clearTrip(); return false; }
    if (!NODE_W[toId]) return false;
    TRIP.to = toId;
    recompute();
    return !!TRIP.result;
  }

  function clearTrip() {
    TRIP.to = ''; TRIP.all = null; TRIP.result = null;
    FORCED = forcedIds();
    renderTrip();
    invalidate();
  }

  function recompute() {
    if (!G || !TRIP.to || !STATE.player.at) { TRIP.all = TRIP.result = null; }
    else {
      TRIP.all = NET.routeAll(G, STATE.player.at, TRIP.to, phase);
      // 当前选的方式到不了（比如两点之间只有隧道相连，人走不过去）
      // 就自动落到第一种走得通的上，而不是让面板空着
      if (!TRIP.all[TRIP.mode]) {
        const fallback = NET.MODES.map(m => m.id).find(id => TRIP.all[id]);
        if (fallback) TRIP.mode = fallback;
      }
      TRIP.result = TRIP.all[TRIP.mode] || null;
    }
    FORCED = forcedIds();
    renderTrip();
    invalidate();
  }

  function legText(l) {
    if (l.carrier === 'rail') {
      const line = NET.lineOf(l.line);
      return `<em style="--lc:${line ? line.color : '#888'}">${esc(line ? line.name : '轨道')}</em>` +
        `<span>${esc(l.fromLabel)} → ${esc(l.toLabel)}　${l.stops} 站</span><i>${l.min} 分</i>`;
    }
    if (l.carrier === 'bus') {
      return `<em style="--lc:#4a8fd6">公交</em><span>${fmtKm(l.km)}</span><i>${l.min} 分</i>`;
    }
    const tag = { foot: '步行', taxi: '出租车', car: '驾车' }[l.carrier] || l.label;
    const col = { foot: '#8fa3c0', taxi: '#dd9a2b', car: '#4a63c8' }[l.carrier] || '#8fa3c0';
    return `<em style="--lc:${col}">${tag}</em><span>${fmtKm(l.km)}</span><i>${l.min} 分</i>`;
  }

  function renderTrip() {
    if (!tripEl) return;
    // 收起时把内容一起清掉。只 hidden 不清空的话，上一趟的 OD、方式、账目会留在
    // DOM 里；下次任何原因让它显示出来，看到的就是上一趟的脏数据或者空壳面板。
    if (!TRIP.to || !TRIP.all || !STATE.player.at) {
      tripEl.hidden = true;
      document.getElementById('trip-od').innerHTML = '';
      document.getElementById('trip-modes').innerHTML = '';
      document.getElementById('trip-sum').innerHTML = '';
      document.getElementById('trip-legs').innerHTML = '';
      document.getElementById('trip-go').disabled = true;
      return;
    }
    tripEl.hidden = false;

    document.getElementById('trip-od').innerHTML =
      `<b>${esc(nameOfId(STATE.player.at))}</b><s>→</s><b>${esc(nameOfId(TRIP.to))}</b>`;

    document.getElementById('trip-modes').innerHTML = NET.MODES.map(m => {
      const r = TRIP.all[m.id];
      return `<button data-m="${m.id}" class="${m.id === TRIP.mode ? 'on' : ''}"${r ? '' : ' disabled'}>` +
        `<b>${m.label}</b><i>${r ? r.min + ' 分' : '不通'}</i></button>`;
    }).join('');

    const r = TRIP.result;
    const sum = document.getElementById('trip-sum');
    const legs = document.getElementById('trip-legs');
    const go = document.getElementById('trip-go');
    if (!r) {
      sum.innerHTML = '<span class="trip-none">这种方式到不了</span>';
      legs.innerHTML = '';
      go.disabled = true;
      return;
    }
    go.disabled = false;
    sum.innerHTML =
      `<strong>${r.min}<u>分</u></strong>` +
      `<span>${fmtKm(r.km)}</span>` +
      `<span>¥ ${r.yuan}</span>` +
      `<span class="trip-stam">体力 −${r.stamina}</span>`;
    legs.innerHTML = r.legs.map(l => `<div class="trip-leg">${legText(l)}</div>`).join('');
  }

  /** 出发。地图只改自己那份位置，扣时间体力金钱是宿主的账 */
  function depart() {
    const r = TRIP.result, to = TRIP.to;
    const from = STATE.player.at;
    if (!r || !to || !from) return;
    STATE.player.at = to;
    if (PLATE_OF[to]) STATE.district = PLATE_OF[to];
    if (onTravel) {
      const mode = NET.MODES.find(item => item.id === r.mode);
      onTravel({
        from,
        to,
        fromName: nameOfId(from),
        toName: nameOfId(to),
        mode: r.mode,
        modeLabel: mode ? mode.label : r.mode,
        min: r.min,
        km: r.km,
        yuan: r.yuan,
        stamina: r.stamina,
        legs: r.legs.map(leg => ({
          ...leg,
          lineName: leg.carrier === 'rail'
            ? (NET.lineOf(leg.line)?.name || '\u5730\u94c1')
            : '',
        })),
      });
    }
    clearTrip();
    const w = worldOf(to);
    if (w) {
      const key = PLATE_OF[to];
      const f = key && M.PLATES[key] && M.PLATES[key].frame;
      glide(w[0], w[1], f ? clamp(1.35 / f.w, zMin(), Z_MAX) : view.z);
    }
  }

  if (tripEl) {
    document.getElementById('trip-modes').addEventListener('click', e => {
      const b = e.target.closest('button[data-m]');
      if (!b || b.disabled) return;
      TRIP.mode = b.dataset.m;
      TRIP.result = TRIP.all ? TRIP.all[TRIP.mode] : null;
      renderTrip();
      invalidate();
    });
    document.getElementById('trip-close').onclick = clearTrip;
    document.getElementById('trip-go').onclick = depart;
  }

  // ============ 比例尺 ============
  /**
   * 有了 KM_PER_UNIT 这个尺才是诚实的，所以现在才敢画。
   * 挑一个"好看的整数公里"，再反算它该有多长——
   * 反过来（固定像素长度、显示零碎公里数）读起来永远像随机数。
   */
  const scaleEl = document.getElementById('scale');
  const NICE = [10, 5, 2, 1, 0.5, 0.2, 0.1];
  function drawScale() {
    if (!scaleEl || !NET) return;
    const pxPerKm = S() / NET.KM_PER_UNIT;
    let km = NICE.find(v => v * pxPerKm <= 116) || 0.05;
    const w = Math.round(km * pxPerKm);
    if (scaleEl.__w === w) return;
    scaleEl.__w = w;
    scaleEl.style.width = w + 'px';
    scaleEl.firstElementChild.textContent = km >= 1 ? km + ' km' : (km * 1000) + ' m';
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

  // 舞台尺寸一变就重排。控件不再参与排版，所以不用盯它们
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => { invalidate(); clampView(); });
    ro.observe(stage);
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
      b.dataset.ph = k;          // applyPhase 只认带 data-ph 的，别把路网那个也点亮
      b.onclick = () => { phase = k; applyPhase(); };
      hb.appendChild(b);
    });

    /* 路网视图挂在同一条控件条上，但用竖线隔开——时段是「现在几点」，
       路网是「显示什么」，两回事。
       做成一级视图而不是一直开着：默认那一档要的是氛围，路网退在后面；
       真要查线路时再打开，站名和图例一起上，线也提一档到读得清的亮度。
       信息按需出现，就不用在「看得见」和「不抢戏」之间二选一了。 */
    const nb = document.createElement('div');
    nb.className = 'ph-sep';
    hb.appendChild(nb);
    const netBtn = document.createElement('button');
    netBtn.className = 'net';
    netBtn.textContent = '路网';
    netBtn.onclick = () => setNetView(!netView);
    hb.appendChild(netBtn);
    buildLegend();
    syncNetView();

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
   *   PLATE_MAP.goto('wx_home')   // 推镜头到某个地点
   *   PLATE_MAP.open(node)        // 打开地点详情
   *   PLATE_MAP.onPick(fn)        // 点节点的回调，参数是节点数据
   */
  const API = {
    setState(s = {}) {
      if (Object.prototype.hasOwnProperty.call(s, 'district')) STATE.district = s.district || '';
      if (s.player) STATE.player = { ...STATE.player, ...s.player };
      if (Object.prototype.hasOwnProperty.call(s, 'actors')) STATE.actors = Array.isArray(s.actors) ? s.actors : [];
      if (Object.prototype.hasOwnProperty.call(s, 'events')) STATE.events = Array.isArray(s.events) ? s.events : [];
      FORCED = forcedIds();
      lastKey = '';
      invalidate();
      if (TRIP.to === STATE.player.at) clearTrip(); else recompute();
    },
    revision: MAP_REV,
    setOpeningTarget(target) { if (!OPENING_MODE) return false; openingTarget = target === 'work' ? 'work' : 'home'; selId = ''; invalidate(); return openingTarget; },
    // 打车夜间加价挂在时段上，所以换时段也要重算
    setPhase(k) { if (M.PHASES[k]) { phase = k; applyPhase(); if (TRIP.to) recompute(); } },
    focus,
    fitAll,
    goto(id) {
      const w = worldOf(id);
      const key = PLATE_OF[id];
      const f = key && M.PLATES[key] && M.PLATES[key].frame;
      if (!w || !f) return false;
      glide(w[0], w[1], clamp(1.35 / f.w, zMin(), Z_MAX));
      return true;
    },
    onPick(fn) { onPick = fn; },
    onTravel(fn) { onTravel = fn; },
    onCustomCreate(fn) { onCustomCreate = fn; },
    onCustomDelete(fn) { onCustomDelete = fn; },
    setCustomNodes,
    enterCustomMode,
    exitCustomMode,
    /** 建设费与当前金钱。宿主每次实时刷新都推一遍，费用行和按钮跟着钱走。 */
    setBuildBudget,

    /** 干道 + 轨道那一层在不在。默认在（淡的那一档） */
    showNetwork(on) { showNet = !!on; invalidate(); return showNet; },
    /** 路网视图：站名 + 图例 + 线提亮。就是控件条上那个「路网」 */
    netView: setNetView,
    isNetView: () => netView,

    /**
     * 规划一条到 id 的路线。返回四种方式各自的账（到不了的那种是 null）。
     * 宿主想自己做出行 UI 的话，只用这个就够——面板可以整个不显。
     */
    plan(id) { return plan(id) ? { ...TRIP.all } : null; },
    trip: () => TRIP.result ? { ...TRIP.result } : null,
    setMode(m) {
      if (!TRIP.all || !TRIP.all[m]) return false;
      TRIP.mode = m; TRIP.result = TRIP.all[m];
      renderTrip(); invalidate();
      return true;
    },
    depart,
    clearTrip,
    /** 两点之间的账，不落到面板上。给"这趟值不值得跑"这类判断用 */
    quote(fromId, toId, mode) {
      if (!G) return null;
      return mode ? NET.route(G, fromId, toId, mode, phase)
        : NET.routeAll(G, fromId, toId, phase);
    },
    /** 直线距离（km）。事件门槛写"附近"的时候用得上 */
    distance(a, b) {
      const wa = worldOf(a), wb = worldOf(b);
      return wa && wb ? Math.round(NET.kmOf(wa, wb) * 100) / 100 : null;
    },
    open: openSpot,
    close: closeSpot,
    petals(on) { petalEls.forEach(el => el.style.display = on ? '' : 'none'); },
    view: () => ({ ...view }),
    // 调阈值用的读数
    debug: () => ({
      ...view, phase, zMin: +zMin().toFixed(4),
      graphEdges: G ? G.E.length : 0,
      localEdges: G ? localEdges().length : 0,
      customNodes: customIds.size,
      ratios: Object.keys(M.PLATES).reduce((o, k) => (o[k] = +ratio(k).toFixed(3), o), {})
    })
  };
  window.PLATE_MAP = API;

  /* Native-flow mounts the HUD code inside Tavern's srcdoc but keeps this iframe on
     the HUD/Pages origin. The two documents are therefore cross-origin: runtime MVU
     state and travel/custom-node callbacks must cross via postMessage instead of the
     parent reading PLATE_MAP directly. Same-origin desktop still supports the direct
     API; this bridge is deliberately additive. */
  if (!OPENING_MODE && window.parent !== window) {
    const MAP_CHANNEL = 'linjiang-map';
    const bridgeToken = new URLSearchParams(location.search).get('bridge') || '';
    const pendingHostRequests = new Map();
    let hostRequestSerial = 0;

    const postHost = (type, payload = null, requestId = '') => {
      try { window.parent.postMessage({ channel: MAP_CHANNEL, token: bridgeToken, type, payload, requestId }, '*'); }
      catch (_) {}
    };
    const requestHost = (type, payload) => new Promise((resolve, reject) => {
      const requestId = `map-${Date.now()}-${++hostRequestSerial}`;
      const timer = setTimeout(() => {
        pendingHostRequests.delete(requestId);
        reject(new Error('map host request timed out'));
      }, 15000);
      pendingHostRequests.set(requestId, {
        resolve(value) { clearTimeout(timer); resolve(value); },
        reject(error) { clearTimeout(timer); reject(error); },
      });
      postHost(type, payload, requestId);
    });

    addEventListener('message', event => {
      const data = event.data || {};
      if (data.channel !== MAP_CHANNEL || data.token !== bridgeToken) return;
      if (data.type === 'response') {
        const wait = pendingHostRequests.get(data.requestId);
        if (!wait) return;
        pendingHostRequests.delete(data.requestId);
        if (data.payload?.ok) wait.resolve(data.payload.payload);
        else wait.reject(new Error(data.payload?.error || 'map host request failed'));
        return;
      }
      if (data.type !== 'snapshot') return;
      const snapshot = data.payload || {};
      if (typeof API.setCustomNodes === 'function') API.setCustomNodes(snapshot.customNodes || []);
      if (snapshot.phase) API.setPhase(snapshot.phase);
      API.setState(snapshot.state || { district: '', player: { at: '' }, actors: [], events: [], route: [] });
      if (snapshot.resetView) API.fitAll(0);
      if (typeof API.setBuildBudget === 'function') API.setBuildBudget(snapshot.budget || {});
      if (snapshot.createMode && !customMode && typeof API.enterCustomMode === 'function') {
        API.enterCustomMode(snapshot.createMode);
      }
    });

    API.onTravel(travel => postHost('travel', travel));
    API.onCustomCreate(draft => requestHost('custom-create', draft));
    API.onCustomDelete(node => requestHost('custom-delete', node));
    setTimeout(() => postHost('hello', {
      revision: MAP_REV,
      nodes: D.nodes.map(node => ({
        id: node.id,
        name: node.name,
        fullName: node.fullName,
        district: node.district,
        aliases: Array.isArray(node.aliases) ? node.aliases : [],
      })),
    }), 0);
  }

  /* 独立开局页通过网络 iframe 引用地图，跨域时用 postMessage 回传选点。
     普通地图模式仍沿用 PLATE_MAP.onPick，不受这一层影响。 */
  if (OPENING_MODE) {
    API.petals(false);
    /* 开局档是 4 月 1 日的朝，也是四个时段里最亮最透的一档——
       宿主那一页整体走通透，底板不该是最沉的夜。 */
    API.setPhase('朝');
    /* 时段条和行程面板都归宿主页面管：那一页自己有通勤卡片，
       而且这两块都钉在左下，跟宿主的图例撞在同一个角上。 */
    document.documentElement.dataset.opening = '1';
    API.setState({ district: '', player: { at: '' }, actors: [], events: [], route: [] });
    API.fitAll(0);
    API.onPick(node => {
      try {
        window.parent.postMessage({
          channel: 'linjiang-map',
          type: 'pick',
          payload: {
            id: node.id,
            name: node.name,
            fullName: node.fullName,
            district: node.district,
            archetype: node.archetype,
            draw: node.draw || '',
            features: node.features || {}
          }
        }, '*');
      } catch (_) {}
    });
    setTimeout(() => {
      try { window.parent.postMessage({ channel: 'linjiang-map', type: 'ready' }, '*'); } catch (_) {}
    }, 0);
  }

  // 截图和探测脚本沿用的短名
  window.__setPhase = API.setPhase;
  window.__focus = focus;
  window.__setView = (cx, cy, z) => { anim = null; Object.assign(view, { cx, cy, z }); clampView(); };
  window.__zoomAt = zoomAt;
  window.__view = API.debug;
})();
