// The market owns product names; the interface language owns labels.
import { test, expect } from '@playwright/test';

async function seed(page, lang, market) {
  await page.goto('#/foods');
  await page.evaluate(([l, m]) => {
    localStorage.setItem('dietopt.lang', l);
    localStorage.setItem('dietopt.market', m);
  }, [lang, market]);
  await page.reload();
}

test('DE market shows German goods even with Russian UI', async ({ page }) => {
  await seed(page, 'ru', 'de');
  await expect(page.locator('#lang-select')).toHaveValue('ru');
  await page.locator('#food-search').fill('quark');
  await expect(page.locator('.food__name').first()).toContainText(/Magerquark|Speisequark/);
  await expect(page.locator('#foods-output')).not.toContainText('Сир кисломолочний');
  await page.locator('#food-search').fill('Kölln');
  await expect(page.locator('.food__name').first()).toContainText('Kölln');
});

test('UA market shows Ukrainian goods even with Russian UI', async ({ page }) => {
  await seed(page, 'ru', 'ua');
  await page.locator('#food-search').fill('кисломолоч');
  await expect(page.locator('.food__name').first()).toContainText('Сир кисломолочний');
  await page.locator('#food-search').fill('quark');
  await expect(page.locator('#foods-output')).toContainText(/ничего не найдено|не знайдено|No products|Keine Produkte/i);
});

test('switching UI language does not rename market goods', async ({ page }) => {
  await seed(page, 'de', 'de');
  await page.locator('#food-search').fill('quark');
  const before = await page.locator('.food__name').first().textContent();
  await page.locator('#lang-select').selectOption('ru');
  await page.locator('#food-search').fill('quark');
  const after = await page.locator('.food__name').first().textContent();
  expect(after).toBe(before);
  expect(after).toMatch(/Magerquark|Speisequark/);
});

test('estimates carry ~ and provenance is shown in the dialog', async ({ page }) => {
  await seed(page, 'ru', 'de');
  await page.locator('#food-search').fill('quark');
  await expect(page.locator('.food__price').first()).toContainText('~');
  await page.locator('.food').first().click();
  await expect(page.locator('#dlg')).toBeVisible();
  await expect(page.locator('#dlg')).toContainText('Ориентировочная цена');
  await expect(page.locator('#dlg')).toContainText('Состав не сверен');
});
