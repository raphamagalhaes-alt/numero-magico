import { defineConfig, devices } from '@playwright/test';

/** Porta dedicada aos testes, para nunca reaproveitar um `npm run dev` com o provedor oficial. */
const API_PORT = 8797;
const WEB_PORT = 4174;

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: 'off' },
  webServer: [
    {
      command: 'npx tsx scripts/seed-e2e.ts test-results/cache-e2e && npx tsx server/index.ts',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: String(API_PORT),
        MARKET_PROVIDER: 'manual',
        MARKET_STORE_FILE: 'test-results/e2e-store.json',
        MARKET_MANUAL_FILE: 'test-results/none.json',
        MARKET_LEARNED_HOLIDAYS_FILE: 'test-results/learned.json',
        STATIC_DIR: 'test-results/no-static',
        REFRESH_COOLDOWN_MS: '0',
        DISABLE_SCHEDULER: '1',
        DATA_DIR: 'test-results/cache-e2e',
      },
    },
    {
      command: `npx vite build --outDir test-results/dist-e2e && npx vite preview --outDir test-results/dist-e2e --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: { VITE_API_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 } }, testMatch: /responsive/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /responsive/ },
  ],
});
