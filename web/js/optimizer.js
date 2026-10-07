/* ═══════════════════════════════════════════════════════════════
   optimizer.js — ядро DietOpt, яке працює прямо в браузері.
   Порт алгоритму з backend/optimizer.py (PuLP/CBC) на JavaScript
   (власний двофазний симплекс-метод, simplex.js). Сервер не потрібен.

   Кваліфікаційна робота: Литвин А.В., ХНУ ім. В.Н. Каразіна, 2026
   ═══════════════════════════════════════════════════════════════ */

import { solveBounded } from './simplex.js';

/* ─── Категорії ─────────────────────────────────────────────── */
export const ALWAYS_EXCLUDED_CATS = ['alcohol'];
// 'flour' більше не виключаємо цілком: у цій категорії лежать макарони
// та спагеті. Саме борошно/крохмаль відсікає GLOBAL_BLACKLIST.
export const BASIC_EXCLUDED_CATS = [
  'alcohol', 'hot_drinks', 'cold_drinks', 'sweets', 'spices', 'caviar',
];
const VEGETARIAN_EXCLUDED = ['meat', 'poultry', 'fish_seafood', 'sausages'];
const VEGAN_EXCLUDED = [
  'meat', 'poultry', 'fish_seafood', 'sausages', 'dairy', 'cheese', 'eggs', 'caviar',
];

/* ─── Групи алергенів ───────────────────────────────────────── */
export const ALLERGEN_GROUPS = {
  'молоко': {
    categories: ['dairy', 'cheese'],
    keywords: ['молок', 'сметан', 'сир ', 'сирок', 'сирки', 'вершк', 'йогурт', 'кефір', 'ряжанк',
      'ацидофіл', 'сироват', 'масло вершк', 'масло топлен', 'брин', 'фета', 'моцарел', 'сулугун',
      'адигей', 'пармезан', 'морозив', 'млинці (на молоці)'],
  },
  'лактоз': {
    categories: ['dairy', 'cheese'],
    keywords: ['молок', 'сметан', 'сир ', 'вершк', 'йогурт', 'кефір', 'ряжанк', 'сироват', 'масло вершк'],
  },
  'горіх': {
    categories: ['nuts_seeds'],
    keywords: ['горіх', 'мигдал', 'фундук', "кеш'ю", 'кешью', 'арахіс', 'фісташ', 'пекан',
      'макадам', 'кедров', 'бразиль', 'нутелла', 'мюслі з горіх'],
  },
  'арахіс': { categories: [], keywords: ['арахіс'] },
  'глютен': {
    categories: ['bakery', 'flour'],
    keywords: ['пшен', 'хліб', 'батон', 'булк', 'булоч', 'макарон', 'лаваш', 'вермішел', 'спагет',
      'локшин', 'печиво', 'сухар', 'манн', 'булгур', 'кус-кус', 'кускус', 'пиріг', 'піта',
      'перлов', 'ячн', 'житн', 'бородін', 'вівсян', 'мюслі', 'круасан', 'тортиль', 'млинці', 'оладк'],
  },
  'пшениц': {
    categories: ['bakery'],
    keywords: ['пшен', 'батон', 'макарон', 'спагет', 'манн', 'булгур', 'кус-кус'],
  },
  'яйц': {
    categories: ['eggs'],
    keywords: ['яйц', 'яйце', 'яєчн', 'омлет', 'жовток', 'білок яєч', 'локшина яєчна'],
  },
  'риб': {
    categories: ['fish_seafood', 'caviar'],
    keywords: ['риб', 'хек', 'минтай', 'мінтай', 'лосось', 'тунець', 'тріск', 'сьомг', 'форел',
      'судак', 'окун', 'короп', 'щук', 'скумбрі', 'оселед', 'сардин', 'анчоус', 'кільк', 'килька',
      'камбал', 'пангасіус', 'тілапі', 'горбуш', 'кета', 'макрель', 'ікра'],
  },
  'морепродукт': {
    categories: ['fish_seafood'],
    keywords: ['креветк', 'мідії', 'кальмар', 'восьминіг', 'устриц', 'краб', 'лангуст', 'морськ', 'раки'],
  },
  'со': { // соя / соєвий
    categories: [],
    keywords: ['соєв', 'соя', 'тофу', 'темпе', 'місо', 'едамаме'],
  },
  'цитрус': {
    categories: [],
    keywords: ['апельсин', 'мандарин', 'лимон', 'лайм', 'грейпфрут', 'помело', 'цитрус'],
  },
  "м'яс": {
    categories: ['meat', 'poultry', 'sausages'],
    keywords: ["м'ясо", 'свинин', 'яловичин', 'теляч', 'баранин', 'курят', 'куряч', 'куриц',
      'курка', 'індич', 'індик', 'качк', 'качин', 'гус', 'ковбас', 'сосиск', 'сардел', 'шинк', 'фарш'],
  },
  'кур': {
    categories: ['poultry'],
    keywords: ['курят', 'куряч', 'куриц', 'курка', 'фарш курячий'],
  },
  'свин': { categories: [], keywords: ['свинин', 'свиняч', 'фарш свинячий', 'сало'] },
  'ялович': { categories: [], keywords: ['яловичин', 'ялович', 'теляч', 'телятин'] },
  'гриб': {
    categories: ['mushrooms'],
    keywords: ['гриб', 'печериц', 'шампіньйон', 'лисичк', 'опеньк', 'глив'],
  },
  'томат': { categories: [], keywords: ['томат', 'помідор'] },
  'мед': { categories: [], keywords: ['мед '] },
};

/** Розгортає введення користувача в набір категорій та ключових слів. */
export function expandAllergens(userInput) {
  const cats = new Set();
  const kws = new Set();
  if (!userInput) return { cats, kws };
  const items = userInput.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length >= 2);
  for (const item of items) {
    kws.add(item);
    for (const [key, g] of Object.entries(ALLERGEN_GROUPS)) {
      // ключ є коренем слова: «горіхи» містить «горіх», «соя» містить «со»
      if (item.includes(key) || (item.length >= 3 && key.startsWith(item))) {
        g.categories.forEach(c => cats.add(c));
        g.keywords.forEach(k => kws.add(k));
      }
    }
  }
  return { cats, kws };
}

/* ─── Глобальний «чорний список» — неїстівне або екзотика ───── */
const GLOBAL_BLACKLIST = [
  'борошно', 'крохмаль', 'дріжджі', 'сода',
  'молоко сухе', 'молоко згущ', 'вершки сухі', 'вершки згущ', "молоко коров'яче сире",
  'яєчний порошок', 'білок яєчн', 'жовток', 'манна',
  'перепелин', 'перепелк', 'страусин', 'гусяче', 'качине',
  'сало', 'смалець', 'маргарин', 'комбіжир', 'масло топлен',
  'жир свин', 'жир кур', 'жир ялов', 'жир бараняч',
  'цукор', 'пудра цукр', 'глюкоза', 'фруктоза', 'сироп',
  'краснопірк', 'плотв', 'салак', 'корюшк', 'навага', 'бичок', 'молоки', 'ікра', 'карась',
  'лящ', 'тарань', 'товстолобик', 'густер', 'жерех', 'минь', 'піскар', 'мерлуз', 'путасу',
  'сайда', 'сайра', 'ставрид', 'килька', 'мойва',
  'субпродукт', 'печінк', 'печінка', 'нирк', 'мізк', 'язик', 'серце', 'серця', 'шлунк',
  "вим'я", 'легені', 'селезінк', 'рубец', 'тельбух', 'потрох', 'лівер', 'кров', 'хвіст',
  'шкур', 'вуха', 'копит',
  'конин', 'оленин', 'лосятин', 'козлятин', 'фазан', 'куріпк', 'дичин', 'страус', 'кролик',
  'вугор', 'вугільна', 'осетр', 'осетер', 'стерлядь', 'мінога', 'акул', 'восьминіг', 'устриц',
  'молюск', 'раки', 'лангуст', 'мідії',
  'сушен', "в'ялен", 'вялен', 'маринован', 'смажена', 'хрін',
];

const isBlacklisted = name => {
  const n = name.toLowerCase();
  return GLOBAL_BLACKLIST.some(kw => n.includes(kw));
};

/* ─── Шаблони раціонів (keyword, minPortion×100г, maxPortion×100г) ── */
const T = (name, meals) => ({ name, meals });

export const STANDARD_TEMPLATES = [
  T('🇩🇪 Deutscher Fitness-Klassiker', {
    breakfast: [['вівсян', 0.8, 2.0], ['молоко 2.5', 1.0, 2.5], ['банан', 0.8, 1.5]],
    snack: [['яблуко', 0.8, 2.0], ['мигдаль', 0.15, 0.4]],
    lunch: [['куряча грудка', 1.5, 3.0], ['рисов', 0.8, 2.5], ['капуста броколі', 0.8, 2.0], ['олія', 0.05, 0.2]],
    dinner: [['сир кисломолочний нежирн', 1.5, 3.0], ['хліб цільнозерн', 0.6, 1.5], ['яйце куряче', 1.0, 2.0], ['огірки свіж', 0.8, 1.8]],
  }),
  T('🇩🇪 Deutsches Abendbrot & Alltag', {
    breakfast: [['хліб цільнозерн', 0.8, 1.5], ['сир гауда', 0.3, 0.6], ['яйце куряче', 1.0, 2.0], ['томати свіж', 0.8, 1.5]],
    snack: [['скир', 1.5, 2.5], ['яблуко', 0.8, 1.5]],
    lunch: [['лосось', 1.2, 2.5], ['картопля варен', 1.5, 3.5], ['шпинат', 0.8, 2.0], ['олія', 0.05, 0.2]],
    dinner: [['хліб цільнозерн', 0.8, 1.5], ['індич', 0.6, 1.5], ['огірки свіж', 0.8, 1.8], ['сир кисломолочний нежирн', 1.0, 2.0]],
  }),
  T('🇩🇪 Spar-Plan Deutschland (Aldi/Lidl)', {
    breakfast: [['вівсян', 0.8, 2.5], ['молоко 2.5', 1.0, 2.0], ['яблуко', 0.8, 1.5]],
    snack: [['морква', 1.0, 2.0], ['арахіс', 0.2, 0.4]],
    lunch: [['сочевиц', 1.0, 2.5], ['картопля', 1.5, 3.5], ['морква', 0.5, 1.5], ['цибуля', 0.2, 0.5], ['олія', 0.05, 0.2]],
    dinner: [['сир кисломолочний нежирн', 1.5, 2.5], ['хліб житн', 0.6, 1.5], ['яйце куряче', 1.0, 2.0]],
  }),
  T('Класичний з куркою', {
    breakfast: [['вівсян', 0.6, 2.5], ['молоко 2.5', 1.0, 2.5], ['банан', 0.7, 1.5], ['масло вершк', 0.05, 0.25]],
    snack: [['яблуко', 1.0, 2.5], ['волоський горіх', 0.2, 0.5], ['йогурт', 1.0, 2.0]],
    lunch: [['куряча грудка', 1.2, 3.0], ['гречан', 0.8, 2.5], ['морква', 0.5, 1.5], ['цибуля ріпч', 0.2, 0.6], ['олія соняшник', 0.05, 0.2]],
    dinner: [['яйце куряче', 1.0, 2.5], ['хліб житн', 0.5, 1.5], ['томати свіж', 0.8, 2.0], ['огірки свіж', 0.8, 2.0], ['сир кисломолочний нежирн', 0.8, 2.0]],
  }),
  T('Рибний день', {
    breakfast: [['вівсян', 0.6, 2.5], ['молоко 2.5', 1.0, 2.5], ['масло вершк', 0.05, 0.25], ['груша', 0.7, 1.5]],
    snack: [['банан', 0.7, 1.5], ['сир голландськ', 0.3, 0.7], ['кефір', 1.0, 2.5]],
    lunch: [['хек', 1.5, 3.0], ['рисов', 0.8, 2.5], ['капуста білокачан', 0.8, 2.0], ['морква', 0.5, 1.0], ['олія соняшник', 0.05, 0.2]],
    dinner: [['сир кисломолочний нежирн', 1.0, 2.5], ['хліб пшеничн', 0.5, 1.5], ['огірки свіж', 0.8, 2.0], ['яйце куряче', 1.0, 2.0]],
  }),
  T('Бюджетний', {
    breakfast: [['пшонян', 0.6, 2.5], ['молоко 2.5', 1.0, 2.5], ['яйце куряче', 1.0, 2.0]],
    snack: [['банан', 0.7, 1.5], ['кефір', 1.0, 2.5], ['яблуко', 0.7, 1.5]],
    lunch: [['куряче стегно', 1.2, 2.5], ['картопля молод', 1.5, 4.0], ['морква', 0.5, 1.5], ['цибуля ріпч', 0.2, 0.6], ['олія соняшник', 0.05, 0.2]],
    dinner: [['хліб житн', 0.8, 1.5], ['сир кисломолочний нежирн', 0.8, 2.0], ['огірки свіж', 0.8, 2.0], ['томати свіж', 0.8, 1.5]],
  }),
  T('Спортивний', {
    breakfast: [['яйце куряче', 1.0, 2.5], ['вівсян', 0.6, 2.5], ['молоко 2.5', 1.0, 2.5], ['банан', 0.7, 1.5]],
    snack: [['сир кисломолочний напівжирн', 1.0, 2.5], ['яблуко', 0.7, 1.5], ['мигдаль', 0.2, 0.4]],
    lunch: [['куряча грудка', 1.5, 3.0], ['гречан', 0.8, 2.5], ['томати свіж', 0.8, 2.0], ['олія соняшник', 0.05, 0.2]],
    dinner: [['минтай', 1.5, 3.0], ['рисов', 0.8, 2.0], ['капуста білокачан', 0.8, 2.0], ['хліб житн', 0.5, 1.0]],
  }),
  T('З індичкою', {
    breakfast: [['йогурт', 1.0, 2.5], ['вівсян', 0.6, 2.5], ['яблуко', 0.7, 1.5], ['волоський горіх', 0.15, 0.4]],
    snack: [['груша', 0.8, 2.0], ['кефір', 1.0, 2.5]],
    lunch: [['індич', 1.2, 2.5], ['гречан', 0.8, 2.5], ['капуста броколі', 0.8, 2.0], ['морква', 0.5, 1.0], ['олія соняшник', 0.05, 0.2]],
    dinner: [['сир адигейськ', 1.0, 2.0], ['огірки свіж', 0.8, 2.0], ['томати свіж', 0.8, 2.0], ['хліб пшеничн', 0.5, 1.5]],
  }),
  T('Макаронний', {
    breakfast: [['яйце куряче', 1.0, 2.5], ['хліб пшеничн', 0.5, 1.5], ['масло вершк', 0.05, 0.25], ['сир голландськ', 0.3, 0.7]],
    snack: [['банан', 0.7, 1.5], ['кефір', 1.0, 2.0], ['яблуко', 0.7, 1.5]],
    lunch: [['куряча грудка', 1.2, 3.0], ['макарони (варен', 1.5, 3.5], ['томати свіж', 0.8, 2.0], ['олія соняшник', 0.05, 0.2]],
    dinner: [['сир кисломолочний нежирн', 1.0, 2.5], ['хліб житн', 0.5, 1.5], ['огірки свіж', 0.8, 2.0]],
  }),
  T('Картопляний з рибою', {
    breakfast: [['гречан', 0.8, 2.5], ['яйце куряче', 1.0, 2.0], ['сир голландськ', 0.2, 0.5]],
    snack: [['яблуко', 0.7, 1.5], ['кефір', 1.0, 2.5], ['волоський горіх', 0.15, 0.4]],
    lunch: [['минтай', 1.5, 3.0], ['картопля молод', 1.5, 3.5], ['морква', 0.5, 1.5], ['цибуля ріпч', 0.2, 0.6], ['олія соняшник', 0.05, 0.2]],
    dinner: [['сир кисломолочний нежирн', 1.0, 2.5], ['хліб житн', 0.5, 1.5], ['огірки свіж', 0.8, 2.0], ['томати свіж', 0.8, 1.5]],
  }),
  T('Гречано-курячий', {
    breakfast: [['вівсян', 0.6, 2.0], ['банан', 1.0, 2.0], ['йогурт', 1.0, 2.0], ['мигдаль', 0.15, 0.4]],
    snack: [['яблуко', 1.0, 2.0], ['сир голландськ', 0.3, 0.6]],
    lunch: [['куряча грудка', 1.5, 3.0], ['гречан', 1.0, 2.5], ['капуста білокачан', 0.8, 1.8], ['морква', 0.5, 1.2], ['олія соняшник', 0.05, 0.2]],
    dinner: [['яйце куряче', 1.5, 2.5], ['хліб житн', 0.5, 1.2], ['томати свіж', 1.0, 2.0], ['огірки свіж', 1.0, 2.0]],
  }),
  // ── нові шаблони (додано у v3) ──
  T('Свинина з булгуром', {
    breakfast: [['сирники', 1.0, 2.0], ['сир кисломолочний напівжирн', 0.8, 2.0], ['сметана 15', 0.2, 0.5], ['яблуко', 0.7, 1.5]],
    snack: [['банан', 0.7, 1.5], ['ряжанк', 1.0, 2.5]],
    lunch: [['свинина нежирн', 1.0, 2.0], ['булгур', 1.0, 2.5], ['перець червоний', 0.5, 1.5], ['цибуля ріпч', 0.2, 0.6], ['олія соняшник', 0.05, 0.2]],
    dinner: [['яйце куряче', 1.0, 2.0], ['кабачки', 1.0, 2.5], ['хліб цільнозерн', 0.5, 1.5], ['томати свіж', 0.8, 1.5]],
  }),
  T('Фарш і квасоля', {
    breakfast: [['вівсян', 0.6, 2.5], ['молоко 2.5', 1.0, 2.5], ['яблуко', 0.7, 1.5]],
    snack: [['кефір', 1.0, 2.5], ['банан', 0.7, 1.5]],
    lunch: [['фарш курячий', 1.0, 2.5], ['спагетті (варен', 1.5, 3.0], ['томати свіж', 0.8, 2.0], ['цибуля ріпч', 0.2, 0.6], ['олія соняшник', 0.05, 0.2]],
    dinner: [['квасоля червона', 1.0, 2.0], ['буряк варен', 0.8, 2.0], ['хліб житн', 0.5, 1.5], ['яйце куряче', 1.0, 2.0]],
  }),
];

export const VEGAN_TEMPLATES = [
  T('Веганський класичний', {
    breakfast: [['вівсян', 1.5, 3.5], ['банан', 1.0, 2.0], ['волоський горіх', 0.2, 0.5]],
    snack: [['яблуко', 1.0, 2.5], ['мигдаль', 0.2, 0.5]],
    lunch: [['квасол', 1.0, 3.0], ['рисов', 1.0, 3.0], ['морква', 0.5, 2.0], ['цибуля ріпч', 0.2, 0.6], ['олія соняшник', 0.05, 0.2]],
    dinner: [['сочевиц', 1.0, 3.0], ['хліб житн', 0.5, 1.5], ['томати свіж', 0.8, 2.0], ['огірки свіж', 0.8, 2.0]],
  }),
  T('Веганський бюджетний', {
    breakfast: [['вівсян', 1.5, 3.5], ['банан', 1.0, 2.0], ['волоський горіх', 0.15, 0.4]],
    snack: [['яблуко', 1.0, 2.5], ['груша', 0.7, 1.5]],
    lunch: [['нут', 1.0, 3.0], ['гречан', 1.0, 3.0], ['капуста білокачан', 0.8, 2.0], ['морква', 0.5, 1.5], ['олія соняшник', 0.05, 0.2]],
    dinner: [['квасол', 1.0, 2.5], ['хліб пшеничн', 0.5, 1.5], ['огірки свіж', 0.8, 2.0], ['томати свіж', 0.8, 1.5]],
  }),
  T('Веганський з рисом', {
    breakfast: [['гречан', 1.0, 2.5], ['банан', 1.0, 2.0], ['мигдаль', 0.2, 0.5]],
    snack: [['яблуко', 1.0, 2.0], ['груша', 0.7, 1.5]],
    lunch: [['нут', 1.0, 2.5], ['рисов', 1.0, 2.5], ['капуста броколі', 0.8, 2.0], ['морква', 0.5, 1.5], ['олія соняшник', 0.05, 0.2]],
    dinner: [['сочевиц', 1.0, 2.5], ['хліб житн', 0.5, 1.5], ['томати свіж', 1.0, 2.0], ['огірки свіж', 1.0, 2.0]],
  }),
  T('Веганський з тофу', {
    breakfast: [['вівсян', 1.2, 3.0], ['банан', 1.0, 2.0], ['арахісова паста', 0.15, 0.4]],
    snack: [['яблуко', 1.0, 2.0], ['волоський горіх', 0.15, 0.4]],
    lunch: [['тофу', 1.0, 2.0], ['рис бурий', 1.0, 2.5], ['капуста броколі', 0.8, 2.0], ['олія соняшник', 0.05, 0.2]],
    dinner: [['горох (варен', 1.0, 2.5], ['картопля молод', 1.0, 2.5], ['огірки свіж', 0.8, 2.0], ['хліб житн', 0.5, 1.5]],
  }),
];

export const VEGETARIAN_TEMPLATES = [
  T('Вегетаріанський класичний', {
    breakfast: [['вівсян', 0.6, 2.5], ['молоко 2.5', 1.0, 2.5], ['банан', 0.7, 1.5]],
    snack: [['яблуко', 0.7, 2.0], ['сир голландськ', 0.3, 0.7], ['йогурт', 1.0, 2.0]],
    lunch: [['яйце куряче', 1.5, 3.0], ['гречан', 0.8, 2.5], ['морква', 0.5, 1.5], ['капуста білокачан', 0.8, 2.0], ['олія соняшник', 0.05, 0.2]],
    dinner: [['сир кисломолочний нежирн', 1.0, 2.5], ['хліб житн', 0.5, 1.5], ['томати свіж', 0.8, 2.0], ['огірки свіж', 0.8, 2.0]],
  }),
  T('Вегетаріанський з бобовими', {
    breakfast: [['яйце куряче', 1.0, 2.5], ['хліб пшеничн', 0.5, 1.5], ['масло вершк', 0.05, 0.25], ['молоко 2.5', 1.0, 2.5]],
    snack: [['груша', 0.7, 1.5], ['волоський горіх', 0.2, 0.5], ['кефір', 1.0, 2.0]],
    lunch: [['квасол', 1.0, 2.5], ['рисов', 0.8, 2.5], ['морква', 0.5, 1.5], ['олія соняшник', 0.05, 0.2]],
    dinner: [['сир адигейськ', 1.0, 2.0], ['огірки свіж', 0.8, 2.0], ['томати свіж', 0.8, 2.0], ['хліб житн', 0.5, 1.0]],
  }),
  T('Вегетаріанський з макаронами', {
    breakfast: [['сир кисломолочний напівжирн', 1.0, 2.0], ['сметана 15', 0.2, 0.5], ['банан', 0.7, 1.5]],
    snack: [['яблуко', 0.7, 2.0], ['кефір', 1.0, 2.5]],
    lunch: [['макарони (варен', 1.5, 3.0], ['сир голландськ', 0.3, 0.7], ['томати свіж', 0.8, 2.0], ['олія соняшник', 0.05, 0.2]],
    dinner: [['яйце куряче', 1.5, 2.5], ['капуста цвітн', 1.0, 2.5], ['хліб житн', 0.5, 1.5]],
  }),
];

export const MEAL_ORDER = ['breakfast', 'snack', 'lunch', 'dinner'];
export const MEAL_NAMES = {
  breakfast: 'Сніданок', snack: 'Перекус', lunch: 'Обід', dinner: 'Вечеря',
};

/* ─── Розрахунок норм КБЖУ (Міффлін — Сан Жеор) ────────────── */
export const PAL = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
const GOAL_COEF = { loss: 0.85, maintain: 1.0, gain: 1.15 };
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;

export function calculateNorms(p) {
  const { weight: w, height: h, age: a } = p;
  const bmr = p.gender === 'male' ? 10 * w + 6.25 * h - 5 * a + 5 : 10 * w + 6.25 * h - 5 * a - 161;
  const tdee = bmr * (PAL[p.activity_level] ?? 1.375);
  const target = tdee * (GOAL_COEF[p.goal] ?? 1);
  let pp, fp, cp;
  if (p.goal === 'loss') { pp = [0.30, 0.40]; fp = [0.25, 0.35]; cp = [0.25, 0.40]; }
  else if (p.goal === 'gain') { pp = [0.25, 0.35]; fp = [0.25, 0.30]; cp = [0.40, 0.50]; }
  else { pp = [0.25, 0.35]; fp = [0.25, 0.35]; cp = [0.35, 0.45]; }
  const bmi = r1(w / ((h / 100) ** 2));
  const bmi_status = bmi < 18.5 ? 'Дефіцит маси тіла' : bmi < 25 ? 'Нормальна маса тіла'
    : bmi < 30 ? 'Надмірна маса тіла' : 'Ожиріння';
  return {
    bmr: r1(bmr), tdee: r1(tdee), target_calories: r1(target),
    protein_min: r1(target * pp[0] / 4), protein_max: r1(target * pp[1] / 4),
    fat_min: r1(target * fp[0] / 9), fat_max: r1(target * fp[1] / 9),
    carbs_min: r1(target * cp[0] / 4), carbs_max: r1(target * cp[1] / 4),
    water_ml: Math.round(w * 35), bmi, bmi_status,
  };
}

/* ─── Детермінований генератор випадкових чисел ─────────────── */
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* ─── Фільтрація продуктів під профіль ──────────────────────── */
export function filterProducts(allProducts, profile, extra = {}) {
  const isEur = extra.currency === 'EUR' || profile?.currency === 'EUR';
  const excluded = new Set([...ALWAYS_EXCLUDED_CATS, ...BASIC_EXCLUDED_CATS]);
  if (profile.diet_type === 'vegetarian') VEGETARIAN_EXCLUDED.forEach(c => excluded.add(c));
  if (profile.diet_type === 'vegan') VEGAN_EXCLUDED.forEach(c => excluded.add(c));
  const { cats, kws } = expandAllergens(profile.allergies || '');
  cats.forEach(c => excluded.add(c));
  const banned = new Set(extra.bannedIds || []);
  const prices = extra.priceOverrides || {};
  return allProducts
    .filter(p => p.k > 0 && !excluded.has(p.c) && !banned.has(p.id))
    .filter(p => !isBlacklisted(p.n))
    .filter(p => {
      const allNames = (p.n + ' ' + (p.n_de || '') + ' ' + (p.n_en || '') + ' ' + (p.n_ru || '')).toLowerCase();
      for (const k of kws) if (allNames.includes(k)) return false;
      return true;
    })
    .map(p => {
      const basePr = isEur ? (p.pr_eur ?? Math.round((p.pr / 45) * 100) / 100) : p.pr;
      const customPr = prices[p.id];
      return { ...p, pr: customPr != null ? customPr : basePr };
    });
}

/* ─── Вибір конкретних продуктів під шаблон ─────────────────── */
function selectForTemplate(template, products, mode, rng) {
  const selected = [];
  const used = new Set();
  for (const meal of MEAL_ORDER) {
    for (const [kw, minP, maxP] of template.meals[meal] || []) {
      const kwLower = kw.toLowerCase();
      const matches = products.filter(p => {
        if (used.has(p.id)) return false;
        const allNames = (p.n + ' ' + (p.n_de || '') + ' ' + (p.n_en || '') + ' ' + (p.n_ru || '')).toLowerCase();
        return allNames.includes(kwLower);
      });
      if (!matches.length) continue;
      const sorted = [...matches].sort((a, b) => a.pr - b.pr);
      let best;
      if (mode === 'cheap') best = sorted[0];
      else if (mode === 'middle') best = sorted[Math.floor(sorted.length / 2)];
      else best = sorted.slice(0, 3)[Math.floor(rng() * Math.min(3, sorted.length))];
      // сухі крупи/макарони — у 2.5 раза калорійніші за варені, обмежуємо порцію
      let lo = minP, hi = maxP;
      if (best.n.includes('(сух')) { lo = Math.min(lo, 0.4); hi = Math.min(hi, 1.0); }
      selected.push({ prod: best, meal, lo, hi });
      used.add(best.id);
    }
  }
  return selected;
}

/* ─── LP-модель ─────────────────────────────────────────────── */
function solveLP(selected, norms, budget, opt) {
  const {
    objective = 'min_cost', calTol = 0.10, macroTol = 0.20, budgetMinPct = 0, budgetMaxPct = 1.0,
  } = opt;
  if (selected.length < 6) return null;

  const col = f => selected.map(s => s.prod[f]);
  const rows = [
    { coef: col('k'), min: norms.target_calories * (1 - calTol), max: norms.target_calories * (1 + calTol) },
    { coef: col('p'), min: norms.protein_min * (1 - macroTol / 2), max: norms.protein_max * (1 + macroTol) },
    { coef: col('f'), min: norms.fat_min * (1 - macroTol), max: norms.fat_max * (1 + macroTol) },
    { coef: col('cb'), min: norms.carbs_min * (1 - macroTol), max: norms.carbs_max * (1 + macroTol) },
    { coef: col('pr'), max: budget * budgetMaxPct, ...(budgetMinPct > 0 ? { min: budget * budgetMinPct } : {}) },
  ];
  const res = solveBounded({
    cost: col('pr'), lo: selected.map(s => s.lo), hi: selected.map(s => s.hi),
    rows, maximize: objective !== 'min_cost',
  });
  if (!res.feasible) return null;

  const menu = [];
  const tot = { cost: 0, kcal: 0, p: 0, f: 0, c: 0 };
  selected.forEach((s, i) => {
    const v = res.x[i];
    if (v < 0.05) return;
    const item = {
      id: s.prod.id, name: s.prod.n,
      n_de: s.prod.n_de, n_en: s.prod.n_en, n_ru: s.prod.n_ru,
      category: s.prod.c, meal: s.meal,
      amount_g: Math.round(v * 100), cost: r2(v * s.prod.pr), calories: r1(v * s.prod.k),
      protein: r1(v * s.prod.p), fat: r1(v * s.prod.f), carbs: r1(v * s.prod.cb),
      price_per_100g: s.prod.pr, liquid: !!s.prod.l,
    };
    menu.push(item);
    tot.cost += item.cost; tot.kcal += item.calories; tot.p += item.protein; tot.f += item.fat; tot.c += item.carbs;
  });
  if (menu.length < 6) return null;
  return {
    status: 'optimal', total_cost: r2(tot.cost), total_calories: r1(tot.kcal),
    total_protein: r1(tot.p), total_fat: r1(tot.f), total_carbs: r1(tot.c), menu,
  };
}

export function templatesFor(profile) {
  if (profile.diet_type === 'vegan') return VEGAN_TEMPLATES;
  if (profile.diet_type === 'vegetarian') return VEGETARIAN_TEMPLATES;
  return STANDARD_TEMPLATES;
}

const menuKey = r => r.menu.map(m => m.id).sort((a, b) => a - b).join(',');

/**
 * Оптимізований раціон: перебір шаблонів × режимів вибору, мінімізація вартості.
 * Повертає відсортований список унікальних допустимих варіантів — перший є
 * глобально найдешевшим, решта використовуються для кнопки «Інший варіант»
 * та для тижневого плану.
 */
export function optimizeCandidates(products, profile, norms, seed = Date.now()) {
  const t0 = performance.now();
  const templates = templatesFor(profile);
  const found = new Map();
  const rng = makeRng(seed);
  // Рівні послаблення: якщо при строгих обмеженнях розв'язку немає
  // (дуже висока калорійність, веган + високий білок), поступово
  // збільшуємо допустимі порції та допуски КБЖУ.
  const levels = [
    { mult: 1.0, calTol: 0.10, macroTol: 0.20 },
    { mult: 1.6, calTol: 0.10, macroTol: 0.25 },
    { mult: 2.2, calTol: 0.12, macroTol: 0.32 },
    { mult: 3.0, calTol: 0.15, macroTol: 0.40 },
  ];
  for (const [li, lv] of levels.entries()) {
    for (const tpl of templates) {
      for (const mode of ['cheap', 'random', 'random', 'middle']) {
        const sel = selectForTemplate(tpl, products, mode, rng).map(s => ({ ...s, hi: s.hi * lv.mult }));
        if (sel.length < 6) continue;
        const r = solveLP(sel, norms, profile.budget, { objective: 'min_cost', calTol: lv.calTol, macroTol: lv.macroTol });
        if (!r) continue;
        r.template = tpl.name;
        r.relaxed = li > 0;
        const key = menuKey(r);
        if (!found.has(key) || found.get(key).total_cost > r.total_cost) found.set(key, r);
      }
    }
    if (found.size) break;
  }
  const list = [...found.values()].sort((a, b) => a.total_cost - b.total_cost);
  const ms = r1(performance.now() - t0);
  list.forEach(r => { r.solve_time_ms = ms; });
  return list;
}

/** «Звичайний» раціон — реалістичний набір, що використовує ~90–100% бюджету. */
export function optimizeBasic(products, profile, norms, seed = Date.now()) {
  const t0 = performance.now();
  const rng = makeRng(seed + 7);
  const tpls = shuffle(templatesFor(profile), rng);
  const strategies = [
    [2.0, 0.95, 0.10, 0.20, 'random'], [2.5, 0.95, 0.10, 0.20, 'middle'],
    [2.5, 0.90, 0.12, 0.22, 'random'], [3.0, 0.90, 0.12, 0.22, 'middle'],
    [3.0, 0.85, 0.13, 0.25, 'random'], [3.5, 0.85, 0.13, 0.25, 'middle'],
    [3.5, 0.75, 0.15, 0.28, 'random'], [4.0, 0.65, 0.15, 0.30, 'middle'],
    [4.0, 0.50, 0.18, 0.30, 'cheap'],
  ];
  let best = null, bestDiff = Infinity;
  for (const [mult, bMin, calT, macT, mode] of strategies) {
    for (const tpl of tpls) {
      const sel = selectForTemplate(tpl, products, mode, rng).map(s => ({ ...s, hi: s.hi * mult }));
      if (sel.length < 6) continue;
      const r = solveLP(sel, norms, profile.budget, {
        objective: 'max_budget', calTol: calT, macroTol: macT, budgetMinPct: bMin,
      });
      if (!r) continue;
      const diff = Math.abs(profile.budget - r.total_cost);
      if (diff < bestDiff) { bestDiff = diff; best = r; best.template = tpl.name; }
    }
    if (best && best.total_cost >= profile.budget * 0.9) break;
  }
  if (best) best.solve_time_ms = r1(performance.now() - t0);
  return best;
}

/** Тижневий план: 7 днів з максимально різних шаблонів. */
export function buildWeek(products, profile, norms, seed = Date.now()) {
  const days = [];
  const candidates = [];
  for (let k = 0; k < 3; k++) candidates.push(...optimizeCandidates(products, profile, norms, seed + k * 101));
  // унікальні за складом, найдешевші першими
  const uniq = new Map();
  candidates.forEach(c => { const key = menuKey(c); if (!uniq.has(key)) uniq.set(key, c); });
  const sorted = [...uniq.values()].sort((a, b) => a.total_cost - b.total_cost);
  if (!sorted.length) return [];
  // жадібно обираємо різні шаблони, щоб не було двох однакових днів поспіль
  const byTpl = new Map();
  sorted.forEach(c => { if (!byTpl.has(c.template)) byTpl.set(c.template, []); byTpl.get(c.template).push(c); });
  const tplOrder = [...byTpl.keys()];
  let i = 0;
  while (days.length < 7) {
    const tpl = tplOrder[i % tplOrder.length];
    const pool = byTpl.get(tpl);
    const pick = pool[Math.floor(i / tplOrder.length) % pool.length];
    days.push(pick);
    i++;
  }
  return days;
}

/** Агрегує список покупок з одного або кількох раціонів. */
export function aggregateShopping(menus) {
  const map = new Map();
  for (const menu of menus) for (const it of menu) {
    const cur = map.get(it.id) || { id: it.id, name: it.name, category: it.category, grams: 0, cost: 0, liquid: it.liquid };
    cur.grams += it.amount_g; cur.cost += it.cost;
    map.set(it.id, cur);
  }
  return [...map.values()].map(x => ({ ...x, cost: r2(x.cost) }));
}
