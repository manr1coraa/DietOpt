// Integrity of the REAL shipped data files: concepts, market exclusivity,
// template/preset resolvability. These tests read web/data/*.json directly.
import '../helpers/storage-mock.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  STANDARD_TEMPLATES, VEGAN_TEMPLATES, VEGETARIAN_TEMPLATES, matchKeyword,
} from '../../web/js/optimizer.js';
import { getPresetsForMarket } from '../../web/js/builder.js';
import { mergeOffer } from '../../web/js/market-data.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const catalog = JSON.parse(readFileSync(join(ROOT, 'web/data/catalog/products.json'), 'utf-8'));
const deMarket = JSON.parse(readFileSync(join(ROOT, 'web/data/markets/de.json'), 'utf-8'));
const uaMarket = JSON.parse(readFileSync(join(ROOT, 'web/data/markets/ua.json'), 'utf-8'));
const byId = new Map(catalog.products.map(p => [p.id, p]));

function marketProducts(marketDoc) {
  return catalog.products.map(p => mergeOffer(p, marketDoc)).filter(Boolean);
}

test('every concept carries a nutrient provenance flag', () => {
  const missing = catalog.products.filter(p => !p.src);
  assert.deepEqual(missing.map(p => p.id), []);
});

test('Quark and tvorog are separate concepts with an approximate link', () => {
  for (const [tvorogId, quarkId] of [[137, 612], [138, 610], [139, 611]]) {
    const tvorog = byId.get(tvorogId);
    const quark = byId.get(quarkId);
    assert.ok(tvorog && quark, `concepts ${tvorogId}/${quarkId} exist`);
    assert.deepEqual(tvorog.similar_to, [{ id: quarkId, match: 'approximate' }]);
    assert.deepEqual(quark.similar_to, [{ id: tvorogId, match: 'approximate' }]);
    assert.ok(!/quark/i.test(tvorog.n_de) || /tvorog/i.test(tvorog.n_de),
      `tvorog ${tvorogId} must not claim Quark identity`);
  }
});

test('tvorog is UA-only, quark is DE-only (market exclusivity)', () => {
  for (const id of ['137', '138', '139']) {
    assert.ok(!(id in deMarket.prices), `${id} absent from DE prices`);
    assert.ok(id in uaMarket.prices, `${id} present in UA prices`);
  }
  for (const id of ['610', '611', '612']) {
    assert.ok(id in deMarket.prices, `${id} present in DE prices`);
    assert.ok(!(id in uaMarket.prices), `${id} absent from UA prices`);
  }
});

test('every offer references a real, priced concept and has name/kind/date', () => {
  for (const [label, doc] of [['de', deMarket], ['ua', uaMarket]]) {
    for (const [id, offer] of Object.entries(doc.offers || {})) {
      assert.ok(byId.has(Number(id)), `${label} offer ${id}: concept exists`);
      assert.ok(String(id) in doc.prices || Number(id) in doc.prices, `${label} offer ${id}: priced`);
      assert.ok(offer.name && offer.name.length > 1, `${label} offer ${id}: name`);
      assert.ok(['generic', 'on_pack'].includes(offer.kind), `${label} offer ${id}: kind`);
      assert.match(offer.updated || '', /^\d{4}-\d{2}-\d{2}$/, `${label} offer ${id}: updated date`);
    }
  }
});

test('the Kölln offer keeps full Open Food Facts provenance', () => {
  const kolln = deMarket.offers['57'];
  assert.equal(kolln.kind, 'on_pack');
  assert.equal(kolln.barcode, '4000540000108');
  assert.equal(kolln.brand, 'Kölln');
  assert.ok(kolln.pack);
  assert.deepEqual(Object.keys(kolln.nutrition).sort(), ['cb', 'f', 'k', 'p']);
  assert.equal(kolln.nutrition_src, 'OFF:4000540000108');
  assert.match(kolln.source, /Open Food Facts/);
});

test('every similar_to link resolves to an existing concept', () => {
  for (const p of catalog.products) {
    for (const link of p.similar_to || []) {
      assert.ok(byId.has(link.id), `concept ${p.id}: similar_to ${link.id} exists`);
      assert.equal(link.match, 'approximate', `concept ${p.id}: link is approximate, never identity`);
    }
  }
});

test('every builder preset id resolves in its own market', () => {
  for (const market of ['de', 'ua']) {
    const presets = getPresetsForMarket(market);
    assert.ok(Object.keys(presets).length >= 3, `${market} has regional + international presets`);
    const prices = market === 'de' ? deMarket.prices : uaMarket.prices;
    for (const [name, preset] of Object.entries(presets)) {
      for (const [meal, items] of Object.entries(preset.items)) {
        for (const it of items) {
          assert.ok(byId.has(it.id), `${market}/${name}/${meal}: concept ${it.id} exists`);
          assert.ok(String(it.id) in prices, `${market}/${name}/${meal}: concept ${it.id} priced`);
        }
      }
    }
  }
});

test('every template keyword matches at least one food in each served market', () => {
  const deProducts = marketProducts(deMarket);
  const uaProducts = marketProducts(uaMarket);
  const groups = [
    ['standard', STANDARD_TEMPLATES],
    ['vegan', VEGAN_TEMPLATES],
    ['vegetarian', VEGETARIAN_TEMPLATES],
  ];
  const dead = [];
  for (const [group, templates] of groups) {
    for (const template of templates) {
      const markets = template.market === 'de' ? [['de', deProducts]]
        : template.market === 'ua' ? [['ua', uaProducts]]
          : [['de', deProducts], ['ua', uaProducts]];
      for (const [label, products] of markets) {
        for (const [meal, slots] of Object.entries(template.meals)) {
          for (const [kw] of slots) {
            if (!products.some(p => matchKeyword(p, kw))) {
              dead.push(`${group}/${template.name}/${meal}: ${JSON.stringify(kw)} (market ${label})`);
            }
          }
        }
      }
    }
  }
  assert.deepEqual(dead, []);
});
