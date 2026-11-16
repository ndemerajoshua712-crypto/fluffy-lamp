import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The React app lives in client/. During development Vite serves it on port
// 3000 and forwards every /api request to the Express server on 3001, so the
// browser only ever talks to one origin.
export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
