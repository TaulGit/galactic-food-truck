import type { IngredientId } from './ingredients'
import {
  matchRecipe,
  REQUIRED_INGREDIENT_COUNT,
} from './recipeMatcher'
import { RECIPES, type RecipeId } from './recipes'
import {
  DEFAULT_COOK_DURATION_MS,
  DEFAULT_ORDER_TOTAL,
  getCurrentOrderId,
  type GameState,
} from './gameState'

export interface GameFlowOptions {
  readonly now?: () => number
  readonly random?: () => number
  readonly totalOrders?: number
  readonly cookDurationMs?: number
}

export type ActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

type StateListener = (state: GameState) => void

const RECIPE_IDS = RECIPES.map((recipe) => recipe.id)

/** Creates an order stream where a recipe can never immediately repeat. */
export function createOrderSequence(
  totalOrders: number,
  random: () => number = Math.random,
): readonly RecipeId[] {
  if (!Number.isInteger(totalOrders) || totalOrders < 1) {
    throw new Error('totalOrders must be a positive integer')
  }

  if (RECIPE_IDS.length < 2 && totalOrders > 1) {
    throw new Error('At least two recipes are required for non-repeating orders')
  }

  const orderIds: RecipeId[] = []
  for (let index = 0; index < totalOrders; index += 1) {
    const candidates = RECIPE_IDS.filter(
      (recipeId) => recipeId !== orderIds[index - 1],
    )
    const boundedIndex = Math.min(
      candidates.length - 1,
      Math.max(0, Math.floor(random() * candidates.length)),
    )
    orderIds.push(candidates[boundedIndex])
  }
  return orderIds
}

/**
 * Small, self-contained state machine for one cooking round. Rendering and
 * timer scheduling live outside the class, so the flow stays easy to test.
 */
export class GameFlow {
  private readonly now: () => number
  private readonly random: () => number
  private readonly totalOrders: number
  private readonly cookDurationMs: number
  private readonly listeners = new Set<StateListener>()
  private internalState: GameState

  constructor(options: GameFlowOptions = {}) {
    this.now = options.now ?? Date.now
    this.random = options.random ?? Math.random
    this.totalOrders = options.totalOrders ?? DEFAULT_ORDER_TOTAL
    this.cookDurationMs = options.cookDurationMs ?? DEFAULT_COOK_DURATION_MS
    this.internalState = this.createRound(this.now())
  }

  get state(): GameState {
    return this.internalState
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  restart(): void {
    this.internalState = this.createRound(this.now())
    this.emit()
  }

  addIngredient(ingredientId: IngredientId): ActionResult {
    if (this.internalState.phase !== 'SELECTING') {
      return this.reject('这口锅正在处理上一批食材。')
    }
    if (this.internalState.pot.length >= REQUIRED_INGREDIENT_COUNT) {
      return this.reject('锅已经放满 4 份食材了。')
    }

    this.update({
      pot: [...this.internalState.pot, ingredientId],
      delivery: null,
    })
    return { ok: true }
  }

  removeIngredient(index: number): ActionResult {
    if (this.internalState.phase !== 'SELECTING') {
      return this.reject('烹饪开始后不能再调整食材。')
    }
    if (!Number.isInteger(index) || index < 0 || index >= this.internalState.pot.length) {
      return this.reject('这个锅槽已经是空的。')
    }

    this.update({
      pot: this.internalState.pot.filter((_, itemIndex) => itemIndex !== index),
      delivery: null,
    })
    return { ok: true }
  }

  clearPot(): ActionResult {
    if (this.internalState.phase !== 'SELECTING') {
      return this.reject('烹饪开始后不能清空锅。')
    }
    if (this.internalState.pot.length === 0) {
      return this.reject('锅里还没有食材。')
    }
    this.update({ pot: [], delivery: null })
    return { ok: true }
  }

  startCooking(): ActionResult {
    if (this.internalState.phase !== 'SELECTING') {
      return this.reject('现在不能开始新的烹饪。')
    }
    if (this.internalState.pot.length !== REQUIRED_INGREDIENT_COUNT) {
      return this.reject('请先放满 4 份食材。')
    }

    const startedAt = this.now()
    this.update({
      phase: 'COOKING',
      cookingStartedAt: startedAt,
      cookingEndsAt: startedAt + this.cookDurationMs,
      delivery: null,
    })
    return { ok: true }
  }

  finishCooking(): ActionResult {
    if (this.internalState.phase !== 'COOKING') {
      return this.reject('锅现在没有在烹饪。')
    }
    if (
      this.internalState.cookingEndsAt !== null &&
      this.now() < this.internalState.cookingEndsAt
    ) {
      return this.reject('料理还在烹饪中。')
    }

    this.update({
      phase: 'READY',
      finishedDish: matchRecipe(this.internalState.pot),
      cookingStartedAt: null,
      cookingEndsAt: null,
    })
    return { ok: true }
  }

  beginDelivery(): ActionResult {
    if (this.internalState.phase !== 'READY' || !this.internalState.finishedDish) {
      return this.reject('先完成一份料理，再送到出餐口。')
    }
    const orderId = getCurrentOrderId(this.internalState)
    if (!orderId) {
      return this.reject('本局已经结束。')
    }

    const delivery = {
      correct: this.internalState.finishedDish.id === orderId,
      dish: this.internalState.finishedDish,
      orderId,
    }
    this.update({ phase: 'DELIVERING', delivery })
    return { ok: true }
  }

  finishDelivery(): ActionResult {
    if (this.internalState.phase !== 'DELIVERING' || !this.internalState.delivery) {
      return this.reject('目前没有等待结算的出餐。')
    }

    const now = this.now()
    const { correct } = this.internalState.delivery
    const completedOrders = this.internalState.completedOrders + (correct ? 1 : 0)
    const roundIsOver = completedOrders >= this.internalState.totalOrders

    this.update({
      phase: roundIsOver ? 'ROUND_OVER' : 'SELECTING',
      pot: [],
      finishedDish: null,
      completedOrders,
      mistakes: this.internalState.mistakes + (correct ? 0 : 1),
      endedAt: roundIsOver ? now : null,
      cookingStartedAt: null,
      cookingEndsAt: null,
    })
    return { ok: true }
  }

  private createRound(startedAt: number): GameState {
    return {
      phase: 'SELECTING',
      pot: [],
      finishedDish: null,
      orderIds: createOrderSequence(this.totalOrders, this.random),
      completedOrders: 0,
      totalOrders: this.totalOrders,
      mistakes: 0,
      startedAt,
      endedAt: null,
      cookingStartedAt: null,
      cookingEndsAt: null,
      delivery: null,
    }
  }

  private reject(reason: string): ActionResult {
    return { ok: false, reason }
  }

  private update(change: Partial<GameState>): void {
    this.internalState = { ...this.internalState, ...change }
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.internalState)
    }
  }
}
