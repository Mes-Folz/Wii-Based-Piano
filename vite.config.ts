import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r('./src'),
  publicDir: r('./public'),
  resolve: { alias: { '@shared': r('./src/shared') } },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/ws': { target: 'ws://127.0.0.1:3000', ws: true },
    },
  },
  build: {
    outDir: r('./dist'), emptyOutDir: true,
    rollupOptions: { input: { host: r('./src/host/index.html'), controller: r('./src/controller/index.html') } },
  },
});
