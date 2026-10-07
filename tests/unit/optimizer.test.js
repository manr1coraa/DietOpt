import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateNorms, filterProducts, expandAllergens, PAL,
} from '../../web/js/optimizer.js';

const PROFILE = {
  gender: 'male', age: 25, height: 178, weight: 75,
  activity_level: 'light', goal: 'maintain', budget: 8,
  diet_type: 'standard', allergies: '', currency: 'EUR', market: 'de',
};

test('calculateNorms follows Mifflin-St Jeor x PAL (male example)', () => {
  const n = calculateNorms(PROFILE);
  // BMR = 10*75 + 6.25*178 - 5*25 + 5 = 1742.5
  assert.equal(n.bmr, 1742.5);
  // TDEE = BMR * 1.375 (light)
  assert.ok(Math.abs(n.tdee - 1742.5 * PAL.light) < 0.2);
  assert.equal(n.target_calories, n.tdee); // maintain => x1.0
  assert.equal(n.bmi, 23.7);
  assert.equal(n.bmi_class, 'normal');
  assert.equal(calculateNorms({ ...PROFILE, weight: 50 }).bmi_class, 'underweight');
  assert.equal(calculateNorms({ ...PROFILE, weight: 90 }).bmi_class, 'overweight');
  assert.equal(calculateNorms({ ...PROFILE, weight: 110 }).bmi_class, 'obese');
  assert.equal(n.water_ml, 75 * 35);
  assert.ok(n.protein_min < n.protein_max);
  assert.ok(n.fat_min < n.fat_max);
  assert.ok(n.carbs_min < n.carbs_max);
});

test('calculateNorms differs by sex, goal and activity', () => {
  const female = calculateNorms({ ...PROFILE, gender: 'female' });
  assert.equal(female.bmr, 10 * 75 + 6.25 * 178 - 5 * 25 - 161);
  const loss = calculateNorms({ ...PROFILE, goal: 'loss' });
  const gain = calculateNorms({ ...PROFILE, goal: 'gain' });
  assert.ok(loss.target_calories < gain.target_calories);
  const active = calculateNorms({ ...PROFILE, activity_level: 'very_active' });
  assert.ok(active.tdee > calculateNorms(PROFILE).tdee);
});

test('norms are estimates: unknown activity falls back to light PAL', () => {
  const n = calculateNorms({ ...PROFILE, activity_level: '???' });
  assert.ok(Math.abs(n.tdee - n.bmr * PAL.light) < 0.2);
});

const FOODS = [
  { id: 1, n: 'Гречка', c: 'grains', p: 12, f: 3, cb: 62, k: 320, pr: 1 },
  { id: 2, n: 'Молоко', c: 'dairy', p: 3, f: 2.5, cb: 4.7, k: 52, pr: 1 },
  { id: 3, n: 'Яйце куряче', c: 'eggs', p: 12.7, f: 11.5, cb: 0.7, k: 157, pr: 1 },
  { id: 4, n: 'Куряча грудка', c: 'poultry', p: 23, f: 2, cb: 0, k: 110, pr: 5 },
  { id: 5, n: 'Пиво', c: 'alcohol', p: 0.5, f: 0, cb: 3.6, k: 43, pr: 2 },
  { id: 6, n: 'Вода без калорій', c: 'cold_drinks', p: 0, f: 0, cb: 0, k: 0, pr: 0.1 },
];

test('filterProducts always excludes alcohol and zero-calorie items', () => {
  const out = filterProducts(FOODS, PROFILE, { currency: 'EUR' });
  const ids = out.map(p => p.id);
  assert.ok(!ids.includes(5), 'alcohol excluded');
  assert.ok(!ids.includes(6), 'zero-kcal excluded');
  assert.ok(ids.includes(1));
});

test('filterProducts respects vegan/vegetarian diets', () => {
  const vegan = filterProducts(FOODS, { ...PROFILE, diet_type: 'vegan' }, { currency: 'EUR' });
  assert.deepEqual(vegan.map(p => p.id), [1]);
  const veg = filterProducts(FOODS, { ...PROFILE, diet_type: 'vegetarian' }, { currency: 'EUR' });
  assert.ok(!veg.map(p => p.id).includes(4), 'poultry excluded for vegetarian');
  assert.ok(veg.map(p => p.id).includes(2), 'dairy kept for vegetarian');
});

test('filterProducts respects bans and allergens', () => {
  const banned = filterProducts(FOODS, PROFILE, { bannedIds: [1], currency: 'EUR' });
  assert.ok(!banned.map(p => p.id).includes(1));
  const noMilk = filterProducts(FOODS, { ...PROFILE, allergies: 'молоко' }, { currency: 'EUR' });
  assert.ok(!noMilk.map(p => p.id).includes(2));
});

test('expandAllergens maps milk to dairy categories', () => {
  const { cats, kws } = expandAllergens('молоко');
  assert.ok(cats.has('dairy') || cats.has('cheese'));
  assert.ok(kws.size > 0);
});
