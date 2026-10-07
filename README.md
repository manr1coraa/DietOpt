# DietOpt

A simple meal and shopping planner for **Germany and Ukraine**. Choose a market, set a daily budget and get meal ideas with a practical shopping list. The interface is available in German, English, Russian and Ukrainian.

**Live app:** https://manr1coraa.github.io/DietOpt/ (static GitHub Pages site, published from `web/` on `main`)

## Market and language are independent

- **Market (🇩🇪 Deutschland / 🇺🇦 Ukraine)** defines the assortment, the product names as sold locally, the prices and the currency. It is saved and restored between visits.
- **Interface language (DE / EN / RU / UK)** defines labels only. Germany + Russian or Germany + Ukrainian work fine — product names stay German because that is what is on the shelf.

## What it does

- Builds a daily menu from a budget and basic preferences (cheapest plan optimizes **price + nutrients only** — not taste, availability or pack sizes).
- Shows simple **offline dish templates** for every menu — no API key, no internet needed. They are labelled as offline templates.
- Offers optional **AI recipes** (Google Gemini) only after your explicit consent: the dialog explains what is sent (menu + profile, no name), where (Google), and how the key is stored (locally in your browser). AI output is labelled; quota/network/key errors fall back to the offline templates.
- Creates a shopping list: tap a row or checkbox (or Tab + Space), struck-through rows persist per market. Adding a menu twice **merges quantities** instead of duplicating rows — the toast tells you how many lines were merged.
- Lets you edit portions, add foods, save menu ideas, and enter your own store prices (they override estimates locally).

## Food data: concepts + market goods (honestly labelled)

DietOpt does **not** claim two full databases. The model is:

- `web/data/catalog/products.json` — **food concepts**: nutrition values, categories and translations. A concept is shared across markets **only when the foods are truly comparable**. Similar foods are separate records with an explicit `approximate` link — e.g. German *Quark* (concepts 610–612, DE-only) and Ukrainian *сир кисломолочний* (concepts 137–139, UA-only) are **not** treated as identical.
- `web/data/markets/de.json`, `web/data/markets/ua.json` — each market's **own goods**: its price rows plus an `offers` overlay with the market display name and, only when verified, brand, pack size, barcode, sourced price or nutrition.

Every record carries provenance: nutrient source (`src`), offer `source` + `updated` date. Prices shipped with the app are **estimates** (market + currency + reference date, shown with `~`); a price loses the `~` only with store/source + date. Nutrient values not yet checked against an official table are flagged `legacy-unverified` and the UI says so.

**Sources (details + licences in [`web/data/SOURCES.md`](web/data/SOURCES.md)):**

- Nutrients for German base foods: **BLS 4.0** (Max Rubner-Institut, free of charge since Dec 2025) — planned reference, not yet imported.
- Packaged goods (brands, packs, barcodes, label nutrients): **Open Food Facts** (ODbL) — one verified offer imported (Kölln oats, barcode kept); pipeline: `tools/import_off.py`.
- Ukraine: **no official open food-composition database was found** (checked 2026-10-07) — Ukrainian nutrients stay `legacy-unverified`, never presented as official.
- Prices: **no open live supermarket price API exists for DE/UA** — all shipped prices are estimates; Open Prices coverage is unverified.

Contains data from Open Food Facts, available under the Open Database License.

International dishes stay available in both markets: the region defines market data, never bans a recipe.

## Your data and privacy

The app is static. Your profile, saved menus, shopping list, custom prices, AI key and consent live in **local storage in your browser, on your device** (per-market data is kept separately; language, market, theme, AI key and consent are per-device). Refreshing keeps them; clearing site data, private mode, or another browser/device hides them.

Each friend has their own private data. **“Share” sends a text snapshot — there is no live shared list and no sync.** Use **More → Your data → Download backup / Import backup** to move data between devices. The optional Python backend in this repository is **not** connected to the public app. The AI feature is the only network call with your data, and only after consent.

## Calculations are estimates, not medical advice

Daily targets use the **Mifflin–St Jeor** equation × activity factor (PAL) with goal adjustments — standard textbook formulas. They are a rough orientation, not a medical recommendation. Menus are never labelled “healthiest”: the optimizer minimizes cost under nutrient targets, nothing more.

## Run locally

No build step, no database:

```bash
python -m http.server 8000 --directory web
```

Open <http://localhost:8000>. Open it once while online and the service worker caches the app + data for offline use.

## Tests

```bash
npm test          # unit + jsdom DOM tests (node)
npm run test:e2e  # real Chromium via Playwright (runs in CI, see below)
```

Real-browser coverage (mobile 390 px touch + desktop 1280 px, viewports 320/375/390/768/1280, keyboard, reload persistence, Service Worker offline) runs in GitHub Actions on every push (`.github/workflows/e2e.yml`).

## Repository layout

```text
web/                         Browser app and GitHub Pages site
  data/catalog/              Food concepts (shared only when comparable)
  data/markets/              Per-market goods: prices + offers overlay
  data/SOURCES.md            Source registry: what fits which task + licences
  js/                        UI, optimizer, market merge, recipes, i18n, shopping
backend/                     Optional local FastAPI / SQLite (not connected to Pages)
tools/export_db.py           Legacy SQLite → catalogue + UA prices
tools/import_off.py          Curated Open Food Facts offer importer (needs net)
tests/unit|dom|e2e           Node tests, jsdom tests, Playwright specs
.github/workflows/           pages.yml (deploy) + e2e.yml (tests)
```

## What is still open (no pretending)

- Nutrient values are largely `legacy-unverified`; BLS 4.0 import is designed, not done.
- Most offers are `generic` market names; verified packs/brands grow one import at a time.
- Prices are estimates until sourced observations (store + date) exist.
- No account, no sync, no live sharing — by design, until a hosted backend is separately agreed.
