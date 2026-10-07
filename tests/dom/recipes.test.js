// Offline recipes are visible without any key or network; AI is never
// triggered implicitly. Boots the real app in jsdom and runs a plan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HTML = readFileSync(join(ROOT, 'web', 'index.html'), 'utf-8');

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

test('plan shows offline dish templates with no key and no AI request', async () => {
  const dom = new JSDOM(HTML, { url: 'http://localhost:8000/' });
  const { window } = dom;
  for (const [key, value] of Object.entries({
    window, document: window.document, navigator: window.navigator,
    location: window.location, localStorage: window.localStorage,
  })) {
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
  const googleCalls = [];
  globalThis.fetch = async url => {
    const s = String(url);
    if (s.includes('googleapis')) googleCalls.push(s);
    const files = {
      './data/catalog/products.json': 'web/data/catalog/products.json',
      './data/markets/de.json': 'web/data/markets/de.json',
    };
    const rel = files[s];
    if (!rel) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(ROOT, rel), 'utf-8')) };
  };
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.requestAnimationFrame = cb => setTimeout(cb, 0);
  globalThis.matchMedia = window.matchMedia;
  globalThis.requestAnimationFrame = window.requestAnimationFrame;
  window.localStorage.setItem('dietopt.lang', 'ru');
  window.localStorage.setItem('dietopt.market', 'de');
  patchFormAccess(window);

  await import('../../web/js/app.js?recipes-dom=1');
  const deadline = Date.now() + 8000;
  while (!window.document.querySelector('#allergy-chips .chip')) {
    if (Date.now() > deadline) throw new Error('app did not boot in jsdom');
    await new Promise(r => setTimeout(r, 25));
  }

  // Run a plan with default (valid) profile values.
  window.document.querySelector('#profile-form').requestSubmit();
  const deadline2 = Date.now() + 15000;
  while (!window.document.querySelector('#plan-output .meal')) {
    if (Date.now() > deadline2) throw new Error('plan did not render in jsdom');
    await new Promise(r => setTimeout(r, 50));
  }

  const doc = window.document;
  const card = doc.querySelector('#recipes-card');
  assert.ok(card, 'recipes card is rendered outside <details>');
  assert.equal(card.closest('details'), null, 'recipes are visible without opening details');
  const dishes = card.querySelectorAll('.dish');
  assert.ok(dishes.length > 0, 'offline dishes rendered');
  assert.match(card.textContent, /Офлайн-подсказка/, 'offline badge distinguishes templates from AI');
  assert.match(card.textContent, /работают офлайн/, 'offline note promises no key needed');
  assert.equal(card.querySelector('.ai-box'), null, 'no AI output without explicit action');
  assert.deepEqual(googleCalls, [], 'no request to Google without explicit AI action');
});
