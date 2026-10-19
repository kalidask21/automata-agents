import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The SPA talks to the Fastify API via same-origin /api, proxied in dev.
// `ws: true` makes the proxy forward the WebSocket upgrade for /api/.../stream.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true, ws: true },
    },
  },
});
