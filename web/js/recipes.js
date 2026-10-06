/* ═══════════════════════════════════════════════════════════════
   recipes.js — офлайн-генератор простих страв з продуктів раціону.
   Працює без інтернету і без AI: правила на основі категорій продуктів.
   Додатково — генерація рецептів через Google Gemini (ключ користувача).
   ═══════════════════════════════════════════════════════════════ */

const lc = s => s.toLowerCase();
export const shortName = n => n.replace(/\s*\(\d+ шт.*?\)/g, '').replace(/\s*\(([^)]*)\)/g, ', $1').replace(/\s+/g, ' ').trim();
const low = n => lc(n.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim());
const has = (items, ...kws) => items.find(i => kws.some(k => lc(i.name).includes(k)));
const byCat = (items, ...cats) => items.filter(i => cats.includes(i.category));
// знахідний відмінок для простих назв: «морква» → «моркву», «цибуля ріпчаста» → «цибулю ріпчасту»
const acc = s => s.split(' ').map(w => w.replace(/а$/, 'у').replace(/я$/, 'ю')).join(' ');
const INSTR = [['гречан', 'гречкою'], ['рис бур', 'бурим рисом'], ['рис', 'рисом'], ['булгур', 'булгуром'],
  ['макарон', 'макаронами'], ['спагет', 'спагеті'], ['картопл', 'картоплею'], ['кус-кус', 'кус-кусом'],
  ['пшон', 'пшоном'], ['перлов', 'перловкою'], ['ячн', 'ячною кашею'], ['квасол', 'квасолею'],
  ['сочевиц', 'сочевицею'], ['нут', 'нутом'], ['горох', 'горохом'], ['кіноа', 'кіноа']];
const instr = name => { const n = low(name); const f = INSTR.find(([k]) => n.includes(k)); return f ? f[1] : n; };
const eggs = g => { const n = Math.max(1, Math.round(g / 60)); return `${n} ${n === 1 ? 'яйце' : n < 5 ? 'яйця' : 'яєць'}`; };
const list = arr => arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' та ' + arr[arr.length - 1];

export function fmtAmount(item) {
  const n = lc(item.name);
  if (n.includes('яйце куряче')) {
    const pcs = Math.max(1, Math.round(item.amount_g / 60));
    return `${pcs} шт (${item.amount_g} г)`;
  }
  if (item.liquid || /молоко|кефір|ряжанк|йогурт|олія/.test(n)) {
    if (n.includes('олія')) {
      const tbsp = item.amount_g / 15;
      return tbsp >= 0.75 ? `${item.amount_g} мл (≈${Math.round(tbsp)} ст. л.)` : `${item.amount_g} мл (≈${Math.max(1, Math.round(item.amount_g / 5))} ч. л.)`;
    }
    return `${item.amount_g} мл`;
  }
  return `${item.amount_g} г`;
}

function sideSteps(side) {
  const n = lc(side.name);
  const dry = n.includes('(сух') || n.includes('крупа');
  const g = side.amount_g;
  if (n.includes('гречан')) return dry
    ? `Промийте ${g} г гречки, залийте водою 1:2, посоліть і варіть під кришкою 15 хв.`
    : `Зваріть гречку (готової — ${g} г: це ≈${Math.round(g / 2.5)} г сухої крупи, 15 хв на слабкому вогні).`;
  if (n.includes('рис')) return dry
    ? `Промийте ${g} г рису, залийте водою 1:2 і варіть 15–18 хв, не помішуючи.`
    : `Зваріть рис (готового — ${g} г: ≈${Math.round(g / 3)} г сухого, 15–18 хв).`;
  if (n.includes('булгур')) return `Залийте булгур окропом 1:2, накрийте і залиште на 15 хв (готового — ${g} г).`;
  if (n.includes('макарон') || n.includes('спагет')) return `Відваріть макарони в підсоленій воді 8–10 хв (готових — ${g} г: ≈${Math.round(g / 2.3)} г сухих).`;
  if (n.includes('картопл')) return `Наріжте ${g} г картоплі часточками і відваріть 18–20 хв або запечіть разом з основною стравою.`;
  if (n.includes('хліб')) return `Подавайте з хлібом (${g} г).`;
  return `Приготуйте ${low(side.name)} (${g} г) за інструкцією на упаковці.`;
}

function proteinDish(p) {
  const n = lc(p.name);
  if (n.includes('фарш')) return { verb: 'Соус з фаршем', time: 25, step: `Обсмажте ${p.amount_g} г фаршу на олії 8–10 хв, розбиваючи грудочки лопаткою, посоліть і поперчіть.` };
  if (n.includes('грудк') || n.includes('стегно') || n.includes('курк') || n.includes('індич'))
    return { verb: `Запечена ${low(p.name).replace(/^індиче стегно/, 'індичка').replace(/^куряче стегно/, 'курка')}`, time: 35, step: `Натріть ${p.amount_g} г м'яса сіллю, перцем і краплею олії. Запікайте при 200 °C 25 хв (або смажте на сковороді по 6–7 хв з кожного боку).` };
  if (p.category === 'meat') return { verb: `Тушкована ${low(p.name)}`, time: 45, step: `Наріжте ${p.amount_g} г м'яса шматочками, обсмажте 5 хв, додайте трохи води і тушкуйте під кришкою 30 хв.` };
  if (p.category === 'fish_seafood') return { verb: `Запечена риба (${low(p.name)})`, time: 25, step: `Посоліть ${p.amount_g} г філе, загорніть у фольгу і запікайте 15–18 хв при 200 °C.` };
  if (p.category === 'legumes') return { verb: `Рагу з ${instr(p.name)}`, time: 20, step: `Прогрійте ${p.amount_g} г готових бобових з овочами 5–7 хв, посоліть, додайте спеції за смаком.` };
  if (p.category === 'eggs') return { verb: 'Омлет', time: 10, step: `Збийте ${eggs(p.amount_g)} з дрібкою солі, вилийте на розігріту сковороду і готуйте під кришкою 4–5 хв.` };
  if (n.includes('тофу')) return { verb: 'Смажений тофу', time: 15, step: `Наріжте ${p.amount_g} г тофу кубиками й обсмажте до рум'яної скоринки 6–8 хв.` };
  if (n.includes('сир кисломолоч')) return { verb: 'Кисломолочний сир', time: 5, step: `Викладіть ${p.amount_g} г кисломолочного сиру в миску.` };
  if (p.category === 'cheese') return { verb: `Тарілка з сиром`, time: 5, step: `Наріжте ${p.amount_g} г сиру скибочками.` };
  return { verb: shortName(p.name), time: 15, step: `Приготуйте ${low(p.name)} (${p.amount_g} г).` };
}

function vegSteps(vegs, oil) {
  if (!vegs.length) return [];
  const fresh = vegs.filter(v => /огір|томат|перець|редис|салат/.test(lc(v.name)));
  const cook = vegs.filter(v => !fresh.includes(v));
  const steps = [];
  if (cook.length) steps.push(`Наріжте ${list(cook.map(v => `${acc(low(v.name))} (${v.amount_g} г)`))} і тушкуйте на ${oil ? 'олії' : 'сковороді з ложкою води'} 8–10 хв.`);
  if (fresh.length) steps.push(`Наріжте салат: ${list(fresh.map(v => `${low(v.name)} (${v.amount_g} г)`))}${oil && !cook.length ? ', заправте олією' : ''}, посоліть.`);
  return steps;
}

function mainMeal(items) {
  const proteinCats = ['poultry', 'meat', 'fish_seafood', 'legumes', 'eggs', 'sausages'];
  let protein = items.find(i => proteinCats.includes(i.category) && !lc(i.name).includes('стручк'))
    || has(items, 'тофу', 'сир кисломолоч', 'сир адигей') || items.find(i => i.category === 'cheese');
  const side = items.find(i => i !== protein && (i.category === 'grains' || i.category === 'flour' || /картопл|булгур/.test(lc(i.name))))
    || items.find(i => i !== protein && i.category === 'bakery');
  const vegs = items.filter(i => i.category === 'vegetables' && i !== side);
  const oil = items.find(i => i.category === 'oils_fats');
  const steps = [];
  let title = 'Страва дня';
  let time = 20;
  if (protein) {
    const d = proteinDish(protein);
    time = d.time;
    title = d.verb;
    if (side && side.category !== 'bakery') title += ` з ${instr(side.name)}`;
    if (side && side.category !== 'bakery') steps.push(sideSteps(side));
    steps.push(d.step);
    if (lc(protein.name).includes('фарш') && vegs.some(v => /томат/.test(lc(v.name)))) {
      const t = vegs.find(v => /томат/.test(lc(v.name)));
      steps.push(`Додайте до фаршу нарізані томати (${t.amount_g} г) та цибулю, тушкуйте 10 хв — вийде соус «болоньєзе».`);
      vegs.splice(vegs.indexOf(t), 1);
    }
  } else if (side) {
    title = shortName(side.name);
    steps.push(sideSteps(side));
  }
  steps.push(...vegSteps(vegs, oil));
  if (side && side.category === 'bakery') steps.push(sideSteps(side));
  const bread = items.find(i => i.category === 'bakery' && i !== side);
  if (bread) steps.push(`Доповніть ${low(bread.name)} (${bread.amount_g} г).`);
  const rest = items.filter(i => ![protein, side, oil, bread, ...vegs].includes(i));
  if (rest.length) steps.push(`Окремо: ${list(rest.map(i => `${low(i.name)} — ${fmtAmount(i)}`))}.`);
  steps.push('Подавайте теплим. Порцію можна приготувати з вечора і взяти з собою в контейнері.');
  return { title, time, steps };
}

function breakfast(items) {
  const grain = items.find(i => i.category === 'grains');
  const milk = has(items, 'молоко');
  const egg = byCat(items, 'eggs')[0];
  const fruit = byCat(items, 'fruits', 'berries')[0];
  const butter = has(items, 'масло вершк');
  const nuts = byCat(items, 'nuts_seeds')[0];
  const cottage = has(items, 'сир кисломолоч');
  const yog = has(items, 'йогурт', 'кефір', 'ряжанк');
  const steps = [];
  if (grain) {
    const n = lc(grain.name);
    const dry = n.includes('(сух') || n.includes('крупа');
    const name = n.includes('вівс') ? 'Вівсянка' : n.includes('гречан') ? 'Гречана каша' : n.includes('пшон') ? 'Пшоняна каша' : n.includes('рис') ? 'Рисова каша' : shortName(grain.name);
    const title = `${name}${milk ? ' на молоці' : ''}${fruit ? ` з ${low(fruit.name).split(' ')[0].replace(/ша$/, 'шею').replace(/а$/, 'ою').replace(/н$/, 'ном').replace(/о$/, 'ом')}` : ''}`;
    steps.push(dry
      ? `Залийте ${grain.amount_g} г ${n.includes('вівс') ? 'пластівців' : 'крупи'} ${milk ? `молоком (${milk.amount_g} мл) та ` : ''}водою до потрібної густоти і варіть ${n.includes('вівс') ? '5' : '15'} хв, помішуючи.`
      : `Зваріть кашу (готової — ${grain.amount_g} г)${milk ? `, наприкінці влийте ${milk.amount_g} мл молока` : ''}.`);
    if (butter) steps.push(`Додайте ${butter.amount_g} г вершкового масла.`);
    if (fruit) steps.push(`Наріжте ${acc(low(fruit.name))} (${fruit.amount_g} г) і викладіть зверху.`);
    if (nuts) steps.push(`Посипте подрібненими горіхами (${nuts.amount_g} г).`);
    if (egg) steps.push(`Окремо зваріть яйця (${fmtAmount(egg)}) — 8 хв після закипання.`);
    if (yog) steps.push(`Запийте: ${low(yog.name)} — ${fmtAmount(yog)}.`);
    return { title, time: dry ? 12 : 7, steps: steps.concat(rest(items, [grain, milk, butter, fruit, nuts, egg, yog])) };
  }
  if (egg) return mainMeal(items);
  if (cottage) {
    const sour = has(items, 'сметан');
    steps.push(`Викладіть ${cottage.amount_g} г кисломолочного сиру в миску${sour ? ` і заправте сметаною (${sour.amount_g} г)` : ''}.`);
    if (fruit) steps.push(`Додайте нарізаний фрукт: ${low(fruit.name)} — ${fruit.amount_g} г.`);
    return { title: 'Сир зі сметаною та фруктами', time: 5, steps: steps.concat(rest(items, [cottage, sour, fruit])) };
  }
  return snack(items);
}

function rest(items, used) {
  const r = items.filter(i => !used.includes(i));
  return r.length ? [`Також: ${list(r.map(i => `${low(i.name)} — ${fmtAmount(i)}`))}.`] : [];
}

function snack(items) {
  const fruits = byCat(items, 'fruits', 'berries');
  const drink = has(items, 'кефір', 'йогурт', 'ряжанк', 'молоко');
  const nuts = byCat(items, 'nuts_seeds')[0];
  const cheese = byCat(items, 'cheese')[0];
  const cottage = has(items, 'сир кисломолоч');
  const steps = [];
  let title = 'Перекус';
  if (drink && fruits.length && has(fruits, 'банан')) {
    title = 'Смузі з бананом';
    steps.push(`Збийте блендером: ${low(drink.name)} (${fmtAmount(drink)}), ${list(fruits.map(f => `${low(f.name)} (${f.amount_g} г)`))}.`);
  } else if (drink && fruits.length) {
    title = `${shortName(drink.name).split(' ')[0]} з фруктами`;
    steps.push(`Наріжте ${list(fruits.map(f => `${acc(low(f.name))} (${f.amount_g} г)`))}. До них — ${low(drink.name)} (${fmtAmount(drink)}).`);
  } else if (fruits.length) {
    title = 'Фруктовий перекус';
    steps.push(`Помийте та наріжте: ${list(fruits.map(f => `${low(f.name)} (${f.amount_g} г)`))}.`);
  }
  if (nuts) steps.push(`Додайте жменю горіхів: ${low(nuts.name)} — ${nuts.amount_g} г.`);
  if (cheese) steps.push(`Наріжте скибочками: ${low(cheese.name)} — ${cheese.amount_g} г (зручно взяти на пари).`);
  if (cottage) steps.push(`Кисломолочний сир (${cottage.amount_g} г) можна змішати з фруктами.`);
  return { title, time: 5, steps: steps.concat(rest(items, [...fruits, drink, nuts, cheese, cottage])) };
}

/** Повертає { meal: {title, time, steps[]} } для всіх прийомів їжі. */
export function buildDishes(menu) {
  const g = { breakfast: [], snack: [], lunch: [], dinner: [] };
  menu.forEach(i => (g[i.meal] || g.lunch).push(i));
  const out = {};
  if (g.breakfast.length) out.breakfast = breakfast(g.breakfast);
  if (g.snack.length) out.snack = snack(g.snack);
  if (g.lunch.length) out.lunch = mainMeal(g.lunch);
  if (g.dinner.length) {
    const d = g.dinner;
    const onlyLight = !d.some(i => ['poultry', 'meat', 'fish_seafood', 'legumes'].includes(i.category));
    out.dinner = onlyLight && has(d, 'сир кисломолоч') && !byCat(d, 'eggs').length
      ? (() => {
        const c = has(d, 'сир кисломолоч');
        const vegs = byCat(d, 'vegetables');
        return {
          title: 'Сир з овочевим салатом', time: 10,
          steps: [`Викладіть ${c.amount_g} г кисломолочного сиру, посоліть, додайте зелень або часник за смаком.`,
            ...vegSteps(vegs, null), ...rest(d, [c, ...vegs])],
        };
      })()
      : mainMeal(d);
  }
  return out;
}

/* ─── Google Gemini (необов'язково, ключ користувача) ─────────── */
export const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.5-flash'];

export async function geminiRecipes({ apiKey, model, menu, profile, mealNames }) {
  const goal = { loss: 'схуднення', maintain: 'підтримка ваги', gain: 'набір маси' }[profile.goal] || 'здорове харчування';
  const parts = Object.entries(mealNames).map(([k, title]) => {
    const it = menu.filter(i => i.meal === k);
    return it.length ? `${title.toUpperCase()}:\n` + it.map(i => `  • ${i.name} — ${fmtAmount(i)}`).join('\n') : '';
  }).filter(Boolean).join('\n\n');
  const prompt = `Ти дружній дієтолог-кухар для студента. Мета: ${goal}. Бюджет: ${profile.budget} грн/день.
Система оптимізації підібрала такий набір продуктів на день:
${parts}

Запропонуй по одній простій страві на кожен прийом їжі ТІЛЬКИ з цих продуктів (сіль, перець, вода, спеції — можна).
У студента мало часу і базові навички. Формат для кожного прийому їжі (Markdown):
### [Прийом їжі]: [Назва страви]
**Час:** X хв
**Інгредієнти:** список з вагою
**Приготування:** 3–5 нумерованих кроків
Наприкінці — 2 речення про користь раціону. Пиши українською, коротко і дружньо.`;

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
      if (!text) { lastErr = new Error('Порожня відповідь моделі'); continue; }
      return { text, model: m };
    } catch (e) { lastErr = e; if (e instanceof TypeError) break; }
  }
  throw lastErr || new Error('Gemini недоступний');
}

/** Мінімальний безпечний Markdown → HTML (заголовки, жирний, списки). */
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
