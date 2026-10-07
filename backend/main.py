# Optional FastAPI companion API for local development.
# Run from this directory with: uvicorn main:app --reload

import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from ai_assistant import generate_recipes
from database import (
    init_db,
    get_all_products,
    get_all_categories,
    get_performance_stats,
    get_products_count,
    search_products,
)
from models import AIRequest, NutritionNorms, OptimizeRequest, UserProfile
from optimizer import calculate_nutrition_norms, run_optimization, run_basic_optimization

# ── Логування ────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger(__name__)

# ── Шляхи ────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(os.path.dirname(BASE_DIR), "web")
DB_PATH = os.path.join(BASE_DIR, "food_tracker.db")


# ── Lifespan ─────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    if not os.path.exists(DB_PATH):
        logger.error(f"❌ {DB_PATH} не знайдено!")
        logger.error("👉 Покладіть food_tracker.db у папку проєкту.")
    else:
        init_db()
        count = get_products_count()
        cats = get_all_categories()
        logger.info(f"✅ Сервер запущено. БД: {count} продуктів, {len(cats)} категорій")

    if os.path.exists(STATIC_DIR):
        logger.info(f"✅ Static директорія: {STATIC_DIR}")
    else:
        logger.warning(f"⚠️ static/ не знайдена: {STATIC_DIR}")

    yield
    logger.info("🔴 Сервер зупинено.")


# ── FastAPI ──────────────────────────────────────────────────
app = FastAPI(
    title="DietOpt — meal and shopping planner",
    description="Optional local API for nutrition calculations, menu optimization and product lookup.",
    version="4.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ════════════════════════════════════════════════════════════
#  API ENDPOINTS
# ════════════════════════════════════════════════════════════

@app.get("/api/health", tags=["System"])
async def health_check():
    """Перевірка стану системи."""
    db_exists = os.path.exists(DB_PATH)
    count = get_products_count() if db_exists else 0
    cats = len(get_all_categories()) if db_exists else 0
    return {
        "status": "online",
        "database": "connected" if db_exists else "not found",
        "db_file": "food_tracker.db",
        "products_count": count,
        "categories_count": cats,
        "version": "3.0.0",
    }


@app.post("/api/calculate-norms", tags=["Nutrition"], response_model=NutritionNorms)
async def calculate_norms(profile: UserProfile):
    """Розрахунок індивідуальних норм КБЖУ."""
    try:
        norms = calculate_nutrition_norms(profile)
        logger.info(f"📊 Норми | {norms.target_calories} ккал | BMR={norms.bmr}")
        return norms
    except Exception as exc:
        logger.error(f"Помилка розрахунку норм: {exc}")
        raise HTTPException(500, detail=str(exc))


@app.post("/api/optimize", tags=["Optimization"])
async def optimize_diet(request: OptimizeRequest):
    """Оптимізація раціону — мінімальна вартість при дотриманні КБЖУ."""
    t_start = time.time()
    try:
        result = run_optimization(request.profile, request.norms)
        elapsed = round((time.time() - t_start) * 1000, 1)
        logger.info(f"⚡ Оптимізація | {elapsed} мс | {result.status}")
        return {**result.model_dump(), "solve_time_ms": elapsed}
    except Exception as exc:
        logger.error(f"Помилка оптимізації: {exc}")
        raise HTTPException(500, detail=str(exc))


@app.post("/api/optimize-basic", tags=["Optimization"])
async def optimize_basic(request: OptimizeRequest):
    """Звичайний раціон — шаблонний підхід з реалістичними продуктами."""
    t_start = time.time()
    try:
        result = run_basic_optimization(request.profile, request.norms)
        elapsed = round((time.time() - t_start) * 1000, 1)
        logger.info(f"📋 Базовий раціон | {elapsed} мс | {result.status}")
        return {**result.model_dump(), "solve_time_ms": elapsed}
    except Exception as exc:
        logger.error(f"Помилка базової оптимізації: {exc}")
        raise HTTPException(500, detail=str(exc))


@app.post("/api/generate-recipes", tags=["AI"])
async def generate_recipes_endpoint(request: AIRequest):
    """Генерація рецептів через Google Gemini AI."""
    try:
        recipes = await generate_recipes(request.menu, request.profile)
        return {"recipes": recipes}
    except Exception as exc:
        logger.error(f"Помилка AI: {exc}")
        raise HTTPException(500, detail=str(exc))


@app.get("/api/products", tags=["Products"])
async def get_products(search: str = "", limit: int = 20):
    """Пошук продуктів у базі даних."""
    try:
        limit = max(1, min(limit, 600))
        items = search_products(search.strip()) if search.strip() else get_all_products()
        return {"total": len(items), "products": items[:limit]}
    except Exception as exc:
        logger.error(f"Помилка отримання продуктів: {exc}")
        raise HTTPException(500, detail=str(exc))


@app.get("/api/categories", tags=["Products"])
async def get_categories():
    """Повертає список всіх категорій продуктів."""
    try:
        cats = get_all_categories()
        return {"total": len(cats), "categories": cats}
    except Exception as exc:
        raise HTTPException(500, detail=str(exc))


@app.get("/api/performance-stats", tags=["System"])
async def performance_stats():
    """Статистика продуктивності алгоритму оптимізації."""
    try:
        return get_performance_stats()
    except Exception as exc:
        raise HTTPException(500, detail=str(exc))


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)


# ── Веб-застосунок (ОСТАННІМ, щоб не перекривати /api) ──────
if os.path.exists(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="web")
