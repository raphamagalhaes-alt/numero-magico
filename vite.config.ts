import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787' },
  },
  preview: {
    port: 4173,
    proxy: { '/api': 'http://localhost:8787' },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
