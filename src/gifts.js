/* 送礼: the tray and the confirm card.
   ------------------------------------------------------------------
   Two scenes share one entry point but not one panel, for the reason set out in
   data.js and in 变量相关/送礼与喜好.md: 直播打赏 spends 金钱 from a closed menu and
   buys visibility, 私下送礼 spends a bag slot from an open list and is the only one
   that moves 好感度.  What they *do* share is the shape of the interaction -- pick a
   cell from the bottom rail, confirm on a card, and the recipient stays visible above
   the whole time.

   Why the bottom rail rather than a full page.  Gifting is the one action where you
   want to keep looking at who you are giving to: her 速览 is already mounted above,
   and the rail leaves it alone.  It is also, not by coincidence, the shape a live
   stream's gift bar has -- horizontal, along the bottom edge, over the scene.

   Why the confirm card is a sibling on .page-layer rather than a child of the tray:
   the tray carries backdrop-filter and is therefore a backdrop root, so glass nested
   inside it would sample an empty backdrop and have to fake itself with an opaque
   fill.  Same constraint .dev-sheet is built around; see the note in pages.js. */

import {
  GUARD_DAYS, NOTICE,
  giftIcon, giftMessage, giftPayload, giftRail, giftScenes,
  inventoryRail, itemIconTag, player, potencyNotches, resolveGift,
} from './data.js';
import { mountRailPanel } from './drawer.js';
import { insertSafeHTML } from './dom.js';
import { icons } from './icons.js';

const ic = (name) => (name ? `<i class="ic">${icons[name]}</i>` : '');
const yen = (n) => `￥${n.toLocaleString('en-US')}`;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Stacking one gift.  Presets rather than a free numeral: a stream client's combo is
   preset-driven, and every extra input here is a state to validate on a panel that is
   used in a hurry.  233 and 66 are the two that exist because people type them, not
   because they are round. */
const QTY_STEPS = [1, 10, 66, 233];

/* ------------------------------------------------------------------- cells */

/* The platform gift cell: 112 wide, not the item cell's 66.
   The menu is closed and short, so the whole thing fits on the rail without
   scrolling -- and that is worth spending width on, because a tip is chosen under
   time pressure (she is live *now*) and because 火箭 against 小飞机 differs mostly in
   price, which therefore has to be on the cell rather than one click away. */
function giftCell(gift, { affordable }) {
  const icon = giftIcon(gift);
  const price = gift.price ? yen(gift.price) : '免费';
  const tail = gift.guard
    ? `办卡 ${GUARD_DAYS} 天` : `念ID ${NOTICE[gift.notice] ?? ''}`;
  return `
      <button class="drawer-slot gift-slot${affordable ? '' : ' is-broke'}${gift.guard ? ' is-guard' : ''}" type="button"
        data-gift="${esc(gift.slug)}" data-scene="${gift.guard ? 'guard' : 'stream'}"
        ${affordable ? '' : 'disabled'}
        style="--hue:${gift.hue}"
        aria-label="${esc(gift.name)}，${price}，${tail}${affordable ? '' : '，余额不足'}">
        <span class="slot-well"></span>
        <span class="gift-face">
          ${itemIconTag(icon, 'gift-icon')}
          <span class="gift-gem"></span>
        </span>
        <span class="gift-copy"><b>${esc(gift.name)}</b><em>${price}</em></span>
        ${gift.banner ? '<span class="gift-flair" aria-hidden="true"></span>' : ''}
      </button>`;
}

/* The bag cell *is* the item drawer's cell -- same well, same lift, same 强度 notches,
   same quantity badge.  Not "similar to": the tray must not invent a second way to draw
   the same object, and there is nothing to add on top of it, because the HUD does not
   judge the gift (see the note above giftMessage in data.js).  A cell here differs from
   one in the drawer only in what pressing it does. */
function bagCell(item) {
  const { icon } = item;
  const qty = item.quantity > 1 ? `<span class="slot-qty">${item.quantity}</span>` : '';
  const worn = item.worn ? '<span class="slot-worn" aria-hidden="true"></span>' : '';
  return `
      <button class="drawer-slot gift-bag-slot b-${item.bucket}${item.worn ? ' is-worn' : ''}" type="button"
        data-gift-item="${esc(item.name)}" data-scene="private"
        style="--hue:${icon.hue}; --tilt:${icon.tilt}deg; --scale:${icon.scale}${
          item.bucket === 'consumable' ? `; --potency:${item.potency}` : ''}"
        aria-label="${esc(item.name)}，${icon.label}，数量 ${item.quantity}，点击送出">
        <span class="slot-well"></span>
        ${itemIconTag(icon, 'slot-icon')}
        <span class="slot-gem"></span>
        ${potencyNotches(item.bucket === 'consumable' ? item.potency : 0)}
        ${qty}${worn}
      </button>`;
}

const divider = (label) =>
  `<div class="drawer-div" aria-hidden="true"><i></i><span>${label}</span></div>`;

function group(label, cells) {
  return `
    <div class="drawer-group" role="list" aria-label="${label}">
      ${divider(label)}${cells}
    </div>`;
}

/* Both scenes can be open at once -- she is streaming while sitting next to you.
   Rare, but it has to be defined or the tray would have to pick one and silently
   hide the other; 私下 leads then, because handing something over beats tipping
   someone who is in the same room. */
function trayBody(name) {
  const scenes = giftScenes(name);
  const parts = [];

  if (scenes.near) {
    /* Grouped by bucket in the order data.js defines -- the same grouping, the same
       order and the same dividers as the item drawer, so the reader does not have to
       learn a second arrangement of the same bag. */
    const groups = inventoryRail();
    if (groups.length) {
      for (const g of groups) parts.push(group(g.label, g.items.map(bagCell).join('')));
    } else {
      parts.push(group('背包', '<div class="drawer-empty">背包是空的</div>'));
    }
  }
  if (scenes.live) {
    for (const g of giftRail()) {
      const cells = g.items
        .map((gift) => giftCell(gift, { affordable: player.money >= gift.price }))
        .join('');
      parts.push(group(g.label, cells));
    }
  }
  if (!parts.length) return `<div class="drawer-empty">${scenes.reason}，现在没有可送的东西</div>`;
  return parts.join('');
}

/* --------------------------------------------------------------- confirm card */

/* One card, three shapes.  办卡 is not a gift but a subscription, so it loses the
   quantity stepper and gains a term; 打赏 gains the stepper and a running total;
   私下 gains the 附言 field.  A single uniform card would have to show a stepper on a
   thing that cannot be stacked. */
function confirmCard(state) {
  const { scene, gift, qty, target } = state;
  const stream = scene === 'stream';
  const guard = scene === 'guard';
  /* A bag item has no price, so cost is only meaningful in the two paid scenes. */
  const cost = guard ? gift.price : stream ? gift.price * qty : 0;
  const broke = (stream || guard) && player.money < cost;
  const icon = scene === 'private' ? gift.icon : giftIcon(gift);
  const message = giftMessage(scene, target, gift, { qty, remark: state.remark });

  /* Privately: the object's own facts, which is all the HUD knows.  Whether she wants
     it is not the panel's call -- the model decides that against the 喜好 table in the
     world book, and a verdict printed here would regularly contradict it. */
  const read = scene === 'private'
    ? `
      <div class="gift-read" style="--fit:${icon.hue}">
        <div class="gift-facts">
          <em>${esc(icon.label)}</em>
          ${gift.bucket === 'consumable' ? `<em>强度 ${gift.potency} / 5</em>` : ''}
          ${gift.bucket === 'goods' ? `<em>${gift.worn ? '佩戴中' : '未佩戴'}</em>` : ''}
          ${gift.bucket === 'material' && gift.source ? `<em>${esc(gift.source)}</em>` : ''}
          <em>余 ${gift.quantity}</em>
        </div>
        <p class="gift-hint">${gift.bucket === 'goods'
    ? '用品送出后从背包移除。'
    : '送出后数量 -1。'}她会怎么反应由剧情决定。</p>
      </div>`
    : `
      <div class="gift-read" style="--fit:${gift.hue}">
        <div class="gift-facts">
          <em>${esc(gift.group)}</em>
          <em>${guard ? `${GUARD_DAYS} 天` : `念ID ${NOTICE[gift.notice]}`}</em>
          <em>公开场合</em>
          ${guard ? '<em>不可叠加</em>' : ''}${gift.random ? '<em>随机内容</em>' : ''}${gift.banner ? '<em>触发飘屏</em>' : ''}
        </div>
        <p class="gift-hint">${guard
    ? '弹幕会被优先看到，ID 会被记住。'
    : '打赏买的是被看见的概率，不是亲密，也换不来私人时间。'}</p>
      </div>`;

  const stepper = stream
    ? `
      <div class="gift-qty">
        <span>数量</span>
        ${QTY_STEPS.map((n) => `<button type="button" data-gift-qty="${n}"
          class="${n === qty ? 'is-active' : ''}" aria-pressed="${n === qty}">${n}</button>`).join('')}
        <b>${yen(cost)}</b>
      </div>`
    : '';

  /* The 附言 field is the cheapest high-value thing on this card: it turns a
     mechanical -1 into a line the model can act on.  Only privately -- a note
     attached to a public tip is a 弹幕, which is a different mechanic. */
  const remark = scene === 'private'
    ? `
      <label class="gift-remark">
        <span>附言</span>
        <input type="text" maxlength="30" placeholder="可选，一句话" value="${esc(state.remark)}"
          data-gift-remark aria-label="附言，可选，最多 30 字">
      </label>`
    : '';

  return `
<div class="gift-shade" data-gift-cancel></div>
<section class="gift-confirm" role="dialog" aria-label="确认送给 ${esc(target)}">
  <div class="sheet-frost"></div>
  <div class="sheet-edge"></div>
  <div class="gift-confirm-body">
    <figure class="gift-hero" style="--hue:${icon.hue}">
      <span class="gift-hero-well"></span>
      ${itemIconTag(icon, 'gift-hero-icon')}
      <span class="gift-hero-gem"></span>
      <figcaption>${esc(gift.group || icon.label)}</figcaption>
    </figure>

    <div class="gift-detail">
      <header class="gift-head">
        <h3>${esc(gift.name)}</h3>
        <span class="gift-to">${ic('arrowRight')}${esc(target)}</span>
      </header>
      <p class="gift-desc">${esc(gift.description || gift.note || '')}</p>
      ${read}
      ${stepper}
      ${remark}
      <p class="gift-preview"><span>将发送</span><code>${esc(message)}</code></p>
    </div>
  </div>

  <footer class="gift-actions">
    <span class="settings-stub">发送尚未接线</span>
    ${broke ? '<span class="gift-broke">余额不足</span>' : ''}
    <button class="page-secondary" type="button" data-gift-cancel>取消</button>
    <button class="page-primary" type="button" data-gift-send ${broke ? 'disabled' : ''}>
      ${scene === 'guard' ? '办卡' : '送出'}${ic('arrowRight')}
    </button>
  </footer>
</section>`;
}

/* ---------------------------------------------------------------------- mount */

export function mountGifts(stage, { onSend } = {}) {
  let target = null;
  /* The selection being confirmed, or null when only the tray is standing.  Held as
     one object rather than as four variables because the card is rebuilt from it on
     every change -- a qty press and a remark keystroke go through the same path. */
  let state = null;

  const layer = () => stage.querySelector(':scope > .page-layer');

  const tray = mountRailPanel(stage, {
    label: '礼物托盘',
    extraClass: 'gift-tray',
    body: () => (target ? trayBody(target) : ''),
    pickSelector: '.gift-slot, .gift-bag-slot',
    onPick: (cell) => pick(cell),
    /* Escape is handled here for the whole ladder instead, so the panel must not
       also bind its own -- see the handler at the foot of this function. */
    escapeKey: null,
  });

  const dropCard = () => {
    layer()?.querySelectorAll('.gift-confirm, .gift-shade').forEach((el) => el.remove());
    state = null;
  };

  /* Rebuilt rather than patched.  The card is small and has no scroll position to
     lose, and every field on it derives from `state` -- a qty press changes the
     total, the preview line and which chip is lit, so patching would be three
     writes that can disagree. */
  const paintCard = () => {
    const host = layer();
    if (!host || !state) return;
    /* A standing toast reports the *previous* send, and it sits where the card's footer
       lands.  Opening a card starts a new decision, so the old report goes. */
    host.querySelector('.gift-toast')?.remove();
    const focused = document.activeElement?.dataset?.giftRemark !== undefined;
    const caret = focused ? document.activeElement.selectionStart : null;
    host.querySelectorAll('.gift-confirm, .gift-shade').forEach((el) => el.remove());
    insertSafeHTML(host, 'beforeend', confirmCard(state));
    if (focused) {
      const input = host.querySelector('[data-gift-remark]');
      input?.focus();
      if (caret != null) input?.setSelectionRange(caret, caret);
    }
  };

  function pick(cell) {
    const isBag = cell.dataset.scene === 'private';
    const hit = resolveGift(target, isBag ? 'private' : 'tip',
      isBag ? cell.dataset.giftItem : cell.dataset.gift);
    if (!hit) return;
    state = { ...hit, target, qty: 1, remark: '' };
    paintCard();
  }

  const send = async () => {
    if (!state) return;
    const { scene, gift, qty, remark } = state;
    const message = giftMessage(scene, target, gift, { qty, remark });
    const payload = giftPayload(scene, target, gift, { qty, remark });
    /* The HUD sends the instruction to Tavern, but deliberately does not mutate
       money or inventory here.  The resulting chat message is the single source of
       truth for the model-side variable update. */
    const sent = await Promise.resolve(onSend?.({ message, payload }));
    dropCard();
    toast(message, sent !== false);
  };

  function toast(text, sent = true) {
    const host = layer();
    if (!host) return;
    host.querySelector('.gift-toast')?.remove();
    insertSafeHTML(host, 'beforeend', `
<div class="gift-toast" role="status">
  <b>${sent ? '已发送到酒馆' : '已生成消息'}</b><code>${esc(text)}</code><em>HUD 未直接扣除金钱或道具库存</em>
</div>`);
    const el = host.querySelector('.gift-toast');
    setTimeout(() => el?.remove(), 4200);
  }

  const open = (name) => {
    /* Re-pressing the button for whoever is already in the tray closes it: the entry
       point is a toggle, the same way the character card is. */
    if (tray.isOpen() && target === name) { close(); return; }
    target = name;
    dropCard();
    if (tray.isOpen()) tray.repaint();
    else tray.open();
  };

  const close = () => {
    dropCard();
    tray.close();
    target = null;
  };

  const isOpen = () => tray.isOpen();

  /* Delegated on the layer, which is where the card lives.  Bound once at mount
     rather than per card, so a rebuild does not leak listeners. */
  stage.addEventListener('click', (event) => {
    if (!state) return;
    if (event.target.closest('[data-gift-cancel]')) { dropCard(); return; }
    if (event.target.closest('[data-gift-send]')) { send(); return; }
    const step = event.target.closest('[data-gift-qty]');
    if (step) { state.qty = Number(step.dataset.giftQty); paintCard(); }
  });

  stage.addEventListener('input', (event) => {
    const field = event.target.closest('[data-gift-remark]');
    if (!field || !state) return;
    /* Stored without a repaint: the preview line is the only thing that depends on it
       and rebuilding the card on every keystroke would fight the caret. */
    state.remark = field.value;
    const preview = layer()?.querySelector('.gift-preview code');
    if (preview) {
      preview.textContent = giftMessage(state.scene, target, state.gift,
        { qty: state.qty, remark: state.remark });
    }
  });

  /* Enter in the 附言 field sends, which is what a one-line field implies. */
  stage.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !state) return;
    if (!event.target.closest('[data-gift-remark]')) return;
    event.preventDefault();
    send();
  });

  /* The whole Escape ladder for this feature, in one handler.
     ------------------------------------------------------------------
     确认卡 -> 托盘 -> (dock, which pages.js owns).  Capture phase, and it stops
     propagation when it acts: mountPages listens in the bubble phase on the same
     target and would otherwise close the dock in the same press, so one key would
     peel two levels.  The drawer deliberately does *not* stop propagation -- there
     the drawer and the dock are one level -- but the tray is a level of its own,
     because closing it should land back on the 速览 you opened it from. */
  addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (stage.querySelector('.dev-sheet, .page-modal')
      || document.querySelector('.map-layer, .arcade-layer')) return;
    if (state) { dropCard(); event.stopPropagation(); return; }
    if (tray.isOpen()) { close(); event.stopPropagation(); }
  }, { capture: true });

  return { open, close, isOpen, target: () => target };
}
