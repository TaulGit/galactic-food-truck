import type { IngredientId, IngredientTag } from "./ingredients";

export const RECIPE_IDS = [
  "honey_ham",
  "dumplings",
  "fish_steak",
  "vegetable_medley",
  "meatballs",
] as const;

export type RecipeId = (typeof RECIPE_IDS)[number];
export type FailedDishId = "failed_dish";
export type DishId = RecipeId | FailedDishId;

export type TagRule = Readonly<Partial<Record<IngredientTag, number>>>;
export type IngredientRule = Readonly<Partial<Record<IngredientId, number>>>;

/**
 * A recipe is a data-only rule. The matcher applies all minimums and maximums,
 * then selects the highest-priority matching recipe.
 */
export interface RecipeCondition {
  readonly minTags?: TagRule;
  readonly maxTags?: TagRule;
  readonly minIngredients?: IngredientRule;
}

export interface Recipe {
  readonly id: RecipeId;
  readonly name: string;
  readonly icon: string;
  readonly hint: string;
  readonly isFailure: false;
  readonly priority: number;
  readonly condition: RecipeCondition;
}

export interface FailedDish {
  readonly id: FailedDishId;
  readonly name: string;
  readonly icon: string;
  readonly hint: string;
  readonly isFailure: true;
}

export type CookedDish = Recipe | FailedDish;

/**
 * Recipes are deliberately ordered by priority as a human-readable backup to
 * the explicit priority sort performed by recipeMatcher.
 */
export const RECIPES: readonly Recipe[] = [
  {
    id: "honey_ham",
    name: "蜜汁火腿",
    icon: "🍖",
    hint: "至少 2 份肉类 + 1 份甜味食材",
    isFailure: false,
    priority: 500,
    condition: {
      minTags: { meat: 2, sweet: 1 },
    },
  },
  {
    id: "dumplings",
    name: "饺子",
    icon: "🥟",
    hint: "肉类、蛋类和蔬菜各至少 1 份",
    isFailure: false,
    priority: 400,
    condition: {
      minTags: { meat: 1, egg: 1, vegetable: 1 },
    },
  },
  {
    id: "fish_steak",
    name: "鱼排",
    icon: "🐟",
    hint: "至少 1 份鱼类",
    isFailure: false,
    priority: 300,
    condition: {
      minTags: { fish: 1 },
    },
  },
  {
    id: "vegetable_medley",
    name: "蔬菜杂烩",
    icon: "🥘",
    hint: "至少 2 份蔬菜，不能加入肉、鱼或蛋",
    isFailure: false,
    priority: 200,
    condition: {
      minTags: { vegetable: 2 },
      maxTags: { meat: 0, fish: 0, egg: 0 },
    },
  },
  {
    id: "meatballs",
    name: "肉丸",
    icon: "🧆",
    hint: "至少 1 份肉类 + 2 份填充物",
    isFailure: false,
    priority: 100,
    condition: {
      minTags: { meat: 1, filler: 2 },
    },
  },
];

export const FAILED_RECIPE: FailedDish = {
  id: "failed_dish",
  name: "失败料理",
  icon: "🥣",
  hint: "这锅食材没有组成可用料理",
  isFailure: true,
};
