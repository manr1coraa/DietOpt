import test from 'node:test';
import assert from 'node:assert/strict';
import { matchKeyword } from '../../web/js/optimizer.js';

const TVOROG = { id: 138, n: 'Сир кисломолочний нежирний', n_de: 'Tvorog, mager', n_en: 'tvorog', n_ru: 'Творог' };
const QUARK = { id: 610, n: 'Кварк нежирний (німецький)', n_de: 'Magerquark', n_en: 'quark', n_ru: 'Кварк' };

test('matchKeyword matches a plain keyword case-insensitively', () => {
  assert.equal(matchKeyword(TVOROG, 'сир кисломолочний нежирн'), true);
  assert.equal(matchKeyword(TVOROG, 'КВАРК'), false);
  assert.equal(matchKeyword(QUARK, 'кварк нежирн'), true);
});

test('matchKeyword supports alternative keywords (either market)', () => {
  const alt = ['сир кисломолочний нежирн', 'кварк нежирн'];
  assert.equal(matchKeyword(TVOROG, alt), true);
  assert.equal(matchKeyword(QUARK, alt), true);
  assert.equal(matchKeyword({ n: 'Яблуко', n_de: 'Apfel' }, alt), false);
});

test('matchKeyword never matches on market display names alone', () => {
  // Templates describe concepts; the market name (dname) is not consulted.
  assert.equal(matchKeyword({ n: 'Вівсяні пластівці', dname: 'Kölln Crunchy' }, 'crunchy'), false);
});
