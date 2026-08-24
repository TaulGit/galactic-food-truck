import { describe, expect, it } from 'vitest'

import { GameFlow, createOrderSequence } from '../src/game/gameFlow'
import { getCurrentOrderId } from '../src/game/gameState'
import { RECIPES } from '../src/game/recipes'

function createClock() {
  let current = 10_000
  return {
    now: () => current,
    advance: (milliseconds: number) => {
      current += milliseconds
    },
  }
}

function addAndCook(flow: GameFlow, ingredients: Parameters<GameFlow['addIngredient']>[0][]) {
  for (const ingredient of ingredients) {
    expect(flow.addIngredient(ingredient).ok).toBe(true)
  }
  expect(flow.startCooking().ok).toBe(true)
}

describe('GameFlow', () => {
  it('generates the configured number of orders without adjacent duplicates', () => {
    const orders = createOrderSequence(20, () => 0)
    expect(orders).toHaveLength(20)
    orders.slice(1).forEach((order, index) => {
      expect(order).not.toBe(orders[index])
    })
  })

  it('locks the pot during cooking and cannot finish it early', () => {
    const clock = createClock()
    const flow = new GameFlow({ now: clock.now, cookDurationMs: 3_000 })
    addAndCook(flow, ['meat', 'twig', 'twig', 'twig'])

    expect(flow.addIngredient('meat').ok).toBe(false)
    expect(flow.clearPot().ok).toBe(false)
    expect(flow.finishCooking().ok).toBe(false)

    clock.advance(3_000)
    expect(flow.finishCooking().ok).toBe(true)
    expect(flow.state.phase).toBe('READY')
    expect(flow.state.finishedDish?.id).toBe('meatballs')
  })

  it('keeps the order after one wrong delivery and counts the mistake once', () => {
    const clock = createClock()
    const flow = new GameFlow({ now: clock.now, random: () => 0, cookDurationMs: 1 })
    const firstOrder = getCurrentOrderId(flow.state)
    const wrongRecipe = RECIPES.find((recipe) => recipe.id !== firstOrder)
    expect(wrongRecipe).toBeDefined()

    const wrongIngredients = wrongRecipe?.id === 'honey_ham'
      ? ['meat', 'meat', 'honey', 'twig'] as const
      : ['meat', 'twig', 'twig', 'twig'] as const
    addAndCook(flow, [...wrongIngredients])
    clock.advance(1)
    flow.finishCooking()
    flow.beginDelivery()
    expect(flow.beginDelivery().ok).toBe(false)
    flow.finishDelivery()

    expect(flow.state.phase).toBe('SELECTING')
    expect(flow.state.mistakes).toBe(1)
    expect(getCurrentOrderId(flow.state)).toBe(firstOrder)
  })

  it('ends after five correct orders, freezes time, and resets completely', () => {
    const clock = createClock()
    const flow = new GameFlow({
      now: clock.now,
      random: () => 0,
      cookDurationMs: 1,
      totalOrders: 5,
    })

    const recipeIngredients: Record<string, readonly Parameters<GameFlow['addIngredient']>[0][]> = {
      meatballs: ['meat', 'twig', 'twig', 'twig'],
      dumplings: ['meat', 'egg', 'carrot', 'twig'],
      fish_steak: ['fish', 'twig', 'twig', 'twig'],
      honey_ham: ['meat', 'meat', 'honey', 'twig'],
      vegetable_medley: ['carrot', 'mushroom', 'twig', 'twig'],
    }

    for (let count = 0; count < 5; count += 1) {
      const orderId = getCurrentOrderId(flow.state)
      expect(orderId).not.toBeNull()
      addAndCook(flow, [...recipeIngredients[orderId!]])
      clock.advance(1)
      expect(flow.finishCooking().ok).toBe(true)
      expect(flow.beginDelivery().ok).toBe(true)
      expect(flow.finishDelivery().ok).toBe(true)
    }

    expect(flow.state.phase).toBe('ROUND_OVER')
    expect(flow.state.completedOrders).toBe(5)
    const endedAt = flow.state.endedAt
    clock.advance(99_000)
    expect(flow.state.endedAt).toBe(endedAt)
    expect(flow.addIngredient('meat').ok).toBe(false)

    flow.restart()
    expect(flow.state.phase).toBe('SELECTING')
    expect(flow.state.completedOrders).toBe(0)
    expect(flow.state.mistakes).toBe(0)
    expect(flow.state.pot).toEqual([])
    expect(flow.state.finishedDish).toBeNull()
  })
})
