// DOM-level tests for the shopping list: boot the real app in jsdom with a
// stubbed fetch (local JSON files) and drive it like a user.
// Real-browser keyboard/touch/viewport coverage lives in tests/e2e/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HTML = readFileSync(join(ROOT, 'web', 'index.html'), 'utf-8');

const SEEDED_LIST = {
  source: 'Test menu',
  items: [
    {
      id: 57, name: 'Вівсяні пластівці', n: 'Вівсяні пластівці',
      n_de: 'Haferflocken', n_en: 'Oats', n_ru: 'Овсяные хлопья',
      category: 'grains', grams: 80, cost: 0.5, done: false,
    },
    {
      id: 160, name: 'Яйце куряче', n: 'Яйце куряче',
      n_de: 'Hühnerei', n_en: 'Egg', n_ru: 'Яйцо',
      category: 'eggs', grams: 120, cost: 0.4, done: true,
    },
  ],
};

function stubFetch() {
  const files = {
    './data/catalog/products.json': 'web/data/catalog/products.json',
    './data/markets/de.json': 'web/data/markets/de.json',
    './data/markets/ua.json': 'web/data/markets/ua.json',
  };
  return async url => {
    const rel = files[String(url)];
    if (!rel) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(ROOT, rel), 'utf-8')) };
  };
}

// jsdom does not implement HTMLFormElement named getters (form.age, ...),
// which the app uses. Emulate them on every form (harness-only patch).
function patchFormAccess(window) {
  for (const form of window.document.forms) {
    const groups = {};
    for (const el of form.elements) {
      const name = el.getAttribute('name');
      if (name) (groups[name] ||= []).push(el);
    }
    for (const [name, els] of Object.entries(groups)) {
      if (name in form) continue;
      const single = els.length === 1 && els[0].type !== 'radio';
      Object.defineProperty(form, name, {
        configurable: true,
        value: single ? els[0] : {
          get value() {
            const checked = els.find(e => e.checked);
            return checked ? checked.value : '';
          },
          set value(v) {
            const target = els.find(e => e.value === v);
            if (target) target.checked = true;
          },
        },
      });
    }
  }
}

async function bootApp({ storage = {}, query = '' } = {}) {
  const dom = new JSDOM(HTML, { url: 'http://localhost:8000/' });
  const { window } = dom;
  // Some Node globals (navigator, ...) are getter-only: define, do not assign.
  for (const [key, value] of Object.entries({
    window, document: window.document, navigator: window.navigator,
    location: window.location, localStorage: window.localStorage,
  })) {
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
  globalThis.fetch = stubFetch();
  window.scrollTo = () => {};
  patchFormAccess(window);
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addEventListener() {}, removeEventListener() {},
  }));
  for (const [k, v] of Object.entries(storage)) window.localStorage.setItem(k, v);

  await import(`../../web/js/app.js${query}`);
  // boot() is async: wait until static texts/chips are rendered.
  const deadline = Date.now() + 8000;
  while (!window.document.querySelector('#allergy-chips .chip')) {
    if (Date.now() > deadline) throw new Error('app did not boot in jsdom');
    await new Promise(r => setTimeout(r, 25));
  }
  return dom;
}

function goToList(window) {
  window.location.hash = '#/list';
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
}

function storedList(window) {
  return JSON.parse(window.localStorage.getItem('dietopt.de.list'));
}

let dom;
test('shopping list boots and renders seeded items under market names', async () => {
  dom = await bootApp({
    storage: {
      'dietopt.lang': 'de',
      'dietopt.market': 'de',
      'dietopt.de.list': JSON.stringify(SEEDED_LIST),
    },
  });
  goToList(dom.window);
  const rows = [...dom.window.document.querySelectorAll('#list-output .shop-item')];
  assert.equal(rows.length, 2);
  const names = rows.map(r => r.querySelector('.shop-item__name').textContent);
  // Legacy rows (stored without market names) are healed from the DE market:
  // the real Kölln offer for oats, the generic name for eggs.
  assert.deepEqual(names, ['Haferflocken, Blütenzarte Köllnflocken', 'Hühnereier, Größe M']);
  const healed = storedList(dom.window).items.find(i => i.id === 57);
  assert.equal(healed.dname, 'Haferflocken, Blütenzarte Köllnflocken');
  assert.equal(rows[0].classList.contains('done'), false);
  assert.equal(rows[1].classList.contains('done'), true);
  assert.equal(rows[1].querySelector('.shop-check').checked, true);
});

test('clicking the checkbox immediately strikes the row and persists', async () => {
  const { document } = dom.window;
  const box = document.querySelector('.shop-item[data-id="57"] .shop-check');
  box.focus();
  box.click(); // real activation behaviour: toggles + fires change
  const row = document.querySelector('.shop-item[data-id="57"]');
  assert.equal(box.checked, true);
  assert.equal(row.classList.contains('done'), true);
  assert.equal(document.activeElement, box, 'focus stays on the checkbox (no re-render jump)');
  assert.equal(storedList(dom.window).items.find(i => i.id === 57).done, true);
  const left = document.querySelector('#list-output [data-left]').textContent;
  assert.match(left, /2/, 'totals show 2 of 2 done');
});

test('tapping the row (outside checkbox/label) toggles without reordering', async () => {
  const { document, MouseEvent } = dom.window;
  const before = [...document.querySelectorAll('#list-output .shop-item')].map(r => r.dataset.id);
  const cost = document.querySelector('.shop-item[data-id="57"] .shop-item__cost');
  cost.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const row = document.querySelector('.shop-item[data-id="57"]');
  assert.equal(row.querySelector('.shop-check').checked, false);
  assert.equal(row.classList.contains('done'), false);
  const after = [...document.querySelectorAll('#list-output .shop-item')].map(r => r.dataset.id);
  assert.deepEqual(after, before, 'stable order: rows never jump');
  assert.equal(storedList(dom.window).items.find(i => i.id === 57).done, false);
});

test('clicking the label toggles exactly once', async () => {
  const { document, MouseEvent } = dom.window;
  const label = document.querySelector('.shop-item[data-id="160"] .shop-item__body');
  const before = storedList(dom.window).items.find(i => i.id === 160).done;
  label.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  // jsdom performs label activation behaviour (forwards to the control).
  const box = document.querySelector('.shop-item[data-id="160"] .shop-check');
  assert.equal(box.checked, !before, 'label activation flips the checkbox once');
  assert.equal(storedList(dom.window).items.find(i => i.id === 160).done, !before);
});

test('checkbox is keyboard-focusable (Tab + Space path)', async () => {
  const { document } = dom.window;
  const box = document.querySelector('.shop-item[data-id="57"] .shop-check');
  box.focus();
  assert.equal(document.activeElement, box);
  assert.equal(box.tabIndex, 0);
  // Native Space handling is browser behaviour; the state path it triggers
  // (change → setItemDone → persist) is covered above via .click().
});

test('checked state survives a reload', async () => {
  const snapshot = {};
  for (let i = 0; i < dom.window.localStorage.length; i++) {
    const k = dom.window.localStorage.key(i);
    snapshot[k] = dom.window.localStorage.getItem(k);
  }
  assert.equal(JSON.parse(snapshot['dietopt.de.list']).items.find(i => i.id === 160).done, false);
  const dom2 = await bootApp({ storage: snapshot, query: '?reload=1' });
  goToList(dom2.window);
  const row = dom2.window.document.querySelector('.shop-item[data-id="160"]');
  assert.equal(row.querySelector('.shop-check').checked, false);
});
