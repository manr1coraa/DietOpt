// Offline dish templates are visible without an API key; AI has its own path.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('dietopt.lang', 'ru');
    localStorage.setItem('dietopt.market', 'de');
  });
  await page.goto('#/plan');
  await page.locator('#profile-form').evaluate(f => f.requestSubmit());
  await expect(page.locator('#plan-output .meal')).not.toHaveCount(0);
});

test('offline dish hints render without any API key', async ({ page }) => {
  // Open the details section that holds recipes.
  await page.locator('#plan-output details.details-card > summary').click();
  await expect(page.locator('#plan-output .dish')).not.toHaveCount(0);
  await expect(page.locator('#plan-output .dish__title').first()).not.toBeEmpty();
});

test('AI button asks for a key instead of failing silently', async ({ page }) => {
  await page.locator('#plan-output details.details-card > summary').click();
  await page.locator('#plan-output [data-act="ai"]').click();
  await expect(page.locator('#dlg')).toBeVisible();
  await expect(page.locator('#dlg')).toContainText(/Gemini|API/i);
});
