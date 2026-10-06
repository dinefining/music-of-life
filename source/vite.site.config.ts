import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * `npm run build:site` writes the plain static site into the folder above `source/`:
 * index.html + app.js + style.css. No module scripts, so it runs from a double-click
 * (file://) as well as on GitHub Pages straight from the repo.
 */
const classicScript = (): Plugin => ({
  name: 'classic-script',
  enforce: 'post',
  transformIndexHtml(html) {
    return html
      .replace(/<script type="module" crossorigin src="\.\/app\.js"><\/script>/, '<script defer src="./app.js"></script>')
      .replace(/<link rel="stylesheet" crossorigin href="\.\/style\.css">/, '<link rel="stylesheet" href="./style.css">');
  },
});

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), classicScript()],
  build: {
    outDir: '..',
    emptyOutDir: false,
    assetsInlineLimit: 100_000_000, // fonts go inside style.css
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        format: 'iife',
        entryFileNames: 'app.js',
        assetFileNames: (a) => (a.names?.[0]?.endsWith('.css') ? 'style.css' : 'assets/[name][extname]'),
      },
    },
  },
});
