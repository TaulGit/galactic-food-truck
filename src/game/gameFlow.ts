import type { IngredientId } from './ingredients'
import {
  CAMPFIRE_INGREDIENT_COUNT,
  isGrillableIngredient,
  matchGrilledDish,
  matchRecipe,
  REQUIRED_INGREDIENT_COUNT,
} from './recipeMatcher'
import { COOKABLE_DISHES, type OrderId } from './recipes'
import {
  DEFAULT_CAMPFIRE_COOK_DURATION_MS,
  DEFAULT_COOK_DURATION_MS,
  DEFAULT_ORDER_TOTAL,
  getCurrentOrderId,
  type CookingTool,
  type GameState,
} from './gameState'

export interface GameFlowOptions {
  readonly now?: () => number
  readonly random?: () => number
  readonly totalOrders?: number
  readonly cookDurationMs?: number
  readonly campfireCookDurationMs?: number
}

export type ActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

type StateListener = (state: GameState) => void

const ORDER_IDS = COOKABLE_DISHES.map((dish) => dish.id)

/** Creates an order stream where a recipe can never immediately repeat. */
export function createOrderSequence(
  totalOrders: number,
  random: () => number = Math.random,
): readonly OrderId[] {
  if (!Number.isInteger(totalOrders) || totalOrders < 1) {
    throw new Error('totalOrders must be a positive integer')
  }

  if (ORDER_IDS.length < 2 && totalOrders > 1) {
    throw new Error('At least two recipes are required for non-repeating orders')
  }

  const orderIds: OrderId[] = []
  for (let index = 0; index < totalOrders; index += 1) {
    const candidates = ORDER_IDS.filter(
      (orderId) => orderId !== orderIds[index - 1],
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
  private readonly campfireCookDurationMs: number
  private readonly listeners = new Set<StateListener>()
  private internalState: GameState

  constructor(options: GameFlowOptions = {}) {
    this.now = options.now ?? Date.now
    this.random = options.random ?? Math.random
    this.totalOrders = options.totalOrders ?? DEFAULT_ORDER_TOTAL
    this.cookDurationMs = options.cookDurationMs ?? DEFAULT_COOK_DURATION_MS
    this.campfireCookDurationMs = options.campfireCookDurationMs ?? DEFAULT_CAMPFIRE_COOK_DURATION_MS
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
      return this.reject('当前厨具正在处理上一批食材。')
    }
    if (this.internalState.cookingTool === 'pot' && !this.internalState.potLidOpen) {
      return this.reject('请先点击锅盖打开烹饪锅，再放入食材。')
    }
    const ingredientLimit = this.internalState.cookingTool === 'campfire'
      ? CAMPFIRE_INGREDIENT_COUNT
      : REQUIRED_INGREDIENT_COUNT

    if (
      this.internalState.cookingTool === 'campfire' &&
      !isGrillableIngredient(ingredientId)
    ) {
      return this.reject('篝火不能直接烤这份食材，请选择肉、鱼、蛋、胡萝卜、蘑菇或浆果。')
    }

    if (this.internalState.pot.length >= ingredientLimit) {
      return this.reject(
        this.internalState.cookingTool === 'campfire'
          ? '篝火一次只能烤 1 份食材。'
          : '锅已经放满 4 份食材了。',
      )
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
      return this.reject('这个食材槽已经是空的。')
    }

    this.update({
      pot: this.internalState.pot.filter((_, itemIndex) => itemIndex !== index),
      delivery: null,
    })
    return { ok: true }
  }

  clearPot(): ActionResult {
    if (this.internalState.phase !== 'SELECTING') {
      return this.reject('烹饪开始后不能清空厨具。')
    }
    if (this.internalState.pot.length === 0) {
      return this.reject('厨具里还没有食材。')
    }
    this.update({ pot: [], delivery: null })
    return { ok: true }
  }

  togglePotLid(): ActionResult {
    if (this.internalState.phase !== 'SELECTING') {
      return this.reject('料理进行中不能操作锅盖。')
    }
    if (this.internalState.cookingTool !== 'pot') {
      return this.reject('当前使用的是篝火，没有可操作的锅盖。')
    }
    if (this.internalState.potLidOpen && this.internalState.pot.length > 0) {
      return this.reject('锅里还有食材，请先移除食材后再合盖。')
    }

    this.update({
      potLidOpen: !this.internalState.potLidOpen,
      delivery: null,
    })
    return { ok: true }
  }

  switchCookingTool(): ActionResult {
    if (this.internalState.phase !== 'SELECTING') {
      return this.reject('料理进行中不能切换厨具。')
    }

    const nextTool: CookingTool = this.internalState.cookingTool === 'pot'
      ? 'campfire'
      : 'pot'

    if (nextTool === 'campfire') {
      if (this.internalState.pot.length > CAMPFIRE_INGREDIENT_COUNT) {
        return this.reject('篝火一次只能烤 1 份食材，请先点食材槽移除多余食材。')
      }
      if (this.internalState.pot.some((ingredientId) => !isGrillableIngredient(ingredientId))) {
        return this.reject('篝火不能直接烤当前食材，请先点食材槽移除不可烤的食材。')
      }
    }

    this.update({
      cookingTool: nextTool,
      // 篝火没有锅盖；切回烹饪锅时，空锅合盖待机，有遗留食材则保持开盖
      // 让玩家可以继续整理槽位。
      potLidOpen: nextTool === 'pot' ? this.internalState.pot.length > 0 : true,
      delivery: null,
    })
    return { ok: true }
  }

  startCooking(): ActionResult {
    if (this.internalState.phase !== 'SELECTING') {
      return this.reject('现在不能开始新的烹饪。')
    }
    if (this.internalState.cookingTool === 'pot' && !this.internalState.potLidOpen) {
      return this.reject('请先打开锅盖并放入食材。')
    }
    const requiredIngredientCount = this.internalState.cookingTool === 'campfire'
      ? CAMPFIRE_INGREDIENT_COUNT
      : REQUIRED_INGREDIENT_COUNT

    if (this.internalState.pot.length !== requiredIngredientCount) {
      return this.reject(
        this.internalState.cookingTool === 'campfire'
          ? '请先放入 1 份可直接烤制的食材。'
          : '请先放满 4 份食材。',
      )
    }

    const startedAt = this.now()
    this.update({
      phase: 'COOKING',
      cookingStartedAt: startedAt,
      cookingEndsAt: startedAt + (
        this.internalState.cookingTool === 'campfire'
          ? this.campfireCookDurationMs
          : this.cookDurationMs
      ),
      potLidOpen: this.internalState.cookingTool === 'campfire',
      delivery: null,
    })
    return { ok: true }
  }

  finishCooking(): ActionResult {
    if (this.internalState.phase !== 'COOKING') {
      return this.reject('当前厨具没有在烹饪。')
    }
    if (
      this.internalState.cookingEndsAt !== null &&
      this.now() < this.internalState.cookingEndsAt
    ) {
      return this.reject('料理还在烹饪中。')
    }

    this.update({
      phase: 'READY',
      finishedDish: this.internalState.cookingTool === 'campfire'
        ? matchGrilledDish(this.internalState.pot)
        : matchRecipe(this.internalState.pot),
      cookingStartedAt: null,
      cookingEndsAt: null,
      potLidOpen: this.internalState.cookingTool === 'campfire',
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
      cookingTool: 'pot',
      potLidOpen: false,
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
