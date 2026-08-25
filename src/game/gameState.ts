import type { IngredientId } from './ingredients'
import type { CookedDish, OrderId } from './recipes'

export const DEFAULT_ORDER_TOTAL = 5
export const DEFAULT_COOK_DURATION_MS = 3_000
export const DEFAULT_CAMPFIRE_COOK_DURATION_MS = 2_000

export type CookingTool = 'pot' | 'campfire'

export type GamePhase =
  | 'SELECTING'
  | 'COOKING'
  | 'READY'
  | 'DELIVERING'
  | 'ROUND_OVER'

export interface DeliveryFeedback {
  readonly correct: boolean
  readonly dish: CookedDish
  readonly orderId: OrderId
}

/**
 * The entire in-round model. It deliberately contains no persistent inventory
 * or platform data: every round starts fresh and all ingredients are unlimited.
 */
export interface GameState {
  readonly phase: GamePhase
  readonly cookingTool: CookingTool
  readonly potLidOpen: boolean
  readonly pot: readonly IngredientId[]
  readonly finishedDish: CookedDish | null
  readonly orderIds: readonly OrderId[]
  readonly completedOrders: number
  readonly totalOrders: number
  readonly mistakes: number
  readonly startedAt: number
  readonly endedAt: number | null
  readonly cookingStartedAt: number | null
  readonly cookingEndsAt: number | null
  readonly delivery: DeliveryFeedback | null
}

export function getCurrentOrderId(state: GameState): OrderId | null {
  return state.orderIds[state.completedOrders] ?? null
}

export function getElapsedMs(state: GameState, now: number): number {
  const endedAt = state.endedAt ?? now
  return Math.max(0, endedAt - state.startedAt)
}
