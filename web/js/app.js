/* ═══════════════════════════════════════════════════════════════
   app.js — інтерфейс DietOpt v3 (без сервера, все на пристрої)
   ═══════════════════════════════════════════════════════════════ */

import {
  calculateNorms, filterProducts, optimizeCandidates, optimizeBasic, buildWeek,
  aggregateShopping, MEAL_ORDER, MEAL_NAMES,
} from './optimizer.js';
import { buildDishes, fmtAmount, shortName, geminiRecipes, miniMarkdown } from './recipes.js';

/* ─── Утиліти ───────────────────────────────────────────────── */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uah = v => `${(Math.round(v * 100) / 100).toLocaleString('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} грн`;
const int = v => Math.round(v).toLocaleString('uk-UA');
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 16)));

const mem = {};
const store = {
  get(k, def) { try { const v = localStorage.getItem('dietopt.' + k); return v == null ? def : JSON.parse(v); } catch { return k in mem ? mem[k] : def; } },
  set(k, v) { try { localStorage.setItem('dietopt.' + k, JSON.stringify(v)); } catch { mem[k] = v; } },
  del(k) { try { localStorage.removeItem('dietopt.' + k); } catch { delete mem[k]; } },
};

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}

const ICON = {
  breakfast: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 18h16M7 18a5 5 0 0 1 10 0M12 4v3M4.9 9.9l1.4 1.4M19.1 9.9l-1.4 1.4"/></svg>',
  snack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7c-2-2-7-1.5-7 4 0 4 3 9 5 9 1 0 1.3-.5 2-.5s1 .5 2 .5c2 0 5-5 5-9 0-5.5-5-6-7-4Z"/><path d="M12 7c0-2 1-3.5 3-4"/></svg>',
  lunch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  dinner: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14l-1.5 11.5a2 2 0 0 1-2 1.5h-7a2 2 0 0 1-2-1.5Z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14l-1.5 11.5a2 2 0 0 1-2 1.5h-7a2 2 0 0 1-2-1.5Z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
};

const ALLERGY_CHIPS = [
  ['молоко', 'Молочне'], ['глютен', 'Глютен'], ['горіхи', 'Горіхи'], ['яйця', 'Яйця'], ['риба', 'Риба'],
  ['морепродукти', 'Морепродукти'], ['соя', 'Соя'], ['цитрусові', 'Цитрусові'], ['гриби', 'Гриби'], ['свинина', 'Свинина'],
];
const DAY_NAMES = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця", 'Субота', 'Неділя'];

/* ─── Стан ──────────────────────────────────────────────────── */
const S = {
  data: null, cats: {}, profile: null, norms: null,
  candidates: [], variant: 0, basic: null, view: 'opt', seed: Date.now(),
  banned: store.get('banned', []), prices: store.get('prices', {}),
  list: store.get('list', { items: [], source: '' }),
  saved: store.get('saved', []), ai: store.get('ai', { key: '', model: 'gemini-3.5-flash-lite' }),
  week: null, aiText: null,
};
const current = () => (S.view === 'basic' && S.basic ? S.basic : S.candidates[S.variant]);

/* ─── Роутер ────────────────────────────────────────────────── */
const PAGES = ['plan', 'week', 'list', 'foods', 'more'];
function route() {
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const page = PAGES.includes(path) ? path : 'plan';
  $$('.page').forEach(p => { p.hidden = p.dataset.page !== page; });
  $$('[data-nav]').forEach(a => { if (a.dataset.nav === page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (page === 'list') renderList();
  if (page === 'foods') renderFoods();
  if (page === 'more') renderMore();
  if (page === 'week') renderWeek();
  if (page === 'plan' && query) {
    const p = new URLSearchParams(query).get('p');
    if (p) {
      try {
        const prof = JSON.parse(decodeURIComponent(escape(atob(p.replace(/-/g, '+').replace(/_/g, '/')))));
        writeForm(prof); history.replaceState(null, '', '#/plan'); runPlan();
      } catch { toast('Не вдалося відкрити посилання'); }
    }
  }
  window.scrollTo({ top: 0 });
}

/* ─── Форма профілю ─────────────────────────────────────────── */
function initForm() {
  const chips = $('#allergy-chips');
  chips.innerHTML = ALLERGY_CHIPS.map(([v, l]) => `<button type="button" class="chip chip--warn" data-allergy="${v}" aria-pressed="false">${l}</button>`).join('');
  chips.addEventListener('click', e => {
    const b = e.target.closest('[data-allergy]'); if (!b) return;
    b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
  });
  const f = $('#profile-form');
  const out = $('#budget-out');
  const sync = () => { out.textContent = `${f.budget.value} грн`; };
  f.budget.addEventListener('input', sync);
  f.addEventListener('submit', e => { e.preventDefault(); runPlan(); });
  const saved = store.get('profile', null);
  if (saved) writeForm(saved);
  sync();
}

function readForm() {
  const f = $('#profile-form');
  const chips = $$('#allergy-chips [aria-pressed="true"]').map(b => b.dataset.allergy);
  const extra = f.allergies_extra.value.split(',').map(s => s.trim()).filter(Boolean);
  return {
    gender: f.gender.value, age: +f.age.value, height: +f.height.value, weight: +f.weight.value,
    activity_level: f.activity_level.value, goal: f.goal.value, budget: +f.budget.value,
    diet_type: f.diet_type.value, allergy_chips: chips, allergies_extra: f.allergies_extra.value.trim(),
    allergies: [...chips, ...extra].join(', '),
  };
}

function writeForm(p) {
  const f = $('#profile-form');
  ['age', 'height', 'weight', 'budget', 'activity_level'].forEach(k => { if (p[k] != null) f[k].value = p[k]; });
  ['gender', 'goal', 'diet_type'].forEach(k => { const r = f.querySelector(`[name="${k}"][value="${p[k]}"]`); if (r) r.checked = true; });
  f.allergies_extra.value = p.allergies_extra || '';
  $$('#allergy-chips [data-allergy]').forEach(b => b.setAttribute('aria-pressed', (p.allergy_chips || []).includes(b.dataset.allergy) ? 'true' : 'false'));
  $('#budget-out').textContent = `${f.budget.value} грн`;
}

function validate(p) {
  const f = $('#profile-form');
  const rules = [['age', 14, 80, 'Вік — від 14 до 80 років'], ['height', 140, 220, 'Зріст — від 140 до 220 см'], ['weight', 40, 200, 'Вага — від 40 до 200 кг']];
  for (const [k, lo, hi, msg] of rules) {
    const bad = !(p[k] >= lo && p[k] <= hi);
    f[k].setAttribute('aria-invalid', bad ? 'true' : 'false');
    if (bad) { f[k].focus(); return msg; }
  }
  return null;
}

/* ─── Основний розрахунок ───────────────────────────────────── */
async function runPlan({ keepVariant = false, newSeed = true } = {}) {
  const p = readForm();
  const err = validate(p);
  const errEl = $('#form-error');
  errEl.hidden = !err; errEl.textContent = err || '';
  if (err) return;
  const btn = $('#run-btn');
  btn.classList.add('is-loading');
  await nextFrame();
  try {
    S.profile = p; store.set('profile', p);
    S.norms = calculateNorms(p);
    if (newSeed) S.seed = Date.now();
    const products = filterProducts(S.data.products, p, { bannedIds: S.banned, priceOverrides: S.prices });
    S.candidates = optimizeCandidates(products, p, S.norms, S.seed);
    S.basic = S.candidates.length ? optimizeBasic(products, p, S.norms, S.seed) : null;
    if (!keepVariant) S.variant = 0;
    S.variant = Math.min(S.variant, Math.max(0, S.candidates.length - 1));
    S.view = 'opt'; S.aiText = null; S.week = null;
    if (!S.candidates.length) {
      const probe = optimizeCandidates(products, { ...p, budget: 100000 }, S.norms, S.seed);
      S.minCost = probe[0]?.total_cost ?? null;
    }
    renderPlan();
    if (matchMedia('(max-width: 960px)').matches) $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    console.error(e);
    errEl.hidden = false; errEl.textContent = 'Сталася помилка під час розрахунку. Спробуйте ще раз.';
  } finally {
    btn.classList.remove('is-loading');
  }
}

/* ─── Рендер раціону ────────────────────────────────────────── */
function renderPlan() {
  const out = $('#plan-output');
  $('#plan-empty').hidden = true; out.hidden = false;
  const n = S.norms, p = S.profile;

  if (!S.candidates.length) {
    const min = S.minCost;
    out.innerHTML = `
      <div class="card">
        <p class="eyebrow">Розв'язку немає</p>
        <h2 class="h-page" style="margin:.25rem 0 .75rem">Бюджету ${uah(p.budget)} замало для ваших норм</h2>
        <p class="muted">Алгоритм перебрав усі шаблони меню, але жоден не вкладається в бюджет при дотриманні ${int(n.target_calories)} ккал і норм білків, жирів та вуглеводів.</p>
        ${min ? `<div class="notice notice--ok" style="margin-top:1rem"><span>Мінімальна вартість повноцінного раціону для вас — <b class="num">${uah(min)}</b> на день.</span></div>` : `<div class="notice notice--warn" style="margin-top:1rem">Забагато обмежень: спробуйте зняти частину алергенів або змінити тип харчування.</div>`}
        <div class="actions" style="margin-top:1rem">
          ${min ? `<button class="btn btn--primary" data-act="set-budget" data-v="${Math.ceil(min / 10) * 10}">Встановити бюджет ${Math.ceil(min / 10) * 10} грн</button>` : ''}
          <button class="btn" data-act="edit">Змінити профіль</button>
        </div>
      </div>`;
    return;
  }

  const r = current();
  const opt = S.candidates[S.variant];
  const total = S.candidates.length;
  const dishes = buildDishes(r.menu);
  const savings = S.basic ? S.basic.total_cost - opt.total_cost : 0;
  const goalText = { loss: 'схуднення', maintain: 'підтримки ваги', gain: 'набору маси' }[p.goal];

  out.innerHTML = `
    <div class="result-head">
      <div>
        <p class="eyebrow">Меню на день · ${esc(r.template)}</p>
        <h2 class="h-page">${uah(r.total_cost)} за ${int(r.total_calories)} ккал</h2>
      </div>
      <div class="row-gap no-print">
        <div class="tabs" role="tablist" aria-label="Тип раціону">
          <button role="tab" aria-selected="${S.view === 'opt'}" data-act="view" data-v="opt">Найдешевший <span class="num">${uah(opt.total_cost)}</span></button>
          <button role="tab" aria-selected="${S.view === 'basic'}" data-act="view" data-v="basic" ${S.basic ? '' : 'disabled'}>Звичайний <span class="num">${S.basic ? uah(S.basic.total_cost) : '—'}</span></button>
        </div>
      </div>
    </div>

    ${opt.relaxed ? `<div class="notice notice--warn"><span>Для ваших параметрів довелося трохи <b>послабити обмеження</b> (більші порції, ширший допуск КБЖУ) — строгий розв'язок не існує.</span></div>` : ''}

    <div class="kpis">
      <div class="kpi kpi--accent"><span class="kpi__label">Вартість на день</span><span class="kpi__value">${uah(r.total_cost)}</span><span class="kpi__sub">з бюджету ${uah(p.budget)}</span></div>
      <div class="kpi"><span class="kpi__label">Калорії</span><span class="kpi__value">${int(r.total_calories)}<small>ккал</small></span><span class="kpi__sub">ціль ${int(n.target_calories)} для ${goalText}</span></div>
      <div class="kpi"><span class="kpi__label">Економія</span><span class="kpi__value ${savings > 0 ? 'good' : ''}">${savings > 0 ? uah(savings) : '—'}</span><span class="kpi__sub">${savings > 0 ? `≈${int(savings * 30)} грн на місяць` : 'порівняно зі звичайним'}</span></div>
      <div class="kpi"><span class="kpi__label">Білки</span><span class="kpi__value">${int(r.total_protein)}<small>г</small></span><span class="kpi__sub">норма ${int(n.protein_min)}–${int(n.protein_max)} г</span></div>
    </div>

    <div class="card">
      <div class="card__head">
        <h3 class="h-section">Меню</h3>
        ${S.view === 'opt' ? `<div class="variant no-print">
          <button class="icon-btn" data-act="variant" data-v="-1" aria-label="Попередній варіант" ${S.variant === 0 ? 'disabled' : ''}>${ICON.prev}</button>
          <span class="num">варіант ${S.variant + 1}/${total}</span>
          <button class="icon-btn" data-act="variant" data-v="1" aria-label="Інший варіант" ${S.variant >= total - 1 ? 'disabled' : ''}>${ICON.next}</button>
        </div>` : ''}
      </div>
      <div class="meals">${MEAL_ORDER.map(m => mealHTML(m, r.menu.filter(i => i.meal === m), dishes[m])).join('')}</div>
      <p class="xs muted" style="margin-top:.75rem">Натисніть × біля продукту, якщо не хочете його їсти — меню перерахується без нього.</p>
    </div>

    <div class="actions no-print">
      <button class="btn btn--primary" data-act="to-list">${ICON.cart} У список покупок</button>
      <button class="btn" data-act="share">${ICON.share} Поділитися</button>
      <button class="btn" data-act="save">${ICON.save} Зберегти</button>
      <button class="btn" data-act="print">${ICON.print} Друк / PDF</button>
    </div>

    <div class="card">
      <div class="card__head"><h3 class="h-section">Баланс КБЖУ</h3><span class="xs muted">пунктир — ваша норма</span></div>
      ${macrosHTML(r, n)}
    </div>

    <div class="card">
      <div class="card__head">
        <h3 class="h-section">Що приготувати</h3>
        <button class="btn btn--sm no-print" data-act="ai">${ICON.spark} Рецепти від AI</button>
      </div>
      <div id="ai-out">${S.aiText ? `<div class="ai-box">${miniMarkdown(S.aiText.text)}<p class="xs muted">Згенеровано ${esc(S.aiText.model)}</p></div>` : `<div class="dishes">${MEAL_ORDER.filter(m => dishes[m]).map(m => dishHTML(m, dishes[m])).join('')}</div>`}</div>
    </div>

    ${S.basic ? compareHTML(opt, S.basic) : ''}

    <div class="card">
      <details class="more" style="border:0;padding:0">
        <summary>Ваші норми й методика розрахунку</summary>
        <div class="norms">
          <div class="norm"><b>${int(n.bmr)}</b><span>BMR, базовий обмін, ккал</span></div>
          <div class="norm"><b>${int(n.tdee)}</b><span>TDEE, витрата за добу, ккал</span></div>
          <div class="norm"><b>${int(n.target_calories)}</b><span>Цільова калорійність</span></div>
          <div class="norm"><b>${n.bmi}</b><span>ІМТ — ${esc(n.bmi_status.toLowerCase())}</span></div>
          <div class="norm"><b>${int(n.fat_min)}–${int(n.fat_max)} г</b><span>Жири</span></div>
          <div class="norm"><b>${int(n.carbs_min)}–${int(n.carbs_max)} г</b><span>Вуглеводи</span></div>
          <div class="norm"><b>${(n.water_ml / 1000).toFixed(1)} л</b><span>Вода (35 мл × кг)</span></div>
          <div class="norm"><b>${r.solve_time_ms ?? '—'} мс</b><span>Час оптимізації</span></div>
        </div>
        <p class="xs muted" style="margin-top:.75rem">BMR — формула Міффліна — Сан Жеора (1990); TDEE = BMR × коефіцієнт активності (PAL). Меню підбирається задачею лінійного програмування: мінімізувати вартість за умов калорійність ±10%, білки/жири/вуглеводи в межах норми ±20%, порції — у реалістичних межах. Рекомендації інформаційні й не замінюють консультацію лікаря.</p>
      </details>
    </div>`;
}

function mealHTML(meal, items, dish) {
  if (!items.length) return '';
  const kcal = items.reduce((s, i) => s + i.calories, 0);
  const cost = items.reduce((s, i) => s + i.cost, 0);
  return `<section class="meal">
    <header class="meal__head">
      <div class="meal__title"><span class="meal__icon">${ICON[meal]}</span>
        <div style="min-width:0"><div class="meal__name">${MEAL_NAMES[meal]}</div>${dish ? `<div class="meal__dish">${esc(dish.title)}</div>` : ''}</div></div>
      <div class="meal__meta">${int(kcal)} ккал<br>${uah(cost)}</div>
    </header>
    <ul class="items">${items.map(i => `
      <li class="item">
        <div><div class="item__name">${esc(shortName(i.name))}</div>
          <div class="item__macro">${int(i.calories)} ккал · Б ${i.protein} · Ж ${i.fat} · В ${i.carbs}</div></div>
        <div class="item__amt">${esc(fmtAmount(i))}<small>${uah(i.cost)}</small></div>
        <button class="item__x no-print" data-act="ban" data-id="${i.id}" aria-label="Виключити ${esc(i.name)}" title="Не їм цей продукт">${ICON.x}</button>
      </li>`).join('')}</ul>
  </section>`;
}

function dishHTML(meal, d) {
  return `<article class="dish"><div class="dish__meal">${MEAL_NAMES[meal]}</div>
    <h4 class="dish__title">${esc(d.title)}</h4><span class="dish__time">≈ ${d.time} хв</span>
    <ol>${d.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></article>`;
}

function macrosHTML(r, n) {
  const kP = r.total_protein * 4, kF = r.total_fat * 9, kC = r.total_carbs * 4;
  const sum = kP + kF + kC || 1;
  const C = 2 * Math.PI * 52;
  let off = 0;
  const seg = (v, col) => { const len = v / sum * C; const s = `<circle cx="66" cy="66" r="52" fill="none" stroke="${col}" stroke-width="16" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}"/>`; off += len; return s; };
  const bar = (label, val, min, max, col) => {
    const scale = Math.max(max * 1.25, val * 1.05);
    return `<div><div class="bar__top"><span><i class="sw" style="background:${col}"></i>${label}</span><span class="num">${int(val)} г · норма ${int(min)}–${int(max)}</span></div>
      <div class="bar__track"><span class="bar__range" style="left:${min / scale * 100}%;width:${(max - min) / scale * 100}%"></span><span class="bar__fill" style="width:${Math.min(100, val / scale * 100)}%;background:${col}"></span></div></div>`;
  };
  return `<div class="macros">
    <div class="donut" role="img" aria-label="Частка енергії: білки ${Math.round(kP / sum * 100)}%, жири ${Math.round(kF / sum * 100)}%, вуглеводи ${Math.round(kC / sum * 100)}%">
      <svg viewBox="0 0 132 132"><circle cx="66" cy="66" r="52" fill="none" stroke="var(--color-surface-2)" stroke-width="16"/>${seg(kP, 'var(--c-protein)')}${seg(kF, 'var(--c-fat)')}${seg(kC, 'var(--c-carbs)')}</svg>
      <div class="donut__c"><b>${Math.round(kP / sum * 100)}/${Math.round(kF / sum * 100)}/${Math.round(kC / sum * 100)}</b><span>% Б / Ж / В</span></div>
    </div>
    <div class="bars">
      ${bar('Білки', r.total_protein, n.protein_min, n.protein_max, 'var(--c-protein)')}
      ${bar('Жири', r.total_fat, n.fat_min, n.fat_max, 'var(--c-fat)')}
      ${bar('Вуглеводи', r.total_carbs, n.carbs_min, n.carbs_max, 'var(--c-carbs)')}
    </div></div>`;
}

function compareHTML(o, b) {
  const d = (x, y, u = '') => { const v = Math.round((x - y) * 10) / 10; return `${v > 0 ? '+' : ''}${v}${u}`; };
  const pct = b.total_cost > 0 ? Math.round((1 - o.total_cost / b.total_cost) * 100) : 0;
  return `<div class="card">
    <div class="card__head"><h3 class="h-section">Найдешевший vs звичайний</h3>${pct > 0 ? `<span class="tag tag--ok">дешевше на ${pct}%</span>` : ''}</div>
    <p class="small muted" style="margin-bottom:.75rem">«Звичайний» — реалістичний кошик, який студент купив би, витративши майже весь бюджет. Норми КБЖУ в обох однакові.</p>
    <div style="overflow-x:auto"><table class="compare">
      <thead><tr><th>Показник</th><th>Найдешевший</th><th>Звичайний</th><th>Різниця</th></tr></thead>
      <tbody>
        <tr><td>Вартість</td><td class="good">${uah(o.total_cost)}</td><td>${uah(b.total_cost)}</td><td>${d(o.total_cost, b.total_cost, ' грн')}</td></tr>
        <tr><td>Калорії</td><td>${int(o.total_calories)}</td><td>${int(b.total_calories)}</td><td>${d(o.total_calories, b.total_calories)}</td></tr>
        <tr><td>Білки, г</td><td>${o.total_protein}</td><td>${b.total_protein}</td><td>${d(o.total_protein, b.total_protein)}</td></tr>
        <tr><td>Жири, г</td><td>${o.total_fat}</td><td>${b.total_fat}</td><td>${d(o.total_fat, b.total_fat)}</td></tr>
        <tr><td>Вуглеводи, г</td><td>${o.total_carbs}</td><td>${b.total_carbs}</td><td>${d(o.total_carbs, b.total_carbs)}</td></tr>
        <tr><td>Продуктів</td><td>${o.menu.length}</td><td>${b.menu.length}</td><td>${o.menu.length - b.menu.length}</td></tr>
      </tbody></table></div>
  </div>`;
}

/* ─── Дії на сторінці раціону ───────────────────────────────── */
function onPlanClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'view') { S.view = b.dataset.v; S.aiText = null; renderPlan(); }
  if (act === 'variant') { S.variant = Math.max(0, Math.min(S.candidates.length - 1, S.variant + +b.dataset.v)); S.aiText = null; renderPlan(); }
  if (act === 'ban') {
    const id = +b.dataset.id;
    const prod = S.data.products.find(p => p.id === id);
    if (!S.banned.includes(id)) S.banned.push(id);
    store.set('banned', S.banned);
    toast(`«${shortName(prod?.n || '')}» виключено. Повернути можна в розділі «Ще».`);
    runPlan({ newSeed: false });
  }
  if (act === 'to-list') addToList([current().menu], 'Раціон на день');
  if (act === 'share') sharePlan();
  if (act === 'save') savePlan();
  if (act === 'print') window.print();
  if (act === 'ai') runAI();
  if (act === 'edit') { $('#profile-form').scrollIntoView({ behavior: 'smooth' }); $('#profile-form').age.focus(); }
  if (act === 'set-budget') { $('#profile-form').budget.value = b.dataset.v; runPlan(); }
}

function profileLink(p) {
  const { allergies, ...rest } = p;
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(rest)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${location.origin}${location.pathname}#/plan?p=${b64}`;
}

function menuText(r) {
  const lines = [`DietOpt — меню на день: ${uah(r.total_cost)}, ${int(r.total_calories)} ккал (Б ${int(r.total_protein)} / Ж ${int(r.total_fat)} / В ${int(r.total_carbs)})`];
  MEAL_ORDER.forEach(m => {
    const it = r.menu.filter(i => i.meal === m); if (!it.length) return;
    lines.push('', MEAL_NAMES[m] + ':');
    it.forEach(i => lines.push(`• ${shortName(i.name)} — ${fmtAmount(i)}`));
  });
  return lines.join('\n');
}

async function shareOrCopy({ title, text, url }) {
  const full = url ? `${text}\n\n${url}` : text;
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(full); toast('Скопійовано — вставте в месенджер'); }
  catch {
    const ta = document.createElement('textarea'); ta.value = full; document.body.append(ta); ta.select();
    try { document.execCommand('copy'); toast('Скопійовано'); } catch { toast('Не вдалося скопіювати'); }
    ta.remove();
  }
}

function sharePlan() {
  const r = current();
  shareOrCopy({ title: 'Моє меню з DietOpt', text: menuText(r) + '\n\nСклади своє за посиланням:', url: profileLink(S.profile) });
}

function savePlan() {
  const r = current();
  const entry = {
    id: Date.now(), date: new Date().toISOString(), profile: S.profile,
    label: `${r.template} · ${uah(r.total_cost)}`, result: r,
  };
  S.saved.unshift(entry); S.saved = S.saved.slice(0, 30);
  store.set('saved', S.saved);
  toast('Раціон збережено в розділі «Ще»');
}

async function runAI() {
  const box = $('#ai-out');
  if (!S.ai.key) {
    openDialog(`<div class="dialog__body">
      <h2 class="h-section">Рецепти від Google Gemini</h2>
      <p class="small muted">Для AI-рецептів потрібен ваш безкоштовний ключ Gemini API. Отримати його можна за хвилину в <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a>. Ключ зберігається лише в цьому браузері.</p>
      <form method="dialog" class="form" id="ai-quick"><label class="field"><span class="label">API key</span><input name="key" type="password" placeholder="AIza…" required autocomplete="off"></label>
      <div class="dialog__foot"><button class="btn btn--ghost" value="cancel" formnovalidate>Скасувати</button><button class="btn btn--primary" value="ok">Зберегти і згенерувати</button></div></form></div>`,
      dlg => {
        $('#ai-quick', dlg).addEventListener('submit', ev => {
          const k = ev.target.key.value.trim();
          if (ev.submitter?.value === 'ok' && k) { S.ai.key = k; store.set('ai', S.ai); setTimeout(runAI, 50); }
        });
      });
    return;
  }
  const r = current();
  box.innerHTML = `<div class="skel" style="height:220px"></div><p class="xs muted" style="margin-top:.5rem">Gemini складає рецепти… зазвичай 5–20 секунд</p>`;
  try {
    S.aiText = await geminiRecipes({ apiKey: S.ai.key, model: S.ai.model, menu: r.menu, profile: S.profile, mealNames: MEAL_NAMES });
    renderPlan();
    $('#ai-out')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (e) {
    const d = buildDishes(r.menu);
    box.innerHTML = `<div class="notice notice--err" style="margin-bottom:.75rem"><span><b>AI недоступний:</b> ${esc(String(e.message).replace(/\.+$/, ''))}. Перевірте ключ у розділі «Ще». Нижче — офлайн-рецепти.</span></div>
      <div class="dishes">${MEAL_ORDER.filter(m => d[m]).map(m => dishHTML(m, d[m])).join('')}</div>`;
  }
}

/* ─── Тиждень ───────────────────────────────────────────────── */
function renderWeek() {
  const out = $('#week-output');
  if (!S.profile) {
    out.innerHTML = `<div class="panel empty">${ICON.cal}<b>Спочатку заповніть профіль</b><span>Тижневий план будується під ваші норми й бюджет.</span><a class="btn btn--primary" href="#/plan">До профілю</a></div>`;
    return;
  }
  if (!S.week) {
    out.innerHTML = `<div class="panel empty">${ICON.cal}<b>Сім днів — сім різних меню</b><span>Натисніть «Скласти тиждень», щоб отримати план і загальний список покупок.</span></div>`;
    return;
  }
  if (!S.week.length) {
    out.innerHTML = `<div class="notice notice--warn">Не вдалося скласти тиждень для поточного бюджету. Збільште бюджет на сторінці «Раціон».</div>`;
    return;
  }
  const total = S.week.reduce((s, d) => s + d.total_cost, 0);
  const kcal = S.week.reduce((s, d) => s + d.total_calories, 0) / 7;
  const dishesFor = d => buildDishes(d.menu);
  out.innerHTML = `
    <div class="kpis week-sum">
      <div class="kpi kpi--accent"><span class="kpi__label">Тиждень коштує</span><span class="kpi__value">${uah(total)}</span><span class="kpi__sub">≈ ${uah(total / 7)} на день</span></div>
      <div class="kpi"><span class="kpi__label">Місяць (×4.3)</span><span class="kpi__value">${int(total * 4.3)}<small>грн</small></span><span class="kpi__sub">орієнтовно</span></div>
      <div class="kpi"><span class="kpi__label">Середньо калорій</span><span class="kpi__value">${int(kcal)}<small>ккал</small></span><span class="kpi__sub">ціль ${int(S.norms.target_calories)}</span></div>
      <div class="kpi"><span class="kpi__label">Різних шаблонів</span><span class="kpi__value">${new Set(S.week.map(d => d.template)).size}</span><span class="kpi__sub">з 7 днів</span></div>
    </div>
    <div class="actions" style="margin-bottom:1.25rem">
      <button class="btn btn--primary" data-wact="list">${ICON.cart} Усе у список покупок</button>
      <button class="btn" data-wact="share">${ICON.share} Поділитися</button>
      <button class="btn" data-wact="print">${ICON.print} Друк / PDF</button>
    </div>
    <div class="days">${S.week.map((d, i) => {
      const ds = dishesFor(d);
      return `<article class="day">
        <header class="day__head"><div><div class="day__name">${DAY_NAMES[i]}</div><div class="day__tpl">${esc(d.template)}</div></div><div class="day__cost">${uah(d.total_cost)}</div></header>
        <div class="day__body">${MEAL_ORDER.filter(m => ds[m]).map(m => `<div class="day__meal"><b>${MEAL_NAMES[m]}</b><span>${esc(ds[m].title)}</span></div>`).join('')}</div>
        <footer class="day__foot"><span>${int(d.total_calories)} ккал · Б ${int(d.total_protein)}</span><button class="btn btn--sm" data-wact="open" data-i="${i}">Детальніше</button></footer>
      </article>`;
    }).join('')}</div>`;
}

function onWeekClick(e) {
  const b = e.target.closest('[data-wact]'); if (!b) return;
  const a = b.dataset.wact;
  if (a === 'list') addToList(S.week.map(d => d.menu), 'План на тиждень');
  if (a === 'print') window.print();
  if (a === 'share') {
    const total = S.week.reduce((s, d) => s + d.total_cost, 0);
    const text = `DietOpt — мій план на тиждень за ${uah(total)}:\n` + S.week.map((d, i) => {
      const ds = buildDishes(d.menu);
      return `\n${DAY_NAMES[i]} (${uah(d.total_cost)}): ` + MEAL_ORDER.filter(m => ds[m]).map(m => ds[m].title).join(' · ');
    }).join('');
    shareOrCopy({ title: 'План на тиждень', text: text + '\n\nСклади свій:', url: profileLink(S.profile) });
  }
  if (a === 'open') {
    const d = S.week[+b.dataset.i];
    const ds = buildDishes(d.menu);
    openDialog(`<div class="dialog__body" style="max-height:80dvh;overflow:auto">
      <div><p class="eyebrow">${DAY_NAMES[+b.dataset.i]} · ${esc(d.template)}</p><h2 class="h-section">${uah(d.total_cost)} · ${int(d.total_calories)} ккал</h2></div>
      <div class="meals">${MEAL_ORDER.map(m => mealHTML(m, d.menu.filter(i => i.meal === m), ds[m])).join('')}</div>
      <div class="dishes" style="grid-template-columns:1fr">${MEAL_ORDER.filter(m => ds[m]).map(m => dishHTML(m, ds[m])).join('')}</div>
      <form method="dialog" class="dialog__foot"><button class="btn btn--primary">Закрити</button></form></div>`,
      dlg => $$('.item__x', dlg).forEach(x => x.remove()));
  }
}

async function buildWeekNow() {
  if (!S.profile) { location.hash = '#/plan'; toast('Спочатку заповніть профіль'); return; }
  const btn = $('#week-build'); btn.classList.add('is-loading');
  $('#week-output').innerHTML = `<div class="days">${'<div class="skel" style="height:260px"></div>'.repeat(3)}</div>`;
  await nextFrame();
  const products = filterProducts(S.data.products, S.profile, { bannedIds: S.banned, priceOverrides: S.prices });
  S.week = buildWeek(products, S.profile, S.norms, Date.now());
  btn.classList.remove('is-loading');
  renderWeek();
}

/* ─── Список покупок ────────────────────────────────────────── */
function addToList(menus, source) {
  const agg = aggregateShopping(menus);
  const map = new Map(S.list.items.map(i => [i.id, i]));
  agg.forEach(a => {
    const cur = map.get(a.id);
    if (cur) { cur.grams += a.grams; cur.cost = Math.round((cur.cost + a.cost) * 100) / 100; cur.done = false; }
    else map.set(a.id, { ...a, done: false });
  });
  S.list = { items: [...map.values()], source: S.list.items.length ? 'Кілька раціонів' : source };
  store.set('list', S.list);
  updateBadges();
  toast(`Додано ${agg.length} продуктів до списку покупок`);
}

function qtyText(i) {
  const n = i.name.toLowerCase();
  if (n.includes('яйце куряче')) return `${Math.ceil(i.grams / 60)} шт`;
  const liquid = i.liquid || /молоко|кефір|ряжанк|йогурт|олія/.test(n);
  if (i.grams >= 1000) return `${(i.grams / 1000).toFixed(2).replace(/\.?0+$/, '')} ${liquid ? 'л' : 'кг'}`;
  return `${Math.round(i.grams)} ${liquid ? 'мл' : 'г'}`;
}

function renderList() {
  const out = $('#list-output');
  const items = S.list.items;
  $('#list-share').disabled = !items.length; $('#list-clear').disabled = !items.length;
  if (!items.length) {
    out.innerHTML = `<div class="panel empty">${ICON.bag}<b>Список порожній</b><span>Складіть раціон або тижневий план і натисніть «У список покупок».</span><a class="btn btn--primary" href="#/plan">Скласти раціон</a></div>`;
    return;
  }
  const groups = {};
  items.forEach(i => { (groups[i.category] ||= []).push(i); });
  const total = items.reduce((s, i) => s + i.cost, 0);
  const left = items.filter(i => !i.done).reduce((s, i) => s + i.cost, 0);
  const done = items.filter(i => i.done).length;
  out.innerHTML = `<div class="shop">
    <div class="card shop-total">
      <div><p class="eyebrow">${esc(S.list.source || 'Список')}</p><div class="h-section num">${uah(total)}</div><span class="xs muted">залишилось купити на ${uah(left)} · куплено ${done} з ${items.length}</span></div>
    </div>
    ${Object.entries(groups).sort((a, b) => (S.cats[a[0]]?.id ?? 99) - (S.cats[b[0]]?.id ?? 99)).map(([cat, list]) => `
      <div class="shop-group"><h3>${esc(S.cats[cat]?.name_ua || cat)}</h3>
        <ul class="shop-list">${list.sort((a, b) => a.done - b.done || a.name.localeCompare(b.name, 'uk')).map(i => `
          <li class="shop-item ${i.done ? 'done' : ''}" data-id="${i.id}">
            <input type="checkbox" ${i.done ? 'checked' : ''} aria-label="Куплено: ${esc(i.name)}">
            <div><div class="shop-item__name">${esc(shortName(i.name))}</div><div class="shop-item__qty">${qtyText(i)}</div></div>
            <div class="shop-item__cost">${uah(i.cost)}</div>
          </li>`).join('')}</ul></div>`).join('')}
  </div>`;
}

function onListClick(e) {
  const li = e.target.closest('.shop-item'); if (!li) return;
  const it = S.list.items.find(i => i.id === +li.dataset.id); if (!it) return;
  it.done = !it.done; store.set('list', S.list); renderList(); updateBadges();
}

function updateBadges() {
  const n = S.list.items.filter(i => !i.done).length;
  $$('[data-count-list]').forEach(el => { el.hidden = !n; if (el.classList.contains('pill')) el.textContent = n; });
}

/* ─── База продуктів ────────────────────────────────────────── */
const F = { q: '', cat: '', sort: 'name', limit: 60 };
function renderFoods() {
  const catsEl = $('#food-cats');
  if (!catsEl.childElementCount) {
    catsEl.innerHTML = `<button class="chip" data-cat="" aria-pressed="true">Усі</button>` +
      S.data.categories.filter(c => c.name !== 'alcohol').map(c => `<button class="chip" data-cat="${c.name}" aria-pressed="false">${esc(c.name_ua)}</button>`).join('');
  }
  let list = S.data.products.map(p => ({ ...p, pr: S.prices[p.id] ?? p.pr, custom: p.id in S.prices }));
  const q = F.q.trim().toLowerCase();
  if (q) list = list.filter(p => p.n.toLowerCase().includes(q));
  if (F.cat) list = list.filter(p => p.c === F.cat);
  else list = list.filter(p => p.c !== 'alcohol');
  const sorters = {
    name: (a, b) => a.n.localeCompare(b.n, 'uk'),
    price: (a, b) => a.pr - b.pr,
    protein_per_uah: (a, b) => b.p / b.pr - a.p / a.pr,
    kcal_per_uah: (a, b) => b.k / b.pr - a.k / a.pr,
    protein: (a, b) => b.p - a.p,
  };
  list.sort(sorters[F.sort]);
  const out = $('#foods-output');
  if (!list.length) { out.innerHTML = `<div class="panel empty"><b>Нічого не знайдено</b><span>Спробуйте іншу назву або категорію.</span></div>`; return; }
  const shown = list.slice(0, F.limit);
  out.innerHTML = `<p class="xs muted" style="margin:0 0 .5rem .25rem">Знайдено ${list.length}</p><div class="foods">${shown.map(p => `
    <button class="food" data-id="${p.id}">
      <div><div class="food__name">${esc(p.n)}${S.banned.includes(p.id) ? '<span class="tag tag--accent">не їм</span>' : ''}${p.custom ? '<span class="tag tag--ok">моя ціна</span>' : ''}</div>
        <div class="food__meta">${p.k} ккал · Б ${p.p} · Ж ${p.f} · В ${p.cb}${F.sort === 'protein_per_uah' ? ` · ${(p.p / p.pr * 10).toFixed(1)} г білка/10 грн` : ''}${F.sort === 'kcal_per_uah' ? ` · ${int(p.k / p.pr * 10)} ккал/10 грн` : ''}</div></div>
      <div class="food__price">${uah(p.pr)}<small>за 100 г</small></div>
    </button>`).join('')}</div>
    ${list.length > F.limit ? `<div class="foods-more"><button class="btn" id="foods-more">Показати ще ${Math.min(60, list.length - F.limit)}</button></div>` : ''}`;
}

function openFood(id) {
  const p = S.data.products.find(x => x.id === id);
  const price = S.prices[id] ?? p.pr;
  const banned = S.banned.includes(id);
  openDialog(`<div class="dialog__body">
    <div><p class="eyebrow">${esc(S.cats[p.c]?.name_ua || '')}</p><h2 class="h-section">${esc(p.n)}</h2></div>
    <div class="norms" style="margin:0">
      <div class="norm"><b>${p.k}</b><span>ккал / 100 г</span></div><div class="norm"><b>${p.p} г</b><span>білки</span></div>
      <div class="norm"><b>${p.f} г</b><span>жири</span></div><div class="norm"><b>${p.cb} г</b><span>вуглеводи</span></div>
    </div>
    <form method="dialog" class="form" id="food-form">
      <label class="field"><span class="label">Ціна за 100 г у вашому магазині <span class="muted xs">база: ${uah(p.pr)}</span></span>
        <span class="input-wrap"><input name="price" type="number" inputmode="decimal" step="0.1" min="0.1" value="${price}"><i>грн</i></span></label>
      <label class="row-gap small" style="align-items:center;cursor:pointer"><input type="checkbox" name="ban" ${banned ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--color-accent)"> Не їм — не додавати в меню</label>
      <div class="dialog__foot">
        ${id in S.prices ? '<button class="btn btn--ghost" value="reset">Скинути ціну</button>' : ''}
        <button class="btn btn--ghost" value="cancel" formnovalidate>Скасувати</button>
        <button class="btn btn--primary" value="ok">Зберегти</button>
      </div></form></div>`, dlg => {
    $('#food-form', dlg).addEventListener('submit', ev => {
      const v = ev.submitter?.value;
      if (v === 'cancel') return;
      const f = ev.target;
      if (v === 'reset') delete S.prices[id];
      else {
        const np = parseFloat(f.price.value);
        if (np > 0 && Math.abs(np - p.pr) > 0.001) S.prices[id] = np; else delete S.prices[id];
        S.banned = S.banned.filter(x => x !== id);
        if (f.ban.checked) S.banned.push(id);
      }
      store.set('prices', S.prices); store.set('banned', S.banned);
      renderFoods(); toast('Збережено. Нові ціни враховуються в наступних розрахунках.');
    });
  });
}

/* ─── Розділ «Ще» ───────────────────────────────────────────── */
function renderMore() {
  const sv = $('#saved-output');
  sv.innerHTML = S.saved.length ? `<ul class="saved">${S.saved.map(s => `
    <li><div><b>${esc(s.label)}</b><span>${new Date(s.date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${int(s.result.total_calories)} ккал</span></div>
      <div class="row-gap"><button class="btn btn--sm" data-sact="open" data-id="${s.id}">Відкрити</button><button class="btn btn--sm btn--ghost" data-sact="del" data-id="${s.id}" aria-label="Видалити">${ICON.x}</button></div></li>`).join('')}</ul>`
    : '<p class="small muted">Тут з\'являться раціони, які ви збережете кнопкою «Зберегти».</p>';

  const ov = $('#overrides-output');
  const priced = Object.keys(S.prices).map(Number);
  const rows = [...new Set([...priced, ...S.banned])].map(id => S.data.products.find(p => p.id === id)).filter(Boolean);
  ov.innerHTML = rows.length ? `<ul class="saved">${rows.map(p => `<li><div><b>${esc(p.n)}</b><span>${S.banned.includes(p.id) ? 'не їм' : ''}${S.banned.includes(p.id) && p.id in S.prices ? ' · ' : ''}${p.id in S.prices ? `${uah(S.prices[p.id])} замість ${uah(p.pr)}` : ''}</span></div>
      <button class="btn btn--sm btn--ghost" data-oact="reset" data-id="${p.id}">Скинути</button></li>`).join('')}</ul>`
    : '<p class="small muted">Ви ще не змінювали ціни і не виключали продукти. Це можна зробити в розділі «Продукти» або кнопкою × у меню.</p>';

  const f = $('#ai-form'); f.key.value = S.ai.key || ''; f.model.value = S.ai.model || 'gemini-3.5-flash-lite';
  $('#about-db').textContent = `${S.data.products.length} продуктів, ${S.data.categories.length} категорій, ціни в грн (оновлено ${S.data.version})`;
}

function onMoreClick(e) {
  const s = e.target.closest('[data-sact]');
  if (s) {
    const id = +s.dataset.id;
    if (s.dataset.sact === 'del') { S.saved = S.saved.filter(x => x.id !== id); store.set('saved', S.saved); renderMore(); }
    if (s.dataset.sact === 'open') {
      const it = S.saved.find(x => x.id === id);
      writeForm(it.profile); S.profile = it.profile; S.norms = calculateNorms(it.profile);
      S.candidates = [it.result]; S.variant = 0; S.basic = null; S.view = 'opt'; S.aiText = null;
      location.hash = '#/plan'; setTimeout(renderPlan, 0);
    }
    return;
  }
  const o = e.target.closest('[data-oact]');
  if (o) {
    const id = +o.dataset.id; delete S.prices[id]; S.banned = S.banned.filter(x => x !== id);
    store.set('prices', S.prices); store.set('banned', S.banned); renderMore();
  }
}

/* ─── Діалог ────────────────────────────────────────────────── */
function openDialog(html, setup) {
  const d = $('#dlg');
  d.innerHTML = html;
  setup?.(d);
  d.addEventListener('click', ev => { if (ev.target === d) d.close(); }, { once: true });
  d.showModal();
}

/* ─── Тема, PWA ─────────────────────────────────────────────── */
function initTheme() {
  $('#theme-toggle').addEventListener('click', () => {
    const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('dietopt.theme', t); } catch { /* ignore */ }
  });
}

let installEvt = null;
function initPWA() {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#install-btn').hidden = false; });
  $('#install-btn').addEventListener('click', async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('#install-btn').hidden = true; });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    try { navigator.serviceWorker.register('sw.js').catch(() => { /* офлайн-режим недоступний — не критично */ }); } catch { /* sandbox */ }
  }
}

/* ─── Старт ─────────────────────────────────────────────────── */
async function boot() {
  initTheme();
  try {
    const res = await fetch('data/products.json');
    S.data = await res.json();
  } catch {
    $('#plan-empty').innerHTML = '<div class="notice notice--err">Не вдалося завантажити базу продуктів. Перевірте з\'єднання та оновіть сторінку.</div>';
    return;
  }
  S.data.categories.forEach(c => { S.cats[c.name] = c; });
  initForm();
  if (store.get('profile', null)) { S.profile = readForm(); S.norms = calculateNorms(S.profile); }
  initPWA();
  updateBadges();

  $('#plan-output').addEventListener('click', onPlanClick);
  $('#week-output').addEventListener('click', onWeekClick);
  $('#week-build').addEventListener('click', buildWeekNow);
  $('#list-output').addEventListener('click', onListClick);
  $('#list-clear').addEventListener('click', () => {
    openDialog(`<div class="dialog__body"><h2 class="h-section">Очистити список покупок?</h2><p class="small muted">Усі продукти буде видалено зі списку.</p>
      <form method="dialog" class="dialog__foot"><button class="btn btn--ghost" value="no">Скасувати</button><button class="btn btn--primary" value="yes">Очистити</button></form></div>`,
      d => $('form', d).addEventListener('submit', ev => { if (ev.submitter?.value === 'yes') { S.list = { items: [], source: '' }; store.set('list', S.list); renderList(); updateBadges(); } }));
  });
  $('#list-share').addEventListener('click', () => {
    const lines = S.list.items.filter(i => !i.done).map(i => `☐ ${shortName(i.name)} — ${qtyText(i)}`);
    const total = S.list.items.filter(i => !i.done).reduce((s, i) => s + i.cost, 0);
    shareOrCopy({ title: 'Список покупок', text: `Список покупок (≈${uah(total)}):\n${lines.join('\n')}` });
  });
  $('#food-search').addEventListener('input', e => { F.q = e.target.value; F.limit = 60; renderFoods(); });
  $('#food-sort').addEventListener('change', e => { F.sort = e.target.value; renderFoods(); });
  $('#food-cats').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    F.cat = b.dataset.cat; F.limit = 60;
    $$('#food-cats .chip').forEach(c => c.setAttribute('aria-pressed', c === b ? 'true' : 'false'));
    renderFoods();
  });
  $('#foods-output').addEventListener('click', e => {
    if (e.target.id === 'foods-more') { F.limit += 60; renderFoods(); return; }
    const b = e.target.closest('.food'); if (b) openFood(+b.dataset.id);
  });
  $('.more-grid').addEventListener('click', onMoreClick);
  $('#ai-form').addEventListener('submit', e => {
    e.preventDefault();
    S.ai = { key: e.target.key.value.trim(), model: e.target.model.value };
    store.set('ai', S.ai); toast('Налаштування AI збережено');
  });
  $('#ai-clear').addEventListener('click', () => { S.ai = { key: '', model: S.ai.model }; store.set('ai', S.ai); renderMore(); toast('Ключ видалено'); });
  $('#reset-all').addEventListener('click', () => {
    openDialog(`<div class="dialog__body"><h2 class="h-section">Стерти всі дані?</h2><p class="small muted">Профіль, збережені раціони, список покупок, ваші ціни та ключ AI буде видалено з цього пристрою.</p>
      <form method="dialog" class="dialog__foot"><button class="btn btn--ghost" value="no">Скасувати</button><button class="btn btn--primary" value="yes">Стерти</button></form></div>`,
      d => $('form', d).addEventListener('submit', ev => {
        if (ev.submitter?.value !== 'yes') return;
        ['profile', 'banned', 'prices', 'list', 'saved', 'ai'].forEach(store.del);
        location.hash = '#/plan'; location.reload();
      }));
  });

  window.addEventListener('hashchange', route);
  route();
}

boot();
