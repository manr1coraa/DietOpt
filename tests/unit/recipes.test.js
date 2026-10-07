import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDishes, fmtAmount, shortName } from '../../web/js/recipes.js';

const MENU = [
  { id: 57, name: 'Вівсяні пластівці', n_de: 'Haferflocken', n_en: 'Oats', n_ru: 'Овсяные хлопья', category: 'grains', meal: 'breakfast', amount_g: 80 },
  { id: 384, name: 'Яблуко', n_de: 'Apfel', n_en: 'Apple', n_ru: 'Яблоко', category: 'fruits', meal: 'breakfast', amount_g: 150 },
  { id: 239, name: 'Куряча грудка', n_de: 'Hähnchenbrust', n_en: 'Chicken breast', n_ru: 'Куриная грудка', category: 'poultry', meal: 'lunch', amount_g: 200 },
  { id: 60, name: 'Рис варений', n_de: 'Reis gekocht', n_en: 'Cooked rice', n_ru: 'Рис варёный', category: 'grains', meal: 'lunch', amount_g: 180 },
  { id: 160, name: 'Яйце куряче', n_de: 'Hühnerei', n_en: 'Egg', n_ru: 'Яйцо', category: 'eggs', meal: 'dinner', amount_g: 120 },
];

for (const lang of ['de', 'en', 'ru', 'uk']) {
  test(`offline dish templates render without network or API key (${lang})`, () => {
    const dishes = buildDishes(MENU, lang);
    for (const meal of ['breakfast', 'lunch', 'dinner']) {
      assert.ok(dishes[meal], `${meal} dish exists`);
      assert.ok(dishes[meal].title.length > 0, `${meal} has title`);
      assert.ok(dishes[meal].steps.length > 0, `${meal} has steps`);
      assert.ok(Number.isFinite(dishes[meal].time), `${meal} has time`);
    }
    assert.equal(dishes.snack, null, 'empty snack yields no dish');
  });
}

test('offline templates never call fetch (pure functions)', () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('network must not be used'); };
  try {
    buildDishes(MENU, 'ru');
    fmtAmount(MENU[4], 'de');
    shortName(MENU[0].name, MENU[0], 'uk');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fmtAmount renders eggs and amounts per language', () => {
  const egg = MENU[4];
  assert.match(fmtAmount(egg, 'de'), /Eier/);
  assert.match(fmtAmount(egg, 'en'), /eggs/);
  assert.match(fmtAmount(egg, 'ru'), /яйца/);
  assert.match(fmtAmount(MENU[0], 'de'), /80 g/);
});

test('dishes use the requested interface language', () => {
  const de = buildDishes(MENU, 'de');
  assert.match(de.breakfast.title, /Haferbrei|Porridge/);
  const ru = buildDishes(MENU, 'ru');
  assert.match(ru.breakfast.title, /каша/);
});
