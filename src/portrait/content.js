/* Portrait content.
   ------------------------------------------------------------------
   Two panels, and the second one has two states:

     Status   the player's own state.  Least interactive, so it takes the top of
              the column where a thumb cannot comfortably reach.
     Girls    either the roster as a swipeable rail, or one character's 速览.
              Tapping a card turns this panel into that character; closing turns it
              back.  Its title ear morphs with it -- "Girls / 女主角一览" becomes her
              romaji and name.

   The preview deliberately is *not* a third panel appended below.  A third panel
   would be a third level to back out of, and the rail it opens from is the natural
   place for it: the row you tapped becomes the thing you tapped.  The column stays
   two panels deep in both states, so there is never an empty region and never an
   extra step.  The document still grows when the preview opens, because the preview
   is taller than the rail -- that is what the elastic canvas is for.

   The landscape layout instead puts the character dock *above* the shell, because up
   there is empty scene and the shell alone is already a complete picture.  Portrait
   has no such empty region to borrow, which is why it swaps in place.

   Two label errors in the portrait reference are corrected here: it labels
   physiology.desire as 性格 and physiology.bladder as 疲惫.  Both values match
   沙花叉's record exactly (27 and 31), and 疲惫 would in any case be redundant with
   体力.  The meters below use the schema's own names. */

import {
  NO_STATUS, PRIVACY, THRESHOLDS,
  characterDetails, fanLine, giftLabel, giftScenes, girls, homeState, player, protagonist, tools, workBadge, workState, world,
} from '../data.js';
import { buildGift } from '../data.js';
import { isPinned, orderedGirls, placeCardArts, togglePin } from '../content.js';
import { CARD, TOOL } from './geometry.js';
import { PORTRAIT_PAGES } from './pages.js';
import { head, ic, meter, pct } from './parts.js';
import { destinations, onLive } from '../data.js';
import { openPhone, requestClockIn, sendChat, reportPortraitPage } from '../bridge.js';
import { pinImg } from '../pin-art.js';
import { mountMapOverlay } from '../map.js';
import { mountArcadeOverlay } from '../arcade.js';
import { mountCgOverlay } from '../cg.js';

import { insertSafeHTML, safeFirstElement, setSafeHTML } from '../dom.js';
import { applyPrefClick } from '../settings.js';
import { handleDevelopmentNotesButton } from '../dev-notes.js';

/* ------------------------------------------------------------------ status */

function stat(s) {
  return `
  <div class="pstat">
    <div class="pstat-label">${ic(s.icon)}<span>${s.label}</span></div>
    <div class="pstat-value">
      <b>${s.unit ? `<span class="unit">${s.unit}</span>` : ''}${s.value}</b>
      ${s.note ? `<em>${s.note}</em>` : ''}
    </div>
    ${s.sub ? `<div class="pstat-sub">${s.sub.pill
      ? `<span class="ppill">${s.sub.pill}</span>`
      : `${ic(s.sub.icon)}<span>${s.sub.text}</span>`}</div>` : ''}
  </div>`;
}

/* Hierarchy, not just height.
   ------------------------------------------------------------------
   Laying 资金 / 日期 / 时间 out as equal cells made them the largest
   block on the first screen.  Only 资金 is a resource the player
   spends; the calendar and the clock are context.  So one prominent
   number, and the rest demoted to a wrapping meta row at caption size. */
function portraitWhoChip(label, name, emptyText) {
  if (!name) return `<span class="pworld-who is-none"><em>${label}</em><b>${emptyText}</b></span>`;
  const girl = girls.find((item) => item.name === name);
  const live = !!characterDetails[name]?.stream?.live;
  return `<span class="pworld-who t-${girl?.theme || 'violet'}${live ? ' is-live' : ''}">
    <em>${label}</em><i></i><b>${name}</b>
  </span>`;
}

function portraitWhoChips() {
  return portraitWhoChip('同行', player.companion, '独行')
    + portraitWhoChip('在看', player.watching, '未进房');
}

function portraitLifeRows() {
  const work = workState();
  const home = homeState();
  const badge = workBadge(work);
  const house = home.current;
  const settled = !!house && house.area === home.home;
  const row = ({ icon, label, name, sub, tag, tone = '' }) => `
    <div class="plife-line">
      ${ic(icon)}<span class="plife-label">${label}</span>
      <b class="plife-name" title="${name}">${name}</b>
      ${sub ? `<span class="plife-sub" title="${sub}">${sub}</span>` : ''}
      <span class="plife-fill"></span>
      ${tag ? `<em class="plife-tag ${tone}">${tag}</em>` : ''}
    </div>`;
  return `<div class="plife-rows">
    ${row({
    icon: 'briefcase', label: '工作', name: work.job || '无业',
    sub: work.job ? work.place : '', tag: badge.label, tone: badge.tone,
  })}
    ${row({
    icon: 'home', label: '住所', name: house ? house.name : '无住所',
    sub: house ? house.tenure : '', tag: house ? (settled ? '当前住所' : '未设住所') : '',
    tone: settled ? 'is-ok' : '',
  })}
  </div>`;
}

function statusPanel() {
  const { stats, stamina } = protagonist;
  const money = stats[0];
  const c = world.calendar;

  const meta = [
    `${ic('calendarSmall')}<b>${c.date}</b><em>${c.weekday} · ${c.season}</em>`,
    `${ic('moon')}<b>${world.time.clock}</b><em>${world.time.period}</em>`,
  ];

  return `
<section class="ppanel" data-panel="status" data-pod>
  ${head('Status', '主角状态')}
  <!-- 四颗环全是直达去处。第四颗以前是 更多 发射钮，点开一条悬浮托盘；托盘撤了，
       那批去处改成面板底部 pdest 那一格网带文字的按钮。 -->
  <div class="ptools">
    ${tools.map((t) => `
    <button class="ptool" type="button" data-page="${t.page}" aria-label="${t.label}">
      ${ic(t.icon)}${t.badge ? '<span class="pdot"></span>' : ''}
    </button>`).join('')}
  </div>

  <div class="pworld">
    <div class="pworld-main">
      <div class="pworld-where">${ic('mapPin')}<b>${world.location.area}</b></div>
      <div class="pworld-place"><span>${world.location.place}</span></div>
    </div>
    <div class="pworld-people">${portraitWhoChips()}</div>
  </div>

  <div class="pmoney">
    ${ic(money.valueIcon)}
    <b><span class="unit">${money.unit}</span>${money.value}</b>
    ${money.sub?.pill ? `<span class="ppill">${money.sub.pill}</span>` : ''}
  </div>

  <div class="pmeta">${meta.map((m) => `<span>${m}</span>`).join('')}</div>

  <hr class="prule">

  <!-- 主角档案 spelled out was a ~260-unit pill on this row, so the bar sat at its
       80-unit floor.  The person glyph is the same control the landscape pane uses;
       stamina.action stays as the accessible name.  The slack goes to the bar. -->
  <div class="pfavor is-stamina">
    ${ic('clock')}
    <span>${stamina.label}</span>
    <div class="pbar is-stamina"><i style="--pct:${pct(stamina.value, stamina.max)}%"></i></div>
    <b>${stamina.value}</b><em>/ ${stamina.max}</em>
    <button class="pbtn-ghost is-icon" type="button" data-page="profile"
      title="${stamina.action}" aria-label="${stamina.action}">${ic('person')}</button>
  </div>

  ${portraitLifeRows()}

  ${portraitDestGrid()}
</section>`;
}

/* 带标签的去处，四列一行铺在主角面板底部。
   ------------------------------------------------------------------
   竖屏真正缺的是横向空间，不是纵向 —— 这一列本来就能滚。所以这批去处在这里比在 pod 里
   宽裕得多：面板正文宽 795 单位（PW 941 减两边 --pad-x 73），四列减去 3 道 12 的缝，
   每格 189.75 单位，在 390 宽的容器上是 78.6 真实像素。pod 里的环只有 76 单位 ≈
   31.5 真实像素，靠 ::after 撑到 44 才够摸 —— 也就是说这些格子的触摸目标是环的两倍多，
   还带文字标签。窄到 320 宽时画布本身会收成 886 单位，每格 176 单位 ≈ 63.6 真实像素，
   仍然远在 44 以上。

   格子里只有图标 + 两字缩写，没有那行拉丁字：190 单位塞不下 "SCHEDULE" 加字距，
   完整的 "开播日程表" 也会折成三行。完整名字挂在 aria-label 上，读屏和长按提示都还在。
   横向那一排空间够，用的是完整 label + en。 */
function portraitDestGrid() {
  const cells = destinations.map((d) => {
    const attrs = d.soon ? ' disabled aria-disabled="true"' : ` data-page="${d.page}"`;
    return `
    <button class="pdest-btn${d.soon ? ' is-soon' : ''}" type="button"
      aria-label="${d.label}"${attrs}>
      ${ic(d.icon)}
      <b>${d.short || d.label}</b>
      ${d.soon ? '<i class="pdest-soon">筹备</i>' : ''}
    </button>`;
  }).join('');
  return `
  <hr class="prule">
  <nav class="pdest" aria-label="去处">${cells}</nav>`;
}

/* ------------------------------------------------------------------- girls */

/* The card is a picker, not a dossier: name, favour, mood, 异常状态.
   `--card-*` tokens are not reused: this card's art and text stack vertically, so
   the horizontal split those tokens describe does not apply. */
function card(g, selected) {
  const pinnedOn = isPinned(g.name);
  return `
<article class="pcard${selected ? ' is-selected' : ''}${pinnedOn ? ' is-pinned' : ''} t-${g.theme}"
  data-name="${g.name}" role="listitem" tabindex="0" aria-label="查看 ${g.name} 的速览">
  <div class="card-inner">
    <div class="card-glass"></div>
    <div class="pcard-art">
      <img class="card-art" src="${g.art}" alt="" draggable="false" decoding="async" loading="lazy"
        data-fx="${g.artFx ?? 0.5}" data-fy="${g.artFy ?? 0.16}"
        data-z="${g.artZ ?? 1.32}" data-ox="0"
        data-tx="0.5" data-ty="0.24">
    </div>
    <div class="pcard-scrim"></div>
    ${g.live ? '<span class="pcard-live" title="正在直播">直播中</span>' : ''}
    <button class="pcard-star" type="button" data-pin="${g.name}" data-ornament="${g.ornament === 'star' ? 'star' : 'sparkle'}"
      aria-pressed="${pinnedOn}" aria-label="${pinnedOn ? '取消置顶' : '置顶角色'}"
      >${pinImg(g.ornament)}</button>
    <div class="pcard-body">
      <div class="pcard-name">
        <b class="${g.name.length > 3 ? 'long' : ''}">${g.name}</b><em>${g.romaji}</em>
      </div>
      <div class="pcard-favor">
        ${ic(g.metric.icon)}<b>${g.metric.value}</b><span>/ ${g.metric.max}</span>
      </div>
      <div class="pcard-bar"><i style="--pct:${pct(g.metric.value, g.metric.max)}%"></i></div>
      <div class="chip">${ic(g.chip.icon)}<span>${g.chip.value}</span></div>
      <div class="pcard-status${g.status.abnormal ? ' is-abnormal' : ''}"
        ><i></i><b>${g.status.text}</b>${g.status.extra ? `<em>+${g.status.extra}</em>` : ''}</div>
    </div>
    <div class="card-rim"></div>
  </div>
</article>`;
}


/* Pinned characters come first, from the same store the landscape rail reads.
   One dot per character, because the rail snaps one card at a time rather than
   paging a fixed group -- the reference's five dots matched neither the seven
   characters nor a three-up page count. */
function railBody() {
  const list = orderedGirls();
  return `
  ${head('Girls', '女主角一览')}
  <div class="prail" role="list">${list.map(card).join('')}</div>
  <div class="pdots">${list.map((_, i) =>
    `<i class="${i === 0 ? 'on' : ''}" data-dot="${i}"></i>`).join('')}</div>`;
}

/* ----------------------------------------------------------------- preview */

/* The 送礼 entry, label following her state.  Portrait routes it to a page rather
   than to a tray: there is no desktop band under the column for a rail to sit in,
   which is the same reason the portrait 背包 is a page and not the drawer. */
function giftEntry(name) {
  const scenes = giftScenes(name);
  if (!scenes.any) {
    return `<div class="pgift-entry is-off">${ic('heart')}<span>${scenes.reason}</span></div>`;
  }
  const { stream } = characterDetails[name];
  return `
  <button class="pgift-entry" type="button" data-gift-page="${name}">
    ${ic('heart')}<span>${giftLabel(scenes)}</span>
    <em>${scenes.near ? '在身边' : ''}${scenes.near && scenes.live ? ' · ' : ''}${
      scenes.live ? `直播中 ${stream.viewers.toLocaleString('en-US')} 人` : ''}</em>
    ${ic('arrowRight')}
  </button>`;
}

function previewBody(girl) {
  const { bond, physiology, location, fan } = characterDetails[girl.name];
  const statuses = physiology.statuses.length
    ? physiology.statuses.map((s) => `<span>${s}</span>`).join('')
    : `<span class="is-muted">${NO_STATUS}</span>`;
  const here = location || world.location;
  const fl = fanLine(fan);

  return `
  ${head(girl.romaji, `${girl.name} · 速览`)}
  <button class="pclose" type="button" data-preview-close aria-label="返回女主角一览">×</button>

  <div class="ppreview-body">
    <figure class="ppreview-art">
      <img src="${girl.art}" alt="" draggable="false">
    </figure>

    <div class="ppreview-data">
      <div class="ppreview-id">
        <h3>${girl.name}</h3>
        <span class="pchip">${ic('smile')}心情 · ${bond.mood}</span>
      </div>

      <div class="ppreview-group">
        <h4>羁绊</h4>
        ${meter('好感度', bond.favor, 1000, 'pink')}
        ${meter('顺从度', bond.obedience, 1000, 'violet', THRESHOLDS.obedience)}
      </div>

      <div class="ppreview-group">
        <h4>生理</h4>
        ${meter('性欲', physiology.desire, 100, 'pink', THRESHOLDS.desire)}
        ${meter('体力', physiology.stamina, 100, 'blue', THRESHOLDS.stamina)}
        ${meter('尿意', physiology.bladder, 100, 'gold', THRESHOLDS.bladder)}
      </div>

      <div class="ppreview-status"><small>异常状态</small><div>${statuses}</div></div>

      <div class="ppreview-group">
        <h4>所在</h4>
        <div class="ppreview-where">${ic('mapPin')}<b>${here.area}</b>
          <span>${here.place || '—'}</span>
          <em>${PRIVACY[here.privacy] ?? ''} ${here.privacy}/5</em>
        </div>
        <p class="ppreview-fan">${fl.follow ? '关注' : '未关注'} · ${fl.tier} · ${fl.lv} · ${fl.yen}</p>
      </div>
    </div>
  </div>



  <div class="ppreview-foot">
    <button class="pnav" type="button" data-preview-step="-1" aria-label="上一位">${ic('chevronRight')}</button>
    <button class="pbtn-primary" type="button" data-character-full="${girl.name}">
      完整档案${ic('arrowRight')}
    </button>
    <button class="pnav" type="button" data-preview-step="1" aria-label="下一位">${ic('chevronRight')}</button>
  </div>

  <!-- 送礼 is a second action on the same character, so it sits under the footer
       rather than competing with 完整档案 inside it.  Disabled with the reason on it
       when neither scene is open, the same rule the landscape dock follows. -->
  ${giftEntry(girl.name)}`;
}

/* The second panel, in whichever state it is in.  One element either way, so the
   stage measures the same two panels and the seam arithmetic does not change. */
function girlsPanel(open) {
  if (!open) return `<section class="ppanel" data-panel="girls">${railBody()}</section>`;
  const girl = girls.find((g) => g.name === open) || girls[0];
  return `
<section class="ppanel is-preview t-${girl.theme}" data-panel="girls"
  role="dialog" aria-label="${girl.name} 速览">${previewBody(girl)}</section>`;
}

/* -------------------------------------------------------------------- wire */

export function mountPortraitContent(stage, { onPage } = {}) {
  const { content, sync } = stage;
  let open = null;
  /* Kept across a state swap so closing the preview lands the rail back where the
     reader left it rather than at the first card. */
  let railScroll = 0;
  /* Which full page has taken the column over, or null for the base view.  See the
     note at the top of pages.js for why a page replaces the column rather than being
     appended to it. */
  let workspace = null;
  let workspaceArg = null;
  const inventorySelection = new Map();
  let inventoryNotice = '';
  /* 铺满视口的那几层：地图、街机、CG 鉴赏。三者互斥，所以一个卸载句柄就够 ——
     以前是每层一个变量，而每处又都要把另外几个一起关掉。名字同时充当路由表，
     closePage 靠它判断"刚才那层是覆盖层还是页面"。 */
  const OVERLAYS = {
    map: mountMapOverlay,
    arcade: mountArcadeOverlay,
    cg: mountCgOverlay,
  };
  let unmountOverlay = null;
  const closeOverlay = () => {
    unmountOverlay?.();
    unmountOverlay = null;
  };
  /* Whether the overlay was launched over a page rather than over the base
     column -- 更多工具条 lists 街机, so this is now reachable.  It decides whether closing
     the overlay has anything to repaint; see closePage. */
  let overlayOverPage = false;
  /* Where the reader was in the document before the page took over, so closing puts
     them back rather than at the top of a column they had already scrolled past. */
  let baseScrollY = 0;

  const panel = () => content.querySelector('[data-panel="girls"]');
  const rail = () => content.querySelector('.prail');
  const dots = () => content.querySelector('.pdots');
  const pitch = CARD.w + CARD.gap;

  const syncDots = () => {
    const r = rail();
    if (!r) return;
    const i = Math.round(r.scrollLeft / pitch);
    dots()?.querySelectorAll('i').forEach((d, n) => d.classList.toggle('on', n === i));
  };

  /* Wiring the rail needs doing after any rebuild that produced one, whether that was
     a swap of the second panel or a full return from a page. */
  const wireRail = ({ restoreScroll = true } = {}) => {
    placeCardArts(content);
    const r = rail();
    if (r) {
      r.scrollLeft = restoreScroll ? railScroll : 0;
      r.addEventListener('scroll', onRailScroll, { passive: true });
      syncDots();
    }
    sync();
  };

  /* Only the second panel is rebuilt; the Status panel never changes, so leaving it
     alone keeps its layout (and the stage's measurement of it) stable.  A no-op while a
     page owns the column -- there is no girls panel to swap then. */
  const render = (options) => {
    if (workspace) return;
    const current = panel();
    const next = safeFirstElement(girlsPanel(open));
    if (current && next) current.replaceWith(next);
    wireRail(options);
  };

  /* Both panels, from scratch.  Needed when returning from a page, since a page
     replaces the column rather than sitting on top of it. */
  const paintBase = ({ restoreScroll = true } = {}) => {
    setSafeHTML(content, statusPanel() + girlsPanel(open));
    wireRail({ restoreScroll });
  };

  const openOverlay = (name) => {
    /* An overlay can now be launched from a page -- 更多工具条 lists 街机 -- and the column
       under it still holds that page's DOM.  `workspace` is about to be overwritten, so
       record that fact for closePage, which otherwise returns early on the way out of an
       overlay and would leave the page standing with the state saying otherwise. */
    overlayOverPage = !!workspace && !OVERLAYS[workspace];
    if (!workspace) {
      railScroll = rail()?.scrollLeft ?? railScroll;
      baseScrollY = scrollY;
    }
    workspace = name;
    workspaceArg = null;
    document.documentElement.classList.add('is-page-open');
    reportPortraitPage(true);
    closeOverlay();
    unmountOverlay = OVERLAYS[name](document.querySelector('.viewport'), { onClose: closePage });
  };

  const openPage = (page, arg) => {
    if (page === 'phone') {
      closePage();
      openPhone().catch((err) => console.warn('[phone]', err));
      return;
    }
    if (OVERLAYS[page]) { openOverlay(page); return; }
    const build = PORTRAIT_PAGES[page];
    /* Anything unrouted falls through to the caller rather than opening an empty
       panel -- so an unknown name is visible as a no-op with a warning, not as a blank
       screen. */
    if (!build) { onPage?.(page, arg); return; }
    closeOverlay();
    /* Remember the rail before it is thrown away, and the document position, so both
       come back on close.  Only on the way *in*: a page opening another page (羁绊总览
       into a 档案) must not overwrite where the base column was. */
    if (!workspace) {
      railScroll = rail()?.scrollLeft ?? railScroll;
      baseScrollY = scrollY;
    }
    workspace = page;
    workspaceArg = arg ?? null;
    document.documentElement.classList.add('is-page-open');
    reportPortraitPage(true);
    if (page === 'inventory') {
      inventorySelection.clear();
      inventoryNotice = '';
    }
    const buildArg = page === 'inventory'
      ? { selected: inventorySelection, notice: inventoryNotice }
      : arg;
    setSafeHTML(content, build(buildArg));
    sync();
    /* A page is a new view, not a continuation of the one underneath: start it at the
       top even if the reader had scrolled the column. */
    scrollTo({ top: 0, behavior: 'auto' });
  };

  const closePage = () => {
    if (!workspace) return;
    closeOverlay();
    const wasOverlay = !!OVERLAYS[workspace];
    const overPage = overlayOverPage;
    overlayOverPage = false;
    workspace = null;
    workspaceArg = null;
    document.documentElement.classList.remove('is-page-open');
    reportPortraitPage(false);
    /* An overlay opened over the base column left that column intact, so there is
       nothing to repaint.  One opened over a page did not: the page has to be swept and
       the base column put back, which is where the landscape layer also lands. */
    if (wasOverlay && !overPage) return;
    paintBase();
    /* After the layout settles, or the restore lands against the page's height rather
       than the column's. */
    requestAnimationFrame(() => scrollTo({ top: baseScrollY, behavior: 'auto' }));
  };

  /* Confirming a gift, in place.
     ------------------------------------------------------------------
     No overlay: the row expands into its own confirmation, the same pattern the
     开发度 tiles use for 评语 and for the same reason -- portrait's canvas is elastic,
     so growing the row costs nothing, and it keeps the reader's place in a page that
     is several screens long.  The landscape layout needs a floating card because its
     canvas is fixed and the tray is only 66 units tall; here there is no such
     constraint, and one fewer overlay is one fewer level to back out of. */
  const confirmGift = (kind, key) => {
    const name = workspace === 'gift' ? workspaceArg : null;
    if (!name) return;
    const row = content.querySelector(kind === 'private'
      ? `[data-gift-send-item="${CSS.escape(key)}"]`
      : `[data-gift-send-tip="${CSS.escape(key)}"]`);
    if (!row) return;

    /* A second press on the row that is already confirming is the send. */
    if (row.classList.contains('is-confirming')) {
      const remark = row.querySelector('[data-gift-remark]')?.value || '';
      const built = buildGift(name, kind, key, { remark });
      if (built) {
        console.info('[gift] payload', built.payload);
        sendChat(built.message).then((ok) => {
          row.classList.remove('is-confirming');
          row.querySelector('.pgift-confirm')?.remove();
          insertSafeHTML(row, 'beforeend', `
      <span class="pgift-done"><b>${ok ? '已发送到酒馆' : '已生成消息'}</b><code>${built.message}</code>
        <em>${ok ? 'HUD 未直接扣除金钱或道具库存' : '独立预览，未接入酒馆'}</em></span>`);
          sync();
        }).catch((err) => console.warn('[gift]', err));
      }
      return;
    }

    content.querySelectorAll('.pgift-row.is-confirming').forEach((other) => {
      other.classList.remove('is-confirming');
      other.querySelector('.pgift-confirm')?.remove();
    });
    content.querySelectorAll('.pgift-done').forEach((el) => el.remove());

    const built = buildGift(name, kind, key);
    if (!built) return;
    row.classList.add('is-confirming');
    insertSafeHTML(row, 'beforeend', `
      <span class="pgift-confirm">
        ${kind === 'private'
    ? '<label><span>附言</span><input type="text" maxlength="30" placeholder="可选，一句话" data-gift-remark></label>'
    : ''}
        <span class="pgift-line"><span>将发送</span><code>${built.message}</code></span>
        <span class="pgift-again">再按一次确认送出</span>
      </span>`);
    sync();
  };

  const updateInventorySelectionUI = () => {
    const activeGroup = content.querySelector('[data-inventory-page-panel]:not([hidden])') || content;
    const checks = [...activeGroup.querySelectorAll('[data-inv-select]')];
    const all = content.querySelector('[data-inv-select-all]');
    const count = content.querySelector('[data-inv-selected-count]');
    const destroy = content.querySelector('[data-inv-destroy]');
    const selectedOnPage = checks.filter((input) => input.checked).length;
    if (all) {
      all.checked = checks.length > 0 && selectedOnPage === checks.length;
      all.indeterminate = selectedOnPage > 0 && selectedOnPage < checks.length;
    }
    if (count) count.textContent = `已选 ${inventorySelection.size} 项`;
    if (destroy) destroy.disabled = inventorySelection.size === 0;
  };

  const parseInventorySelection = (input) => {
    try {
      const payload = JSON.parse(decodeURIComponent(input.dataset.invSelect || ''));
      if (!payload?.name || !payload?.kind) return null;
      return {
        key: `${payload.kind}:${payload.name}`,
        kind: payload.kind,
        name: payload.name,
        quantity: Math.max(1, Number(payload.quantity) || 1),
      };
    } catch (err) {
      console.warn('[inventory] selection parse failed', err);
      return null;
    }
  };

  const destroySelectedInventory = async () => {
    if (!inventorySelection.size) return;
    const rows = [...inventorySelection.values()];
    const message = ['批量销毁道具：', ...rows.map((row) => `${row.name}数量-${row.quantity}`)].join('\n');
    const status = content.querySelector('[data-inv-status]');
    const button = content.querySelector('[data-inv-destroy]');
    if (button) button.disabled = true;
    try {
      const ok = await sendChat(message);
      inventorySelection.clear();
      inventoryNotice = ok ? '销毁请求已发送' : '已生成销毁请求';
      content.querySelectorAll('[data-inv-select]').forEach((input) => { input.checked = false; });
      if (status) status.textContent = inventoryNotice;
      updateInventorySelectionUI();
    } catch (err) {
      inventoryNotice = '销毁请求发送失败';
      if (status) status.textContent = inventoryNotice;
      updateInventorySelectionUI();
      console.warn('[inventory] destroy request failed', err);
    }
  };

  let tick = 0;
  function onRailScroll() {
    railScroll = rail()?.scrollLeft ?? 0;
    if (tick) return;
    tick = requestAnimationFrame(() => { tick = 0; syncDots(); });
  }

  const openPreview = (name) => {
    /* Remember where the rail was before it is replaced. */
    railScroll = rail()?.scrollLeft ?? railScroll;
    open = name;
    render();
    /* The panel just grew; bring its top into view rather than leaving the reader
       looking at the Status panel. */
    requestAnimationFrame(() => {
      panel()?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const close = () => {
    const wasOpen = open;
    open = null;
    /* Land on the card that was being read. */
    const i = orderedGirls().findIndex((g) => g.name === wasOpen);
    if (i >= 0) railScroll = i * pitch;
    render();
    requestAnimationFrame(() => {
      panel()?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const step = (delta) => {
    const list = orderedGirls();
    const i = list.findIndex((g) => g.name === open);
    if (i < 0) return;
    const next = list[(i + delta + list.length) % list.length];
    railScroll = ((i + delta + list.length) % list.length) * pitch;
    open = next.name;
    render();
  };

  /* Pinning reorders the roster.  In rail state that means rebuilding the rail; in
     preview state the panel is showing one character and the order is not visible,
     so only the store changes and the rail picks it up on the way back. */
  const repin = (name) => {
    togglePin(name);
    if (!open) {
      const i = orderedGirls().findIndex((g) => g.name === name);
      railScroll = Math.max(0, i) * pitch;
      render();
    }
  };

  paintBase({ restoreScroll: false });

  /* 去处网格不需要单独接线：它的按钮带 data-page，下面那条委托里已有的
     [data-page] 分支会接住。 */

  content.addEventListener('click', (event) => {
    if (event.target.closest('[data-page-close]')) { closePage(); return; }
    if (event.target.closest('[data-preview-close]')) { close(); return; }
    /* 同 landscape：设置页的互斥按钮就地改样式。这里尤其不能重建——portrait 的页面
       重建走 setSafeHTML(content, ...)，会把整列扔掉重画并滚回顶部。 */
    if (applyPrefClick(event.target)) return;

    /* 评语 opens inside its own tile rather than in a sheet, so it is a class toggle and
       not a re-render: the reader keeps their place in a page that may be several
       screens long.  Only one open at a time -- four expanded notes is the wall of text
       the tiles exist to avoid. */
    const devNotes = event.target.closest('[data-dev-notes-action]');
    if (devNotes) { handleDevelopmentNotesButton(devNotes); return; }
    const devOpen = event.target.closest('[data-dev-part]');
    if (devOpen) {
      const tile = devOpen.parentElement;
      const wasOpen = tile.classList.contains('is-open');
      content.querySelectorAll('.pdev-tile.is-open').forEach((other) => {
        other.classList.remove('is-open');
        other.querySelector('[data-dev-part]')?.setAttribute('aria-expanded', 'false');
        other.querySelector('.pdev-note')?.setAttribute('hidden', '');
      });
      if (!wasOpen) {
        tile.classList.add('is-open');
        devOpen.setAttribute('aria-expanded', 'true');
        tile.querySelector('.pdev-note')?.removeAttribute('hidden');
      }
      /* The panel just changed height, so the silhouette has to be redrawn. */
      sync();
      return;
    }

    const destroy = event.target.closest('[data-inv-destroy]');
    if (destroy) {
      destroySelectedInventory();
      return;
    }

    const inventoryPage = event.target.closest('[data-inventory-page]');
    if (inventoryPage) {
      const index = Number(inventoryPage.dataset.inventoryPage) || 0;
      content.querySelectorAll('[data-inventory-page]').forEach((button) => {
        const active = Number(button.dataset.inventoryPage) === index;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', String(active));
      });
      content.querySelectorAll('[data-inventory-page-panel]').forEach((group) => {
        const active = Number(group.dataset.inventoryPagePanel) === index;
        group.classList.toggle('is-active', active);
        group.toggleAttribute('hidden', !active);
      });
      const current = content.querySelector('[data-inventory-page-current]');
      if (current) current.textContent = String(index + 1);
      updateInventorySelectionUI();
      sync();
      requestAnimationFrame(() => {
        const body = document.body;
        if (body) body.scrollTop = 0;
      });
      return;
    }

    const pin = event.target.closest('[data-pin]');
    if (pin) { repin(pin.dataset.pin); return; }

    const nav = event.target.closest('[data-preview-step]');
    if (nav) { step(Number(nav.dataset.previewStep)); return; }

    const clock = event.target.closest('[data-clock-in]');
    if (clock) {
      requestClockIn().catch((err) => console.warn('[work]', err));
      return;
    }

    const page = event.target.closest('[data-page]');
    if (page) { openPage(page.dataset.page); return; }

    const full = event.target.closest('[data-character-full]');
    if (full) { openPage('character', full.dataset.characterFull); return; }

    const giftPage = event.target.closest('[data-gift-page]');
    if (giftPage) { openPage('gift', giftPage.dataset.giftPage); return; }

    const giveItem = event.target.closest('[data-gift-send-item]');
    if (giveItem) { confirmGift('private', giveItem.dataset.giftSendItem); return; }
    const giveTip = event.target.closest('[data-gift-send-tip]');
    if (giveTip) { confirmGift('tip', giveTip.dataset.giftSendTip); return; }

    const hit = event.target.closest('.prail > .pcard');
    if (hit) {
      openPreview(hit.dataset.name);
    }
  });

  content.addEventListener('change', (event) => {
    const input = event.target.closest('[data-inv-select]');
    if (input) {
      const row = parseInventorySelection(input);
      if (!row) return;
      if (input.checked) inventorySelection.set(row.key, row);
      else inventorySelection.delete(row.key);
      updateInventorySelectionUI();
      return;
    }
    const all = event.target.closest('[data-inv-select-all]');
    if (!all) return;
    const activeGroup = content.querySelector('[data-inventory-page-panel]:not([hidden])') || content;
    activeGroup.querySelectorAll('[data-inv-select]').forEach((checkbox) => {
      const row = parseInventorySelection(checkbox);
      if (!row) return;
      checkbox.checked = all.checked;
      if (all.checked) inventorySelection.set(row.key, row);
      else inventorySelection.delete(row.key);
    });
    updateInventorySelectionUI();
  });

  content.addEventListener('keydown', (event) => {
    const hit = event.target.closest('.prail > .pcard');
    if (!hit || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    openPreview(hit.dataset.name);
  });

  /* One level per press, the same order the landscape layer peels in: a page first,
     then the preview.  The two are never both standing, since a page replaces the
     column the preview lives in, but the order still has to be stated or a press with
     a page open would try to close a preview that is not there. */
  addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (workspace) closePage();
    else if (open) close();
  });

  /* Delegated, because the dots are rebuilt with the panel.  Which card is scrolled
     to drives them; scroll-snap does the paging, so there is no next-page button to
     miss on a touch screen. */
  content.addEventListener('click', (event) => {
    const dot = event.target.closest('[data-dot]');
    if (!dot) return;
    rail()?.scrollTo({ left: Number(dot.dataset.dot) * pitch, behavior: 'smooth' });
  });

  onLive(() => {
    if (!document.querySelector('.viewport')?.classList.contains('is-portrait')) return;
    if (workspace && workspace !== 'map' && workspace !== 'arcade') return;
    paintBase({ restoreScroll: true });
  });

  return {
    openPreview,
    close,
    openPage,
    closePage,
    openedPage: () => workspace,
    relayout: () => { placeCardArts(content); sync(); },
  };
}

export { TOOL };
