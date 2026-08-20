/* Player preferences.
   ------------------------------------------------------------------
   One store, in localStorage, alongside the pinned-characters list content.js keeps.
   These are choices about the interface rather than game state, so they belong to the
   reader and not to a save: pinning a character or preferring the drawer should hold
   across reloads and across the two layouts.

   Deliberately not a settings object passed down through mount calls.  inventoryOpen
   is read by the landscape 背包 button; a subscription is the only shape that lets
   the store meet a shell that is mounted once at boot. */

const KEY = 'glass-hud-prefs';

const DEFAULTS = {
  /* What the 背包 tool button opens.  The drawer is the default because it keeps the
     scene visible, which matters when carrying a particular item is a precondition an
     event reads -- but browsing icons is not everyone's idea of browsing, so the full
     page has to stay one click away from the button rather than two. */
  inventoryOpen: 'drawer',
};

/* The label pairs live here rather than in the page so the enum and the control that
   writes it cannot drift apart. */
export const PREF_CHOICES = {
  inventoryOpen: [
    ['drawer', '底部抽屉'],
    ['page', '直接全屏'],
  ],
};

const state = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  /* Only keys we know about, and only values in their enum: a store written by an
     older build must not be able to put the UI in a state it cannot render. */
  for (const [name, value] of Object.entries(saved)) {
    const choices = PREF_CHOICES[name];
    if (name in DEFAULTS && (!choices || choices.some(([v]) => v === value))) state[name] = value;
  }
} catch { /* a corrupt store is not worth failing boot over */ }

const listeners = new Set();

export function pref(name) { return state[name]; }

export function setPref(name, value) {
  if (!(name in DEFAULTS) || state[name] === value) return;
  state[name] = value;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
  listeners.forEach((fn) => fn(name, value));
}

export function onPref(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
