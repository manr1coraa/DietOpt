# Optional server-side menu optimizer (PuLP / CBC).

import logging
import random
import time

import pulp

from database import get_products_for_optimization, log_optimization
from models import (
    NutritionNorms,
    OptimizationResult,
    ProductItem,
    UserProfile,
)

logger = logging.getLogger(__name__)

# ════════════════════════════════════════════════════════════
#  КАТЕГОРІЇ ДЛЯ ФІЛЬТРАЦІЇ
# ════════════════════════════════════════════════════════════

ALWAYS_EXCLUDED_CATS = ["alcohol"]

BASIC_EXCLUDED_CATS = [
    "alcohol", "hot_drinks", "cold_drinks",
    "sweets", "spices", "caviar",
]  # "flour" не виключаємо: там макарони; борошно відсікає GLOBAL_BLACKLIST

VEGETARIAN_EXCLUDED = ["meat", "poultry", "fish_seafood", "sausages"]

VEGAN_EXCLUDED = [
    "meat", "poultry", "fish_seafood", "sausages",
    "dairy", "cheese", "eggs", "caviar",
]

# ════════════════════════════════════════════════════════════
#  ГРУПИ АЛЕРГЕНІВ — синоніми та споріднені продукти
# ════════════════════════════════════════════════════════════
#
# Якщо користувач пише "молоко" — виключаємо ВСІ молочні продукти.
# Якщо "горіхи" — всі види горіхів. І так далі.
#
# Формат: ключове слово → (категорії_БД, додаткові_кейворди)
#
ALLERGEN_GROUPS = {
    "молоко": {
        "categories": ["dairy", "cheese"],
        "keywords": [
            "молок", "сметан", "сир ", "сир\n", "сирок", "вершк",
            "йогурт", "кефір", "ряжанк", "ацидофіл", "сироват",
            "масло вершк", "брин", "фет", "моцарел", "сулугун",
            "адигей", "пармезан",
        ],
    },
    "молочн": {
        "categories": ["dairy", "cheese"],
        "keywords": [
            "молок", "сметан", "сир ", "сирок", "вершк", "йогурт",
            "кефір", "ряжанк", "сироват", "масло вершк", "бринз",
            "моцарел", "сулугун", "адигей", "пармезан",
        ],
    },
    "лактоз": {
        "categories": ["dairy", "cheese"],
        "keywords": [
            "молок", "сметан", "сир", "вершк", "йогурт", "кефір",
            "ряжанк", "сироват", "масло вершк",
        ],
    },
    "горіх": {
        "categories": ["nuts_seeds"],
        "keywords": [
            "горіх", "мигдал", "фундук", "кеш'ю", "кешью", "арахіс",
            "фісташ", "пекан", "макадам", "кедров", "бразиль",
        ],
    },
    "арахіс": {
        "categories": [],
        "keywords": ["арахіс", "арахісов"],
    },
    "глютен": {
        "categories": ["bakery", "flour"],
        "keywords": [
            "пшен", "хліб", "батон", "булк", "макарон", "лаваш",
            "вермішель", "спагет", "лапш", "печиво", "сухар",
            "манн", "булгур", "кускус", "пиріг", "піт",
        ],
    },
    "пшениц": {
        "categories": ["bakery"],
        "keywords": ["пшен", "хліб пшеничн", "батон", "макарон", "манн"],
    },
    "яйц": {
        "categories": ["eggs"],
        "keywords": ["яйц", "яєчн", "омлет", "жовток", "білок яєч"],
    },
    "риб": {
        "categories": ["fish_seafood"],
        "keywords": [
            "риб", "хек", "минтай", "лосось", "тунець", "тріск",
            "сьомг", "форел", "судак", "окун", "карп", "щук",
            "скумбрі", "оселед", "сардин", "анчоус", "кільк",
            "камбал", "путасу", "ікра",
        ],
    },
    "морепродукт": {
        "categories": ["fish_seafood"],
        "keywords": [
            "креветк", "мід", "кальмар", "восьминіг", "устриц",
            "краб", "лангуст", "морськ", "ікра",
        ],
    },
    "соя": {
        "categories": [],
        "keywords": ["соєв", "соя ", "тофу", "темпе", "місо"],
    },
    "цитрус": {
        "categories": [],
        "keywords": [
            "апельсин", "мандарин", "лимон", "лайм", "грейпфрут",
            "помело", "цитрус",
        ],
    },
    "м'ясо": {
        "categories": ["meat", "poultry", "sausages"],
        "keywords": [
            "м'ясо", "м ясо", "свинин", "яловичин", "теляч", "баранин",
            "курят", "куряч", "куриц", "індич", "індик", "качк", "гус",
            "ковбас", "сосиск", "сардель", "шинк", "буженин",
        ],
    },
    "куриц": {
        "categories": ["poultry"],
        "keywords": ["курят", "куряч", "куриц", "куряче", "куряча"],
    },
    "курк": {
        "categories": ["poultry"],
        "keywords": ["курят", "куряч", "куриц"],
    },
    "свинин": {
        "categories": [],
        "keywords": ["свинин", "свиняч"],
    },
    "яловичин": {
        "categories": [],
        "keywords": ["яловичин", "теляч", "телятин"],
    },
    "гриб": {
        "categories": ["mushrooms"],
        "keywords": ["гриб", "печериц", "лисичк", "опеньк", "білий гриб"],
    },
    "томат": {
        "categories": [],
        "keywords": ["томат", "помідор"],
    },
    "мед": {
        "categories": [],
        "keywords": ["мед "],
    },
}


def _expand_allergens(user_input: str) -> tuple[set, set]:
    """
    Розгортає введення користувача в:
    - set категорій БД для виключення
    - set ключових слів для виключення
    """
    excluded_cats = set()
    excluded_keywords = set()

    if not user_input:
        return excluded_cats, excluded_keywords

    items = [e.strip().lower() for e in user_input.split(",") if e.strip()]

    for item in items:
        # Завжди додаємо саме слово як кейворд
        excluded_keywords.add(item)

        # Шукаємо групу алергенів
        for key, group in ALLERGEN_GROUPS.items():
            if key in item or item in key:
                excluded_cats.update(group["categories"])
                excluded_keywords.update(group["keywords"])

    return excluded_cats, excluded_keywords


# ════════════════════════════════════════════════════════════
#  ГЛОБАЛЬНИЙ BLACKLIST
# ════════════════════════════════════════════════════════════

GLOBAL_BLACKLIST = [
    "борошно", "крохмаль", "дріжджі", "сода",
    "молоко сухе", "молоко згущ", "вершки сухі", "вершки згущ",
    "яєчний порошок", "білок яєчн", "жовток",
    "крупа манн",
    "перепелин", "перепелк",
    "сало", "смалець", "маргарин", "комбіжир",
    "жир свин", "жир кур", "жир ялов", "жир бараняч",
    "цукор", "пудра цукр", "глюкоза", "фруктоза", "сироп",
    "краснопірк", "плотв", "салак", "корюшк", "навага",
    "бичок", "молоки", "ікра", "карась", "лящ", "тарань",
    "товстолобик", "густер", "жерех", "минь", "піскар",
    "мерлуз", "путасу", "сайда", "сайра", "ставрид",
    "субпродукт", "печінк", "нирк", "мізк", "язик",
    "вим'я", "вим я", "легені", "селезінк", "рубец",
    "тельбух", "потрох", "лівер", "кров", "хвіст",
    "шкур", "ноги свин", "ноги яловичі", "вуха", "копит",
    "конин", "оленин", "лосятин", "козлятин",
    "фазан", "куріпк", "дичин", "страус", "кролик",
    "вугор", "осетр", "мінога", "акул", "восьминіг",
    "устриц", "молюск", "раки", "краб", "лангуст",
    "кальмар сир", "креветк сир", "мід",
    "сушен", "в'ялен", "вялен",
]


def _is_blacklisted(name: str) -> bool:
    return any(kw in name.lower() for kw in GLOBAL_BLACKLIST)


# ════════════════════════════════════════════════════════════
#  ШАБЛОНИ — РОЗШИРЕНА КОЛЕКЦІЯ ДЛЯ РІЗНОМАНІТНОСТІ
# ════════════════════════════════════════════════════════════

STANDARD_TEMPLATES = [
    {
        "name": "Класичний з куркою",
        "meals": {
            "breakfast": [
                ("вівсян", 0.6, 2.5),
                ("молоко 2.5", 1.0, 2.5),
                ("банан", 0.7, 1.5),
                ("масло вершк", 0.05, 0.25),
            ],
            "snack": [
                ("яблуко", 1.0, 2.5),
                ("волоський горіх", 0.2, 0.5),
                ("йогурт", 1.0, 2.0),
            ],
            "lunch": [
                ("куряча грудка", 1.2, 3.0),
                ("гречан", 0.8, 2.5),
                ("морква", 0.5, 1.5),
                ("цибуля ріпч", 0.2, 0.6),
                ("олія соняшник", 0.05, 0.2),
            ],
            "dinner": [
                ("яйце куряче", 1.0, 2.5),
                ("хліб житн", 0.5, 1.5),
                ("томати свіж", 0.8, 2.0),
                ("огірки свіж", 0.8, 2.0),
                ("сир кисломолочний нежирн", 0.8, 2.0),
            ],
        },
    },
    {
        "name": "Рибний день",
        "meals": {
            "breakfast": [
                ("вівсян", 0.6, 2.5),
                ("молоко 2.5", 1.0, 2.5),
                ("масло вершк", 0.05, 0.25),
                ("груша", 0.7, 1.5),
            ],
            "snack": [
                ("банан", 0.7, 1.5),
                ("сир голландськ", 0.3, 0.7),
                ("кефір", 1.0, 2.5),
            ],
            "lunch": [
                ("хек", 1.5, 3.0),
                ("рисов", 0.8, 2.5),
                ("капуста білокачан", 0.8, 2.0),
                ("морква", 0.5, 1.0),
                ("олія соняшник", 0.05, 0.2),
            ],
            "dinner": [
                ("сир кисломолочний нежирн", 1.0, 2.5),
                ("хліб пшеничн", 0.5, 1.5),
                ("огірки свіж", 0.8, 2.0),
                ("яйце куряче", 1.0, 2.0),
            ],
        },
    },
    {
        "name": "Бюджетний",
        "meals": {
            "breakfast": [
                ("пшонян", 0.6, 2.5),
                ("молоко 2.5", 1.0, 2.5),
                ("яйце куряче", 1.0, 2.0),
            ],
            "snack": [
                ("банан", 0.7, 1.5),
                ("кефір", 1.0, 2.5),
                ("яблуко", 0.7, 1.5),
            ],
            "lunch": [
                ("куряче стегно", 1.2, 2.5),
                ("картопля молод", 1.5, 4.0),
                ("морква", 0.5, 1.5),
                ("цибуля ріпч", 0.2, 0.6),
                ("олія соняшник", 0.05, 0.2),
            ],
            "dinner": [
                ("хліб житн", 0.8, 1.5),
                ("сир кисломолочний нежирн", 0.8, 2.0),
                ("огірки свіж", 0.8, 2.0),
                ("томати свіж", 0.8, 1.5),
            ],
        },
    },
    {
        "name": "Спортивний",
        "meals": {
            "breakfast": [
                ("яйце куряче", 1.0, 2.5),
                ("вівсян", 0.6, 2.5),
                ("молоко 2.5", 1.0, 2.5),
                ("банан", 0.7, 1.5),
            ],
            "snack": [
                ("сир кисломолочний напівжирн", 1.0, 2.5),
                ("яблуко", 0.7, 1.5),
                ("мигдаль", 0.2, 0.4),
            ],
            "lunch": [
                ("куряча грудка", 1.5, 3.0),
                ("гречан", 0.8, 2.5),
                ("томати свіж", 0.8, 2.0),
                ("олія соняшник", 0.05, 0.2),
            ],
            "dinner": [
                ("минтай", 1.5, 3.0),
                ("рисов", 0.8, 2.0),
                ("капуста білокачан", 0.8, 2.0),
                ("хліб житн", 0.5, 1.0),
            ],
        },
    },
    {
        "name": "З індичкою",
        "meals": {
            "breakfast": [
                ("йогурт", 1.0, 2.5),
                ("вівсян", 0.6, 2.5),
                ("яблуко", 0.7, 1.5),
                ("волоський горіх", 0.15, 0.4),
            ],
            "snack": [
                ("груша", 0.8, 2.0),
                ("кефір", 1.0, 2.5),
            ],
            "lunch": [
                ("індич", 1.2, 2.5),
                ("гречан", 0.8, 2.5),
                ("капуста броколі", 0.8, 2.0),
                ("морква", 0.5, 1.0),
                ("олія соняшник", 0.05, 0.2),
            ],
            "dinner": [
                ("сир адигейськ", 1.0, 2.0),
                ("огірки свіж", 0.8, 2.0),
                ("томати свіж", 0.8, 2.0),
                ("хліб пшеничн", 0.5, 1.5),
            ],
        },
    },
    {
        "name": "Макаронний",
        "meals": {
            "breakfast": [
                ("яйце куряче", 1.0, 2.5),
                ("хліб пшеничн", 0.5, 1.5),
                ("масло вершк", 0.05, 0.25),
                ("сир голландськ", 0.3, 0.7),
            ],
            "snack": [
                ("банан", 0.7, 1.5),
                ("кефір", 1.0, 2.0),
                ("яблуко", 0.7, 1.5),
            ],
            "lunch": [
                ("куряча грудка", 1.2, 3.0),
                ("макарони (варен", 1.5, 3.5),
                ("томати свіж", 0.8, 2.0),
                ("олія соняшник", 0.05, 0.2),
            ],
            "dinner": [
                ("сир кисломолочний нежирн", 1.0, 2.5),
                ("хліб житн", 0.5, 1.5),
                ("огірки свіж", 0.8, 2.0),
            ],
        },
    },
    {
        "name": "Картопляний з рибою",
        "meals": {
            "breakfast": [
                ("гречан", 0.8, 2.5),
                ("яйце куряче", 1.0, 2.0),
                ("сир голландськ", 0.2, 0.5),
            ],
            "snack": [
                ("яблуко", 0.7, 1.5),
                ("кефір", 1.0, 2.5),
                ("волоський горіх", 0.15, 0.4),
            ],
            "lunch": [
                ("минтай", 1.5, 3.0),
                ("картопля молод", 1.5, 3.5),
                ("морква", 0.5, 1.5),
                ("цибуля ріпч", 0.2, 0.6),
                ("олія соняшник", 0.05, 0.2),
            ],
            "dinner": [
                ("сир кисломолочний нежирн", 1.0, 2.5),
                ("хліб житн", 0.5, 1.5),
                ("огірки свіж", 0.8, 2.0),
                ("томати свіж", 0.8, 1.5),
            ],
        },
    },
    {
        "name": "Гречано-курячий",
        "meals": {
            "breakfast": [
                ("вівсян", 0.6, 2.0),
                ("банан", 1.0, 2.0),
                ("йогурт", 1.0, 2.0),
                ("мигдаль", 0.15, 0.4),
            ],
            "snack": [
                ("яблуко", 1.0, 2.0),
                ("сир голландськ", 0.3, 0.6),
            ],
            "lunch": [
                ("куряча грудка", 1.5, 3.0),
                ("гречан", 1.0, 2.5),
                ("капуста білокачан", 0.8, 1.8),
                ("морква", 0.5, 1.2),
                ("олія соняшник", 0.05, 0.2),
            ],
            "dinner": [
                ("яйце куряче", 1.5, 2.5),
                ("хліб житн", 0.5, 1.2),
                ("томати свіж", 1.0, 2.0),
                ("огірки свіж", 1.0, 2.0),
            ],
        },
    },
]

VEGAN_TEMPLATES = [
    {
        "name": "Веганський класичний",
        "meals": {
            "breakfast": [
                ("вівсян", 1.5, 3.5),
                ("банан", 1.0, 2.0),
                ("волоський горіх", 0.2, 0.5),
            ],
            "snack": [
                ("яблуко", 1.0, 2.5),
                ("мигдаль", 0.2, 0.5),
            ],
            "lunch": [
                ("квасол", 1.0, 3.0),
                ("рисов", 1.0, 3.0),
                ("морква", 0.5, 2.0),
                ("цибуля ріпч", 0.2, 0.6),
                ("олія соняшник", 0.05, 0.2),
            ],
            "dinner": [
                ("сочевиц", 1.0, 3.0),
                ("хліб житн", 0.5, 1.5),
                ("томати свіж", 0.8, 2.0),
                ("огірки свіж", 0.8, 2.0),
            ],
        },
    },
    {
        "name": "Веганський бюджетний",
        "meals": {
            "breakfast": [
                ("вівсян", 1.5, 3.5),
                ("банан", 1.0, 2.0),
                ("волоський горіх", 0.15, 0.4),
            ],
            "snack": [
                ("яблуко", 1.0, 2.5),
            ],
            "lunch": [
                ("нут", 1.0, 3.0),
                ("гречан", 1.0, 3.0),
                ("капуста білокачан", 0.8, 2.0),
                ("морква", 0.5, 1.5),
                ("олія соняшник", 0.05, 0.2),
            ],
            "dinner": [
                ("квасол", 1.0, 2.5),
                ("хліб пшеничн", 0.5, 1.5),
                ("огірки свіж", 0.8, 2.0),
                ("томати свіж", 0.8, 1.5),
            ],
        },
    },
    {
        "name": "Веганський з рисом",
        "meals": {
            "breakfast": [
                ("гречан", 1.0, 2.5),
                ("банан", 1.0, 2.0),
                ("мигдаль", 0.2, 0.5),
            ],
            "snack": [
                ("яблуко", 1.0, 2.0),
                ("груша", 0.7, 1.5),
            ],
            "lunch": [
                ("нут", 1.0, 2.5),
                ("рисов", 1.0, 2.5),
                ("капуста броколі", 0.8, 2.0),
                ("морква", 0.5, 1.5),
                ("олія соняшник", 0.05, 0.2),
            ],
            "dinner": [
                ("сочевиц", 1.0, 2.5),
                ("хліб житн", 0.5, 1.5),
                ("томати свіж", 1.0, 2.0),
                ("огірки свіж", 1.0, 2.0),
            ],
        },
    },
]

VEGETARIAN_TEMPLATES = [
    {
        "name": "Вегетаріанський класичний",
        "meals": {
            "breakfast": [
                ("вівсян", 0.6, 2.5),
                ("молоко 2.5", 1.0, 2.5),
                ("банан", 0.7, 1.5),
            ],
            "snack": [
                ("яблуко", 0.7, 2.0),
                ("сир голландськ", 0.3, 0.7),
                ("йогурт", 1.0, 2.0),
            ],
            "lunch": [
                ("яйце куряче", 1.5, 3.0),
                ("гречан", 0.8, 2.5),
                ("морква", 0.5, 1.5),
                ("капуста білокачан", 0.8, 2.0),
                ("олія соняшник", 0.05, 0.2),
            ],
            "dinner": [
                ("сир кисломолочний нежирн", 1.0, 2.5),
                ("хліб житн", 0.5, 1.5),
                ("томати свіж", 0.8, 2.0),
                ("огірки свіж", 0.8, 2.0),
            ],
        },
    },
    {
        "name": "Вегетаріанський з бобовими",
        "meals": {
            "breakfast": [
                ("яйце куряче", 1.0, 2.5),
                ("хліб пшеничн", 0.5, 1.5),
                ("масло вершк", 0.05, 0.25),
                ("молоко 2.5", 1.0, 2.5),
            ],
            "snack": [
                ("груша", 0.7, 1.5),
                ("волоський горіх", 0.2, 0.5),
                ("кефір", 1.0, 2.0),
            ],
            "lunch": [
                ("квасол", 1.0, 2.5),
                ("рисов", 0.8, 2.5),
                ("морква", 0.5, 1.5),
                ("олія соняшник", 0.05, 0.2),
            ],
            "dinner": [
                ("сир адигейськ", 1.0, 2.0),
                ("огірки свіж", 0.8, 2.0),
                ("томати свіж", 0.8, 2.0),
                ("хліб житн", 0.5, 1.0),
            ],
        },
    },
]


# ════════════════════════════════════════════════════════════
#  МАППІНГ КАТЕГОРІЯ → ПРИЙОМ ЇЖІ
# ════════════════════════════════════════════════════════════

CATEGORY_TO_MEAL = {
    "grains": "breakfast",
    "dairy": "breakfast",
    "cheese": "breakfast",
    "eggs": "breakfast",
    "bakery": "breakfast",
    "fruits": "snack",
    "berries": "snack",
    "nuts_seeds": "snack",
    "dried_fruits": "snack",
    "meat": "lunch",
    "poultry": "lunch",
    "sausages": "lunch",
    "legumes": "lunch",
    "vegetables": "lunch",
    "mushrooms": "lunch",
    "oils_fats": "lunch",
    "fish_seafood": "dinner",
}


# ════════════════════════════════════════════════════════════
#  РОЗРАХУНОК НОРМ КБЖУ
# ════════════════════════════════════════════════════════════

def calculate_nutrition_norms(profile: UserProfile) -> NutritionNorms:
    w, h, a = profile.weight, profile.height, profile.age

    if profile.gender == "male":
        bmr = 10 * w + 6.25 * h - 5 * a + 5
    else:
        bmr = 10 * w + 6.25 * h - 5 * a - 161

    pal_map = {
        "sedentary": 1.2, "light": 1.375, "moderate": 1.55,
        "active": 1.725, "very_active": 1.9,
    }
    pal = pal_map.get(profile.activity_level, 1.375)
    tdee = bmr * pal

    coeff = {"loss": 0.85, "maintain": 1.0, "gain": 1.15}
    target = tdee * coeff.get(profile.goal, 1.0)

    if profile.goal == "loss":
        pp, fp, cp = (0.30, 0.40), (0.25, 0.35), (0.25, 0.40)
    elif profile.goal == "gain":
        pp, fp, cp = (0.25, 0.35), (0.25, 0.30), (0.40, 0.50)
    else:
        pp, fp, cp = (0.25, 0.35), (0.25, 0.35), (0.35, 0.45)

    bmi = round(w / ((h / 100) ** 2), 1)
    if bmi < 18.5:
        bmi_status = "Дефіцит маси тіла"
    elif bmi < 25.0:
        bmi_status = "Нормальна маса тіла"
    elif bmi < 30.0:
        bmi_status = "Надмірна маса тіла"
    else:
        bmi_status = "Ожиріння"

    return NutritionNorms(
        bmr=round(bmr, 1),
        tdee=round(tdee, 1),
        target_calories=round(target, 1),
        protein_min=round(target * pp[0] / 4, 1),
        protein_max=round(target * pp[1] / 4, 1),
        fat_min=round(target * fp[0] / 9, 1),
        fat_max=round(target * fp[1] / 9, 1),
        carbs_min=round(target * cp[0] / 4, 1),
        carbs_max=round(target * cp[1] / 4, 1),
        water_ml=int(w * 35),
        bmi=bmi,
        bmi_status=bmi_status,
    )


# ════════════════════════════════════════════════════════════
#  ЗАВАНТАЖЕННЯ ПРОДУКТІВ
# ════════════════════════════════════════════════════════════

def _load_products(profile: UserProfile) -> list[dict]:
    """Завантаження + фільтрація (категорії, blacklist, алергії)."""
    excluded_cats = set(ALWAYS_EXCLUDED_CATS) | set(BASIC_EXCLUDED_CATS)

    if profile.diet_type == "vegetarian":
        excluded_cats.update(VEGETARIAN_EXCLUDED)
    elif profile.diet_type == "vegan":
        excluded_cats.update(VEGAN_EXCLUDED)

    # Розгортаємо алергії в категорії та кейворди
    user_input = ""
    if profile.excluded_foods:
        user_input += profile.excluded_foods + ","
    if profile.allergies:
        user_input += profile.allergies

    allergen_cats, allergen_keywords = _expand_allergens(user_input)
    excluded_cats.update(allergen_cats)

    logger.info(f"🚫 Виключені категорії: {sorted(excluded_cats)}")
    logger.info(f"🚫 Виключені кейворди ({len(allergen_keywords)}): {sorted(allergen_keywords)[:15]}...")

    # Завантажуємо
    products = get_products_for_optimization(exclude_categories=list(excluded_cats))
    logger.info(f"📦 Після категорій: {len(products)} продуктів")

    # Blacklist
    before = len(products)
    products = [p for p in products if not _is_blacklisted(p["name"])]
    logger.info(f"🚫 Після blacklist: {before} → {len(products)}")

    # Алергени-кейворди
    if allergen_keywords:
        before = len(products)
        products = [
            p for p in products
            if not any(kw in p["name"].lower() for kw in allergen_keywords)
        ]
        logger.info(f"🚫 Після алергенів-кейвордів: {before} → {len(products)}")

    return products


# ════════════════════════════════════════════════════════════
#  ВИБІР ПРОДУКТІВ ДЛЯ ШАБЛОНУ
# ════════════════════════════════════════════════════════════

def _select_for_template(
        template: dict,
        products: list[dict],
        mode: str = "cheap",
        seed: int = None,
) -> list[tuple]:
    """
    mode: 'cheap' — найдешевший, 'middle' — середній, 'random' — випадковий
    seed: для відтворюваної рандомізації
    """
    if seed is not None:
        rng = random.Random(seed)
    else:
        rng = random

    selected = []
    used_ids = set()

    for meal, items in template["meals"].items():
        for kw, min_p, max_p in items:
            kw_lower = kw.lower()

            matches = [
                p for p in products
                if kw_lower in p["name"].lower() and p["id"] not in used_ids
            ]
            if not matches:
                continue

            if mode == "cheap":
                best = min(matches, key=lambda p: p["price"])
            elif mode == "middle":
                ms = sorted(matches, key=lambda p: p["price"])
                best = ms[len(ms) // 2]
            elif mode == "random":
                # Випадковий з ТРЬОХ найдешевших (різноманітність + розумна ціна)
                top3 = sorted(matches, key=lambda p: p["price"])[:3]
                best = rng.choice(top3)
            else:
                best = matches[0]

            # сухі крупи у 2.5 раза калорійніші за варені — обмежуємо порцію
            if "(сух" in best["name"]:
                min_p, max_p = min(min_p, 0.4), min(max_p, 1.0)
            selected.append((best, meal, min_p, max_p))
            used_ids.add(best["id"])

    return selected


# ════════════════════════════════════════════════════════════
#  УНІВЕРСАЛЬНИЙ LP-РОЗВ'ЯЗУВАЧ
# ════════════════════════════════════════════════════════════

def _solve_template_lp(
        selected: list[tuple],
        norms: NutritionNorms,
        budget: float,
        objective: str = "min_cost",
        cal_tolerance: float = 0.10,
        macro_tolerance: float = 0.20,
        budget_min_pct: float = 0.0,
        budget_max_pct: float = 1.0,
) -> OptimizationResult | None:
    if len(selected) < 6:
        return None

    if objective == "min_cost":
        prob = pulp.LpProblem("Solve", pulp.LpMinimize)
    else:
        prob = pulp.LpProblem("Solve", pulp.LpMaximize)

    x = {}
    for prod, meal, min_p, max_p in selected:
        x[prod["id"]] = pulp.LpVariable(
            f"x{prod['id']}",
            lowBound=min_p,
            upBound=max_p,
        )

    def sumP(field):
        return pulp.lpSum(x[p["id"]] * p[field] for p, _, _, _ in selected)

    prob += sumP("price"), "Objective"

    prob += sumP("calories") >= norms.target_calories * (1 - cal_tolerance), "C_Min"
    prob += sumP("calories") <= norms.target_calories * (1 + cal_tolerance), "C_Max"
    prob += sumP("protein") >= norms.protein_min * (1 - macro_tolerance / 2), "P_Min"
    prob += sumP("protein") <= norms.protein_max * (1 + macro_tolerance), "P_Max"
    prob += sumP("fat") >= norms.fat_min * (1 - macro_tolerance), "F_Min"
    prob += sumP("fat") <= norms.fat_max * (1 + macro_tolerance), "F_Max"
    prob += sumP("carbs") >= norms.carbs_min * (1 - macro_tolerance), "Cb_Min"
    prob += sumP("carbs") <= norms.carbs_max * (1 + macro_tolerance), "Cb_Max"

    prob += sumP("price") <= budget * budget_max_pct, "Budget_Max"
    if budget_min_pct > 0:
        prob += sumP("price") >= budget * budget_min_pct, "Budget_Min"

    solver = pulp.PULP_CBC_CMD(msg=0, timeLimit=15)
    prob.solve(solver)

    if pulp.LpStatus[prob.status] != "Optimal":
        return None

    menu_items = []
    total_cost = total_cal = total_prot = total_fat = total_carbs = 0.0

    for prod, meal, _, _ in selected:
        val = pulp.value(x[prod["id"]])
        if val is None or val < 0.05:
            continue

        g = round(val * 100, 0)
        cost = round(val * prod["price"], 2)
        kcal = round(val * prod["calories"], 1)
        prot = round(val * prod["protein"], 1)
        fat = round(val * prod["fat"], 1)
        carb = round(val * prod["carbs"], 1)

        menu_items.append(ProductItem(
            name=prod["name"],
            amount_g=g,
            calories=kcal,
            protein=prot,
            fat=fat,
            carbs=carb,
            cost=cost,
            meal=meal,
            category=prod.get("category", ""),
        ))

        total_cost += cost
        total_cal += kcal
        total_prot += prot
        total_fat += fat
        total_carbs += carb

    if len(menu_items) < 6:
        return None

    return OptimizationResult(
        status="optimal",
        total_cost=round(total_cost, 2),
        total_calories=round(total_cal, 1),
        total_protein=round(total_prot, 1),
        total_fat=round(total_fat, 1),
        total_carbs=round(total_carbs, 1),
        menu=menu_items,
    )


def _get_templates_for(profile: UserProfile) -> list[dict]:
    if profile.diet_type == "vegan":
        return VEGAN_TEMPLATES
    if profile.diet_type == "vegetarian":
        return VEGETARIAN_TEMPLATES
    return STANDARD_TEMPLATES


# ════════════════════════════════════════════════════════════
#  ОПТИМІЗОВАНИЙ РАЦІОН — мінімальна вартість
# ════════════════════════════════════════════════════════════

def run_optimization(
        profile: UserProfile,
        norms: NutritionNorms,
) -> OptimizationResult:
    """
    Перебирає шаблони з рандомізацією вибору продуктів.
    Цільова: МІН вартість.
    """
    t0 = time.time()
    products = _load_products(profile)

    if not products:
        return OptimizationResult(
            status="error", total_cost=0, total_calories=0,
            total_protein=0, total_fat=0, total_carbs=0,
            menu=[], message="Немає продуктів після фільтрації.",
        )

    templates = _get_templates_for(profile)
    seed = int(time.time() * 1000) % 100000

    best_result = None
    best_cost = float("inf")
    best_template_name = ""

    # Перебираємо всі шаблони + рандомізовані варіанти
    for template in templates:
        # 2 спроби: cheap + random
        for mode in ["cheap", "random"]:
            selected = _select_for_template(template, products, mode=mode, seed=seed)
            if len(selected) < 6:
                continue

            result = _solve_template_lp(
                selected, norms, profile.budget,
                objective="min_cost",
                cal_tolerance=0.10,
                macro_tolerance=0.20,
            )

            if result and result.total_cost < best_cost:
                best_cost = result.total_cost
                best_result = result
                best_template_name = f"{template['name']} ({mode})"

    ms = round((time.time() - t0) * 1000, 1)

    if best_result is None:
        log_optimization(profile.budget, norms.target_calories,
                         0, 0, 0, ms, "infeasible")
        return OptimizationResult(
            status="infeasible", total_cost=0, total_calories=0,
            total_protein=0, total_fat=0, total_carbs=0,
            menu=[],
            message=(
                "Оптимальний раціон не знайдено.\n\n"
                "Спробуйте:\n"
                "• Збільшити бюджет\n"
                "• Зменшити кількість виключених продуктів\n"
                "• Змінити тип дієти на «Звичайне»"
            ),
        )

    log_optimization(
        profile.budget, norms.target_calories,
        best_result.total_cost, best_result.total_calories,
        len(best_result.menu), ms, "optimal",
    )
    logger.info(
        f"✅ Оптимізований ({best_template_name}): "
        f"{best_result.total_cost} грн, {len(best_result.menu)} продуктів, {ms} мс"
    )
    return best_result


# ════════════════════════════════════════════════════════════
#  ЗВИЧАЙНИЙ РАЦІОН — використовує бюджет (95–100%)
# ════════════════════════════════════════════════════════════

def run_basic_optimization(
        profile: UserProfile,
        norms: NutritionNorms,
) -> OptimizationResult:
    """
    Реалістичний раціон: ціна МАКСИМАЛЬНО близька до бюджету.
    Багатоступенева стратегія з рандомізацією для різноманітності.
    """
    t0 = time.time()
    products = _load_products(profile)

    if not products:
        return OptimizationResult(
            status="error", total_cost=0, total_calories=0,
            total_protein=0, total_fat=0, total_carbs=0,
            menu=[], message="Немає реалістичних продуктів.",
        )

    templates = _get_templates_for(profile)

    # Рандомний seed для різноманітності між запусками
    seed = int(time.time() * 1000) % 100000
    rng = random.Random(seed)

    shuffled = list(templates)
    rng.shuffle(shuffled)

    # Стратегії: чим далі — тим менш строгі обмеження
    # (mult_max, budget_min_pct, cal_tol, macro_tol, mode)
    strategies = [
        # 1: жорсткі вимоги — близько до бюджету
        (2.0, 0.95, 0.10, 0.20, "random"),
        (2.5, 0.95, 0.10, 0.20, "middle"),
        # 2: трохи м'якше
        (2.5, 0.90, 0.12, 0.22, "random"),
        (3.0, 0.90, 0.12, 0.22, "middle"),
        # 3: ще м'якше
        (3.0, 0.85, 0.13, 0.25, "random"),
        (3.5, 0.85, 0.13, 0.25, "middle"),
        # 4: останні спроби
        (3.5, 0.75, 0.15, 0.28, "random"),
        (4.0, 0.65, 0.15, 0.30, "middle"),
        (4.0, 0.50, 0.18, 0.30, "cheap"),
    ]

    best_result = None
    best_diff = float("inf")  # відстань до бюджету

    for s_idx, (mult, b_min, cal_t, mac_t, mode) in enumerate(strategies, 1):
        for template in shuffled:
            selected = _select_for_template(
                template, products, mode=mode, seed=seed + s_idx
            )
            if len(selected) < 6:
                continue

            selected_expanded = [
                (p, m, mn, mx * mult)
                for p, m, mn, mx in selected
            ]

            result = _solve_template_lp(
                selected_expanded, norms, profile.budget,
                objective="max_budget",
                cal_tolerance=cal_t,
                macro_tolerance=mac_t,
                budget_min_pct=b_min,
            )

            if result:
                diff = abs(profile.budget - result.total_cost)
                # Якщо це найкращий поки що результат за відстанню до бюджету
                if diff < best_diff:
                    best_diff = diff
                    best_result = result
                    logger.info(
                        f"  ✓ Стратегія {s_idx}, '{template['name']}' ({mode}): "
                        f"{result.total_cost} / {profile.budget} грн "
                        f"({result.total_cost / profile.budget * 100:.0f}%)"
                    )

        # Якщо вже знайшли результат на ≥90% бюджету — зупиняємось
        if best_result and best_result.total_cost >= profile.budget * 0.90:
            break

    ms = round((time.time() - t0) * 1000, 1)

    if best_result is None:
        logger.warning(f"❌ Звичайний: всі стратегії провалились | {ms} мс")
        return OptimizationResult(
            status="infeasible", total_cost=0, total_calories=0,
            total_protein=0, total_fat=0, total_carbs=0,
            menu=[],
            message=(
                "Не вдалося скласти звичайний раціон.\n"
                "Спробуйте збільшити бюджет або змінити параметри."
            ),
        )

    logger.info(
        f"✅ Звичайний: {best_result.total_cost} / {profile.budget} грн "
        f"({best_result.total_cost / profile.budget * 100:.0f}%), "
        f"{len(best_result.menu)} продуктів, {ms} мс"
    )
    return best_result
