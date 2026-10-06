# export_db.py — експорт бази food_tracker.db у web/data/products.json
# Запуск:  python tools/export_db.py
# Після зміни цін/продуктів у SQLite запустіть цей скрипт ще раз,
# щоб веб-версія отримала свіжі дані.

import json
import os
import sqlite3
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "backend", "food_tracker.db")
OUT = os.path.join(ROOT, "web", "data", "products.json")


def main():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    cats = [dict(r) for r in c.execute(
        "SELECT id, name, name_ua, icon, color FROM categories ORDER BY id")]
    rows = c.execute("""
        SELECT p.id, p.name, c.name AS cat, p.proteins, p.fats, p.carbs,
               p.calories, p.price, p.is_liquid
        FROM products p JOIN categories c ON c.id = p.category_id
        ORDER BY p.name
    """).fetchall()
    products = [{
        "id": r["id"], "n": r["name"].strip(), "c": r["cat"],
        "p": r["proteins"], "f": r["fats"], "cb": r["carbs"],
        "k": r["calories"], "pr": r["price"], "l": int(r["is_liquid"] or 0),
    } for r in rows]
    c.close()

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({
            "version": date.today().isoformat(),
            "currency": "UAH",
            "categories": cats,
            "products": products,
        }, f, ensure_ascii=False, separators=(",", ":"))
    print(f"OK: {len(products)} продуктів, {len(cats)} категорій -> {OUT}")


if __name__ == "__main__":
    main()
