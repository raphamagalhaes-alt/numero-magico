import { defineConfig, devices } from '@playwright/test';

/** Testes do MODO SITE: build estático + dados abertos de teste, sem servidor de dados. */
const PORT = 4175;
export default defineConfig({
  testDir: './e2e-web',
  timeout: 40000,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'off' },
  webServer: {
    command: `npx vite build --mode web --outDir test-results/dist-web --base ./ && npx tsx scripts/seed-open-data.ts test-results/dist-web/data/open-data.json && npx vite preview --outDir test-results/dist-web --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
