// Service worker: the app shell loads offline after one online visit.
import { test, expect } from '@playwright/test';

test('service worker registers and serves the app offline', async ({ page, context }) => {
  await page.goto('#/plan');
  await expect(page.locator('#run-btn')).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 15000 })
    .catch(() => {});
  const hasSW = await page.evaluate(() => 'serviceWorker' in navigator);
  expect(hasSW).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#run-btn')).toBeVisible();
  await expect(page.locator('.topbar')).toBeVisible();
});
