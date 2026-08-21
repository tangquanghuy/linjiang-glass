(()=>{
const MAP_REV='20260821-requirements-v3';
const DEFAULT_MAP=`./city/plate_map.html?mode=opening&v=${MAP_REV}`;
const MAP_URL=new URLSearchParams(location.search).get('map')||DEFAULT_MAP;
const STEPS=['关于你','住所与工作','自定义主播','确认'];
const HOMES=[
{id:'lx_share',name:'落霞合租屋',fullName:'落霞区 · 落霞合租屋',tenure:'租住',note:'大学城南的普通两居合租。'},
{id:'pj_apt',name:'浦江人才公寓',fullName:'雨石与浦江区 · 浦江人才公寓',tenure:'租住',note:'园区外的小户型人才公寓。'},
{id:'gl_yunting',name:'鼓岭云庭公寓',fullName:'鼓岭区 · 鼓岭云庭公寓',tenure:'租住',note:'老城精装单间，日常配套完整。'},
{id:'xz_jiayuan',name:'西洲嘉苑',fullName:'西洲区 · 西洲嘉苑',tenure:'租住',note:'西洲高层住宅中的普通单间。'}];
const JOBS=[
{name:'暂时无业',place:null,monthly:0,daily:0,hours:'自由安排'},
{name:'打印店店员',place:'落霞区 · 落霞打印店',node:'lx_print',monthly:4500,daily:205,hours:'09:00-18:00'},
{name:'快递驿站店员',place:'鼓岭区 · 鼓岭快递驿站',node:'gl_parcel',monthly:4800,daily:220,hours:'08:30-18:30'},
{name:'便利店店员',place:'明湖区 · 明湖通宵便利',node:'mh_mart',monthly:4700,daily:215,hours:'14:00-22:00'},
{name:'电竞舱值班员',place:'西洲区 · 星芒电竞训练直播舱',node:'xz_esports',monthly:5200,daily:235,hours:'16:00-00:00'},
{name:'加油站夜班店员',place:'东塘区 · 东塘加油站',node:'dt_gas',monthly:5600,daily:255,hours:'20:00-06:00'}];
const CATEGORIES=['杂谈','游戏','唱歌','ASMR','绘画','舞蹈','户外','美食','虚拟主播','综合内容'];
const PROFILE_FIELDS=['一句话定位','外貌','公开形象','真实性格','说话方式','直播风格','兴趣与擅长','生活习惯','喜恶与雷区','个人经历','对观众的态度','线上线下差异'];
const state={step:1,gender:'男性',home:null,job:JOBS[0],mapTarget:'player',categories:new Set(['杂谈']),profile:null,art:{type:'',src:''},streamerHome:null};
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const value=id=>$(id).value.trim();
let toastTimer=0;
function toast(text){const el=$('#toast');el.textContent=text;el.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('on'),2200)}
function heatLabel(n){return n<20?'小透明':n<40?'小有关注':n<60?'稳定主播':n<80?'热门主播':n<95?'头部主播':'现象级'}
function renderSteps(){$('#steps').innerHTML=STEPS.map((s,i)=>`<button class="step-tab ${state.step===i+1?'active':''} ${state.step>i+1?'done':''}" data-step="${i+1}"><span>0${i+1}</span><b>${s}</b></button>`).join('');document.querySelectorAll('.step-tab').forEach(b=>b.onclick=()=>go(+b.dataset.step))}
function renderJobs(){$('#jobs').innerHTML=JOBS.map((j,i)=>`<button class="job ${state.job===j?'on':''} ${i===0?'nojob':''}" data-job="${i}"><h4>${esc(j.name)}</h4><div class="where">${j.place?esc(j.place):'开局后可在地图中自行寻找工作'}</div><div class="pay"><strong>${j.monthly?`￥${j.monthly.toLocaleString()}`:'无固定收入'}</strong>${j.monthly?'<span>/ 月</span>':''}</div><div class="job-time">${j.monthly?`折算日收入 ￥${j.daily} · `:''}${esc(j.hours)}</div></button>`).join('');document.querySelectorAll('[data-job]').forEach(b=>b.onclick=()=>{state.job=JOBS[+b.dataset.job];renderJobs()})}
function renderTags(){$('#category-tags').innerHTML=CATEGORIES.map(c=>`<button type="button" class="tag ${state.categories.has(c)?'on':''}" data-cat="${c}">${c}</button>`).join('');document.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{const c=b.dataset.cat;state.categories.has(c)?state.categories.delete(c):state.categories.add(c);if(!state.categories.size)state.categories.add('杂谈');renderTags()})}
function setHome(home,target=state.mapTarget){if(target==='player'){state.home=home;$('#home-name').textContent=home.name;$('#home-name').classList.remove('empty');$('#home-meta').textContent=`${home.fullName} · ${home.tenure} · ${home.note}`}else{state.streamerHome=home;$('#streamer-home').textContent=home.fullName}closeMap();toast(`${target==='player'?'初始住所':'主播住所'}已选择：${home.name}`)}
function openMap(target){state.mapTarget=target;$('#map-title').textContent=target==='player'?'选择玩家初始住所':'选择自定义主播住所';$('#map-modal').classList.add('on');const frame=$('#map-iframe');if(!frame.src)frame.src=MAP_URL}
function closeMap(){$('#map-modal').classList.remove('on')}
function bindFrame(){const frame=$('#map-iframe');try{const api=frame.contentWindow.PLATE_MAP;if(api)api.onPick(node=>handleMapPick(node))}catch(_){}}
function handleMapPick(node){if(!node?.id)return;const known=HOMES.find(h=>h.id===node.id);if(known)return setHome(known);if(state.mapTarget==='streamer'&&node.archetype==='living')return setHome({id:node.id,name:node.name,fullName:node.fullName||`${node.district} · ${node.name}`,tenure:'居住',note:node.draw||'从地图选择的居住地点。'});toast(state.mapTarget==='player'?'该地点不在标准开局住所池中':'请选择住宅类地点')}
function updateArt(src,type){state.art={src,type};const box=$('#art-preview'),img=$('#art-img');if(src){img.src=src;box.classList.add('has')}else{img.removeAttribute('src');box.classList.remove('has')}}
function streamerInput(){const heat=+$('#streamer-heat').value;return{name:value('#streamer-name'),handle:value('#streamer-handle'),age:+value('#streamer-age')||23,home:state.streamerHome?.fullName||'',categories:[...state.categories],heat,heatLabel:heatLabel(heat),followers:+value('#streamer-followers')||0,captains:+value('#streamer-captains')||0,hours:value('#streamer-hours'),tone:value('#streamer-tone'),seed:value('#streamer-seed')}}
function localProfile(d){const focus=d.categories.join('、'),seed=d.seed||'她有完整的工作与私人生活，不会只围绕某个观众行动。';return{
'一句话定位':`${d.handle||d.name}是一名以${focus}为主的${d.heatLabel}主播，镜头前有稳定辨识度，线下仍过着具体而普通的城市生活。`,
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
function worldbookText(){if(!state.profile)return'';const d=streamerInput();return `<自定义主播：${d.name}／${d.handle}>\n\n基础资料:\n  姓名: ${d.name}\n  主播网名: ${d.handle}\n  年龄: ${d.age}\n  住所: ${d.home||'未设置'}\n  直播分类: [${d.categories.join(', ')}]\n  热度: ${d.heat}（${d.heatLabel}）\n  粉丝数: ${d.followers}\n  舰长数: ${d.captains}\n  常用直播时间: ${d.hours||'不固定'}\n\n人设档案:\n${PROFILE_FIELDS.map(k=>`  ${k}: ${state.profile[k]||''}`).join('\n')}\n\n约束:\n  - 她拥有独立生活、工作、人际关系和判断，不围绕玩家单独存在\n  - 打赏、关注和舰长身份不直接换算为私人好感\n  - 当前所在位置、直播开关、好感和生理状态以MVU动态数据为准\n\n</自定义主播：${d.name}／${d.handle}>`}
function updateBookPreview(){const d=streamerInput(),text=worldbookText();$('#book-name').textContent=text?`自定义主播｜${d.name}／${d.handle}`:'尚未生成';$('#book-content').textContent=text||'填写主播资料并生成人设档案后，这里会显示世界书正文预览。'}
function syncInputs(){const n=value('#streamer-name'),h=value('#streamer-handle');$('#art-name').textContent=n||'新主播';$('#art-handle').textContent=(h||'STREAMER').toUpperCase();$('#art-monogram').textContent=(n||h||'S').slice(0,1)}
function validate(step){if(step===1&&!value('#player-name')){toast('请填写玩家姓名或常用称呼');return false}if(step===2&&!state.home){toast('请先从地图选择初始住所');return false}return true}
function renderConfirm(){const player=value('#player-name')||'未命名玩家',handle=value('#player-handle')||'未设置网名',job=state.job,home=state.home;$('#confirm-player').textContent=player;$('#confirm-lines').innerHTML=[['玩家档案',`${player} · ${state.gender} · ${value('#player-age')||24}岁`],['直播网名',handle],['初始住所',home?.fullName||'未选择'],['初始工作',job.name],['收入与时间',job.monthly?`月薪约￥${job.monthly.toLocaleString()} · ${job.hours}`:'无固定收入'],['自定义主播',state.profile?`${value('#streamer-name')}／${value('#streamer-handle')}`:'未追加']].map(([a,b])=>`<div class="confirm-line"><span>${a}</span><b>${esc(b)}</b></div>`).join('');updateBookPreview()}
function go(step){if(step>state.step&&!validate(state.step))return;state.step=Math.max(1,Math.min(4,step));document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',+p.dataset.panel===state.step));renderSteps();$('#prev').classList.toggle('hidden',state.step===1);$('#next').textContent=state.step===4?'生成开局配置':'继续';if(state.step===4)renderConfirm();scrollTo({top:0,behavior:'smooth'})}
function emptyExperience(){return{近期性经验次数:0,露出经验:0,自慰经验:0,排泄调教经验:0,道具调教经验:0,凌辱调教经验:0,隐奸经验:0,青奸经验:0,睡奸经验:0,催眠奸经验:0,情趣扮演经验:0,盗摄经验:0,性直播经验:0}}
function emptyDevelopment(){return{口腔:{档位:0,评语:''},胸:{档位:0,评语:''},小穴:{档位:0,评语:''},肛门:{档位:0,评语:''}}}
function openingPayload(){const d=streamerInput(),pname=value('#player-name'),job=state.job,mvu={世界信息:{年历:'2026年4月1日',时间:{时钟:'08:00',时段:'朝'},位置:{区域:state.home.fullName,场所:'家中'}},玩家信息:{档案:{姓名:pname,性别:state.gender,年龄:+value('#player-age')||24,网名:value('#player-handle'),补充设定:value('#player-note')},体力:100,金钱:20000,工作:{职业:job.place?job.name:null,地点:job.place,日收入:job.daily,工作时间:job.place?job.hours:null,今日已上班:false},居住地:state.home.fullName,房产:{[state.home.name]:{名称:state.home.name,区域:state.home.fullName,产权:state.home.tenure,描述:state.home.note}}}};if(state.profile)mvu.对象信息={[d.name]:{羁绊:{好感度:0,顺从度:0,心情:'开朗'},位置:{区域:d.home,场所:'家中'},性经历:emptyExperience(),开发度:emptyDevelopment(),生理:{性欲度:0,体力:100,尿意:20,异常状态:[]},直播:{开播:false,标题:'',人数:0,热度:d.heat,粉丝数:d.followers,舰长数:d.captains}}};return{mvu,worldbook:state.profile?{name:`自定义主播｜${d.name}／${d.handle}`,keys:[d.name,d.handle],content:worldbookText()}:null,ui:state.profile?{name:d.name,handle:d.handle,art:state.art}:null}}
function finish(){const payload=openingPayload();if(window.parent!==window)parent.postMessage({channel:'linjiang-opening',kind:'event',type:'commitPreview',payload},'*');navigator.clipboard?.writeText(JSON.stringify(payload,null,2)).catch(()=>{});console.log('[临江开局配置]',payload);toast('开局配置已生成，并已尝试复制到剪贴板')}
renderSteps();renderJobs();renderTags();go(1);
$('#gender-segment').onclick=e=>{const b=e.target.closest('button');if(!b)return;state.gender=b.dataset.value;$('#gender-segment').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b))};
document.querySelectorAll('[data-open-map]').forEach(b=>b.onclick=()=>openMap(b.dataset.openMap));
$('#map-close').onclick=closeMap;$('#map-modal').onclick=e=>{if(e.target===$('#map-modal'))closeMap()};
$('#quick-homes').innerHTML=HOMES.map((h,i)=>`<button class="quick" data-home="${i}">${h.name}</button>`).join('');document.querySelectorAll('[data-home]').forEach(b=>b.onclick=()=>setHome(HOMES[+b.dataset.home]));
$('#map-iframe').addEventListener('load',()=>setTimeout(bindFrame,350));
addEventListener('message',e=>{const d=e.data;if(d?.channel==='linjiang-map'&&d.type==='pick')handleMapPick(d.payload)});
$('#streamer-heat').oninput=e=>$('#heat-value').textContent=e.target.value;
['#streamer-name','#streamer-handle'].forEach(id=>$(id).addEventListener('input',syncInputs));
$('#apply-art-url').onclick=()=>{const u=value('#art-url');if(!u)return toast('先填写网络立绘链接');updateArt(u,'url')};
$('#art-file').onchange=e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>updateArt(r.result,'upload-preview');r.readAsDataURL(f)};
$('#generate-profile').onclick=generateProfile;$('#prev').onclick=()=>go(state.step-1);$('#next').onclick=()=>state.step===4?finish():go(state.step+1);
})();