# database.py — Модуль роботи з базою даних SQLite
# Працює з новою структурою БД: categories + products + food_log
# Кваліфікаційна робота: Литвин А.В., ХНУ ім. В.Н. Каразіна, 2026

import sqlite3
import os
import logging

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "food_tracker.db")


# ════════════════════════════════════════════════════════════
#  ПІДКЛЮЧЕННЯ
# ════════════════════════════════════════════════════════════

def _conn():
    """Повертає з'єднання до SQLite з row_factory."""
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(f"БД не знайдена: {DB_PATH}")
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


# ════════════════════════════════════════════════════════════
#  ІНІЦІАЛІЗАЦІЯ — створення додаткових таблиць
# ════════════════════════════════════════════════════════════

def init_db():
    """
    Створює таблицю optimization_logs якщо не існує.
    Викликається при старті сервера.
    """
    try:
        c = _conn()
        c.execute("""
            CREATE TABLE IF NOT EXISTS optimization_logs (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                ts              TEXT    DEFAULT (datetime('now','localtime')),
                budget          REAL,
                target_calories REAL,
                result_cost     REAL,
                result_calories REAL,
                products_count  INTEGER,
                solve_time_ms   REAL,
                status          TEXT
            )
        """)
        c.commit()
        c.close()
        logger.info("✅ Таблиця optimization_logs готова")
    except Exception as e:
        logger.error(f"init_db: {e}")


# ════════════════════════════════════════════════════════════
#  ЛОГУВАННЯ ОПТИМІЗАЦІЙ
# ════════════════════════════════════════════════════════════

def log_optimization(budget, target_cal, cost, cal, cnt, ms, status):
    """Записує один запуск оптимізації в лог."""
    try:
        c = _conn()
        c.execute(
            "INSERT INTO optimization_logs "
            "(budget, target_calories, result_cost, result_calories, "
            " products_count, solve_time_ms, status) "
            "VALUES (?,?,?,?,?,?,?)",
            (budget, target_cal, cost, cal, cnt, ms, status),
        )
        c.commit()
        c.close()
    except Exception as e:
        logger.error(f"log_optimization: {e}")


# ════════════════════════════════════════════════════════════
#  КАТЕГОРІЇ
# ════════════════════════════════════════════════════════════

def get_all_categories() -> list[dict]:
    """Повертає всі категорії з БД."""
    try:
        c = _conn()
        rows = c.execute(
            "SELECT id, name, name_ua, icon, color "
            "FROM categories ORDER BY id"
        ).fetchall()
        c.close()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"get_all_categories: {e}")
        return []


# ════════════════════════════════════════════════════════════
#  ПРОДУКТИ
# ════════════════════════════════════════════════════════════

def _build_product_dict(row) -> dict:
    """Конвертує рядок БД у словник продукту для API."""
    return {
        "id": row["id"],
        "name": row["name"],
        "protein": row["proteins"],
        "fat": row["fats"],
        "carbs": row["carbs"],
        "calories": row["calories"],
        "price_per_100g": row["price"],
        "category": row["cat_name"] if "cat_name" in row.keys() else "",
        "category_ua": row["cat_name_ua"] if "cat_name_ua" in row.keys() else "",
        "category_icon": row["cat_icon"] if "cat_icon" in row.keys() else "",
    }


def get_products_count() -> int:
    """Повертає загальну кількість продуктів."""
    try:
        c = _conn()
        n = c.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        c.close()
        return n
    except Exception as e:
        logger.error(f"get_products_count: {e}")
        return 0


def get_all_products() -> list[dict]:
    """Повертає всі продукти з категоріями (для API пошуку)."""
    try:
        c = _conn()
        rows = c.execute("""
            SELECT p.id, p.name, p.proteins, p.fats, p.carbs,
                   p.calories, p.price,
                   c.name AS cat_name,
                   c.name_ua AS cat_name_ua,
                   c.icon AS cat_icon
            FROM products p
            JOIN categories c ON p.category_id = c.id
            ORDER BY p.name
        """).fetchall()
        c.close()
        return [_build_product_dict(r) for r in rows]
    except Exception as e:
        logger.error(f"get_all_products: {e}")
        return []


def search_products(query: str) -> list[dict]:
    """Пошук продуктів за назвою (LIKE)."""
    try:
        c = _conn()
        rows = c.execute("""
            SELECT p.id, p.name, p.proteins, p.fats, p.carbs,
                   p.calories, p.price,
                   c.name AS cat_name,
                   c.name_ua AS cat_name_ua,
                   c.icon AS cat_icon
            FROM products p
            JOIN categories c ON p.category_id = c.id
            WHERE LOWER(p.name) LIKE ?
            ORDER BY p.name
        """, (f"%{query.lower()}%",)).fetchall()
        c.close()
        return [_build_product_dict(r) for r in rows]
    except Exception as e:
        logger.error(f"search_products: {e}")
        return []


def get_products_for_optimization(
        exclude_categories: list[str] = None,
        only_categories: list[str] = None,
) -> list[dict]:
    """
    Завантажує продукти для оптимізатора.
    Повертає: list[dict] з полями id, name, protein, fat, carbs, calories, price, category.

    exclude_categories: список назв категорій для виключення (напр. ['alcohol', 'sweets'])
    only_categories: якщо задано, бере лише ці категорії
    """
    try:
        c = _conn()
        rows = c.execute("""
            SELECT p.id, p.name,
                   p.proteins AS protein,
                   p.fats     AS fat,
                   p.carbs,
                   p.calories,
                   p.price,
                   c.name AS category
            FROM products p
            JOIN categories c ON p.category_id = c.id
            WHERE p.calories > 0 AND p.price > 0
            ORDER BY p.name
        """).fetchall()
        c.close()

        products = [dict(r) for r in rows]

        if exclude_categories:
            products = [
                p for p in products
                if p["category"] not in exclude_categories
            ]

        if only_categories:
            products = [
                p for p in products
                if p["category"] in only_categories
            ]

        return products
    except Exception as e:
        logger.error(f"get_products_for_optimization: {e}")
        return []


# ════════════════════════════════════════════════════════════
#  СТАТИСТИКА ПРОДУКТИВНОСТІ
# ════════════════════════════════════════════════════════════

def get_performance_stats() -> dict:
    """Повертає статистику запусків оптимізації."""
    empty = {
        "total_runs": 0, "avg_time_ms": 0,
        "min_time_ms": 0, "max_time_ms": 0,
        "optimal_count": 0, "recent_runs": [],
    }
    try:
        c = _conn()

        # Перевіряємо чи існує таблиця
        tables = [r[0] for r in c.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()]

        if "optimization_logs" not in tables:
            c.close()
            return empty

        total = c.execute("SELECT COUNT(*) FROM optimization_logs").fetchone()[0]

        if total == 0:
            c.close()
            return empty

        s = c.execute("""
            SELECT
                AVG(solve_time_ms)  AS avg_t,
                MIN(solve_time_ms)  AS min_t,
                MAX(solve_time_ms)  AS max_t,
                SUM(CASE WHEN status = 'optimal' THEN 1 ELSE 0 END) AS ok_cnt
            FROM optimization_logs
        """).fetchone()

        recent = [
            dict(r) for r in
            c.execute(
                "SELECT * FROM optimization_logs ORDER BY id DESC LIMIT 10"
            ).fetchall()
        ]
        c.close()

        return {
            "total_runs": total,
            "avg_time_ms": round(s["avg_t"] or 0, 1),
            "min_time_ms": round(s["min_t"] or 0, 1),
            "max_time_ms": round(s["max_t"] or 0, 1),
            "optimal_count": s["ok_cnt"] or 0,
            "recent_runs": recent,
        }
    except Exception as e:
        logger.error(f"get_performance_stats: {e}")
        return empty