"""Export the SQLite product table into the shared catalogue and Ukraine prices.

Run: python tools/export_db.py
Germany's independent price table lives in web/data/markets/de.json and is
maintained separately; exporting Ukrainian prices never overwrites it.
"""

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "backend" / "food_tracker.db"
CATALOG = ROOT / "web" / "data" / "catalog" / "products.json"
UA_MARKET = ROOT / "web" / "data" / "markets" / "ua.json"


def read_json(path: Path, default: dict) -> dict:
    try:
        with path.open(encoding="utf-8") as stream:
            return json.load(stream)
    except (OSError, json.JSONDecodeError):
        return default


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as stream:
        json.dump(payload, stream, ensure_ascii=False, indent=2)
        stream.write("\n")


def main() -> None:
    previous_catalog = read_json(CATALOG, {})
    previous_products = {item["id"]: item for item in previous_catalog.get("products", [])}
    previous_categories = {item["name"]: item for item in previous_catalog.get("categories", [])}
    previous_ua_market = read_json(UA_MARKET, {})

    connection = sqlite3.connect(DB)
    connection.row_factory = sqlite3.Row
    categories = []
    for row in connection.execute(
        "SELECT id, name, name_ua, icon, color FROM categories ORDER BY id"
    ):
        prior = previous_categories.get(row["name"], {})
        categories.append({
            **prior,
            "id": row["id"],
            "name": row["name"],
            "name_ua": row["name_ua"],
            "icon": row["icon"],
            "color": row["color"],
        })

    products = []
    ua_prices = {}
    rows = connection.execute("""
        SELECT p.id, p.name, c.name AS category, p.proteins, p.fats,
               p.carbs, p.calories, p.price, p.is_liquid
        FROM products p JOIN categories c ON c.id = p.category_id
        ORDER BY p.name
    """)
    for row in rows:
        prior = previous_products.get(row["id"], {})
        product = {
            key: prior[key]
            for key in ("n_ru", "n_en", "n_de")
            if prior.get(key)
        }
        product.update({
            "id": row["id"],
            "n": row["name"].strip(),
            "c": row["category"],
            "p": row["proteins"] or 0,
            "f": row["fats"] or 0,
            "cb": row["carbs"] or 0,
            "k": row["calories"] or 0,
            "l": int(row["is_liquid"] or 0),
        })
        products.append(product)
        ua_prices[str(row["id"])] = round(float(row["price"] or 0), 4)

    # Keep hand-added international/German catalogue rows that have no SQLite row.
    database_ids = {product["id"] for product in products}
    for product_id, prior in previous_products.items():
        if product_id in database_ids:
            continue
        products.append({key: value for key, value in prior.items() if key not in {"pr", "pr_eur"}})
        old_price = previous_ua_market.get("prices", {}).get(str(product_id))
        if old_price is not None:
            ua_prices[str(product_id)] = old_price

    connection.close()

    catalog = {
        "version": previous_catalog.get("version", "1"),
        "description": "Shared international food catalogue with nutrition values and translations.",
        "categories": categories,
        "products": products,
    }
    write_json(CATALOG, catalog)

    market = read_json(UA_MARKET, {})
    market.update({
        "market": "ua",
        "name": "Україна",
        "currency": "UAH",
        "price_unit": "UAH/100g",
        "prices_are_estimates": True,
        "note": "Reference estimates only; users can enter their own local store prices.",
        "prices": ua_prices,
    })
    write_json(UA_MARKET, market)
    print(f"Exported {len(products)} foods and {len(ua_prices)} Ukrainian prices.")
    print(f"Catalogue: {CATALOG.relative_to(ROOT)}")
    print(f"Ukraine market: {UA_MARKET.relative_to(ROOT)}")
    print("Germany's market prices were left unchanged.")


if __name__ == "__main__":
    main()
