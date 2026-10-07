"""Fetch ONE Open Food Facts product by barcode and print a DietOpt offer row.

Run (needs internet; not available in every sandbox):
    python tools/import_off.py 4000540000108 de 57

Arguments: BARCODE MARKET CONCEPT_ID
- BARCODE: EAN-8/13 printed on the pack.
- MARKET: de | ua (must match the product's countries_tags, else refuses).
- CONCEPT_ID: numeric DietOpt concept id this good is an offer of.

The output JSON is meant to be reviewed by a human and pasted into
web/data/markets/<market>.json under "offers". Nothing is written
automatically: every import is a deliberate, attributed act.

Licence: Open Food Facts data is ODbL 1.0 (contents DbCL). DietOpt carries
the mandatory attribution in README.md and web/data/SOURCES.md; each
imported offer keeps its barcode + fetch date so the origin stays traceable.
"""

import datetime
import json
import sys
import urllib.request


def fetch_product(barcode: str) -> dict:
    url = (
        "https://world.openfoodfacts.org/api/v2/product/"
        f"{barcode}.json?fields=code,product_name,brands,quantity,"
        "nutriments,countries_tags,last_updated_t"
    )
    request = urllib.request.Request(url, headers={"User-Agent": "DietOpt/5.x (data curation)"})
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)
    if payload.get("status") != 1:
        raise SystemExit(f"OFF has no product for barcode {barcode}")
    return payload["product"]


def to_offer(product: dict, market: str) -> dict:
    countries = [tag.split(":", 1)[-1] for tag in product.get("countries_tags", [])]
    want = {"de": "germany", "ua": "ukraine"}[market]
    if want not in countries:
        raise SystemExit(f"product is sold in {countries}, not in {want}; refusing import")
    nutr = product.get("nutriments", {})
    missing = [k for k in ("proteins_100g", "fat_100g", "carbohydrates_100g", "energy-kcal_100g")
               if nutr.get(k) is None]
    if missing:
        raise SystemExit(f"label nutrition incomplete, missing {missing}; refusing import")
    updated = datetime.date.fromtimestamp(product.get("last_updated_t", 0)).isoformat() \
        if product.get("last_updated_t") else "unknown"
    return {
        "name": product.get("product_name") or "UNKNOWN — fill manually",
        "kind": "on_pack",
        "brand": (product.get("brands") or "").split(",")[0].strip() or None,
        "pack": product.get("quantity") or None,
        "barcode": product.get("code"),
        "nutrition": {
            "p": nutr["proteins_100g"],
            "f": nutr["fat_100g"],
            "cb": nutr["carbohydrates_100g"],
            "k": nutr["energy-kcal_100g"],
        },
        "nutrition_src": f"OFF:{product.get('code')}",
        "source": "Open Food Facts (ODbL)",
        "updated": updated,
        "fetched": datetime.date.today().isoformat(),
    }


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: python tools/import_off.py BARCODE MARKET CONCEPT_ID")
    barcode, market, concept_id = sys.argv[1], sys.argv[2], sys.argv[3]
    if market not in ("de", "ua"):
        raise SystemExit("MARKET must be de or ua")
    product = fetch_product(barcode)
    offer = to_offer(product, market)
    print(f"# Offer for concept {concept_id} ({market}), BARCODE {barcode}")
    print("# Paste under web/data/markets/" + market + '.json -> "offers"')
    print(json.dumps({concept_id: offer}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
