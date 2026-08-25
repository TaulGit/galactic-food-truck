/** A selectable cooking ingredient. Inventory is intentionally unlimited in the MVP. */
export const INGREDIENT_IDS = [
  "twig",
  "honey",
  "berries",
  "meat",
  "fish",
  "egg",
  "carrot",
  "mushroom",
] as const;

export type IngredientId = (typeof INGREDIENT_IDS)[number];

export const INGREDIENT_TAGS = [
  "meat",
  "fish",
  "egg",
  "vegetable",
  "sweet",
  "filler",
] as const;

export type IngredientTag = (typeof INGREDIENT_TAGS)[number];
export type IngredientSource = "chest" | "fridge";

export interface Ingredient {
  readonly id: IngredientId;
  readonly name: string;
  readonly icon: string;
  readonly image: string;
  readonly source: IngredientSource;
  readonly tags: readonly IngredientTag[];
}

export const INGREDIENTS: Readonly<Record<IngredientId, Ingredient>> = {
  twig: {
    id: "twig",
    name: "树枝",
    icon: "🌿",
    image: "./assets/ingredients/ingredient-twig.png",
    source: "chest",
    tags: ["filler"],
  },
  honey: {
    id: "honey",
    name: "蜂蜜",
    icon: "🍯",
    image: "./assets/ingredients/ingredient-honey.png",
    source: "chest",
    tags: ["sweet", "filler"],
  },
  berries: {
    id: "berries",
    name: "浆果",
    icon: "🫐",
    image: "./assets/ingredients/ingredient-berries.png",
    source: "chest",
    tags: ["sweet", "filler"],
  },
  meat: {
    id: "meat",
    name: "肉",
    icon: "🥩",
    image: "./assets/ingredients/ingredient-meat.png",
    source: "fridge",
    tags: ["meat"],
  },
  fish: {
    id: "fish",
    name: "鱼",
    icon: "🐟",
    image: "./assets/ingredients/ingredient-fish.png",
    source: "fridge",
    tags: ["fish"],
  },
  egg: {
    id: "egg",
    name: "蛋",
    icon: "🥚",
    image: "./assets/ingredients/ingredient-egg.png",
    source: "fridge",
    tags: ["egg"],
  },
  carrot: {
    id: "carrot",
    name: "胡萝卜",
    icon: "🥕",
    image: "./assets/ingredients/ingredient-carrot.png",
    source: "fridge",
    tags: ["vegetable"],
  },
  mushroom: {
    id: "mushroom",
    name: "蘑菇",
    icon: "🍄",
    image: "./assets/ingredients/ingredient-mushroom.png",
    source: "fridge",
    tags: ["vegetable"],
  },
};

/** Ingredient ids grouped for the chest and fridge panels. */
export const INGREDIENTS_BY_SOURCE: Readonly<
  Record<IngredientSource, readonly IngredientId[]>
> = {
  chest: ["twig", "honey", "berries"],
  fridge: ["meat", "fish", "egg", "carrot", "mushroom"],
};
