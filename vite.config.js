import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Nyx frontend — Vite build config.
//
// Deployment note (see Phase 23 / DEPLOYMENT.md):
// The backend URL is NOT baked in at build time. It is read at runtime from
// `public/config.js` (copied verbatim into `dist/config.js` by Vite's static
// asset handling), so ops can change the backend address after building by
// editing `dist/config.js` on the server — no rebuild required. This mirrors
// the pre-Vite workflow of editing the `API` constant directly in nyx.html.
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-markdown', 'remark-gfm'],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
});
