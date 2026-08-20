/* High-fidelity fixture contract for the user's current stack:
   SillyTavern 1.18.0 + JS-Slash-Runner 4.9.3.

   The two layout thresholds deliberately differ:
   - SillyTavern switches to its mobile chrome at <= 1000 CSS px.
   - The status shell switches to desktop HUD layout at >= 880 CSS px.
   The 880..1000 overlap is therefore a required regression band. */

export const ST_VERSION = '1.18.0';
export const TAVERN_HELPER_VERSION = '4.9.3';
export const ST_MOBILE_MAX = 1000;
export const HUD_DESKTOP_MIN = 880;

export const REAL_PRESETS = [
  { id: 'phone-small', label: '手机小屏 320×568', vw: 320, vh: 568, sheldVw: 50, mobile: true, touch: true },
  { id: 'phone-android', label: 'Android 360×800', vw: 360, vh: 800, sheldVw: 50, mobile: true, touch: true },
  { id: 'phone-iphone', label: 'iPhone 390×844', vw: 390, vh: 844, sheldVw: 50, mobile: true, touch: true },
  { id: 'phone-wide', label: '手机宽屏 430×932', vw: 430, vh: 932, sheldVw: 50, mobile: true, touch: true },
  { id: 'phone-landscape', label: '手机横屏 844×390', vw: 844, vh: 390, sheldVw: 50, mobile: true, touch: true },
  { id: 'hud-879', label: 'HUD 临界前 879×900', vw: 879, vh: 900, sheldVw: 50 },
  { id: 'hud-880', label: 'HUD 临界点 880×900', vw: 880, vh: 900, sheldVw: 50 },
  { id: 'st-1000', label: '酒馆移动临界 1000×900', vw: 1000, vh: 900, sheldVw: 50 },
  { id: 'st-1001', label: '酒馆桌面临界 1001×900', vw: 1001, vh: 900, sheldVw: 50 },
  { id: 'tablet-portrait', label: '平板竖屏 768×1024', vw: 768, vh: 1024, sheldVw: 50, mobile: true, touch: true },
  { id: 'tablet-landscape', label: '平板横屏 1180×820', vw: 1180, vh: 820, sheldVw: 50, touch: true },
  { id: 'desktop-short', label: '桌面短屏 1280×720', vw: 1280, vh: 720, sheldVw: 50 },
  { id: 'desktop-common', label: '桌面常见 1366×768', vw: 1366, vh: 768, sheldVw: 50 },
  { id: 'desktop-work', label: '桌面工作区 1440×900', vw: 1440, vh: 900, sheldVw: 50 },
  { id: 'desktop-fhd', label: '当前基线 1920×1080', vw: 1920, vh: 1080, sheldVw: 50 },
  { id: 'desktop-qhd', label: '桌面高分 2560×1440', vw: 2560, vh: 1440, sheldVw: 50 },
];

export function realPresetById(id) {
  return REAL_PRESETS.find((preset) => preset.id === id) || REAL_PRESETS.find((preset) => preset.id === 'desktop-fhd');
}

export function tavernUsesMobileChrome(vw) {
  return vw <= ST_MOBILE_MAX;
}

export function expectedReadingWidth(vw, sheldVw) {
  return tavernUsesMobileChrome(vw) ? vw : Math.round(vw * sheldVw / 100);
}

export function expectedHudMode(vw, vh) {
  if (vw >= HUD_DESKTOP_MIN) return 'desktop';
  if (vw < vh) return 'portrait';
  return 'mobile-landscape';
}
