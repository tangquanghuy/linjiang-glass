(()=>{
const MAP_REV='20260826-opening-tablet-ime-v20';
const DEFAULT_MAP=`./city/plate_map.html?mode=opening&v=${MAP_REV}`;
const MAP_URL=new URLSearchParams(location.search).get('map')||DEFAULT_MAP;
const STEPS=['关于你','住所与工作','我推的主播','自定义主播','确认'];
const LAST_STEP=STEPS.length;
const TOUCH_DEVICE=/android|iphone|ipad|ipod/i.test(String(navigator.userAgent||''))
  || (Number(navigator.maxTouchPoints||0)>0&&!!matchMedia?.('(pointer: coarse)')?.matches);
if(TOUCH_DEVICE)document.documentElement.classList.add('touch-device');
function focusTouchEditor(event){
  if(!TOUCH_DEVICE)return;
  const target=event.target&&event.target.closest&&event.target.closest('textarea,input:not([type=file]):not([type=range]):not([type=button])');
  if(!target||target.disabled||target.readOnly)return;
  try{target.focus({preventScroll:true})}catch(_){try{target.focus()}catch(__){}}
}
document.addEventListener('touchstart',focusTouchEditor,{capture:true,passive:true});
document.addEventListener('pointerdown',event=>{if(event.pointerType==='touch')focusTouchEditor(event)},true);
const ART_HOST='https://anchor.bolt.qzz.io';
const art=(folder,file)=>ART_HOST+'/'+encodeURIComponent(folder)+'/'+encodeURIComponent(file)+'.webp';
/* 固定主播池。名字／牌子名／直播档／封面文件名对齐 外部部署/V20260826/正文美化.html 的
   LR_HOSTS，住所对齐 酒馆变量/变量初始化。

   followers 是唯一的作者定值，底盘热度和大航海全部由它反解出来（tierOfFollowers
   → streamScale），跟自定义主播走同一条曲线、同一套换算。这里不再单独存热度：
   存两份就一定会漂，而且哪份是准的没人说得清。

   顺带作废：正文美化.html 里的 LR_HOSTS.pop 是旧的一张手写热度表，跟这里推出来的
   对不上（璃亚梦 6310 vs 1390、红蔷薇 2800 vs 12400），要换成从粉丝数推的值。

   这七位的 粉丝数 最终该由 酒馆变量/变量初始化 写进 MVU，这一页只负责显示和挑选。 */
const OSHI=[
{name:'塔菲',cover:'塔菲',medal:'雏草姬',slot:'晚间主档 20:00–23:30',area:'西洲区 · 云庭公寓',tags:['杂谈','游戏'],followers:550000,blurb:'抽象系头部主播，夹子音开麦、满嘴贴吧黑话，弹幕节奏最快的那一间。'},
{name:'红蔷薇',cover:'红蔷薇',medal:'亲爱的',slot:'黄昏音乐台 19:00–22:00',area:'西洲区 · 西洲永初里',tags:['唱歌','舞蹈','杂谈'],followers:400000,blurb:'不死鸟剧院的舞者，兼职开播，说话像在台上念独白。'},
{name:'东雪莲',cover:'东雪莲',medal:'棺人痴',slot:'深夜杂谈 21:30–00:30',area:'鼓岭区 · 云庭公寓',tags:['杂谈','唱歌'],followers:300000,blurb:'做原创音乐的深夜档，脾气直，跟黑粉对线从不含糊。'},
{name:'沙花叉',cover:'沙花叉',medal:'饲养员',slot:'历史常用晚间档 21:00–00:30',area:'明湖区 · 明湖云阙',tags:['杂谈','唱歌','游戏'],followers:150000,blurb:'慵懒声线的清扫屋，开播随缘，来了就是一整晚。'},
{name:'时雨羽衣',cover:'时雨羽衣',medal:'雨户',slot:'周更型 22:00–00:30',area:'鼓岭区 · 梧桐里',tags:['绘画','杂谈'],followers:130000,blurb:'画师主播，一周只播两三次，播了就是长夜画稿加碎嘴。'},
{name:'斯黛拉',cover:'斯黛拉',medal:'小猪',slot:'傍晚电台 18:30–21:30',area:'落霞区 · 学府七舍天台',tags:['ASMR','杂谈'],followers:90000,blurb:'声音又轻又小的女学生，凌晨那段哄睡 ASMR 是招牌。'},
{name:'璃亚梦',cover:'梦见璃亚梦',medal:'病友',slot:'深夜互动 23:00–02:00',area:'鼓岭区 · 云庭公寓',tags:['杂谈','唱歌'],followers:60000,blurb:'炎上体质的偶像兼主播，深夜小作文和突发开播都是常事。'}];
const OSHI_MAX=1;
const OSHI_FAVOR=300;    // 选中即加的好感，叠在 变量初始化 给的 80 上
const CUSTOM_INITIAL_FAVOR=80; // 自定义主播与普通已定稿主播使用相同的基础好感
const OSHI_BADGE=8;      // 目标牌子等级
/* 牌子等级是 累计打赏 的函数，不是独立字段：辅助计算脚本.js 每次变量更新都会用
   floor(20*(打赏/200000)^(1/3.5)) 重算它。想稳定拿到 8 级，只能把打赏写成
   反解出来的那个数——8100 正好落在 8 级的下沿。 */
const OSHI_TIPPED=8100;
/* 初始住宅只存在于这里，不进《地图静态资料》——玩家换房永远是往上换，
   把 1400~3900 这一档挂给 AI 只会让它建议玩家搬去更差的地方。
   name / fullName / district 必须和 city/city_mapdata.js 的节点逐字一致（节点重构V3 之后的名字），
   否则 openingPayload 写出去的 位置.区域 与 居住地 在地图和状态栏里都定位不到。
   分隔符是「 · 」，跟 变量更新规则 的 区域格式 对齐，不能用斜杠。 */
const HOMES=[
{id:'lx_share',name:'文汇新村合租公寓',fullName:'落霞区 · 文汇新村合租公寓',district:'落霞区',tenure:'合租',note:'大学城南的两居合租，租金低，隔音一般',rent:1800,deposit:3600,cost:'月租 RMB 1,800 / 押二付一'},
{id:'pj_apt',name:'泊寓青年社区',fullName:'雨石与浦江区 · 泊寓青年社区',district:'雨石与浦江区',tenure:'租住',note:'园区外的小户型人才公寓，适合园区通勤',rent:2600,deposit:5200,cost:'月租 RMB 2,600 / 押二付一'},
{id:'gl_yunting',name:'鼓岭云汀私厨',fullName:'鼓岭区 · 鼓岭云汀私厨',district:'鼓岭区',tenure:'租住',note:'竹林私厨后院分租的独立厢房，安静，离老城配套近',rent:3200,deposit:6400,cost:'月租 RMB 3,200 / 押二付一'},
{id:'xz_jiayuan',name:'西洲滨江大平层',fullName:'西洲区 · 西洲滨江大平层',district:'西洲区',tenure:'租住',note:'滨江大平层里分租出来的主卧，楼下就是直播产业带',rent:3900,deposit:7800,cost:'月租 RMB 3,900 / 押二付一'},
{id:'gl_wutong',name:'梧桐里花园洋房',fullName:'鼓岭区 · 梧桐里花园洋房',district:'鼓岭区',tenure:'租住',note:'老洋房里隔出来的步行房，生活方便，楼梯和邻里声较近',rent:2200,deposit:4400,cost:'月租 RMB 2,200 / 押二付一'},
{id:'pj_village',name:'浦江老街自建房',fullName:'雨石与浦江区 · 浦江老街自建房',district:'雨石与浦江区',tenure:'租住',note:'城中村自建房单间，租金最低，离园区近，公共空间紧凑',rent:1500,deposit:3000,cost:'月租 RMB 1,500 / 押二付一'},
{id:'wx_home',name:'乌溪康养中心',fullName:'乌溪区 · 乌溪康养中心',district:'乌溪区',tenure:'自有',note:'自家开的小型中医康养理疗馆，前店后住，无月租',rent:0,deposit:0,cost:'自有房产 / 无月租'},
{id:'mh_youth_apt',name:'明湖青年公寓',fullName:'明湖区 · 明湖青年公寓',district:'明湖区',tenure:'租住',note:'城区小单间，公交和生活配套方便',rent:3200,deposit:3200,cost:'月租 RMB 3,200 / 押一付一'},
{id:'dt_town_rental',name:'东塘镇口出租屋',fullName:'东塘区 · 东塘镇口出租屋',district:'东塘区',tenure:'租住',note:'镇口低租单间，生活成本低但进城较远',rent:1400,deposit:1400,cost:'月租 RMB 1,400 / 押一付一'},
{id:'qp_foothill_share',name:'青屏山脚合租院',fullName:'青屏山风景区 · 青屏山脚合租院',district:'青屏山风景区',tenure:'合租',note:'独立卧室、共用厨房，末班公交较早',rent:1800,deposit:1800,cost:'月租 RMB 1,800 / 押一付一'},
/* 下面五处补的是"住得起但住法不一样"的档：原来十处清一色是合租／整租／自有，
   开局的经济处境只有贵和便宜两种读法。这五种各自带明确代价——舱位没有私人空间、
   民宿和客栈是旅居身份、帮工房拿房租换劳动、驿站铺位跟着货运作息，
   都在《收入与物价规则》第四节"合租与借住 700~2000"这一档里，不是白送的房子。 */
{id:'lx_capsule',name:'星宿24h太空舱',fullName:'落霞区 · 星宿24h太空舱',district:'落霞区',tenure:'舱位',note:'胶囊舱按月租的铺位，最便宜，只有一张床和一个柜子，洗漱全公用',rent:900,deposit:900,cost:'月租 RMB 900 / 押一付一'},
{id:'dt_stay',name:'竹里馆古宅民宿',fullName:'东塘区 · 竹里馆古宅民宿',district:'东塘区',tenure:'长包',note:'民宿淡季长包的一间厢房，院子安静，旺季要腾房，进城很远',rent:2000,deposit:2000,cost:'月租 RMB 2,000 / 押一付一'},
{id:'wx_inn',name:'水岸枕河居客栈',fullName:'乌溪区 · 水岸枕河居客栈',district:'乌溪区',tenure:'包月',note:'老巷临水客栈包月的二楼客房，推窗是河，隔壁住客换得勤',rent:1900,deposit:1900,cost:'月租 RMB 1,900 / 押一付一'},
{id:'qp_farm',name:'林下柴火农家乐',fullName:'青屏山风景区 · 林下柴火农家乐',district:'青屏山风景区',tenure:'帮工房',note:'农家乐后院的帮工房，含三餐，代价是早晚要搭手干活，末班车很早',rent:800,deposit:800,cost:'月租 RMB 800 / 押一付一 / 含三餐'},
{id:'pj_nightshift',name:'临港司机驿站',fullName:'雨石与浦江区 · 临港司机驿站',district:'雨石与浦江区',tenure:'铺位',note:'货运司机驿站的长租铺位，通宵有人进出，离园区和码头都近',rent:700,deposit:700,cost:'月租 RMB 700 / 押一付一'}];
/* place 是要写进 工作.地点 的字符串，必须是「{行政区} · {地图节点名}」且节点名与
   city_mapdata.js 逐字一致，不然《地图加载》算不出通勤、状态栏也判不出"是否到岗"。 */
const JOBS=[
{name:'暂时无业',place:null,node:null,monthly:0,daily:0,hours:'自由安排',kind:'free'},
{name:'打印店店员',place:'落霞区 · 图文天下24h快印',node:'lx_print',monthly:4500,daily:205,hours:'09:00-18:00',kind:'service'},
{name:'快递驿站店员',place:'鼓岭区 · 菜鸟驿站老街店',node:'gl_parcel',monthly:4800,daily:220,hours:'08:30-18:30',kind:'service'},
{name:'便利店店员',place:'明湖区 · 罗森24h便利店',node:'mh_mart',monthly:4700,daily:215,hours:'14:00-22:00',kind:'service'},
{name:'电竞舱值班员',place:'西洲区 · 星芒次元电竞舱',node:'xz_esports',monthly:5200,daily:235,hours:'16:00-00:00',kind:'live'},
{name:'加油站夜班店员',place:'东塘区 · 东塘加油站洗车房',node:'dt_gas',monthly:5600,daily:255,hours:'20:00-06:00',kind:'service'},
{name:'录音棚助理',place:'西洲区 · 极光专业声学工坊',node:'xz_sound_studio',monthly:5400,daily:245,hours:'11:00-20:00',kind:'live'},
{name:'剧院场务',place:'西洲区 · 西洲保利大剧院',node:'xz_theatre',monthly:4600,daily:210,hours:'13:00-22:00',kind:'live'},
{name:'宠物诊疗所助理',place:'鼓岭区 · 芭比堂宠物医院',node:'gl_pet',monthly:5000,daily:225,hours:'10:00-19:00',kind:'medical'},
{name:'医院前台助理',place:'明湖区 · 市第一人民医院',node:'mh_hospital',monthly:5800,daily:260,hours:'08:00-17:00',kind:'medical'},
{name:'实验楼值班助理',place:'落霞区 · 高分子重点实验楼',node:'lx_lab',monthly:6000,daily:270,hours:'18:00-02:00',kind:'academy'},
{name:'研创园行政助理',place:'雨石与浦江区 · 浦江研创园',node:'ys_rdpark',monthly:6200,daily:280,hours:'09:30-18:30',kind:'office'},
{name:'扎染作坊学徒',place:'乌溪区 · 江南扎染非遗工坊',node:'wx_dye',monthly:4200,daily:190,hours:'10:00-19:00',kind:'craft'},
/* 下面十二个把每个城区补到 3 个岗位。原来青屏山一个都没有、东塘乌溪浦江各只有一个，
   开局挑住处时等于"选了这几个区就别想就近上班"，通勤卡永远是跨城那一档。
   月薪全部落在《收入与物价规则》第三节的开局区间 4000~6000，daily = monthly÷22
   四舍五入到 5 或 10（第一节的折算口径），最高最低差不到一倍。
   全部挂在既有节点上——新增节点要给坐标并接进路网，check-net 会查连通性，不值当。 */
{name:'奥莱店铺导购',place:'东塘区 · 杉杉奥特莱斯',node:'dt_outlet',monthly:4300,daily:195,hours:'10:00-19:00',kind:'service'},
{name:'航站楼地服引导员',place:'东塘区 · 临江机场T2航站楼',node:'dt_airport',monthly:5200,daily:235,hours:'06:00-14:00',kind:'service'},
{name:'茶馆跑堂',place:'乌溪区 · 临水居老茶馆',node:'wx_teahouse',monthly:4000,daily:180,hours:'09:00-18:00',kind:'service'},
{name:'实景剧场NPC演员',place:'乌溪区 · 迷雾剧社实景剧场',node:'wx_script',monthly:4800,daily:220,hours:'14:00-23:00',kind:'live'},
{name:'影城放映助理',place:'明湖区 · 万达影城IMAX巨幕',node:'mh_cinema',monthly:4400,daily:200,hours:'12:00-21:00',kind:'service'},
{name:'食堂帮厨',place:'落霞区 · 大学城第一食堂',node:'lx_canteen',monthly:4100,daily:185,hours:'06:00-14:00',kind:'service'},
{name:'高铁站务引导员',place:'雨石与浦江区 · 临江南站高铁枢纽',node:'ys_station',monthly:5000,daily:225,hours:'07:00-16:00',kind:'service'},
{name:'生煎馆早班帮工',place:'雨石与浦江区 · 老张生煎馆',node:'pj_morning',monthly:4300,daily:195,hours:'05:00-13:00',kind:'service'},
{name:'游客中心咨询员',place:'青屏山风景区 · 青屏山游客中心',node:'qp_visitor',monthly:4500,daily:205,hours:'08:30-17:30',kind:'service'},
{name:'索道值守员',place:'青屏山风景区 · 青屏山全景索道',node:'qp_cable',monthly:4700,daily:215,hours:'08:00-17:00',kind:'service'},
{name:'半山茶舍服务员',place:'青屏山风景区 · 半山听松古茶舍',node:'qp_teahouse',monthly:4200,daily:190,hours:'09:00-18:00',kind:'service'},
{name:'洋房咖啡师',place:'鼓岭区 · 青砖记洋房咖啡',node:'gl_cafe',monthly:4600,daily:210,hours:'08:00-17:00',kind:'craft'}];
const CATEGORIES=['杂谈','游戏','唱歌','ASMR','绘画','舞蹈','户外','美食','虚拟主播','综合内容'];
const STREAMER_THEMES=[
{id:'',label:'自动',source:'按姓名固定分配',swatch:'linear-gradient(135deg,#ff3d9a,#27d7ff,#9b5cff,#ffd12f,#42e6a4)'},
{id:'rose',label:'桃粉',source:'塔菲配色',swatch:'#ff3d9a'},
{id:'ice',label:'冰蓝',source:'东雪莲配色',swatch:'#27d7ff'},
{id:'violet',label:'紫罗兰',source:'斯黛拉配色',swatch:'#9b5cff'},
{id:'gold',label:'金色',source:'时雨羽衣配色',swatch:'#ffd12f'},
{id:'crimson',label:'绯红',source:'沙花叉配色',swatch:'#ff355d'},
{id:'scarlet',label:'橙红',source:'红蔷薇配色',swatch:'#ff7a2f'},
{id:'candy',label:'薄荷',source:'璃亚梦配色',swatch:'#42e6a4'}];
const STREAMER_THEME_IDS=new Set(STREAMER_THEMES.map(x=>x.id));
function normalizeStreamerTheme(value){value=String(value||'').trim().toLowerCase();return STREAMER_THEME_IDS.has(value)?value:''}
const FREE_OPENING_DETAIL=[
'玩家刚结束一天的工作，回到家中。',
'简单收拾之后，玩家打开直播平台，进入自己关注的{{目标主播}}直播间。',
'从一次普通、自然的直播观看与弹幕互动开始，后续剧情自由发展。'
].join('\n');
const OPENING_ONE_DETAIL=[
'> 结束一天的奔波后，玩家带着尚未散去的疲惫回到自己的落脚处。',
'> 简单收拾后打开手机，屏幕里熟悉的{{目标主播}}正就着简陋的麦克风与弹幕闲聊。',
'> 临近午夜，耳机里传来她“中途离开几分钟去取急件”的交代，背景里是椅子拖动的摩擦声与门锁轻响。',
'> 玩家也因临时需要短暂外出。',
'> 在夜色与仍未熄灭的灯光之间，一个穿着宽松常服、踩着拖鞋正费力辨认快递单号的身影映入眼帘——那张被冷白灯光照亮的素颜，以及低声报出取件码的声线，与几分钟前耳机里的回响分毫不差。',
'```text',
'### 完整开局大纲',
'',
'#### 【第一幕：沉闷的都市现实与线上的赛博温床】',
'- 节点 1：一天结束后的肉体疲惫',
'  - 情节：交代玩家结束一天行程后的日常状态。写实刻画身体的疲惫感与卸下白天社会人格后的松弛，但不指定玩家的职业、居住环境、城区、通勤路线或任何具体地点。',
'  - 细节：简单洗漱、喝水、放下随身物品，让身体从白天的紧绷里慢慢退出来。',
'- 节点 2：进入直播间与单向注视',
'  - 情节：玩家打开直播平台，进入目标主播{{目标主播}}的直播间。弹幕飞速滚动，主播正开着虚拟形象进行日常杂谈或下播前的碎碎念。',
'  - 细节：还原真实的管人圈生态（念SC、跟弹幕互怼、因设备杂音或网速卡顿的轻微抱怨）。玩家作为千百条弹幕中不起眼的“路人白嫖怪/普通牌子粉”，体会着单向窥视的安全感与距离感。',
'',
'#### 【第二幕：现实与虚拟的微妙重叠】',
'- 节点 3：突发的暂离借口与时空同步',
'  - 情节：{{目标主播}}在麦克风前忽然叹气，表示收到了催取件的短信（生鲜/贵重设备/生活必需品），宣布“切个暂离垫乐，五分钟后回来”，随后听到现实中推开房门、走廊拖鞋声的微弱底噪。',
'  - 细节：直播间弹幕开始刷“主播去哪了”、“速去速回”、“是不是偷偷去吃宵夜”。',
'- 节点 4：玩家短暂外出与动线交汇',
'  - 情节：玩家因口渴、烟瘾或其他临时需求，顺手抓起手机和钥匙短暂外出。不要指定玩家从什么住宅出发，也不要写死要前往的具体店铺或地点。',
'  - 细节：夜晚的风声与手机后台隐约播放的直播间垫乐形成奇妙对照。',
'',
'#### 【第三幕：现实照面的失真对撞（核心高潮）】',
'- 节点 5：毫无防备的视线聚焦',
'  - 情节：在取件动线附近，玩家看见一个戴着兜帽或简单扎着头发的年轻女性。不要写死偶遇发生在哪一家店、哪条街或哪个城区。',
'  - 视觉白描：冷白灯光斜切在她脸上，勾勒出与动捕虚拟形象一模一样的五官轮廓（泪痣/脸型/下颌线），身上穿着极度居家的旧宽松T恤与短裤，双腿修长白皙却踩着不合脚的拖鞋，毫无镜头前的偶像包袱。',
'- 节点 6：声音的绝对实锤与心理震颤',
'  - 情节：她正一边揉着脖颈，一边用那辨识度极高、刚刚还在耳机里回荡的独特声线，略带不耐烦地报出手机尾号：“尾号XXXX，一个大箱子。”',
'  - 心理张力：玩家的手指僵在冰凉的易拉罐拉环或随手拿起的物品上。没有神仙特效，没有戏剧化的音乐，只有“原来万众瞩目的那个人，此刻就以最普通的样子出现在眼前”的巨大荒谬与隐秘快感。',
'',
'#### 【第四幕：试探、擦肩与隐秘的锁链】',
'- 节点 7：第一次近距离接触与掩饰',
'  - 情节：两人在有限的通行空间里错身而过。她抱着沉重的快递箱，因为箱体遮挡视线险些撞上玩家，下意识轻呼并道歉；玩家顺势搭手帮她托了一下箱底，产生极短暂的皮肤/指尖接触。',
'  - 角色反应：对方维持着普通人面对陌生人的戒备与客套，抱着快递很快离开玩家的视线。',
'- 节点 8：余波与游戏主线切入',
'  - 情节：玩家回到自己的落脚处，重新打开手机屏幕。耳机里传来她气喘吁吁重新坐回椅子上的动静，直播间画面亮起：“呼……累死了，刚才那个箱子好沉，差点摔倒。”',
'  - 收尾定调：看着弹幕刷过去的“辛苦了”、“主播多喝热水”，玩家看着自己刚刚碰到她箱底和手腕的指尖，彻底打破了屏幕内外的单向认知，正式拉开线下交集与后续隐秘互动的序幕。',
'```'
].join('\n');
const OPENING_TWO_DETAIL=[
'> 连续数日的机械式日常与屏幕劳碌，积压着难以言说的空虚与浮躁。',
'> 屏幕另一端的{{目标主播}}在结束了漫长的杂谈后，伸着懒腰向弹幕随口交代了一句“下午有点私事要出门透气”，随后光速切断了推流。',
'> 玩家合上直播窗口，无聊地刷着同城约会软件的动态广场。一条刚刚发布的极简动态跃入眼帘——没有露全脸，只有一张戴着帽子、遮住大半面容的侧影自拍与略带烦躁的文字：【刚忙完，想找人出门走走，不查户口的来】。',
'> 怀着排遣无聊的心态，玩家随手发去了私信，竟意外收到了秒回的碰面信息。',
'> 当玩家如约抵达约定的碰面位置，看着那个戴着严实口罩、缩着肩膀快步走来的娇小身影时，她拉下半截口罩警惕四顾露出的眉眼，以及开口压低声音对暗号的第一句话，让玩家的思维瞬间陷入了停滞——那张毫无修饰的面孔与原汁原味的声线，分毫不差地击碎了刚刚才在直播间关闭的虚拟投影。',
'```text',
'### 完整开局大纲',
'',
'#### 【第一幕：隐秘渴求与投石问路（暗线伏笔）】',
'- 节点 1：高压日常与私密宣泄的空缺',
'  - 情节：{{目标主播}}在独处空间内经历漫长赶工或直播后的极度疲惫，伴随着难以排解的生理/心理空虚（如独自宣泄无法获得满足、被公众形象深度绑架的窒息感）。',
'  - 动机：迫切渴望在不暴露真实身份的前提下，以“普通女人”的身份与一个完全不知道自己是谁的陌生人发生纯粹的现实接触。',
'- 节点 2：备用小号的同城动态',
'  - 情节：{{目标主播}}切换到从未公开的同城社交软件小号，发布了一条带着模糊侧影自拍与定位的简短动态，怀着紧张、羞耻与刺激的心态等待回应。',
'',
'#### 【第二幕：赛博错位与盲盒接线（玩家视角）】',
'- 节点 3：直播间的“出门请假条”',
'  - 情节：玩家在观看{{目标主播}}的日常直播时，听到她在下播前向弹幕随口提及“下午/晚点要出门办点私事”，弹幕如常刷着“注意安全”、“去吃大餐”后黑屏。',
'- 节点 4：动态广场的偶然匹配',
'  - 情节：玩家退出直播后随手刷同城软件，刚好刷到了那条刚发出的带定位动态。',
'  - 盲盒状态：玩家完全不知道对方的真实身份，仅被照片中展露的体态轮廓与神秘感吸引，顺手发送了打招呼的私信；双方迅速敲定了附近的碰面位置。',
'',
'#### 【第三幕：约见与失真重叠（核心高潮）】',
'- 节点 5：赴约与戒备观察',
'  - 情节：玩家准时到达约定的碰面位置。一个全副武装（帽子、口罩、宽松常服）的身影战战兢兢地出现，四下张望确认没有熟人。不要写死约见发生在哪条街、哪家店或哪个城区。',
'- 节点 6：口罩滑落与声线暴击（绝对实锤）',
'  - 视觉冲击：对方快步走近，在背光或拉下口罩透气的瞬间，露出了毫无滤镜修饰的素颜。标志性的眼眸轮廓、鼻梁弧度与脸型，让玩家当场产生强烈的既视感。',
'  - 听觉实锤：她压低嗓音略带紧张地开口确认身份：“……是你吗？先离开这，别站在显眼的地方。”那极具辨识度、几十分钟前还在耳机里回响的独特音色，直接坐实了对方正是刚刚下播的{{目标主播}}本人。',
'- 节点 7：极度反差与心理震荡',
'  - 心理张力：万众瞩目、在直播间里被无数粉丝奉为偶像/难以触及的角色，此刻正作为一个毫无防备、有些局促不安的普通女孩站在玩家面前，甚至主动拉着玩家的衣角快步离开显眼区域。',
'',
'#### 【第四幕：暗流涌动与私密契约（剧情切入）】',
'- 节点 8：心照不宣的伪装同行',
'  - 情节：对方完全以为玩家只是个普通的同城路人，一边抱怨着生活压力，一边提出去更私密的地方坐坐，甚至做出轻微越界的肢体试探。',
'```'
].join('\n');
const OPENING_THREE_DETAIL=[
'> 清晨的老洋房还浸在薄薄的晨光里。玩家在自己的落脚处阳台通风纳凉，楼上则隐约传来洗漱与推拉晾衣架的声响。',
'> 一阵晨风掠过，一件刚甩干、带着一丝温热与独特洗剂香气的衣物从上方坠落，不偏不倚地蒙在玩家脸上。玩家扯下衣物后发现，它特殊的款式、专属色系与蕾丝刺绣细节，竟与平时见过的{{目标主播}}专属风格高度重叠。',
'> 正上方随即传来衣架落地的脆响、拖鞋踩过木地板的凌乱脚步，以及一道被刻意压低却异常熟悉的懊恼轻呼。玩家抬头时，正好撞上扶着栏杆向下搜寻的女孩；晨光里的素颜轮廓与失控时脱口而出的招牌声线，共同坐实了她的身份。',
'> 片刻后，她不得不跑下楼完成这场尴尬的归还交接。门扉重新关上，楼板另一侧的真实生活动静仍清晰可闻，作为普通观众的距离感也被这件从天而降的私密物彻底打破。',
'```text',
'### 完整开局大纲',
'',
'#### 【第一幕：老洋房的清晨与从天而降的私密物】',
'',
'- 节点 1：老洋房晨间日常与空间建立',
'',
'  - 情节：清晨时分，玩家在落脚处的阳台通风纳凉或整理琐碎。通过对老式木窗、铁艺栏杆与纵向阳台交叠结构的白描，确立“上下楼邻里动静清晰可闻、极易发生意外交集”的物理空间基础。',
'  - 细节：玩家享受着难得的片刻清闲，楼上隐约传来洗漱与推拉晾衣架的微弱金属摩擦声。',
'',
'- 节点 2：高空坠物与视线剥夺',
'',
'  - 情节：一阵晨风掠过，一件刚甩干、带有一丝温热与独特洗剂香气的衣物从上方晾衣绳脱落，不偏不倚正好蒙在玩家脸上。',
'  - 细节：纯粹的感官特写——布料的触感、极具个性的剪裁与色彩搭配，带来荒谬与猝不及防的生理刺激。',
'',
'#### 【第二幕：细节锚定与线上线下的微妙重合】',
'',
'- 节点 3：款式的视觉确认与既视感',
'',
'  - 情节：玩家扯下蒙在脸上的衣物，定睛观察。其特殊的款式、专属色系搭配或独特的蕾丝刺绣细节，与平时在直播、动态或周边照片中见过的{{目标主播}}专属风格产生高度重叠。',
'  - 细节：玩家产生强烈的既视感与认知冲击——这绝非大众量贩款，但玩家维持理性与克制，并未直接得出结论，而是处于“高度怀疑与荒诞”的悬疑状态。',
'',
'- 节点 4：楼上的慌乱声响与时空锁定',
'',
'  - 情节：与此同时，正上方阳台骤然传来衣架掉落的脆响，紧接着是拖鞋急促踩过木地板的凌乱脚步声，以及隐约压低嗓音的懊恼轻呼。',
'  - 细节：声音的音色与平日直播间里听到的声线产生第一层物理重叠，上方阳台边缘隐约探出试图向下张望的影子。',
'',
'#### 【第三幕：阳台对峙与现实真容的初次捕获（核心高潮）】',
'',
'- 节点 5：下意识的抬头与视线交汇',
'',
'  - 情节：玩家捏着衣物抬头望向斜上方，正好撞上正扶着栏杆、探出半个身子焦急搜寻的女孩。',
'  - 视觉白描：晨光斜切在她未施粉黛的脸上，勾勒出与动捕虚拟形象几乎完全一致的五官轮廓（眼型、鼻梁与下颌线条）；她身穿凌乱宽松的居家睡衣，头发随意挽起，毫无镜头前精心打光后的偶像包袱。',
'',
'- 节点 6：绝对社死与声线的现场证实',
'',
'  - 情节：视线在半空中死死撞在一起。对方看清了玩家手中正捏着的贴身物件，瞬间破防，原本试图掩饰的声线彻底失控，脱口而出极具个人特色的慌乱质问或惊叫，与直播间里的招牌反应如出一辙。',
'  - 心理张力：屏幕里万众瞩目的虚拟偶像，此刻在现实中因一件掉落的内裤陷入社死与窘迫。',
'',
'#### 【第四幕：交涉、归还与隐秘锁链的形成】',
'',
'- 节点 7：楼道交接与防线试探',
'',
'  - 情节：对方被迫蹬蹬蹬跑下楼梯敲门，或在楼梯拐角完成交接。两人面对面站立，物理距离拉近到一米之内。',
'  - 细节：她努力维持普通邻里间的客气，试探玩家是否已经认出自己；玩家则在克制、装作若无其事与暗中确认身份之间寻找回应。',
'',
'- 节点 8：余波回荡与隐秘同盟的契机',
'',
'  - 情节：交接结束，门扉关上。玩家回到房间，听到楼上再次传来关门的闷响。',
'  - 收尾定调：玩家看着自己刚才接触过布料与对方指尖的手，听着楼上隔板传来的真实生活动静，彻底打破了作为普通观众的距离感，线上与线下之间也形成了一个只有双方知晓的隐秘契机。',
'```'
].join('\n');
const OPENINGS=[
{id:'opening-1',title:'回家看直播',summary:'玩家结束一天的工作，回家进入关注主播的直播间。',detail:FREE_OPENING_DETAIL},
{id:'opening-2',title:'意外碰面',summary:'一次短暂离开直播间的取件，让线上注视与线下现实意外重叠。',detail:OPENING_ONE_DETAIL},
{id:'opening-3',title:'小号约见',summary:'玩家在同城软件上偶然约到刚刚下播的目标主播。',detail:OPENING_TWO_DETAIL},
{id:'opening-4',title:'天降之物',summary:'老洋房阳台的一件私密衣物意外坠落，让玩家与楼上的目标主播第一次在现实中正面相遇。',detail:OPENING_THREE_DETAIL},
{id:'custom',title:'自定义开局',summary:'由玩家直接输入开局内容',detail:''}];
/* 人设不再是一组固定字段，而是一整段「角色详情」YAML —— 跟 世界书/红蔷薇、斯黛拉、
   璃亚梦 同格式，生成和写入照 参考/底部状态栏.html 的 人物详情生成 那一套。 */
const ARCHIVE_KEY='linjiang-opening-streamer-archives-v1';
const ARCHIVE_ART_MAX=1536*1024;
const state={step:1,gender:'男性',home:null,job:JOBS[0],mapTarget:'player',oshi:[],openingId:'opening-1',customOpeningText:'',openingTargetSignature:'',openingTarget:null,customs:[],activeCustomId:null,archives:[],archiveOpen:false,categories:new Set(['杂谈']),yaml:'',art:{type:'',src:''},streamerHome:null,streamerTheme:''};
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const value=id=>$(id).value.trim();
let toastTimer=0;
function toast(text){const el=$('#toast');el.textContent=text;el.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('on'),2200)}
/* ---- 体量模型 ----------------------------------------------------------
   玩家只拉一根「体量档位」滑杆（0–100），粉丝数／底盘热度／大航海全是它的函数。

   这段是 外部部署/V20260826/辅助计算脚本.js 里 streamScale 的镜像，公式必须一模一样：
   那边是运行时的唯一出处（LinjiangAux.streamScale），这一页是 GitHub Pages 上的
   独立页面、跨域拿不到酒馆的脚本，所以只能各放一份。改公式要同时改两处，
   scripts/shot-opening.mjs 会把两边的曲线都打出来对照。

   底盘热度取 50 × 8^(档位/25)，系数是拿 LR_HOSTS.pop 里七个已定稿的值反解定标的
   （时雨羽衣 1200 → 38 … 塔菲 18240 → 71）。粉丝／热度比随体量下降（60 → 18 倍），
   大航海按粉丝的 0.12% → 0.5%。

   注意「热度」有两个：底盘热度是常态值；本场热度是这场靠礼物堆的虚火，下播清零。
   玩家在直播间看到的 直播.热度 = 底盘热度 + 本场热度残留，开局未开播所以是 0。
   ------------------------------------------------------------------------ */
/* 不取整：滑杆给的是整数，但 tierOfFollowers 反解出来的是 0.1 精度的小数档 */
function clampTier(t){t=+t||0;return Math.max(0,Math.min(100,t))}
function tierLabel(t){return t<20?'小透明':t<40?'小有关注':t<60?'稳定主播':t<80?'热门主播':t<95?'头部主播':'现象级'}
function roundNice(n){n=Math.max(0,Math.round(+n||0));if(n>=100000)return Math.round(n/1000)*1000;if(n>=10000)return Math.round(n/100)*100;if(n>=1000)return Math.round(n/10)*10;return n}
function streamScale(t){t=clampTier(t);var base=50*Math.pow(8,t/25),followers=base*(60-0.42*t),guards=followers*(0.0012+0.000038*t);
  /* 提督、总督减去门槛再除，小房两档干净归零；比值比草稿更保守（24:1 / 260:1） */
  return{tier:t,label:tierLabel(t),followers:roundNice(followers),base:roundNice(base),guards:roundNice(guards),
    admirals:Math.max(0,Math.floor((guards-40)/24)),governors:Math.max(0,Math.floor((guards-300)/260))}}
/* 粉丝数 → 档位。七位已定稿主播存的是粉丝数（作者给的权威值），底盘热度和大航海
   要能从它一致地推回来。曲线单调，扫 0–100 取最近的 0.1 档就够，比解析求逆好读。 */
function tierOfFollowers(followers){var target=Math.max(0,+followers||0),best=0,gap=Infinity;
  for(var t=0;t<=100;t+=0.1){var d=Math.abs(streamScale(t).followers-target);if(d<gap){gap=d;best=t}}
  return Math.round(best*10)/10}
function scaleOfFollowers(followers){return streamScale(tierOfFollowers(followers))}
function bigNum(n){n=Math.max(0,Math.round(+n||0));return n>=10000?(Math.round(n/1000)/10).toFixed(1).replace(/\.0$/,'')+'万':n.toLocaleString('en-US')}
function renderSteps(){document.querySelector('#steps').innerHTML=STEPS.map(function(step,i){var n=i+1;return '<button class="step-tab '+(state.step===n?'active ':'')+(state.step>n?'done ':'')+(skipStep(n)?'skipped':'')+'" data-step="'+n+'"><span>0'+n+'</span><b>'+step+'</b></button>'}).join('');document.querySelectorAll('.step-tab').forEach(function(b){b.onclick=function(){go(+b.dataset.step,true)}})}
function homeCostText(h){return h&&h.cost||'费用待确认'}
let openingMapStarted=false;
function ensureOpeningMap(){var frame=document.querySelector('#opening-map-iframe');if(!frame||openingMapStarted)return;openingMapStarted=true;frame.addEventListener('load',function(){setTimeout(bindOpeningFrame,200)},{once:true});frame.src=MAP_URL+'&target=home'}
function openingMapApi(){try{var frame=document.querySelector('#opening-map-iframe');return frame&&frame.contentWindow.PLATE_MAP||null}catch(_){return null}}
function modalMapApi(){try{var frame=document.querySelector('#map-iframe');return frame&&frame.contentWindow.PLATE_MAP||null}catch(_){return null}}
function mapApi(){return openingMapApi()}
function quoteFor(job){if(!state.home||!job||!job.node)return null;var api=mapApi();if(!api||!api.quote)return null;try{var all=api.quote(state.home.id,job.node);return all&&(all.transit||all.walk||all.taxi)||null}catch(_){return null}}
function routeLabel(route){return route?route.min+' 分钟（单程） / '+route.km+' 公里 / 单程 RMB '+route.yuan:'等待地图路网'}
function jobCommuteText(job){if(!job||!job.node)return '无需固定通勤';var r=quoteFor(job);if(!state.home)return '选定住所后计算通勤';return r?'公交优先 / '+routeLabel(r):'当前住所暂未算出路线'}
function metric(label,value,sub){return '<div class="work-metric"><span>'+esc(label)+'</span><b>'+esc(value)+'</b>'+(sub?'<small>'+esc(sub)+'</small>':'')+'</div>'}
function workMetricsHtml(job,route){var employed=job&&job.monthly;if(!employed)return '<div class="commute-head"><span>岗位与通勤</span><small>当前选择：暂时无业</small></div><div class="work-metrics">'+metric('月收入','无固定收入','可以从自由安排开始')+metric('班次','自由安排','没有固定上班时间')+metric('单程通勤','无需通勤','—')+metric('路线距离','—','—')+metric('单程交通费','—','—')+'</div>';var wait=state.home?(route?'':'路线计算中'):'先选住所';return '<div class="commute-head"><span>岗位与通勤</span><small>通勤按公交优先、单程估算</small></div><div class="work-metrics">'+metric('月收入','RMB '+job.monthly.toLocaleString()+' / 月','岗位固定月薪')+metric('班次',job.hours,'每天工作时段')+metric('单程通勤',route?route.min+' 分钟':wait,route?'每天往返约 '+(route.min*2)+' 分钟':'')+metric('路线距离',route?route.km+' 公里':wait,'住所到工作地点')+metric('单程交通费',route?'RMB '+route.yuan:wait,route?'往返约 RMB '+(route.yuan*2):'')+'</div>'}
function renderJobs(){var el=document.querySelector('#jobs');if(!el)return;el.innerHTML=JOBS.map(function(j,i){return '<button data-job="'+i+'">'+esc(j.name)+'</button>'}).join('');el.querySelectorAll('[data-job]').forEach(function(b){b.onclick=function(){setJob(JOBS[+b.dataset.job])}})}
function updatePickSummary(){var home=document.querySelector('#map-pick-home'),work=document.querySelector('#map-pick-work');if(home)home.textContent=state.home?state.home.name:'未选择';if(work)work.textContent=state.job&&state.job.monthly?state.job.name:'暂时无业'}
function updateHomeInspector(){var h=state.home;var name=document.querySelector('#home-name'),meta=document.querySelector('#home-meta'),cost=document.querySelector('#home-cost');if(!name)return;name.textContent=h?h.name:'尚未选择住所';name.classList.toggle('empty',!h);meta.textContent=h?h.fullName+' / '+h.tenure+' / '+h.note:'拖动地图查看其他城区；点击进入视口的粉色节点查看。';cost.textContent=h?homeCostText(h):'租金与押金将在这里显示';updatePickSummary()}
function updateWorkInspector(){var j=state.job,r=j&&j.monthly?quoteFor(j):null;var name=document.querySelector('#work-name');if(!name)return;name.textContent=j&&j.monthly?j.name:'暂时无业';document.querySelector('#work-meta').textContent=j&&j.place?j.place+(state.home?'':' / 选好住所后计算通勤'):'可以先选住所，也可以先挑工作；暂时无业同样可以继续。';document.querySelector('#commute-card').innerHTML=workMetricsHtml(j,r);updatePickSummary()}
function renderMapInspector(){updateHomeInspector();updateWorkInspector()}
function setOpeningTarget(target){state.mapTarget=target==='work'?'work':'player';var homeBtn=document.querySelector('#map-home-mode'),workBtn=document.querySelector('#map-work-mode');homeBtn.classList.toggle('on',state.mapTarget==='player');workBtn.classList.toggle('on',state.mapTarget==='work');document.querySelector('#map-mode-title').textContent=state.mapTarget==='work'?'挑一份开局工作':'挑一个开局住处';document.querySelector('#map-mode-hint').textContent=state.mapTarget==='work'?(state.home?'先比较月收入和班次，再看从当前住所出发的单程通勤。':'可以先挑岗位；选好住所后，通勤时间、距离和费用会自动补全。'):'拖动地图查看其他城区；点击粉色节点查看租金和住处特点。';var api=openingMapApi();try{if(api&&api.setOpeningTarget)api.setOpeningTarget(state.mapTarget==='work'?'work':'home');if(state.mapTarget==='work'&&state.home&&state.job&&state.job.node&&api)api.plan(state.job.node)}catch(_){}renderMapInspector()}
function setJob(job){if(!job)return;state.job=job;var api=openingMapApi();try{if(api&&state.home&&job.node)api.plan(job.node);else if(api&&api.clearTrip)api.clearTrip()}catch(_){}updateWorkInspector();toast(job.monthly?'已选择工作：'+job.name:'已选择暂时无业')}
function oshiOf(name){return OSHI.find(function(o){return o.name===name})||null}
function oshiPicked(){return state.oshi.map(oshiOf).filter(Boolean)}
function renderOshi(){var grid=document.querySelector('#oshi-grid');if(!grid)return;
  grid.innerHTML=OSHI.map(function(o){var on=state.oshi.indexOf(o.name)>=0,full=false;
    /* 推满之后剩下的卡只压暗、不 disabled：点了会给一句"先取消一个"，
       比一个没有反馈的死按钮好懂，键盘和读屏也照样能到。 */
    return '<button type="button" class="oshi-card'+(on?' on':'')+(full?' full':'')+'" data-oshi="'+esc(o.name)+'" aria-pressed="'+(on?'true':'false')+'">'
      /* 一共就七张封面，全部直接加载：loading="lazy" 在这里只会让下面几张
         在滚动到时才闪出来，省不下什么流量。 */
      +'<span class="oshi-art"><img src="'+esc(art('封面',o.cover))+'" alt="'+esc(o.name)+'立绘" loading="lazy" decoding="async"><i class="oshi-check" aria-hidden="true">✓</i></span>'
      +'<span class="oshi-body">'
      +'<span class="oshi-top"><b>'+esc(o.name)+'</b><i>'+esc(o.medal)+'</i></span>'
      +'<span class="oshi-slot">'+esc(o.slot)+'</span>'
      /* 粉丝数是存的，热度和大航海是推的——跟自定义主播同一条曲线 */
      +'<span class="oshi-scale">'+esc(scaleOfFollowers(o.followers).label)+' · 粉丝 '+bigNum(o.followers)+' · 热度 '+bigNum(scaleOfFollowers(o.followers).base)+'</span>'
      +'<span class="oshi-blurb">'+esc(o.blurb)+'</span>'
      +'<span class="oshi-tags">'+o.tags.map(function(t){return '<em>'+esc(t)+'</em>'}).join('')+'</span>'
      +'<span class="oshi-gain">好感 +'+OSHI_FAVOR+' · 已关注 · '+esc(o.medal)+' Lv.'+OSHI_BADGE+'</span>'
      +'</span></button>'}).join('');
  grid.querySelectorAll('[data-oshi]').forEach(function(btn){btn.onclick=function(){toggleOshi(btn.dataset.oshi)}});
  var count=document.querySelector('#oshi-count');if(count)count.textContent=state.oshi.length}
function toggleOshi(name){var i=state.oshi.indexOf(name),previous=state.oshi[0];
  if(i>=0){state.oshi=[];toast('已取消：'+name)}
  else{state.oshi=[name];toast((previous?'已改推：':'已推：')+name+' / 好感 +'+OSHI_FAVOR+' / '+oshiOf(name).medal+' Lv.'+OSHI_BADGE)}
  renderOshi()}
function selectedOpening(){var base=OPENINGS.find(function(o){return o.id===state.openingId})||OPENINGS[0];var detail=base.id==='custom'?(state.customOpeningText.trim()||'无'):base.detail;return{id:base.id,title:base.title,summary:base.summary,detail:detail,custom:base.id==='custom'}}
function openingTargetCandidates(){var fixed=oshiPicked().map(function(o){return{name:o.name,source:'固定主播'}}),customs=state.customs.map(normalizeCustom).filter(function(c){return c.name&&c.yaml}).map(function(c){return{name:c.name,source:'自定义主播'}});if(fixed.length&&customs.length)return fixed.concat(customs);if(fixed.length)return fixed;if(customs.length)return customs;return OSHI.map(function(o){return{name:o.name,source:'随机主播'}})}
function pickOpeningTarget(){var candidates=openingTargetCandidates(),signature=candidates.map(function(c){return c.source+':'+c.name}).join('|');if(state.openingTargetSignature!==signature||!state.openingTarget){state.openingTargetSignature=signature;state.openingTarget=candidates[Math.floor(Math.random()*candidates.length)]||null}return state.openingTarget}
function resolvedOpening(){var opening=selectedOpening();if(opening.id==='custom')return Object.assign({},opening,{targetStreamer:null});var target=pickOpeningTarget(),name=target?target.name:'随机主播';return Object.assign({},opening,{detail:opening.detail.split('{{目标主播}}').join(name),targetStreamer:target})}
function renderOpenings(){var current=selectedOpening(),index=Math.max(0,OPENINGS.findIndex(function(o){return o.id===current.id})),prev=OPENINGS[(index-1+OPENINGS.length)%OPENINGS.length],next=OPENINGS[(index+1)%OPENINGS.length];$('#opening-index').textContent=String(index+1).padStart(2,'0');$('#opening-total').textContent=String(OPENINGS.length).padStart(2,'0');$('#opening-title').textContent=current.title;$('#opening-summary').textContent=current.summary;$('#opening-prev-title').textContent=prev.title;$('#opening-prev-summary').textContent=prev.summary;$('#opening-next-title').textContent=next.title;$('#opening-next-summary').textContent=next.summary;$('#opening-dots').innerHTML=OPENINGS.map(function(_,i){return '<i class="'+(i===index?'on':'')+'"></i>'}).join('');$('#opening-slide').classList.toggle('custom',current.custom);$('#opening-picker').classList.toggle('custom-active',current.custom);$('#custom-opening-box').classList.toggle('hidden',!current.custom);$('#custom-opening-count').textContent=state.customOpeningText.length}
function selectOpening(id){if(!OPENINGS.some(function(o){return o.id===id}))return;state.openingId=id;renderOpenings()}
function shiftOpening(offset){var index=OPENINGS.findIndex(function(o){return o.id===state.openingId});index=(index+offset+OPENINGS.length)%OPENINGS.length;selectOpening(OPENINGS[index].id)}
function customId(){return'custom-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7)}
function cloneHome(home){return home?{id:home.id||'',name:home.name||'',fullName:home.fullName||'',district:home.district||'',tenure:home.tenure||'租住',note:home.note||'',rent:+home.rent||0,deposit:+home.deposit||0,cost:home.cost||''}:null}
function normalizeCustom(raw){raw=raw||{};var start=String(raw.hoursStart||''),end=String(raw.hoursEnd||'');if((!start||!end)&&raw.hours){var m=String(raw.hours).match(/^(\d{2}:\d{2})\s*-\s*(?:次日\s*)?(\d{2}:\d{2}|24:00)$/);if(m){start=m[1];end=m[2]==='24:00'?'00:00':m[2]}}var tier=clampTier(raw.tier??raw.scale?.tier??42),homeData=cloneHome(raw.homeData);return{id:raw.id||customId(),name:String(raw.name||''),handle:String(raw.handle||''),age:+raw.age||23,home:String(raw.home||(homeData&&homeData.fullName)||''),homeData:homeData,categories:Array.isArray(raw.categories)&&raw.categories.length?raw.categories.slice():['杂谈'],tier:tier,scale:streamScale(tier),hoursStart:start,hoursEnd:end,hours:String(raw.hours||''),tone:String(raw.tone||''),seed:String(raw.seed||''),medal:String(raw.medal||''),theme:normalizeStreamerTheme(raw.theme||raw.代表色),art:{type:String(raw.art&&raw.art.type||''),src:String(raw.art&&raw.art.src||'')},yaml:String(raw.yaml||''),updatedAt:+raw.updatedAt||0}}
function loadArchives(){try{var list=JSON.parse(localStorage.getItem(ARCHIVE_KEY)||'[]');state.archives=Array.isArray(list)?list.map(normalizeCustom).filter(x=>x.name&&x.yaml):[]}catch(_){state.archives=[]}}
function persistArchives(){try{localStorage.setItem(ARCHIVE_KEY,JSON.stringify(state.archives));return true}catch(_){toast('主播存档保存失败');return false}}
function currentCustomData(){var d=streamerInput();return normalizeCustom(Object.assign({},d,{id:state.activeCustomId||customId(),art:state.art,yaml:state.yaml,homeData:cloneHome(state.streamerHome)}))}
function renderCustomManager(){var roster=$('#custom-roster'),archive=$('#archive-list');$('#custom-count').textContent=state.customs.length;$('#archive-count').textContent=state.archives.length;$('#archive-panel').classList.toggle('hidden',!state.archiveOpen);$('#archive-toggle').classList.toggle('on',state.archiveOpen);roster.innerHTML=state.customs.length?state.customs.map(function(c){return'<div class="custom-roster-item'+(c.id===state.activeCustomId?' on':'')+'"><button type="button" data-custom-load="'+esc(c.id)+'"><i>'+esc((c.name||c.handle||'S').slice(0,1))+'</i><span><b>'+esc(c.name||'未命名')+'</b><small>'+esc(c.handle||'未设置网名')+'</small></span></button><button type="button" class="custom-remove" data-custom-remove="'+esc(c.id)+'" title="移除">×</button></div>'}).join(''):'<span class="custom-empty">尚未添加自定义主播</span>';archive.innerHTML=state.archives.length?state.archives.map(function(c){return'<div class="archive-item"><button type="button" data-archive-use="'+esc(c.id)+'"><i>'+esc((c.name||c.handle||'S').slice(0,1))+'</i><span><b>'+esc(c.name)+'</b><small>'+esc(c.handle||'未设置网名')+' · '+esc(c.hours||'不固定')+'</small></span></button><button type="button" data-archive-delete="'+esc(c.id)+'">删除</button></div>'}).join(''):'<span class="custom-empty">还没有主播存档</span>'}
function clearCustomEditor(){state.activeCustomId=null;state.categories=new Set(['杂谈']);state.yaml='';state.art={type:'',src:''};state.streamerHome=null;state.streamerTheme='';['#streamer-name','#streamer-handle','#streamer-tone','#streamer-seed','#streamer-medal','#art-url'].forEach(id=>$(id).value='');$('#streamer-age').value='23';$('#streamer-tier').value='42';$('#streamer-home').textContent='从地图选择住所';$('#profile-yaml').value='';$('#art-file').value='';updateArt('','');setStreamerHours('','');renderTags();renderThemeChoices();renderScale();syncInputs();renderProfile();$('#generate-profile').textContent='生成人设档案';setGenerateStatus('调用结果与错误会显示在这里');$('#save-custom').disabled=true;renderCustomManager()}
function loadCustomEditor(raw){var c=normalizeCustom(raw);state.activeCustomId=c.id;state.categories=new Set(c.categories);state.streamerHome=c.homeData||c.home?c.homeData||{fullName:c.home,name:c.home}:null;state.streamerTheme=c.theme;state.yaml=c.yaml;state.art=c.art;$('#streamer-name').value=c.name;$('#streamer-handle').value=c.handle;$('#streamer-age').value=c.age;$('#streamer-tier').value=c.tier;$('#streamer-tone').value=c.tone;$('#streamer-seed').value=c.seed;$('#streamer-medal').value=c.medal;$('#streamer-home').textContent=c.home||'从地图选择住所';$('#art-url').value=/^https?:/i.test(c.art.src)?c.art.src:'';$('#profile-yaml').value=c.yaml;renderTags();renderThemeChoices();renderScale();setStreamerHours(c.hoursStart,c.hoursEnd);updateArt(c.art.src,c.art.type);syncInputs();renderProfile();$('#generate-profile').textContent=c.yaml?'重新生成':'生成人设档案';setGenerateStatus(c.yaml?'已载入，可继续修改':'填写后生成人设档案');$('#save-custom').disabled=!c.yaml;renderCustomManager()}
function saveCurrentCustom(options){options=options||{};var d=currentCustomData();if(!d.name||!d.handle){if(!options.quiet)toast('先填写主播姓名和网名');return null}if(!d.yaml){if(!options.quiet)toast('请先生成人设档案');return null}if(OSHI.some(o=>o.name===d.name)){toast('主播姓名与现有主播重复');return null}var duplicate=state.customs.find(c=>c.name===d.name&&c.id!==d.id);if(duplicate){toast('本次开局里已经有同名主播');return null}var index=state.customs.findIndex(c=>c.id===d.id);if(index>=0)state.customs[index]=d;else state.customs.push(d);state.activeCustomId=d.id;$('#save-custom').disabled=false;renderCustomManager();if(!options.quiet)toast('已保存：'+d.name);return d}
function newCustom(){if(state.yaml&&!saveCurrentCustom({quiet:true}))return;clearCustomEditor();toast('可以填写下一位主播了')}
function removeCustom(id){var c=state.customs.find(x=>x.id===id);state.customs=state.customs.filter(x=>x.id!==id);if(state.activeCustomId===id)clearCustomEditor();else renderCustomManager();if(c)toast('已移除：'+c.name)}
function saveCurrentArchive(){var d=saveCurrentCustom({quiet:true});if(!d)return;var copy=normalizeCustom(d),artOmitted=false;if(/^data:image\//i.test(copy.art.src)&&copy.art.src.length*2>ARCHIVE_ART_MAX){copy.art={type:'',src:''};artOmitted=true}copy.updatedAt=Date.now();var index=state.archives.findIndex(c=>c.name===copy.name);if(index>=0){copy.id=state.archives[index].id;state.archives[index]=copy}else state.archives.push(copy);if(persistArchives()){renderCustomManager();toast(artOmitted?'存档已保存，立绘文件过大未收录':'主播存档已保存')}}
function useArchive(id){var saved=state.archives.find(c=>c.id===id);if(!saved)return;var c=normalizeCustom(saved),existing=state.customs.find(x=>x.name===c.name);if(existing)c.id=existing.id;var index=state.customs.findIndex(x=>x.id===c.id);if(index>=0)state.customs[index]=c;else state.customs.push(c);loadCustomEditor(c);toast('已加入本次开局：'+c.name)}
function deleteArchive(id){var c=state.archives.find(x=>x.id===id);state.archives=state.archives.filter(x=>x.id!==id);persistArchives();renderCustomManager();if(c)toast('已删除存档：'+c.name)}
function guardText(s){var extra=[];if(s.admirals)extra.push('提督 '+s.admirals);if(s.governors)extra.push('总督 '+s.governors);
  return s.guards.toLocaleString('en-US')+(extra.length?'（+'+extra.join(' / ')+'）':'')}
function renderScale(){var s=streamScale($('#streamer-tier').value);
  $('#tier-value').textContent=s.tier;
  $('#tier-label').textContent=s.label;
  $('#tier-followers').textContent=bigNum(s.followers);
  $('#tier-base').textContent=bigNum(s.base);
  $('#tier-guards').textContent=guardText(s);
  updateBookPreview()}
function renderThemeChoices(){const box=$('#streamer-theme-options');if(!box)return;box.innerHTML=STREAMER_THEMES.map(t=>'<button type="button" class="theme-choice '+(state.streamerTheme===t.id?'on':'')+'" data-streamer-theme="'+t.id+'" aria-pressed="'+(state.streamerTheme===t.id?'true':'false')+'" title="'+t.source+'"><i style="--theme-swatch:'+t.swatch+'"></i><span>'+t.label+'</span></button>').join('')}
function setStreamerTheme(theme){state.streamerTheme=normalizeStreamerTheme(theme);renderThemeChoices()}
function renderTags(){$('#category-tags').innerHTML=CATEGORIES.map(c=>`<button type="button" class="tag ${state.categories.has(c)?'on':''}" data-cat="${c}">${c}</button>`).join('');document.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{const c=b.dataset.cat;state.categories.has(c)?state.categories.delete(c):state.categories.add(c);if(!state.categories.size)state.categories.add('杂谈');renderTags()})}
function setHome(home,target){if(!home)return;target=target||state.mapTarget;if(target==='player'){state.home=home;var api=openingMapApi();try{if(api){api.setState({district:home.district||'',player:{at:home.id},actors:[],events:[]});if(state.job&&state.job.node)api.plan(state.job.node);else if(api.clearTrip)api.clearTrip()}}catch(_){}renderMapInspector();setOpeningTarget('work');toast('初始住所已选择：'+home.name)}else if(target==='work'){setJob(home);return}else{state.streamerHome=home;document.querySelector('#streamer-home').textContent=home.fullName;closeMap()}}
function bindFrame(){var frame=document.querySelector('#map-iframe');try{var api=frame.contentWindow.PLATE_MAP;if(api)api.onPick(function(node){handleMapPick(node)})}catch(_){} }
function bindOpeningFrame(){var frame=document.querySelector('#opening-map-iframe');try{var api=frame.contentWindow.PLATE_MAP;if(api){api.onPick(function(node){handleMapPick(node)});if(api.setOpeningTarget)api.setOpeningTarget(state.mapTarget==='work'?'work':'home');if(state.home)api.setState({district:state.home.district||'',player:{at:state.home.id},actors:[],events:[]})}}catch(_){} }
function renderMapQuick(){var box=document.querySelector('#quick-homes');if(!box)return;box.innerHTML=HOMES.map(function(h,i){return '<button class="quick" data-home="'+i+'">'+esc(h.name)+' / '+esc(homeCostText(h))+'</button>'}).join('');box.querySelectorAll('[data-home]').forEach(function(btn){btn.onclick=function(){setHome(HOMES[+btn.dataset.home],'streamer')}})}
function closeMap(){var modal=document.querySelector('#map-modal');if(modal)modal.classList.remove('on')}
function syncMapFullscreen(){var card=document.querySelector('#opening-map-card'),btn=document.querySelector('#map-fullscreen');if(!card||!btn)return;var on=document.fullscreenElement===card;btn.textContent=on?'× 退出全屏':'⛶ 全屏地图';card.classList.toggle('is-fullscreen',on);setTimeout(function(){var api=openingMapApi();try{if(api)api.fitAll(0)}catch(_){}},120)}
function toggleMapFullscreen(){var card=document.querySelector('#opening-map-card');if(!card)return;if(document.fullscreenElement===card){document.exitFullscreen()}else if(card.requestFullscreen){card.requestFullscreen()}}
function openMap(target){if(target==='player'||target==='work'){setOpeningTarget(target);go(2);return}state.mapTarget='streamer';document.querySelector('#map-title').textContent='选择自定义主播住所';document.querySelector('#map-modal').classList.add('on');var frame=document.querySelector('#map-iframe');if(!frame.getAttribute('src'))frame.src=MAP_URL;var api=modalMapApi();try{if(api&&api.setOpeningTarget)api.setOpeningTarget('home')}catch(_){} }
function handleMapPick(node){if(!node||!node.id)return;var knownHome=HOMES.find(function(h){return h.id===node.id});if(state.mapTarget==='player'){/* 用 district + name 现拼，不用 node.fullName：city_mapdata 的 fullName 尾巴常和 name
   不一样（"落霞区 · 文汇新村青年合租公寓" vs name "文汇新村合租公寓"），
   写成 fullName 会让 位置.区域 的子区域对不上节点名，地图和状态栏都定位不到。 */
if(knownHome){var hn=node.name||knownHome.name,hd=node.district||knownHome.district;return setHome(Object.assign({},knownHome,{name:hn,district:hd,fullName:hd+' · '+hn}))}toast('请点击地图上的粉色住宅节点');return}if(state.mapTarget==='work'){var knownJob=JOBS.find(function(j){return j.node===node.id});if(knownJob)return setJob(knownJob);toast('请选择已加入开局岗位池的工作节点');return}if(state.mapTarget==='streamer'&&node.archetype==='living')return setHome({id:node.id,name:node.name,fullName:node.district+' · '+node.name,district:node.district,tenure:'租住',note:node.draw||'从地图选择的居住地点',rent:0,deposit:0,cost:'费用由开局后设定'},'streamer');toast('请选择住所类地点')}
function updateArt(src,type){state.art={src,type};const box=$('#art-preview'),img=$('#art-img');if(src){img.src=src;box.classList.add('has')}else{img.removeAttribute('src');box.classList.remove('has')}}
async function compactArtFile(file){
  const fallback=()=>new Promise(function(resolve,reject){const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=reject;r.readAsDataURL(file)});
  if(!file||!/^image\//i.test(file.type||''))return fallback();
  try{
    const bitmap=await createImageBitmap(file),maxW=900,maxH=1350,scale=Math.min(1,maxW/bitmap.width,maxH/bitmap.height),w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale)),canvas=document.createElement('canvas');
    canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(bitmap,0,0,w,h);bitmap.close?.();
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.82));
    if(!blob)return fallback();
    return await new Promise(function(resolve,reject){const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=reject;r.readAsDataURL(blob)});
  }catch(_){return fallback()}
}
function streamerHoursValue(){const start=value('#streamer-hours-start'),end=value('#streamer-hours-end');if(!start||!end||start===end)return'';let shownEnd=end;if(end==='00:00'&&start!=='00:00')shownEnd='24:00';else if(end<start)shownEnd='次日 '+end;return start+' - '+shownEnd}
function renderStreamerHours(){const start=value('#streamer-hours-start'),end=value('#streamer-hours-end'),picker=$('#streamer-hours-picker'),summary=$('#streamer-hours-summary');picker.classList.toggle('invalid',!!(start||end)&&(!start||!end||start===end));if(!start&&!end)summary.textContent='未设置时按不固定处理';else if(!start||!end)summary.textContent='请选择完整的开始与结束时间';else if(start===end)summary.textContent='开始与结束时间不能相同';else summary.textContent=streamerHoursValue();document.querySelectorAll('#streamer-hours-presets button').forEach(b=>b.classList.toggle('on',b.dataset.start===start&&b.dataset.end===end))}
function setStreamerHours(start,end){$('#streamer-hours-start').value=start||'';$('#streamer-hours-end').value=end||'';renderStreamerHours()}
function validateStreamerHours(){const start=value('#streamer-hours-start'),end=value('#streamer-hours-end');if(!start&&!end)return true;if(!start||!end){renderStreamerHours();toast('请选择完整的直播开始与结束时间');return false}if(start===end){renderStreamerHours();toast('直播开始与结束时间不能相同');return false}return true}
function streamerInput(){const tier=clampTier($('#streamer-tier').value),s=streamScale(tier);return{name:value('#streamer-name'),handle:value('#streamer-handle'),age:+value('#streamer-age')||23,home:state.streamerHome?.fullName||'',homeData:cloneHome(state.streamerHome),categories:[...state.categories],tier:tier,scale:s,hoursStart:value('#streamer-hours-start'),hoursEnd:value('#streamer-hours-end'),hours:streamerHoursValue(),tone:value('#streamer-tone'),seed:value('#streamer-seed'),medal:value('#streamer-medal'),theme:state.streamerTheme}}
function renderProfile(){var on=!!state.yaml;$('#generated').classList.toggle('on',on);if(on){var box=$('#profile-yaml');if(box.value!==state.yaml)box.value=state.yaml;$('#generated-meta').textContent='角色详情：'+(value('#streamer-name')||'—')}$('#save-custom').disabled=!on}
const PROFILE_GENERATION_TIMEOUT_MS=5*60*1000;
function setGenerateStatus(text,tone){const el=$('#generate-status');el.textContent=text||'';el.title=text||'';el.classList.remove('working','ok','error');if(tone)el.classList.add(tone)}
function formatGenerateElapsed(ms){const total=Math.max(0,Math.floor(ms/1000)),minutes=Math.floor(total/60),seconds=total%60;return String(minutes).padStart(2,'0')+':'+String(seconds).padStart(2,'0')}
function startGenerateClock(){const startedAt=Date.now(),limit=formatGenerateElapsed(PROFILE_GENERATION_TIMEOUT_MS);function paint(){setGenerateStatus('正在调用人设生成 API… 已等待 '+formatGenerateElapsed(Date.now()-startedAt)+' / 超时上限 '+limit,'working')}paint();const timer=setInterval(paint,1000);return()=>clearInterval(timer)}
function validateGeneratedProfileYaml(value){
  const yaml=String(value||'').trim();
  if(!yaml)throw new Error('宿主响应标记为成功，但 payload.yaml 为空。');
  if(!yaml.startsWith('---'))throw new Error('宿主返回的 YAML 格式校验失败：正文必须以 --- 开头。');
  if(!/^角色详情\s*:/m.test(yaml))throw new Error('宿主返回的 YAML 格式校验失败：缺少顶层“角色详情:”字段。');
  if(/^\s*current_state\s*:/m.test(yaml))throw new Error('宿主返回的内容校验失败：角色档案含 current_state 运行态字段。');
  if(/(待补充|住处待定|稍后补充|TODO|TBD|以MVU动态数据为准)/i.test(yaml))throw new Error('宿主返回的内容校验失败：角色档案仍含占位文本或 MVU 系统说明。');
  return yaml
}
function requestHostGeneration(payload){
  if(window.parent===window)return Promise.reject(new Error('当前页面未连接开局宿主：generateStreamerProfile 请求没有发送。请从酒馆中的开局入口打开本页。'));
  return new Promise((resolve,reject)=>{
    const id='profile-'+Date.now(),timeoutMs=PROFILE_GENERATION_TIMEOUT_MS;
    const timer=setTimeout(()=>{removeEventListener('message',on);reject(new Error('人设生成请求超时：宿主在 '+Math.round(timeoutMs/1000)+' 秒内没有返回 generateStreamerProfile 响应。'))},timeoutMs);
    function finish(){clearTimeout(timer);removeEventListener('message',on)}
    function on(e){
      const d=e.data;
      if(d?.channel!=='linjiang-opening'||d.kind!=='response'||d.id!==id)return;
      finish();
      if(!d.ok){reject(new Error(String(d.error||'宿主返回生成失败，但没有附带错误信息。')));return}
      try{resolve(validateGeneratedProfileYaml(d.payload?.yaml))}
      catch(error){reject(error)}
    }
    addEventListener('message',on);
    try{parent.postMessage({channel:'linjiang-opening',kind:'request',id,action:'generateStreamerProfile',payload},'*')}
    catch(error){finish();reject(new Error('向开局宿主发送 generateStreamerProfile 请求时出错：'+(error?.message||String(error))))}
  })}
async function generateProfile(){const d=streamerInput();if(!d.name||!d.handle){toast('先填写主播姓名和网名');return}if(!validateStreamerHours())return;if(OSHI.some(o=>o.name===d.name)){toast('主播姓名与现有主播重复');return}
  const btn=$('#generate-profile');btn.disabled=true;btn.textContent='生成中…';const stopClock=startGenerateClock();
  try{
    const yaml=await requestHostGeneration(d);
    state.yaml=yaml;renderProfile();
    const saved=saveCurrentCustom({quiet:true});
    if(!saved)throw new Error('YAML 已生成，但保存到本次开局时校验失败。请检查角色名称和档案内容。');
    setGenerateStatus('API 返回并解析成功，已加入本次开局，可继续修改。','ok')
  }catch(error){
    const message=error?.message||String(error);
    console.error('[临江开局] 自定义主播人设生成失败',error);
    setGenerateStatus('生成失败：'+message,'error');
    toast('人设生成失败，详细原因已显示在按钮下方')
  }finally{
    stopClock();btn.disabled=false;btn.textContent=state.yaml?'重新生成':'生成人设档案'
  }}
function updateBookPreview(){if(state.yaml)$('#generated-meta').textContent='角色详情：'+(value('#streamer-name')||'—')}
function syncInputs(){const n=value('#streamer-name'),h=value('#streamer-handle');$('#art-name').textContent=n||'新主播';$('#art-handle').textContent=(h||'STREAMER').toUpperCase();$('#art-monogram').textContent=(n||h||'S').slice(0,1);updateBookPreview()}
function validate(step){if(step===1&&!value('#player-name')){toast('请填写玩家姓名或常用称呼');return false}if(step===2&&!state.home){toast('请先从地图选择初始住所');return false}if(step===3&&state.openingId==='custom'&&!state.customOpeningText.trim()){toast('请输入自定义开局内容');return false}if(step===4){var touched=!!(value('#streamer-name')||value('#streamer-handle')||state.yaml);if(touched&&!state.yaml){toast('当前主播还没生成人设档案');return false}if(state.yaml&&!saveCurrentCustom({quiet:true}))return false}return true}
function renderConfirm(){var player=value('#player-name')||'未命名玩家',handle=value('#player-handle')||'未设置网名',job=state.job,home=state.home,customs=state.customs,opening=resolvedOpening(),detailPreview=opening.detail.length>120?opening.detail.slice(0,120)+'…':opening.detail,rows=[['玩家档案',player+' / '+state.gender+' / '+(value('#player-age')||24)+'岁'],['直播网名',handle],['初始住所',home?home.fullName+' / '+homeCostText(home):'未选择'],['初始工作',job.name],['收入与时间',job.monthly?'月薪约 RMB '+job.monthly.toLocaleString()+' / '+job.hours:'无固定收入'],['通勤估算',job.monthly?jobCommuteText(job):'无需通勤'],['我推的主播',oshiPicked().length?oshiPicked().map(function(o){return o.name}).join('、'):'未选择'],['选择开局',opening.title+' / '+opening.summary]];if(opening.targetStreamer)rows.push(['目标主播',opening.targetStreamer.name]);rows.push(['开局详情',detailPreview],['自定义主播',customs.length?customs.map(function(c){return c.name+'（'+c.handle+'）'}).join('、'):'未追加']);document.querySelector('#confirm-player').textContent=player;document.querySelector('#confirm-lines').innerHTML=rows.map(function(row){return'<div class="confirm-line"><span>'+row[0]+'</span><b>'+esc(row[1])+'</b></div>'}).join('')}
function skipStep(){return false}
function nextStep(from){return Math.min(LAST_STEP,from+1)}
function prevStep(from){return Math.max(1,from-1)}
function go(step,direct){if(step>state.step&&!validate(state.step))return;step=Math.max(1,Math.min(LAST_STEP,step));if(!direct&&skipStep(step))step=step>state.step?nextStep(step):prevStep(step);state.step=step;document.body.classList.toggle('life-map-step',state.step===2);document.body.classList.toggle('oshi-step',state.step===3);
  /* 02/03/04 三步内容最多，之前在 1440×900 上分别要多滚 524 / 676 / 948 px。
     这个类把外框（header / steps / footer / 留白）压薄、把主体改成横排，
     让这三步在常见 PC 屏幕上直接装下，具体规则见 opening.css 末尾那一节。 */
  document.body.classList.toggle('compact-step',state.step>=2);
  /* 05 跟 02 一样要"撑满一屏"：左边档案、右边世界书正文各自内部滚，
     而不是让整页跟着最长的那一列长。 */
  document.body.classList.toggle('confirm-step',state.step===LAST_STEP);
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',+p.dataset.panel===state.step));renderSteps();$('#prev').classList.toggle('hidden',state.step===1);$('#next').textContent=state.step===LAST_STEP?'出发':'继续';if(state.step===LAST_STEP)renderConfirm();if(state.step===2){ensureOpeningMap();setTimeout(function(){var api=openingMapApi();try{if(api)api.fitAll(0)}catch(_){}},80)}scrollTo({top:0,behavior:'smooth'})}
function emptyExperience(){var item=()=>({次数:0,可更新:true});return{近期性经验次数:0,露出经验:item(),自慰经验:item(),排泄调教经验:item(),道具调教经验:item(),凌辱调教经验:item(),隐奸经验:item(),青奸经验:item(),睡奸经验:item(),催眠奸经验:item(),情趣扮演经验:item(),盗摄经验:item(),性直播经验:item()}}
function emptyDevelopment(){return{口腔:{档位:0,进度:0,可更新:true,评语:''},胸:{档位:0,进度:0,可更新:true,评语:''},小穴:{档位:0,进度:0,可更新:true,评语:''},肛门:{档位:0,进度:0,可更新:true,评语:''}}}
function commuteForCurrentJob(){return state.job&&state.job.node?quoteFor(state.job):null}
/* 粉丝身份的字段形状对齐 酒馆变量/mvuzod.js 的 fanSchema：多写的键会被 Schema 丢掉，
   少写的键会被补默认值，所以这里一次写全。牌子等级由 累计打赏 决定（见 OSHI_TIPPED），
   牌子档位是"大航海"那条线、跟等级无关，开局不给。 */
function fanRecord(){return{'关注':true,'累计打赏':OSHI_TIPPED,'牌子等级':OSHI_BADGE,'牌子档位':'无','牌子剩余天数':0,'房管':false,'禁言中':false,'禁言剩余天数':0}}
function openingPayload(){var pname=value('#player-name'),job=state.job,commute=commuteForCurrentJob(),picked=oshiPicked(),customs=state.customs.map(normalizeCustom).filter(c=>c.name&&c.yaml),mvu={'世界信息':{'年历':'2026年4月1日','时间':{'时钟':'08:00','时段':'朝'},'位置':{'区域':state.home.fullName,'场所':'家中'},'事件提示':{}},'玩家信息':{'档案':{'姓名':pname,'性别':state.gender,'年龄':+value('#player-age')||24,'网名':value('#player-handle'),'补充设定':value('#player-note')},'体力':100,'金钱':20000,'工作':{'职业':job.place?job.name:null,'地点':job.place,'日收入':job.daily,'工作时间':job.place?job.hours:null,'今日已上班':false,'通勤':commute?{'方式':'公交优先','分钟':commute.min,'距离公里':commute.km,'费用':commute.yuan}:null},'居住地':state.home.fullName,'房产':{[state.home.name]:{'名称':state.home.name,'区域':state.home.fullName,'产权':state.home.tenure,'描述':state.home.note,'月租':state.home.rent||0,'押金':state.home.deposit||0,'售价':state.home.sale||0,'费用说明':homeCostText(state.home)}},'生活固定支出':Object.assign({'日常生活费':{'金额':60,'支付周期':'每日'}},state.home.rent?{[state.home.name+'房租']:{'金额':state.home.rent,'支付周期':'每月'}}:{}),'粉丝身份':{}}};
  var girls={},rooms={},books=[],uis=[];
  picked.forEach(function(o){mvu['玩家信息']['粉丝身份'][o.name]=fanRecord();girls[o.name]={'羁绊':{'好感度':80+OSHI_FAVOR}}});
  customs.forEach(function(d){girls[d.name]={'羁绊':{'好感度':CUSTOM_INITIAL_FAVOR,'顺从度':0,'心情':'开朗'},'位置':{'区域':d.home||'','场所':'家中','私密度':5},'性经历':emptyExperience(),'开发度':emptyDevelopment(),'生理':{'性欲度':0,'体力':100,'尿意':20,'异常状态':{}},'直播':{'开播':false,'标题':'','热度':0,'粉丝数':d.scale.followers}};rooms[d.name]={'自定义':true,'代表色':d.theme||'','主播网名':d.handle||'','封面':d.art&&d.art.type==='url'&&/^https?:\/\//i.test(d.art.src||'')?d.art.src:'','封面类型':d.art&&d.art.type==='url'?'url':'','档期':d.hours||'不固定','牌子名':d.medal||d.handle||d.name,'体量档位':d.scale.tier,'底盘热度':d.scale.base,'本场热度':0,'高能榜':[],'大航海':{'舰长':d.scale.guards,'提督':d.scale.admirals,'总督':d.scale.governors,'名单':[]}};books.push({sourceName:d.name,name:d.name,keys:[d.name,d.handle].filter(Boolean),content:String(d.yaml).trim()});uis.push({name:d.name,handle:d.handle,theme:d.theme,art:d.art})});
  if(Object.keys(girls).length)mvu['对象信息']=girls;
  if(Object.keys(rooms).length)mvu['系统配置']={'直播间':rooms};
  return{mvu:mvu,oshi:picked.map(function(o){return{name:o.name,medal:o.medal,badge:OSHI_BADGE,favor:80+OSHI_FAVOR,tipped:OSHI_TIPPED}}),opening:resolvedOpening(),worldbook:books[books.length-1]||null,worldbooks:books,ui:uis[0]||null,uis:uis}}
function playerOriginConfig(payload){var info=payload.mvu['玩家信息'],world=payload.mvu['世界信息'];return{'玩家档案':info['档案'],'初始日期':world['年历'],'初始时间':world['时间'],'初始位置':world['位置'],'初始体力':info['体力'],'初始金钱':info['金钱'],'初始住所':info['居住地'],'初始房产':info['房产'],'初始工作':info['工作'],'我推的主播':payload.oshi.map(function(o){return o.name}),'自定义主播':payload.uis.map(function(u){return{name:u.name,网名:u.handle}})}}
function buildStartMessage(payload){var opening=payload.opening,target=opening.targetStreamer?opening.targetStreamer.name:'未指定';return[
'请根据以下玩家出身配置和开局内容，完成初始化并直接开始临江市的故事。',
'```arduino',
'【玩家出身配置】',
JSON.stringify(playerOriginConfig(payload),null,2),
'```',
'',
'【选择的开局】',
'标题：'+opening.title,
'简介：'+opening.summary,
'目标主播：'+target,
'详细内容：',
'',
opening.detail,
'',
'请保持上述出身信息一致; 推进到需要玩家回复为止。正文不少于1500字'
].join('\n')}
function sendMessageToChat(message){try{var doc=document;if(window.parent&&window.parent!==window){try{doc=window.parent.document}catch(_){}}var area=doc.getElementById('send_textarea'),button=doc.getElementById('send_but');if(!area||!button)return false;area.value=message;area.dispatchEvent(new Event('input',{bubbles:true}));area.dispatchEvent(new Event('change',{bubbles:true}));button.click();return true}catch(_){return false}}
function finish(){const payload=openingPayload();payload.startMessage=buildStartMessage(payload);if(window.parent!==window)parent.postMessage({channel:'linjiang-opening',kind:'event',type:'commitPreview',payload},'*');else sendMessageToChat(payload.startMessage);navigator.clipboard?.writeText(payload.startMessage).catch(()=>{});console.log('[临江开局配置]',payload);toast('开局配置已发送，临江生活即将开始')}
loadArchives();renderSteps();renderMapInspector();renderOshi();renderOpenings();clearCustomEditor();go(1)
$('#gender-segment').onclick=e=>{const b=e.target.closest('button');if(!b)return;state.gender=b.dataset.value;$('#gender-segment').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b))};
document.querySelectorAll('[data-open-map]').forEach(b=>b.onclick=()=>openMap(b.dataset.openMap));
$('#map-close').onclick=closeMap;$('#map-modal').onclick=e=>{if(e.target===$('#map-modal'))closeMap()};
renderMapQuick();
$('#map-iframe').addEventListener('load',()=>setTimeout(bindFrame,350));document.querySelector('#map-home-mode').onclick=()=>setOpeningTarget('player');document.querySelector('#map-work-mode').onclick=()=>setOpeningTarget('work');document.querySelector('#change-home').onclick=()=>setOpeningTarget('player');document.querySelector('#change-work').onclick=()=>setOpeningTarget('work');document.querySelector('#map-fullscreen').onclick=toggleMapFullscreen;document.addEventListener('fullscreenchange',syncMapFullscreen);
addEventListener('message',e=>{const d=e.data;if(d?.channel==='linjiang-map'&&d.type==='pick')handleMapPick(d.payload)});
$('#opening-prev').onclick=$('#opening-prev-preview').onclick=()=>shiftOpening(-1);
$('#opening-next').onclick=$('#opening-next-preview').onclick=()=>shiftOpening(1);
$('#custom-opening-text').addEventListener('input',e=>{state.customOpeningText=e.target.value;renderOpenings()});
$('#streamer-tier').oninput=renderScale;
$('#streamer-theme-options').onclick=e=>{const b=e.target.closest('[data-streamer-theme]');if(b)setStreamerTheme(b.dataset.streamerTheme)};
$('#streamer-hours-presets').onclick=e=>{const b=e.target.closest('button');if(!b)return;setStreamerHours(b.dataset.start,b.dataset.end)};
['#streamer-hours-start','#streamer-hours-end'].forEach(id=>$(id).addEventListener('input',renderStreamerHours));
$('#new-custom').onclick=newCustom;
$('#archive-toggle').onclick=()=>{state.archiveOpen=!state.archiveOpen;renderCustomManager()};
$('#archive-save').onclick=saveCurrentArchive;
$('#custom-roster').onclick=e=>{const remove=e.target.closest('[data-custom-remove]'),load=e.target.closest('[data-custom-load]');if(remove)return removeCustom(remove.dataset.customRemove);if(load){if(state.yaml&&!saveCurrentCustom({quiet:true}))return;var c=state.customs.find(x=>x.id===load.dataset.customLoad);if(c)loadCustomEditor(c)}};
$('#archive-list').onclick=e=>{const del=e.target.closest('[data-archive-delete]'),use=e.target.closest('[data-archive-use]');if(del)return deleteArchive(del.dataset.archiveDelete);if(use)return useArchive(use.dataset.archiveUse)};
$('#profile-yaml').addEventListener('input',e=>{state.yaml=e.target.value;$('#save-custom').disabled=!state.yaml;setGenerateStatus('内容已修改，保存后生效');updateBookPreview()});
['#streamer-name','#streamer-handle'].forEach(id=>$(id).addEventListener('input',syncInputs));
$('#apply-art-url').onclick=()=>{const u=value('#art-url');if(!u)return toast('先填写网络立绘链接');updateArt(u,'url')};
$('#art-file').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;setGenerateStatus('正在压缩立绘…','working');try{updateArt(await compactArtFile(f),'upload-preview');setGenerateStatus('立绘已处理，保存在当前浏览器','ok')}catch(_){setGenerateStatus('立绘读取失败','error')}};
$('#generate-profile').onclick=generateProfile;$('#save-custom').onclick=()=>saveCurrentCustom();$('#prev').onclick=()=>go(prevStep(state.step));$('#next').onclick=()=>state.step===LAST_STEP?finish():go(nextStep(state.step));
if(window.parent!==window)parent.postMessage({channel:'linjiang-opening',kind:'event',type:'ready'},'*');
setTimeout(()=>window.__loadLinjiangOpeningFonts?.(),0);
})();
