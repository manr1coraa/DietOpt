/* ═══════════════════════════════════════════════════════════════
   builder.js — Interactive Meal & Diet Builder for DietOpt
   Supports German presets, custom assembly, live KBJU & € totals
   ═══════════════════════════════════════════════════════════════ */

import { t, fmtCost, fmtInt, getFoodName, getCatName } from './i18n.js';

export const GERMAN_PRESETS = {
  fitness: {
    name: '🇩🇪 Fitness-Klassiker',
    items: {
      breakfast: [
        { id: 57, grams: 80 },   // Haferflocken
        { id: 112, grams: 200 }, // Vollmilch 2.5%
        { id: 365, grams: 120 }, // Banane
      ],
      snack: [
        { id: 384, grams: 150 }, // Apfel
        { id: 426, grams: 25 },  // Mandelkerne
      ],
      lunch: [
        { id: 239, grams: 200 }, // Hähnchenbrustfilet
        { id: 60, grams: 180 },  // Reis gekocht
        { id: 316, grams: 150 }, // Brokkoli
        { id: 96, grams: 10 },   // Olivenöl
      ],
      dinner: [
        { id: 138, grams: 250 }, // Magerquark
        { id: 483, grams: 60 },  // Vollkornbrot
        { id: 160, grams: 60 },  // Hühnerei (1 Stk)
        { id: 327, grams: 100 }, // Gurke frisch
      ]
    }
  },
  abendbrot: {
    name: '🇩🇪 Deutsches Abendbrot & Alltag',
    items: {
      breakfast: [
        { id: 483, grams: 80 },  // Vollkornbrot
        { id: 158, grams: 35 },  // Gouda jung
        { id: 160, grams: 120 }, // Hühnerei (2 Stk)
        { id: 344, grams: 100 }, // Tomaten
      ],
      snack: [
        { id: 601, grams: 200 }, // Skyr Natur
        { id: 384, grams: 150 }, // Apfel
      ],
      lunch: [
        { id: 268, grams: 150 }, // Lachsfilet
        { id: 319, grams: 250 }, // Kartoffeln
        { id: 350, grams: 150 }, // Blattspinat
        { id: 108, grams: 10 },  // Rapsöl
      ],
      dinner: [
        { id: 483, grams: 80 },  // Vollkornbrot
        { id: 604, grams: 50 },  // Putenbrust-Aufschnitt
        { id: 327, grams: 100 }, // Gurke frisch
        { id: 602, grams: 150 }, // Hüttenkäse
      ]
    }
  },
  spar: {
    name: '🇩🇪 Aldi/Lidl Spar-Plan (< 5 €/Tag)',
    items: {
      breakfast: [
        { id: 57, grams: 100 },  // Haferflocken
        { id: 112, grams: 200 }, // Vollmilch 2.5%
        { id: 384, grams: 150 }, // Apfel
      ],
      snack: [
        { id: 326, grams: 150 }, // Möhren
        { id: 423, grams: 30 },  // Erdnüsse
      ],
      lunch: [
        { id: 443, grams: 180 }, // Rote Linsen
        { id: 319, grams: 250 }, // Kartoffeln
        { id: 326, grams: 100 }, // Möhren
        { id: 325, grams: 50 },  // Zwiebeln
        { id: 108, grams: 10 },  // Rapsöl
      ],
      dinner: [
        { id: 138, grams: 250 }, // Magerquark
        { id: 160, grams: 120 }, // Hühnerei (2 Stk)
        { id: 480, grams: 75 },  // Roggenbrot
      ]
    }
  }
};

export const UKRAINIAN_PRESETS = {
  student_ua: {
    name: '🇺🇦 Студент-Економ (~120 ₴/день)',
    items: {
      breakfast: [
        { id: 57, grams: 80 },   // Вівсяні пластівці
        { id: 160, grams: 120 }, // Яйця (2 шт)
        { id: 384, grams: 150 }, // Яблуко
      ],
      snack: [
        { id: 121, grams: 250 }, // Кефір 1%
      ],
      lunch: [
        { id: 53, grams: 250 },  // Гречана каша
        { id: 253, grams: 150 }, // Куряча печінка
        { id: 95, grams: 10 },   // Олія соняшникова
        { id: 324, grams: 100 }, // Морква
      ],
      dinner: [
        { id: 138, grams: 200 }, // Сир кисломолочний нежирний
        { id: 365, grams: 120 }, // Банан
      ]
    }
  },
  classic_ua: {
    name: '🇺🇦 Домашній раціон (~185 ₴/день)',
    items: {
      breakfast: [
        { id: 57, grams: 80 },   // Вівсяні пластівці
        { id: 160, grams: 120 }, // Яйця (2 шт)
        { id: 384, grams: 150 }, // Яблуко
      ],
      snack: [
        { id: 122, grams: 300 }, // Кефір 2.5%
        { id: 365, grams: 150 }, // Банан
      ],
      lunch: [
        { id: 53, grams: 250 },  // Гречана каша
        { id: 239, grams: 200 }, // Куряча грудка
        { id: 95, grams: 10 },   // Олія соняшникова
        { id: 327, grams: 150 }, // Огірки свіжі
        { id: 344, grams: 150 }, // Томати свіжі
      ],
      dinner: [
        { id: 138, grams: 200 }, // Сир кисломолочний
        { id: 483, grams: 80 },  // Хліб цільнозерновий
        { id: 158, grams: 30 },  // Твердий сир
      ]
    }
  },
  power_ua: {
    name: '🇺🇦 Силовий / Спорт (~220 ₴/день)',
    items: {
      breakfast: [
        { id: 57, grams: 100 },  // Вівсянка
        { id: 112, grams: 200 }, // Молоко 2.5%
        { id: 160, grams: 120 }, // Яйця (2 шт)
      ],
      snack: [
        { id: 138, grams: 200 }, // Сир кисломолочний
        { id: 365, grams: 150 }, // Банан
      ],
      lunch: [
        { id: 60, grams: 250 },  // Рис варений
        { id: 239, grams: 250 }, // Куряча грудка
        { id: 96, grams: 10 },   // Оливкова олія
        { id: 316, grams: 150 }, // Броколі
      ],
      dinner: [
        { id: 53, grams: 200 },  // Гречка
        { id: 268, grams: 120 }, // Риба
        { id: 327, grams: 150 }, // Огірки
      ]
    }
  }
};

export const ALL_PRESETS = {
  ...GERMAN_PRESETS,
  ...UKRAINIAN_PRESETS,
};

const POPULAR_GERMAN_IDS = [138, 57, 483, 160, 239, 601, 602, 268, 158, 384, 365, 319, 316, 350, 112, 108, 96, 604, 443, 60, 426, 327, 344];

export function getInitialBuilderState() {
  try {
    const saved = localStorage.getItem('dietopt.builder');
    if (saved) return JSON.parse(saved);
  } catch {}
  // Default to the German Fitness Classic
  return JSON.parse(JSON.stringify(GERMAN_PRESETS.fitness.items));
}

export function saveBuilderState(state) {
  try {
    localStorage.setItem('dietopt.builder', JSON.stringify(state));
  } catch {}
}

export function calcItemNutrition(prod, grams, currency = 'EUR', priceOverrides = {}) {
  const r = grams / 100;
  const basePr = (currency === 'EUR') ? (prod.pr_eur ?? (prod.pr / 45)) : prod.pr;
  const pr = priceOverrides[prod.id] != null ? priceOverrides[prod.id] : basePr;
  return {
    cost: Math.round(r * pr * 100) / 100,
    calories: Math.round(r * prod.k * 10) / 10,
    protein: Math.round(r * prod.p * 10) / 10,
    fat: Math.round(r * prod.f * 10) / 10,
    carbs: Math.round(r * prod.cb * 10) / 10,
  };
}

export function calcDayTotals(builderState, productsMap, currency = 'EUR', priceOverrides = {}) {
  let cost = 0, kcal = 0, protein = 0, fat = 0, carbs = 0;
  for (const meal of ['breakfast', 'lunch', 'dinner', 'snack']) {
    const items = builderState[meal] || [];
    for (const it of items) {
      const prod = productsMap.get(it.id);
      if (!prod) continue;
      const n = calcItemNutrition(prod, it.grams, currency, priceOverrides);
      cost += n.cost;
      kcal += n.calories;
      protein += n.protein;
      fat += n.fat;
      carbs += n.carbs;
    }
  }
  return {
    cost: Math.round(cost * 100) / 100,
    calories: Math.round(kcal),
    protein: Math.round(protein * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
  };
}

export function convertBuilderToPlanMenu(builderState, productsMap, currency = 'EUR', priceOverrides = {}) {
  const menu = [];
  for (const meal of ['breakfast', 'snack', 'lunch', 'dinner']) {
    const items = builderState[meal] || [];
    for (const it of items) {
      const prod = productsMap.get(it.id);
      if (!prod) continue;
      const nut = calcItemNutrition(prod, it.grams, currency, priceOverrides);
      menu.push({
        id: prod.id,
        name: prod.n,
        n_de: prod.n_de,
        n_en: prod.n_en,
        n_ru: prod.n_ru,
        category: prod.c,
        meal,
        amount_g: it.grams,
        cost: nut.cost,
        calories: nut.calories,
        protein: nut.protein,
        fat: nut.fat,
        carbs: nut.carbs,
        price_per_100g: nut.cost / (it.grams / 100),
        liquid: !!prod.l,
      });
    }
  }
  return menu;
}
