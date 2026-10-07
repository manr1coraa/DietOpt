/* ═══════════════════════════════════════════════════════════════
   recipes.js — Multilingual recipe generator for DietOpt
   Works offline without AI. Optional AI chef via Gemini API.
   Supports DE, EN, RU, UK.
   ═══════════════════════════════════════════════════════════════ */

import { currentLang, getFoodName } from './i18n.js';

const lc = s => (s ?? '').toLowerCase();

export function shortName(n, item = null, lang = currentLang) {
  // Market display name first (item.dname/item.name); concept translations
  // only as a fallback for legacy rows without market names.
  const base = item?.dname || item?.name || (item ? getFoodName(item, lang) : null) || n;
  return String(base ?? '').replace(/\s*\(\d+ шт.*?\)/g, '').replace(/\s*\(([^)]*)\)/g, ', $1').replace(/\s+/g, ' ').trim();
}

export function fmtAmount(item, lang = currentLang) {
  const n = lc(item.name) + ' ' + lc(item.n_de || '') + ' ' + lc(item.n_en || '');
  const isEgg = n.includes('яйце') || n.includes('egg') || n.includes('ei ') || n.includes('hühnerei');
  if (isEgg) {
    const pcs = Math.max(1, Math.round(item.amount_g / 60));
    const unit = lang === 'de' ? (pcs === 1 ? 'Ei' : 'Eier') : lang === 'en' ? (pcs === 1 ? 'egg' : 'eggs') : (pcs === 1 ? 'яйцо' : 'яйца');
    return `${pcs} ${unit} (${item.amount_g} g)`;
  }
  const isLiquid = item.liquid || /молоко|кефір|кефир|kefir|ряжанк|йогурт|олія|öl|milch|juice|wasser|water/.test(n);
  if (isLiquid) {
    if (n.includes('олія') || n.includes('öl') || n.includes('oil')) {
      const tbsp = item.amount_g / 15;
      const unit = lang === 'de' ? 'EL' : lang === 'en' ? 'tbsp' : 'ст. л.';
      return tbsp >= 0.75 ? `${item.amount_g} ml (≈${Math.round(tbsp)} ${unit})` : `${item.amount_g} ml`;
    }
    return `${item.amount_g} ml`;
  }
  return `${item.amount_g} g`;
}

export function buildDishes(menu, lang = currentLang) {
  const byMeal = { breakfast: [], snack: [], lunch: [], dinner: [] };
  menu.forEach(i => { if (byMeal[i.meal]) byMeal[i.meal].push(i); });

  return {
    breakfast: breakfastDish(byMeal.breakfast, lang),
    snack: snackDish(byMeal.snack, lang),
    lunch: mainDish(byMeal.lunch, lang, 'lunch'),
    dinner: dinnerDish(byMeal.dinner, lang),
  };
}

function breakfastDish(items, lang) {
  if (!items.length) return null;
  const grain = items.find(i => i.category === 'grains' || /вівс|hafer|oat|porridge/i.test(i.name + ' ' + (i.n_de || '')));
  const bread = items.find(i => i.category === 'bakery');
  const quark = items.find(i => /кисломолоч|quark|cottage|skyr/i.test(i.name + ' ' + (i.n_de || '')));
  const eggs = items.filter(i => i.category === 'eggs');
  const fruits = items.filter(i => i.category === 'fruits' || i.category === 'berries');

  if (lang === 'de') {
    if (grain) {
      const fruitNames = fruits.map(f => getFoodName(f, 'de')).join(', ');
      return {
        title: `Haferbrei (Porridge)${fruitNames ? ' mit ' + fruitNames : ''}`,
        time: 10,
        steps: [
          `Haferflocken (${grain.amount_g} g) mit Wasser oder Milch kurz aufkochen und 3–5 Min. quellen lassen.`,
          fruits.length ? `Früchte (${fruitNames}) in Scheiben schneiden und auf dem warmen Porridge anrichten.` : 'Nach Geschmack mit einer Prise Zimt verfeinern.',
          'Warm genießen — liefert langanhaltende Energie für den Tag.'
        ]
      };
    }
    if (eggs.length) {
      return {
        title: 'Frühstücks-Eier mit Vollkornbrot',
        time: 10,
        steps: [
          `Eier (${fmtAmount(eggs[0], 'de')}) nach Wunsch kochen (6–8 Min.) oder als Rührei zubereiten.`,
          bread ? `Mit einer Scheibe ${getFoodName(bread, 'de')} (${bread.amount_g} g) servieren.` : 'Mit frischem Gemüse servieren.',
          'Perfekter proteinreicher Start in den Tag.'
        ]
      };
    }
    if (quark) {
      return {
        title: `${getFoodName(quark, 'de')} mit Früchten`,
        time: 5,
        steps: [
          `${getFoodName(quark, 'de')} (${quark.amount_g} g) mit einem Schluck Wasser cremig rühren.`,
          fruits.length ? `Mit frischem Obst (${fruits.map(f => getFoodName(f, 'de')).join(', ')}) toppen.` : 'Nach Geschmack süßen oder mit Nüssen verfeinern.',
          'Sehr hoher Proteingehalt bei minimalem Fett.'
        ]
      };
    }
    return {
      title: 'Ausgewogenes Frühstück',
      time: 10,
      steps: ['Zutaten portionsgerecht anrichten und frisch zubereiten.']
    };
  }

  if (lang === 'en') {
    if (grain) {
      return {
        title: `Warm Oatmeal Porridge${fruits.length ? ' with ' + fruits.map(f => getFoodName(f, 'en')).join(', ') : ''}`,
        time: 10,
        steps: [
          `Cook oats (${grain.amount_g} g) with water or milk for 3–5 minutes until creamy.`,
          fruits.length ? `Slice fruits and top the porridge.` : 'Add a pinch of cinnamon to taste.',
          'Nutritious, high-fiber breakfast for sustained energy.'
        ]
      };
    }
    if (eggs.length) {
      return {
        title: 'Scrambled or Boiled Eggs with Bread',
        time: 10,
        steps: [
          `Cook eggs (${fmtAmount(eggs[0], 'en')}) to your preferred doneness.`,
          bread ? `Serve alongside toasted ${getFoodName(bread, 'en')} (${bread.amount_g} g).` : 'Serve with fresh veggies.',
          'High protein breakfast to fuel your morning.'
        ]
      };
    }
    return {
      title: 'Balanced Breakfast Bowl',
      time: 5,
      steps: ['Assemble fresh ingredients and enjoy.']
    };
  }

  if (lang === 'ru') {
    if (grain) {
      return {
        title: `Овсяная каша${fruits.length ? ' с фруктами' : ' на завтрак'}`,
        time: 10,
        steps: [
          `Залейте хлопья (${grain.amount_g} г) молоком или водой и варите 3–5 минут до готовности.`,
          fruits.length ? `Нарежьте фрукты (${fruits.map(f => getFoodName(f, 'ru')).join(', ')}) и выложите сверху.` : 'Добавьте щепотку корицы или мёд по вкусу.',
          'Идеальный сытный завтрак с медленными углеводами.'
        ]
      };
    }
    if (eggs.length) {
      return {
        title: 'Яичница или омлет с хлебом',
        time: 10,
        steps: [
          `Приготовьте яйца (${fmtAmount(eggs[0], 'ru')}) на сковороде или сварите вкрутую.`,
          bread ? `Подавайте с ломтиком ${getFoodName(bread, 'ru')} (${bread.amount_g} г).` : 'Подавайте со свежими овощами.',
          'Отличный белковый заряд на первую половину дня.'
        ]
      };
    }
    return {
      title: 'Сбалансированный завтрак',
      time: 5,
      steps: ['Выложите порции в тарелку и подавайте к столу.']
    };
  }

  // Ukrainian fallback
  if (grain) {
    return {
      title: `Вівсяна каша${fruits.length ? ' з фруктами' : ''}`,
      time: 10,
      steps: [
        `Зваріть вівсяні пластівці (${grain.amount_g} г) на молоці чи воді 3–5 хв.`,
        fruits.length ? `Прикрасьте нарізаними фруктами (${fruits.map(f => f.name).join(', ')}).` : 'Додайте дрібку солі чи спецій за смаком.',
        'Повноцінний сніданок з повільними вуглеводами.'
      ]
    };
  }
  return {
    title: 'Збалансований сніданок',
    time: 10,
    steps: ['Зваріть або підігрійте інгредієнти та подавайте до столу.']
  };
}

function snackDish(items, lang) {
  if (!items.length) return null;
  const fruits = items.filter(i => i.category === 'fruits' || i.category === 'berries');
  const nuts = items.find(i => i.category === 'nuts_seeds');
  const dairy = items.find(i => i.category === 'dairy' || i.category === 'cheese');

  if (lang === 'de') {
    return {
      title: 'Power-Snack für zwischendurch',
      time: 5,
      steps: [
        fruits.length ? `Früchte (${fruits.map(f => getFoodName(f, 'de')).join(', ')}) waschen und portionieren.` : 'Frischen Snack vorbereiten.',
        nuts ? `Eine Handvoll ${getFoodName(nuts, 'de')} (${nuts.amount_g} g) als gesunde Fettquelle dazugeben.` : '',
        dairy ? `Dazu: ${getFoodName(dairy, 'de')} (${dairy.amount_g} g).` : '',
        'Ideal zum Mitnehmen an die Uni oder ins Büro.'
      ].filter(Boolean)
    };
  }
  if (lang === 'en') {
    return {
      title: 'Healthy Snack Bowl',
      time: 5,
      steps: [
        fruits.length ? `Wash and slice fresh fruits (${fruits.map(f => getFoodName(f, 'en')).join(', ')}).` : 'Prepare fresh snack.',
        nuts ? `Add a handful of ${getFoodName(nuts, 'en')} (${nuts.amount_g} g) for healthy fats.` : '',
        dairy ? `Pair with ${getFoodName(dairy, 'en')} (${dairy.amount_g} g).` : '',
        'Quick, convenient fuel between main meals.'
      ].filter(Boolean)
    };
  }
  if (lang === 'ru') {
    return {
      title: 'Полезный перекус',
      time: 5,
      steps: [
        fruits.length ? `Помойте и нарежьте фрукты (${fruits.map(f => getFoodName(f, 'ru')).join(', ')}).` : 'Подготовьте перекус.',
        nuts ? `Добавьте горсть ${getFoodName(nuts, 'ru')} (${nuts.amount_g} г) — источник полезных жиров.` : '',
        dairy ? `К ним — ${getFoodName(dairy, 'ru')} (${dairy.amount_g} г).` : '',
        'Удобно взять с собой в контейнере на работу или учёбу.'
      ].filter(Boolean)
    };
  }
  return {
    title: 'Корисний перекус',
    time: 5,
    steps: ['Помийте фрукти, додайте горіхи або молочний продукт та візьміть з собою.']
  };
}

function mainDish(items, lang, type = 'lunch') {
  if (!items.length) return null;
  const protein = items.find(i => ['poultry', 'meat', 'fish_seafood', 'legumes', 'eggs'].includes(i.category))
    || items.find(i => /quark|сир/i.test(i.name + ' ' + (i.n_de || '')));
  const side = items.find(i => i !== protein && (i.category === 'grains' || i.category === 'flour' || /kartoffel|картоп|reis|рис|lentil|lins|сочевиц/i.test((i.dname || i.name || '') + ' ' + (i.n_de || ''))));
  const vegs = items.filter(i => i.category === 'vegetables' && i !== side);

  const pName = protein ? getFoodName(protein, lang) : '';
  const sName = side ? getFoodName(side, lang) : '';

  if (lang === 'de') {
    const title = protein && side ? `${pName} mit ${sName}` : protein ? pName : sName || 'Warme Hauptmahlzeit';
    return {
      title,
      time: 25,
      steps: [
        protein ? `${pName} (${protein.amount_g} g) mit etwas Öl, Salz und Pfeffer in der Pfanne anbraten (ca. 6–8 Min. je Seite) oder bei 180°C im Ofen garen.` : '',
        side ? `${sName} (${side.amount_g} g) nach Packungsanleitung in leicht gesalzenem Wasser zubereiten.` : '',
        vegs.length ? `Gemüse (${vegs.map(v => getFoodName(v, 'de')).join(', ')}) dünsten oder als frischen Beilagensalat anrichten.` : '',
        'Zusammen warm anrichten. Lässt sich hervorragend vorkochen (Meal Prep).'
      ].filter(Boolean)
    };
  }

  if (lang === 'en') {
    const title = protein && side ? `${pName} with ${sName}` : protein ? pName : sName || 'Main Meal';
    return {
      title,
      time: 25,
      steps: [
        protein ? `Season ${pName} (${protein.amount_g} g) with oil, salt, and pepper; pan-sear or bake at 190°C.` : '',
        side ? `Cook ${sName} (${side.amount_g} g) according to package instructions in salted water.` : '',
        vegs.length ? `Steam vegetables (${vegs.map(v => getFoodName(v, 'en')).join(', ')}) or serve as fresh salad.` : '',
        'Plate together and serve warm. Great for meal prep.'
      ].filter(Boolean)
    };
  }

  if (lang === 'ru') {
    const title = protein && side ? `${pName} с ${sName}` : protein ? pName : sName || 'Основное блюдо';
    return {
      title,
      time: 25,
      steps: [
        protein ? `Приправьте ${pName} (${protein.amount_g} г) солью, перцем и обжарьте на сковороде или запеките в духовке.` : '',
        side ? `Отварите ${sName} (${side.amount_g} г) в подсоленной воде до готовности.` : '',
        vegs.length ? `Овощи (${vegs.map(v => getFoodName(v, 'ru')).join(', ')}) потушите или нарежьте в свежий салат.` : '',
        'Подавайте тёплым. Отлично подходит для заготовки в ланч-бокс.'
      ].filter(Boolean)
    };
  }

  return {
    title: `${pName || 'Гаряча страва'}${sName ? ' з ' + sName : ''}`,
    time: 25,
    steps: [
      `Приготуйте ${pName} (${protein?.amount_g || 150} г) на олії або запечіть у духовці.`,
      `Відваріть гарнір (${sName || 'крупу'}).`,
      'Подавайте теплим з овочами.'
    ]
  };
}

function dinnerDish(items, lang) {
  if (!items.length) return null;
  const bread = items.find(i => i.category === 'bakery');
  const cheese = items.find(i => i.category === 'cheese');
  const meat = items.find(i => ['poultry', 'meat', 'sausages', 'fish_seafood'].includes(i.category));
  const quark = items.find(i => /quark|кисломолоч|hüttenkäse|skyr/i.test(i.name + ' ' + (i.n_de || '')));
  const eggs = items.filter(i => i.category === 'eggs');
  const vegs = items.filter(i => i.category === 'vegetables');

  if (lang === 'de') {
    if (bread && (cheese || meat || eggs.length)) {
      return {
        title: 'Klassisches Deutsches Abendbrot',
        time: 8,
        steps: [
          `Vollkornbrot (${bread.amount_g} g) mit ${cheese ? getFoodName(cheese, 'de') : ''}${meat ? (cheese ? ' und ' : '') + getFoodName(meat, 'de') : ''} belegen.`,
          eggs.length ? `Dazu ein gekochtes Ei (${fmtAmount(eggs[0], 'de')}).` : '',
          vegs.length ? `Mit frischen Scheiben von ${vegs.map(v => getFoodName(v, 'de')).join(' und ')} garnieren.` : '',
          'Das traditionelle deutsche Abendessen: leicht, nährstoffreich und ohne langes Kochen.'
        ].filter(Boolean)
      };
    }
    if (quark) {
      return {
        title: `${getFoodName(quark, 'de')} zum Abend`,
        time: 5,
        steps: [
          `${getFoodName(quark, 'de')} (${quark.amount_g} g) in eine Schale geben und cremig rühren.`,
          'Liefert hochwertiges Casein-Protein für die nächtliche Muskelregeneration.',
          bread ? `Dazu eine Scheibe ${getFoodName(bread, 'de')} (${bread.amount_g} g).` : ''
        ].filter(Boolean)
      };
    }
    return mainDish(items, lang, 'dinner');
  }

  if (lang === 'en') {
    if (bread && (cheese || meat || eggs.length)) {
      return {
        title: 'German Style Evening Sandwich (Abendbrot)',
        time: 8,
        steps: [
          `Top whole grain bread (${bread.amount_g} g) with ${cheese ? getFoodName(cheese, 'en') : ''}${meat ? (cheese ? ' & ' : '') + getFoodName(meat, 'en') : ''}.`,
          eggs.length ? `Serve with boiled egg (${fmtAmount(eggs[0], 'en')}).` : '',
          vegs.length ? `Garnish with sliced fresh vegetables.` : '',
          'A classic European cold dinner: quick, balanced, and satisfying.'
        ].filter(Boolean)
      };
    }
    return mainDish(items, lang, 'dinner');
  }

  if (lang === 'ru') {
    if (bread && (cheese || meat || eggs.length)) {
      return {
        title: 'Традиционный немецкий ужин (Abendbrot)',
        time: 8,
        steps: [
          `Сделайте бутерброды из хлеба (${bread.amount_g} г) с ${cheese ? getFoodName(cheese, 'ru') : ''}${meat ? (cheese ? ' и ' : '') + getFoodName(meat, 'ru') : ''}.`,
          eggs.length ? `Сварите яйцо (${fmtAmount(eggs[0], 'ru')}).` : '',
          vegs.length ? `Добавьте свежие овощи (${vegs.map(v => getFoodName(v, 'ru')).join(', ')}).` : '',
          'Немецкий формат «Abendbrot»: питательно, быстро и не перегружает желудок на ночь.'
        ].filter(Boolean)
      };
    }
    return mainDish(items, lang, 'dinner');
  }

  return mainDish(items, lang, 'dinner');
}

/* ─── Gemini AI Recipes ──────────────────────────────────────── */
const GEMINI_MODELS = [
  'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'
];

export async function geminiRecipes({ apiKey, model, menu, profile, mealNames, lang = currentLang }) {
  const goalMap = {
    de: { loss: 'Gewichtsverlust (Fettabbau)', maintain: 'Gewicht halten', gain: 'Muskelaufbau' },
    en: { loss: 'weight loss', maintain: 'maintenance', gain: 'muscle gain' },
    ru: { loss: 'похудение', maintain: 'поддержание формы', gain: 'набор массы' },
    uk: { loss: 'схуднення', maintain: 'підтримка ваги', gain: 'набір маси' }
  };
  const goal = goalMap[lang]?.[profile.goal] || 'healthy diet';
  const parts = Object.entries(mealNames).map(([k, title]) => {
    const it = menu.filter(i => i.meal === k);
    return it.length ? `${title.toUpperCase()}:\n` + it.map(i => `  • ${getFoodName(i, lang)} — ${fmtAmount(i, lang)}`).join('\n') : '';
  }).filter(Boolean).join('\n\n');

  const langInstruction = lang === 'de'
    ? 'Schreibe auf Deutsch, kurz, freundlich und praxisnah für den Alltag in Deutschland.'
    : lang === 'en'
    ? 'Write in English, concise, friendly, and practical.'
    : lang === 'ru'
    ? 'Пиши на русском языке, кратко, дружелюбно и практично.'
    : 'Пиши українською мовою, коротко і дружньо.';

  const prompt = `You are a friendly nutritionist and chef. Goal: ${goal}. Budget: ${profile.budget} ${profile.currency || 'EUR'}/day.
The optimal menu contains these ingredients:
${parts}

Please propose 1 simple, tasty dish for each meal using ONLY these ingredients (plus salt, pepper, water, basic spices).
Format for each meal in Markdown:
### [Meal]: [Dish Name]
**Time:** X min
**Ingredients:** list with amounts
**Instructions:** 3–4 numbered steps
End with 2 encouraging sentences on nutritional value.
${langInstruction}`;

  const models = [model, ...GEMINI_MODELS].filter((m, i, a) => m && a.indexOf(m) === i);
  let lastErr;
  for (const m of models) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastErr = new Error(data?.error?.message || `HTTP ${res.status}`);
        if ([404, 429, 503].includes(res.status)) continue;
        throw lastErr;
      }
      const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
      if (!text) { lastErr = new Error('Empty response'); continue; }
      return { text, model: m };
    } catch (e) { lastErr = e; if (e instanceof TypeError) break; }
  }
  throw lastErr || new Error('Gemini API unavailable');
}

export function miniMarkdown(md) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = esc(md).split('\n');
  let html = '', inUl = false, inOl = false;
  const close = () => { if (inUl) html += '</ul>'; if (inOl) html += '</ol>'; inUl = inOl = false; };
  for (let l of lines) {
    l = l.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    let m;
    if ((m = l.match(/^#{1,4}\s+(.*)/))) { close(); html += `<h4>${m[1]}</h4>`; }
    else if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (!inUl) { close(); html += '<ul>'; inUl = true; } html += `<li>${m[1]}</li>`; }
    else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (!inOl) { close(); html += '<ol>'; inOl = true; } html += `<li>${m[1]}</li>`; }
    else if (l.trim()) { close(); html += `<p>${l}</p>`; }
    else close();
  }
  close();
  return html;
}
