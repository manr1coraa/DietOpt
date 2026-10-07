# Request and response models for the optional API.

from pydantic import BaseModel, Field
from typing import Optional, List


class UserProfile(BaseModel):
    """Профіль користувача для розрахунку норм КБЖУ."""
    gender: str
    age: int = Field(..., ge=14, le=80)
    height: float = Field(..., ge=140, le=220)
    weight: float = Field(..., ge=40, le=200)
    activity_level: str
    goal: str
    budget: float = Field(..., ge=50, le=1000)
    allergies: Optional[str] = ""
    excluded_foods: Optional[str] = ""
    diet_type: Optional[str] = "standard"


class NutritionNorms(BaseModel):
    """Розраховані добові норми КБЖУ."""
    bmr: float
    tdee: float
    target_calories: float
    protein_min: float
    protein_max: float
    fat_min: float
    fat_max: float
    carbs_min: float
    carbs_max: float
    water_ml: int
    bmi: float
    bmi_status: str


class OptimizeRequest(BaseModel):
    """Запит на оптимізацію раціону."""
    profile: UserProfile
    norms: NutritionNorms


class ProductItem(BaseModel):
    """Один продукт у складі меню."""
    name: str
    amount_g: float
    calories: float
    protein: float
    fat: float
    carbs: float
    cost: float
    meal: str
    category: Optional[str] = ""


class OptimizationResult(BaseModel):
    """Результат оптимізації раціону."""
    status: str
    total_cost: float
    total_calories: float
    total_protein: float
    total_fat: float
    total_carbs: float
    menu: List[ProductItem]
    message: Optional[str] = None


class AIRequest(BaseModel):
    """Запит на генерацію рецептів AI."""
    menu: List[ProductItem]
    profile: UserProfile
    request_type: str = "recipes"