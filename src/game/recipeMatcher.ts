import {
  INGREDIENTS,
  INGREDIENT_IDS,
  INGREDIENT_TAGS,
  type IngredientId,
  type IngredientTag,
} from "./ingredients";
import {
  FAILED_RECIPE,
  RECIPES,
  type CookedDish,
  type IngredientRule,
  type Recipe,
  type RecipeCondition,
  type TagRule,
} from "./recipes";

/** Every cooking attempt must contain exactly four ingredients. */
export const REQUIRED_INGREDIENT_COUNT = 4;

export type TagCounts = Readonly<Record<IngredientTag, number>>;
export type IngredientCounts = Readonly<Record<IngredientId, number>>;

function createEmptyTagCounts(): Record<IngredientTag, number> {
  return Object.fromEntries(
    INGREDIENT_TAGS.map((tag) => [tag, 0]),
  ) as Record<IngredientTag, number>;
}

function createEmptyIngredientCounts(): Record<IngredientId, number> {
  return Object.fromEntries(
    INGREDIENT_IDS.map((ingredientId) => [ingredientId, 0]),
  ) as Record<IngredientId, number>;
}

export function hasRequiredIngredientCount(
  ingredientIds: readonly IngredientId[],
): boolean {
  return ingredientIds.length === REQUIRED_INGREDIENT_COUNT;
}

export function countIngredientTags(
  ingredientIds: readonly IngredientId[],
): TagCounts {
  const tagCounts = createEmptyTagCounts();

  for (const ingredientId of ingredientIds) {
    for (const tag of INGREDIENTS[ingredientId].tags) {
      tagCounts[tag] += 1;
    }
  }

  return tagCounts;
}

export function countIngredients(
  ingredientIds: readonly IngredientId[],
): IngredientCounts {
  const ingredientCounts = createEmptyIngredientCounts();

  for (const ingredientId of ingredientIds) {
    ingredientCounts[ingredientId] += 1;
  }

  return ingredientCounts;
}

function meetsMinimum<T extends string>(
  counts: Readonly<Record<T, number>>,
  rule: Readonly<Partial<Record<T, number>>> | undefined,
): boolean {
  return (Object.entries(rule ?? {}) as Array<[T, number]>).every(
    ([key, minimum]) => counts[key] >= minimum,
  );
}

function meetsMaximum<T extends string>(
  counts: Readonly<Record<T, number>>,
  rule: Readonly<Partial<Record<T, number>>> | undefined,
): boolean {
  return (Object.entries(rule ?? {}) as Array<[T, number]>).every(
    ([key, maximum]) => counts[key] <= maximum,
  );
}

function matchesCondition(
  condition: RecipeCondition,
  tagCounts: TagCounts,
  ingredientCounts: IngredientCounts,
): boolean {
  return (
    meetsMinimum<IngredientTag>(tagCounts, condition.minTags as TagRule) &&
    meetsMaximum<IngredientTag>(tagCounts, condition.maxTags as TagRule) &&
    meetsMinimum<IngredientId>(
      ingredientCounts,
      condition.minIngredients as IngredientRule,
    )
  );
}

/**
 * Returns all matching recipes in effective evaluation order. This is useful
 * for tests and for a future recipe-book UI; normal game flow should use
 * matchRecipe() and consume only its first result.
 */
export function getMatchingRecipes(
  ingredientIds: readonly IngredientId[],
): readonly Recipe[] {
  if (!hasRequiredIngredientCount(ingredientIds)) {
    return [];
  }

  const tagCounts = countIngredientTags(ingredientIds);
  const ingredientCounts = countIngredients(ingredientIds);

  return RECIPES.filter((recipe) =>
    matchesCondition(recipe.condition, tagCounts, ingredientCounts),
  ).sort((left, right) => right.priority - left.priority);
}

/** True only when a full, four-ingredient batch satisfies this recipe. */
export function matchesRecipe(
  recipe: Recipe,
  ingredientIds: readonly IngredientId[],
): boolean {
  return getMatchingRecipes(ingredientIds).some(
    (candidate) => candidate.id === recipe.id,
  );
}

/**
 * Resolves one full pot into its highest-priority recipe. Incomplete or
 * unmatched batches always return the single failure-dish fallback.
 */
export function matchRecipe(
  ingredientIds: readonly IngredientId[],
): CookedDish {
  return getMatchingRecipes(ingredientIds)[0] ?? FAILED_RECIPE;
}
