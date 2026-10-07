// Playwright e2e: real Chromium (runs in GitHub Actions; this sandbox has no browser).
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'python3 -m http.server 8000 --directory web',
    url: 'http://127.0.0.1:8000',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium-mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
    { name: 'chromium-desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
  ],
});
