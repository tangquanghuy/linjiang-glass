/* Public files live under public/assets and are copied to dist/assets.
   Vite's BASE_URL is `./` so GitHub project pages, jsDelivr and local preview
   all resolve against the HTML document rather than the domain root. */

export function asset(path) {
  const file = String(path || '')
    .replace(/^.*\/assets\//, '')
    .replace(/^assets\//, '')
    .replace(/^\//, '');
  return `${import.meta.env.BASE_URL}assets/${file}`;
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
