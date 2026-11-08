import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const API = process.env.VITE_API_TARGET ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': API } },
  preview: { port: 4173, proxy: { '/api': API } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('exceljs')) return 'exceljs';
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) return 'charts';
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'react';
          return 'vendor';
        },
      },
    },
  },
  test: { globals: true, environment: 'node', include: ['src/**/*.test.ts', 'server/**/*.test.ts'] },
});
