import geo from './geometry.json';
import dockArtRaw from './dock-art.json';
import { rebaseRecord } from './asset.js';
import devMatrix from './dev-matrix.json';
import {
  DEV_PARTS, DEV_TIERS, EXPERIENCE_FIELDS, NO_STATUS, PRIVACY, THRESHOLDS,
  CITY_BUILD_COST, characterDetails, dailyEvents, devProgress, experienceLevel, fanAccounts, fanLine, giftLabel, giftScenes, girls, homeState, itemIcon, MAP_MARKER_ITEM,
  itemIconTag, onLive, partArt, player, potencyNotches, SLOT_STATES, streamSchedule, sortedEvents, workBadge, workState, world,
} from './data.js';
import { buildDockLens, buildDockRim, buildDockUnderglow } from './dock.js';
import { icons } from './icons.js';
import { collapseHud, openPhone, reportOverlay, requestClockIn, sendChat } from './bridge.js';
import { formatTravelMessage } from './travel.js';
import { applyPrefClick, settingsBody } from './settings.js';

let devNotesModulePromise;
const loadDevNotes = () => (devNotesModulePromise ||= import('./dev-notes.js'));
import { isMapOpen, mountMapOverlay } from './map.js';
import { isArcadeOpen, mountArcadeOverlay } from './arcade.js';
import { isCgOpen, mountCgOverlay } from './cg.js';
import { isShopOpen, mountShopOverlay } from './shop.js';
import { insertSafeHTML, safeFirstElement, setSafeHTML } from './dom.js';

const dockArt = rebaseRecord(dockArtRaw);

const ic = (name) => (name ? `<i class="ic">${icons[name]}</i>` : '');
const clampPct = (value, max = 100) => Math.max(0, Math.min(100, (value / max) * 100));
const frame = (box) => `--x:${box.x}px; --y:${box.y}px; --w:${box.w}px; --h:${box.h}px`;

/* An extracted ornament, placed by canvas coordinate at its natural size -- these
   are pixels cut from the mockups, so scaling them would soften the only crisp
   thing about them. */
function art(key, cls, box) {
  const a = dockArt[key];
  return `<img class="${cls}" src="${a.src}" alt="" draggable="false"
    style="left:${box.x}px; top:${box.y}px; width:${a.w}px; height:${a.h}px">`;
}
const mark = () => `<img class="dock-mark" src="${dockArt.markSakura.src}" alt="" draggable="false">`;

/* A meter can mark the thresholds the schema states outright (顺从度 350/600,
   体力 20, 尿意 60/80), so the number means something without the player having
   to remember which value unlocks what. */
function meter(label, value, max = 100, tone = 'pink', ticks = [], icon = '') {
  const marks = ticks
    .filter((t) => t > 0 && t < max)
    .map((t) => `<u class="${value >= t ? 'is-past' : ''}" style="--at:${(t / max) * 100}%"></u>`)
    .join('');
  return `
    <div class="page-meter tone-${tone}">
      <div class="page-meter-head">${ic(icon)}<span>${label}</span><b>${value}</b><em>/ ${max}</em></div>
      <div class="page-meter-track"><i style="--pct:${clampPct(value, max)}%"></i>${marks}</div>
    </div>`;
}

/* An ordered enum reads as filled pips: it shows the level and the ceiling at once
   without implying a precision the variable does not have. */
function pips(label, value, steps, tone = 'blue') {
  return `
    <div class="dock-pips tone-${tone}">
      <div class="dock-pips-head"><span>${label}</span><b>${steps[value] ?? value}</b><em>${value} / ${steps.length - 1}</em></div>
      <div class="dock-pips-row">${steps.map((_, n) => `<i class="${n && n <= value ? 'on' : ''}"></i>`).slice(1).join('')}</div>
    </div>`;
}

/* The 送礼 / 打赏 entry.
   ------------------------------------------------------------------
   One button, two panels, and the label follows her state rather than being fixed:
   打赏 when she is live, 送礼 when she is next to you, both when both.  When neither
   is true it is disabled and says which -- a dead control that looks live teaches the
   reader the panel does not respond, which is the rule the settings page's
   尚未生效 chips already follow. */
function giftButton(name) {
  const scenes = giftScenes(name);
  if (!scenes.any) {
    return `<span class="dock-gift is-off" aria-disabled="true">${scenes.reason}</span>`;
  }
  return `<button class="dock-gift" type="button" data-gift-open="${name}"
    aria-label="给 ${name} ${giftLabel(scenes)}">${ic('heart')}${giftLabel(scenes)}</button>`;
}

/* 直播中 is the one thing about her that is happening elsewhere and now, so it reads
   as a lit chip next to her name rather than as a row further down. */
function liveChip(name) {
  const { stream, fan } = characterDetails[name];
  if (!stream?.live) return '';
  const tier = fan?.tier && fan.tier !== '无' ? `<em>${fan.tier}</em>` : '';
  return `<span class="dock-chip is-live" title="${stream.title}">
    <i></i>直播中 · 热度 ${stream.heat.toLocaleString('en-US')}${tier}</span>`;
}

/* ---------------------------------------------------------------- the dock */
/* The quick view carries base values only -- 羁绊, 生理, and where she is.  The 11
   性经历 counters and the four 开发度 tiers are a wall of numbers and long prose;
   they belong in the archive, which is the whole reason the archive exists. */
function characterDock(girl) {
  const d = geo.dock;
  const { bond, physiology, location, fan } = characterDetails[girl.name];
  const statuses = physiology.statuses.length
    ? physiology.statuses.map((s) => `<span>${s}</span>`).join('')
    : `<span class="is-muted">${NO_STATUS}</span>`;
  const here = location || world.location;
  const fl = fanLine(fan);

  return `
<div class="dock-root t-${girl.theme}" role="dialog" aria-label="${girl.name} 角色速览">
  <div class="dock-blur"></div>
  <div class="dock-scatter"></div>
  <div class="dock-tint"></div>
  <div class="dock-header-scrim"></div>
  <div class="dock-frost"></div>
  <div class="dock-edge"></div>
  <svg class="dock-underglow" aria-hidden="true"></svg>
  <svg class="dock-lens" aria-hidden="true"></svg>

  <div class="dock-bays">
    <button class="dock-close" type="button" data-dock-close aria-label="收起速览"
      style="--x:${d.closeBtn.x}px; --y:${d.closeBtn.y}px; --d:${d.closeBtn.d}px">×</button>

    <div class="dock-bay bay-ear" style="${frame(d.bays.ear)}">
      <div class="dock-portrait">
        <img src="${girl.art}" alt="" draggable="false">
      </div>
    </div>

    <div class="dock-bay bay-main" style="${frame(d.bays.main)}">
      <div class="dock-id">
        <h2>${girl.name}<small>${girl.romaji}</small></h2>
        <span class="dock-chip">${ic('smile')}心情 · ${bond.mood}</span>
        ${liveChip(girl.name)}
      </div>

      <!-- 送礼 rides on the 羁绊 header because 好感度 is the value it moves, and
           because the pod bay has 189 units already spending them on three rows and
           the 完整档案 button -- a second full-width primary there needs a height
           re-budget, whereas this row's <i> is slack by construction. -->
      <section class="dock-panel">
        <div class="dock-group-title">${mark()}<b>羁绊</b><span>长线累积</span><i></i>
          ${giftButton(girl.name)}</div>
        <div class="dock-bond">
          ${meter('好感度', bond.favor, 1000, 'pink', [], 'heart')}
          ${meter('顺从度', bond.obedience, 1000, 'violet', THRESHOLDS.obedience, 'heartOutline')}
        </div>
      </section>

      <section class="dock-panel">
        <div class="dock-group-title">${mark()}<b>生理</b><span>即时状态</span><i></i></div>
        <div class="dock-vitals">
          ${meter('性欲度', physiology.desire, 100, 'rose', THRESHOLDS.desire, 'heart')}
          ${meter('体力', physiology.stamina, 100, 'blue', THRESHOLDS.stamina, 'clock')}
          ${meter('尿意', physiology.bladder, 100, 'gold', THRESHOLDS.bladder, 'moon')}
        </div>
        <!-- 异常状态 is a 生理 field in the schema, so it rides with the vitals
             rather than being parked in another column. -->
        <div class="dock-status-row">
          <span class="dock-sub">异常状态</span>
          <div class="dock-tags">${statuses}</div>
        </div>
      </section>
    </div>

    <div class="dock-bay bay-pod" style="${frame(d.bays.pod)}">
      <section class="dock-panel">
        <div class="dock-group-title">${mark()}<b>所在</b><span>她在哪</span><i></i></div>
        <div class="dock-where">${ic('mapPin')}<b>${here.area}</b></div>
        <div class="dock-place">${here.place || '—'}</div>
        ${pips('私密度', here.privacy, PRIVACY, 'violet')}
        <div class="dock-fan">${fl.follow ? '关注' : '未关注'} · ${fl.tier} · ${fl.lv} · ${fl.yen}</div>
      </section>
      <button class="page-primary" type="button" data-character-full="${girl.name}">完整档案 ${ic('arrowRight')}</button>
    </div>
  </div>

  <svg class="dock-rim" aria-hidden="true"></svg>

  <!-- Ornaments ride above the rim: the blossom is meant to straddle the ear's
       corner, so the rim must not be drawn on top of it. -->
  <div class="dock-art">
    ${art('dockBlossom', 'dock-blossom-art', d.art.blossom)}
    ${art('heroineTitle', 'dock-title-art', d.art.title)}
    <span class="head-caption" style="left:${d.art.caption.x}px; top:${d.art.caption.y}px">
      <span class="slash">/</span><span class="cjk">女主角速览</span>
    </span>
  </div>
</div>`;
}

function paintDock(layer) {
  const underglow = layer.querySelector('.dock-underglow');
  const lens = layer.querySelector('.dock-lens');
  const rim = layer.querySelector('.dock-rim');
  if (underglow) buildDockUnderglow(underglow);
  if (lens) buildDockLens(lens);
  if (rim) buildDockRim(rim);
}

/* ------------------------------------------------------- full workspaces */
/* The sheet carries the same material as the shell and the dock.  Refraction stays
   on the section itself rather than on a child: backdrop-filter makes an element a
   backdrop root, so a nested blur would have nothing to sample -- the same trap
   documented for the shell's clip-path in index.html.  That also means the separate
   scatter pass the shell uses is not available here, so its saturation is folded
   into this blur instead. */
function pageShell(titleEn, titleZh, body, cls = '') {
  return `
    <div class="page-shade" data-close></div>
    <section class="page-modal ${cls}" role="dialog" aria-label="${titleZh}">
      <div class="sheet-frost"></div>
      <div class="sheet-edge"></div>
      <header class="page-modal-head">
        <div><span>${titleEn}</span><h2>${titleZh}</h2></div>
        <button class="page-close" type="button" data-close aria-label="关闭">×</button>
      </header>
      <div class="page-modal-body">${body}</div>
    </section>`;
}

/* 性经历 is eleven counters.  近期性经验次数 is separated out because it is the only
   one that can go *down* (it decays a point per eventless day), so listing it
   alongside the lifetime tallies would misread -- and it is the one number here that is
   not a tally, which is why it keeps its bare numeral while the tallies get bars.

   The tallies are a plain hairline list rather than eleven bordered tiles -- boxes
   around single digits is most of what made this page feel like instrumentation.  The bar
   under each one is the opposite move: twelve digits in a grid is a list you have to read
   value by value to find the two that are not zero, whereas twelve bars is a shape you
   take in at once.  The digit stays, because the bar deliberately cannot be read back to
   a count -- see experienceLevel in data.js for why there is no ratio to draw. */
function experienceBlock(experience) {
  const [recentKey, recentLabel] = EXPERIENCE_FIELDS[0];
  const tallies = EXPERIENCE_FIELDS.slice(1);
  return `
    <div class="exp-recent">
      <span>${recentLabel}</span>
      <b>${experience[recentKey]}</b>
      <em>最近一周 · 无事发生的一天 -1</em>
    </div>
    <ul class="exp-list">
      ${tallies.map(([key, label]) => {
        const name = label.replace('经验', '');
        const value = experience[key];
        const band = experienceLevel(value);
        /* The band name is the one thing the colour cannot say out loud, and 133px of
           column has no room for it -- so it rides on `title` for a pointer and on
           aria-label for anyone who is not seeing the colour at all. */
        return `
      <li class="${value ? '' : 'is-zero'}" style="--hue:${band.hue}"
        title="${name} ${value} 次 · ${band.name}" aria-label="${name} ${value} 次，${band.name}">
        <span>${name}</span><b>${value}</b>
        <i class="exp-bar" style="--pct:${band.pct}%" aria-hidden="true"><u></u></i>
      </li>`;
      }).join('')}
    </ul>`;
}

/* 开发度 as part tiles.
   The authored 评语 run 80-145 characters each, so they cannot live in the tile --
   four of them side by side is the wall of text this page is trying not to be.
   The tile carries the crop, the part name, the 档位 and the 进度 toward the next one;
   the prose opens on click.

   The pips alone were the whole readout for a while, and they are the wrong instrument
   on their own: 档位 moves once every few game days, so four parts would sit visually
   identical through everything that happened in between.  The bar underneath is the
   part that actually moves, and it is labelled 进度/门槛 rather than a percentage
   because the 门槛 is not constant -- see DEV_TIER_STEPS.

   The crop is an <img> that hides itself if the file is absent, revealing the
   placeholder underneath -- so a missing file on the CDN needs no code change. */
function developmentTiles(girl, development, progress, today) {
  return DEV_PARTS.map(([key, label]) => {
    const tier = development[key];
    const p = devProgress(tier, progress?.[key], today?.[key]);
    return `
      <button class="dev-tile${tier ? '' : ' is-zero'}${p.dayFull && !p.capped ? ' is-dayfull' : ''}" type="button"
        data-dev-part="${key}" data-dev-name="${girl.name}"
        aria-label="${label} 开发度 ${tier} ${DEV_TIERS[tier]}，${devProgressLabel(p)}，点击查看评语">
        ${partCrop(girl, key, 'dev-crop')}
        <span class="dev-meta">
          <b>${label}</b>
          <span class="dev-tier">${tier} · ${DEV_TIERS[tier]}</span>
          ${devDayTag(p)}
        </span>
        <span class="dev-pips">${DEV_TIERS.map((_, n) =>
          `<i class="${n && n <= tier ? 'on' : ''}"></i>`).slice(1).join('')}</span>
        ${devProgressBar(p)}
      </button>`;
  }).join('');
}

/* The spoken form of the readout, for aria-label.  Same three states as the bar. */
function devProgressLabel(p) {
  if (p.capped) return '已封顶';
  const day = p.dayFull ? `今日已满 ${p.daily}` : `今日 +${p.today}`;
  return `距下一档 ${p.value} / ${p.need}，${day}`;
}

/* 今日已满 rides the name row, not the bar row.
   The bar row is bar + number and there is no width to spare there -- with the tag
   inline the bar collapsed to about 80px and, worse, came out a different length in
   every tile because the number beside it is 3 to 7 characters.  The name row has empty
   space to the right of `3 · 敏感` and nothing that competes for it.

   Rendered even when the day is not full, hidden but still laid out: the archive fits
   its panel exactly, and a tag that appears out of nowhere would reflow the row it sits
   in.  Reserving it also keeps all four tiles the same height. */
function devDayTag(p) {
  if (p.capped) return '';
  return `<mark class="dev-day"${p.dayFull ? '' : ' hidden'}>今日已满 ${p.daily}</mark>`;
}

/* The 进度 readout, shared by the tile and the 评语 sheet.

   Three states, and the middle one is the reason this is a bar and not a number:
     档位 5      -- full bar, 已封顶.  0/0 would look like the value failed to load.
     今日已满    -- the day's allowance is spent, so nothing that happens next will move
                   this bar.  Without saying so the panel looks broken rather than
                   throttled, so the today slice turns gold and the name row tags it.
     otherwise   -- 进度 / 门槛, with the slice gained today lit brighter at the leading
                   edge of the fill.

   The today slice is a second span rather than a gradient stop because it has to start
   part way along the bar (`--from`), and it is drawn inside the fill so it cannot
   overhang the track when 升档 resets 进度 mid-day. */
function devProgressBar(p) {
  const cls = p.capped ? ' is-capped' : (p.dayFull ? ' is-dayfull' : '');
  return `
        <span class="dev-prog${cls}" style="--pct:${p.pct}%;--from:${p.fromPct}%;--today:${p.todayPct}%">
          <i aria-hidden="true"><u></u>${p.todayPct ? '<s></s>' : ''}</i>
          <em>${p.capped ? '已封顶' : `${p.value} / ${p.need}`}</em>
        </span>`;
}

/* Same drop-in slot as the archive tiles: the <img> removes itself when the file
   is absent.  The sheet is where the crop is actually read, so it carries its own
   copy rather than relying on the tile behind the shade. */
function partCrop(girl, key, cls) {
  return `
        <span class="${cls}">
          <img src="${partArt(girl.name, key)}" alt="" draggable="false"
            data-remove-on-error>
          <em>暂无截图</em>
        </span>`;
}

/* The 评语 sheet.  Text comes from the authored matrix, indexed by tier -- nothing
   is written here, and a character with no matrix yet says so plainly rather than
   showing invented prose.  The crop sits beside the prose: the tiles are a 4-up
   index, and this is the view that shows the part. */
function developmentNote(name, partKey) {
  const girl = girls.find((item) => item.name === name) || girls[0];
  const tier = characterDetails[girl.name].development[partKey];
  const p = devProgress(tier, characterDetails[girl.name].developmentProgress?.[partKey],
    characterDetails[girl.name].developmentToday?.[partKey]);
  const label = (DEV_PARTS.find(([k]) => k === partKey) || [, partKey])[1];
  const note = characterDetails[girl.name].developmentNotes?.[partKey] || devMatrix[girl.name]?.[partKey]?.[tier];

  return `
    <div class="dev-sheet-shade" data-dev-close></div>
    <section class="dev-sheet t-${girl.theme}" role="dialog" aria-label="${girl.name} ${label} 评语">
      <header>
        <span class="dev-sheet-part">${label}</span>
        <b>开发度 ${tier}</b>
        <span class="dev-tier">${DEV_TIERS[tier]}</span>
        <span class="dev-pips">${DEV_TIERS.map((_, n) =>
          `<i class="${n && n <= tier ? 'on' : ''}"></i>`).slice(1).join('')}</span>
        ${devProgressBar(p)}
        ${p.dayFull && !p.capped ? `<mark class="dev-day">今日已满 ${p.daily}</mark>` : ''}
        <button class="dev-sheet-close" type="button" data-dev-close aria-label="关闭">×</button>
      </header>
      <div class="dev-sheet-body">
        ${partCrop(girl, partKey, 'dev-sheet-crop')}
        <div class="dev-sheet-copy" data-dev-note-name="${girl.name}" data-dev-note-part="${partKey}">
        ${note
          ? `<p>${note}</p>`
          : `<p class="is-muted">暂无评语</p>`}
        </div>
      </div>
    </section>`;
}

function characterFull(name) {
  const girl = girls.find((item) => item.name === name) || girls[0];
  const { bond, experience, development, developmentProgress, developmentToday } = characterDetails[girl.name];

  /* Deliberately no 羁绊 / 生理 here: both are on the dock, which stays mounted
     behind this page, so repeating them is what made the archive read as a
     monitoring dashboard.  The archive is only what the dock cannot hold.
     The name is not in the page title either -- the identity row below is the one
     place it belongs, next to the numbers it labels. */
  return pageShell('Archive', '完整档案', `
    <aside class="archive-profile t-${girl.theme}">
      <div class="archive-art"><img src="${girl.art}" alt="" draggable="false"></div>
    </aside>
    <div class="archive-content">
      <header class="archive-id">
        <h3>${girl.name}<small>${girl.romaji}</small></h3>
        <span class="archive-id-sub">${bond.mood} · 好感 ${bond.favor} · 顺从 ${bond.obedience}</span>
      </header>
      <section class="archive-sec archive-sec-dev">
        <div class="archive-head">${mark()}<b>身体开发度</b><span>四部位 · 档位只升不降 · 门槛逐档递增</span><i></i><div class="dev-note-actions"><button type="button" data-dev-notes-action="generate" data-dev-notes-name="${girl.name}">刷新评语</button><button type="button" data-dev-notes-action="restore" data-dev-notes-name="${girl.name}">恢复默认</button></div></div>
        <div class="dev-grid">${developmentTiles(girl, development, developmentProgress, developmentToday)}</div>
      </section>
      <section class="archive-sec">
        <div class="archive-head">${mark()}<b>性经历</b><span>计数</span><i></i></div>
        ${experienceBlock(experience)}
      </section>
    </div>
  `, 'character-archive');
}

function scheduleLineState(row) {
  const state = row.currentState ? SLOT_STATES[row.currentState] : null;
  const label = state?.label || '今日休息';
  const detail = row.live
    ? `${row.title || '直播间'}${row.heat ? ` · 热度 ${row.heat.toLocaleString('en-US')}` : ''}`
    : row.plannedToday ? `${row.start}–${row.end}` : row.note;
  return `<div class="schedule-line-state ${state?.tone || 'is-rest'}">
    <b>${label}</b><small>${detail}</small>
  </div>`;
}

function scheduleRun(row) {
  return row.days.map((day) => {
    const state = day.state ? SLOT_STATES[day.state] : null;
    const cls = [
      'schedule-run-day',
      day.active ? 'is-active' : 'is-rest',
      day.planned ? 'is-planned' : '',
      day.isToday ? 'is-today' : '',
      day.joinsPrevious ? 'joins-previous' : '',
      day.joinsNext ? 'joins-next' : '',
      state?.tone || '',
    ].filter(Boolean).join(' ');
    const label = day.active
      ? `${day.day} ${row.start}–${row.end}${state ? ` ${state.label}` : ''}`
      : `${day.day} 休息`;
    return `<span class="${cls}" aria-label="${row.name} ${label}" title="${label}"><i></i>${day.isToday ? '<em>今天</em>' : ''}</span>`;
  }).join('');
}

function schedulePage() {
  const model = streamSchedule();
  const dayHead = model.days.map((day) => `<b class="${day.isToday ? 'is-today' : ''}">${day.day}${day.isToday ? '<em>今天</em>' : ''}</b>`).join('');
  const rows = model.rows.map((row) => `
    <article class="schedule-line t-${row.theme}${row.watching ? ' is-watching' : ''}">
      <div class="schedule-line-id"><i></i><span><b>${row.name}</b><em>${row.romaji}</em></span></div>
      <div class="schedule-line-time"><b>${row.start}</b><span>– ${row.end}</span><small>${row.note}</small></div>
      <div class="schedule-run">${scheduleRun(row)}</div>
      ${scheduleLineState(row)}
    </article>`).join('');
  const today = model.today.map((row) => `<span class="schedule-today-chip t-${row.theme}${row.live ? ' is-live' : ''}"><i></i><b>${row.start}</b>${row.name}</span>`).join('');

  return pageShell('Weekly Schedule', '开播日程表', `
    <!-- The page's dateline, and only that.  It used to lead with a count of who was
         rostered, live and off; 今日顺序 below names those people, so the numbers were a
         tally of the next two rows.  What is left is the one fact the rest of the page
         needs and does not state: which day and hour 今日 means. -->
    <div class="schedule-summary">
      <div><b>${model.weekday} · ${model.clock}</b></div>
    </div>
    <div class="schedule-today"><b>今日顺序</b>${today}</div>
    <div class="schedule-board-head"><span>主播</span><span>常用时间</span><div>${dayHead}</div><span>今日状态</span></div>
    <div class="schedule-lines">${rows}</div>
  `, 'schedule-page');
}

function eventsPage() {
  const cards = sortedEvents().map((event) => {
    const conditions = Object.entries(event.conditions || {})
      .map(([key, value]) => {
        const text = Array.isArray(value) ? value.join(' / ')
          : typeof value === 'string' ? value
            : key === '体力上限' ? `≤ ${value}`
              : `≥ ${value}`;
        return `<span>${key} ${text}</span>`;
      }).join('');
    const notice = event.notice === true;
    const top = notice
      ? '<div class="event-top"><span>事件提示</span><em>待处理</em></div>'
      : `<div class="event-top"><span>${Array.isArray(event.category) ? event.category.join(' · ') : event.category}</span><em>优先级 ${event.priority}</em></div>`;
    const location = event.area
      ? `<div class="event-location">${ic('mapPin')}<span>${event.area}${event.place ? ` · ${event.place}` : ''}</span></div>`
      : '';
    return `
    <article class="event-card${event.status === '可触发' || notice ? ' is-ready' : ''}">
      ${top}
      <h3>${event.title}</h3>
      <p>${event.summary}</p>
      ${conditions ? `<div class="event-cond">${conditions}</div>` : ''}
      ${location}
      <button type="button" data-event-handle="${encodeURIComponent(event.id)}">去处理</button>
    </article>`;
  }).join('');

  return pageShell('Event Notices', '事件提示', `
    <div class="page-summary">
      <div><span>${world.calendar.full} · ${world.time.period}</span><b>${dailyEvents.length} 条待处理事件</b></div>
    </div>
    <div class="event-grid">${cards}</div>
  `, 'events-page');
}
function yen(n) {
  return `￥${Number(n || 0).toLocaleString('en-US')}`;
}

function fanBadge(row) {
  if (row.tier === '无') return '无牌子';
  return row.days ? `${row.tier} · ${row.days}天` : row.tier;
}

/* One fact of the 现在 strip: label, value, and the thing that qualifies it.
   The qualifier is the reason the strip is three cells and not three words -- 客厅 is
   not the same fact as 鼓岭区·云庭公寓, and 直播间 without a viewer count is a name with
   no state attached to it. */
function nowCell(label, value, sub) {
  return `
      <div class="profile-now-cell">
        <span>${label}</span>
        <b>${value}</b>
        ${sub ? `<em>${sub}</em>` : ''}
      </div>`;
}

/* 工作 and 居住 are the same shape -- a heading, a headline carrying its state, facts,
   and the caveat under them -- so they are one function.  The previous pass wrote the two
   out separately and they had already drifted by a row. */
function profileSec({ heading, aside, name, tag, tone, facts, note, action }) {
  return `
      <section class="profile-sec">
        <div class="archive-head">${mark()}<b>${heading}</b><span>${aside}</span><i></i></div>
        <div class="profile-sec-id">
          <h3>${name}</h3>
          ${tag ? `<span class="profile-tag ${tone}">${tag}</span>` : ''}
          ${action || ''}
        </div>
        <dl class="profile-facts">
          ${facts.map(([dt, dd, cls = '']) => `
          <div><dt>${dt}</dt><dd class="${cls}">${dd}</dd></div>`).join('')}
        </dl>
        ${note ? `<p class="profile-hint">${note}</p>` : ''}
      </section>`;
}

/* 主角档案.
   ------------------------------------------------------------------
   Two columns for the whole page, and the seven 粉丝身份 rows are the right one.
   The previous pass stacked 现在 / 工作+居住 / 粉丝身份 down a flex column and gave the
   pair `flex: 1`, with the roster behind a <details> underneath.  Both halves of that
   were wrong:

     * Opening the fold added ~330 units to a column inside a sheet of fixed height,
       so the flex line reclaimed them from the only item that could give -- the pair --
       which was crushed from 307 to 151 while its sections kept overflowing at their
       natural size.  The 工作 rows then drew straight through the roster underneath.
       Height in a fixed sheet is a budget, so nothing here is allowed to grow on a
       click: the roster is a column, always open, and the page cannot change size.

     * With the fold shut the pair had a spare ~230 units of nothing under two rows of
       facts, so the page managed to be crowded and empty at once.  As a column the
       roster takes that height, and 工作 / 居住 stack into the left one at a size their
       content actually wants.

   The other half of the rework is material.  These panels were rgba(32,38,78,.78) over
   rgba(16,20,48,.84) -- near-opaque slabs on a sheet whose whole point is that scene
   colour reaches through it, so the page read as a settings dialog pasted onto the HUD.
   They now use the sub-panel weight every other page here uses, and the section
   headings are the archive's own -- sakura mark, hairline, aside -- because this page
   and 完整档案 are the same kind of document. */
function profilePage() {
  const work = workState();
  const home = homeState();
  const accounts = fanAccounts();
  const watching = player.watching;
  const house = home.current;
  const badge = workBadge(work);
  const settled = !!house && house.area === home.home;
  const followedLive = accounts.filter((row) => row.follow && row.live).length;
  const fanHint = [
    `${accounts.length} 人`,
    followedLive ? `开播 ${followedLive}` : '',
    watching ? `正在看 ${watching}` : '未进房',
  ].filter(Boolean).join(' · ');

  const companion = player.companion;
  const companionSub = companion
    ? `心情 · ${characterDetails[companion]?.bond.mood ?? '—'}`
    : '身边没有人';
  const room = watching ? characterDetails[watching]?.stream : null;
  const roomSub = !watching ? '没有在看'
    : room?.live ? `直播中 · 热度 ${room.heat.toLocaleString('en-US')}`
      : '她没有在播';

  const fans = accounts.map((row) => `
      <button class="profile-fan t-${row.theme}${row.watching ? ' is-watching' : ''}${row.live ? ' is-live' : ''}"
        type="button" data-open-character="${row.name}" aria-label="查看 ${row.name} 的速览">
        <img src="${row.art}" alt="" draggable="false">
        <span class="profile-fan-id">
          <b>${row.name}<small>${row.romaji}</small></b>
          <small>${row.caption}</small>
        </span>
        <span class="profile-fan-lv"><b>${row.lv}</b><small>${fanBadge(row)}</small></span>
        <span class="profile-fan-yen">${row.yen}</span>
        ${ic('arrowRight')}
      </button>`).join('');

  const c = world.calendar;

  return pageShell('Profile', '主角档案', `
  <div class="profile-layout">
    <div class="profile-self">
      <div class="profile-now">
        ${nowCell('现在', world.location.area,
    `${world.location.place || '—'} · ${PRIVACY[world.location.privacy]} ${world.location.privacy}/5`)}
        ${nowCell('同行', companion || '独行', companionSub)}
        ${nowCell('直播间', watching || '未进房', roomSub)}
      </div>

      <!-- The档案 used to carry none of the protagonist's own numbers, on the grounds
           that 资金 and 体力 are already on the HUD.  But that is the relationship every
           other pair here has: the HUD previews and the page details.  What the HUD
           cannot show is the 20 floor the meter marks, or that 日收入 is a rate rather
           than a balance. -->
      <section class="profile-sec">
        <div class="archive-head">${mark()}<b>状态</b><span>资金 · 体力 · 当下</span><i></i></div>
        <div class="profile-state">
          <div class="profile-money">
            <b><span class="unit">￥</span>${player.money.toLocaleString('en-US')}</b>
            <em>${work.daily ? `+${yen(work.daily)} / 日` : '没有日收入'}</em>
          </div>
          ${meter('体力', player.stamina, 100, 'blue', THRESHOLDS.stamina, 'clock')}
        </div>
        <p class="profile-hint">${c.full}（${c.weekday}）· ${c.season} · ${c.week} · ${
  world.time.clock} ${world.time.period}。体力降到 ${THRESHOLDS.stamina[0]} 以下进入深度衰竭。</p>
      </section>

      ${profileSec({
    heading: '工作',
    aside: '合同 · 今日到岗',
    name: work.job || '无业',
    tag: badge.label,
    tone: badge.tone,
    facts: [
      ['地点', work.place || '—'],
      ['日收入', yen(work.daily), 'is-num'],
    ],
    note: work.job ? '到岗后领取。点地图不等于上班，也不发薪。' : '没有合同，日收入为零。',
    /* A button, not a span: it is pressed, so it has to be reachable by keyboard and
       announce itself as pressable.  Only rendered when the contract allows it at all
       -- see canClockIn in data.js. */
    action: work.canClockIn
      ? '<button class="page-secondary" type="button" data-clock-in>上班<span class="settings-stub">尚未接线</span></button>'
      : '',
  })}

      ${profileSec({
    heading: '居住',
    aside: '权属 · 能否带人回来',
    name: house ? house.name : '无住所',
    tag: house ? (settled ? '当前住所' : '未设住所') : '',
    tone: settled ? 'is-ok' : '',
    facts: [
      ['权属', house?.tenure || '—'],
      ['区域', house?.area || '—'],
    ],
    note: house ? house.desc : '还没有住所，夜里只能留在外面。',
  })}
    </div>

    <!-- 查看开播日程 used to sit under the roster here.  It is gone because 开播日程表 is
         one press away in the destination rail above the Status pane, and a second route
         to it from inside another page made this column the place people learned to look
         for it.  Its live hint line was the one thing the link carried that the rail does
         not, so that moved to the entry's note field (see the destinations list in
         data.js) rather than being lost.  The roster takes the freed height:
         .profile-fans is grid-auto-rows:1fr, so the rows simply breathe. -->
    <aside class="profile-fans-col">
      <div class="archive-head">${mark()}<b>粉丝身份</b><span>${fanHint}</span><i></i></div>
      <div class="profile-fans">${fans}</div>
    </aside>
  </div>
  `, 'profile-page');
}

/* 城市规划蓝图的「使用」按钮。用品本身不消耗，但每次确定建设要付一笔建设费，
   所以这颗按钮同时承担三件事：说清价钱、在付不起时禁用、把差额算给玩家看。
   真正的扣款与拒绝在宿主那一侧，这里只是别让人白填一张表。
   金额沿用上面那个 yen()。 */
function blueprintUseButton(cls = 'item-use') {
  const broke = player.money < CITY_BUILD_COST;
  const short = CITY_BUILD_COST - player.money;
  return `<button class="${cls}${broke ? ' is-broke' : ''}" type="button" data-map-marker-use
    ${broke ? 'disabled' : ''}
    title="${broke ? `建设费 ${yen(CITY_BUILD_COST)}，还差 ${yen(short)}` : `每次确定建设扣除 ${yen(CITY_BUILD_COST)}`}"
    aria-label="使用城市规划蓝图，建设费 ${yen(CITY_BUILD_COST)}${broke ? '，金钱不足' : ''}"
    >${broke ? `金钱不足<em>差 ${yen(short)}</em>` : `使用<em>${yen(CITY_BUILD_COST)}</em>`}</button>`;
}

/* Three kinds now, and they behave differently: 素材 are spent on crafting, 消耗品
   are spent on use and carry a universal 强度 1~5, 用品 are durable and instead
   carry 佩戴 -- so the meta line differs per kind rather than being one field. */
function itemCard(item, kind, selected = new Map()) {
  const meta = kind === 'material' ? item.source
    : kind === 'consumable' ? `强度 ${item.potency} / 5`
      : [item.rarity, item.worn ? '佩戴中' : '未佩戴'].filter(Boolean).join(' · ');
  /* The same cell the drawer and the portrait rows use: category art, with the hue-derived
     gem behind it as the drop-in fallback -- the <img> removes itself when the file is
     absent.  This page used to draw only the gem, which meant the one place with room to
     show an item properly was the one place not showing its art. */
  const icon = itemIcon(kind, item);
  const key = `${kind}:${item.name}`;
  const payload = encodeURIComponent(JSON.stringify({ kind, name: item.name, quantity: item.quantity }));
  /* 蓝图的「使用」是要花钱的，价钱得写在按钮上——不能让人点进地图、填完一整张表
     才在保存那一步撞上「金钱不足」。付不起就直接禁用，并把差额说出来。 */
  return `
    <article class="item-card b-${kind}${kind === 'goods' && item.worn ? ' is-worn' : ''}"
      style="--hue:${icon.hue}; --tilt:${icon.tilt}deg; --scale:${icon.scale}${
        kind === 'consumable' ? `; --potency:${item.potency}` : ''}">
      <label class="item-select" title="选择销毁">
        <input type="checkbox" data-inv-select="${payload}" ${selected.has(key) ? 'checked' : ''} aria-label="选择销毁 ${item.name}">
        <span></span>
      </label>
      <div class="item-cell">
        ${itemIconTag(icon, 'item-icon')}
        <span class="item-gem ${kind}"></span>
        ${potencyNotches(kind === 'consumable' ? item.potency : 0)}
      </div>
      <div class="item-copy"><h3>${item.name}</h3><p>${item.description}</p><span>${icon.label} · ${meta}</span></div>
      ${item.name === MAP_MARKER_ITEM ? blueprintUseButton() : ''}
      <b>${kind === 'goods' ? (item.worn ? '装备' : `×${item.quantity}`) : `×${item.quantity}`}</b>
    </article>`;
}

/* 3×3 fills the sheet without scrolling: two rows left a hole, four overflowed
   the body.  Extra items turn the board rather than lengthening it. */
const INVENTORY_LEAF = 9;
const INVENTORY_KINDS = [
  { kind: 'material', title: '素材', note: '采集与合成', take: () => player.inventory.materials },
  { kind: 'consumable', title: '消耗品', note: '使用后数量 -1', take: () => player.inventory.consumables },
  { kind: 'goods', title: '用品', note: '耐久品 · 使用不扣数量', take: () => player.inventory.goods },
];

function inventoryEntries() {
  return INVENTORY_KINDS.flatMap(({ kind, take }) => take().map((item) => ({ item, kind })));
}

function inventoryBoard(leaf = 0, selected = new Map()) {
  const all = inventoryEntries();
  const pages = Math.max(1, Math.ceil(all.length / INVENTORY_LEAF));
  const cur = Math.max(0, Math.min(leaf, pages - 1));
  const slice = all.slice(cur * INVENTORY_LEAF, (cur + 1) * INVENTORY_LEAF);
  const groups = INVENTORY_KINDS
    .map((def) => ({ ...def, items: slice.filter((row) => row.kind === def.kind).map((row) => row.item) }))
    .filter((group) => group.items.length);
  const body = all.length
    ? groups.map((group) => `
        <section>
          <header><h3>${group.title}</h3><span>${group.note}</span></header>
          <div class="item-grid">${group.items.map((item) => itemCard(item, group.kind, selected)).join('')}</div>
        </section>`).join('')
    : '<div class="inventory-empty">背包是空的</div>';
  const turns = pages > 1 ? `
    <button class="inventory-turn is-prev" type="button" data-inv-step="-1"
      ${cur === 0 ? 'disabled' : ''} aria-label="上一页">${ic('chevronRight')}</button>
    <button class="inventory-turn is-next" type="button" data-inv-step="1"
      ${cur >= pages - 1 ? 'disabled' : ''} aria-label="下一页">${ic('chevronRight')}</button>
    <div class="inventory-leaf">${cur + 1} / ${pages}</div>` : '';
  return `<div class="inventory-content">${body}</div>${turns}`;
}

function inventoryPage(leaf = 0, selected = new Map(), notice = '') {
  const { materials, consumables, goods } = player.inventory;
  return pageShell('Inventory', '背包与道具', `
    <div class="inventory-layout">
      <aside class="inventory-side">
        <span class="is-active">全部物品 <b>${materials.length + consumables.length + goods.length}</b></span>
        <span>素材 <b>${materials.length}</b></span>
        <span>消耗品 <b>${consumables.length}</b></span>
        <span>用品 <b>${goods.length}</b></span>
        <div class="stamina-card"><small>当前体力</small><b>${player.stamina}<em>/100</em></b><i><u style="--pct:${player.stamina}%"></u></i></div>
      </aside>
      <div class="inventory-board">
        <div class="inventory-toolbar">
          <label class="inventory-select-all"><input type="checkbox" data-inv-select-all>全选当前页</label>
          <span data-inv-selected-count>已选 ${selected.size} 项</span>
          <button type="button" class="inventory-destroy" data-inv-destroy ${selected.size ? '' : 'disabled'}>销毁选中</button>
          <em data-inv-status>${notice}</em>
        </div>
        ${inventoryBoard(leaf, selected)}
      </div>
    </div>
  `, 'inventory-page');
}

/* 横向的 羁绊总览 删掉了。它唯一的入口是 更多 托盘里那颗按钮，按钮一撤这页就再也走不到，
   而横向本来就把 羁绊 画在 dock 上（见 characterDock 的 dock-bond），这一页是同一批数字
   的第二个说法。竖屏的 relationsPage 留着：那边 dock 不存在，主角档案 里有一行通到它。 */

/* 全局设置。行数据和标记都在 settings.js —— 这一页两个构图都有，内容只该有一份。
   这是唯一一个内容与存档无关的页面：它写的是 localStorage 里的界面偏好，翻聊天、
   换角色卡都不影响它，所以它也是唯一一个不需要订阅 onLive 的页面。 */
function settingsPage() {
  return pageShell('Settings', '全局设置', `<div class="settings-board">${settingsBody()}</div>`, 'settings-page');
}

/* Three stacked layers, not one slot.
   ------------------------------------------------------------------
   The dock stays mounted while a page is open on top of it, so closing the page
   lands back on the quick view by itself -- which is why there is no longer a
   "收起到上方速览" button; it was doing what Escape and × already do.

   Escape and × peel exactly one layer: 评语 sheet -> page -> dock.
   The city map and the arcade are not sheets: they cover the unscaled viewport
   so pan/zoom and game pointers are not fighting the canvas transform, and they
   peel as a page. */
/* `onOverlay` fires when the city map or the arcade is about to take the viewport.  It
   used to be the tool button's job to evict the drawer and the gift tray first, but 街机
   now also opens from the compact more tray, and a destination that clears the bottom band from one
   entry point and not the other is a bug waiting to be found.  So the eviction moved to
   the thing that actually knows an overlay is opening. */
export function mountPages(stage, { onGift, onDock, onOverlay } = {}) {
  let layer = stage.querySelector(':scope > .page-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'page-layer';
    stage.appendChild(layer);
  }

  const viewport = stage.parentElement;
  let unmountMap = null;
  let unmountArcade = null;
  let unmountCg = null;
  let unmountShop = null;
  let dockName = null;
  let inventoryLeaf = 0;
  const inventorySelection = new Map();
  let inventoryNotice = '';
  const has = (sel) => !!layer.querySelector(sel);
  const drop = (sel) => layer.querySelectorAll(sel).forEach((el) => el.remove());
  const overlayOpen = () => !!unmountMap || !!unmountArcade || !!unmountCg || !!unmountShop
    || isMapOpen() || isArcadeOpen() || isCgOpen() || isShopOpen();

  const sync = () => {
    const dock = has('.dock-root');
    const modal = has('.page-modal');
    const sheet = has('.dev-sheet');
    layer.className = 'page-layer'
      + (dock || modal || overlayOpen() ? ' is-open' : '')
      + (modal ? ' has-modal' : '')
      + (sheet ? ' has-sheet' : '');
    /* Classes live on the stage so perf.css can freeze glass *behind* the layer
       (the shell, the dock, the drawer are siblings of .page-layer). */
    stage.classList.toggle('has-dock', dock);
    stage.classList.toggle('has-modal', modal || overlayOpen());
    stage.classList.toggle('has-sheet', sheet);
    /* 覆盖层铺满视口的时候，壳层得把它那两颗浮层钮收起来，否则它们盖住地图/街机自己的
       关闭钮。报在 sync 里而不是每个 open/close 各报一次：这里是所有开合的唯一汇合点，
       bridge 侧也只在状态真变了才发消息。 */
    reportOverlay(overlayOpen(), { page: modal });
  };

  const closeMap = () => {
    unmountMap?.();
    unmountMap = null;
  };

  const closeArcade = () => {
    unmountArcade?.();
    unmountArcade = null;
  };

  const closeCg = () => {
    unmountCg?.();
    unmountCg = null;
  };
  const closeShop = () => {
    unmountShop?.();
    unmountShop = null;
  };

  /* 三层覆盖层互斥，而且每个入口都得先把另外两层清掉 —— 以前是每处各写两行，
     加第三层的时候就是三行乘六处。 */
  const closeOverlays = () => { closeMap(); closeArcade(); closeCg(); closeShop(); };

  const closeNote = () => { drop('.dev-sheet, .dev-sheet-shade'); sync(); };
  const closePage = () => {
    closeNote();
    closeOverlays();
    drop('.page-shade, .page-modal');
    sync();
  };
  /* The gift tray and its card live outside this layer but are scoped to whoever the
     dock is showing, so whoever owns them has to hear that the dock changed -- see
     the wiring in content.js. */
  const closeAll = () => { closeOverlays(); layer.replaceChildren(); dockName = null; sync(); onDock?.(null); };

  /* Pages append after the dock rather than replacing the layer, so the dock keeps
     its DOM, its scroll and its already-built rim SVGs underneath. */
  const openPage = (html) => {
    closePage();
    insertSafeHTML(layer, 'beforeend', html);
    sync();
  };

  const openOverlay = (mount, options = {}) => {
    onOverlay?.();
    closeNote();
    drop('.page-shade, .page-modal');
    closeOverlays();
    const unmount = mount(viewport, { onClose: closePage, ...options });
    sync();
    return unmount;
  };

  const onMapTravel = async (travel) => {
    /* The iframe has already committed its local destination. Tear down the map
       before talking to the tavern so the HUD returns to its normal layout even if
       the chat request takes a moment. */
    closeMap();
    sync();
    try { await collapseHud(); } catch (error) { console.warn('[map] collapse HUD', error); }
    const message = formatTravelMessage(travel);
    try {
      const sent = await sendChat(message);
      if (!sent) console.info('[map] travel message generated', message);
    } catch (error) {
      console.warn('[map] send travel message', error);
    }
  };

  const openMap = (createMode = null) => {
    unmountMap = openOverlay(mountMapOverlay, { onTravel: onMapTravel, createMode });
  };
  const openArcade = () => { unmountArcade = openOverlay(mountArcadeOverlay); };
  const openCg = () => { unmountCg = openOverlay(mountCgOverlay); };
  const openShop = () => { unmountShop = openOverlay(mountShopOverlay); };

  const openCharacter = (name) => {
    const girl = girls.find((item) => item.name === name) || girls[0];
    /* Same portrait again with nothing on top of it means "collapse": the card is
       a toggle, so a second click puts the scene back. */
    if (dockName === girl.name && !has('.page-modal') && !overlayOpen()) { closeAll(); return; }
    closePage();
    drop('.dock-root');
    insertSafeHTML(layer, 'afterbegin', characterDock(girl));
    dockName = girl.name;
    paintDock(layer);
    sync();
    onDock?.(girl.name);
  };

  /* 速览面板原本只在 openCharacter 里渲染一次，于是快照更新后它还挂着旧数字 ——
     用户看到的现象是"必须关掉再点开才刷新"。卡片轨和竖屏预览早就订阅了 onLive，
     这里补上同一件事：拿当前 dockName 重建 .dock-root 并原地换掉。

     用整块替换而不是逐个字段改写，是因为这块面板的每个数字都由 characterDock 的模板
     算出来（阈值刻度、异常状态标签、私密度 pips、送礼按钮的可用性都会跟着变），
     逐字段同步等于把那套规则再写一遍，两份实现迟早对不上。 */
  const repaintDock = () => {
    if (!dockName) return;
    /* 竖屏走 portrait/content.js 那条路，这块面板不参与排版。 */
    if (document.querySelector('.viewport')?.classList.contains('is-portrait')) return;
    const current = layer.querySelector('.dock-root');
    if (!current) return;
    const girl = girls.find((item) => item.name === dockName);
    /* 快照可能把这位从名册里删掉（自建主播被移除）。这时留着最后一帧，不要在
       用户眼前把面板抽走 —— 关闭仍然由点击和 Escape 负责。 */
    if (!girl || !characterDetails[girl.name]) return;
    const next = safeFirstElement(characterDock(girl));
    if (!next) return;
    /* dock-rise 是入场动画。每次好感度变动都重播一遍，看起来就像面板自己重开了。 */
    next.classList.add('is-repaint');
    current.replaceWith(next);
    /* 底光、透镜、描边都是 dock.js imperative 画出来的 SVG，跟着新节点重画。 */
    paintDock(layer);
    /* 不碰 sync()/onDock()：开合状态和礼物盘的归属都没变。 */
  };
  onLive(repaintDock);

  const paintInventoryLeaf = (delta) => {
    const board = layer.querySelector('.inventory-board');
    if (!board) return;
    const pages = Math.max(1, Math.ceil(inventoryEntries().length / INVENTORY_LEAF));
    const next = Math.max(0, Math.min(pages - 1, inventoryLeaf + delta));
    if (next === inventoryLeaf) return;
    inventoryLeaf = next;
    setSafeHTML(board.querySelector('.inventory-content') || board, inventoryBoard(inventoryLeaf, inventorySelection));
    updateInventorySelectionUI();
  };

  const updateInventorySelectionUI = () => {
    const checks = [...layer.querySelectorAll('[data-inv-select]')];
    const all = layer.querySelector('[data-inv-select-all]');
    const count = layer.querySelector('[data-inv-selected-count]');
    const destroy = layer.querySelector('[data-inv-destroy]');
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
    const status = layer.querySelector('[data-inv-status]');
    const button = layer.querySelector('[data-inv-destroy]');
    if (button) button.disabled = true;
    try {
      const ok = await sendChat(message);
      inventorySelection.clear();
      inventoryNotice = ok ? '销毁请求已发送' : '已生成销毁请求';
      layer.querySelectorAll('[data-inv-select]').forEach((input) => { input.checked = false; });
      if (status) status.textContent = inventoryNotice;
      updateInventorySelectionUI();
    } catch (err) {
      inventoryNotice = '销毁请求发送失败';
      if (status) status.textContent = inventoryNotice;
      updateInventorySelectionUI();
      console.warn('[inventory] destroy request failed', err);
    }
  };

  const PAGES = {
    events: eventsPage,
    inventory: () => inventoryPage(inventoryLeaf, inventorySelection, inventoryNotice),
    profile: profilePage,
    schedule: schedulePage,
    settings: settingsPage,
  };

  const open = (page) => {
    if (page === 'phone') {
      closePage();
      openPhone().catch((err) => console.warn('[phone]', err));
      return;
    }
    if (page === 'map') { openMap(); return; }
    if (page === 'map-create') { openMap({ source: '城市规划蓝图' }); return; }
    if (page === 'arcade') { openArcade(); return; }
    if (page === 'cg') { openCg(); return; }
    if (page === 'shop') { openShop(); return; }
    if (page === 'inventory') {
      inventoryLeaf = 0;
      inventorySelection.clear();
      inventoryNotice = '';
    }
    const build = PAGES[page];
    if (!build) return;
    openPage(build());
  };

  /* The 评语 sheet is appended to the modal rather than replacing it, so closing
     the sheet returns to the archive with no re-render and no lost scroll. */
  /* Appended to the layer, not inside .page-modal: the modal carries a
     backdrop-filter and is therefore a backdrop root, so a sheet nested in it could
     not blur anything and would have to fake glass with an opaque fill. */
  const openNote = (name, part) => {
    if (!has('.page-modal')) return;
    closeNote();
    insertSafeHTML(layer, 'beforeend', developmentNote(name, part));
  };

  layer.addEventListener('click', (event) => {
    const gift = event.target.closest('[data-gift-open]');
    if (gift) { onGift?.(gift.dataset.giftOpen); return; }
    /* 设置页的互斥按钮自己就地改样式，不重建页面 —— 见 settings.js。 */
    if (applyPrefClick(event.target)) return;
    const page = event.target.closest('[data-page]');
    if (page) { open(page.dataset.page); return; }
    const invTurn = event.target.closest('[data-inv-step]');
    if (invTurn && !invTurn.disabled) {
      paintInventoryLeaf(Number(invTurn.dataset.invStep) || 0);
      return;
    }
    const mapMarker = event.target.closest('[data-map-marker-use]');
    if (mapMarker) { openMap({ source: MAP_MARKER_ITEM }); return; }
    const destroy = event.target.closest('[data-inv-destroy]');
    if (destroy) {
      destroySelectedInventory();
      return;
    }
    const eventHandle = event.target.closest('[data-event-handle]');
    if (eventHandle) {
      const id = decodeURIComponent(eventHandle.dataset.eventHandle || '');
      const item = dailyEvents.find((row) => row.id === id);
      if (!item) return;
      const original = eventHandle.textContent;
      eventHandle.disabled = true;
      eventHandle.textContent = '发送中…';
      sendChat(`去处理：${item.summary}`).then((ok) => {
        eventHandle.textContent = ok ? '已发送' : '发送失败';
      }).catch((err) => {
        console.warn('[events] send failed', err);
        eventHandle.textContent = '发送失败';
      }).finally(() => {
        setTimeout(() => { eventHandle.disabled = false; eventHandle.textContent = original; }, 1000);
      });
      return;
    }
    const devNotes = event.target.closest('[data-dev-notes-action]');
    if (devNotes) {
      loadDevNotes()
        .then(({ handleDevelopmentNotesButton }) => handleDevelopmentNotesButton(devNotes))
        .catch((error) => console.error('[dev-notes] lazy load', error));
      return;
    }    if (event.target.closest('[data-dev-close]')) { closeNote(); return; }
    const tile = event.target.closest('[data-dev-part]');
    if (tile) { openNote(tile.dataset.devName, tile.dataset.devPart); return; }
    if (event.target.closest('[data-dock-close]')) { closeAll(); return; }
    if (event.target.closest('[data-close]')) { closePage(); return; }
    const clock = event.target.closest('[data-clock-in]');
    if (clock) {
      requestClockIn().catch((err) => console.warn('[work]', err));
      return;
    }
    const full = event.target.closest('[data-character-full]');
    if (full) { openPage(characterFull(full.dataset.characterFull)); return; }
    const relation = event.target.closest('[data-open-character]');
    if (relation) openCharacter(relation.dataset.openCharacter);
  });

  layer.addEventListener('change', (event) => {
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
    layer.querySelectorAll('[data-inv-select]').forEach((checkbox) => {
      const row = parseInventorySelection(checkbox);
      if (!row) return;
      checkbox.checked = all.checked;
      if (all.checked) inventorySelection.set(row.key, row);
      else inventorySelection.delete(row.key);
    });
    updateInventorySelectionUI();
  });

  if (!stage.dataset.pageEscapeBound) {
    stage.dataset.pageEscapeBound = '1';
    addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (!has('.inventory-page')) return;
        event.preventDefault();
        paintInventoryLeaf(event.key === 'ArrowLeft' ? -1 : 1);
        return;
      }
      if (event.key !== 'Escape') return;
      if (has('.dev-sheet')) closeNote();
      else if (has('.page-modal') || overlayOpen()) closePage();
      else closeAll();
    });
  }

  return { open, openCharacter, openMapCreate: () => openMap({ source: '城市规划蓝图' }), close: closeAll, openedCharacter: () => dockName };
}
