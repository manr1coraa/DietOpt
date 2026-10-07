import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMarketData } from '../../web/js/market-data.js';

const CATALOG = {
  version: 'test-1',
  categories: [{ name: 'grains', name_ua: 'Крупи' }],
  products: [
    { id: 1, n: 'Гречка', c: 'grains', p: 12, f: 3, cb: 62, k: 320 },
    { id: 2, n: 'Кіноа', c: 'grains', p: 14, f: 6, cb: 57, k: 340 },
    { id: 3, n: 'Хліб', c: 'bakery', p: 8, f: 2, cb: 50, k: 250 },
  ],
};

const DE_MARKET = {
  market: 'de', name: 'Deutschland', currency: 'EUR', price_unit: 'EUR/100g',
  prices_are_estimates: true, price_reference_date: '2026-10-06',
  prices: { 1: 0.35, 3: 0.28 }, // id 2 is NOT sold in this market
};

function stubFetch({ catalog = CATALOG, market = DE_MARKET, ok = true } = {}) {
  return async url => ({
    ok,
    json: async () => (String(url).includes('markets') ? market : catalog),
  });
}

test('loads catalogue together with the requested market prices', async () => {
  const data = await loadMarketData('de', stubFetch());
  assert.equal(data.market, 'de');
  assert.equal(data.currency, 'EUR');
  assert.equal(data.prices_are_estimates, true);
  assert.equal(data.products.length, 2);
  assert.deepEqual(data.products.map(p => p.id).sort(), [1, 3]);
  assert.equal(data.products[0].price_currency, 'EUR');
});

test('a food is unavailable in a market without its own price row', async () => {
  const data = await loadMarketData('de', stubFetch());
  assert.ok(!data.products.some(p => p.id === 2));
});

test('rejects unsupported markets', async () => {
  await assert.rejects(() => loadMarketData('fr', stubFetch()), /Unsupported market/);
});

test('rejects failed fetches', async () => {
  await assert.rejects(() => loadMarketData('de', stubFetch({ ok: false })), /Could not load/);
});

test('rejects mismatched market payloads', async () => {
  const wrong = { ...DE_MARKET, market: 'ua' };
  await assert.rejects(() => loadMarketData('de', stubFetch({ market: wrong })), /invalid/);
});
