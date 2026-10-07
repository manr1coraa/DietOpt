// Real-browser shopping-list behaviour: tap/click, keyboard, persistence, reload.
import { test, expect } from '@playwright/test';

const LIST = {
  source: 'E2E menu',
  items: [
    { id: 57, name: 'Вівсяні пластівці', n: 'Вівсяні пластівці', n_de: 'Haferflocken', n_en: 'Oats', n_ru: 'Овсяные хлопья', category: 'grains', grams: 80, cost: 0.5, done: false },
    { id: 160, name: 'Яйце куряче', n: 'Яйце куряче', n_de: 'Hühnerei', n_en: 'Egg', n_ru: 'Яйцо', category: 'eggs', grams: 120, cost: 0.4, done: false },
  ],
};

// NOTE: seeding goes through page.evaluate + reload (not addInitScript),
// so that later in-test reloads preserve real app state instead of
// re-applying the seed.
test.beforeEach(async ({ page }) => {
  await page.goto('#/list');
  await page.evaluate(list => {
    localStorage.setItem('dietopt.lang', 'de');
    localStorage.setItem('dietopt.market', 'de');
    localStorage.setItem('dietopt.de.list', JSON.stringify(list));
  }, LIST);
  await page.reload();
  await expect(page.locator('.shop-item')).toHaveCount(2);
});

// Real tap on the touch project, real click on desktop.
async function tapOrClick(locator) {
  if (test.info().project.name === 'chromium-mobile') await locator.tap();
  else await locator.click();
}

test('checkbox press strikes the row immediately', async ({ page }) => {
  const row = page.locator('.shop-item[data-id="57"]');
  await tapOrClick(row.locator('.shop-check'));
  await expect(row).toHaveClass(/done/);
  await expect(row.locator('.shop-item__name')).toHaveCSS('text-decoration-line', 'line-through');
  await expect(row.locator('.shop-check')).toBeChecked();
});

test('keyboard Space on the focused checkbox toggles', async ({ page }) => {
  const box = page.locator('.shop-item[data-id="57"] .shop-check');
  await box.focus();
  await page.keyboard.press('Space');
  await expect(box).toBeChecked();
  await expect(page.locator('.shop-item[data-id="57"]')).toHaveClass(/done/);
});

test('pressing the row outside controls toggles too', async ({ page }) => {
  await tapOrClick(page.locator('.shop-item[data-id="160"] .shop-item__cost'));
  await expect(page.locator('.shop-item[data-id="160"]')).toHaveClass(/done/);
});

test('checked state survives reload, order stays stable', async ({ page }) => {
  await page.locator('.shop-item[data-id="57"] .shop-check').check();
  const orderBefore = await page.locator('.shop-item').evaluateAll(els => els.map(e => e.dataset.id));
  await page.reload();
  await expect(page.locator('.shop-item[data-id="57"]')).toHaveClass(/done/);
  await expect(page.locator('.shop-item[data-id="57"] .shop-check')).toBeChecked();
  const orderAfter = await page.locator('.shop-item').evaluateAll(els => els.map(e => e.dataset.id));
  expect(orderAfter).toEqual(orderBefore);
});

test('adding the same menu twice merges quantities (no duplicates)', async ({ page }) => {
  await page.goto('#/plan');
  await page.locator('#profile-form').evaluate(f => f.requestSubmit());
  await expect(page.locator('#plan-output .meal')).not.toHaveCount(0);
  await page.locator('[data-act="to-list"]').click();
  await page.locator('[data-act="to-list"]').click();
  await page.goto('#/list');
  const ids = await page.locator('.shop-item').evaluateAll(els => els.map(e => e.dataset.id));
  expect(new Set(ids).size).toBe(ids.length);
  await expect(page.locator('#toast')).toContainText(/ergänzt|merged/i);
});
