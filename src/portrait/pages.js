/* Portrait pages.
   ------------------------------------------------------------------
   A page here replaces the column rather than being appended below it.  Three reasons,
   and the first is the one that rules out every alternative: the landscape pages cannot
   be reused at all, because .page-modal is 1520×771 pinned at (76,52) in landscape
   canvas coordinates, and inside the portrait scale that is about 340 real pixels tall
   on a phone.

   Given that a portrait page has to be built from scratch, the question was whether it
   should be a third panel appended to the elastic column or take the column over.  It
   takes it over.  The Status and Girls panels already exceed one screen at some widths
   (scripts/check-responsive.mjs reports the first-screen height per width), so a page
   appended underneath would open below the fold: the reader would press 背包 and see
   nothing move.  Replacing the column means the page is simply *there*, and the
   document shrinks back to the base view's height on close.

   This is also why the portrait 背包 does not get the landscape drawer.  The drawer
   exists to occupy the desktop band under the landscape shell without covering the
   scene; portrait has no such band -- the column is the whole composition -- so there
   is nothing for a rail to sit in and no scene for it to preserve.

   Every page carries `data-panel="page"`, so one clip path and one blossom entry in
   stage.js serve all of them. */

import devMatrix from '../dev-matrix.json';
import {
  DEV_PARTS, DEV_TIERS, EXPERIENCE_FIELDS, GUARD_DAYS, NO_STATUS, NOTICE, PRIVACY, THRESHOLDS,
  characterDetails, experienceLevel, fanAccounts, fanLine, giftIcon, giftRail, giftScenes, girls,
  homeState, inventoryRail, itemIconTag, partArt, player, potencyNotches, scheduleHint, SLOT_STATES, streamSchedule, sortedEvents, workState, world,
} from '../data.js';
import { head, ic, meter, pct, section } from './parts.js';

/* The one-line reminder of what a bucket's numbers mean, the same wording the
   landscape page uses. */
const BUCKET_NOTE = {
  goods: '耐用品 · 使用不扣数量',
  consumable: '使用后数量 -1',
  material: '采集与合成',
};

/* Three chips, and the third differs per bucket because the buckets differ: 消耗品
   carry 强度, 用品 carry 佩戴, 素材 carry 来源.  One shared field would have to be the
   weakest of the three. */
function tags(item) {
  const third = item.bucket === 'consumable' ? `强度 ${item.potency} / 5`
    : item.bucket === 'goods' ? (item.worn ? '佩戴中' : '未佩戴')
      : item.source;
  return [item.icon.label, third]
    .filter(Boolean)
    .map((text) => `<em>${text}</em>`)
    .join('');
}

/* The cell is the drawer's, rebuilt in portrait units: a shallow well, the item
   floating above its floor with its own separate shadow, and a cone of the item's hue
   rising out of the floor.  The <img> removes itself when the category art is absent,
   revealing the hue-derived placeholder underneath -- so dropping the 16 files into
   public/assets/items/ is the whole integration, in both layouts. */
function cell(item) {
  return `
    <span class="pslot">
      <span class="pslot-well"></span>
      ${itemIconTag(item.icon, 'pslot-icon')}
      <span class="pslot-gem"></span>
      ${potencyNotches(item.bucket === 'consumable' ? item.potency : 0)}
      ${item.quantity > 1 ? `<span class="pslot-qty">${item.quantity}</span>` : ''}
      ${item.worn ? '<span class="pslot-worn"></span>' : ''}
    </span>`;
}

/* A row rather than a grid tile.  The elastic canvas has height to spend and 795 units
   of usable width, which is enough to show the 描述 -- and the 描述 is the reason to
   open this page at all, since the drawer and the rail can only ever show an icon. */
function row(item) {
  return `
  <button class="pinv-row b-${item.bucket}${item.worn ? ' is-worn' : ''}" type="button"
    data-item="${item.name}" data-set="${item.icon.set}" data-placing="${item.icon.placing}"
    style="--hue:${item.icon.hue}; --tilt:${item.icon.tilt}deg; --scale:${item.icon.scale}${
      item.bucket === 'consumable' ? `; --potency:${item.potency}` : ''}"
    aria-label="${item.icon.label} · ${item.name}，数量 ${item.quantity}">
    ${cell(item)}
    <span class="pinv-copy">
      <b>${item.name}</b>
      <span class="pinv-tags">${tags(item)}</span>
      <p>${item.description}</p>
    </span>
  </button>`;
}

function group(g, index) {
  return `
  <section class="pinv-group${index === 0 ? ' is-active' : ''}" data-inventory-page-panel="${index}"${index === 0 ? '' : ' hidden'}>
    <div class="pinv-head">
      <b>${g.label}</b><span>${BUCKET_NOTE[g.bucket]}</span><i></i><em>${g.items.length}</em>
    </div>
    ${g.items.map(row).join('')}
  </section>`;
}

/* One named category per page keeps the full-screen mobile bag bounded even as the AI adds items. */
export function inventoryPage() {
  const groups = inventoryRail();
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return `
<section class="ppanel is-page" data-panel="page" role="dialog" aria-label="背包与道具">
  ${head('Inventory', '背包与道具')}
  <button class="pclose" type="button" data-page-close aria-label="返回">×</button>

  <div class="pinv-top">
    <div class="pinv-count">${ic('memo')}<b>${total}</b><span>件道具</span></div>
    <div class="pinv-stamina">
      <div class="pinv-stamina-head">${ic('clock')}<span>当前体力</span><b>${player.stamina}</b><em>/ 100</em></div>
      <div class="pbar"><i style="--pct:${pct(player.stamina, 100)}%"></i></div>
    </div>
  </div>

  <hr class="prule">

  ${groups.length ? `
  <div class="pinv-pager" role="tablist" aria-label="背包分类">
    ${groups.map((group, index) => `<button type="button" role="tab" data-inventory-page="${index}"
      aria-selected="${index === 0}" class="${index === 0 ? 'is-active' : ''}">
      <b>${group.label}</b><span>${group.items.length}</span>
    </button>`).join('')}
  </div>
  <p class="pinv-page-note"><b data-inventory-page-current>1</b><span>/ ${groups.length}</span></p>
  ${groups.map(group).join('')}` : '<div class="pinv-empty">背包是空的</div>'}
</section>`;
}

/* ------------------------------------------------------------------ archive */

/* 开发度 as part tiles, two across, with the 评语 opening inside the tile.
   Not a sheet, which is what the landscape layout has to use: there .page-modal
   carries a backdrop-filter and is therefore a backdrop root, so a panel nested inside
   it could not refract anything and would have to imitate glass with an opaque fill.
   Portrait has no such constraint and its height is elastic, so the tile simply grows
   -- one fewer overlay, one fewer level to back out of, and the reader keeps their
   place in the page.

   Open, the tile is a two-column: crop at 3:2 on the left, prose on the right.  Closed,
   the crop is a 208-tall strip because four of those fit; the 评语 is the view that
   actually shows the part.

   The crop is a drop-in slot, the same pattern as the landscape tiles and the item
   cells: the <img> removes itself when the file is absent, revealing the placeholder,
   so adding real part art needs no code change. */
function devTiles(girl, development) {
  return DEV_PARTS.map(([key, label]) => {
    const tier = development[key];
    const note = devMatrix[girl.name]?.[key]?.[tier];
    const id = `pdev-${key}`;
    return `
    <div class="pdev-tile${tier ? '' : ' is-zero'}">
      <button class="pdev-open" type="button" data-dev-part="${key}"
        aria-expanded="false" aria-controls="${id}">
        <span class="pdev-crop">
          <img src="${partArt(girl.name, key)}" alt="" draggable="false" onerror="this.remove()">
          <em>暂无截图</em>
        </span>
        <span class="pdev-meta">
          <b>${label}</b><span>${tier} · ${DEV_TIERS[tier]}</span>
          ${ic('chevronRight')}
        </span>
        <span class="pdev-pips">${DEV_TIERS.map((_, n) =>
          `<i class="${n && n <= tier ? 'on' : ''}"></i>`).slice(1).join('')}</span>
      </button>
      <div class="pdev-note" id="${id}" hidden>
        ${note
          ? `<p>${note}</p>`
          : `<p class="is-muted">暂无评语</p>`}
      </div>
    </div>`;
  }).join('');
}

/* Same two-line row as the landscape list, plus the band name written out: a portrait
   column is 381 units wide against the landscape 133, which is room for the two
   characters the colour would otherwise be carrying on its own. */
function experienceBlock(experience) {
  const [recentKey, recentLabel] = EXPERIENCE_FIELDS[0];
  const tallies = EXPERIENCE_FIELDS.slice(1);
  return `
  <div class="pexp-recent">
    <span>${recentLabel}</span><b>${experience[recentKey]}</b>
    <em>最近一周 · 无事发生的一天 -1</em>
  </div>
  <ul class="pexp-list">
    ${tallies.map(([key, label]) => {
      const name = label.replace('经验', '');
      const value = experience[key];
      const band = experienceLevel(value);
      return `
    <li class="${value ? '' : 'is-zero'}" style="--hue:${band.hue}"
      aria-label="${name} ${value} 次，${band.name}">
      <span>${name}</span><em>${band.name}</em><b>${value}</b>
      <i class="pexp-bar" style="--pct:${band.pct}%" aria-hidden="true"><u></u></i>
    </li>`;
    }).join('')}
  </ul>`;
}

/* Unlike the landscape archive, this one carries 羁绊 and 生理.
   There it is deliberately left out because the 速览 dock stays mounted behind the
   page, so repeating her core numbers is what made the archive read as a monitoring
   dashboard.  In portrait a page replaces the column, so there is nothing behind it --
   and the archive is reachable straight from 羁绊总览 without passing the preview at
   all.  An archive that omits her mood and her state would then be a full screen with a
   hole in it.  The height this costs is free here: the canvas is elastic. */
export function characterPage(name) {
  const girl = girls.find((item) => item.name === name) || girls[0];
  const { bond, physiology, experience, development, location, fan } = characterDetails[girl.name];
  const statuses = physiology.statuses.length
    ? physiology.statuses.map((s) => `<span>${s}</span>`).join('')
    : `<span class="is-muted">${NO_STATUS}</span>`;
  const here = location || world.location;
  const fl = fanLine(fan);

  return `
<section class="ppanel is-page t-${girl.theme}" data-panel="page" role="dialog"
  aria-label="${girl.name} 完整档案">
  ${head(girl.romaji, `${girl.name} · 完整档案`)}
  <button class="pclose" type="button" data-page-close aria-label="返回">×</button>

  <div class="parc-id">
    <figure class="parc-art"><img src="${girl.art}" alt="" draggable="false"></figure>
    <div class="parc-id-copy">
      <h3>${girl.name}<small>${girl.romaji}</small></h3>
      <span class="pchip">${ic('smile')}心情 · ${bond.mood}</span>
      <div class="parc-status"><small>异常状态</small><div>${statuses}</div></div>
    </div>
  </div>

  ${section('羁绊', '长线累积')}
  ${meter('好感度', bond.favor, 1000, 'pink')}
  ${meter('顺从度', bond.obedience, 1000, 'violet', THRESHOLDS.obedience)}

  ${section('所在', '她在哪')}
  <p class="ppage-note">${ic('mapPin')} ${here.area}${here.place ? ` · ${here.place}` : ''} · ${PRIVACY[here.privacy] ?? ''} ${here.privacy}/5</p>
  <p class="ppage-note">${fl.follow ? '关注' : '未关注'} · ${fl.tier} · ${fl.lv} · ${fl.yen}</p>

  ${section('生理', '即时状态')}
  ${meter('性欲度', physiology.desire, 100, 'pink', THRESHOLDS.desire)}
  ${meter('体力', physiology.stamina, 100, 'blue', THRESHOLDS.stamina)}
  ${meter('尿意', physiology.bladder, 100, 'gold', THRESHOLDS.bladder)}

  ${section('身体开发度', '四部位')}
  <div class="pdev-grid">${devTiles(girl, development)}</div>

  ${section('性经历', '计数')}
  ${experienceBlock(experience)}
</section>`;
}

/* --------------------------------------------------------------------- gift */

/* 送礼, as a page rather than the landscape tray.
   ------------------------------------------------------------------
   Portrait has no desktop band under the column, so there is nothing for a rail to
   sit in -- the same reason the 背包 is a page here.  The trade is actually in this
   layout's favour: a row has room for the 描述 and the reason a 契合度 landed where
   it did, and those are the two things the landscape tray can only show after you
   pick a cell.

   The recipient header is the part the tray gets for free (her 速览 is mounted above
   it) and a page has to restate, because a page replaces the column and there is
   nothing behind it. */

/* Two columns, not three.  The third used to carry a 契合度 verdict; with that gone
   there is nothing to right-align, and the 254 units it cost go back to the 描述 --
   which is the reason this page exists rather than the tray. */
function bagRow(item) {
  const { icon } = item;
  const meta = item.bucket === 'consumable' ? `强度 ${item.potency} / 5`
    : item.bucket === 'goods' ? (item.worn ? '佩戴中' : '未佩戴')
      : item.source;
  return `
  <button class="pgift-row b-${item.bucket}" type="button"
    data-gift-send-item="${item.name}"
    style="--hue:${icon.hue}; --tilt:${icon.tilt}deg; --scale:${icon.scale}${
      item.bucket === 'consumable' ? `; --potency:${item.potency}` : ''}"
    aria-label="${item.name}，${icon.label}，数量 ${item.quantity}">
    <span class="pslot">
      <span class="pslot-well"></span>
      ${itemIconTag(icon, 'pslot-icon')}
      <span class="pslot-gem"></span>
      ${potencyNotches(item.bucket === 'consumable' ? item.potency : 0)}
      ${item.quantity > 1 ? `<span class="pslot-qty">${item.quantity}</span>` : ''}
    </span>
    <span class="pgift-copy">
      <b>${item.name}</b>
      <span class="pgift-tags">
        <em>${icon.label}</em>${meta ? `<em>${meta}</em>` : ''}<em>余 ${item.quantity}</em>
      </span>
      <p>${item.description}</p>
    </span>
  </button>`;
}

function tipRow(gift) {
  const icon = giftIcon(gift);
  const broke = player.money < gift.price;
  const price = gift.price ? `￥${gift.price.toLocaleString('en-US')}` : '免费';
  /* The tip row keeps a third column, because a price genuinely is a right-aligned
     number and the ladder is read by scanning it.  The bag rows have no such column. */
  return `
  <button class="pgift-row is-tip${broke ? ' is-broke' : ''}${gift.guard ? ' is-guard' : ''}"
    type="button" data-gift-send-tip="${gift.slug}" ${broke ? 'disabled' : ''}
    style="--hue:${gift.hue}; --fit:${gift.hue}"
    aria-label="${gift.name}，${price}${broke ? '，余额不足' : ''}">
    <span class="pslot">
      <span class="pslot-well"></span>
      ${itemIconTag(icon, 'pslot-icon')}
      <span class="pslot-gem"></span>
    </span>
    <span class="pgift-copy">
      <b>${gift.name}</b>
      <span class="pgift-tags"><em>${gift.group}</em>${gift.guard
        ? `<em>${GUARD_DAYS} 天</em>` : `<em>念ID ${NOTICE[gift.notice]}</em>`}</span>
      <p>${gift.note || ''}</p>
    </span>
    <span class="pgift-fit">
      <b>${price}</b>
      <em>${broke ? '余额不足' : gift.banner ? '触发飘屏' : '公开场合'}</em>
    </span>
  </button>`;
}

export function giftPage(name) {
  const girl = girls.find((item) => item.name === name) || girls[0];
  const { bond, stream, fan } = characterDetails[girl.name];
  const scenes = giftScenes(girl.name);
  const bag = inventoryRail();

  /* 私下 first when she is actually here: handing something over beats tipping
     someone who is in the same room. */
  const blocks = [];
  if (scenes.near) {
    blocks.push(`
  ${section('私下送礼', '数量 -1', '任何东西都能送')}
  ${bag.length
    ? bag.map((g) => `
  <div class="pgift-band"><b>${g.label}</b><i></i></div>
  ${g.items.map(bagRow).join('')}`).join('')
    : '<div class="pinv-empty">背包是空的</div>'}`);
  }
  if (scenes.live) {
    blocks.push(`
  ${section('直播打赏', `${stream.viewers.toLocaleString('en-US')} 人在看`, '不动背包')}
  ${giftRail().map((g) => `
  <div class="pgift-band"><b>${g.label}</b><i></i></div>
  ${g.items.map(tipRow).join('')}`).join('')}`);
  }

  return `
<section class="ppanel is-page t-${girl.theme}" data-panel="page" role="dialog"
  aria-label="送给 ${girl.name}">
  ${head(girl.romaji, `送给 ${girl.name}`)}
  <button class="pclose" type="button" data-page-close aria-label="返回">×</button>

  <div class="pgift-who">
    <img src="${girl.art}" alt="" draggable="false">
    <div class="pgift-who-copy">
      <b>${girl.name}</b>
      <span class="pgift-who-tags">
        <em>${ic('smile')}${bond.mood}</em>
        ${scenes.near ? '<em class="is-near">在身边</em>' : ''}
        ${scenes.live ? '<em class="is-live">直播中</em>' : ''}
        ${fan?.tier && fan.tier !== '无' ? `<em class="is-guard">${fan.tier}</em>` : ''}
      </span>
      ${meter('好感度', bond.favor, 1000, 'pink')}
    </div>
  </div>

  ${blocks.length
    ? blocks.join('')
    : `<p class="ppage-note">${scenes.reason}，现在没有可送的东西。</p>`}

  <p class="pgift-stub"><span class="pstub">发送尚未接线</span></p>
</section>`;
}

/* ------------------------------------------------------------------- events */

export function eventsPage() {
  const events = sortedEvents();
  const cards = events.map((event) => {
    /* 体力上限 is a ceiling and 需携带道具 is a name, so a blanket "≥" would state the
       opposite of the rule for one and nonsense for the other. */
    const conditions = Object.entries(event.conditions || {}).map(([key, value]) => {
      const text = Array.isArray(value) ? value.join(' / ')
        : typeof value === 'string' ? value
          : key === '体力上限' ? `≤ ${value}`
            : `≥ ${value}`;
      return `<span>${key} ${text}</span>`;
    }).join('');
    const ready = event.status === '可触发';
    const here = event.area === world.location.area;
    /* 分类 is declared in the schema as one value of an enum, but the authored pool has an
       event carrying two, so both shapes have to render.  Joined into one chip with a
       middot rather than split into two, to match what the landscape page does -- the
       failure either way was interpolating the field directly, which rendered
       Array.toString ("纯爱,调教") instead of a label. */
    const category = Array.isArray(event.category) ? event.category.join(' · ') : event.category;

    return `
    <article class="pevt${ready ? ' is-ready' : ''}">
      <div class="pevt-top">
        <span class="pevt-cat">${category}</span>
        <em>优先级 ${event.priority}</em>
        <b class="pevt-status${ready ? ' is-ready' : ''}">${event.status}</b>
      </div>
      <h3>${event.title}</h3>
      <p>${event.summary}</p>
      <div class="pevt-where${here ? ' is-here' : ''}">
        ${ic('mapPin')}<span>${event.area}${event.place ? ` · ${event.place}` : ''}</span>
        ${here ? '<em>当前所在</em>' : ''}
      </div>
      <details class="pevt-cond">
        <summary>触发条件 <i>${Object.keys(event.conditions || {}).length}</i></summary>
        <div>${conditions}</div>
      </details>
    </article>`;
  }).join('');

  const ready = events.filter((e) => e.status === '可触发').length;
  return `
<section class="ppanel is-page" data-panel="page" role="dialog" aria-label="当日事件">
  ${head('Today', '当日事件')}
  <button class="pclose" type="button" data-page-close aria-label="返回">×</button>

  <div class="pevt-sum">
    <div><b>${events.length}</b><span>条事件线索</span></div>
    <div><b class="is-ready">${ready}</b><span>可触发</span></div>
    <em>${world.calendar.full} · ${world.time.period}</em>
  </div>

  ${cards}
</section>`;
}

/* ------------------------------------------------------------- schedule */

function portraitScheduleRun(row) {
  return row.days.map((day) => {
    const state = day.state ? SLOT_STATES[day.state] : null;
    const cls = [
      'pschedule-run-day',
      day.active ? 'is-active' : 'is-rest',
      day.isToday ? 'is-today' : '',
      day.joinsPrevious ? 'joins-previous' : '',
      day.joinsNext ? 'joins-next' : '',
      state?.tone || '',
    ].filter(Boolean).join(' ');
    return `<span class="${cls}" title="${day.day}${day.active ? ` ${row.start}–${row.end}` : ' 休息'}"><i></i></span>`;
  }).join('');
}

function portraitScheduleState(row) {
  const state = row.currentState ? SLOT_STATES[row.currentState] : null;
  const label = state?.label || '今日休息';
  const detail = row.live
    ? `${row.title || '直播间'}${row.viewers ? ` · ${row.viewers.toLocaleString('en-US')} 人` : ''}`
    : row.note;
  return `<div class="pschedule-line-state ${state?.tone || 'is-rest'}"><b>${label}</b><small>${detail}</small></div>`;
}

export function schedulePage() {
  const model = streamSchedule();
  const hint = scheduleHint(model);
  const today = model.today.map((row) => `<span class="pschedule-today-chip t-${row.theme}${row.live ? ' is-live' : ''}"><i></i><b>${row.start}</b>${row.name}</span>`).join('');
  const rows = model.rows.map((row) => `
    <article class="pschedule-line t-${row.theme}${row.watching ? ' is-watching' : ''}">
      <div class="pschedule-line-top">
        <div class="pschedule-line-id"><i></i><span><b>${row.name}</b><em>${row.romaji}</em></span></div>
        <div class="pschedule-line-time"><b>${row.start}</b><span>– ${row.end}</span></div>
        ${portraitScheduleState(row)}
      </div>
      <div class="pschedule-line-days">${model.days.map((day) => `<b class="${day.isToday ? 'is-today' : ''}">${day.day.slice(1)}</b>`).join('')}</div>
      <div class="pschedule-run">${portraitScheduleRun(row)}</div>
    </article>`).join('');

  return `
<section class="ppanel is-page pschedule-page" data-panel="page" role="dialog" aria-label="开播日程表">
  ${head('Schedule', '开播日程表')}
  <button class="pclose" type="button" data-page-close aria-label="返回">&times;</button>
  <div class="pschedule-summary"><b>${hint}</b><span>${model.weekday} · ${model.clock}</span></div>
  <div class="pschedule-today"><b>今日顺序</b>${today}</div>
  <div class="pschedule-lines">${rows}</div>
</section>`;
}

/* ---------------------------------------------------------------- relations */

/* 好感度 and 顺从度 both, which the landscape page still does not do -- it draws one bar
   and pushes 顺从 and 心情 into a caption, and the schema treats all three as the 羁绊
   module.  A row here opens that character's archive directly, so this is the one route
   to an archive that does not pass through the preview. */
export function relationsPage() {
  const rows = [...girls]
    .sort((a, b) => b.metric.value - a.metric.value)
    .map((girl) => {
      const { bond, physiology } = characterDetails[girl.name];
      const abnormal = physiology.statuses.length;
      return `
      <button class="prel-row t-${girl.theme}" type="button" data-character-full="${girl.name}"
        aria-label="查看 ${girl.name} 的完整档案">
        <img src="${girl.art}" alt="" draggable="false">
        <span class="prel-copy">
          <b>${girl.name}<em>${girl.romaji}</em></b>
          <span class="prel-tags">
            <em>${ic('smile')}${bond.mood}</em>
            <em class="${abnormal ? 'is-abnormal' : ''}">${abnormal ? physiology.statuses[0] : NO_STATUS}</em>
          </span>
          ${meter('好感度', bond.favor, 1000, 'pink')}
          ${meter('顺从度', bond.obedience, 1000, 'violet', THRESHOLDS.obedience)}
        </span>
        ${ic('chevronRight')}
      </button>`;
    }).join('');

  return `
<section class="ppanel is-page" data-panel="page" role="dialog" aria-label="羁绊总览">
  ${head('Bonds', '羁绊总览')}
  <button class="pclose" type="button" data-page-close aria-label="返回">×</button>
  <div class="prel-list">${rows}</div>
</section>`;
}

function yen(n) {
  return `￥${Number(n || 0).toLocaleString('en-US')}`;
}

export function profilePage() {
  const work = workState();
  const home = homeState();
  const accounts = fanAccounts();
  const watching = player.watching;
  const house = home.current;
  const today = work.unemployed ? '无业'
    : work.workedToday ? '今日已上班'
      : work.atWork ? '在岗未上'
        : '未到岗';
  const fans = accounts.map((row) => `
    <button class="pfan t-${row.theme}${row.watching ? ' is-watching' : ''}${row.live ? ' is-live' : ''}"
      type="button" data-character-full="${row.name}" aria-label="查看 ${row.name}">
      <img src="${row.art}" alt="" draggable="false">
      <span class="pfan-copy">
        <b>${row.name}<em>${row.romaji}</em></b>
        <small>${row.caption}</small>
        <strong>${row.lv}<span>${row.tier === '无' ? '无牌子' : row.tier}</span>${row.yen}</strong>
      </span>
      ${ic('chevronRight')}
    </button>`).join('');

  const clock = work.canClockIn
    ? `<span class="pstub" data-clock-in>上班 · 尚未接线</span>`
    : '';

  return `
<section class="ppanel is-page pprofile" data-panel="page" role="dialog" aria-label="主角档案">
  ${head('Profile', '主角档案')}
  <button class="pclose" type="button" data-page-close aria-label="返回">×</button>

  <div class="pnow">
    <div><span>现在</span><b>${world.location.area}</b><em>${world.location.place || ''}</em></div>
    <div><span>同行</span><b>${player.companion || '独行'}</b></div>
    <div><span>直播间</span><b>${watching || '未进房'}</b></div>
  </div>

  ${section('工作', '合同日薪')}
  <p class="pkicker">${work.job || '无业'}</p>
  <dl class="pfacts">
    <div><dt>地点</dt><dd>${work.place || '—'}</dd></div>
    <div><dt>日收入</dt><dd>${yen(work.daily)}</dd></div>
    <div><dt>今日</dt><dd class="${work.workedToday ? 'is-ok' : work.atWork ? 'is-ready' : 'is-warn'}">${today}</dd></div>
  </dl>
  ${work.job ? '<p class="ppage-note">到岗后领取。点地图不发薪。</p>' : ''}
  ${clock}

  ${section('居住', '床在哪')}
  <p class="pkicker">${house ? house.name : '无住所'}${house?.tenure ? `<em>${house.tenure}</em>` : ''}</p>
  <dl class="pfacts">
    <div><dt>状态</dt><dd class="${house && house.area === home.home ? 'is-ok' : ''}">${
      house && house.area === home.home ? '当前住所' : '未设住所'
    }</dd></div>
  </dl>
  ${house ? `<p class="ppage-note">${house.desc}</p>` : ''}

  <details class="pfans-fold">
    <summary>
      <b>粉丝身份</b>
      <em class="is-shut">展开</em>
      <em class="is-open">收起</em>
      ${ic('chevronRight')}
    </summary>
    <div class="pfans">${fans}</div>
  </details>
  <div class="pprofile-routes">
    <button class="pprofile-schedule" type="button" data-page="relations">
      <b>查看羁绊总览</b>${ic('arrowRight')}
    </button>
    <button class="pprofile-schedule" type="button" data-page="schedule">
      <b>查看开播日程</b>${ic('arrowRight')}
    </button>
  </div>
</section>`;
}

/** Every route the portrait column can open. */
export const PORTRAIT_PAGES = {
  inventory: inventoryPage,
  character: characterPage,
  gift: giftPage,
  events: eventsPage,
  relations: relationsPage,
  profile: profilePage,
  schedule: schedulePage,
};
