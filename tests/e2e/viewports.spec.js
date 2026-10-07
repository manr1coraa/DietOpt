// Layout sanity across the acceptance widths: no horizontal overflow.
import { test, expect } from '@playwright/test';

const WIDTHS = [320, 375, 390, 768, 1280];
const PAGES = ['#/plan', '#/list', '#/week', '#/foods', '#/more'];

for (const width of WIDTHS) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.addInitScript(() => {
      localStorage.setItem('dietopt.lang', 'de');
      localStorage.setItem('dietopt.market', 'de');
    });
    for (const hash of PAGES) {
      await page.goto(hash);
      await page.waitForLoadState('domcontentloaded');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${hash} at ${width}px`).toBeLessThanOrEqual(1);
    }
  });
}
