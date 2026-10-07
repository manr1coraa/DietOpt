import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeListItems, setListItemDone, toggleListItem, listTotals,
} from '../../web/js/shopping.js';
import { aggregateShopping } from '../../web/js/optimizer.js';

const OATS = {
  id: 57, name: 'Вівсяні пластівці', n_de: 'Haferflocken',
  category: 'grains', grams: 80, cost: 0.5,
};
const EGGS = {
  id: 160, name: 'Яйце куряче', n_de: 'Hühnerei',
  category: 'eggs', grams: 120, cost: 0.4,
};

test('mergeListItems adds fresh lines as not-done', () => {
  const { items, added, merged } = mergeListItems([], [OATS, EGGS]);
  assert.equal(added, 2);
  assert.equal(merged, 0);
  assert.equal(items.length, 2);
  assert.ok(items.every(i => i.done === false));
});

test('mergeListItems merges duplicates instead of duplicating rows', () => {
  const first = mergeListItems([], [OATS]).items;
  const { items, added, merged } = mergeListItems(first, [{ ...OATS, grams: 20, cost: 0.1 }]);
  assert.equal(added, 0);
  assert.equal(merged, 1);
  assert.equal(items.length, 1);
  assert.equal(items[0].grams, 100);
  assert.equal(items[0].cost, 0.6);
});

test('merging into a checked-off item re-opens it (new quantities unbought)', () => {
  const done = [{ ...OATS, done: true }];
  const { items, merged } = mergeListItems(done, [OATS]);
  assert.equal(merged, 1);
  assert.equal(items[0].done, false);
  assert.equal(items[0].grams, 160);
});

test('mergeListItems keeps stable order and backfills names', () => {
  const legacy = [{ id: 57, name: 'Вівсяні пластівці', category: 'grains', grams: 80, cost: 0.5, done: false }];
  const { items } = mergeListItems(legacy, [EGGS, OATS]);
  assert.deepEqual(items.map(i => i.id), [57, 160], 'insertion order, no re-sort');
  assert.equal(items[0].n_de, 'Haferflocken', 'translations backfilled');
});

test('mergeListItems skips invalid rows', () => {
  const { items, added } = mergeListItems([], [null, {}, { id: 'x' }]);
  assert.equal(added, 0);
  assert.deepEqual(items, []);
});

test('setListItemDone / toggleListItem ignore unknown ids, do not mutate', () => {
  const items = [{ ...OATS, done: false }];
  assert.deepEqual(setListItemDone(items, 999, true), items);
  assert.deepEqual(toggleListItem(items, 999), items);
  const toggled = toggleListItem(items, 57);
  assert.equal(toggled[0].done, true);
  assert.equal(items[0].done, false, 'original untouched');
  assert.equal(setListItemDone(toggled, 57, false)[0].done, false);
});

test('listTotals separates total, remaining and done counts', () => {
  const totals = listTotals([
    { ...OATS, done: true }, { ...EGGS, done: false },
  ]);
  assert.equal(totals.total, 0.9);
  assert.equal(totals.left, 0.4);
  assert.equal(totals.done, 1);
  assert.equal(totals.count, 2);
  assert.deepEqual(listTotals([]), { total: 0, left: 0, done: 0, count: 0 });
});

test('aggregateShopping carries display names for every interface language', () => {
  const menu = [{
    id: 57, name: 'Вівсяні пластівці', n_de: 'Haferflocken', n_en: 'Oats', n_ru: 'Овсяные хлопья',
    category: 'grains', amount_g: 80, cost: 0.5,
  }];
  const [line] = aggregateShopping([menu]);
  assert.equal(line.n, 'Вівсяні пластівці');
  assert.equal(line.n_de, 'Haferflocken');
  assert.equal(line.n_en, 'Oats');
  assert.equal(line.n_ru, 'Овсяные хлопья');
});
