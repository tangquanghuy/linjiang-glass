/* Public files live under public/assets and are copied to dist/assets.
   Paths are resolved against the HTML document, not the JS/CSS bundle: Vite
   emits those under /assets/, and a relative url() used as a CSS mask would
   become /assets/assets/*.png and 404. */

export function asset(path) {
  const file = String(path || '')
    .replace(/^.*\/assets\//, '')
    .replace(/^assets\//, '')
    .replace(/^\//, '');
  const relative = `${import.meta.env.BASE_URL}assets/${file}`;
  try {
    const base = globalThis.document?.baseURI || globalThis.location?.href;
    return base ? new URL(relative, base).href : relative;
  } catch {
    return relative;
  }
}

export function cssUrl(path) {
  return `url("${asset(path)}")`;
}

export function rebaseSrc(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  if (typeof entry.src !== 'string') return entry;
  return { ...entry, src: asset(entry.src) };
}

export function rebaseRecord(record) {
  const out = {};
  Object.entries(record || {}).forEach(([key, value]) => {
    out[key] = rebaseSrc(value);
  });
  return out;
}
