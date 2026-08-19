import geo from './geometry.json';
import dockArtRaw from './dock-art.json';
import { rebaseRecord } from './asset.js';
import devMatrix from './dev-matrix.json';
import {
  DEV_PARTS, DEV_TIERS, EXPERIENCE_FIELDS, NO_STATUS, PRIVACY, THRESHOLDS,
  characterDetails, dailyEvents, experienceLevel, fanAccounts, fanLine, giftLabel, giftScenes, girls, homeState, itemIcon,
  itemIconTag, partArt, player, potencyNotches, scheduleHint, SLOT_STATES, streamSchedule, sortedEvents, workBadge, workState, world,
} from './data.js';
import { buildDockLens, buildDockRim, buildDockUnderglow } from './dock.js';
import { PREF_CHOICES, pref, setPref } from './prefs.js';
import { icons } from './icons.js';
import { requestClockIn } from './bridge.js';

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
    <i></i>直播中 · ${stream.viewers.toLocaleString('en-US')} 人${tier}</span>`;
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
   The tile carries the crop, the part name and the 档位; the prose opens on click.

   The crop is an <img> that hides itself if the file is absent, revealing the
   placeholder underneath -- so a missing file on the CDN needs no code change. */
function developmentTiles(girl, development) {
  return DEV_PARTS.map(([key, label]) => {
    const tier = development[key];
    return `
      <button class="dev-tile${tier ? '' : ' is-zero'}" type="button"
        data-dev-part="${key}" data-dev-name="${girl.name}"
        aria-label="${label} 开发度 ${tier} ${DEV_TIERS[tier]}，点击查看评语">
        ${partCrop(girl, key, 'dev-crop')}
        <span class="dev-meta">
          <b>${label}</b>
          <span class="dev-tier">${tier} · ${DEV_TIERS[tier]}</span>
        </span>
        <span class="dev-pips">${DEV_TIERS.map((_, n) =>
          `<i class="${n && n <= tier ? 'on' : ''}"></i>`).slice(1).join('')}</span>
      </button>`;
  }).join('');
}

/* Same drop-in slot as the archive tiles: the <img> removes itself when the file
   is absent.  The sheet is where the crop is actually read, so it carries its own
   copy rather than relying on the tile behind the shade. */
function partCrop(girl, key, cls) {
  return `
        <span class="${cls}">
          <img src="${partArt(girl.name, key)}" alt="" draggable="false"
            onerror="this.remove()">
          <em>待补部位截图</em>
        </span>`;
}

/* The 评语 sheet.  Text comes from the authored matrix, indexed by tier -- nothing
   is written here, and a character with no matrix yet says so plainly rather than
   showing invented prose.  The crop sits beside the prose: the tiles are a 4-up
   index, and this is the view that shows the part. */
function developmentNote(name, partKey) {
  const girl = girls.find((item) => item.name === name) || girls[0];
  const tier = characterDetails[girl.name].development[partKey];
  const label = (DEV_PARTS.find(([k]) => k === partKey) || [, partKey])[1];
  const note = devMatrix[girl.name]?.[partKey]?.[tier];

  return `
    <div class="dev-sheet-shade" data-dev-close></div>
    <section class="dev-sheet t-${girl.theme}" role="dialog" aria-label="${girl.name} ${label} 评语">
      <header>
        <span class="dev-sheet-part">${label}</span>
        <b>开发度 ${tier}</b>
        <span class="dev-tier">${DEV_TIERS[tier]}</span>
        <span class="dev-pips">${DEV_TIERS.map((_, n) =>
          `<i class="${n && n <= tier ? 'on' : ''}"></i>`).slice(1).join('')}</span>
        <button class="dev-sheet-close" type="button" data-dev-close aria-label="关闭">×</button>
      </header>
      <div class="dev-sheet-body">
        ${partCrop(girl, partKey, 'dev-sheet-crop')}
        <div class="dev-sheet-copy">
        ${note
          ? `<p>${note}</p>`
          : `<p class="is-muted">${girl.name} 的开发度评语矩阵尚未撰写。<br>
               在 变量相关/ 下按同样格式补一份，再跑 <code>python tools/extract_dev_matrix.py</code> 即可接入。</p>`}
        </div>
      </div>
    </section>`;
}

function characterFull(name) {
  const girl = girls.find((item) => item.name === name) || girls[0];
  const { bond, experience, development } = characterDetails[girl.name];

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
        <div class="archive-head">${mark()}<b>身体开发度</b><span>四部位 · 档位只升不降</span><i></i>
          <em>点击部位查看评语</em></div>
        <div class="dev-grid">${developmentTiles(girl, development)}</div>
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
    ? `${row.title || '直播间'}${row.viewers ? ` · ${row.viewers.toLocaleString('en-US')} 人` : ''}`
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
  const hint = scheduleHint(model);
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
    <div class="schedule-summary">
      <div><b>${hint}</b><span>${model.weekday} · ${model.clock}</span></div>
      <p>每人一条周线；有色段是固定开播日，断开处是周休。</p>
    </div>
    <div class="schedule-today"><b>今日顺序</b>${today}</div>
    <div class="schedule-board-head"><span>主播</span><span>常用时间</span><div>${dayHead}</div><span>今日状态</span></div>
    <div class="schedule-lines">${rows}</div>
  `, 'schedule-page');
}

function eventsPage() {
  const cards = sortedEvents().map((event) => {
    /* 体力上限 is a ceiling and 需携带道具 is a name, so a blanket "≥" would state
       the opposite of the rule for one and nonsense for the other. */
    const conditions = Object.entries(event.conditions || {})
      .map(([key, value]) => {
        const text = Array.isArray(value) ? value.join(' / ')
          : typeof value === 'string' ? value
            : key === '体力上限' ? `≤ ${value}`
              : `≥ ${value}`;
        return `<span>${key} ${text}</span>`;
      })
      .join('');
    return `
    <article class="event-card ${event.status === '可触发' ? 'is-ready' : ''}">
      <div class="event-top"><span>${Array.isArray(event.category) ? event.category.join(' · ') : event.category}</span><em>优先级 ${event.priority}</em></div>
      <h3>${event.title}</h3>
      <p>${event.summary}</p>
      <div class="event-cond">${conditions}</div>
      <div class="event-location">${ic('mapPin')}<span>${event.area}${event.place ? ` · ${event.place}` : ''}</span></div>
      <button type="button">${event.status}</button>
    </article>`;
  }).join('');

  return pageShell('Today Events', '当日事件', `
    <div class="page-summary">
      <div><span>${world.calendar.full} · ${world.time.period}</span><b>${dailyEvents.length} 条事件线索</b></div>
      <p>按区域与触发状态整理。主界面只保留红点提醒，触发条件集中在这里。</p>
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
    : room?.live ? `直播中 · ${room.viewers.toLocaleString('en-US')} 人`
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

    <aside class="profile-fans-col">
      <div class="archive-head">${mark()}<b>粉丝身份</b><span>${fanHint}</span><i></i>
        <em>点一行进速览</em></div>
      <div class="profile-fans">${fans}</div>
      <button class="profile-schedule-link" type="button" data-page="schedule">
        <span><b>查看开播日程</b><small>${scheduleHint()}</small></span>${ic('arrowRight')}
      </button>
    </aside>
  </div>
  `, 'profile-page');
}

/* Three kinds now, and they behave differently: 素材 are spent on crafting, 消耗品
   are spent on use and carry a universal 强度 1~5, 用品 are durable and instead
   carry 佩戴 -- so the meta line differs per kind rather than being one field. */
function itemCard(item, kind) {
  const meta = kind === 'material' ? item.source
    : kind === 'consumable' ? `强度 ${item.potency} / 5`
      : (item.worn ? '佩戴中' : '未佩戴');
  /* The same cell the drawer and the portrait rows use: category art, with the hue-derived
     gem behind it as the drop-in fallback -- the <img> removes itself when the file is
     absent.  This page used to draw only the gem, which meant the one place with room to
     show an item properly was the one place not showing its art. */
  const icon = itemIcon(kind, item);
  return `
    <article class="item-card b-${kind}${kind === 'goods' && item.worn ? ' is-worn' : ''}"
      style="--hue:${icon.hue}; --tilt:${icon.tilt}deg; --scale:${icon.scale}${
        kind === 'consumable' ? `; --potency:${item.potency}` : ''}">
      <div class="item-cell">
        ${itemIconTag(icon, 'item-icon')}
        <span class="item-gem ${kind}"></span>
        ${potencyNotches(kind === 'consumable' ? item.potency : 0)}
      </div>
      <div class="item-copy"><h3>${item.name}</h3><p>${item.description}</p><span>${icon.label} · ${meta}</span></div>
      <b>${kind === 'goods' ? (item.worn ? '装备' : `×${item.quantity}`) : `×${item.quantity}`}</b>
    </article>`;
}

function inventoryPage() {
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
      <div class="inventory-content">
        <section><header><h3>素材</h3><span>采集与合成</span></header><div class="item-grid">${materials.map((item) => itemCard(item, 'material')).join('')}</div></section>
        <section><header><h3>消耗品</h3><span>使用后数量 -1</span></header><div class="item-grid">${consumables.map((item) => itemCard(item, 'consumable')).join('')}</div></section>
        <section><header><h3>用品</h3><span>耐久品 · 使用不扣数量</span></header><div class="item-grid">${goods.map((item) => itemCard(item, 'goods')).join('')}</div></section>
      </div>
    </div>
  `, 'inventory-page');
}

function relationsPage() {
  const rows = [...girls].sort((a, b) => b.metric.value - a.metric.value).map((girl) => {
    const { bond, physiology } = characterDetails[girl.name];
    const tail = physiology.statuses.length ? physiology.statuses.join('、') : NO_STATUS;
    return `
      <button class="relation-row" type="button" data-open-character="${girl.name}">
        <img src="${girl.art}" alt="" draggable="false">
        <span><b>${girl.name}</b><small>${bond.mood} · ${tail}</small></span>
        <i style="--pct:${bond.favor / 10}%"><u></u></i>
        <em>${bond.favor}<small>/1000</small></em>
        ${ic('arrowRight')}
      </button>`;
  }).join('');
  return pageShell('Relationship Index', '羁绊总览', `<div class="relation-list">${rows}</div>`, 'relations-page');
}

/* A live segmented control, reading and writing src/prefs.js.  The choices come from
   the store rather than being spelled out here so the enum and its labels cannot
   drift; `data-pref` is what the layer's delegated listener looks for. */
function segmented(name) {
  const current = pref(name);
  return `<div class="segmented">${PREF_CHOICES[name].map(([value, label]) =>
    `<button type="button" data-pref="${name}" data-pref-value="${value}"
      aria-pressed="${value === current}"
      class="${value === current ? 'is-active' : ''}">${label}</button>`).join('')}</div>`;
}

/* The controls that are not wired to anything say so, and cannot be pressed.
   A dead control that looks identical to a live one next to it is worse than no
   control: it teaches the reader that the page does not respond. */
const stub = () => '<span class="settings-stub">尚未生效</span>';

function settingsPage() {
  return pageShell('Interface', '界面设置', `
    <div class="settings-grid">
      <section>
        <h3>道具栏打开方式</h3>
        <p>底部抽屉在主状态栏下方展开一排道具，不遮挡场景，点某一格再进全屏；直接全屏则跳过抽屉。抽屉是横屏专有的，竖屏没有那条桌面带。</p>
        ${segmented('inventoryOpen')}
      </section>
      <section>
        <h3>详情展开方式${stub()}</h3>
        <p>角色卡默认在主状态栏上方展开速览，两块玻璃以等宽缝隙互扣；完整档案再进入大页面。改成直接全屏会让档案缺掉羁绊与生理——那两组现在是靠速览留在后面才没有重复，所以这个开关要先改档案的内容与高度预算。</p>
        <div class="segmented is-stub"><button type="button" disabled class="is-active">上方速览</button><button type="button" disabled>直接全屏</button></div>
      </section>
      <section>
        <h3>玻璃效果${stub()}</h3>
        <p>上下面板共用同一套折射、亮边与霜面参数，扩展页面沿用原型的材质语言。满场同时有六处面板级折射加每张卡一处，移动端应当能关掉散射层并降低模糊半径。</p>
        <label class="fake-switch is-stub"><span>高质量模糊</span><i></i></label>
        <label class="fake-switch is-stub"><span>晶亮高光</span><i></i></label>
      </section>
      <section>
        <h3>信息密度${stub()}</h3>
        <p>主状态栏只放行动中最常看的变量，其余按页面归档。</p>
        <div class="segmented is-stub"><button type="button" disabled>精简</button><button type="button" disabled class="is-active">标准</button><button type="button" disabled>详细</button></div>
      </section>
    </div>
  `, 'settings-page');
}

/* Three stacked layers, not one slot.
   ------------------------------------------------------------------
   The dock stays mounted while a page is open on top of it, so closing the page
   lands back on the quick view by itself -- which is why there is no longer a
   "收起到上方速览" button; it was doing what Escape and × already do.

   Escape and × peel exactly one layer: 评语 sheet -> page -> dock. */
export function mountPages(stage, { onGift, onDock } = {}) {
  let layer = stage.querySelector(':scope > .page-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'page-layer';
    stage.appendChild(layer);
  }

  let dockName = null;
  const has = (sel) => !!layer.querySelector(sel);
  const drop = (sel) => layer.querySelectorAll(sel).forEach((el) => el.remove());

  const sync = () => {
    layer.className = 'page-layer'
      + (has('.dock-root') || has('.page-modal') ? ' is-open' : '')
      + (has('.page-modal') ? ' has-modal' : '');
  };

  const closeNote = () => { drop('.dev-sheet, .dev-sheet-shade'); };
  const closePage = () => { closeNote(); drop('.page-shade, .page-modal'); sync(); };
  /* The gift tray and its card live outside this layer but are scoped to whoever the
     dock is showing, so whoever owns them has to hear that the dock changed -- see
     the wiring in content.js. */
  const closeAll = () => { layer.innerHTML = ''; dockName = null; sync(); onDock?.(null); };

  /* Pages append after the dock rather than replacing the layer, so the dock keeps
     its DOM, its scroll and its already-built rim SVGs underneath. */
  const openPage = (html) => {
    closePage();
    layer.insertAdjacentHTML('beforeend', html);
    sync();
  };

  const openCharacter = (name) => {
    const girl = girls.find((item) => item.name === name) || girls[0];
    /* Same portrait again with nothing on top of it means "collapse": the card is
       a toggle, so a second click puts the scene back. */
    if (dockName === girl.name && !has('.page-modal')) { closeAll(); return; }
    closePage();
    drop('.dock-root');
    layer.insertAdjacentHTML('afterbegin', characterDock(girl));
    dockName = girl.name;
    paintDock(layer);
    sync();
    onDock?.(girl.name);
  };

  const open = (page) => openPage(
    page === 'events' ? eventsPage()
      : page === 'inventory' ? inventoryPage()
        : page === 'relations' ? relationsPage()
          : page === 'profile' ? profilePage()
            : page === 'schedule' ? schedulePage()
              : settingsPage(),
  );

  /* The 评语 sheet is appended to the modal rather than replacing it, so closing
     the sheet returns to the archive with no re-render and no lost scroll. */
  /* Appended to the layer, not inside .page-modal: the modal carries a
     backdrop-filter and is therefore a backdrop root, so a sheet nested in it could
     not blur anything and would have to fake glass with an opaque fill. */
  const openNote = (name, part) => {
    if (!has('.page-modal')) return;
    closeNote();
    layer.insertAdjacentHTML('beforeend', developmentNote(name, part));
  };

  layer.addEventListener('click', (event) => {
    /* Updated in place rather than by re-rendering the page: a re-render would be
       correct but flashes the whole sheet for a two-class change. */
    const choice = event.target.closest('[data-pref]');
    if (choice) {
      setPref(choice.dataset.pref, choice.dataset.prefValue);
      choice.parentElement.querySelectorAll('[data-pref]').forEach((button) => {
        const on = button === choice;
        button.classList.toggle('is-active', on);
        button.setAttribute('aria-pressed', String(on));
      });
      return;
    }
    const gift = event.target.closest('[data-gift-open]');
    if (gift) { onGift?.(gift.dataset.giftOpen); return; }
    const page = event.target.closest('[data-page]');
    if (page) { open(page.dataset.page); return; }
    if (event.target.closest('[data-dev-close]')) { closeNote(); return; }
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

  if (!stage.dataset.pageEscapeBound) {
    stage.dataset.pageEscapeBound = '1';
    addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (has('.dev-sheet')) closeNote();
      else if (has('.page-modal')) closePage();
      else closeAll();
    });
  }

  return { open, openCharacter, close: closeAll, openedCharacter: () => dockName };
}
