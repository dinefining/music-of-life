import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` emits one self-contained dist/index.html (easy to share or host anywhere).
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  optimizeDeps: { entries: ['index.html'] },
  build: { assetsInlineLimit: 100_000_000 }, // inline the Barlow font files too
});
