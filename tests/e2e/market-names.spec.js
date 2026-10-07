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
  // 'quark' still matches translated aliases (e.g. Schoko-Quarkriegel), but
  // the German Quark goods themselves must be absent from the UA market.
  await expect(page.locator('#foods-output')).not.toContainText('Magerquark');
  await expect(page.locator('#foods-output')).not.toContainText('Speisequark');
});

test('switching UI language does not rename market goods', async ({ page }) => {
  await seed(page, 'de', 'de');
  const marketName = () => page.locator('.food__name').first()
    .evaluate(el => el.childNodes[0].textContent.trim());
  await page.locator('#food-search').fill('quark');
  const before = await marketName();
  await page.locator('#lang-select').selectOption('ru');
  await page.locator('#food-search').fill('quark');
  const after = await marketName();
  expect(after).toBe(before);
  expect(after).toMatch(/Magerquark|Speisequark/);
  // The UI-language concept subtitle MAY appear — the market name must not move.
  await expect(page.locator('.food__name').first()).toContainText('Magerquark');
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
