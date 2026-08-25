import { describe, expect, it } from "vitest";

import type { IngredientId } from "../src/game/ingredients";
import { FAILED_RECIPE, type RecipeId } from "../src/game/recipes";
import {
  CAMPFIRE_INGREDIENT_COUNT,
  REQUIRED_INGREDIENT_COUNT,
  getMatchingRecipes,
  hasRequiredIngredientCount,
  isGrillableIngredient,
  matchGrilledDish,
  matchRecipe,
} from "../src/game/recipeMatcher";

interface RecipeCase {
  readonly recipeId: RecipeId;
  readonly success: readonly IngredientId[];
  readonly adjacentFailure: readonly IngredientId[];
}

const recipeCases: readonly RecipeCase[] = [
  {
    recipeId: "meatballs",
    success: ["meat", "twig", "twig", "twig"],
    adjacentFailure: ["twig", "twig", "twig", "twig"],
  },
  {
    recipeId: "dumplings",
    success: ["meat", "egg", "carrot", "twig"],
    adjacentFailure: ["twig", "egg", "carrot", "twig"],
  },
  {
    recipeId: "fish_steak",
    success: ["fish", "twig", "twig", "twig"],
    adjacentFailure: ["twig", "twig", "twig", "twig"],
  },
  {
    recipeId: "honey_ham",
    success: ["meat", "meat", "honey", "twig"],
    adjacentFailure: ["meat", "meat", "egg", "twig"],
  },
  {
    recipeId: "vegetable_medley",
    success: ["carrot", "mushroom", "twig", "twig"],
    adjacentFailure: ["carrot", "twig", "twig", "twig"],
  },
];

describe("recipeMatcher", () => {
  for (const recipeCase of recipeCases) {
    it(`makes ${recipeCase.recipeId} and rejects its one-ingredient-neighbor`, () => {
      expect(recipeCase.success).toHaveLength(REQUIRED_INGREDIENT_COUNT);
      expect(recipeCase.adjacentFailure).toHaveLength(
        REQUIRED_INGREDIENT_COUNT,
      );

      const changedSlots = recipeCase.success.filter(
        (ingredientId, index) => ingredientId !== recipeCase.adjacentFailure[index],
      );
      expect(changedSlots).toHaveLength(1);

      expect(matchRecipe(recipeCase.success).id).toBe(recipeCase.recipeId);
      expect(matchRecipe(recipeCase.adjacentFailure).id).toBe(
        FAILED_RECIPE.id,
      );
    });
  }

  it("uses priority when a batch matches more than one recipe", () => {
    const fishAndMeatballs = ["fish", "meat", "twig", "twig"] as const;
    expect(getMatchingRecipes(fishAndMeatballs).map((recipe) => recipe.id)).toEqual([
      "fish_steak",
      "meatballs",
    ]);
    expect(matchRecipe(fishAndMeatballs).id).toBe("fish_steak");

    const honeyHamAndMeatballs = ["meat", "meat", "honey", "twig"] as const;
    expect(
      getMatchingRecipes(honeyHamAndMeatballs).map((recipe) => recipe.id),
    ).toEqual(["honey_ham", "meatballs"]);
    expect(matchRecipe(honeyHamAndMeatballs).id).toBe("honey_ham");
  });

  it("requires exactly four ingredients before cooking", () => {
    const incomplete = ["meat", "twig", "twig"] as const;
    const overfilled = ["meat", "twig", "twig", "twig", "twig"] as const;

    expect(hasRequiredIngredientCount(incomplete)).toBe(false);
    expect(hasRequiredIngredientCount(overfilled)).toBe(false);
    expect(getMatchingRecipes(incomplete)).toEqual([]);
    expect(getMatchingRecipes(overfilled)).toEqual([]);
    expect(matchRecipe(incomplete).id).toBe(FAILED_RECIPE.id);
    expect(matchRecipe(overfilled).id).toBe(FAILED_RECIPE.id);
  });

  it("resolves one edible ingredient as a campfire dish", () => {
    expect(CAMPFIRE_INGREDIENT_COUNT).toBe(1);
    expect(isGrillableIngredient("meat")).toBe(true);
    expect(isGrillableIngredient("twig")).toBe(false);
    expect(matchGrilledDish(["meat"]).id).toBe("grilled_meat");
    expect(matchGrilledDish(["twig"]).id).toBe(FAILED_RECIPE.id);
    expect(matchGrilledDish(["meat", "fish"]).id).toBe(FAILED_RECIPE.id);
  });
});
