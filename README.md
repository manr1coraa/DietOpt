# DietOpt

A simple meal and shopping planner for **Germany and Ukraine**. Choose a market, set a daily budget and get meal ideas with a practical shopping list. The interface is available in German, English, Russian and Ukrainian.

**Live app:** https://manr1coraa.github.io/DietOpt/

## What it does

- Builds a daily menu from a budget and basic preferences.
- Lets you edit portions, add foods and save menu ideas.
- Creates a shopping list that can be checked off or sent as a text copy.
- Uses separate product prices and preferences for Germany and Ukraine; international foods and meals can be shared between both markets.
- Includes a service worker for offline caching and can be installed as a web app.

## Regional food data

The browser app uses static JSON data, not a live supermarket feed:

- `web/data/catalog/products.json` — shared food catalogue, nutrition values, categories and translations.
- `web/data/markets/de.json` — German-market prices in EUR per 100 g.
- `web/data/markets/ua.json` — Ukrainian-market prices in UAH per 100 g.

Prices are reference estimates, not current offers from a particular store. In the app, you can enter your own local prices. Market-specific preferences and shopping lists are kept separately.

To update Ukrainian product data from the SQLite source, run `python tools/export_db.py`. This preserves manually added catalogue entries and does not overwrite the Germany price file. Edit `web/data/markets/de.json` separately to update German prices.

## Your data and privacy

The GitHub Pages app is static. Your profile, saved menus, shopping list and custom prices are stored in **local storage in the browser on your device**. Closing or refreshing the page does not delete them. Clearing the browser's site data, using private/incognito mode, or switching browsers/devices may remove or hide them.

Each friend using a different device has their own private data. The “Send list” action shares a text snapshot; it does **not** create a live shared list. Use **More → Your data → Download backup / Import backup** to move your saved data between devices. The optional Python backend in this repository is not connected to the public Pages app. For real-time sync between friends, a separately hosted API and persistent database would be needed.

No account is required, and the public Pages site does not receive the personal data you enter. If you choose the optional AI-recipe feature, the selected menu and profile are sent to Google for that request.

## Run locally

The main app needs no build step or server-side database:

```bash
python -m http.server 8000 --directory web
```

Open <http://localhost:8000>. To prepare for offline use, open it once while online; the service worker is set up to cache the app and both market databases.

## Publish

GitHub Pages is configured to publish the `web/` directory through `.github/workflows/pages.yml` whenever `main` changes. The project itself is in this repository; the website is a separate deployable front end.

## Repository layout

```text
web/                         Browser app and GitHub Pages site
  data/catalog/              Shared international food catalogue
  data/markets/              Separate Germany and Ukraine price data
  js/                        UI, meal logic, regional data loader, translations
backend/                     Optional local FastAPI / SQLite API
 tools/export_db.py          Export product nutrition and Ukrainian prices
.github/workflows/pages.yml  Publish the web app to GitHub Pages
```
