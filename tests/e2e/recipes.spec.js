// Offline dish templates are visible without an API key; AI has its own
// consent-first path with localized errors and an offline fallback.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('#/plan');
  await page.evaluate(() => {
    localStorage.setItem('dietopt.lang', 'ru');
    localStorage.setItem('dietopt.market', 'de');
  });
  await page.reload();
  await page.locator('#profile-form').evaluate(f => f.requestSubmit());
  await expect(page.locator('#plan-output .meal')).not.toHaveCount(0);
});

test('offline dish hints are visible without any key or extra clicks', async ({ page }) => {
  const card = page.locator('#recipes-card');
  await expect(card).toBeVisible();
  await expect(card.locator('.dish')).not.toHaveCount(0);
  await expect(card.locator('.dish__title').first()).not.toBeEmpty();
  await expect(card).toContainText('Офлайн-подсказка');
  await expect(card).toContainText('работают офлайн');
  await expect(card.locator('.ai-box')).toHaveCount(0);
});

test('AI button asks for consent first, declining keeps offline dishes', async ({ page }) => {
  await page.locator('#recipes-card [data-act="ai"]').click();
  const dlg = page.locator('#dlg');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('согласие');
  await expect(dlg).toContainText('Google Gemini API');
  await expect(dlg).toContainText('локально');
  await dlg.locator('button[value="cancel"]').click();
  await expect(dlg).toBeHidden();
  await expect(page.locator('#recipes-card .dish')).not.toHaveCount(0);
  await expect(page.locator('#recipes-card .ai-box')).toHaveCount(0);
});

test('after consent, AI asks for a key and explains its storage', async ({ page }) => {
  await page.locator('#recipes-card [data-act="ai"]').click();
  await page.locator('#dlg button[value="ok"]').click();
  const dlg = page.locator('#dlg');
  await expect(dlg).toContainText(/Gemini API Key/);
  await expect(dlg).toContainText('хранится только в этом браузере');
});

test('offline AI attempt shows a localized error plus offline dishes', async ({ page, context }) => {
  await page.evaluate(() => {
    localStorage.setItem('dietopt.ai-consent', 'true');
    localStorage.setItem('dietopt.ai', JSON.stringify({ key: 'fake-key', model: 'gemini-2.5-flash-lite' }));
  });
  await context.setOffline(true);
  try {
    await page.locator('#recipes-card [data-act="ai"]').click();
    const out = page.locator('#ai-out');
    await expect(out).toContainText('Нет соединения');
    await expect(out.locator('.dish')).not.toHaveCount(0);
  } finally {
    await context.setOffline(false);
  }
});
