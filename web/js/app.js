/* ═══════════════════════════════════════════════════════════════
   app.js — DietOpt
   Localized meal planning for Germany and Ukraine, with per-market data,
   shopping lists, saved preferences and offline support.
   ═══════════════════════════════════════════════════════════════ */

import {
  calculateNorms, filterProducts, optimizeCandidates, optimizeBasic, buildWeek,
  aggregateShopping, MEAL_ORDER,
} from './optimizer.js';
import { buildDishes, fmtAmount, shortName, geminiRecipes, miniMarkdown } from './recipes.js';
import {
  currentLang, currentMarket, currentCurrency, setLanguage, setMarket,
  t, fmtCost, fmtInt, getFoodName, getCatName,
  MEAL_NAMES_I18N, DAY_NAMES_I18N, ALLERGY_CHIPS_I18N,
} from './i18n.js';
import {
  getInitialBuilderState, saveBuilderState, calcDayTotals,
  calcItemNutrition, convertBuilderToPlanMenu, GERMAN_PRESETS,
  getPresetsForMarket, ALL_PRESETS,
} from './builder.js';
import { loadMarketData } from './market-data.js';

/* ─── DOM Helpers ───────────────────────────────────────────── */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lc = s => String(s || '').toLowerCase();
const productBasePrice = (product, currency = S?.currency ?? currentCurrency) => {
  if (product?.price_currency === currency || product?.price_currency == null && currency !== 'EUR') return Number(product?.pr) || 0;
  return currency === 'EUR' ? (product?.pr_eur ?? (Number(product?.pr || 0) / 45)) : (Number(product?.pr) || 0);
};
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 16)));

const mem = {};
const INITIAL_MARKET = currentMarket;
const GLOBAL_KEYS = new Set(['lang', 'theme', 'market', 'currency']);
const LEGACY_DATA_KEYS = new Set(['profile', 'banned', 'prices', 'list', 'saved', 'ai', 'builder']);
const store = {
  key(k, market = currentMarket) {
    return GLOBAL_KEYS.has(k) ? `dietopt.${k}` : `dietopt.${market}.${k}`;
  },
  get(k, def) {
    const scopedKey = this.key(k);
    try {
      const raw = localStorage.getItem(scopedKey);
      if (raw != null) return JSON.parse(raw);
      // Move existing v4 data into the region active on the first upgrade.
      if (LEGACY_DATA_KEYS.has(k) && currentMarket === INITIAL_MARKET) {
        const legacy = localStorage.getItem(`dietopt.${k}`);
        if (legacy != null) {
          localStorage.setItem(scopedKey, legacy);
          localStorage.removeItem(`dietopt.${k}`);
          return JSON.parse(legacy);
        }
      }
    } catch {
      const memoryKey = `${currentMarket}:${k}`;
      if (memoryKey in mem) return mem[memoryKey];
    }
    return def;
  },
  set(k, v) {
    const storageKey = this.key(k);
    try { localStorage.setItem(storageKey, JSON.stringify(v)); }
    catch { mem[`${currentMarket}:${k}`] = v; }
  },
  del(k) {
    try { localStorage.removeItem(this.key(k)); }
    catch { delete mem[`${currentMarket}:${k}`]; }
  },
  isPersistent() {
    try {
      const key = 'dietopt.storage-check';
      localStorage.setItem(key, '1');
      localStorage.removeItem(key);
      return true;
    } catch { return false; }
  },
};

function toast(msg) {
  const tEl = $('#toast');
  tEl.textContent = msg; tEl.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { tEl.hidden = true; }, 2600);
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

/* ─── Global State ──────────────────────────────────────────── */
const S = {
  market: currentMarket,
  data: null,
  cats: {},
  productsMap: new Map(),
  profile: null,
  norms: null,
  candidates: [],
  variant: 0,
  basic: null,
  view: 'opt',
  seed: Date.now(),
  banned: store.get('banned', []),
  prices: store.get('prices', {}),
  list: store.get('list', { items: [], source: '' }),
  saved: store.get('saved', []),
  ai: store.get('ai', { key: '', model: 'gemini-2.5-flash-lite' }),
  week: null,
  aiText: null,
  builder: getInitialBuilderState(),
  currency: currentCurrency,
  lang: currentLang,
};

const current = () => (S.view === 'basic' && S.basic ? S.basic : S.candidates[S.variant]);

/* ─── Router ────────────────────────────────────────────────── */
const PAGES = ['plan', 'builder', 'week', 'list', 'foods', 'more'];
function route() {
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const page = PAGES.includes(path) ? path : 'plan';
  const navPage = ['builder', 'foods'].includes(page) ? 'more' : page;
  $$('.page').forEach(p => { p.hidden = p.dataset.page !== page; });
  $$('[data-nav]').forEach(a => {
    if (a.dataset.nav === navPage) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  if (page === 'plan') {
    if (S.candidates.length) renderPlan();
  } else if (page === 'builder') {
    renderBuilder();
  } else if (page === 'week') {
    renderWeek();
  } else if (page === 'list') {
    renderList();
  } else if (page === 'foods') {
    renderFoods();
  } else if (page === 'more') {
    renderMore();
  }

  if (page === 'plan' && query) {
    const p = new URLSearchParams(query).get('p');
    if (p) {
      try {
        const prof = JSON.parse(decodeURIComponent(escape(atob(p.replace(/-/g, '+').replace(/_/g, '/')))));
        writeForm(prof); history.replaceState(null, '', '#/plan'); runPlan();
      } catch { toast('Link could not be loaded'); }
    }
  }
  window.scrollTo({ top: 0 });
}

/* ─── Language & Currency Handlers ──────────────────────────── */
function updateStaticTexts() {
  document.documentElement.setAttribute('lang', S.lang);
  document.title = t('app_title');
  const metaDesc = $('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', t('app_meta_desc'));

  $$('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    // Translation strings are plain text; tolerate old <br> strings without showing markup.
    el.textContent = t(key).replace(/(?:<br\s*\/?\s*>|&lt;br\s*\/?&gt;)/gi, ' ');
  });

  const marketSel = $('#market-select');
  if (marketSel) marketSel.value = S.market;

  // Update inputs placeholder
  const foodSearch = $('#food-search');
  if (foodSearch) foodSearch.placeholder = t('foods_search_ph');

  const extraAllergies = $('#allergies_extra');
  if (extraAllergies) extraAllergies.placeholder = t('allergies_extra_ph');

  // Re-render allergy chips
  renderAllergyChips();
  syncBudgetSlider();
}

function installMarketData(data) {
  S.data = data;
  S.cats = {};
  S.productsMap = new Map();
  S.data.categories.forEach(category => { S.cats[category.name] = category; });
  S.data.products.forEach(product => { S.productsMap.set(product.id, product); });
}

let marketLoadSequence = 0;
async function changeMarket(market) {
  if (!['de', 'ua'].includes(market) || market === S.market) return;
  const previousMarket = S.market;
  const sequence = ++marketLoadSequence;
  const select = $('#market-select');
  if (select) select.disabled = true;
  setMarket(market);
  S.market = market;
  S.currency = currentCurrency;

  try {
    const data = await loadMarketData(market);
    if (sequence !== marketLoadSequence) return;
    installMarketData(data);
    S.profile = null;
    S.norms = null;
    S.candidates = [];
    S.variant = 0;
    S.basic = null;
    S.week = null;
    S.aiText = null;
    S.banned = store.get('banned', []);
    S.prices = store.get('prices', {});
    S.list = store.get('list', { items: [], source: '' });
    S.saved = store.get('saved', []);
    S.ai = store.get('ai', { key: '', model: 'gemini-2.5-flash-lite' });
    S.builder = getInitialBuilderState(market);
    F.q = ''; F.cat = ''; F.limit = 60;
    $('#food-search').value = '';
    $('#food-cats').replaceChildren();
    $('#plan-output').hidden = true;
    $('#plan-empty').hidden = false;
    $('#form-error').hidden = true;
    syncBudgetSlider();
    applyProfileForMarket();
    syncBudgetSlider();
    updateStaticTexts();
    updateBadges();
    if (select) select.value = market;
    route();
    toast(t('market_changed'));
  } catch (error) {
    console.error(error);
    setMarket(previousMarket);
    S.market = previousMarket;
    S.currency = currentCurrency;
    if (select) select.value = previousMarket;
    toast('Could not load this market. Please try again.');
  } finally {
    if (select && sequence === marketLoadSequence) select.disabled = false;
  }
}

function syncBudgetSlider() {
  const range = $('#budget-input');
  const out = $('#budget-out');
  const scale = $('#range-scale');
  if (!range) return;

  if (S.currency === 'EUR') {
    range.min = 3;
    range.max = 30;
    range.step = 0.5;
    if (+range.value > 30 || +range.value < 3) range.value = 8;
    out.textContent = fmtCost(+range.value, 'EUR');
    scale.innerHTML = '<span>3 €</span><span>8 €</span><span>15 €</span><span>30 €</span>';
  } else {
    range.min = 50;
    range.max = 1000;
    range.step = 10;
    if (+range.value < 50) range.value = 200;
    out.textContent = fmtCost(+range.value, 'UAH');
    scale.innerHTML = '<span>50</span><span>350</span><span>700</span><span>1000 грн</span>';
  }
}

function initLanguageAndCurrency() {
  const langSel = $('#lang-select');
  const marketSel = $('#market-select');
  if (langSel) {
    langSel.value = S.lang;
    langSel.addEventListener('change', e => {
      setLanguage(e.target.value);
      S.lang = e.target.value;
      updateStaticTexts();
      route();
      toast(t('toast_prices_saved'));
    });
  }
  if (marketSel) {
    marketSel.value = S.market;
    marketSel.addEventListener('change', e => changeMarket(e.target.value));
  }
}

/* ─── Profile Form ──────────────────────────────────────────── */
function renderAllergyChips() {
  const chipsEl = $('#allergy-chips');
  if (!chipsEl) return;
  const chipsList = ALLERGY_CHIPS_I18N[S.lang] || ALLERGY_CHIPS_I18N.de;
  const currentChecked = S.profile?.allergy_chips || [];

  chipsEl.innerHTML = chipsList.map(([v, l]) => {
    const pressed = currentChecked.includes(v);
    return `<button type="button" class="chip chip--warn" data-allergy="${v}" aria-pressed="${pressed}">${l}</button>`;
  }).join('');
}

function defaultProfile() {
  return {
    gender: 'male', age: 25, height: 178, weight: 75,
    activity_level: 'light', goal: 'maintain',
    budget: S.currency === 'EUR' ? 8 : 200,
    diet_type: 'standard', allergy_chips: [], allergies_extra: '',
    allergies: '', currency: S.currency, market: S.market,
  };
}

function applyProfileForMarket() {
  const saved = store.get('profile', null);
  writeForm(saved || defaultProfile());
  if (saved) {
    S.profile = { ...readForm(), market: S.market, currency: S.currency };
    S.norms = calculateNorms(S.profile);
  } else {
    S.profile = null;
    S.norms = null;
  }
}

function initForm() {
  renderAllergyChips();
  const chipsEl = $('#allergy-chips');
  chipsEl.addEventListener('click', e => {
    const b = e.target.closest('[data-allergy]'); if (!b) return;
    b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
  });

  const f = $('#profile-form');
  const range = $('#budget-input');
  const out = $('#budget-out');

  range.addEventListener('input', () => {
    out.textContent = fmtCost(+range.value, S.currency);
  });

  f.addEventListener('submit', e => {
    e.preventDefault();
    runPlan();
  });

  applyProfileForMarket();

  const persistProfile = () => {
    const p = readForm();
    const valid = p.age >= 14 && p.age <= 80 && p.height >= 140 && p.height <= 220
      && p.weight >= 40 && p.weight <= 200;
    if (valid) {
      S.profile = p;
      S.norms = calculateNorms(p);
      store.set('profile', p);
    }
  };
  f.addEventListener('change', persistProfile);
}

function readForm() {
  const f = $('#profile-form');
  const chips = $$('#allergy-chips [aria-pressed="true"]').map(b => b.dataset.allergy);
  const extra = f.allergies_extra.value.split(',').map(s => s.trim()).filter(Boolean);
  return {
    gender: f.gender.value,
    age: +f.age.value,
    height: +f.height.value,
    weight: +f.weight.value,
    activity_level: f.activity_level.value,
    goal: f.goal.value,
    budget: +f.budget.value,
    market: S.market,
    currency: S.currency,
    diet_type: f.diet_type.value,
    allergy_chips: chips,
    allergies_extra: f.allergies_extra.value.trim(),
    allergies: [...chips, ...extra].join(', '),
  };
}

function writeForm(p) {
  const f = $('#profile-form');
  ['age', 'height', 'weight', 'activity_level'].forEach(k => { if (p[k] != null) f[k].value = p[k]; });
  ['gender', 'goal', 'diet_type'].forEach(k => {
    const r = f.querySelector(`[name="${k}"][value="${p[k]}"]`);
    if (r) r.checked = true;
  });
  if (p.budget != null) f.budget.value = p.budget;
  f.allergies_extra.value = p.allergies_extra || '';

  $$('#allergy-chips [data-allergy]').forEach(b => {
    b.setAttribute('aria-pressed', (p.allergy_chips || []).includes(b.dataset.allergy) ? 'true' : 'false');
  });
  $('#budget-out').textContent = fmtCost(+f.budget.value, S.currency);
}

function validate(p) {
  const f = $('#profile-form');
  const rules = [
    ['age', 14, 80, 'Age must be between 14 and 80'],
    ['height', 140, 220, 'Height must be between 140 and 220 cm'],
    ['weight', 40, 200, 'Weight must be between 40 and 200 kg']
  ];
  for (const [k, lo, hi, msg] of rules) {
    const bad = !(p[k] >= lo && p[k] <= hi);
    f[k].setAttribute('aria-invalid', bad ? 'true' : 'false');
    if (bad) { f[k].focus(); return msg; }
  }
  return null;
}

/* ─── Plan Calculation ──────────────────────────────────────── */
async function runPlan({ keepVariant = false, newSeed = true } = {}) {
  const p = readForm();
  const err = validate(p);
  const errEl = $('#form-error');
  errEl.hidden = !err;
  errEl.textContent = err || '';
  if (err) return;

  const btn = $('#run-btn');
  btn.classList.add('is-loading');
  await nextFrame();

  try {
    S.profile = p;
    store.set('profile', p);
    S.norms = calculateNorms(p);
    if (newSeed) S.seed = Date.now();

    const products = filterProducts(S.data.products, p, {
      bannedIds: S.banned,
      priceOverrides: S.prices,
      currency: S.currency,
    });

    S.candidates = optimizeCandidates(products, p, S.norms, S.seed);
    S.basic = S.candidates.length ? optimizeBasic(products, p, S.norms, S.seed) : null;
    if (!keepVariant) S.variant = 0;
    S.variant = Math.min(S.variant, Math.max(0, S.candidates.length - 1));
    S.view = 'opt'; S.aiText = null; S.week = null;

    if (!S.candidates.length) {
      const probe = optimizeCandidates(products, { ...p, budget: 10000 }, S.norms, S.seed);
      S.minCost = probe[0]?.total_cost ?? null;
    }
    renderPlan();
    if (matchMedia('(max-width: 960px)').matches) $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    console.error(e);
    errEl.hidden = false;
    errEl.textContent = 'Optimization error. Please check parameters.';
  } finally {
    btn.classList.remove('is-loading');
  }
}

/* ─── Plan Render ───────────────────────────────────────────── */
function renderPlan() {
  const out = $('#plan-output');
  $('#plan-empty').hidden = true;
  out.hidden = false;
  const n = S.norms, p = S.profile;

  if (!S.candidates.length) {
    const min = S.minCost;
    out.innerHTML = `
      <div class="card">
        <p class="eyebrow">${t('notice_relaxed')}</p>
        <h2 class="h-page" style="margin:.25rem 0 .75rem">${t('no_solution_title', fmtCost(p.budget))}</h2>
        <p class="muted">${t('no_solution_lead', fmtInt(n.target_calories))}</p>
        ${min ? `<div class="notice notice--ok" style="margin-top:1rem"><span>${t('no_solution_min', fmtCost(min))}</span></div>` : ''}
        <div class="actions" style="margin-top:1rem">
          ${min ? `<button class="btn btn--primary" data-act="set-budget" data-v="${Math.ceil(min)}">${t('set_budget_btn', fmtCost(Math.ceil(min)))}</button>` : ''}
          <button class="btn" data-act="edit">${t('edit_profile_btn')}</button>
        </div>
      </div>`;
    return;
  }

  const r = current();
  const opt = S.candidates[S.variant];
  const total = S.candidates.length;
  const dishes = buildDishes(r.menu, S.lang);
  const savings = S.basic ? S.basic.total_cost - opt.total_cost : 0;
  const goalText = { loss: t('goal_loss'), maintain: t('goal_maintain'), gain: t('goal_gain') }[p.goal];

  out.innerHTML = `
    <div class="result-head">
      <div>
        <p class="eyebrow">${t('menu_for_day')} · ${esc(r.template)}</p>
        <h2 class="h-page">${fmtCost(r.total_cost)} · ${fmtInt(r.total_calories)} ${t('kpi_kcal')}</h2>
      </div>
      <div class="row-gap no-print">
        <div class="tabs" role="tablist" aria-label="Varianten">
          <button role="tab" aria-selected="${S.view === 'opt'}" data-act="view" data-v="opt">${t('tab_cheapest')} <span class="num">${fmtCost(opt.total_cost)}</span></button>
          <button role="tab" aria-selected="${S.view === 'basic'}" data-act="view" data-v="basic" ${S.basic ? '' : 'disabled'}>${t('tab_standard')} <span class="num">${S.basic ? fmtCost(S.basic.total_cost) : '—'}</span></button>
        </div>
      </div>
    </div>

    ${opt.relaxed ? `<div class="notice notice--warn"><span>${t('notice_relaxed')}</span></div>` : ''}

    <div class="kpis">
      <div class="kpi kpi--accent">
        <span class="kpi__label">${t('kpi_day_cost')}</span>
        <span class="kpi__value">${fmtCost(r.total_cost)}</span>
        <span class="kpi__sub">${t('kpi_from_budget', fmtCost(p.budget))}</span>
      </div>
      <div class="kpi">
        <span class="kpi__label">${t('kpi_calories')}</span>
        <span class="kpi__value">${fmtInt(r.total_calories)}<small>${t('kpi_kcal')}</small></span>
        <span class="kpi__sub">${t('kpi_goal_target', fmtInt(n.target_calories), goalText)}</span>
      </div>
      <div class="kpi">
        <span class="kpi__label">${t('kpi_savings')}</span>
        <span class="kpi__value ${savings > 0 ? 'good' : ''}">${savings > 0 ? fmtCost(savings) : '—'}</span>
        <span class="kpi__sub">${savings > 0 ? t('kpi_savings_sub', fmtCost(savings * 30)) : t('kpi_savings_none')}</span>
      </div>
      <div class="kpi">
        <span class="kpi__label">${t('kpi_protein')}</span>
        <span class="kpi__value">${fmtInt(r.total_protein)}<small>g</small></span>
        <span class="kpi__sub">${t('kpi_protein_sub', fmtInt(n.protein_min), fmtInt(n.protein_max))}</span>
      </div>
    </div>

    <div class="card">
      <div class="card__head">
        <h3 class="h-section">${t('menu_section')}</h3>
        ${S.view === 'opt' ? `<div class="variant no-print">
          <button class="icon-btn" data-act="variant" data-v="-1" aria-label="${t('btn_prev_variant')}" ${S.variant === 0 ? 'disabled' : ''}>${ICON.prev}</button>
          <span class="num">${t('variant_text', S.variant + 1, total)}</span>
          <button class="icon-btn" data-act="variant" data-v="1" aria-label="${t('btn_next_variant')}" ${S.variant >= total - 1 ? 'disabled' : ''}>${ICON.next}</button>
        </div>` : ''}
      </div>
      <div class="meals">${MEAL_ORDER.map(m => mealHTML(m, r.menu.filter(i => i.meal === m), dishes[m])).join('')}</div>
      <p class="xs muted" style="margin-top:.75rem">${t('ban_hint')}</p>
    </div>

    <div class="actions no-print">
      <button class="btn btn--primary" data-act="to-list">${ICON.cart} ${t('btn_to_list')}</button>
      <button class="btn" data-act="share">${ICON.share} ${t('btn_share')}</button>
      <button class="btn" data-act="save">${ICON.save} ${t('btn_save')}</button>
      <button class="btn" data-act="print">${ICON.print} ${t('btn_print')}</button>
    </div>

    <details class="details-card">
      <summary>${t('more_nutrition')}</summary>
      <div class="details-card__content">
        <section class="card">
          <div class="card__head">
            <h3 class="h-section">${t('macros_balance')}</h3>
            <span class="xs muted">${t('macros_legend')}</span>
          </div>
          ${macrosHTML(r, n)}
        </section>
        <section class="card">
          <div class="card__head">
            <h3 class="h-section">${t('recipes_section')}</h3>
            <button class="btn btn--sm no-print" data-act="ai">${ICON.spark} ${t('recipes_ai_btn')}</button>
          </div>
          <div id="ai-out">
            ${S.aiText ? `<div class="ai-box">${miniMarkdown(S.aiText.text)}<p class="xs muted">Model: ${esc(S.aiText.model)}</p></div>` : `<div class="dishes">${MEAL_ORDER.filter(m => dishes[m]).map(m => dishHTML(m, dishes[m])).join('')}</div>`}
          </div>
        </section>
        ${S.basic ? compareHTML(opt, S.basic) : ''}
        <section class="card">
          <details class="more" style="border:0;padding:0">
            <summary>${t('more_norms_title')}</summary>
            <div class="norms">
              <div class="norm"><b>${fmtInt(n.bmr)}</b><span>${t('norm_bmr_sub')}</span></div>
              <div class="norm"><b>${fmtInt(n.tdee)}</b><span>${t('norm_tdee_sub')}</span></div>
              <div class="norm"><b>${fmtInt(n.target_calories)}</b><span>${t('norm_target_sub')}</span></div>
              <div class="norm"><b>${n.bmi}</b><span>${t('norm_bmi_sub', esc(n.bmi_status))}</span></div>
              <div class="norm"><b>${fmtInt(n.fat_min)}–${fmtInt(n.fat_max)} g</b><span>${t('kpi_fat')}</span></div>
              <div class="norm"><b>${fmtInt(n.carbs_min)}–${fmtInt(n.carbs_max)} g</b><span>${t('kpi_carbs')}</span></div>
              <div class="norm"><b>${(n.water_ml / 1000).toFixed(1)} L</b><span>${t('norm_water_sub')}</span></div>
              <div class="norm"><b>${r.solve_time_ms ?? '—'} ms</b><span>${t('norm_solve_time')}</span></div>
            </div>
          </details>
        </section>
      </div>
    </details>`;
}

function mealHTML(meal, items, dish) {
  if (!items.length) return '';
  const kcal = items.reduce((s, i) => s + i.calories, 0);
  const cost = items.reduce((s, i) => s + i.cost, 0);
  const mealName = (MEAL_NAMES_I18N[S.lang] || MEAL_NAMES_I18N.de)[meal] || meal;

  return `<section class="meal">
    <header class="meal__head">
      <div class="meal__title">
        <span class="meal__icon">${ICON[meal]}</span>
        <div style="min-width:0">
          <div class="meal__name">${mealName}</div>
          ${dish ? `<div class="meal__dish">${esc(dish.title)}</div>` : ''}
        </div>
      </div>
      <div class="meal__meta">${fmtInt(kcal)} kcal<br>${fmtCost(cost)}</div>
    </header>
    <ul class="items">${items.map(i => `
      <li class="item">
        <div>
          <div class="item__name">${esc(shortName(i.name, i, S.lang))}</div>
          <div class="item__macro">${fmtInt(i.calories)} kcal · P ${i.protein}g · F ${i.fat}g · C ${i.carbs}g</div>
        </div>
        <div class="item__amt">${esc(fmtAmount(i, S.lang))}<small>${fmtCost(i.cost)}</small></div>
        <button class="item__x no-print" data-act="ban" data-id="${i.id}" aria-label="Exclude ${esc(i.name)}" title="Exclude">${ICON.x}</button>
      </li>`).join('')}</ul>
  </section>`;
}

function dishHTML(meal, d) {
  const mealName = (MEAL_NAMES_I18N[S.lang] || MEAL_NAMES_I18N.de)[meal] || meal;
  return `<article class="dish">
    <div class="dish__meal">${mealName}</div>
    <h4 class="dish__title">${esc(d.title)}</h4>
    <span class="dish__time">≈ ${d.time} min</span>
    <ol>${d.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
  </article>`;
}

function macrosHTML(r, n) {
  const kP = r.total_protein * 4, kF = r.total_fat * 9, kC = r.total_carbs * 4;
  const sum = kP + kF + kC || 1;
  const C = 2 * Math.PI * 52;
  let off = 0;
  const seg = (v, col) => {
    const len = v / sum * C;
    const s = `<circle cx="66" cy="66" r="52" fill="none" stroke="${col}" stroke-width="16" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}"/>`;
    off += len;
    return s;
  };
  const bar = (label, val, min, max, col) => {
    const scale = Math.max(max * 1.25, val * 1.05);
    return `<div>
      <div class="bar__top">
        <span><i class="sw" style="background:${col}"></i>${label}</span>
        <span class="num">${fmtInt(val)} g · ${fmtInt(min)}–${fmtInt(max)} g</span>
      </div>
      <div class="bar__track">
        <span class="bar__range" style="left:${min / scale * 100}%;width:${(max - min) / scale * 100}%"></span>
        <span class="bar__fill" style="width:${Math.min(100, val / scale * 100)}%;background:${col}"></span>
      </div>
    </div>`;
  };

  return `<div class="macros">
    <div class="donut" role="img" aria-label="Energy: Protein ${Math.round(kP / sum * 100)}%, Fat ${Math.round(kF / sum * 100)}%, Carbs ${Math.round(kC / sum * 100)}%">
      <svg viewBox="0 0 132 132"><circle cx="66" cy="66" r="52" fill="none" stroke="var(--color-surface-2)" stroke-width="16"/>${seg(kP, 'var(--c-protein)')}${seg(kF, 'var(--c-fat)')}${seg(kC, 'var(--c-carbs)')}</svg>
      <div class="donut__c"><b>${Math.round(kP / sum * 100)}/${Math.round(kF / sum * 100)}/${Math.round(kC / sum * 100)}</b><span>% P / F / C</span></div>
    </div>
    <div class="bars">
      ${bar(t('kpi_protein'), r.total_protein, n.protein_min, n.protein_max, 'var(--c-protein)')}
      ${bar(t('kpi_fat'), r.total_fat, n.fat_min, n.fat_max, 'var(--c-fat)')}
      ${bar(t('kpi_carbs'), r.total_carbs, n.carbs_min, n.carbs_max, 'var(--c-carbs)')}
    </div></div>`;
}

function compareHTML(o, b) {
  const d = (x, y, u = '') => { const v = Math.round((x - y) * 10) / 10; return `${v > 0 ? '+' : ''}${v}${u}`; };
  const pct = b.total_cost > 0 ? Math.round((1 - o.total_cost / b.total_cost) * 100) : 0;
  return `<div class="card">
    <div class="card__head">
      <h3 class="h-section">${t('compare_title')}</h3>
      ${pct > 0 ? `<span class="tag tag--ok">${t('compare_tag', pct)}</span>` : ''}
    </div>
    <p class="small muted" style="margin-bottom:.75rem">${t('compare_sub')}</p>
    <div style="overflow-x:auto"><table class="compare">
      <thead><tr><th>${t('metric_name')}</th><th>${t('metric_cheapest')}</th><th>${t('metric_standard')}</th><th>${t('metric_diff')}</th></tr></thead>
      <tbody>
        <tr><td>${t('kpi_day_cost')}</td><td class="good">${fmtCost(o.total_cost)}</td><td>${fmtCost(b.total_cost)}</td><td>${d(o.total_cost, b.total_cost, S.currency === 'EUR' ? ' €' : ' грн')}</td></tr>
        <tr><td>${t('kpi_calories')}</td><td>${fmtInt(o.total_calories)}</td><td>${fmtInt(b.total_calories)}</td><td>${d(o.total_calories, b.total_calories)}</td></tr>
        <tr><td>${t('kpi_protein')}, g</td><td>${o.total_protein}</td><td>${b.total_protein}</td><td>${d(o.total_protein, b.total_protein)}</td></tr>
        <tr><td>${t('kpi_fat')}, g</td><td>${o.total_fat}</td><td>${b.total_fat}</td><td>${d(o.total_fat, b.total_fat)}</td></tr>
        <tr><td>${t('kpi_carbs')}, g</td><td>${o.total_carbs}</td><td>${b.total_carbs}</td><td>${d(o.total_carbs, b.total_carbs)}</td></tr>
        <tr><td>Foods</td><td>${o.menu.length}</td><td>${b.menu.length}</td><td>${o.menu.length - b.menu.length}</td></tr>
      </tbody></table></div>
  </div>`;
}

/* ─── Plan Click Events ─────────────────────────────────────── */
function onPlanClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'view') { S.view = b.dataset.v; S.aiText = null; renderPlan(); }
  if (act === 'variant') {
    S.variant = Math.max(0, Math.min(S.candidates.length - 1, S.variant + +b.dataset.v));
    S.aiText = null; renderPlan();
  }
  if (act === 'ban') {
    const id = +b.dataset.id;
    const prod = S.productsMap.get(id);
    if (!S.banned.includes(id)) S.banned.push(id);
    store.set('banned', S.banned);
    toast(`${getFoodName(prod, S.lang)}: ${t('toast_excluded')}`);
    runPlan({ newSeed: false });
  }
  if (act === 'to-list') {
    addToList([current().menu], t('menu_for_day'));
  }
  if (act === 'share') sharePlan();
  if (act === 'save') savePlan();
  if (act === 'print') window.print();
  if (act === 'ai') runAI();
  if (act === 'edit') { $('#profile-form').scrollIntoView({ behavior: 'smooth' }); $('#profile-form').age.focus(); }
  if (act === 'set-budget') { $('#budget-input').value = b.dataset.v; runPlan(); }
}

function sharePlan() {
  const r = current();
  const mealNames = MEAL_NAMES_I18N[S.lang] || MEAL_NAMES_I18N.de;
  const lines = [`DietOpt — ${t('menu_for_day')}: ${fmtCost(r.total_cost)}, ${fmtInt(r.total_calories)} kcal (P ${fmtInt(r.total_protein)}g / F ${fmtInt(r.total_fat)}g / C ${fmtInt(r.total_carbs)}g)`];
  MEAL_ORDER.forEach(m => {
    const it = r.menu.filter(i => i.meal === m); if (!it.length) return;
    lines.push('', (mealNames[m] || m) + ':');
    it.forEach(i => lines.push(`• ${shortName(i.name, i, S.lang)} — ${fmtAmount(i, S.lang)}`));
  });
  shareOrCopy({ title: 'DietOpt Meal Plan', text: lines.join('\n') });
}

function savePlan() {
  const r = current();
  const entry = {
    id: Date.now(),
    date: new Date().toISOString(),
    profile: S.profile,
    label: `${r.template} · ${fmtCost(r.total_cost)}`,
    result: r,
  };
  S.saved.unshift(entry);
  S.saved = S.saved.slice(0, 30);
  store.set('saved', S.saved);
  toast(t('toast_saved'));
}

async function runAI() {
  const box = $('#ai-out');
  const mealNames = MEAL_NAMES_I18N[S.lang] || MEAL_NAMES_I18N.de;
  if (!S.ai.key) {
    openDialog(`<div class="dialog__body">
      <h2 class="h-section">${t('ai_settings_title')}</h2>
      <p class="small muted">${t('ai_settings_sub')}</p>
      <form method="dialog" class="form" id="ai-quick">
        <label class="field"><span class="label">Gemini API Key</span><input name="key" type="password" placeholder="AIza…" required autocomplete="off"></label>
        <div class="dialog__foot"><button class="btn btn--ghost" value="cancel" formnovalidate>${t('cancel')}</button><button class="btn btn--primary" value="ok">${t('save')}</button></div>
      </form></div>`,
      dlg => {
        $('#ai-quick', dlg).addEventListener('submit', ev => {
          const k = ev.target.key.value.trim();
          if (ev.submitter?.value === 'ok' && k) {
            S.ai.key = k; store.set('ai', S.ai); setTimeout(runAI, 50);
          }
        });
      });
    return;
  }
  const r = current();
  box.innerHTML = `<div class="skel" style="height:220px"></div><p class="xs muted" style="margin-top:.5rem">Gemini AI is cooking recipes… (5–15s)</p>`;
  try {
    S.aiText = await geminiRecipes({
      apiKey: S.ai.key, model: S.ai.model, menu: r.menu,
      profile: S.profile, mealNames, lang: S.lang,
    });
    renderPlan();
    $('#ai-out')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (e) {
    const d = buildDishes(r.menu, S.lang);
    box.innerHTML = `<div class="notice notice--err" style="margin-bottom:.75rem"><span><b>AI unavailable:</b> ${esc(String(e.message))}.</span></div>
      <div class="dishes">${MEAL_ORDER.filter(m => d[m]).map(m => dishHTML(m, d[m])).join('')}</div>`;
  }
}

/* ─── Interactive Diet Builder ─────────────────────────────── */
const PRESET_I18N = {
  fitness: 'preset_fitness',
  abendbrot: 'preset_abendbrot',
  spar: 'preset_budget',
  student_ua: 'preset_student',
  classic_ua: 'preset_home',
  power_ua: 'preset_sport',
  balanced_world: 'preset_balanced',
};

function renderBuilderPresets() {
  const host = $('#builder-presets');
  if (!host) return;
  const presets = getPresetsForMarket(S.market);
  host.innerHTML = Object.entries(presets).map(([key, preset]) => {
    const label = PRESET_I18N[key] ? t(PRESET_I18N[key]) : preset.name;
    return `<button type="button" class="chip chip--preset" data-preset="${key}">${esc(label)}</button>`;
  }).join('');
}

function renderBuilder() {
  renderBuilderPresets();
  const dashboard = $('#builder-dashboard');
  const mealsContainer = $('#builder-meals');
  if (!dashboard || !mealsContainer) return;

  const totals = calcDayTotals(S.builder, S.productsMap, S.currency, S.prices);
  const targetNorms = S.norms || (S.profile ? calculateNorms(S.profile) : {
    target_calories: 2200, protein_min: 120, protein_max: 160,
    fat_min: 55, fat_max: 75, carbs_min: 220, carbs_max: 280,
  });

  const pKcal = Math.min(150, Math.round((totals.calories / targetNorms.target_calories) * 100));
  const targetProtein = Math.round((targetNorms.protein_min + targetNorms.protein_max) / 2);
  const pProt = Math.min(150, Math.round((totals.protein / targetProtein) * 100));
  const targetFat = Math.round((targetNorms.fat_min + targetNorms.fat_max) / 2);
  const pFat = Math.min(150, Math.round((totals.fat / targetFat) * 100));
  const targetCarbs = Math.round((targetNorms.carbs_min + targetNorms.carbs_max) / 2);
  const pCarbs = Math.min(150, Math.round((totals.carbs / targetCarbs) * 100));

  // Render Dashboard
  dashboard.innerHTML = `
    <div class="builder-stat-cost">
      <span class="eyebrow">${t('builder_cost')}</span>
      <div class="builder-cost-val">${fmtCost(totals.cost)}</div>
      <span class="xs muted">${t('builder_target')}: ${fmtInt(targetNorms.target_calories)} kcal</span>
    </div>
    <div class="builder-macro-bars">
      <div class="progress-bar-wrap">
        <div class="progress-bar-head">
          <span><b>${t('kpi_calories')}:</b> ${fmtInt(totals.calories)} / ${fmtInt(targetNorms.target_calories)} kcal</span>
          <span class="num">${pKcal}%</span>
        </div>
        <div class="progress-bar-track">
          <div class="progress-bar-fill" style="width:${Math.min(100, pKcal)}%;background:var(--color-primary)"></div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-3)">
        <div class="progress-bar-wrap">
          <div class="progress-bar-head">
            <span><b>${t('kpi_protein')}:</b> ${totals.protein}g</span>
            <span class="num">${pProt}%</span>
          </div>
          <div class="progress-bar-track">
            <div class="progress-bar-fill" style="width:${Math.min(100, pProt)}%;background:var(--c-protein)"></div>
          </div>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar-head">
            <span><b>${t('kpi_fat')}:</b> ${totals.fat}g</span>
            <span class="num">${pFat}%</span>
          </div>
          <div class="progress-bar-track">
            <div class="progress-bar-fill" style="width:${Math.min(100, pFat)}%;background:var(--c-fat)"></div>
          </div>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar-head">
            <span><b>${t('kpi_carbs')}:</b> ${totals.carbs}g</span>
            <span class="num">${pCarbs}%</span>
          </div>
          <div class="progress-bar-track">
            <div class="progress-bar-fill" style="width:${Math.min(100, pCarbs)}%;background:var(--c-carbs)"></div>
          </div>
        </div>
      </div>
    </div>`;

  // Render Meals
  const mealNames = MEAL_NAMES_I18N[S.lang] || MEAL_NAMES_I18N.de;
  mealsContainer.innerHTML = ['breakfast', 'lunch', 'dinner', 'snack'].map(m => {
    const items = S.builder[m] || [];
    let mKcal = 0, mCost = 0;
    items.forEach(it => {
      const prod = S.productsMap.get(it.id);
      if (prod) {
        const nut = calcItemNutrition(prod, it.grams, S.currency, S.prices);
        mKcal += nut.calories; mCost += nut.cost;
      }
    });

    return `
      <div class="builder-meal-card" data-bmeal="${m}">
        <header class="builder-meal-head">
          <div class="builder-meal-title">${ICON[m]} ${mealNames[m] || m}</div>
          <div class="builder-meal-meta">${fmtInt(mKcal)} kcal<br>${fmtCost(mCost)}</div>
        </header>

        ${items.length === 0 ? `<div class="builder-empty-hint">${t('builder_empty_meal')}</div>` : `
          <ul class="builder-meal-items">${items.map((it, idx) => {
            const prod = S.productsMap.get(it.id);
            if (!prod) return '';
            const nut = calcItemNutrition(prod, it.grams, S.currency, S.prices);
            const isEgg = lc(prod.n).includes('яйце') || lc(prod.n_de || '').includes('ei');
            return `
              <li class="builder-item-row" data-bidx="${idx}">
                <div class="builder-item-info">
                  <div class="builder-item-name">${esc(getFoodName(prod, S.lang))}</div>
                  <div class="builder-item-macros">${fmtInt(nut.calories)} kcal · P ${nut.protein}g · F ${nut.fat}g · C ${nut.carbs}g</div>
                </div>
                <div class="builder-stepper">
                  <button type="button" class="builder-step-btn" data-bact="dec" data-meal="${m}" data-idx="${idx}" aria-label="Decrease portion">-</button>
                  <span class="builder-item-amt">${isEgg ? Math.round(it.grams / 60) + ' ' + t('builder_pcs') : it.grams + ' ' + t('builder_grams')}</span>
                  <button type="button" class="builder-step-btn" data-bact="inc" data-meal="${m}" data-idx="${idx}" aria-label="Increase portion">+</button>
                </div>
                <div class="builder-item-cost">${fmtCost(nut.cost)}</div>
                <button type="button" class="builder-item-del" data-bact="del" data-meal="${m}" data-idx="${idx}" aria-label="Remove">${ICON.x}</button>
              </li>`;
          }).join('')}</ul>`}

        <div style="margin-top:auto;padding-top:var(--space-3)">
          <button type="button" class="btn btn--ghost btn--block" data-bact="add" data-meal="${m}">
            ${t('builder_add_food')}
          </button>
        </div>
      </div>`;
  }).join('');
}

function onBuilderClick(e) {
  const b = e.target.closest('[data-bact]');
  if (b) {
    const act = b.dataset.bact;
    const meal = b.dataset.meal;
    const idx = +b.dataset.idx;

    if (act === 'inc') {
      const it = S.builder[meal][idx];
      const prod = S.productsMap.get(it.id);
      const isEgg = lc(prod.n).includes('яйце') || lc(prod.n_de || '').includes('ei');
      it.grams += isEgg ? 60 : (it.grams >= 200 ? 50 : 25);
      saveBuilderState(S.builder);
      renderBuilder();
    }
    if (act === 'dec') {
      const it = S.builder[meal][idx];
      const prod = S.productsMap.get(it.id);
      const isEgg = lc(prod.n).includes('яйце') || lc(prod.n_de || '').includes('ei');
      const minStep = isEgg ? 60 : 25;
      if (it.grams > minStep) {
        it.grams -= isEgg ? 60 : (it.grams > 200 ? 50 : 25);
      } else {
        S.builder[meal].splice(idx, 1);
      }
      saveBuilderState(S.builder);
      renderBuilder();
    }
    if (act === 'del') {
      S.builder[meal].splice(idx, 1);
      saveBuilderState(S.builder);
      renderBuilder();
    }
    if (act === 'add') {
      openBuilderAddFoodDialog(meal);
    }
    return;
  }

  // Presets
  const pBtn = e.target.closest('[data-preset]');
  if (pBtn) {
    const pKey = pBtn.dataset.preset;
    const preset = ALL_PRESETS[pKey] || GERMAN_PRESETS[pKey];
    if (preset) {
      S.builder = JSON.parse(JSON.stringify(preset.items));
      saveBuilderState(S.builder);
      renderBuilder();
      toast(`${preset.name} loaded!`);
    }
    return;
  }

  // Clear
  if (e.target.id === 'builder-clear') {
    S.builder = { breakfast: [], lunch: [], dinner: [], snack: [] };
    saveBuilderState(S.builder);
    renderBuilder();
    toast(t('preset_clear'));
  }

  // Add to list
  if (e.target.closest('#builder-to-list')) {
    const planMenu = convertBuilderToPlanMenu(S.builder, S.productsMap, S.currency, S.prices);
    if (!planMenu.length) {
      toast(t('builder_empty_meal'));
      return;
    }
    addToList([planMenu], t('builder_title'));
  }

  // Save diet
  if (e.target.closest('#builder-save')) {
    const planMenu = convertBuilderToPlanMenu(S.builder, S.productsMap, S.currency, S.prices);
    if (!planMenu.length) return;
    const totals = calcDayTotals(S.builder, S.productsMap, S.currency, S.prices);
    const entry = {
      id: Date.now(),
      date: new Date().toISOString(),
      profile: S.profile || { budget: totals.cost },
      label: `Baukasten · ${fmtCost(totals.cost)}`,
      result: {
        status: 'builder',
        total_cost: totals.cost,
        total_calories: totals.calories,
        total_protein: totals.protein,
        total_fat: totals.fat,
        total_carbs: totals.carbs,
        menu: planMenu,
        template: t('builder_title'),
      }
    };
    S.saved.unshift(entry);
    store.set('saved', S.saved);
    toast(t('toast_saved'));
  }
}

function openBuilderAddFoodDialog(meal) {
  const allProds = S.data.products.filter(p => p.c !== 'alcohol' && !S.banned.includes(p.id));
  const mealName = (MEAL_NAMES_I18N[S.lang] || MEAL_NAMES_I18N.de)[meal] || meal;

  openDialog(`
    <div class="dialog__body dialog--food-picker">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <p class="eyebrow">${mealName}</p>
          <h2 class="h-section">${t('builder_dialog_title')}</h2>
        </div>
      </div>

      <div class="foods-tools" style="grid-template-columns:1fr">
        <label class="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input id="picker-search" type="search" placeholder="${esc(t('builder_search_ph'))}" autocomplete="off" autofocus>
        </label>
      </div>

      <div class="chips chips--scroll" id="picker-cats">
        <button type="button" class="chip" data-pcat="" aria-pressed="true">${t('all_cats')}</button>
        <button type="button" class="chip chip--preset" data-pcat="market_basics">⭐ ${S.market === 'de' ? '🇩🇪' : '🇺🇦'} ${t('market_basics')}</button>
        <button type="button" class="chip" data-pcat="dairy">🥛 ${getCatName(S.cats.dairy, S.lang)}</button>
        <button type="button" class="chip" data-pcat="grains">🌾 ${getCatName(S.cats.grains, S.lang)}</button>
        <button type="button" class="chip" data-pcat="poultry">🍗 ${getCatName(S.cats.poultry, S.lang)}</button>
        <button type="button" class="chip" data-pcat="fish_seafood">🐟 ${getCatName(S.cats.fish_seafood, S.lang)}</button>
        <button type="button" class="chip" data-pcat="vegetables">🥬 ${getCatName(S.cats.vegetables, S.lang)}</button>
        <button type="button" class="chip" data-pcat="fruits">🍎 ${getCatName(S.cats.fruits, S.lang)}</button>
      </div>

      <div class="food-picker-list" id="picker-list"></div>

      <form method="dialog" class="dialog__foot">
        <button class="btn btn--ghost" value="close">${t('cancel')}</button>
      </form>
    </div>
  `, dlg => {
    let q = '', cat = '';
    const BASIC_IDS = S.market === 'de'
      ? [138, 57, 483, 160, 239, 601, 602, 268, 158, 384, 365, 319, 316, 350, 112, 108, 96, 604, 443, 60, 426, 327, 344]
      : [53, 67, 57, 138, 160, 239, 253, 120, 121, 122, 95, 483, 319, 324, 325, 326, 327, 344, 384, 365, 158, 60];

    const renderPicker = () => {
      let filtered = allProds;
      if (cat === 'market_basics') {
        filtered = filtered.filter(p => BASIC_IDS.includes(p.id));
      } else if (cat) {
        filtered = filtered.filter(p => p.c === cat);
      }
      if (q) {
        const query = q.toLowerCase();
        filtered = filtered.filter(p => {
          const names = (p.n + ' ' + (p.n_de || '') + ' ' + (p.n_en || '') + ' ' + (p.n_ru || '')).toLowerCase();
          return names.includes(query);
        });
      }

      const listEl = $('#picker-list', dlg);
      const shown = filtered.slice(0, 50);

      listEl.innerHTML = shown.map(p => {
        const price = productBasePrice(p);
        return `
          <button type="button" class="food-picker-item" data-add-id="${p.id}">
            <div>
              <div class="item-title">${esc(getFoodName(p, S.lang))}</div>
              <div class="item-meta">${p.k} kcal · P ${p.p}g · F ${p.f}g · C ${p.cb}g / 100g</div>
            </div>
            <div style="text-align:right">
              <span class="item-price">${fmtCost(price)}</span>
              <span class="btn btn--sm btn--primary" style="margin-left:8px">${t('builder_add_btn')}</span>
            </div>
          </button>`;
      }).join('');
    };

    renderPicker();

    $('#picker-search', dlg).addEventListener('input', ev => {
      q = ev.target.value.trim();
      renderPicker();
    });

    $('#picker-cats', dlg).addEventListener('click', ev => {
      const b = ev.target.closest('[data-pcat]'); if (!b) return;
      cat = b.dataset.pcat;
      $$('#picker-cats .chip', dlg).forEach(c => c.setAttribute('aria-pressed', c === b ? 'true' : 'false'));
      renderPicker();
    });

    $('#picker-list', dlg).addEventListener('click', ev => {
      const b = ev.target.closest('[data-add-id]'); if (!b) return;
      const id = +b.dataset.addId;
      const prod = S.productsMap.get(id);
      if (!prod) return;

      const isEgg = lc(prod.n).includes('яйце') || lc(prod.n_de || '').includes('ei');
      const defaultG = isEgg ? 120 : (prod.c === 'oils_fats' ? 10 : (prod.c === 'nuts_seeds' ? 25 : 100));

      const existing = S.builder[meal].find(x => x.id === id);
      if (existing) {
        existing.grams += defaultG;
      } else {
        S.builder[meal].push({ id, grams: defaultG });
      }

      saveBuilderState(S.builder);
      renderBuilder();
      dlg.close();
      toast(`${getFoodName(prod, S.lang)} ${t('toast_added_to_list')}`);
    });
  });
}

/* ─── Week View ─────────────────────────────────────────────── */
function renderWeek() {
  const out = $('#week-output');
  if (!S.profile) {
    out.innerHTML = `<div class="panel empty">${ICON.cal}<b>${t('week_empty_profile')}</b><a class="btn btn--primary" href="#/plan">${t('edit_profile_btn')}</a></div>`;
    return;
  }
  if (!S.week) {
    out.innerHTML = `<div class="panel empty">${ICON.cal}<b>${t('week_empty_title')}</b><span>${t('week_empty_sub')}</span></div>`;
    return;
  }
  if (!S.week.length) {
    out.innerHTML = `<div class="notice notice--warn">${t('no_solution_title', fmtCost(S.profile.budget))}</div>`;
    return;
  }

  const dayNames = DAY_NAMES_I18N[S.lang] || DAY_NAMES_I18N.de;
  const total = S.week.reduce((s, d) => s + d.total_cost, 0);
  const kcal = S.week.reduce((s, d) => s + d.total_calories, 0) / 7;
  const dishesFor = d => buildDishes(d.menu, S.lang);

  out.innerHTML = `
    <div class="kpis week-sum">
      <div class="kpi kpi--accent">
        <span class="kpi__label">${t('week_cost_total')}</span>
        <span class="kpi__value">${fmtCost(total)}</span>
        <span class="kpi__sub">${t('week_per_day', fmtCost(total / 7))}</span>
      </div>
      <div class="kpi">
        <span class="kpi__label">${t('week_month_est')}</span>
        <span class="kpi__value">${fmtCost(total * 4.3)}</span>
      </div>
      <div class="kpi">
        <span class="kpi__label">${t('week_avg_kcal')}</span>
        <span class="kpi__value">${fmtInt(kcal)}<small>${t('kpi_kcal')}</small></span>
      </div>
      <div class="kpi">
        <span class="kpi__label">${t('week_templates_count')}</span>
        <span class="kpi__value">${new Set(S.week.map(d => d.template)).size}</span>
      </div>
    </div>
    <div class="actions" style="margin-bottom:1.25rem">
      <button class="btn btn--primary" data-wact="list">${ICON.cart} ${t('week_all_to_list')}</button>
      <button class="btn" data-wact="share">${ICON.share} ${t('btn_share')}</button>
      <button class="btn" data-wact="print">${ICON.print} ${t('btn_print')}</button>
    </div>
    <div class="days">${S.week.map((d, i) => {
      const ds = dishesFor(d);
      return `<article class="day">
        <header class="day__head">
          <div><div class="day__name">${dayNames[i] || 'Day ' + (i + 1)}</div><div class="day__tpl">${esc(d.template)}</div></div>
          <div class="day__cost">${fmtCost(d.total_cost)}</div>
        </header>
        <div class="day__body">${MEAL_ORDER.filter(m => ds[m]).map(m => `
          <div class="day__meal"><b>${(MEAL_NAMES_I18N[S.lang] || MEAL_NAMES_I18N.de)[m] || m}:</b> <span>${esc(ds[m].title)}</span></div>`).join('')}</div>
        <footer class="day__foot">
          <span>${fmtInt(d.total_calories)} kcal · P ${fmtInt(d.total_protein)}g</span>
          <button class="btn btn--sm" data-wact="open" data-i="${i}">${t('week_details_btn')}</button>
        </footer>
      </article>`;
    }).join('')}</div>`;
}

function onWeekClick(e) {
  const b = e.target.closest('[data-wact]'); if (!b) return;
  const a = b.dataset.wact;
  if (a === 'list') addToList(S.week.map(d => d.menu), t('week_title'));
  if (a === 'print') window.print();
  if (a === 'share') {
    const total = S.week.reduce((s, d) => s + d.total_cost, 0);
    const dayNames = DAY_NAMES_I18N[S.lang] || DAY_NAMES_I18N.de;
    const text = `DietOpt — ${t('week_title')} (${fmtCost(total)}):\n` + S.week.map((d, i) => {
      const ds = buildDishes(d.menu, S.lang);
      return `\n${dayNames[i]} (${fmtCost(d.total_cost)}): ` + MEAL_ORDER.filter(m => ds[m]).map(m => ds[m].title).join(' · ');
    }).join('');
    shareOrCopy({ title: t('week_title'), text });
  }
  if (a === 'open') {
    const d = S.week[+b.dataset.i];
    const ds = buildDishes(d.menu, S.lang);
    const dayNames = DAY_NAMES_I18N[S.lang] || DAY_NAMES_I18N.de;
    openDialog(`<div class="dialog__body" style="max-height:80dvh;overflow:auto">
      <div>
        <p class="eyebrow">${dayNames[+b.dataset.i]} · ${esc(d.template)}</p>
        <h2 class="h-section">${fmtCost(d.total_cost)} · ${fmtInt(d.total_calories)} kcal</h2>
      </div>
      <div class="meals">${MEAL_ORDER.map(m => mealHTML(m, d.menu.filter(i => i.meal === m), ds[m])).join('')}</div>
      <div class="dishes" style="grid-template-columns:1fr">${MEAL_ORDER.filter(m => ds[m]).map(m => dishHTML(m, ds[m])).join('')}</div>
      <form method="dialog" class="dialog__foot"><button class="btn btn--primary">${t('cancel')}</button></form></div>`,
      dlg => $$('.item__x', dlg).forEach(x => x.remove()));
  }
}

async function buildWeekNow() {
  if (!S.profile) { location.hash = '#/plan'; toast(t('week_empty_profile')); return; }
  const btn = $('#week-build'); btn.classList.add('is-loading');
  $('#week-output').innerHTML = `<div class="days">${'<div class="skel" style="height:260px"></div>'.repeat(3)}</div>`;
  await nextFrame();
  const products = filterProducts(S.data.products, S.profile, {
    bannedIds: S.banned, priceOverrides: S.prices, currency: S.currency,
  });
  S.week = buildWeek(products, S.profile, S.norms, Date.now());
  btn.classList.remove('is-loading');
  renderWeek();
}

/* ─── Shopping List ─────────────────────────────────────────── */
function addToList(menus, source) {
  const agg = aggregateShopping(menus);
  const map = new Map(S.list.items.map(i => [i.id, i]));
  agg.forEach(a => {
    const cur = map.get(a.id);
    if (cur) {
      cur.grams += a.grams;
      cur.cost = Math.round((cur.cost + a.cost) * 100) / 100;
      cur.done = false;
    } else {
      map.set(a.id, { ...a, done: false });
    }
  });
  S.list = { items: [...map.values()], source: S.list.items.length ? 'Combined Diet' : source };
  store.set('list', S.list);
  updateBadges();
  toast(t('toast_added_to_list'));
}

function qtyText(i) {
  const n = (i.name + ' ' + (i.n_de || '')).toLowerCase();
  const isEgg = n.includes('яйце') || n.includes('ei') || n.includes('egg');
  if (isEgg) {
    const pcs = Math.ceil(i.grams / 60);
    return `${pcs} ${S.lang === 'de' ? (pcs === 1 ? 'Ei' : 'Eier') : S.lang === 'en' ? (pcs === 1 ? 'egg' : 'eggs') : 'шт'}`;
  }
  const isLiquid = i.liquid || /молоко|кефір|ряжанк|йогурт|олія|öl|milch|juice/.test(n);
  if (i.grams >= 1000) return `${(i.grams / 1000).toFixed(2).replace(/\.?0+$/, '')} ${isLiquid ? 'L' : 'kg'}`;
  return `${Math.round(i.grams)} ${isLiquid ? 'ml' : 'g'}`;
}

function renderList() {
  const out = $('#list-output');
  const items = S.list.items;
  $('#list-share').disabled = !items.length;
  $('#list-clear').disabled = !items.length;

  if (!items.length) {
    out.innerHTML = `<div class="panel empty">${ICON.bag}<b>${t('list_empty_title')}</b><span>${t('list_empty_sub')}</span><a class="btn btn--primary" href="#/plan">${t('nav_plan')}</a></div>`;
    return;
  }

  const groups = {};
  items.forEach(i => { (groups[i.category] ||= []).push(i); });
  const total = items.reduce((s, i) => s + i.cost, 0);
  const left = items.filter(i => !i.done).reduce((s, i) => s + i.cost, 0);
  const done = items.filter(i => i.done).length;

  out.innerHTML = `<div class="shop">
    <div class="card shop-total">
      <div>
        <p class="eyebrow">${esc(S.list.source || t('list_title'))}</p>
        <div class="h-section num">${fmtCost(total)}</div>
        <span class="xs muted">${t('list_to_buy_left', fmtCost(left), done, items.length)}</span>
      </div>
    </div>
    ${Object.entries(groups).sort((a, b) => (S.cats[a[0]]?.id ?? 99) - (S.cats[b[0]]?.id ?? 99)).map(([cat, list]) => `
      <div class="shop-group">
        <h3>${esc(getCatName(S.cats[cat], S.lang) || cat)}</h3>
        <ul class="shop-list">${list.sort((a, b) => a.done - b.done).map(i => `
          <li class="shop-item ${i.done ? 'done' : ''}" data-id="${i.id}">
            <input type="checkbox" ${i.done ? 'checked' : ''} aria-label="Checked: ${esc(getFoodName(i, S.lang))}">
            <div>
              <div class="shop-item__name">${esc(shortName(i.name, i, S.lang))}</div>
              <div class="shop-item__qty">${qtyText(i)}</div>
            </div>
            <div class="shop-item__cost">${fmtCost(i.cost)}</div>
          </li>`).join('')}</ul>
      </div>`).join('')}
  </div>`;
}

function onListClick(e) {
  const li = e.target.closest('.shop-item'); if (!li) return;
  const it = S.list.items.find(i => i.id === +li.dataset.id); if (!it) return;
  it.done = !it.done; store.set('list', S.list); renderList(); updateBadges();
}

function updateBadges() {
  const n = S.list.items.filter(i => !i.done).length;
  $$('[data-count-list]').forEach(el => {
    el.hidden = !n;
    if (el.classList.contains('pill')) el.textContent = n;
  });
}

const BACKUP_KEYS = ['profile', 'banned', 'prices', 'list', 'saved', 'builder'];
function exportBackup() {
  const data = Object.fromEntries(BACKUP_KEYS.map(key => [key, store.get(key, null)]));
  const backup = {
    app: 'DietOpt', schema: 1, market: S.market,
    exported_at: new Date().toISOString(), data,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `dietopt-backup-${S.market}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast(t('backup_exported'));
}

function validBackupData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  if (data.list != null && (!Array.isArray(data.list.items) || data.list.items.length > 1000)) return false;
  if (data.saved != null && (!Array.isArray(data.saved) || data.saved.length > 100)) return false;
  if (data.banned != null && (!Array.isArray(data.banned) || data.banned.some(id => !Number.isFinite(Number(id))))) return false;
  if (data.prices != null && (typeof data.prices !== 'object' || Array.isArray(data.prices))) return false;
  if (data.builder != null && (typeof data.builder !== 'object' || Array.isArray(data.builder))) return false;
  return true;
}

async function importBackup(file) {
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('invalid');
    const backup = JSON.parse(await file.text());
    if (backup.app !== 'DietOpt' || backup.schema !== 1 || !validBackupData(backup.data)) throw new Error('invalid');
    if (backup.market !== S.market) {
      toast(t('backup_market_mismatch'));
      return;
    }
    for (const key of BACKUP_KEYS) {
      if (Object.hasOwn(backup.data, key)) store.set(key, backup.data[key]);
    }
    toast(t('backup_imported'));
    setTimeout(() => location.reload(), 550);
  } catch (error) {
    console.error(error);
    toast(t('backup_invalid'));
  }
}

/* ─── Food Database ─────────────────────────────────────────── */
const F = { q: '', cat: '', sort: 'name', limit: 60 };

function renderFoods() {
  const catsEl = $('#food-cats');
  if (catsEl) {
    catsEl.innerHTML = `<button class="chip" data-cat="" aria-pressed="${F.cat === ''}">${t('all_cats')}</button>` +
      S.data.categories.filter(c => c.name !== 'alcohol').map(c => `
        <button class="chip" data-cat="${c.name}" aria-pressed="${F.cat === c.name}">${esc(getCatName(c, S.lang))}</button>`).join('');
  }

  let list = S.data.products.map(p => {
    const basePr = productBasePrice(p);
    return {
      ...p,
      displayPrice: S.prices[p.id] ?? basePr,
      custom: p.id in S.prices,
    };
  });

  const q = F.q.trim().toLowerCase();
  if (q) {
    list = list.filter(p => {
      const allNames = (p.n + ' ' + (p.n_de || '') + ' ' + (p.n_en || '') + ' ' + (p.n_ru || '')).toLowerCase();
      return allNames.includes(q);
    });
  }

  if (F.cat) list = list.filter(p => p.c === F.cat);
  else list = list.filter(p => p.c !== 'alcohol');

  const sorters = {
    name: (a, b) => getFoodName(a, S.lang).localeCompare(getFoodName(b, S.lang)),
    price: (a, b) => a.displayPrice - b.displayPrice,
    protein_per_cost: (a, b) => (b.p / b.displayPrice) - (a.p / a.displayPrice),
    kcal_per_cost: (a, b) => (b.k / b.displayPrice) - (a.k / a.displayPrice),
    protein: (a, b) => b.p - a.p,
  };

  list.sort(sorters[F.sort] || sorters.name);
  const out = $('#foods-output');
  if (!list.length) {
    out.innerHTML = `<div class="panel empty"><b>${t('foods_empty_title')}</b><span>${t('foods_empty_sub')}</span></div>`;
    return;
  }

  const shown = list.slice(0, F.limit);
  out.innerHTML = `
    <p class="xs muted" style="margin:0 0 .5rem .25rem">${t('foods_found', list.length)}</p>
    <div class="foods">${shown.map(p => `
      <button class="food" data-id="${p.id}">
        <div>
          <div class="food__name">
            ${esc(getFoodName(p, S.lang))}
            ${S.banned.includes(p.id) ? `<span class="tag tag--accent">${t('food_banned_tag')}</span>` : ''}
            ${p.custom ? `<span class="tag tag--ok">${t('food_price_override_tag')}</span>` : ''}
          </div>
          <div class="food__meta">${p.k} kcal · P ${p.p}g · F ${p.f}g · C ${p.cb}g</div>
        </div>
        <div class="food__price">${fmtCost(p.displayPrice)}<small>${t('price_per_100g')}</small></div>
      </button>`).join('')}
    </div>
    ${list.length > F.limit ? `<div class="foods-more"><button class="btn" id="foods-more">${t('foods_show_more', Math.min(60, list.length - F.limit))}</button></div>` : ''}`;
}

function openFood(id) {
  const p = S.productsMap.get(id);
  const basePr = productBasePrice(p);
  const currentPr = S.prices[id] ?? basePr;
  const banned = S.banned.includes(id);

  openDialog(`<div class="dialog__body">
    <div>
      <p class="eyebrow">${esc(getCatName(S.cats[p.c], S.lang))}</p>
      <h2 class="h-section">${esc(getFoodName(p, S.lang))}</h2>
    </div>
    <div class="norms" style="margin:0">
      <div class="norm"><b>${p.k}</b><span>kcal / 100 g</span></div>
      <div class="norm"><b>${p.p} g</b><span>Protein</span></div>
      <div class="norm"><b>${p.f} g</b><span>Fett</span></div>
      <div class="norm"><b>${p.cb} g</b><span>Carbs</span></div>
    </div>
    <form method="dialog" class="form" id="food-form">
      <label class="field">
        <span class="label">${t('food_store_price')} <span class="muted xs">${t('food_base_price')} ${fmtCost(basePr)}</span></span>
        <span class="input-wrap">
          <input name="price" type="number" inputmode="decimal" step="0.05" min="0.05" value="${currentPr}">
          <i>${S.currency === 'EUR' ? '€' : 'грн'}</i>
        </span>
      </label>
      <label class="row-gap small" style="align-items:center;cursor:pointer">
        <input type="checkbox" name="ban" ${banned ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--color-accent)">
        ${t('food_exclude_check')}
      </label>
      <div class="dialog__foot">
        ${id in S.prices ? `<button class="btn btn--ghost" value="reset">${t('food_reset_price')}</button>` : ''}
        <button class="btn btn--ghost" value="cancel" formnovalidate>${t('cancel')}</button>
        <button class="btn btn--primary" value="ok">${t('save')}</button>
      </div>
    </form></div>`, dlg => {
    $('#food-form', dlg).addEventListener('submit', ev => {
      const v = ev.submitter?.value;
      if (v === 'cancel') return;
      const f = ev.target;
      if (v === 'reset') delete S.prices[id];
      else {
        const np = parseFloat(f.price.value);
        if (np > 0 && Math.abs(np - basePr) > 0.001) S.prices[id] = np;
        else delete S.prices[id];
        S.banned = S.banned.filter(x => x !== id);
        if (f.ban.checked) S.banned.push(id);
      }
      store.set('prices', S.prices); store.set('banned', S.banned);
      renderFoods(); toast(t('toast_prices_saved'));
    });
  });
}

/* ─── More / Settings View ──────────────────────────────────── */
function renderMore() {
  const sv = $('#saved-output');
  sv.innerHTML = S.saved.length ? `<ul class="saved">${S.saved.map(s => `
    <li>
      <div><b>${esc(s.label)}</b><span>${new Date(s.date).toLocaleDateString(S.lang === 'de' ? 'de-DE' : S.lang === 'en' ? 'en-US' : 'ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${fmtInt(s.result.total_calories)} kcal</span></div>
      <div class="row-gap">
        <button class="btn btn--sm" data-sact="open" data-id="${s.id}">${t('saved_open')}</button>
        <button class="btn btn--sm btn--ghost" data-sact="del" data-id="${s.id}" aria-label="${t('saved_delete')}">${ICON.x}</button>
      </div>
    </li>`).join('')}</ul>`
    : `<p class="small muted">${t('saved_empty')}</p>`;

  const ov = $('#overrides-output');
  const priced = Object.keys(S.prices).map(Number);
  const rows = [...new Set([...priced, ...S.banned])].map(id => S.productsMap.get(id)).filter(Boolean);
  ov.innerHTML = rows.length ? `<ul class="saved">${rows.map(p => `
    <li>
      <div><b>${esc(getFoodName(p, S.lang))}</b><span>${S.banned.includes(p.id) ? t('food_banned_tag') : ''}${S.banned.includes(p.id) && p.id in S.prices ? ' · ' : ''}${p.id in S.prices ? `${fmtCost(S.prices[p.id])}` : ''}</span></div>
      <button class="btn btn--sm btn--ghost" data-oact="reset" data-id="${p.id}">${t('reset_override')}</button>
    </li>`).join('')}</ul>`
    : `<p class="small muted">${t('overrides_empty')}</p>`;

  const status = $('#storage-status');
  if (status) status.textContent = t(store.isPersistent() ? 'storage_status_local' : 'storage_status_session');
  const marketName = t(S.market === 'de' ? 'market_de' : 'market_ua');
  const marketNote = $('#storage-market-detail');
  if (marketNote) marketNote.textContent = t('storage_market_detail', marketName);
  const aboutDb = $('#about-db');
  if (aboutDb) {
    aboutDb.textContent = `${fmtInt(S.data.products.length)} ${t('foods_count')} · ${S.data.currency}/100 g · ${t('price_estimate_short')}`;
  }
}

function onMoreClick(e) {
  const s = e.target.closest('[data-sact]');
  if (s) {
    const id = +s.dataset.id;
    if (s.dataset.sact === 'del') {
      S.saved = S.saved.filter(x => x.id !== id);
      store.set('saved', S.saved); renderMore();
    }
    if (s.dataset.sact === 'open') {
      const it = S.saved.find(x => x.id === id);
      if (it.result.status === 'builder') {
        location.hash = '#/builder';
      } else {
        writeForm(it.profile); S.profile = it.profile; S.norms = calculateNorms(it.profile);
        S.candidates = [it.result]; S.variant = 0; S.basic = null; S.view = 'opt'; S.aiText = null;
        location.hash = '#/plan'; setTimeout(renderPlan, 0);
      }
    }
    return;
  }
  const o = e.target.closest('[data-oact]');
  if (o) {
    const id = +o.dataset.id;
    delete S.prices[id]; S.banned = S.banned.filter(x => x !== id);
    store.set('prices', S.prices); store.set('banned', S.banned); renderMore();
  }
}

/* ─── Share / Clipboard Helper ──────────────────────────────── */
async function shareOrCopy({ title, text, url }) {
  const full = url ? `${text}\n\n${url}` : text;
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(full);
    toast(t('toast_copied'));
  } catch {
    const ta = document.createElement('textarea');
    ta.value = full; document.body.append(ta); ta.select();
    try { document.execCommand('copy'); toast(t('toast_copied')); } catch {}
    ta.remove();
  }
}

/* ─── Dialog Helper ─────────────────────────────────────────── */
function openDialog(html, setup) {
  const d = $('#dlg');
  d.innerHTML = html;
  setup?.(d);
  d.addEventListener('click', ev => { if (ev.target === d) d.close(); }, { once: true });
  d.showModal();
}

/* ─── Theme & PWA ───────────────────────────────────────────── */
function initTheme() {
  $('#theme-toggle').addEventListener('click', () => {
    const tMode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', tMode);
    try { localStorage.setItem('dietopt.theme', tMode); } catch {}
  });
}

let installEvt = null;
function initPWA() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); installEvt = e;
    const btn = $('#install-btn');
    if (btn) btn.hidden = false;
  });
  $('#install-btn')?.addEventListener('click', async () => {
    if (!installEvt) return;
    installEvt.prompt();
    await installEvt.userChoice;
    installEvt = null;
    $('#install-btn').hidden = true;
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch {}
  }
}

/* ─── Boot ──────────────────────────────────────────────────── */
async function boot() {
  initTheme();
  try {
    installMarketData(await loadMarketData(S.market));
  } catch (error) {
    console.error(error);
    $('#plan-empty').innerHTML = '<div class="notice notice--err">Food data could not be loaded. Please refresh.</div>';
    return;
  }

  initLanguageAndCurrency();
  initForm();
  updateStaticTexts();

  initPWA();
  updateBadges();

  // Event Listeners
  $('#plan-output').addEventListener('click', onPlanClick);
  $('#builder-dashboard').addEventListener('click', onBuilderClick);
  $('#builder-meals').addEventListener('click', onBuilderClick);
  $('#builder-presets').addEventListener('click', onBuilderClick);
  $('#builder-clear').addEventListener('click', onBuilderClick);
  $('#builder-to-list').addEventListener('click', onBuilderClick);
  $('#builder-save').addEventListener('click', onBuilderClick);

  $('#week-output').addEventListener('click', onWeekClick);
  $('#week-build').addEventListener('click', buildWeekNow);

  $('#list-output').addEventListener('click', onListClick);
  $('#list-clear').addEventListener('click', () => {
    openDialog(`<div class="dialog__body">
      <h2 class="h-section">${t('list_clear_confirm')}</h2>
      <p class="small muted">${t('list_clear_confirm_sub')}</p>
      <form method="dialog" class="dialog__foot">
        <button class="btn btn--ghost" value="no">${t('cancel')}</button>
        <button class="btn btn--primary" value="yes">${t('clear')}</button>
      </form></div>`,
      d => $('form', d).addEventListener('submit', ev => {
        if (ev.submitter?.value === 'yes') {
          S.list = { items: [], source: '' };
          store.set('list', S.list);
          renderList();
          updateBadges();
        }
      }));
  });

  $('#list-share').addEventListener('click', () => {
    const lines = S.list.items.filter(i => !i.done).map(i => `☐ ${shortName(i.name, i, S.lang)} — ${qtyText(i)}`);
    const total = S.list.items.filter(i => !i.done).reduce((s, i) => s + i.cost, 0);
    shareOrCopy({ title: t('list_title'), text: `${t('list_title')} (${fmtCost(total)}):\n${lines.join('\n')}` });
  });

  $('#backup-export')?.addEventListener('click', exportBackup);
  $('#backup-file')?.addEventListener('change', e => {
    importBackup(e.target.files?.[0]);
    e.target.value = '';
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
  $('#ai-form')?.addEventListener('submit', e => {
    e.preventDefault();
    S.ai = { key: e.target.key.value.trim(), model: e.target.model.value };
    store.set('ai', S.ai); toast(t('toast_prices_saved'));
  });
  $('#ai-clear')?.addEventListener('click', () => {
    S.ai = { key: '', model: S.ai.model };
    store.set('ai', S.ai); renderMore(); toast(t('toast_prices_saved'));
  });

  $('#reset-all')?.addEventListener('click', () => {
    openDialog(`<div class="dialog__body">
      <h2 class="h-section">${t('reset_all_confirm')}</h2>
      <p class="small muted">${t('reset_all_sub')}</p>
      <form method="dialog" class="dialog__foot">
        <button class="btn btn--ghost" value="no">${t('cancel')}</button>
        <button class="btn btn--primary" value="yes">${t('delete')}</button>
      </form></div>`,
      d => $('form', d).addEventListener('submit', ev => {
        if (ev.submitter?.value !== 'yes') return;
        try {
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key?.startsWith('dietopt.')) localStorage.removeItem(key);
          }
        } catch {}
        Object.keys(mem).forEach(key => delete mem[key]);
        location.hash = '#/plan'; location.reload();
      }));
  });

  window.addEventListener('hashchange', route);
  route();
}

boot();
