(()=>{
const MAP_REV='20260822-starter-homes-v1';
const DEFAULT_MAP=`./city/plate_map.html?mode=opening&v=${MAP_REV}`;
const MAP_URL=new URLSearchParams(location.search).get('map')||DEFAULT_MAP;
const STEPS=['关于你','住所与工作','我推的主播','自定义主播','确认'];
const LAST_STEP=STEPS.length;
const ART_HOST='https://anchor.bolt.qzz.io';
const art=(folder,file)=>ART_HOST+'/'+encodeURIComponent(folder)+'/'+encodeURIComponent(file)+'.webp';
/* 固定主播池。名字／牌子名／直播档／封面文件名对齐 外部部署/正文美化.html 的
   LR_HOSTS，住所对齐 酒馆变量/变量初始化，tier 是按下面那条体量曲线反解出来的
   参考值（只用于卡片上给玩家一个量级感，不写回 MVU）。 */
const OSHI=[
{name:'塔菲',cover:'塔菲',medal:'雏草姬',slot:'晚间主档 20:00–23:30',area:'西洲区 · 云庭公寓',tags:['杂谈','游戏'],tier:71,blurb:'抽象系头部主播，夹子音开麦、满嘴贴吧黑话，弹幕节奏最快的那一间。'},
{name:'东雪莲',cover:'东雪莲',medal:'棺人痴',slot:'深夜杂谈 21:30–00:30',area:'鼓岭区 · 云庭公寓',tags:['杂谈','唱歌'],tier:53,blurb:'做原创音乐的深夜档，脾气直，跟黑粉对线从不含糊。'},
{name:'沙花叉',cover:'沙花叉',medal:'饲养员',slot:'历史常用晚间档 21:00–00:30',area:'明湖区 · 明湖云阙',tags:['杂谈','唱歌','游戏'],tier:51,blurb:'慵懒声线的清扫屋，开播随缘，来了就是一整晚。'},
{name:'时雨羽衣',cover:'时雨羽衣',medal:'雨户',slot:'周更型 22:00–00:30',area:'鼓岭区 · 梧桐里',tags:['绘画','杂谈'],tier:38,blurb:'画师主播，一周只播两三次，播了就是长夜画稿加碎嘴。'},
{name:'红蔷薇',cover:'红蔷薇',medal:'亲爱的',slot:'黄昏音乐台 19:00–22:00',area:'西洲区 · 西洲永初里',tags:['唱歌','舞蹈','杂谈'],tier:48,blurb:'不死鸟剧院的舞者，兼职开播，说话像在台上念独白。'},
{name:'斯黛拉',cover:'斯黛拉',medal:'小猪',slot:'傍晚电台 18:30–21:30',area:'落霞区 · 学府七舍天台',tags:['ASMR','杂谈'],tier:49,blurb:'声音又轻又小的女学生，凌晨那段哄睡 ASMR 是招牌。'},
{name:'璃亚梦',cover:'梦见璃亚梦',medal:'病友',slot:'深夜互动 23:00–02:00',area:'鼓岭区 · 云庭公寓',tags:['杂谈','唱歌'],tier:58,blurb:'炎上体质的偶像兼主播，深夜小作文和突发开播都是常事。'}];
const OSHI_MAX=3;
const OSHI_FAVOR=300;    // 选中即加的好感，叠在 变量初始化 给的 80 上
const OSHI_BADGE=8;      // 目标牌子等级
/* 牌子等级是 累计打赏 的函数，不是独立字段：辅助计算脚本.js 每次变量更新都会用
   floor(20*(打赏/200000)^(1/3.5)) 重算它。想稳定拿到 8 级，只能把打赏写成
   反解出来的那个数——8100 正好落在 8 级的下沿。 */
const OSHI_TIPPED=8100;
const HOMES=[
{id:'lx_share',name:'落霞合租屋',fullName:'落霞区 / 落霞合租屋',district:'落霞区',tenure:'合租',note:'大学城南的普通两居合租，租金低，隔音一般',rent:1800,deposit:3600,cost:'月租 RMB 1,800 / 押二付一'},
{id:'pj_apt',name:'浦江人才公寓',fullName:'雨石与浦江区 / 浦江人才公寓',district:'雨石与浦江区',tenure:'租住',note:'园区外的小户型人才公寓，适合园区通勤',rent:2600,deposit:5200,cost:'月租 RMB 2,600 / 押二付一'},
{id:'gl_yunting',name:'鼓岭云庭公寓',fullName:'鼓岭区 / 鼓岭云庭公寓',district:'鼓岭区',tenure:'租住',note:'老城精装单间，日常配套完整',rent:3200,deposit:6400,cost:'月租 RMB 3,200 / 押二付一'},
{id:'xz_jiayuan',name:'西洲嘉苑',fullName:'西洲区 / 西洲嘉苑',district:'西洲区',tenure:'租住',note:'靠近直播产业带的高层单间',rent:3900,deposit:7800,cost:'月租 RMB 3,900 / 押二付一'},
{id:'gl_wutong',name:'梧桐里步行房',fullName:'鼓岭区 / 梧桐里',district:'鼓岭区',tenure:'租住',note:'老城区步行房，生活方便，楼梯和邻里声较近',rent:2200,deposit:4400,cost:'月租 RMB 2,200 / 押二付一'},
{id:'pj_village',name:'浦江城中村单间',fullName:'雨石与浦江区 / 浦江城中村',district:'雨石与浦江区',tenure:'租住',note:'租金最低，离园区近，公共空间紧凑',rent:1500,deposit:3000,cost:'月租 RMB 1,500 / 押二付一'},
{id:'wx_home',name:'乌溪自宅',fullName:'乌溪区 / 乌溪自宅',district:'乌溪区',tenure:'自有',note:'带小型药剂工坊的自有住宅',rent:0,deposit:0,cost:'自有房产 / 无月租'},
{id:'mh_youth_apt',name:'明湖青年公寓',fullName:'明湖区 / 明湖青年公寓',district:'明湖区',tenure:'租住',note:'城区小单间，公交和生活配套方便',rent:3200,deposit:3200,cost:'月租 RMB 3,200 / 押一付一'},
{id:'dt_town_rental',name:'东塘镇口出租屋',fullName:'东塘区 / 东塘镇口出租屋',district:'东塘区',tenure:'租住',note:'镇口低租单间，生活成本低但进城较远',rent:1400,deposit:1400,cost:'月租 RMB 1,400 / 押一付一'},
{id:'qp_foothill_share',name:'青屏山脚合租院',fullName:'青屏山风景区 / 青屏山脚合租院',district:'青屏山风景区',tenure:'合租',note:'独立卧室、共用厨房，末班公交较早',rent:1800,deposit:1800,cost:'月租 RMB 1,800 / 押一付一'}];
const JOBS=[
{name:'暂时无业',place:null,node:null,monthly:0,daily:0,hours:'自由安排',kind:'free'},
{name:'打印店店员',place:'落霞区 / 落霞打印店',node:'lx_print',monthly:4500,daily:205,hours:'09:00-18:00',kind:'service'},
{name:'快递驿站店员',place:'鼓岭区 / 鼓岭快递驿站',node:'gl_parcel',monthly:4800,daily:220,hours:'08:30-18:30',kind:'service'},
{name:'便利店店员',place:'明湖区 / 明湖通宵便利',node:'mh_mart',monthly:4700,daily:215,hours:'14:00-22:00',kind:'service'},
{name:'电竞舱值班员',place:'西洲区 / 星芒电竞训练直播舱',node:'xz_esports',monthly:5200,daily:235,hours:'16:00-00:00',kind:'live'},
{name:'加油站夜班店员',place:'东塘区 / 东塘加油站',node:'dt_gas',monthly:5600,daily:255,hours:'20:00-06:00',kind:'service'},
{name:'录音棚助理',place:'西洲区 / 极光数码声学录音棚',node:'xz_sound_studio',monthly:5400,daily:245,hours:'11:00-20:00',kind:'live'},
{name:'剧院场务',place:'西洲区 / 西洲大剧院',node:'xz_theatre',monthly:4600,daily:210,hours:'13:00-22:00',kind:'live'},
{name:'宠物诊疗所助理',place:'鼓岭区 / 梧桐里宠物医疗中心',node:'gl_pet',monthly:5000,daily:225,hours:'10:00-19:00',kind:'medical'},
{name:'医院前台助理',place:'明湖区 / 明湖中心医院',node:'mh_hospital',monthly:5800,daily:260,hours:'08:00-17:00',kind:'medical'},
{name:'实验楼值班助理',place:'落霞区 / 落霞实验楼',node:'lx_lab',monthly:6000,daily:270,hours:'18:00-02:00',kind:'academy'},
{name:'研创园行政助理',place:'雨石与浦江区 / 浦江研创园',node:'ys_rdpark',monthly:6200,daily:280,hours:'09:30-18:30',kind:'office'},
{name:'扎染作坊学徒',place:'乌溪区 / 乌溪扎染作坊',node:'wx_dye',monthly:4200,daily:190,hours:'10:00-19:00',kind:'craft'}];
const CATEGORIES=['杂谈','游戏','唱歌','ASMR','绘画','舞蹈','户外','美食','虚拟主播','综合内容'];
const PROFILE_FIELDS=['一句话定位','外貌','公开形象','真实性格','说话方式','直播风格','兴趣与擅长','生活习惯','喜恶与雷区','个人经历','对观众的态度','线上线下差异'];
const state={step:1,gender:'男性',home:null,job:JOBS[0],mapTarget:'player',oshi:[],wantCustom:false,categories:new Set(['杂谈']),profile:null,art:{type:'',src:''},streamerHome:null};
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
function clampTier(t){t=Math.round(+t||0);return Math.max(0,Math.min(100,t))}
function tierLabel(t){return t<20?'小透明':t<40?'小有关注':t<60?'稳定主播':t<80?'热门主播':t<95?'头部主播':'现象级'}
function roundNice(n){n=Math.max(0,Math.round(+n||0));if(n>=100000)return Math.round(n/1000)*1000;if(n>=10000)return Math.round(n/100)*100;if(n>=1000)return Math.round(n/10)*10;return n}
function streamScale(t){t=clampTier(t);var base=50*Math.pow(8,t/25),followers=base*(60-0.42*t),guards=followers*(0.0012+0.000038*t);
  /* 提督、总督减去门槛再除，小房两档干净归零；比值比草稿更保守（24:1 / 260:1） */
  return{tier:t,label:tierLabel(t),followers:roundNice(followers),base:roundNice(base),guards:roundNice(guards),
    admirals:Math.max(0,Math.floor((guards-40)/24)),governors:Math.max(0,Math.floor((guards-300)/260))}}
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
      /* 七个人的体量用跟自定义主播同一根尺子标出来，玩家才知道"头部"和"周更"差多少 */
      +'<span class="oshi-scale">'+esc(streamScale(o.tier).label)+' · 粉丝 '+bigNum(streamScale(o.tier).followers)+'</span>'
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
  if(!state.wantCustom)state.profile=null;
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
function handleMapPick(node){if(!node||!node.id)return;var knownHome=HOMES.find(function(h){return h.id===node.id});if(state.mapTarget==='player'){if(knownHome)return setHome(Object.assign({},knownHome,{name:node.name,fullName:node.fullName||knownHome.fullName,district:node.district||knownHome.district}));toast('请点击地图上的粉色住宅节点');return}if(state.mapTarget==='work'){var knownJob=JOBS.find(function(j){return j.node===node.id});if(knownJob)return setJob(knownJob);toast('请选择已加入开局岗位池的工作节点');return}if(state.mapTarget==='streamer'&&node.archetype==='living')return setHome({id:node.id,name:node.name,fullName:node.fullName||node.district+' / '+node.name,district:node.district,tenure:'租住',note:node.draw||'从地图选择的居住地点',rent:0,deposit:0,cost:'费用由开局后设定'},'streamer');toast('请选择住所类地点')}
function updateArt(src,type){state.art={src,type};const box=$('#art-preview'),img=$('#art-img');if(src){img.src=src;box.classList.add('has')}else{img.removeAttribute('src');box.classList.remove('has')}}
function streamerInput(){const s=streamScale($('#streamer-tier').value);return{name:value('#streamer-name'),handle:value('#streamer-handle'),age:+value('#streamer-age')||23,home:state.streamerHome?.fullName||'',categories:[...state.categories],scale:s,hours:value('#streamer-hours'),tone:value('#streamer-tone'),seed:value('#streamer-seed'),medal:value('#streamer-medal')}}
function localProfile(d){const focus=d.categories.join('、'),seed=d.seed||'她有完整的工作与私人生活，不会只围绕某个观众行动。';return{
'一句话定位':`${d.handle||d.name}是一名以${focus}为主的主播，体量属于${d.scale.label}（粉丝约${bigNum(d.scale.followers)}、舰长约${d.scale.guards}），镜头前有稳定辨识度，线下仍过着具体而普通的城市生活。`,
'外貌':'外貌以玩家提供的立绘为准；日常穿着重视舒适与镜头效果，离开直播环境后会明显放松。',
'公开形象':`直播中保持清晰的内容节奏，擅长把零散话题接成自然的节目效果。${d.tone?`整体气质偏${d.tone}。`:''}`,
'真实性格':'有自己的判断、情绪和生活安排。对熟人会逐渐放松，对越界要求会直接拉开距离。',
'说话方式':'语气自然，回应会结合正在进行的内容；不会因为单条弹幕就停下整场直播。',
'直播风格':`常用内容为${focus}，常用直播时间${d.hours||'不固定'}。热度与观众规模会影响弹幕密度和被注意到的概率。`,
'兴趣与擅长':`围绕${focus}积累了稳定经验，也会在直播外保留不公开的私人爱好。`,
'生活习惯':`${d.home?`目前居住在${d.home}。`:''}开播前会做基础准备，下播后通常先处理设备、消息和第二天安排。`,
'喜恶与雷区':'重视个人隐私与现实边界；不喜欢观众以打赏为理由干涉私人生活。',
'个人经历':seed,
'对观众的态度':'会记住长期出现、发言有辨识度的观众，但公开直播中仍需平衡整个直播间。',
'线上线下差异':'镜头前更善于维持情绪和节奏；线下表达更直接，也有疲惫、走神和不想社交的时候。'}}function renderProfile(){const d=streamerInput();$('#generated').classList.toggle('on',!!state.profile);if(!state.profile)return;$('#profile-grid').innerHTML=PROFILE_FIELDS.map(k=>`<div class="field ${['一句话定位','个人经历'].includes(k)?'wide':''}"><label>${k}</label><textarea class="control" data-profile="${k}">${esc(state.profile[k]||'')}</textarea></div>`).join('');document.querySelectorAll('[data-profile]').forEach(t=>t.oninput=()=>{state.profile[t.dataset.profile]=t.value;updateBookPreview()});updateBookPreview()}
function requestHostGeneration(payload){if(window.parent===window)return Promise.resolve(null);return new Promise(resolve=>{const id='profile-'+Date.now(),timer=setTimeout(()=>{removeEventListener('message',on);resolve(null)},12000);function on(e){const d=e.data;if(d?.channel==='linjiang-opening'&&d.kind==='response'&&d.id===id){clearTimeout(timer);removeEventListener('message',on);resolve(d.ok?d.payload?.profile:null)}}addEventListener('message',on);parent.postMessage({channel:'linjiang-opening',kind:'request',id,action:'generateStreamerProfile',payload},'*')})}
async function generateProfile(){const d=streamerInput();if(!d.name||!d.handle){toast('先填写主播姓名和网名');return}const btn=$('#generate-profile'),status=$('#generate-status');btn.disabled=true;btn.textContent='生成中…';status.textContent='\u6b63\u5728\u751f\u6210\u6863\u6848';let external=null;try{external=await requestHostGeneration(d)}catch(_){}state.profile=external||localProfile(d);setTimeout(()=>{renderProfile();btn.disabled=false;btn.textContent='重新生成人设档案';status.textContent=external?'\u5df2\u751f\u6210':'\u5df2\u751f\u6210'},450)}
function worldbookText(){if(!state.wantCustom||!state.profile)return'';const d=streamerInput();return `<自定义主播：${d.name}／${d.handle}>\n\n基础资料:\n  姓名: ${d.name}\n  主播网名: ${d.handle}\n  年龄: ${d.age}\n  住所: ${d.home||'未设置'}\n  直播分类: [${d.categories.join(', ')}]\n  粉丝牌子名: ${d.medal||d.handle||d.name}\n  体量: ${d.scale.label}\n  粉丝数: ${d.scale.followers}\n  常态热度: ${d.scale.base}\n  大航海: 舰长 ${d.scale.guards} / 提督 ${d.scale.admirals} / 总督 ${d.scale.governors}\n  常用直播时间: ${d.hours||'不固定'}\n\n人设档案:\n${PROFILE_FIELDS.map(k=>`  ${k}: ${state.profile[k]||''}`).join('\n')}\n\n约束:\n  - 她拥有独立生活、工作、人际关系和判断，不围绕玩家单独存在\n  - 打赏、关注和舰长身份不直接换算为私人好感\n  - 当前所在位置、直播开关、好感和生理状态以MVU动态数据为准\n\n</自定义主播：${d.name}／${d.handle}>`}
function oshiWorldbookText(){var picked=oshiPicked();if(!picked.length)return'';
  return '<玩家的我推>\n\n'
    +'玩家开局就已经是下列主播的老观众。这不是恋爱关系，只是"看了很久、脸熟、有牌子"的粉丝身份。\n\n'
    +picked.map(function(o){return `${o.name}:\n  牌子: ${o.medal} ${OSHI_BADGE}级（累计打赏约 ￥${OSHI_TIPPED.toLocaleString('en-US')}）\n  关注: 已关注，开播会收到提醒\n  熟悉度: 好感 +${OSHI_FAVOR}，属于她认得出ID的常驻观众`}).join('\n\n')
    +'\n\n约束:\n'
    +'  - 牌子等级只说明玩家花过多少钱、看过多久，不代表私下认识或有过线下接触\n'
    +'  - 她仍然要平衡整个直播间，不会因为玩家有牌子就单独偏心，详见<真实直播规则>\n'
    +'  - 未列出的主播玩家还没进过她的直播间，不要写成旧识\n'
    +'  - 关注、牌子等级、累计打赏和好感的当前值以MVU动态数据为准\n\n'
    +'</玩家的我推>'}
function updateBookPreview(){const d=streamerInput(),custom=worldbookText(),oshi=oshiWorldbookText();
  const parts=[oshi,custom].filter(Boolean);
  const tag=custom?`自定义主播｜${d.name}／${d.handle}`+(oshi?' + 我推':''):(oshi?'玩家的我推':'尚未生成');
  $('#book-name').textContent=tag;
  $('#book-content').textContent=parts.join('\n\n\n')||'挑几个我推、或者追加一名自定义主播，这里会显示要写进世界书的正文。'}
function syncInputs(){const n=value('#streamer-name'),h=value('#streamer-handle');$('#art-name').textContent=n||'新主播';$('#art-handle').textContent=(h||'STREAMER').toUpperCase();$('#art-monogram').textContent=(n||h||'S').slice(0,1)}
function validate(step){if(step===1&&!value('#player-name')){toast('请填写玩家姓名或常用称呼');return false}if(step===2&&!state.home){toast('请先从地图选择初始住所');return false}if(step===4&&state.wantCustom&&!state.profile&&(value('#streamer-name')||value('#streamer-handle'))){toast('自定义主播还没生成人设档案；不想加就切到「跳过」');return false}return true}
function renderConfirm(){var player=value('#player-name')||'未命名玩家',handle=value('#player-handle')||'未设置网名',job=state.job,home=state.home;document.querySelector('#confirm-player').textContent=player;document.querySelector('#confirm-lines').innerHTML=[['玩家档案',player+' / '+state.gender+' / '+(value('#player-age')||24)+'岁'],['直播网名',handle],['初始住所',home?home.fullName+' / '+homeCostText(home):'未选择'],['初始工作',job.name],['收入与时间',job.monthly?'月薪约 RMB '+job.monthly.toLocaleString()+' / '+job.hours:'无固定收入'],['通勤估算',job.monthly?jobCommuteText(job):'无需通勤'],['我推的主播',oshiPicked().length?oshiPicked().map(function(o){return o.name+'（'+o.medal+' Lv.'+OSHI_BADGE+'）'}).join('、'):'一个都没选'],['开局粉丝身份',oshiPicked().length?'已关注 '+oshiPicked().length+' 人 / 各 好感 +'+OSHI_FAVOR+' / 累计打赏 ￥'+OSHI_TIPPED.toLocaleString('en-US'):'还不是任何人的粉丝'],['自定义主播',state.wantCustom&&state.profile?value('#streamer-name')+' / '+value('#streamer-handle')+' / '+streamerInput().scale.label+' / 粉丝 '+bigNum(streamerInput().scale.followers):'未追加']].map(function(row){return '<div class="confirm-line"><span>'+row[0]+'</span><b>'+esc(row[1])+'</b></div>'}).join('');updateBookPreview()}
/* 第 4 步（自定义主播）是可选的：切到「跳过」时前后翻页都直接越过它。 */
function skipStep(step){return step===4&&!state.wantCustom}
function nextStep(from){var s=from+1;while(s<LAST_STEP&&skipStep(s))s+=1;return Math.min(LAST_STEP,s)}
function prevStep(from){var s=from-1;while(s>1&&skipStep(s))s-=1;return Math.max(1,s)}
/* direct=true 是"玩家点了步骤条上那一格"：这时候不许再跳过，
   否则第 4 步被跳过之后，那个「要追加」的开关就永远够不着了。 */
function go(step,direct){if(step>state.step&&!validate(state.step))return;step=Math.max(1,Math.min(LAST_STEP,step));if(!direct&&skipStep(step))step=step>state.step?nextStep(step):prevStep(step);state.step=step;document.body.classList.toggle('life-map-step',state.step===2);document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',+p.dataset.panel===state.step));renderSteps();$('#prev').classList.toggle('hidden',state.step===1);$('#next').textContent=state.step===LAST_STEP?'生成开局配置':'继续';if(state.step===LAST_STEP)renderConfirm();if(state.step===2)setTimeout(function(){var api=openingMapApi();try{if(api)api.fitAll(0)}catch(_){}},80);scrollTo({top:0,behavior:'smooth'})}
function emptyExperience(){return{近期性经验次数:0,露出经验:0,自慰经验:0,排泄调教经验:0,道具调教经验:0,凌辱调教经验:0,隐奸经验:0,青奸经验:0,睡奸经验:0,催眠奸经验:0,情趣扮演经验:0,盗摄经验:0,性直播经验:0}}
function emptyDevelopment(){return{口腔:{档位:0,评语:''},胸:{档位:0,评语:''},小穴:{档位:0,评语:''},肛门:{档位:0,评语:''}}}
function commuteForCurrentJob(){return state.job&&state.job.node?quoteFor(state.job):null}
/* 粉丝身份的字段形状对齐 酒馆变量/mvuzod.js 的 fanSchema：多写的键会被 Schema 丢掉，
   少写的键会被补默认值，所以这里一次写全。牌子等级由 累计打赏 决定（见 OSHI_TIPPED），
   牌子档位是"大航海"那条线、跟等级无关，开局不给。 */
function fanRecord(){return{'关注':true,'累计打赏':OSHI_TIPPED,'牌子等级':OSHI_BADGE,'牌子档位':'无','牌子剩余天数':0,'房管':false,'禁言中':false,'禁言剩余天数':0}}
function openingPayload(){var d=streamerInput(),pname=value('#player-name'),job=state.job,commute=commuteForCurrentJob(),picked=oshiPicked(),hasCustom=!!(state.wantCustom&&state.profile),mvu={'世界信息':{'年历':'2026年4月1日','时间':{'时钟':'08:00','时段':'朝'},'位置':{'区域':state.home.fullName,'场所':'家中'}},'玩家信息':{'档案':{'姓名':pname,'性别':state.gender,'年龄':+value('#player-age')||24,'网名':value('#player-handle'),'补充设定':value('#player-note')},'体力':100,'金钱':20000,'工作':{'职业':job.place?job.name:null,'地点':job.place,'日收入':job.daily,'工作时间':job.place?job.hours:null,'今日已上班':false,'通勤':commute?{'方式':'公交优先','分钟':commute.min,'距离公里':commute.km,'费用':commute.yuan}:null},'居住地':state.home.fullName,'房产':{[state.home.name]:{'名称':state.home.name,'区域':state.home.fullName,'产权':state.home.tenure,'描述':state.home.note,'月租':state.home.rent||0,'押金':state.home.deposit||0,'售价':state.home.sale||0,'费用说明':homeCostText(state.home)}},'粉丝身份':{}}};
  var girls={};
  /* 固定主播：只改动开局要动的两处——好感和粉丝身份。其余字段留给 变量初始化。
     好感是绝对值，不是增量：初始 80 + OSHI_FAVOR。 */
  picked.forEach(function(o){mvu['玩家信息']['粉丝身份'][o.name]=fanRecord();girls[o.name]={'羁绊':{'好感度':80+OSHI_FAVOR}}});
  if(hasCustom){
    /* 直播间没有人数，只有热度。粉丝数是主播的公开事实，AI 该知道，所以跟
       开播/标题/热度一起放在 对象信息.<名>.直播；开局未开播，热度写 0。 */
    girls[d.name]={'羁绊':{'好感度':0,'顺从度':0,'心情':'开朗'},'位置':{'区域':d.home,'场所':'家中'},'性经历':emptyExperience(),'开发度':emptyDevelopment(),'生理':{'性欲度':0,'体力':100,'尿意':20,'异常状态':[]},'直播':{'开播':false,'标题':'','热度':0,'粉丝数':d.scale.followers}};
    /* 底盘热度、本场虚火、高能榜、大航海是后台账，只进 系统配置.直播间.<名>，
       不摊给模型。键名跟 正文美化.html 的 lrRoomCfg 读的是同一处。 */
    mvu['系统配置']={'直播间':{[d.name]:{'牌子名':d.medal||d.handle||d.name,'体量档位':d.scale.tier,'底盘热度':d.scale.base,'本场热度':0,'高能榜':[],'大航海':{'舰长':d.scale.guards,'提督':d.scale.admirals,'总督':d.scale.governors,'名单':[]}}}};
  }
  if(Object.keys(girls).length)mvu['对象信息']=girls;
  var books=[];
  if(picked.length)books.push({name:'玩家的我推',keys:picked.map(function(o){return o.name}).concat(['我推','牌子','粉丝身份']),content:oshiWorldbookText()});
  if(hasCustom)books.push({name:'自定义主播 / '+d.name+' / '+d.handle,keys:[d.name,d.handle],content:worldbookText()});
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
['#streamer-name','#streamer-handle'].forEach(id=>$(id).addEventListener('input',syncInputs));
$('#apply-art-url').onclick=()=>{const u=value('#art-url');if(!u)return toast('先填写网络立绘链接');updateArt(u,'url')};
$('#art-file').onchange=e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>updateArt(r.result,'upload-preview');r.readAsDataURL(f)};
$('#generate-profile').onclick=generateProfile;$('#prev').onclick=()=>go(prevStep(state.step));$('#next').onclick=()=>state.step===LAST_STEP?finish():go(nextStep(state.step));
})();
