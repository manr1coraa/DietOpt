/* ═══════════════════════════════════════════════════════════════
   market-data.js — merge food CONCEPTS with MARKET OFFERS.

   Model (see web/data/SOURCES.md):
   - catalog/products.json holds food concepts: nutrition + translations.
     A concept is shared across markets only when the foods are truly
     comparable (Quark and tvorog are NOT one concept).
   - markets/<m>.json holds that market's own goods: price rows plus an
     "offers" overlay with the market display name, and — only when
     verified — brand, pack size, barcode, sourced price or nutrition.

   The active market defines assortment and display names; the interface
   language defines labels. Product names NEVER come from UI translations.
   ═══════════════════════════════════════════════════════════════ */

const MARKET_FILES = {
  de: './data/markets/de.json',
  ua: './data/markets/ua.json',
};
const CATALOG_FILE = './data/catalog/products.json';

/** Fallback display name when a concept has no explicit market offer. */
export function conceptMarketName(product, market) {
  if (market === 'de') return product.n_de || product.n;
  return product.n;
}

/** Merge one concept with its market price row and offer (pure, tested). */
export function mergeOffer(product, marketDoc) {
  const offers = marketDoc.offers || {};
  const offer = offers[product.id] || offers[String(product.id)] || null;
  if (offer && offer.available === false) return null;

  const priceRow = marketDoc.prices[product.id] ?? marketDoc.prices[String(product.id)];
  if (!Number.isFinite(Number(priceRow))) return null;

  const sourcedPrice = offer && Number.isFinite(Number(offer.price)) ? Number(offer.price) : null;
  const nutrition = (offer && offer.nutrition) || null;
  return {
    ...product,
    market: marketDoc.market,
    // Assortment + market display name (never a UI-language translation).
    dname: (offer && offer.name) || conceptMarketName(product, marketDoc.market),
    name_kind: offer ? (offer.kind || 'generic') : 'concept',
    offer,
    // Price: sourced only with store/source + date, else an explicit estimate.
    pr: sourcedPrice ?? Number(priceRow),
    price_currency: marketDoc.currency,
    price_status: sourcedPrice != null ? 'sourced' : (marketDoc.prices_are_estimates ? 'estimate' : 'sourced'),
    price_source: (offer && offer.price_source) || null,
    price_date: (offer && offer.price_date) || marketDoc.price_reference_date || null,
    // Nutrition: offer override (verified pack) or concept value + provenance.
    p: nutrition?.p ?? product.p,
    f: nutrition?.f ?? product.f,
    cb: nutrition?.cb ?? product.cb,
    k: nutrition?.k ?? product.k,
    nutrition_src: (offer && offer.nutrition_src) || product.src || 'legacy-unverified',
  };
}

/** Load the shared concept catalogue together with one market's own goods. */
export async function loadMarketData(market, fetcher = fetch) {
  const marketFile = MARKET_FILES[market];
  if (!marketFile) throw new Error(`Unsupported market: ${market}`);

  const [catalogResponse, marketResponse] = await Promise.all([
    fetcher(CATALOG_FILE),
    fetcher(marketFile),
  ]);
  if (!catalogResponse.ok || !marketResponse.ok) {
    throw new Error('Could not load the food catalogue for this market.');
  }

  const [catalog, localMarket] = await Promise.all([
    catalogResponse.json(),
    marketResponse.json(),
  ]);
  if (localMarket.market !== market || !localMarket.prices) {
    throw new Error(`Market data is invalid: ${market}`);
  }

  // A food is available in a market only with that market's own price row
  // (and unless its offer explicitly marks it unavailable).
  const products = catalog.products
    .map(product => mergeOffer(product, localMarket))
    .filter(Boolean);

  return {
    version: catalog.version,
    market: localMarket.market,
    market_name: localMarket.name,
    currency: localMarket.currency,
    price_unit: localMarket.price_unit,
    prices_are_estimates: Boolean(localMarket.prices_are_estimates),
    price_reference_date: localMarket.price_reference_date,
    categories: catalog.categories,
    products,
  };
}
