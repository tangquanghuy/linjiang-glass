(()=>{
const MAP_REV='20260822-starter-homes-v1';
const DEFAULT_MAP=`./city/plate_map.html?mode=opening&v=${MAP_REV}`;
const MAP_URL=new URLSearchParams(location.search).get('map')||DEFAULT_MAP;
const STEPS=['关于你','住所与工作','我推的主播','自定义主播','确认'];
const LAST_STEP=STEPS.length;
const ART_HOST='https://anchor.bolt.qzz.io';
const art=(folder,file)=>ART_HOST+'/'+encodeURIComponent(folder)+'/'+encodeURIComponent(file)+'.webp';
/* 固定主播池。名字／牌子名／直播档／封面文件名对齐 外部部署/正文美化.html 的
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
const OSHI_MAX=3;
const OSHI_FAVOR=300;    // 选中即加的好感，叠在 变量初始化 给的 80 上
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
/* 人设不再是一组固定字段，而是一整段「角色详情」YAML —— 跟 世界书/红蔷薇、斯黛拉、
   璃亚梦 同格式，生成和写入照 参考/底部状态栏.html 的 人物详情生成 那一套。 */
const state={step:1,gender:'男性',home:null,job:JOBS[0],mapTarget:'player',oshi:[],wantCustom:false,categories:new Set(['杂谈']),yaml:'',art:{type:'',src:''},streamerHome:null};
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const value=id=>$(id).value.trim();
let toastTimer=0;
function toast(text){const el=$('#toast');el.textContent=text;el.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('on'),2200)}
/* ---- 体量模型 ----------------------------------------------------------
   玩家只拉一根「体量档位」滑杆（0–100），粉丝数／底盘热度／大航海全是它的函数。

   这段是 外部部署/辅助计算脚本.js 里 streamScale 的镜像，公式必须一模一样：
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
function updateHomeInspector(){var h=state.home;var name=document.querySelector('#home-name'),meta=document.querySelector('#home-meta'),cost=document.querySelector('#home-cost');if(!name)return;name.textContent=h?h.name:'尚未选择住所';name.classList.toggle('empty',!h);meta.textContent=h?h.fullName+' / '+h.tenure+' / '+h.note:'全城八个城区都有可选住宅；点击粉色节点查看。';cost.textContent=h?homeCostText(h):'租金与押金将在这里显示';updatePickSummary()}
function updateWorkInspector(){var j=state.job,r=j&&j.monthly?quoteFor(j):null;var name=document.querySelector('#work-name');if(!name)return;name.textContent=j&&j.monthly?j.name:'暂时无业';document.querySelector('#work-meta').textContent=j&&j.place?j.place+(state.home?'':' / 选好住所后计算通勤'):'可以先选住所，也可以先挑工作；暂时无业同样可以继续。';document.querySelector('#commute-card').innerHTML=workMetricsHtml(j,r);updatePickSummary()}
function renderMapInspector(){updateHomeInspector();updateWorkInspector()}
function setOpeningTarget(target){state.mapTarget=target==='work'?'work':'player';var homeBtn=document.querySelector('#map-home-mode'),workBtn=document.querySelector('#map-work-mode');homeBtn.classList.toggle('on',state.mapTarget==='player');workBtn.classList.toggle('on',state.mapTarget==='work');document.querySelector('#map-mode-title').textContent=state.mapTarget==='work'?'挑一份开局工作':'挑一个开局住处';document.querySelector('#map-mode-hint').textContent=state.mapTarget==='work'?(state.home?'先比较月收入和班次，再看从当前住所出发的单程通勤。':'可以先挑岗位；选好住所后，通勤时间、距离和费用会自动补全。'):'每个城区都有住宅选项；点击粉色节点查看租金和住处特点。';var api=openingMapApi();try{if(api&&api.setOpeningTarget)api.setOpeningTarget(state.mapTarget==='work'?'work':'home');if(state.mapTarget==='work'&&state.home&&state.job&&state.job.node&&api)api.plan(state.job.node)}catch(_){}renderMapInspector()}
function setJob(job){if(!job)return;state.job=job;var api=openingMapApi();try{if(api&&state.home&&job.node)api.plan(job.node);else if(api&&api.clearTrip)api.clearTrip()}catch(_){}updateWorkInspector();toast(job.monthly?'已选择工作：'+job.name:'已选择暂时无业')}
function oshiOf(name){return OSHI.find(function(o){return o.name===name})||null}
function oshiPicked(){return state.oshi.map(oshiOf).filter(Boolean)}
function renderOshi(){var grid=document.querySelector('#oshi-grid');if(!grid)return;
  grid.innerHTML=OSHI.map(function(o){var on=state.oshi.indexOf(o.name)>=0,full=!on&&state.oshi.length>=OSHI_MAX;
    /* 推满之后剩下的卡只压暗、不 disabled：点了会给一句"先取消一个"，
       比一个没有反馈的死按钮好懂，键盘和读屏也照样能到。 */
    return '<button type="button" class="oshi-card'+(on?' on':'')+(full?' full':'')+'" data-oshi="'+esc(o.name)+'" aria-pressed="'+(on?'true':'false')+'">'
      /* 一共就七张封面，全部直接加载：loading="lazy" 在这里只会让下面几张
         在滚动到时才闪出来，省不下什么流量。 */
      +'<span class="oshi-art"><img src="'+esc(art('封面',o.cover))+'" alt="'+esc(o.name)+'立绘" decoding="async"><i class="oshi-check" aria-hidden="true">✓</i></span>'
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
function toggleOshi(name){var i=state.oshi.indexOf(name);
  if(i>=0){state.oshi.splice(i,1);toast('已取消：'+name)}
  else if(state.oshi.length>=OSHI_MAX){toast('最多只能推 '+OSHI_MAX+' 个，先取消一个');return}
  else{state.oshi.push(name);toast('已推：'+name+' / 好感 +'+OSHI_FAVOR+' / '+oshiOf(name).medal+' Lv.'+OSHI_BADGE)}
  renderOshi()}
function setWantCustom(on){state.wantCustom=!!on;
  var seg=document.querySelector('#custom-toggle');
  if(seg)seg.querySelectorAll('button').forEach(function(b){b.classList.toggle('on',(b.dataset.value==='on')===state.wantCustom)});
  var layout=document.querySelector('#stream-layout'),note=document.querySelector('#custom-skip-note');
  if(layout)layout.classList.toggle('hidden',!state.wantCustom);
  if(note)note.classList.toggle('hidden',state.wantCustom);
  if(!state.wantCustom)state.yaml='';
  renderSteps();updateBookPreview()}
function guardText(s){var extra=[];if(s.admirals)extra.push('提督 '+s.admirals);if(s.governors)extra.push('总督 '+s.governors);
  return s.guards.toLocaleString('en-US')+(extra.length?'（+'+extra.join(' / ')+'）':'')}
function renderScale(){var s=streamScale($('#streamer-tier').value);
  $('#tier-value').textContent=s.tier;
  $('#tier-label').textContent=s.label;
  $('#tier-followers').textContent=bigNum(s.followers);
  $('#tier-base').textContent=bigNum(s.base);
  $('#tier-guards').textContent=guardText(s);
  updateBookPreview()}
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
function streamerInput(){const s=streamScale($('#streamer-tier').value);return{name:value('#streamer-name'),handle:value('#streamer-handle'),age:+value('#streamer-age')||23,home:state.streamerHome?.fullName||'',categories:[...state.categories],scale:s,hours:value('#streamer-hours'),tone:value('#streamer-tone'),seed:value('#streamer-seed'),medal:value('#streamer-medal')}}
/* 模型不可用时的兜底草稿。格式和字段跟 世界书/红蔷薇 那几条一致（也就是
   参考/底部状态栏.html 的 角色详情 YAML），只是内容是模板化的、等玩家自己改。
   「直播设定」只放质性的东西：网名、分类、常用时间、直播风格、对观众的态度。
   粉丝数、热度、大航海、牌子名不写在这里——那些进 MVU。 */
function yamlLine(text){return String(text==null?'':text).replace(/\r?\n/g,' ').trim()}
function localYaml(d){const focus=d.categories.join('、'),s=d.scale;
  return ['---',
'角色详情:',
'  '+yamlLine(d.name)+':',
'    线上常用名/主播网名: '+yamlLine(d.handle||d.name),
'    gender: 女',
'    age: '+d.age+'岁',
'    identity:',
'      public: 临江市的'+focus+'类主播',
'      hidden: 待补充——写一条只有她自己知道的处境或动机',
'    current_state:',
'      - '+(d.home?('居住在'+yamlLine(d.home)+'，开播和日常都在这里'):'住处待定'),
'      - 常用直播时间 '+yamlLine(d.hours||'不固定')+'，内容以'+focus+'为主',
'      - '+yamlLine(d.seed||'有完整的工作与私人生活，不会只围绕某个观众行动'),
'',
'    直播设定:',
'      平台网名: '+yamlLine(d.handle||d.name),
'      直播分类: ['+d.categories.join(', ')+']',
'      常用直播时间: '+yamlLine(d.hours||'不固定'),
'      直播风格: 常用内容为'+focus+'；节奏由她自己控，不追着单条弹幕走',
'      对观众的态度: 记得住长期发言的ID，但公开场合一律平等对待，不给单人特殊待遇',
'      线上线下差异: 镜头前更善于维持情绪和节奏；线下表达更直接，也有疲惫和不想社交的时候',
'',
'    social_connection:',
'      观众:',
'        relationship: 待补充——她把直播间当成什么，观众大致是哪一类人',
'',
'    appearance:',
'      overview: 外貌以玩家提供的立绘为准，这里补充身形、发色瞳色和辨识特征',
'      attire:',
'        daily: 待补充',
'        直播: 待补充',
'      feature:',
'        - 待补充——一到三条一眼能记住的特征',
'',
'    对白风格:',
'      描述: '+yamlLine(d.tone?('整体气质偏'+d.tone+'；'):'')+'语气自然，回应会接住上一句的内容，不是各说各话',
'      禁止写法:',
'        - 禁止写成随时随地照顾玩家情绪的角色：她开播是工作，下播有自己的事',
'        - 禁止把打赏、关注或牌子等级写成能换取私人关系',
'',
'    内部描述:',
'      爱好:',
'        - 待补充',
'      个人特长: 待补充',
'      本职: '+focus+'类主播'+(d.home?'':'（另有本职待补充）'),
'',
'    角色细节:',
'      日常: 开播前做基础准备；下播后先处理设备、消息和第二天的安排',
'      社交: 对熟人放松得慢，对越界要求会直接把话说明白',
'      复杂反差: 待补充',
'',
'    行为指导:',
'      行为红线禁令:',
'        - 不把她写成只围绕玩家存在的人',
'        - 当前所在位置、直播开关、好感和生理状态一律以MVU动态数据为准'].join('\n')}
function renderProfile(){var on=!!(state.wantCustom&&state.yaml);$('#generated').classList.toggle('on',on);
  if(on){var box=$('#profile-yaml');if(box.value!==state.yaml)box.value=state.yaml;
    $('#generated-meta').textContent='ENTRY · 角色详情：'+(value('#streamer-name')||'—')}
  updateBookPreview()}
function requestHostGeneration(payload){if(window.parent===window)return Promise.resolve(null);return new Promise(resolve=>{const id='profile-'+Date.now(),timer=setTimeout(()=>{removeEventListener('message',on);resolve(null)},12000);function on(e){const d=e.data;if(d?.channel==='linjiang-opening'&&d.kind==='response'&&d.id===id){clearTimeout(timer);removeEventListener('message',on);resolve(d.ok?d.payload?.yaml:null)}}addEventListener('message',on);parent.postMessage({channel:'linjiang-opening',kind:'request',id,action:'generateStreamerProfile',payload},'*')})}
async function generateProfile(){const d=streamerInput();if(!d.name||!d.handle){toast('先填写主播姓名和网名');return}
  const btn=$('#generate-profile'),status=$('#generate-status');btn.disabled=true;btn.textContent='生成中…';status.textContent='正在用酒馆当前模型生成';
  let external=null;try{external=await requestHostGeneration(d)}catch(_){}
  state.yaml=external||localYaml(d);
  setTimeout(()=>{renderProfile();btn.disabled=false;btn.textContent='重新生成';status.textContent=external?'已由酒馆模型生成，可直接改':'模型不可用，这是本地模板，需要自己补'},450)}
/* 世界书正文就是那段 YAML 本身，不再套一层我自己发明的 <自定义主播：…> 外壳：
   格式得跟 世界书/红蔷薇 那几条一致，才能被同一套读法认出来。 */
function worldbookText(){return state.wantCustom&&state.yaml?String(state.yaml).trim():''}
/* 我推那三样（关注／牌子等级／好感）只写 MVU，不写世界书。
   它们是会变的运行时数值：牌子等级由 累计打赏 重算、好感随剧情涨落。抄进世界书那份
   不会跟着变，第一次打赏之后就开始说谎，而且同一份数据两个出处，AI 不知道该信哪个。
   要给 AI 交代"有牌子不等于旧识"这类约束，该写在 世界书/真实直播规则 里，一次写死，
   不是每次开局生成一条。 */
function updateBookPreview(){const d=streamerInput(),custom=worldbookText();
  $('#book-name').textContent=custom?'角色详情：'+(d.name||'—'):'未追加自定义主播';
  $('#book-content').textContent=custom||'我推的关注、牌子和好感直接写进 MVU，不进世界书。\n只有追加自定义主播时，这里才会显示要写进世界书的 角色详情 YAML。'}
function syncInputs(){const n=value('#streamer-name'),h=value('#streamer-handle');$('#art-name').textContent=n||'新主播';$('#art-handle').textContent=(h||'STREAMER').toUpperCase();$('#art-monogram').textContent=(n||h||'S').slice(0,1)}
function validate(step){if(step===1&&!value('#player-name')){toast('请填写玩家姓名或常用称呼');return false}if(step===2&&!state.home){toast('请先从地图选择初始住所');return false}if(step===4&&state.wantCustom&&!state.yaml&&(value('#streamer-name')||value('#streamer-handle'))){toast('自定义主播还没生成人设档案；不想加就切到「跳过」');return false}return true}
function renderConfirm(){var player=value('#player-name')||'未命名玩家',handle=value('#player-handle')||'未设置网名',job=state.job,home=state.home;document.querySelector('#confirm-player').textContent=player;document.querySelector('#confirm-lines').innerHTML=[['玩家档案',player+' / '+state.gender+' / '+(value('#player-age')||24)+'岁'],['直播网名',handle],['初始住所',home?home.fullName+' / '+homeCostText(home):'未选择'],['初始工作',job.name],['收入与时间',job.monthly?'月薪约 RMB '+job.monthly.toLocaleString()+' / '+job.hours:'无固定收入'],['通勤估算',job.monthly?jobCommuteText(job):'无需通勤'],['我推的主播',oshiPicked().length?oshiPicked().map(function(o){return o.name+'（'+o.medal+' Lv.'+OSHI_BADGE+'）'}).join('、'):'一个都没选'],['开局粉丝身份',oshiPicked().length?'已关注 '+oshiPicked().length+' 人 / 各 好感 +'+OSHI_FAVOR+' / 累计打赏 ￥'+OSHI_TIPPED.toLocaleString('en-US'):'还不是任何人的粉丝'],['自定义主播',state.wantCustom&&state.yaml?value('#streamer-name')+' / '+value('#streamer-handle')+' / '+streamerInput().scale.label+' / 粉丝 '+bigNum(streamerInput().scale.followers):'未追加']].map(function(row){return '<div class="confirm-line"><span>'+row[0]+'</span><b>'+esc(row[1])+'</b></div>'}).join('');updateBookPreview()}
/* 第 4 步（自定义主播）是可选的：切到「跳过」时前后翻页都直接越过它。 */
function skipStep(step){return step===4&&!state.wantCustom}
function nextStep(from){var s=from+1;while(s<LAST_STEP&&skipStep(s))s+=1;return Math.min(LAST_STEP,s)}
function prevStep(from){var s=from-1;while(s>1&&skipStep(s))s-=1;return Math.max(1,s)}
/* direct=true 是"玩家点了步骤条上那一格"：这时候不许再跳过，
   否则第 4 步被跳过之后，那个「要追加」的开关就永远够不着了。 */
function go(step,direct){if(step>state.step&&!validate(state.step))return;step=Math.max(1,Math.min(LAST_STEP,step));if(!direct&&skipStep(step))step=step>state.step?nextStep(step):prevStep(step);state.step=step;document.body.classList.toggle('life-map-step',state.step===2);
  /* 02/03/04 三步内容最多，之前在 1440×900 上分别要多滚 524 / 676 / 948 px。
     这个类把外框（header / steps / footer / 留白）压薄、把主体改成横排，
     让这三步在常见 PC 屏幕上直接装下，具体规则见 opening.css 末尾那一节。 */
  document.body.classList.toggle('compact-step',state.step>=2);
  /* 05 跟 02 一样要"撑满一屏"：左边档案、右边世界书正文各自内部滚，
     而不是让整页跟着最长的那一列长。 */
  document.body.classList.toggle('confirm-step',state.step===LAST_STEP);
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',+p.dataset.panel===state.step));renderSteps();$('#prev').classList.toggle('hidden',state.step===1);$('#next').textContent=state.step===LAST_STEP?'生成开局配置':'继续';if(state.step===LAST_STEP)renderConfirm();if(state.step===2)setTimeout(function(){var api=openingMapApi();try{if(api)api.fitAll(0)}catch(_){}},80);scrollTo({top:0,behavior:'smooth'})}
function emptyExperience(){return{近期性经验次数:0,露出经验:0,自慰经验:0,排泄调教经验:0,道具调教经验:0,凌辱调教经验:0,隐奸经验:0,青奸经验:0,睡奸经验:0,催眠奸经验:0,情趣扮演经验:0,盗摄经验:0,性直播经验:0}}
function emptyDevelopment(){return{口腔:{档位:0,评语:''},胸:{档位:0,评语:''},小穴:{档位:0,评语:''},肛门:{档位:0,评语:''}}}
function commuteForCurrentJob(){return state.job&&state.job.node?quoteFor(state.job):null}
/* 粉丝身份的字段形状对齐 酒馆变量/mvuzod.js 的 fanSchema：多写的键会被 Schema 丢掉，
   少写的键会被补默认值，所以这里一次写全。牌子等级由 累计打赏 决定（见 OSHI_TIPPED），
   牌子档位是"大航海"那条线、跟等级无关，开局不给。 */
function fanRecord(){return{'关注':true,'累计打赏':OSHI_TIPPED,'牌子等级':OSHI_BADGE,'牌子档位':'无','牌子剩余天数':0,'房管':false,'禁言中':false,'禁言剩余天数':0}}
function openingPayload(){var d=streamerInput(),pname=value('#player-name'),job=state.job,commute=commuteForCurrentJob(),picked=oshiPicked(),hasCustom=!!(state.wantCustom&&state.yaml),mvu={'世界信息':{'年历':'2026年4月1日','时间':{'时钟':'08:00','时段':'朝'},'位置':{'区域':state.home.fullName,'场所':'家中'}},'玩家信息':{'档案':{'姓名':pname,'性别':state.gender,'年龄':+value('#player-age')||24,'网名':value('#player-handle'),'补充设定':value('#player-note')},'体力':100,'金钱':20000,'工作':{'职业':job.place?job.name:null,'地点':job.place,'日收入':job.daily,'工作时间':job.place?job.hours:null,'今日已上班':false,'通勤':commute?{'方式':'公交优先','分钟':commute.min,'距离公里':commute.km,'费用':commute.yuan}:null},'居住地':state.home.fullName,'房产':{[state.home.name]:{'名称':state.home.name,'区域':state.home.fullName,'产权':state.home.tenure,'描述':state.home.note,'月租':state.home.rent||0,'押金':state.home.deposit||0,'售价':state.home.sale||0,'费用说明':homeCostText(state.home)}},'粉丝身份':{}}};
  var girls={};
  /* 固定主播：只改动开局要动的两处——好感和粉丝身份。其余字段留给 变量初始化。
     好感是绝对值，不是增量：初始 80 + OSHI_FAVOR。 */
  picked.forEach(function(o){mvu['玩家信息']['粉丝身份'][o.name]=fanRecord();girls[o.name]={'羁绊':{'好感度':80+OSHI_FAVOR}}});
  if(hasCustom){
    /* 对象信息.<名> 要按 mvuzod.js 的 girlSchema 一次写全六块（羁绊/位置/性经历/
       开发度/生理/直播），跟 变量初始化 给那七位的形状一致——少写的键 Schema 会补默认值，
       但那样 HUD 和状态栏读到的就是一堆 0 和空串，看不出是"新人"还是"没初始化"。
       只有开发度的评语留空：那是要按角色写的文字，交给后续剧情或世界书。

       直播间没有人数，只有热度。粉丝数是公开事实、AI 该知道，所以跟 开播/标题/热度
       一起放在 直播 里；开局未开播，热度写 0。 */
    girls[d.name]={
      '羁绊':{'好感度':0,'顺从度':0,'心情':'开朗'},
      // 场所写"家中"，所以私密度按自宅给 5；之后由辅助计算脚本按区域和场所重算
      '位置':{'区域':d.home||'','场所':'家中','私密度':5},
      '性经历':emptyExperience(),
      '开发度':emptyDevelopment(),
      '生理':{'性欲度':0,'体力':100,'尿意':20,'异常状态':[]},
      '直播':{'开播':false,'标题':'','热度':0,'粉丝数':d.scale.followers}
    };
    /* 档期、牌子名、底盘热度、大航海是后台账，只进 系统配置.直播间.<名>，不摊给模型。
       种子、还手预算、连送不在这里给：玩家第一次进这间房时由辅助计算脚本的
       seedRoom 生成，那时候才知道要抽哪几个 NPC。 */
    mvu['系统配置']={'直播间':{[d.name]:{
      '档期':d.hours||'不固定',
      '牌子名':d.medal||d.handle||d.name,
      '体量档位':d.scale.tier,
      '底盘热度':d.scale.base,
      '本场热度':0,
      '高能榜':[],
      '大航海':{'舰长':d.scale.guards,'提督':d.scale.admirals,'总督':d.scale.governors,'名单':[]}
    }}};
  }
  if(Object.keys(girls).length)mvu['对象信息']=girls;
  var books=[];
  /* sourceName 是 upsert 的依据：开局.html 用它拼「角色详情：<名>」并在世界书里查重，
     所以给的是主播本名，不是带斜杠的展示标题。 */
  if(hasCustom)books.push({sourceName:d.name,name:d.name,keys:[d.name,d.handle].filter(Boolean),content:worldbookText()});
  return{mvu:mvu,oshi:picked.map(function(o){return{name:o.name,medal:o.medal,badge:OSHI_BADGE,favor:80+OSHI_FAVOR,tipped:OSHI_TIPPED}}),worldbook:books[books.length-1]||null,worldbooks:books,ui:hasCustom?{name:d.name,handle:d.handle,art:state.art}:null}}
function finish(){const payload=openingPayload();if(window.parent!==window)parent.postMessage({channel:'linjiang-opening',kind:'event',type:'commitPreview',payload},'*');navigator.clipboard?.writeText(JSON.stringify(payload,null,2)).catch(()=>{});console.log('[临江开局配置]',payload);toast('开局配置已生成，并已尝试复制到剪贴板')}
renderSteps();renderMapInspector();renderOshi();renderTags();setWantCustom(false);renderScale();go(1);var initialMap=document.querySelector('#opening-map-iframe');if(initialMap&&!initialMap.getAttribute('src')){initialMap.src=MAP_URL+'&target=home';initialMap.addEventListener('load',function(){setTimeout(bindOpeningFrame,200)})}
$('#gender-segment').onclick=e=>{const b=e.target.closest('button');if(!b)return;state.gender=b.dataset.value;$('#gender-segment').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b))};
document.querySelectorAll('[data-open-map]').forEach(b=>b.onclick=()=>openMap(b.dataset.openMap));
$('#map-close').onclick=closeMap;$('#map-modal').onclick=e=>{if(e.target===$('#map-modal'))closeMap()};
renderMapQuick();
$('#map-iframe').addEventListener('load',()=>setTimeout(bindFrame,350));document.querySelector('#map-home-mode').onclick=()=>setOpeningTarget('player');document.querySelector('#map-work-mode').onclick=()=>setOpeningTarget('work');document.querySelector('#change-home').onclick=()=>setOpeningTarget('player');document.querySelector('#change-work').onclick=()=>setOpeningTarget('work');document.querySelector('#map-fullscreen').onclick=toggleMapFullscreen;document.addEventListener('fullscreenchange',syncMapFullscreen);
addEventListener('message',e=>{const d=e.data;if(d?.channel==='linjiang-map'&&d.type==='pick')handleMapPick(d.payload)});
$('#streamer-tier').oninput=renderScale;
$('#custom-toggle').onclick=e=>{const b=e.target.closest('button');if(!b)return;setWantCustom(b.dataset.value==='on')};
$('#profile-yaml').addEventListener('input',e=>{state.yaml=e.target.value;updateBookPreview()});
['#streamer-name','#streamer-handle'].forEach(id=>$(id).addEventListener('input',syncInputs));
$('#apply-art-url').onclick=()=>{const u=value('#art-url');if(!u)return toast('先填写网络立绘链接');updateArt(u,'url')};
$('#art-file').onchange=e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>updateArt(r.result,'upload-preview');r.readAsDataURL(f)};
$('#generate-profile').onclick=generateProfile;$('#prev').onclick=()=>go(prevStep(state.step));$('#next').onclick=()=>state.step===LAST_STEP?finish():go(nextStep(state.step));
})();
