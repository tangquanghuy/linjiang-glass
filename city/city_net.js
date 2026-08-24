/**
 * ============================================================
 * 临江市 · 度量层 · 水系 · 轨道 · 路网 · 寻路
 * ============================================================
 * 这个文件不碰 DOM。吃进「节点的世界坐标」，吐出「图 + 一条路径 + 一笔账」。
 * 画在屏幕上是 plate_map.js 的事，这里只管几何和时间。
 *
 * 世界坐标就是总览底板的归一化坐标：x ∈ [0,1]，y ∈ [0,1]。
 * y 方向在屏幕上乘了 R，所以量真实距离必须跟着乘 R——
 * 这一点全文件只在 kmOf 里做一次，别的地方一律走它。
 *
 * ------------------------------------------------------------
 * 为什么要有 KM_PER_UNIT
 * ------------------------------------------------------------
 * 原来整套坐标是纯归一化的，全工程没出现过一次「米」。
 * 没有标尺，「距离」就不是一个可计算的量，于是也没有时长、票价、体力。
 * 所以先钉一个数：总览横向 = 24 km。整座城 24 × 16 km，横穿约 14 km。
 * 这个尺度下区宽 6~8 km、区内相邻节点 300~500 m，都对得上现实。
 * 改这一个常量，后面所有时长/票价/体力自动跟着走，别处不用改。
 *
 * ------------------------------------------------------------
 * 三层路网，只手写上面两层
 * ------------------------------------------------------------
 * 轨道（METRO）和干道（WAYS）是手写的，因为它们同时是玩法骨架和画面骨架，
 * 必须能读出「这条线为什么这么走」。
 * 支路是自动生成的：112 个节点手连支路是没法维护的活，
 * 改一个节点坐标就要重连一片。所以走 RNG（relative neighborhood graph）：
 *
 *   保留边 (a,b) ⟺ 不存在第三点 c 使 max(d(a,c), d(b,c)) < d(a,b)
 *
 * 挑它是因为两条性质正好合用：
 *   1. RNG ⊇ MST，所以生成的图一定连通，永远不会有孤立节点；
 *   2. RNG ⊆ Delaunay，边不会乱穿，出来像街道网而不像蛛网。
 * 副作用是它会毫不客气地跨江连边，所以水系必须先有折线——
 * 用来把穿水的边剔掉。水系图形和障碍判定是同一份数据。
 *
 * 手写的数据不做障碍检查（我摆的桥我负责），
 * 生成的边一律检查。这条分工是有意的。
 */
(function () {
  'use strict';

  /** 底板高宽比。世界 y 单位是按 x 宽度归一的，量距离必须乘它 */
  const R = 1024 / 1536;

  /** 总览横向多少公里。全套距离的唯一标尺 */
  const KM_PER_UNIT = 24;

  const kmOf = (a, b) => Math.hypot(b[0] - a[0], (b[1] - a[1]) * R) * KM_PER_UNIT;

  /**
   * ------------------------------------------------------------
   * 折点怎么写：一律不写死世界坐标
   * ------------------------------------------------------------
   * 三种写法，`resolve` 负责翻译：
   *
   *   { n: 'wx_mendong' }                     钉在某个地点上
   *   { a: 'gl_wutong', b: 'mh_plaza', t: .5 } 两个地点之间的比例位置
   *                                            t 可以 <0 或 >1，那就是外推
   *   { ..., s: 0.03 }                        再往侧向偏 s（世界 x 单位，正为右手侧）
   *   [x, y]                                  真正跟任何地点都无关的自由点
   *
   * 为什么不写死：地点的世界坐标是 PLATES[].frame 算出来的，而 frame 是要改的
   * （第一版对位就是错的，明湖整体偏了 2.2 km）。第一版这里全是绝对坐标，
   * 于是改一个 frame 就要跟着手改五十几个站和七十几个路口，
   * 对位这件事的成本从「改 9 个数」变成「改 130 个数」——那就等于改不动了。
   * 现在锚在地点上，frame 一动，地铁线和干道自己跟着走。
   */
  function resolve(p, nodeWorld, extra) {
    if (Array.isArray(p)) return p;
    const at = k => (extra && extra[k]) || nodeWorld[k] || null;
    if (p.n) {
      const w = at(p.n);
      return w ? [w[0], w[1]] : null;
    }
    const A = at(p.a), B = at(p.b);
    if (!A || !B) return null;
    const t = p.t == null ? 0.5 : p.t;
    const out = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
    if (p.s) {
      // 侧向偏移要在真实空间里算，不然 y 方向会被归一化的比例拉扁
      const dx = B[0] - A[0], dy = (B[1] - A[1]) * R;
      const L = Math.hypot(dx, dy) || 1e-6;
      out[0] += (-dy / L) * p.s;
      out[1] += (dx / L) * p.s / R;
    }
    return out;
  }

  // ============================================================
  // 水系
  // ============================================================
  /**
   * 临江自西南向东北斜贯城市北部（照《底图提示词》的方位表）。
   * 只存中心线，宽度是画图用的；障碍判定按中心线做线段相交，
   * 宽度不参与——不然贴着岸的边会被误杀。
   */
  const WATER = {
    /* 中心线走的是江南岸那条主航道。跟着 frame 重对位一起量过：
       照片上南岸岸线在 x=0.1 处约 y=0.30，到 x=0.9 收到 0.19，
       比上一版（0.315 → 0.02）平得多也南得多——上一版右半段整个跑到
       对岸去了，于是跨江检查基本没在工作（穿水剔除只剩 1 条）。 */
    river: {
      name: '临江',
      width: 0.052,
      pts: [
        [-0.030, 0.335], [0.100, 0.305], [0.250, 0.272], [0.400, 0.252],
        [0.550, 0.238], [0.700, 0.222], [0.850, 0.200], [1.030, 0.175]
      ]
    },
    /** 江心洲：江中间那条长绿岛，只画不挡（岛上有农田和矮房，但没有路网） */
    isle: [
      [0.270, 0.240], [0.400, 0.226], [0.540, 0.210], [0.680, 0.194], [0.756, 0.184],
      [0.756, 0.156], [0.680, 0.166], [0.540, 0.180], [0.400, 0.194], [0.270, 0.206]
    ],
    lakes: [
      {
        // 湖面绕开 mh_lake（那是环湖跑道那一侧的岸），但把 mh_lake_island
        // 圈进来——湖心岛本来就该在湖里。岸线位置直接决定哪些自动生成的
        // 支路会被剔掉，所以这不是纯装饰；圈错了会把湖心岛变成孤岛
        // （靠 LINKS 里那条栈桥兜住）。
        name: '明湖',
        pts: [
          [0.740, 0.408], [0.752, 0.372], [0.782, 0.352], [0.818, 0.358],
          [0.836, 0.388], [0.828, 0.428], [0.798, 0.452], [0.762, 0.442]
        ]
      }
    ]
  };

  // ============================================================
  // 干道
  // ============================================================
  /**
   * kind 决定哪些出行方式能上，以及速度：
   *   express  城市快速路/高速，只走机动车
   *   arterial 主干道，四种方式都能上（公交跑在这层）
   *   bridge   跨江桥，人能走
   *   tunnel   过江隧道，人不能走
   *
   * 折点坐标在路口处刻意写成完全一样的值，好让下面的焊接一次就并上。
   * 焊接半径 0.02（≈480 m），比这个远的当成两条不相交的路。
   */
  /* 路口处两条路必须给出同一个折点写法（同一个 {n:...} 或同一个 {a,b,t}），
     下面的焊接才能一次并上。焊接半径 0.02（≈480 m）。 */
  const J = {
    sanpailou: { a: 'gl_wutong', b: 'mh_plaza', t: 0.16 },   // 三牌楼路口，1/2 号线换乘
    qiaonan: { a: 'pj_village', b: 'gl_wutong', t: 0.82 },    // 南岸桥头
    qiaobei: { a: 'pj_village', b: 'gl_wutong', t: 0.24 },    // 北岸桥头
    luoxiaW: { a: 'mh_lake', b: 'lx_library', t: 0.52 }       // 城东，汉中路与应天大街在这儿合
  };

  const WAYS = [
    {
      // 环城高速：绕整片建成区，全程在江南岸
      id: 'ring', name: '环城高速', kind: 'express',
      pts: [
        [0.060, 0.360], [0.050, 0.550], [0.060, 0.720], [0.160, 0.880],
        [0.400, 0.950], [0.660, 0.940], [0.860, 0.840], [0.960, 0.640],
        [0.970, 0.460], [0.900, 0.320], [0.720, 0.270], [0.520, 0.290],
        [0.340, 0.310], [0.160, 0.330], [0.060, 0.360]
      ]
    },
    {
      id: 'hanzhong', name: '汉中路', kind: 'arterial',
      pts: [
        [0.060, 0.360], { n: 'xz_jiangyan' }, { n: 'gl_wutong' }, J.sanpailou,
        { a: 'gl_wutong', b: 'mh_plaza', t: 0.58 }, { n: 'mh_plaza' },
        { n: 'mh_dept' }, { n: 'mh_lake' }, J.luoxiaW, { n: 'lx_library' },
        { n: 'lx_gym' }
      ]
    },
    {
      id: 'zhongshan', name: '中山路', kind: 'arterial',
      pts: [
        J.sanpailou,
        { a: 'gl_wutong', b: 'wx_mendong', t: 0.34, s: 0.03 },
        { a: 'gl_wutong', b: 'wx_mendong', t: 0.66, s: 0.03 },
        { n: 'wx_mendong' },
        { a: 'wx_mendong', b: 'wx_arch', t: 2.6 }
      ]
    },
    /* 老城到市中心的斜线。没有它的时候，从乌溪去明湖广场只能
       先出城上环城高速再绕回来——直线 8.6 km、开车 19.4 km，
       绕行比 2.26，比现实（1.2~1.3）差了一倍。路网太稀就会这样：
       寻路没算错，是图上真的没有近路。 */
    {
      id: 'yudao', name: '御道街', kind: 'arterial',
      pts: [
        { n: 'wx_mendong' },
        { a: 'wx_mendong', b: 'mh_plaza', t: 0.33, s: 0.02 },
        { a: 'wx_mendong', b: 'mh_plaza', t: 0.67, s: 0.02 },
        { n: 'mh_plaza' }
      ]
    },
    {
      id: 'huju', name: '虎踞路', kind: 'arterial',
      pts: [
        { n: 'gl_wutong' },
        { a: 'gl_wutong', b: 'wx_dye', t: 0.36, s: -0.02 },
        { a: 'gl_wutong', b: 'wx_dye', t: 0.70, s: -0.02 },
        { n: 'wx_dye' }
      ]
    },
    {
      id: 'longpan', name: '龙蟠路', kind: 'arterial',
      pts: [
        { n: 'mh_lake' },
        { a: 'mh_lake', b: 'lx_bus', t: 0.34, s: 0.03 },
        { a: 'mh_lake', b: 'lx_bus', t: 0.68, s: 0.03 },
        { n: 'lx_bus' }
      ]
    },
    {
      id: 'yingtian', name: '应天大街', kind: 'arterial',
      // 东端必须收到 J.luoxiaW 上去焊住汉中路。只到落霞枢纽为止的时候，
      // 城东那一片是个死胡同：枢纽和大学城之间图上没有路，
      // 于是坐地铁到枢纽再去图书馆只能走 1.7 km
      pts: [
        { n: 'dt_outlet' }, { n: 'dt_airport' },
        { a: 'dt_airport', b: 'wx_dye', t: 0.5 }, { n: 'wx_dye' },
        { n: 'wx_mendong' },
        { a: 'wx_mendong', b: 'ys_fishmkt', t: 0.4, s: 0.02 },
        { a: 'wx_mendong', b: 'ys_fishmkt', t: 0.78, s: 0.02 },
        { n: 'ys_fishmkt' }, { n: 'ys_station' },
        { a: 'ys_station', b: 'lx_bus', t: 0.5 }, { n: 'lx_bus' },
        J.luoxiaW
      ]
    },
    {
      id: 'huning', name: '沪宁连接线', kind: 'arterial',
      pts: [
        { n: 'mh_plaza' }, { n: 'mh_dept' },
        { a: 'mh_dept', b: 'ys_station', t: 0.28, s: -0.02 },
        { a: 'mh_dept', b: 'ys_station', t: 0.56, s: -0.02 },
        { a: 'mh_dept', b: 'ys_station', t: 0.8, s: -0.01 },
        { n: 'ys_station' }
      ]
    },
    {
      id: 'huanshan', name: '青屏环山路', kind: 'arterial',
      pts: [
        { n: 'lx_library' },
        { a: 'lx_library', b: 'qp_visitor', t: 0.5, s: 0.03 },
        { n: 'qp_visitor' },
        { a: 'qp_visitor', b: 'qp_main', t: 0.5, s: -0.02 },
        { n: 'qp_main' }
      ]
    },
    {
      id: 'xizhou', name: '西洲大道', kind: 'arterial',
      pts: [
        { n: 'xz_warehouse' }, { n: 'xz_zhoumen' }, { n: 'xz_sound_studio' },
        { n: 'gl_wutong' }
      ]
    },
    {
      id: 'jiangbei', name: '江北大道', kind: 'arterial',
      pts: [
        J.qiaobei, { n: 'pj_village' }, { n: 'pj_apt' },
        { a: 'pj_village', b: 'pj_apt', t: 2.0 }
      ]
    },
    {
      // 跨江大桥。两个桥头都写成 J.*，好让江北大道和汉中路各自焊得上
      id: 'daqiao', name: '临江大桥', kind: 'bridge',
      pts: [
        J.qiaobei, { a: 'pj_village', b: 'gl_wutong', t: 0.5 }, J.qiaonan,
        { n: 'gl_wutong' }
      ]
    },
    {
      id: 'suidao', name: '过江隧道', kind: 'tunnel',
      pts: [
        { a: 'pj_village', b: 'pj_apt', t: 2.0 },
        { a: 'pj_apt', b: 'mh_plaza', t: 0.34 },
        { a: 'pj_apt', b: 'mh_plaza', t: 0.62 },
        { n: 'mh_plaza' }
      ]
    },
    {
      id: 'airport', name: '机场高速', kind: 'express',
      pts: [
        { n: 'dt_airport' },
        { a: 'dt_airport', b: 'ys_station', t: 0.35, s: 0.04 },
        { a: 'dt_airport', b: 'ys_station', t: 0.7, s: 0.04 },
        { n: 'ys_station' }
      ]
    }
  ];

  /**
   * 手写的地点直连，绕过穿水检查。
   * 栈桥、轮渡、索道这类东西就是专门用来过水的，自动生成那一层
   * 只会把它们当成"穿江的错误连线"剔掉——湖心岛就是这么被剔成孤岛的。
   * 谁要加渡轮或缆车，加在这儿。
   */
  const LINKS = [
    { a: 'mh_lake', b: 'mh_lake_island', kind: 'local', name: '湖心岛栈桥' }
  ];

  // ============================================================
  // 轨道交通
  // ============================================================
  /**
   * 站点两种写法：
   *   { node:'ys_station' }         挂在已有节点上，站厅就是那个节点
   *   { key, name, at:<折点写法> }   纯换乘站，at 走上面 resolve 的三种写法
   *
   * 站间距按 1.4~2.2 km 撒（市区偏短、郊区偏长），照现实。
   * 换乘只有五处：三牌楼(1/2)、门东(1/3)、明湖广场(2/4)、
   * 德泰百货(2/5)、临江南站(3/5)。任意两条线最多共一站——
   * 共线跑一长段的网在图上会糊成一条，读不出是两条线。
   *
   * 中间那些「凭空造」的站不写绝对坐标，写成两个真节点之间的比例位置。
   * 底板对位一改，整条线自己跟着挪，相对关系（谁在谁北边、哪儿换乘）不会散。
   */
  /**
   * 每条线两个颜色，别合成一个：
   *   color 是身份色，给行程面板上的段标签、图例这些实心小块用，
   *         要饱和、要能压住白字。
   *   glow  是画在图上的颜色，提亮、去饱和，往底板那个紫蓝调靠。
   *
   * 一开始只有 color，直接拿饱和原色描在图上——底板是刻意做成低对比低饱和的
   * （提示词里连 neon overload 都写进负面词了），五条原色压上去就是一团电线。
   * 图上那层要说底板自己的话：发光的轨迹，不是画上去的笔。
   */
  const METRO = [
    {
      id: 'l1', name: '1 号线', short: '1', color: '#e0453a', glow: '#ff9d8c',
      stations: [
        { node: 'pj_apt' },
        { node: 'pj_village' },
        { key: 'qiaobei', name: '大桥北', at: J.qiaobei },
        { key: 'binjiang', name: '滨江路', at: J.qiaonan },
        { key: 'sanpailou', name: '三牌楼', at: J.sanpailou },
        // 老城这一段沿中山路走，所以侧向偏移和 zhongshan 那条路一致
        { key: 'gulou', name: '鼓楼', at: { a: 'gl_wutong', b: 'wx_mendong', t: 0.26, s: 0.035 } },
        { key: 'wenmiao', name: '文庙', at: { a: 'gl_wutong', b: 'wx_mendong', t: 0.52, s: 0.035 } },
        { key: 'zhonghuamen', name: '中华门', at: { a: 'gl_wutong', b: 'wx_mendong', t: 0.78, s: 0.025 } },
        { node: 'wx_mendong' },
        { node: 'wx_arch' },
        { key: 'nanjiao', name: '南郊', at: { a: 'wx_mendong', b: 'wx_arch', t: 2.6 } }
      ]
    },
    {
      id: 'l2', name: '2 号线', short: '2', color: '#2f7fd6', glow: '#8cc4ff',
      stations: [
        { node: 'xz_theatre' },
        { node: 'xz_jiangyan' },
        { node: 'gl_wutong' },
        { key: 'sanpailou', name: '三牌楼', at: J.sanpailou },
        { key: 'shanghailu', name: '上海路', at: { a: 'gl_wutong', b: 'mh_plaza', t: 0.58 } },
        { node: 'mh_plaza' },
        { node: 'mh_dept' },
        { key: 'hudong', name: '湖东', at: { a: 'mh_dept', b: 'mh_lake', t: 0.5 } },
        { node: 'mh_lake' },
        { key: 'qilinmen', name: '麒麟门', at: { a: 'mh_lake', b: 'lx_library', t: 0.33 } },
        { key: 'xianlin', name: '仙林', at: { a: 'mh_lake', b: 'lx_library', t: 0.66 } },
        { node: 'lx_library' },
        { node: 'lx_gym' }
      ]
    },
    {
      id: 'l3', name: '3 号线', short: '3', color: '#2f9e5c', glow: '#84dfae',
      stations: [
        { node: 'dt_outlet' },
        { node: 'dt_airport' },
        { key: 'shuangzha', name: '双闸', at: { a: 'dt_airport', b: 'wx_dye', t: 0.5 } },
        { node: 'wx_dye' },
        { node: 'wx_mendong' },
        { key: 'yuhuatai', name: '雨花台', at: { a: 'wx_mendong', b: 'ys_fishmkt', t: 0.28, s: 0.02 } },
        { key: 'kazimen', name: '卡子门', at: { a: 'wx_mendong', b: 'ys_fishmkt', t: 0.53, s: 0.025 } },
        { key: 'yingtianjie', name: '应天街', at: { a: 'wx_mendong', b: 'ys_fishmkt', t: 0.78, s: 0.02 } },
        { node: 'ys_fishmkt' },
        { node: 'ys_station' },
        { key: 'huashenmiao', name: '花神庙', at: { a: 'ys_station', b: 'lx_bus', t: 0.5, s: 0.02 } },
        { node: 'lx_bus' }
      ]
    },
    {
      id: 'l4', name: '4 号线', short: '4', color: '#7c5cd0', glow: '#bda6ff',
      stations: [
        { node: 'xz_warehouse' },
        { node: 'xz_zhoumen' },
        { node: 'xz_sound_studio' },
        /* 西段往南鼓一点。不给 s 的话这一段和 2 号线（梧桐里→明湖广场）
           几乎重合成一条平行线，图上读不出是两条 */
        { key: 'caochangmen', name: '草场门', at: { a: 'xz_sound_studio', b: 'mh_plaza', t: 0.22, s: 0.030 } },
        { key: 'wutaishan', name: '五台山', at: { a: 'xz_sound_studio', b: 'mh_plaza', t: 0.47, s: 0.045 } },
        { key: 'daxinggong', name: '大行宫', at: { a: 'xz_sound_studio', b: 'mh_plaza', t: 0.74, s: 0.032 } },
        { node: 'mh_plaza' },
        { key: 'zhongshanmen', name: '中山门', at: { a: 'mh_plaza', b: 'qp_visitor', t: 0.22, s: -0.020 } },
        { key: 'muxuyuan', name: '苜蓿园', at: { a: 'mh_plaza', b: 'qp_visitor', t: 0.46, s: -0.028 } },
        { key: 'qingpingxi', name: '青屏山西', at: { a: 'mh_plaza', b: 'qp_visitor', t: 0.71, s: -0.020 } },
        { node: 'qp_visitor' }
      ]
    },
    {
      id: 'l5', name: '5 号线', short: '5', color: '#dd7a2b', glow: '#ffc484',
      stations: [
        { node: 'ys_station' },
        { key: 'shuanglong', name: '双龙大道', at: { a: 'ys_station', b: 'mh_dept', t: 0.25, s: 0.020 } },
        { key: 'guanghuamen', name: '光华门', at: { a: 'ys_station', b: 'mh_dept', t: 0.47, s: 0.025 } },
        { key: 'minggugong', name: '明故宫', at: { a: 'ys_station', b: 'mh_dept', t: 0.68, s: 0.020 } },
        { key: 'daxinggongdong', name: '大行宫东', at: { a: 'ys_station', b: 'mh_dept', t: 0.86, s: 0.012 } },
        { node: 'mh_dept' },
        { node: 'mh_yunque' }
      ]
    }
  ];

  // ============================================================
  // 速度与代价
  // ============================================================
  /**
   * 每种路面、每种出行方式的均速（km/h）。缺项 = 这条路这种方式上不去。
   * 都是「含红灯与拥堵」的行程速度，不是限速。
   */
  const SPEED = {
    local: { walk: 4.5, car: 22, taxi: 22, transit: 4.5 },
    arterial: { walk: 4.5, car: 34, taxi: 34, transit: 18 },
    express: { car: 58, taxi: 58 },
    bridge: { walk: 4.5, car: 40, taxi: 40, transit: 20 },
    tunnel: { car: 45, taxi: 45, transit: 22 },
    rail: { transit: 35 },
    /** 节点接到干道上的那一小段：谁都能走，机动车按支路速度 */
    access: { walk: 4.5, car: 22, taxi: 22, transit: 4.5 },
    /** 节点走到站厅：任何方式都是走过去的 */
    portal: { walk: 4.5, car: 4.5, taxi: 4.5, transit: 4.5 }
  };

  /**
   * 候车与进站，写成边上的定额分钟，不是全局加成。
   * 这样多坐一趟公交就多付一次候车、多换一次乘就多付一次进出站，
   * 而且 Dijkstra 仍然是精确的——不需要给顶点加"上一段用了什么"的状态。
   *
   * board: 站厅 ↔ 站台，含下到站台和等车头的平均一半
   * WAIT_BUS: 从人行网切进干道那一步（只有公交这么算，走路不用等）
   *
   * WAIT_BUS 是「半次候车」。边是无向的，没法区分上车和下车，
   * 所以一次公交把两端各收一半——上下各 3 分，一趟正好 6 分候车。
   * 收整数 6 的话下车也要等一次，一趟公交白付 6 分钟，
   * 结果一公里半的接驳永远是走过去而不是坐一站，公交这条腿等于不存在。
   */
  const BOARD_MIN = 2.5;
  const WAIT_BUS = 3;

  /** 出行方式的一次性开销（分钟）。取车、找车位、等出租都在这儿 */
  const MODE_OVERHEAD = { walk: 0, car: 8, taxi: 4, transit: 0 };

  const MODES = [
    { id: 'walk', label: '步行', icon: 'walk' },
    { id: 'car', label: '开车', icon: 'car' },
    { id: 'taxi', label: '打车', icon: 'taxi' },
    { id: 'transit', label: '地铁公交', icon: 'metro' }
  ];

  // ============================================================
  // 几何
  // ============================================================
  function segHit(p1, p2, p3, p4) {
    const d = (b, a) => [b[0] - a[0], (b[1] - a[1]) * R];
    const r = d(p2, p1), s = d(p4, p3), q = d(p3, p1);
    const den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-12) return false;
    const t = (q[0] * s[1] - q[1] * s[0]) / den;
    const u = (q[0] * r[1] - q[1] * r[0]) / den;
    return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999;
  }

  /** 障碍折线：江中心线 + 各湖的闭合轮廓 */
  const BARRIERS = (() => {
    const out = [WATER.river.pts];
    WATER.lakes.forEach(l => out.push(l.pts.concat([l.pts[0]])));
    return out;
  })();

  /** 这条边穿水没有？只用来筛自动生成的边，手写的干道不查 */
  function crossesWater(a, b) {
    for (const line of BARRIERS) {
      for (let i = 0; i < line.length - 1; i++) {
        if (segHit(a, b, line[i], line[i + 1])) return true;
      }
    }
    return false;
  }

  // ============================================================
  // 建图
  // ============================================================
  /**
   * 顶点 id 前缀：
   *   p:<nodeId>          地点
   *   c:<stationKey>      站厅（挂在节点上的站直接用 p:，不另开顶点）
   *   t:<lineId>:<stKey>  站台
   *   w:<n>               干道折点（焊接后的）
   */
  function build(opts) {
    const nodeWorld = opts.nodeWorld;        // { id: [x, y] }
    const nameOf = opts.nameOf || (id => id);
    const anchorOf = opts.anchorOf || (() => '');

    const V = new Map();   // vid -> { id, x, y, kind, label }
    const E = [];          // { a, b, kind, km, line? }

    const vert = (id, x, y, kind, label) => {
      let v = V.get(id);
      if (!v) { v = { id, x, y, kind, label: label || '' }; V.set(id, v); }
      return v;
    };
    const edge = (a, b, kind, line) => {
      const va = V.get(a), vb = V.get(b);
      if (!va || !vb) return;
      E.push({ a, b, kind, km: kmOf([va.x, va.y], [vb.x, vb.y]), line });
    };

    // ---- 地点顶点 ----
    const pois = [];
    Object.keys(nodeWorld).forEach(id => {
      const w = nodeWorld[id];
      vert('p:' + id, w[0], w[1], 'poi', nameOf(id));
      pois.push({ id, vid: 'p:' + id, at: w });
    });

    /* ---- 先把所有折点写法翻成世界坐标 ----
       站点之间允许互相引用（大桥北是「浦江村 ↔ 三牌楼」之间，而三牌楼本身
       又是「梧桐里 ↔ 明湖广场」之间的），所以反复扫到不再有新解出的为止。
       层数很浅，两三轮就收敛。 */
    const RES = {};
    METRO.forEach(line => line.stations.forEach(st => {
      if (st.node || !st.at) return;
      RES[st.key] = null;
    }));
    for (let pass = 0; pass < 6; pass++) {
      let moved = 0;
      METRO.forEach(line => line.stations.forEach(st => {
        if (st.node || !st.at || RES[st.key]) return;
        const p = resolve(st.at, nodeWorld, RES);
        if (p) { RES[st.key] = p; moved++; }
      }));
      if (!moved) break;
    }
    const unresolved = Object.keys(RES).filter(k => !RES[k]);
    /* 不焊的话各条路只是在图上交叉、在图论上毫无关系，
       于是"从中山路右转上汉中路"这种事根本不存在，
       整个机动车网会碎成十几个互不相通的岛。 */
    const WELD = 0.02;
    const wv = [];                     // 焊接后的干道顶点 [x, y]
    const wIndex = (x, y) => {
      for (let i = 0; i < wv.length; i++) {
        if (Math.hypot(wv[i][0] - x, (wv[i][1] - y) * R) < WELD) return i;
      }
      wv.push([x, y]);
      return wv.length - 1;
    };
    const wayChains = [];
    WAYS.forEach(w => {
      const pts = w.pts.map(p => resolve(p, nodeWorld, RES)).filter(Boolean);
      w._pts = pts;                       // 渲染层直接用这份解好的
      wayChains.push({ way: w, chain: pts.map(p => wIndex(p[0], p[1])) });
    });
    wv.forEach((p, i) => vert('w:' + i, p[0], p[1], 'way', ''));
    wayChains.forEach(({ way, chain }) => {
      for (let i = 0; i < chain.length - 1; i++) {
        if (chain[i] === chain[i + 1]) continue;
        edge('w:' + chain[i], 'w:' + chain[i + 1], way.kind, way.id);
      }
    });

    // ---- 轨道：站厅 / 站台 / 区间 ----
    const stations = new Map();   // key -> { key, name, x, y, vid, lines:[] }
    METRO.forEach(line => {
      line.stations.forEach(st => {
        const key = st.node || st.key;
        let s = stations.get(key);
        if (!s) {
          let x, y, name, vid;
          if (st.node) {
            const w = nodeWorld[st.node];
            if (!w) return;                       // 节点不在图上就跳过这一站
            x = w[0]; y = w[1]; name = nameOf(st.node); vid = 'p:' + st.node;
          } else {
            const w = RES[key];
            if (!w) return;
            x = w[0]; y = w[1]; name = st.name; vid = 'c:' + key;
            vert(vid, x, y, 'hall', name);
          }
          s = { key, name, x, y, vid, lines: [] };
          stations.set(key, s);
        }
        if (s.lines.indexOf(line.id) < 0) s.lines.push(line.id);
        st._key = key;
      });
    });
    METRO.forEach(line => {
      const seq = [];
      line.stations.forEach(st => {
        const s = stations.get(st._key);
        if (!s) return;
        const pid = 't:' + line.id + ':' + s.key;
        vert(pid, s.x, s.y, 'plat', s.name);
        edge(s.vid, pid, 'board', line.id);
        seq.push(pid);
      });
      for (let i = 0; i < seq.length - 1; i++) edge(seq[i], seq[i + 1], 'rail', line.id);
      line._seq = seq;
    });

    // ---- 支路：全城 RNG，再剔掉穿水的 ----
    /* 按区各跑一次 RNG 会得到九个互不相连的团，还要另想办法缝。
       全城一起跑就没这个问题：RNG ⊇ MST，出来天生连通。
       n=112，n³ ≈ 1.4M 次比较，一次性建图，跑一遍几毫秒。 */
    const n = pois.length;
    const D = [];
    for (let i = 0; i < n; i++) {
      D.push(new Float64Array(n));
      for (let j = 0; j < i; j++) {
        const d = kmOf(pois[i].at, pois[j].at);
        D[i][j] = d; D[j][i] = d;
      }
    }
    let cutWater = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (anchorOf(pois[i].id) || anchorOf(pois[j].id)) continue;
        const dij = D[i][j];
        let keep = true;
        for (let k = 0; k < n; k++) {
          if (k === i || k === j) continue;
          if (Math.max(D[i][k], D[j][k]) < dij) { keep = false; break; }
        }
        if (!keep) continue;
        if (crossesWater(pois[i].at, pois[j].at)) { cutWater++; continue; }
        edge(pois[i].vid, pois[j].vid, 'local');
      }
    }
    LINKS.forEach(l => {
      if (nodeWorld[l.a] && nodeWorld[l.b]) edge('p:' + l.a, 'p:' + l.b, l.kind || 'local');
    });
    Object.keys(nodeWorld).forEach(id => {
      const anchor = String(anchorOf(id) || '');
      if (anchor && nodeWorld[anchor]) edge('p:' + id, 'p:' + anchor, 'local');
    });

    // ---- 接驳：每个地点接到最近的干道折点 ----
    /* 只接一个不够——最近那个可能在江对面，被水挡掉之后这个点就上不了车。
       所以按距离试前几个，接上两条能过的就停。 */
    pois.forEach(p => {
      if (anchorOf(p.id)) return;
      const cand = wv.map((q, i) => ({ i, d: kmOf(p.at, q) })).sort((a, b) => a.d - b.d);
      let got = 0;
      for (const c of cand) {
        if (got >= 3 || c.d > 5) break;
        if (crossesWater(p.at, wv[c.i])) continue;
        edge(p.vid, 'w:' + c.i, 'access');
        got++;
      }
    });

    // ---- 接驳：每个地点接到 2.2 km 内最近的站厅 ----
    const halls = [...stations.values()];
    pois.forEach(p => {
      if (anchorOf(p.id)) return;
      let best = null, bd = Infinity;
      halls.forEach(s => {
        if (s.vid === p.vid) return;
        const d = kmOf(p.at, [s.x, s.y]);
        if (d < bd && d <= 2.2 && !crossesWater(p.at, [s.x, s.y])) { bd = d; best = s; }
      });
      if (best) edge(p.vid, best.vid, 'portal');
    });

    // ---- 站厅也要能上机动车网（打车到地铁站口） ----
    halls.forEach(s => {
      if (s.vid.startsWith('p:')) return;         // 挂节点的站已经接过了
      let bi = -1, bd = Infinity;
      wv.forEach((q, i) => {
        const d = kmOf([s.x, s.y], q);
        if (d < bd) { bd = d; bi = i; }
      });
      if (bi >= 0 && bd < 4.5) edge(s.vid, 'w:' + bi, 'access');
    });

    // ---- 邻接表 ----
    const adj = new Map();
    V.forEach((_, id) => adj.set(id, []));
    E.forEach((e, i) => { adj.get(e.a).push(i); adj.get(e.b).push(i); });

    return {
      V, E, adj, stations, wv, wayChains,
      poiIds: pois.map(p => p.id), cutWater, unresolved,
      /** 渲染层要的：一条线的站点世界坐标序列 */
      lineGeom: line => line.stations
        .map(st => stations.get(st.node || st.key))
        .filter(Boolean).map(s => [s.x, s.y]),
      wayGeom: w => w._pts || []
    };
  }

  // ============================================================
  // 边权
  // ============================================================
  /** 这条边在这种出行方式下要几分钟？不通返回 null */
  function edgeMin(e, mode) {
    if (e.kind === 'board') return mode === 'transit' ? BOARD_MIN : null;
    const tab = SPEED[e.kind];
    if (!tab) return null;
    const v = tab[mode];
    if (!v) return null;
    let m = (e.km / v) * 60;
    /* 从人行网切进干道，公交要等车。走路不等，所以只有 transit 付这一笔。
       付在 access 上而不是全局加一次，是为了让"走一段公交再走一段公交"
       老实付两次候车——同时 Dijkstra 还是无状态的、精确的。 */
    if (mode === 'transit' && e.kind === 'access') m += WAIT_BUS;
    return m;
  }

  // ============================================================
  // 寻路
  // ============================================================
  /** 二叉堆。图只有几百个顶点，本来数组扫也够，但堆就二十行，写了省心 */
  function Heap() {
    const a = [];
    return {
      size: () => a.length,
      push(v, k) {
        a.push([k, v]);
        let i = a.length - 1;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (a[p][0] <= a[i][0]) break;
          [a[p], a[i]] = [a[i], a[p]]; i = p;
        }
      },
      pop() {
        const top = a[0], last = a.pop();
        if (a.length) {
          a[0] = last;
          let i = 0;
          for (;;) {
            const l = i * 2 + 1, r = l + 1;
            let m = i;
            if (l < a.length && a[l][0] < a[m][0]) m = l;
            if (r < a.length && a[r][0] < a[m][0]) m = r;
            if (m === i) break;
            [a[m], a[i]] = [a[i], a[m]]; i = m;
          }
        }
        return top;
      }
    };
  }

  function dijkstra(G, srcVid, dstVid, mode) {
    const dist = new Map(), prev = new Map(), done = new Set();
    dist.set(srcVid, 0);
    const h = Heap();
    h.push(srcVid, 0);
    while (h.size()) {
      const [d, v] = h.pop();
      if (done.has(v)) continue;
      done.add(v);
      if (v === dstVid) break;
      for (const ei of G.adj.get(v) || []) {
        const e = G.E[ei];
        const m = edgeMin(e, mode);
        if (m == null) continue;
        const w = e.a === v ? e.b : e.a;
        if (done.has(w)) continue;
        const nd = d + m;
        if (nd < (dist.has(w) ? dist.get(w) : Infinity)) {
          dist.set(w, nd);
          prev.set(w, [v, ei]);
          h.push(w, nd);
        }
      }
    }
    if (!dist.has(dstVid)) return null;
    const path = [];
    let cur = dstVid;
    while (cur !== srcVid) {
      const p = prev.get(cur);
      if (!p) return null;
      path.push({ from: p[0], to: cur, e: G.E[p[1]] });
      cur = p[0];
    }
    path.reverse();
    return { min: dist.get(dstVid), path };
  }

  // ============================================================
  // 分段与结算
  // ============================================================
  /** 这条边在这种方式下算哪种载具，决定 leg 怎么分、体力怎么扣 */
  function carrierOf(e, mode) {
    if (e.kind === 'rail' || e.kind === 'board') return 'rail';
    if (mode === 'transit') return e.kind === 'portal' || e.kind === 'local' || e.kind === 'access' ? 'foot' : 'bus';
    if (mode === 'walk') return 'foot';
    if (e.kind === 'portal') return 'foot';
    return mode === 'taxi' ? 'taxi' : 'car';
  }

  const CARRIER_LABEL = { foot: '步行', bus: '公交', taxi: '出租车', car: '驾车', rail: '' };

  function legsOf(G, path, mode) {
    const legs = [];
    let wait = 0;
    path.forEach(step => {
      const e = step.e;
      const car = carrierOf(e, mode);
      const line = car === 'rail' ? e.line : null;
      /* 候车是摊在两条接驳边上的（见 WAIT_BUS）。分段时先把它摘出来，
         下面再整笔挂到公交那一段上——留在原处会出现
         「步行 40 m · 4 分」这种读起来像 bug 的行。
         总时长仍然取 Dijkstra 的结果，这里只是改归属。 */
      const isWait = mode === 'transit' && e.kind === 'access';
      let m = edgeMin(e, mode);
      if (isWait) { m -= WAIT_BUS; wait += WAIT_BUS; }
      const last = legs[legs.length - 1];
      if (last && last.carrier === car && last.line === line) {
        last.km += e.km;
        last.min += m;
        last.to = step.to;
        if (e.kind === 'rail') last.stops++;
      } else {
        legs.push({
          carrier: car, line,
          from: step.from, to: step.to,
          km: e.km, min: m,
          stops: e.kind === 'rail' ? 1 : 0
        });
      }
    });
    const bus = legs.filter(l => l.carrier === 'bus');
    if (wait > 0 && bus.length) bus.forEach(l => { l.min += wait / bus.length; });
    else if (wait > 0) legs.forEach(l => { if (l.carrier === 'foot') { l.min += wait; wait = 0; } });
    // 站厅进出那 2.5 min 自己成不了一段，合进相邻的铁路段
    return legs.filter(l => l.km > 0.02 || l.carrier === 'rail');
  }

  function fare(mode, sum, phase) {
    if (mode === 'walk') return 0;
    if (mode === 'car') return Math.round(sum.car * 0.9 + 6);
    if (mode === 'taxi') {
      const base = 11 + Math.max(0, sum.taxi - 3) * 2.6;
      return Math.round(base * (phase === '夜' || phase === '深夜' ? 1.1 : 1));
    }
    let y = 0;
    if (sum.rail > 0) y += 2 + Math.min(7, Math.ceil(Math.max(0, sum.rail - 4) / 6));
    if (sum.bus > 0) y += 2 * sum.busRides;
    return y;
  }

  /** 体力。PLAN v2 写的是「移动 -10~30」，横穿全城靠车正好落在下沿，走路会痛 */
  function stamina(sum) {
    const v = sum.foot * 4 + sum.rail * 0.25 + sum.bus * 0.25 + sum.car * 0.12 + sum.taxi * 0.1;
    return Math.max(1, Math.round(v));
  }

  /**
   * 主入口。
   * 返回 null 表示这种方式到不了（比如只有隧道相连时的纯步行）。
   */
  function route(G, fromId, toId, mode, phase) {
    if (!fromId || !toId || fromId === toId) return null;
    const s = 'p:' + fromId, t = 'p:' + toId;
    if (!G.V.has(s) || !G.V.has(t)) return null;
    const r = dijkstra(G, s, t, mode);
    if (!r) return null;

    const legs = legsOf(G, r.path, mode);
    const sum = { foot: 0, bus: 0, rail: 0, car: 0, taxi: 0, busRides: 0 };
    let km = 0;
    legs.forEach(l => {
      sum[l.carrier] = (sum[l.carrier] || 0) + l.km;
      if (l.carrier === 'bus') sum.busRides++;
      km += l.km;
    });

    const min = r.min + MODE_OVERHEAD[mode];
    return {
      mode, ok: true,
      min: Math.round(min),
      km: Math.round(km * 10) / 10,
      yuan: fare(mode, sum, phase),
      stamina: stamina(sum),
      legs: legs.map(l => ({
        carrier: l.carrier,
        label: CARRIER_LABEL[l.carrier],
        line: l.line,
        fromLabel: G.V.get(l.from).label,
        toLabel: G.V.get(l.to).label,
        km: Math.round(l.km * 100) / 100,
        min: Math.max(1, Math.round(l.min)),
        stops: l.stops
      })),
      pts: [[G.V.get(s).x, G.V.get(s).y]].concat(r.path.map(st => {
        const v = G.V.get(st.to);
        return [v.x, v.y];
      }))
    };
  }

  /** 四种方式各跑一次，用来在 tab 上直接摆出四个时长做对比 */
  function routeAll(G, fromId, toId, phase) {
    const out = {};
    MODES.forEach(m => { out[m.id] = route(G, fromId, toId, m.id, phase); });
    return out;
  }

  /** 在地图上随手点一下，落到最近的地点上 */
  function nearest(nodeWorld, wx, wy, filter) {
    let best = null, bd = Infinity;
    Object.keys(nodeWorld).forEach(id => {
      if (filter && !filter(id)) return;
      const w = nodeWorld[id];
      const d = Math.hypot(w[0] - wx, (w[1] - wy) * R);
      if (d < bd) { bd = d; best = id; }
    });
    return best ? { id: best, km: bd * KM_PER_UNIT } : null;
  }

  window.CITY_NET = {
    R, KM_PER_UNIT, kmOf,
    WATER, WAYS, METRO, MODES, SPEED, LINKS,
    build, route, routeAll, nearest,
    /** 供渲染取线色 */
    lineOf: id => METRO.find(l => l.id === id) || null
  };
})();
