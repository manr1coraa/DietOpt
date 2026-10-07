import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeOffer, conceptMarketName, loadMarketData } from '../../web/js/market-data.js';

const OATS = {
  id: 57, n: 'Вівсяні пластівці (сухі)', n_de: 'Haferflocken', n_en: 'Oats', n_ru: 'Овсяные хлопья',
  c: 'grains', p: 11.9, f: 7.5, cb: 69.1, k: 358, src: 'legacy-unverified',
};

const DE_DOC = {
  market: 'de', currency: 'EUR', prices_are_estimates: true, price_reference_date: '2026-10-06',
  prices: { 57: 0.2, 160: 0.25 },
  offers: {
    57: {
      name: 'Haferflocken, Blütenzarte Köllnflocken', kind: 'on_pack', brand: 'Kölln', pack: '500g',
      barcode: '4000540000108', nutrition: { p: 14, f: 6.7, cb: 56, k: 361 },
      nutrition_src: 'OFF:4000540000108', source: 'Open Food Facts (ODbL)', updated: '2026-10-05',
    },
  },
};

test('conceptMarketName falls back to the market language', () => {
  assert.equal(conceptMarketName(OATS, 'de'), 'Haferflocken');
  assert.equal(conceptMarketName(OATS, 'ua'), 'Вівсяні пластівці (сухі)');
  assert.equal(conceptMarketName({ n: 'Тільки N' }, 'de'), 'Тільки N');
});

test('mergeOffer applies the explicit market offer', () => {
  const merged = mergeOffer(OATS, DE_DOC);
  assert.equal(merged.dname, 'Haferflocken, Blütenzarte Köllnflocken');
  assert.equal(merged.name_kind, 'on_pack');
  assert.equal(merged.pr, 0.2);
  assert.equal(merged.price_currency, 'EUR');
  assert.equal(merged.price_status, 'estimate');
  assert.equal(merged.p, 14, 'verified pack nutrition overrides the concept');
  assert.equal(merged.nutrition_src, 'OFF:4000540000108');
  assert.equal(merged.offer.brand, 'Kölln');
  assert.equal(merged.market, 'de');
});

test('mergeOffer falls back to concept data without an offer', () => {
  const eggs = { id: 160, n: 'Яйце куряче', n_de: 'Hühnereier', c: 'eggs', p: 12, f: 11, cb: 1, k: 150, src: 'legacy-unverified' };
  const merged = mergeOffer(eggs, DE_DOC);
  assert.equal(merged.dname, 'Hühnereier');
  assert.equal(merged.name_kind, 'concept');
  assert.equal(merged.nutrition_src, 'legacy-unverified');
});

test('mergeOffer hides unavailable offers and missing price rows', () => {
  const hidden = mergeOffer(OATS, { ...DE_DOC, offers: { 57: { available: false } } });
  assert.equal(hidden, null);
  const noPrice = mergeOffer({ ...OATS, id: 999 }, DE_DOC);
  assert.equal(noPrice, null);
});

test('mergeOffer honours a sourced offer price', () => {
  const doc = {
    ...DE_DOC,
    offers: { 57: { name: 'X', price: 0.22, price_source: 'Kaufland flyer', price_date: '2026-10-01' } },
  };
  const merged = mergeOffer(OATS, doc);
  assert.equal(merged.pr, 0.22);
  assert.equal(merged.price_status, 'sourced');
  assert.equal(merged.price_source, 'Kaufland flyer');
  assert.equal(merged.price_date, '2026-10-01');
});

test('loadMarketData merges offers end to end', async () => {
  const fetcher = async url => ({
    ok: true,
    json: async () => (String(url).includes('markets')
      ? DE_DOC
      : { version: 't', categories: [], products: [OATS] }),
  });
  const data = await loadMarketData('de', fetcher);
  assert.equal(data.products.length, 1);
  assert.equal(data.products[0].dname, 'Haferflocken, Blütenzarte Köllnflocken');
});
