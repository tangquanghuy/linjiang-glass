import { defineConfig } from 'vite';

export default defineConfig({
  /* Relative so GitHub project pages (/linjiang-glass/) and local preview both work. */
  base: './',
  server: { port: 5173, host: '127.0.0.1' },
  build: { target: 'chrome110', assetsInlineLimit: 0 },
});
