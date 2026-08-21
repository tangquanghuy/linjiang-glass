import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';

function copyCityMap(destRoot) {
  if (!existsSync('city')) return;
  const dest = join(destRoot, 'city');
  mkdirSync(join(dest, 'plate'), { recursive: true });
  for (const file of ['plate_map.html', 'plate_map.js', 'city_mapdata.js', 'city_net.js']) {
    const from = join('city', file);
    if (existsSync(from)) cpSync(from, join(dest, file));
  }
  if (!existsSync('city/plate')) return;
  for (const name of readdirSync('city/plate')) {
    if (name.endsWith('.webp')) cpSync(join('city/plate', name), join(dest, 'plate', name));
  }
}

function copyArcade(destRoot) {
  if (!existsSync('arcade')) return;
  cpSync('arcade', join(destRoot, 'arcade'), { recursive: true });
}

function copyOpening(destRoot) {
  for (const file of ['opening.html', 'opening.css', 'opening.js']) {
    if (existsSync(file)) cpSync(file, join(destRoot, file));
  }
}

export default defineConfig({
  /* Relative so GitHub project pages (/linjiang-glass/) and local preview both work. */
  base: './',
  server: { port: 5173, host: '127.0.0.1' },
  build: { target: 'chrome110', assetsInlineLimit: 0 },
  plugins: [{
    name: 'copy-static-pages',
    closeBundle() {
      copyCityMap('dist');
      copyArcade('dist');
      copyOpening('dist');
    },
  }],
});
