import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', trace: 'off' },
  webServer: [
    {
      command: 'MARKET_PROVIDER=manual MARKET_STORE_FILE=test-results/e2e-store.json MARKET_MANUAL_FILE=test-results/none.json MARKET_LEARNED_HOLIDAYS_FILE=test-results/learned.json PORT=8787 npx tsx server/index.ts',
      url: 'http://localhost:8787/api/health',
      reuseExistingServer: true,
    },
    { command: 'npx vite build && npx vite preview --port 4173', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 120000 },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 } }, testMatch: /responsive/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /responsive/ },
  ],
});
