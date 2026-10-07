const MARKET_FILES = {
  de: './data/markets/de.json',
  ua: './data/markets/ua.json',
};
const CATALOG_FILE = './data/catalog/products.json';

/** Load the shared nutrition catalogue together with one country's own prices. */
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

  // A food is available in a market only when that market has its own price row.
  const products = catalog.products
    .filter(product => Number.isFinite(Number(localMarket.prices[product.id])))
    .map(product => ({
      ...product,
      pr: Number(localMarket.prices[product.id]),
      price_currency: localMarket.currency,
      market: localMarket.market,
    }));

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
