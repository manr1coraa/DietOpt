import '../helpers/storage-mock.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORTED_LANGS, SUPPORTED_MARKETS, MARKET_CURRENCIES,
  setLanguage, setMarket, fmtCost, fmtInt, getFoodName, getCatName,
  t, currentLang, currentMarket, currentCurrency,
} from '../../web/js/i18n.js';

test('supported languages and markets are independent settings', () => {
  assert.deepEqual([...SUPPORTED_LANGS].sort(), ['de', 'en', 'ru', 'uk']);
  assert.deepEqual([...SUPPORTED_MARKETS].sort(), ['de', 'ua']);
  assert.equal(MARKET_CURRENCIES.de, 'EUR');
  assert.equal(MARKET_CURRENCIES.ua, 'UAH');
  // Defaults exist even without a browser.
  assert.ok(SUPPORTED_LANGS.includes(currentLang));
  assert.ok(SUPPORTED_MARKETS.includes(currentMarket));
  assert.ok(['EUR', 'UAH'].includes(currentCurrency));
});

test('changing language does not change market/currency and vice versa', async () => {
  const fresh = await import(`../../web/js/i18n.js?lang-market=${Date.now()}`);
  fresh.setLanguage('ru');
  fresh.setMarket('de');
  assert.equal(fresh.currentLang, 'ru');
  assert.equal(fresh.currentMarket, 'de');
  assert.equal(fresh.currentCurrency, 'EUR');
  fresh.setLanguage('uk');
  assert.equal(fresh.currentMarket, 'de');
  assert.equal(fresh.currentCurrency, 'EUR');
  fresh.setMarket('ua');
  assert.equal(fresh.currentLang, 'uk');
  assert.equal(fresh.currentCurrency, 'UAH');
});

test('setMarket ignores unsupported values', () => {
  setMarket('de');
  setMarket('xx');
  assert.equal(localStorage.getItem('dietopt.market'), 'de');
});

test('market choice is persisted', () => {
  setMarket('ua');
  assert.equal(localStorage.getItem('dietopt.market'), 'ua');
  assert.equal(localStorage.getItem('dietopt.currency'), 'UAH');
  setMarket('de');
  assert.equal(localStorage.getItem('dietopt.market'), 'de');
  assert.equal(localStorage.getItem('dietopt.currency'), 'EUR');
});

test('fmtCost renders EUR and UAH distinctly', () => {
  setLanguage('de');
  assert.match(fmtCost(8, 'EUR'), /8[,.]00\s*€/);
  assert.match(fmtCost(200, 'UAH'), /200.*грн/);
  setLanguage('ru');
  assert.match(fmtCost(8, 'EUR'), /€/);
});

test('fmtInt rounds', () => {
  assert.equal(fmtInt(2395.9).replace(/[\s\u00a0.,]/g, ''), '2396');
});

test('getFoodName falls back gracefully', () => {
  const prod = { n: 'Гречка', n_de: 'Buchweizen', n_en: 'Buckwheat', n_ru: 'Гречка' };
  assert.equal(getFoodName(prod, 'de'), 'Buchweizen');
  assert.equal(getFoodName(prod, 'en'), 'Buckwheat');
  assert.equal(getFoodName(prod, 'ru'), 'Гречка');
  assert.equal(getFoodName(prod, 'uk'), 'Гречка');
  assert.equal(getFoodName({ n: 'Тільки українська' }, 'de'), 'Тільки українська');
  assert.equal(getFoodName(null, 'de'), '');
});

test('getCatName falls back gracefully', () => {
  const cat = { name: 'grains', name_ua: 'Крупи', name_de: 'Getreide' };
  assert.equal(getCatName(cat, 'de'), 'Getreide');
  assert.equal(getCatName(cat, 'uk'), 'Крупи');
  assert.equal(getCatName(null), '');
});

test('t() interpolates and never returns undefined', () => {
  for (const lang of SUPPORTED_LANGS) {
    setLanguage(lang);
    for (const key of ['nav_plan', 'market_de', 'market_ua', 'list_title', 'recipes_section',
      'recipes_offline_note', 'recipe_offline_badge', 'ai_consent_title', 'ai_consent_what',
      'ai_consent_where', 'ai_consent_key', 'ai_err_badkey', 'ai_err_quota', 'ai_err_network',
      'ai_err_unknown', 'src_price_estimate', 'src_nutrition_unverified',
      'disclaimer_estimates', 'bmi_underweight', 'bmi_normal', 'bmi_overweight', 'bmi_obese']) {
      const value = t(key);
      assert.equal(typeof value, 'string', `${lang}:${key}`);
      assert.ok(value.length > 0, `${lang}:${key}`);
    }
  }
  assert.match(t('variant_text', 2, 5), /2/);
  setLanguage('de');
});
