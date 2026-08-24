import geo from './geometry.json';
import spritesRaw from './sprites.json';
import { rebaseRecord } from './asset.js';
import { pinImg } from './pin-art.js';
import {
  characterDetails, destinations, girls, homeState, MAP_MARKER_ITEM, onLive, player, protagonist, tools, workBadge, workState, world,
} from './data.js';
import { mountPages } from './pages.js';
import { mountDrawer } from './drawer.js';
import { mountGifts } from './gifts.js';
import { onPref, pref } from './prefs.js';
import { icons } from './icons.js';
import { sendChat } from './bridge.js';
import { safeFirstElement, setSafeHTML } from './dom.js';

const sprites = rebaseRecord(spritesRaw);

const ic = (name) => (name ? `<i class="ic">${icons[name]}</i>` : '');

/* A region is the one thing that carries a position, and it takes it from the
   measured geometry.  Everything inside flows. */
function region(name, cls, body) {
  const r = geo.regions[name];
  return `<section class="region ${cls}"
     style="--x:${r.x}px; --y:${r.y}px; --w:${r.w}px; --h:${r.h}px">${body}</section>`;
}

function sprite(name, extra = '') {
  const s = sprites[name];
  return `<img class="sprite ${extra}" src="${s.src}" alt="" draggable="false"
    style="left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px">`;
}

const caption = (x, y, text) =>
  `<span class="head-caption" style="left:${x}px;top:${y}px">` +
  `<span class="slash">/</span><span class="cjk">${text}</span></span>`;

/* ------------------------------------------------------------------ status */

/* One life fact per line: what it is, where, and its state.
   No 日收入 here.  It is already the pill under 资金, where it belongs -- that is the
   number it moves -- and a second copy on this row made the pane's quietest line end in
   its second-largest numeral.
   The spacer is an element rather than `margin-left:auto` on the tag, because the tag is
   not always the last thing in the row -- 无业 has no tag at all -- and an auto margin
   would then attach to whatever happened to be there. */
function lifeLine({ icon, label, name, sub, tag, tone }) {
  return `
    <div class="life-line">
      ${ic(icon)}
      <span class="life-label">${label}</span>
      <b class="life-name">${name}</b>
      ${sub ? `<span class="life-sub">${sub}</span>` : ''}
      <span class="life-fill"></span>
      ${tag ? `<span class="life-tag ${tone}">${tag}</span>` : ''}
    </div>`;
}

/* 同行 and 在看, each in her own colour.
   ------------------------------------------------------------------
   The roster's 代表色 were doing nothing on this side of the shell, although both of the
   characters this pane names are the reason the player is where they are.  So the two
   chips carry the theme: rim, wash and glow are the `--rim` / `--wash` / `--glow` the
   cards and the dock already read from `.t-*`, which means a character's colour is
   stated in exactly one place and every panel that names her picks it up.

   `is-none` is the same chip with no theme attached, so 独行 and 未进房 keep the row's
   shape instead of collapsing it -- the strip's right edge should not move because
   nobody happens to be around. */
function whoChip(label, name, theme, live) {
  if (!name) return `<span class="world-who is-none"><em>${label}</em><b>${theme}</b></span>`;
  return `
    <span class="world-who t-${theme}${live ? ' is-live' : ''}">
      <em>${label}</em><i></i><b>${name}</b>
    </span>`;
}

function whoChips() {
  const companion = player.companion;
  const watching = player.watching;
  const themeOf = (name) => girls.find((g) => g.name === name)?.theme;
  const isLive = (name) => !!characterDetails[name]?.stream?.live;

  return (companion
    ? whoChip('同行', companion, themeOf(companion), isLive(companion))
    : whoChip('同行', '', '独行'))
    + (watching
      ? whoChip('在看', watching, themeOf(watching), isLive(watching))
      : whoChip('在看', '', '未进房'));
}

/* 工作 and 住所, the two facts the pane had the room for and was not carrying.
   ------------------------------------------------------------------
   Content used to stop about 88 units above this pane's own floor -- most of a row's
   worth of empty glass at the bottom of the densest panel in the composition, which
   is what made the pane read as bottom-heavy with nothing in the weight.  These two
   are what belongs there: both are checked constantly during a day (has today's
   shift been taken, can she be brought back home), both were reachable only by
   opening 主角档案, and both are one line.  The page still owns the detail -- this is
   its preview, the same relationship a card has with the dock. */
function lifeRows() {
  const work = workState();
  const home = homeState();
  const badge = workBadge(work);
  const house = home.current;
  const settled = !!house && house.area === home.home;

  return `
  <div class="life-rows">
    ${lifeLine({
    icon: 'briefcase',
    label: '工作',
    name: work.job || '无业',
    sub: work.job ? work.place : '',
    tag: badge.label,
    tone: badge.tone,
  })}
    ${lifeLine({
    icon: 'home',
    label: '住所',
    name: house ? house.name : '无住所',
    sub: house ? house.tenure : '',
    tag: house ? (settled ? '当前住所' : '未设住所') : '',
    tone: settled ? 'is-ok' : '',
  })}
  </div>`;
}

/* Hierarchy, not just height.
   ------------------------------------------------------------------
   资金 / 日期 / 时间 used to be three equal cells at --fs-value: 54 units tall, filling
   436 of the row's 441, and three focal points in a pane that holds exactly one number
   the player spends.  The portrait column was rebuilt on that observation several passes
   ago (see the note above its own statusPanel); this is the same correction on this side
   of the shell.  资金 keeps the numeral.  The calendar and the clock join 在哪 and 和谁 as
   context, at caption size, on one line.

   The rules went three to one along with it.  Four blocks divided by three hairlines
   read as four panels stacked rather than one pane with four rows, and the pane already
   separates them with its gap sequence.  The one that is left sits where the boundary
   actually is: above it the world the player is standing in, below it what belongs to
   the player.  下面两组之间用间距而不是第三条线分开 -- 17 against the 11s above it.

   主角档案 moved into the header band, which was 52 units tall and held nothing: the
   script title is absolutely positioned and finishes at x 262 of a 494-wide pane, so
   there were 230 units of empty glass at the top of a pane whose floor clearance was 18.
   Off the 体力 line it also stops a 31-unit control from sitting in the middle of a data
   row, and the bar it was crowding grows from 168 to about 280.

   Together that is 310 units of content down to 296, so the floor clearance goes 18 ->
   32 -- close to the --sp-8 step, which is what makes the bottom rim read as a floor
   rather than as a crop. */
function statusPane() {
  const { stats, stamina } = protagonist;
  const money = stats[0];
  const c = world.calendar;

  return region('status', 'pane-status', `
  <!-- The pane's one route out, and the glyph alone.  Spelled out it was a 101-unit pill
       -- the widest thing in a title band that already reads "Status / 主角状态", so the
       four characters were restating their own neighbour.  The arrow went with them: it
       was there to give the label a direction, and an icon does not need one.
       stamina.action survives as the accessible name and the tooltip, so the string is
       still stated once and still the same one the portrait column puts on its 体力
       line -- only this layout draws it rather than sets it. -->
  <header class="pane-head">
    <button class="btn-ghost is-icon" type="button" data-page="profile"
      title="${stamina.action}" aria-label="${stamina.action}">${ic('person')}</button>
  </header>
  <!-- 私密度 is not on this strip.  It was, for one pass, and it is what tipped the row
       over: 34 units of height cannot hold a place name, a privacy rung with its
       numeral, and two people.  Who is with the player decides more per turn than which
       rung the room is on, and 主角档案's 现在 cell carries the rung in full. -->
  <div class="world-strip">
    <div class="world-location">${ic('mapPin')}<b>${world.location.area}</b></div>
    <span class="world-place">${world.location.place}</span>
    <span class="world-fill"></span>
    ${whoChips()}
  </div>

  <!-- 何时, read straight from world.calendar rather than through a stat cell: two of
       the three cells existed only to carry these strings at numeral size.  第16周 stays
       off it for the reason data.js gives -- nothing in a day's play turns on it, and
       主角档案 has it. -->
  <div class="when-line">
    <span>${ic('calendarSmall')}<b>${c.date}</b><em>${c.weekday} · ${c.season}</em></span>
    <span>${ic('moon')}<b>${world.time.clock}</b><em>${world.time.period}</em></span>
  </div>

  <hr class="rule">

  <div class="money-line">
    ${ic(money.valueIcon)}
    <b class="num">${money.unit ? `<span class="unit">${money.unit}</span>` : ''}${money.value}</b>
    ${money.sub?.pill ? `<span class="pill">${money.sub.pill}</span>` : ''}
  </div>

  <div class="favor-line is-stamina">
    ${ic('clock')}
    <span class="favor-name">${stamina.label}</span>
    <div class="bar"><i style="--pct:${(100 * stamina.value) / stamina.max}%"></i></div>
    <div class="favor-num"><b>${stamina.value}</b><span>/ ${stamina.max}</span></div>
  </div>

  ${lifeRows()}`);
}

/* ------------------------------------------------------------------- girls */
const PAGE = 4;
const PIN_KEY = 'glass-hud-pinned';
let page = 0;
let pinned = [];
try {
  const saved = JSON.parse(localStorage.getItem(PIN_KEY) || '[]');
  pinned = Array.isArray(saved) ? saved.filter((name) => typeof name === 'string') : [];
} catch { pinned = []; }

/* Exported so the portrait layout pins into the same store: 置顶 is a player
   preference, not a property of one composition, so pinning on a phone has to hold
   when the same page is opened on a desktop. */
export function isPinned(name) { return pinned.includes(name); }

export function togglePin(name) {
  const i = pinned.indexOf(name);
  if (i >= 0) pinned.splice(i, 1);
  else pinned.push(name);
  try { localStorage.setItem(PIN_KEY, JSON.stringify(pinned)); } catch { /* memory state still works */ }
}

export function orderedGirls() {
  const front = pinned.map((n) => girls.find((g) => g.name === n)).filter(Boolean);
  const rest = girls.filter((g) => !isPinned(g.name));
  return front.concat(rest);
}

/* Plain text with a lit dot rather than a second pill: the mood chip sits directly
   above it, and two pills in a 109px column read as a tag cloud.  The dot carries
   the abnormal/normal distinction so the text does not have to. */
function cardStatus(s) {
  return `
      <div class="card-status${s.abnormal ? ' is-abnormal' : ''}">
        <i></i><span>${s.text}</span>${s.extra ? `<em>+${s.extra}</em>` : ''}
      </div>`;
}

function girlCard(g) {
  const pinnedOn = isPinned(g.name);
  return `
<article class="card t-${g.theme}${pinnedOn ? ' is-pinned' : ''}" data-name="${g.name}"
  title="点击查看 ${g.name} 的角色速览">
  <div class="card-inner">
    <div class="card-glass"></div>
    <div class="card-art-clip">
      <img class="card-art" src="${g.art}" alt="" draggable="false" decoding="async" loading="lazy"
        data-fx="${g.artFx ?? 0.5}" data-fy="${g.artFy ?? 0.16}"
        data-z="${g.artZ ?? 1.32}" data-ox="${g.artOx ?? 0}"
        data-tx="${g.artTx ?? 0.30}" data-ty="${g.artTy ?? 0.34}">
    </div>
    <div class="card-scrim"></div>
    ${g.live ? '<span class="card-live" title="正在直播">直播中</span>' : ''}
    <div class="card-body">
      <div class="card-name"><b class="${g.name.length > 3 ? 'xl' : g.name.length >= 3 ? 'long' : ''}">${g.name}</b></div>
      <div class="card-romaji">${g.romaji}</div>
      <div class="card-metric-label">${ic(g.metric.icon)}<span>${g.metric.label}</span></div>
      <div class="card-metric"><b>${g.metric.value}</b><span>/ ${g.metric.max}</span></div>
      <div class="chip">${ic(g.chip.icon)}<span>${g.chip.label}：${g.chip.value}</span></div>
      ${cardStatus(g.status)}
    </div>
    <div class="card-rim"></div>
    <button class="card-star" type="button" data-ornament="${g.ornament === 'star' ? 'star' : 'sparkle'}" aria-label="${pinnedOn ? '取消置顶' : '置顶角色'}" title="${pinnedOn ? '取消置顶' : '置顶角色'}">${pinImg(g.ornament)}</button>
  </div>
</article>`;
}

function pageSlice() {
  const list = orderedGirls();
  const start = (page * PAGE) % list.length;
  const slice = [];
  for (let i = 0; i < Math.min(PAGE, list.length); i++) {
    slice.push(list[(start + i) % list.length]);
  }
  return slice;
}

function paintRail(rail) {
  if (!rail) return;
  setSafeHTML(rail, pageSlice().map(girlCard).join(''));
  placeCardArts(rail);
}

/* Tall covers already fill the card width, so object-position cannot slide a
   right-weighted girl left.  Zoom past cover, then pin the face to the portrait
   column and clamp so the bitmap never leaves a hole. */
export function placeCardArts(scope) {
  scope.querySelectorAll('.card-art').forEach((img) => {
    const layout = () => {
      const host = img.parentElement;
      if (!host || !img.naturalWidth) return;
      const cw = host.clientWidth;
      const ch = host.clientHeight;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const fx = Number(img.dataset.fx);
      const fy = Number(img.dataset.fy);
      const z = Number(img.dataset.z);
      const ox = Number(img.dataset.ox || 0);
      const tx = Number(img.dataset.tx || 0.30);
      const ty = Number(img.dataset.ty || 0.34);
      const s = Math.max(cw / iw, ch / ih) * z;
      const dw = iw * s;
      const dh = ih * s;
      /* Allow a hole on the right (glass pane).  Never leave a hole on the
         left.  ox > 0 pulls the bitmap left so a centred cover sits in the
         portrait column instead of under the name. */
      const left = Math.min(0, tx * cw - fx * dw - ox * cw);
      const top = dh >= ch
        ? Math.max(ch - dh, Math.min(0, ty * ch - fy * dh))
        : (ch - dh) / 2;
      img.style.width = `${dw}px`;
      img.style.height = `${dh}px`;
      img.style.left = `${left}px`;
      img.style.top = `${top}px`;
      img.dataset.laid = '1';
    };
    if (img.complete && img.naturalWidth) layout();
    else img.addEventListener('load', layout, { once: true });
  });
}

function girlsPane() {
  return region('girls', 'pane-girls', `
  <header class="pane-head girls-head"></header>
  <div class="rail">${pageSlice().map(girlCard).join('')}</div>`);
}

/* --------------------------------------------------------------- tool pod */
/* 四颗全是直达去处了 —— 第四颗以前是 更多 发射钮，带一条悬浮托盘，现在没有托盘，
   也就没有 data-more-trigger 这条分支。 */
function toolPod() {
  const buttons = tools.map((t) => `
  <button class="tool-btn" type="button" aria-label="${t.label}" data-page="${t.page || ''}">
    ${ic(t.icon)}${t.badge ? '<span class="dot"></span>' : ''}
  </button>`).join('');
  return region('pod', 'pane-pod', buttons);
}

function syncToolBadges(root) {
  const buttons = new Map([...root.querySelectorAll('.pane-pod .tool-btn[data-page]')]
    .map((button) => [button.dataset.page, button]));
  tools.forEach((tool) => {
    const button = buttons.get(tool.page || '');
    if (!button) return;
    const dot = button.querySelector(':scope > .dot');
    if (tool.badge && !dot) {
      const next = document.createElement('span');
      next.className = 'dot';
      button.append(next);
    } else if (!tool.badge) {
      dot?.remove();
    }
  });
}

/* ------------------------------------------------------------- 去处一条轨 */
/* 带标签的去处横向铺一排，位置在主角面板上沿之上。
   ------------------------------------------------------------------
   这里要说清一件容易踩的事：**这一排不在玻璃里**。玻璃壳体的上沿是 y=411
   （左上标题耳升到 390，右上 pod 升到 350，见 geometry.json 的 shell），再往上就是
   背景照片本身。所以这排按钮不能像面板内的控件那样"借"底下的玻璃，每颗得自带一片
   薄玻璃底 —— 样式见 dest.css，配方和地图图例那类浮在画面上的小片一致。

   y=326 是这么定的：主角面板的标题耳顶在 390，往上留 12 单位缝，按钮高 52，
   326 + 52 = 378 < 390。x 跟面板左沿对齐（23），右边界不会碰到 pod（1430）——
   四颗算下来到不了 700。

   坐标写成字面量而不是进 geo.regions：geometry.json 是 tools/geometry.py 从原型量出来
   再生成的，手写条目会在下次重新生成时消失。caption() 用的是同一种写法。

   y 是从下沿倒推的：胶囊里现在只有中文一行（那行小拉丁字撤了，理由见 destinations），
   高度从 52 降到 38，于是 y = 390 - 12 - 38 = 340 —— 仍然是"贴着标题耳上方留 12 单位缝"，
   改高度的时候这条式子要跟着算，不然按钮会压到玻璃壳的上沿里去。 */
const DEST_RAIL = { x: 23, y: 340 };

function destRail() {
  const items = destinations.map((d) => {
    const soon = d.soon ? ' is-soon' : '';
    const attrs = d.soon
      ? ' disabled aria-disabled="true"'
      : ` data-page="${d.page}"`;
    return `
    <button class="dest-btn${soon}" type="button" aria-label="${d.label}"
      title="${d.note}"${attrs}>
      ${ic(d.icon)}
      <b>${d.label}</b>
      ${d.soon ? '<i class="dest-soon">筹备</i>' : ''}
    </button>`;
  }).join('');
  return `<nav class="dest-rail" aria-label="去处"
    style="left:${DEST_RAIL.x}px; top:${DEST_RAIL.y}px">${items}</nav>`;
}

function placeRailNext(stage, onNext) {
  const n = geo.nextBtn;
  let el = stage.querySelector(':scope > .rail-next');
  if (!el) {
    el = document.createElement('button');
    el.className = 'tool-btn rail-next';
    el.type = 'button';
    el.setAttribute('aria-label', '\u4e0b\u4e00\u9875');
    el.innerHTML = ic('chevronRight');
    stage.appendChild(el);
  }
  el.style.setProperty('--next-left', `${n.cx - n.d / 2}px`);
  el.style.setProperty('--next-top', `${n.cy - n.d / 2}px`);
  el.onclick = (e) => {
    e.stopPropagation();
    onNext();
  };
}

export function renderContent(root) {
  root.style.setProperty('--art-w', `${geo.cards.artW}px`);
  root.style.setProperty('--art-h', `${geo.cards.artH}px`);
  root.innerHTML = sprite('statusTitle') + sprite('girlsTitle')
    + caption(172, 434, '主角状态')
    + caption(668, 436, '女主角状态')
    + statusPane() + girlsPane() + toolPod() + destRail();
  placeBlossom(root.parentElement);
  /* 送礼 and 背包 both live in the bottom band, so they are mutually exclusive: one
     opens, the other closes.  The tray is also scoped to whoever the dock is showing,
     so switching character or closing the dock has to take it with them -- otherwise
     the rail would be offering 塔菲's gift menu under 东雪莲's 速览. */
  const pages = mountPages(root.parentElement, {
    onGift: (name) => { drawer.close(); gifts.open(name); },
    onDock: (name) => { if (gifts.isOpen() && gifts.target() !== name) gifts.close(); },
    /* 地图 and 街机 cover the viewport, so the bottom band has to be cleared first --
       and it has to be cleared whether the request came from the pod or from 更多工具条. */
    onOverlay: () => { gifts.close(); drawer.close(); },
  });
  const gifts = mountGifts(root.parentElement, {
    onSend: ({ message, payload }) => {
      console.info('[gift] payload', payload);
      return sendChat(message).catch((err) => {
        console.warn('[gift]', err);
        return false;
      });
    },
  });
  /* 背包 opens the drawer by default and a cell in the drawer opens the full page: the
     drawer is the browser, the page is the detail view.  Items are few enough that a
     rail shows the whole bag in one or two swipes, and it does it without covering the
     scene -- which matters because carrying a particular item is a precondition some
     events read (dailyEvents evt-04).

     But that is a preference, not a rule.  Reading descriptions one cell at a time is
     not everyone's idea of browsing, so `inventoryOpen: 'page'` sends the button
     straight to the full page and the drawer never appears. */
  const drawer = mountDrawer(root.parentElement, {
    onItem: (name) => {
      if (name === MAP_MARKER_ITEM) { drawer.close(); pages.openMapCreate(); return; }
      pages.open('inventory');
    },
  });
  /* 去处轨。和 pod 里的环走同一套逻辑：礼物盘和抽屉都占底部那条带，所以任何去处开之前
     先把它们清掉 —— 以前这件事是托盘的 onOpen 在做。 */
  root.querySelector('.dest-rail')?.addEventListener('click', (event) => {
    const button = event.target.closest('.dest-btn[data-page]');
    if (!button || button.disabled) return;
    gifts.close();
    drawer.close();
    pages.open(button.dataset.page);
  });
  /* Switching to 'page' while the drawer is standing would leave it open with nothing
     that can reach it: the button that toggles it now does something else. */
  onPref((name, value) => {
    if (name === 'inventoryOpen' && value !== 'drawer') drawer.close();
  });
  const rail = root.querySelector('.rail');
  placeRailNext(root.parentElement, () => {
    page += 1;
    paintRail(rail);
  });
  rail?.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    if (e.target.closest('.card-star')) {
      togglePin(card.dataset.name);
      page = 0;
      paintRail(rail);
      return;
    }
    pages.openCharacter(card.dataset.name);
  });
  const wireProfile = () => {
    root.querySelector('.btn-ghost')?.addEventListener('click', () => pages.open('profile'));
  };
  wireProfile();
  /* 四颗现在全都直达 —— 第四颗以前是托盘的发射钮，没有 data-page，也不开任何页。 */
  root.querySelectorAll('.pane-pod .tool-btn[data-page]').forEach((button) => {
    button.addEventListener('click', () => {
      const toDrawer = button.dataset.page === 'inventory' && pref('inventoryOpen') === 'drawer';
      /* Both panels want the same band, so whichever is asked for evicts the other. */
      if (toDrawer) { gifts.close(); drawer.toggle(); }
      else pages.open(button.dataset.page);
    });
  });
  if (rail) placeCardArts(rail);

  onLive(() => {
    if (document.querySelector('.viewport')?.classList.contains('is-portrait')) return;
    syncToolBadges(root);
    const pane = root.querySelector('.pane-status');
    if (pane) {
      const nextPane = safeFirstElement(statusPane());
      if (nextPane) pane.replaceWith(nextPane);
      wireProfile();
    }
    paintRail(root.querySelector('.rail'));
  });
}

function placeBlossom(stage) {
  const s = sprites.blossom;
  let el = stage.querySelector(':scope > .sprite-blossom');
  if (!el) {
    el = document.createElement('img');
    el.className = 'sprite sprite-blossom';
    el.alt = '';
    el.draggable = false;
    stage.appendChild(el);
  }
  el.src = s.src;
  el.style.cssText = `left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px`;
}
