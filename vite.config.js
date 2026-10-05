import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/PrivaPDF/',
  plugins: [
    react(),
    {
      name: 'development-csp-compatibility',
      apply: 'serve',
      transformIndexHtml(html) {
        // Vite's React refresh preamble is inline; enforce the CSP in production builds.
        return html.replace(
          /<meta\s+http-equiv=["']Content-Security-Policy["'][\s\S]*?\/?\s*>\s*/i,
          '',
        );
      },
    },
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
});
