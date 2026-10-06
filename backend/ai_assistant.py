# ai_assistant.py — Інтеграція з Google Gemini AI
# Моделі 1.5/2.0 вимкнені Google — використовуємо актуальні моделі 3.x

import os
import logging
import asyncio
from dotenv import load_dotenv
from models import ProductItem, UserProfile

load_dotenv()
logger = logging.getLogger(__name__)

GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")

# Список моделей у порядку пріоритету (перша — з .env, якщо задана)
GEMINI_MODELS = [
    os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite"),
    "gemini-3.8-flash",
    "gemini-3.5-flash",
]

_ai_client = None
_ai_initialized = False


def _init_ai():
    """Ліниве підключення до Gemini AI."""
    global _ai_client, _ai_initialized
    if _ai_initialized:
        return
    _ai_initialized = True

    if not GEMINI_KEY:
        logger.warning("⚠️ GEMINI_API_KEY не знайдено")
        return

    try:
        from google import genai
        _ai_client = genai.Client(api_key=GEMINI_KEY)
        logger.info("✅ Gemini AI клієнт створено")
    except Exception as e:
        logger.warning(f"⚠️ Gemini недоступний: {e}")
        _ai_client = None


async def _try_generate(prompt: str) -> str:
    """Пробує згенерувати відповідь по черзі через різні моделі."""
    last_error = None

    for model_name in GEMINI_MODELS:
        try:
            logger.info(f"🤖 Пробую модель: {model_name}")
            response = await asyncio.to_thread(
                _ai_client.models.generate_content,
                model=model_name,
                contents=prompt,
            )
            logger.info(f"✅ Відповідь від {model_name}: {len(response.text)} символів")
            return response.text
        except Exception as e:
            err_str = str(e)
            last_error = e

            # Якщо модель недоступна або вичерпано квоту — пробуємо наступну
            if any(code in err_str for code in ["429", "404", "RESOURCE_EXHAUSTED", "NOT_FOUND"]):
                logger.warning(f"⚠️ {model_name} недоступна, пробую наступну...")
                continue

            # Інша помилка — повертаємо одразу
            logger.error(f"❌ {model_name}: {e}")
            raise

    raise Exception(f"Усі AI-моделі недоступні. Остання помилка: {last_error}")


async def generate_recipes(menu: list, profile: UserProfile) -> str:
    """Генерує рецепти через Gemini AI."""
    _init_ai()

    if not _ai_client:
        return (
            "⚠️ AI-асистент недоступний.\n\n"
            "Перевірте GEMINI_API_KEY у файлі .env.\n"
            "Раціон підібрано вірно, але рецепти не згенеровані."
        )

    def fmt(items):
        return "\n".join(
            f"  • {i.name} — {i.amount_g} г ({i.calories:.0f} ккал)"
            for i in items
        )

    b = [i for i in menu if i.meal == "breakfast"]
    l = [i for i in menu if i.meal == "lunch"]
    d = [i for i in menu if i.meal == "dinner"]
    s = [i for i in menu if i.meal == "snack"]

    parts = []
    if b: parts.append(f"СНІДАНОК:\n{fmt(b)}")
    if s: parts.append(f"ПЕРЕКУС:\n{fmt(s)}")
    if l: parts.append(f"ОБІД:\n{fmt(l)}")
    if d: parts.append(f"ВЕЧЕРЯ:\n{fmt(d)}")

    goal_ua = {
        "loss":     "схуднення",
        "maintain": "підтримка ваги",
        "gain":     "набір маси",
    }

    prompt = f"""Ти дружній дієтолог-кухар для студента.
Мета студента: {goal_ua.get(profile.goal, 'здорове харчування')}.
Бюджет: {profile.budget} грн/день.

Система оптимізації підібрала такий набір продуктів:
{chr(10).join(parts)}

Завдання: запропонуй прості страви на день з ЦИХ продуктів.
Студент має мало часу і базові навички приготування.
Якщо у наборі є дивні поєднання (наприклад, сире борошно або багато риби) —
запропонуй розумні страви (наприклад, з борошна — млинці, з риби — запекти).

Формат для кожного прийому їжі:
🍳 [Назва страви]
⏱ Час: X хв
📝 Інгредієнти: [список з вагою]
👨‍🍳 Приготування:
1. ...
2. ...
3. ...

Наприкінці — 2 речення про користь раціону.
Пиши українською, дружньо!"""

    try:
        return await _try_generate(prompt)
    except Exception as e:
        logger.error(f"Gemini error: {e}")
        return (
            f"⚠️ Помилка AI: {e}\n\n"
            f"Раціон підібрано алгоритмом коректно, "
            f"але рецепти не згенеровані."
        )