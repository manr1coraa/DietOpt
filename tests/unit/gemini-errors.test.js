import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGeminiError, geminiRecipes } from '../../web/js/recipes.js';

test('classifyGeminiError maps HTTP statuses to UI cases', () => {
  assert.equal(classifyGeminiError(400), 'bad-key');
  assert.equal(classifyGeminiError(401), 'bad-key');
  assert.equal(classifyGeminiError(403), 'bad-key');
  assert.equal(classifyGeminiError(429), 'quota');
  assert.equal(classifyGeminiError(404), 'unknown');
  assert.equal(classifyGeminiError(500), 'unknown');
  assert.equal(classifyGeminiError(503), 'unknown');
});

const ARGS = {
  apiKey: 'test-key', model: 'gemini-2.5-flash-lite',
  menu: [{ id: 1, name: 'Oats', meal: 'breakfast', amount_g: 80 }],
  profile: { goal: 'maintain', budget: 8, currency: 'EUR' },
  mealNames: { breakfast: 'Breakfast' }, lang: 'en',
};

async function withFetch(stub, fn) {
  const prev = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await fn();
  } finally {
    globalThis.fetch = prev;
  }
}

test('geminiRecipes returns text on success', async () => {
  await withFetch(
    async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '## Yum' }] } }] }) }),
    async () => {
      const res = await geminiRecipes(ARGS);
      assert.equal(res.text, '## Yum');
      assert.ok(res.model);
    },
  );
});

test('geminiRecipes throws bad-key on 401 without model-hopping', async () => {
  let calls = 0;
  await withFetch(
    async () => { calls += 1; return { ok: false, status: 401, json: async () => ({ error: { message: 'API key not valid' } }) }; },
    async () => {
      await assert.rejects(() => geminiRecipes(ARGS), err => {
        assert.equal(err.code, 'bad-key');
        return true;
      });
      assert.equal(calls, 1, 'no retry on rejected key');
    },
  );
});

test('geminiRecipes throws quota after exhausting model fallbacks on 429', async () => {
  await withFetch(
    async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'Quota exceeded' } }) }),
    async () => {
      await assert.rejects(() => geminiRecipes(ARGS), err => {
        assert.equal(err.code, 'quota');
        return true;
      });
    },
  );
});

test('geminiRecipes throws network on fetch TypeError (offline)', async () => {
  await withFetch(
    async () => { throw new TypeError('fetch failed'); },
    async () => {
      await assert.rejects(() => geminiRecipes(ARGS), err => {
        assert.equal(err.code, 'network');
        return true;
      });
    },
  );
});
