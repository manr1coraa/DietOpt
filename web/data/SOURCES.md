# DietOpt food-data sources: what fits which task

DietOpt needs three different kinds of data, and **no single source covers
all of them**. This file records which source is used (or planned) for each
task, under which licence, and what the honest status of every record is.

## The three tasks

| Task | What it needs | Good sources | Bad idea |
|---|---|---|---|
| **NUTRIENTS** — composition per 100 g of a food *concept* (oats, milk 2.5%, chicken breast) | Lab-analysed or compiled averages, documented method | BLS 4.0 (DE base foods), FAO/INFOODS AnFooD (analytical archive), label values via OFF (packaged goods only) | Copying one country's table for another market; inventing values |
| **BRANDS & PACKS** — real goods: on-pack name, brand, pack size, barcode | Crowd- or retailer-verified packaged-good records | Open Food Facts (ODbL) | Machine-translating a generic name and calling it a product |
| **PRICES** — what a good costs *here and now* | Store observations with market, currency, store, date | User's own receipt/store prices; Open Prices snapshots (coverage varies!) | Presenting an old estimate as a live offer |

## Source verdicts (checked 2026-10-07, do not assume — re-check)

### BLS 4.0 — German base foods (NUTRIENTS) ✅ suitable
- **What:** Bundeslebensmittelschlüssel, Germany's national nutrient database,
  maintained by the Max Rubner-Institut (MRI): ~7,140 foods × 138 nutrients.
- **Access:** free of charge and without licence barriers since v4.0
  (December 2025); download at <https://blsdb.de/> (Excel, ~13.6 MB).
- **Licence/attribution:** kostenfrei/lizenzfrei per MRI; attribute as
  *“Nutrient data: Bundeslebensmittelschlüssel (BLS) 4.0, Max Rubner-Institut”*.
- **Use in DietOpt:** reference for DE-market base-food nutrients. Import is a
  manual, curated snapshot (the full file is too large for the static app);
  every imported value keeps its BLS food code and version.
- **Status in app now:** NOT yet imported — current DE nutrients are
  `legacy-unverified` (see below). Import is tracked work, not done work.

### Open Food Facts — packaged goods (BRANDS & PACKS, label NUTRIENTS) ✅ suitable
- **What:** open, crowd-sourced database of 3M+ packaged products with names,
  brands, pack sizes, barcodes and label nutrition per 100 g.
- **Access:** free JSON API, no key (<https://world.openfoodfacts.org/data>).
- **Licence/attribution (mandatory):** database under **ODbL 1.0**, contents
  under **DbCL**, images CC-BY-SA. Any public use must carry
  *“Contains data from Open Food Facts, available under the Open Database License”*.
- **Use in DietOpt:** real market offers (DE and UA) with barcode, brand, pack
  size, label nutrients and `last_updated` date. Imported via
  `tools/import_off.py`, one record at a time, with its barcode kept.
- **Caveat:** coverage is uneven per market; single fields may be missing.
  Nothing is inferred to fill a gap — missing stays missing.

### FAO/INFOODS — analytical archive (NUTRIENTS, reference) ⚠️ partial
- **What:** global directory of food composition tables + the AnFooD analytical
  database (lab values from literature, per 100 g edible portion).
- **Ukraine verdict:** no official open Ukrainian national food composition
  database was found in the FAO/INFOODS directory as of 2026-10-07.
  Ukrainian nutrients in DietOpt are therefore **`legacy-unverified`**, never
  presented as official. If a source appears, it will be added here first.
- **Use in DietOpt:** sanity-checking values and documenting method; not a
  primary import pipeline yet.

### Prices — NO open live source for DE/UA ⚠️ estimates only
- There is **no open, maintained API of German or Ukrainian supermarket
  prices** (checked 2026-10-07). Flyer aggregators have no open API.
- **Open Prices** (<https://prices.openfoodfacts.org>, same OFF community,
  open data + API) is the only open candidate; its coverage for DE/UA is
  **unverified** — do not claim it covers our markets until checked.
- **Consequence:** every price shipped with DietOpt is an explicitly marked
  **estimate** (`price_status: "estimate"`, shown with `~`), with market,
  currency and reference date. The app encourages entering your own store
  prices, which override estimates locally. A price is only shown without `~`
  when it has market + currency + store/source + date.

## Record-status vocabulary (used in data files and UI)

- `legacy-unverified` — carried over from the pre-source SQLite import of
  unknown origin. Usable as a rough planning value, never cited as fact.
- `estimate` — a price with market + currency + reference date but no
  store/source. Shown with `~`.
- `sourced` — has source + date (+ store for prices, + barcode for OFF goods).
- `approximate` — a cross-market link (e.g. UA tvorog ≈ DE quark) that is
  explicitly NOT identity. Shown as “similar, not the same”.

## Provenance rules for every record

1. Every concept keeps `src` (nutrient provenance) and every offer keeps
   `source` + `updated` (ISO date). No silent values.
2. Market display names are either `on_pack` (verified packaged good) or
   `generic` (ordinary shelf/category name in the market language).
   Generic names are language facts, never presented as verified packs.
3. A generic market name must match the nutrition the record actually carries
   (e.g. 2.5%-fat milk is not called “Vollmilch 3,5%”).
4. Similar foods across markets (Quark ≠ творог) are separate records with an
   explicit, optional, `approximate` link — never one row with translations.
