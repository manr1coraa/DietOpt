// Market and interface language are independent, persisted settings.
import { test, expect } from '@playwright/test';

// Seeding via evaluate + reload (not addInitScript): later in-test reloads
// must preserve real app state instead of re-applying the seed.
test.beforeEach(async ({ page }) => {
  await page.goto('#/plan');
  await page.evaluate(() => {
    localStorage.setItem('dietopt.lang', 'ru');
    localStorage.setItem('dietopt.market', 'de');
  });
  await page.reload();
});

test('Germany market + Russian language coexist', async ({ page }) => {
  await expect(page.locator('#lang-select')).toHaveValue('ru');
  await expect(page.locator('#market-select')).toHaveValue('de');
  await expect(page.locator('#budget-out')).toContainText('€');
});

test('switching language never switches the market', async ({ page }) => {
  await page.locator('#lang-select').selectOption('uk');
  await expect(page.locator('#market-select')).toHaveValue('de');
  await expect(page.locator('#budget-out')).toContainText('€');
  await page.locator('#lang-select').selectOption('ru');
  await expect(page.locator('#market-select')).toHaveValue('de');
});

test('switching market changes currency and survives reload', async ({ page }) => {
  await page.locator('#market-select').selectOption('ua');
  await expect(page.locator('#budget-out')).toContainText('грн');
  await expect(page.locator('#lang-select')).toHaveValue('ru');
  await page.reload();
  await expect(page.locator('#market-select')).toHaveValue('ua');
  await expect(page.locator('#lang-select')).toHaveValue('ru');
  await expect(page.locator('#budget-out')).toContainText('грн');
});

test('market has its own prices and its own stored list', async ({ page }) => {
  await page.goto('#/foods');
  await expect(page.locator('.food__price').first()).toContainText('€');
  await page.locator('#market-select').selectOption('ua');
  await page.goto('#/foods');
  await expect(page.locator('.food__price').first()).toContainText('грн');
});
