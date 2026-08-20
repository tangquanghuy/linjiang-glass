/* Geometry the tavern status shell uses to lift the HUD out of the reading
   column.  Keep the numbers in lockstep with 变量相关/状态栏.html (BODY_W/H,
   DESKTOP_MIN, HUD_WIDTH_VW, PORTRAIT_WIDTH_MAX, PORTRAIT_GUTTER, MAX_VH).

   正文美化.html writes --sheldWidth as 50/60/70/80/90vw onto the tavern
   documentElement.  SillyTavern sizes #sheld / #top-bar / #send_form from that
   token.  The status iframe is 100% of its parent; wrapPx on the fixture is a
   narrower wrapper around that iframe, recreating the historical squeeze. */

export const CHANNEL = 'linjiang-hud';

export const BODY_W = 1640;
export const BODY_H = 787;
export const DESKTOP_MIN = 880;
export const HUD_WIDTH_VW = 90;
export const PORTRAIT_WIDTH_MAX = 480;
export const PORTRAIT_GUTTER = 12;
export const MAX_VH = 0.78;

/* 正文美化 READING_WIDTH_LEVELS.chatWidth */
export const READING_WIDTHS = [50, 60, 70, 80, 90];

export function isDesktop(vw) {
  return vw >= DESKTOP_MIN;
}

export function portraitHud(vw, vh) {
  return vw < DESKTOP_MIN && vw < vh;
}

export function desktopHudBox(vw, vh) {
  let width = Math.min(Math.round(vw * HUD_WIDTH_VW / 100), vw - 40);
  let height = Math.round(width * BODY_H / BODY_W);
  const maxH = Math.round(vh * MAX_VH);
  if (height > maxH) {
    height = maxH;
    width = Math.round(height * BODY_W / BODY_H);
  }
  return { width, height };
}

export function portraitHudWidth(vw, readingW) {
  const maxW = Math.max(280, vw - PORTRAIT_GUTTER * 2);
  if (readingW >= PORTRAIT_WIDTH_MAX) return Math.round(Math.min(maxW, readingW + 24));
  return Math.round(Math.min(maxW, PORTRAIT_WIDTH_MAX));
}

export const PRESETS = [
  {
    id: 'iphone-50',
    label: 'iPhone · 阅读最窄 50vw',
    vw: 390,
    vh: 844,
    sheldVw: 50,
  },
  {
    id: 'iphone-80',
    label: 'iPhone · 阅读较宽 80vw',
    vw: 390,
    vh: 844,
    sheldVw: 80,
  },
  {
    id: 'iphone-90',
    label: 'iPhone · 阅读最宽 90vw',
    vw: 390,
    vh: 844,
    sheldVw: 90,
  },
  {
    id: 'iphone-full',
    label: 'iPhone · 侧栏收起满宽',
    vw: 390,
    vh: 844,
    sheldVw: 100,
  },
  {
    id: 'iphone-squeeze',
    label: '回归 · 140px 状态槽',
    vw: 390,
    vh: 844,
    sheldVw: 80,
    wrapPx: 140,
  },
  {
    id: 'iphone-nest',
    label: 'iPhone · 阅读栏再套一层 iframe',
    vw: 390,
    vh: 844,
    sheldVw: 80,
    nest: true,
  },
  {
    id: 'android-80',
    label: 'Android 360 · 80vw',
    vw: 360,
    vh: 800,
    sheldVw: 80,
  },
  {
    id: 'iphone-land',
    label: 'iPhone 横持',
    vw: 844,
    vh: 390,
    sheldVw: 70,
  },
  {
    id: 'ipad-70',
    label: 'iPad 竖屏 · 70vw',
    vw: 768,
    vh: 1024,
    sheldVw: 70,
  },
  {
    id: 'desktop-50',
    label: '桌面 1440 · 阅读 50vw',
    vw: 1440,
    vh: 900,
    sheldVw: 50,
    sidebar: true,
  },
  {
    id: 'desktop-80',
    label: '桌面 1440 · 阅读 80vw',
    vw: 1440,
    vh: 900,
    sheldVw: 80,
    sidebar: true,
  },
  {
    id: 'desktop-90',
    label: '桌面 1920 · 阅读 90vw',
    vw: 1920,
    vh: 1080,
    sheldVw: 90,
    sidebar: true,
  },
];

export function presetById(id) {
  return PRESETS.find((p) => p.id === id) || PRESETS[1];
}
