import { menuGroups } from './data.js';
import { icons } from './icons.js';

const ORDER = ['profile', 'schedule', 'relations', 'arcade', 'cg', 'phone'];
const SHORT_LABELS = {
  profile: '\u6863\u6848',
  schedule: '\u65e5\u7a0b',
  relations: '\u7f81\u7eca',
  arcade: '\u8857\u673a',
  cg: 'CG',
  phone: '\u624b\u673a',
};

const trayItems = () => {
  const byPage = new Map(menuGroups.flatMap((group) => group.items).map((item) => [item.page, item]));
  return ORDER.map((page) => byPage.get(page)).filter(Boolean);
};

const icon = (name) => `<i class="ic">${icons[name]}</i>`;

export function moreTrayMarkup() {
  return `
    <div class="more-tray" data-more-tray role="menu" aria-label="\u66f4\u591a\u529f\u80fd" aria-hidden="true">
      ${trayItems().map((item, index) => {
    const disabled = item.soon ? ' disabled aria-disabled="true"' : '';
    return `<button class="more-tray-item${item.soon ? ' is-soon' : ''}" type="button"
        role="menuitem" data-tray-page="${item.page}" aria-label="${item.label}"
        style="--tray-delay:${index * 20}ms" tabindex="-1"${disabled}>
        ${icon(item.icon)}
        <small>${SHORT_LABELS[item.page] || item.label}</small>
        ${item.soon ? '<em>\u7b79\u5907</em>' : ''}
      </button>`;
  }).join('')}
    </div>`;
}

export function wireMoreTray(root, { hostSelector, onSelect, onOpen } = {}) {
  const current = () => {
    const trigger = root.querySelector('[data-more-trigger]');
    const host = trigger?.closest(hostSelector);
    return { trigger, host, tray: host?.querySelector('[data-more-tray]') };
  };

  const setOpen = (open) => {
    const { trigger, host, tray } = current();
    if (!trigger || !host || !tray) return;
    host.classList.toggle('is-more-open', open);
    trigger.setAttribute('aria-expanded', String(open));
    tray.setAttribute('aria-hidden', String(!open));
    tray.querySelectorAll('.more-tray-item').forEach((item) => {
      item.tabIndex = open && !item.disabled ? 0 : -1;
    });
    if (open) onOpen?.();
  };

  const isOpen = () => current().host?.classList.contains('is-more-open') || false;
  const close = () => setOpen(false);

  root.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-more-trigger]');
    if (trigger && root.contains(trigger)) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(!isOpen());
      return;
    }

    const item = event.target.closest('[data-tray-page]');
    if (!item || !root.contains(item) || item.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const page = item.dataset.trayPage;
    close();
    onSelect?.(page);
  });

  document.addEventListener('pointerdown', (event) => {
    if (!isOpen()) return;
    const { host } = current();
    if (!host?.contains(event.target)) close();
  }, true);

  addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) {
      event.preventDefault();
      close();
    }
  });

  return { close };
}
