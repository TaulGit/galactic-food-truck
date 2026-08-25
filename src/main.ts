import './styles.css'

import { KitchenAudio } from './audio'
import { INGREDIENTS, INGREDIENTS_BY_SOURCE, type IngredientId, type IngredientSource } from './game/ingredients'
import { GameFlow, type ActionResult } from './game/gameFlow'
import {
  DEFAULT_CAMPFIRE_COOK_DURATION_MS,
  DEFAULT_COOK_DURATION_MS,
  getCurrentOrderId,
  getElapsedMs,
  type CookingTool,
  type GamePhase,
  type GameState,
} from './game/gameState'
import { isGrillableIngredient } from './game/recipeMatcher'
import { GRILLED_DISHES, RECIPES, type GrilledDish, type Recipe } from './game/recipes'
import { initializeStarLetter } from './platform'

type Panel = IngredientSource | null
type ToastKind = 'success' | 'error' | 'info'

interface Toast {
  readonly message: string
  readonly kind: ToastKind
}

const mountPoint = document.querySelector<HTMLDivElement>('#app')
if (!mountPoint) throw new Error('Game mount point is missing.')
const app: HTMLDivElement = mountPoint

const flow = new GameFlow()
const audio = new KitchenAudio()
const TOOL_COPY: Readonly<Record<CookingTool, {
  readonly icon: string
  readonly name: string
  readonly action: string
  readonly noun: string
  readonly duration: string
}>> = {
  pot: {
    icon: '🍲',
    name: '烹饪锅',
    action: '开始烹饪',
    noun: '下锅',
    duration: `${DEFAULT_COOK_DURATION_MS / 1_000} 秒`,
  },
  campfire: {
    icon: '🔥',
    name: '篝火',
    action: '开始烤制',
    noun: '上火',
    duration: `${DEFAULT_CAMPFIRE_COOK_DURATION_MS / 1_000} 秒`,
  },
}

type OrderDish = Recipe | GrilledDish

let activePanel: Panel = null
let toast: Toast | null = null
let toastTimer: number | undefined
let cookTimer: number | undefined
let deliveryTimer: number | undefined
let previousPhase: GamePhase = flow.state.phase

function dishFor(id: string | null): OrderDish | null {
  return [...RECIPES, ...GRILLED_DISHES].find((dish) => dish.id === id) ?? null
}

function formatTime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1_000)
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

function visualState(state: GameState): string {
  if (state.phase === 'COOKING') return 'cooking'
  if (state.phase === 'READY') return 'ready'
  if (state.phase === 'ROUND_OVER') return 'round-over'
  if (state.phase === 'DELIVERING') return state.delivery?.correct ? 'correct' : 'wrong'
  return 'selecting'
}

function statusText(state: GameState): string {
  const tool = TOOL_COPY[state.cookingTool]
  const requiredIngredientCount = state.cookingTool === 'campfire' ? 1 : 4

  if (state.phase === 'COOKING') return `${tool.name}加热中，请等待 ${tool.duration}。`
  if (state.phase === 'READY') return '料理完成，成品已送往右侧出餐口。'
  if (state.phase === 'DELIVERING') {
    return state.delivery?.correct ? '订单核验通过。' : '订单不符，料理已退回回收槽。'
  }
  if (state.phase === 'ROUND_OVER') return '本局已结算，准备好就再来一局。'
  if (state.cookingTool === 'pot' && !state.potLidOpen) {
    return '锅盖已合上，点击锅盖打开后再放入食材。'
  }
  if (state.pot.length === 0) {
    return state.cookingTool === 'campfire'
      ? '篝火一次直烤 1 份食材，请先选择肉、鱼、蛋、胡萝卜、蘑菇或浆果。'
      : '先点左侧箱子或冰箱，选入第一份食材。'
  }
  if (state.pot.length < requiredIngredientCount) {
    return `还差 ${requiredIngredientCount - state.pot.length} 份食材。`
  }
  return `食材已就位，点击“${tool.action}”。`
}

function renderSlots(state: GameState): string {
  const slotCount = state.cookingTool === 'campfire' ? 1 : 4
  const slotLabel = state.cookingTool === 'campfire' ? '烤制槽' : '锅槽'

  return Array.from({ length: slotCount }, (_, index) => {
    // 成品完成后会被送往出餐口；锅台视觉上随即腾空，避免让玩家误以为
    // 还需要再从锅里取一次成品。
    const ingredientId = state.phase === 'READY' || state.phase === 'DELIVERING'
      ? undefined
      : state.pot[index]
    const ingredient = ingredientId ? INGREDIENTS[ingredientId] : null
    const isRemovable = state.phase === 'SELECTING' && ingredient && (
      state.cookingTool === 'campfire' || state.potLidOpen
    )
    return `
      <button
        class="pot-slot${ingredient ? ' filled' : ''}"
        type="button"
        data-action="remove-ingredient"
        data-index="${index}"
        ${isRemovable ? '' : 'disabled'}
        aria-label="${ingredient ? `移除${ingredient.name}` : `空${slotLabel}`}"
        title="${ingredient ? `移除${ingredient.name}` : `空${slotLabel}`}"
      >${ingredient ? `<span class="pot-slot__icon"><img src="${ingredient.image}" alt="" aria-hidden="true" draggable="false" /></span>` : ''}</button>
    `
  }).join('')
}

function renderStoragePanel(source: IngredientSource, state: GameState): string {
  const title = source === 'chest' ? '食材箱' : '冰箱'
  const subtitle = state.cookingTool === 'pot' && !state.potLidOpen
    ? '锅盖已合上，请先点击锅盖打开烹饪锅。'
    : state.cookingTool === 'campfire'
    ? source === 'chest'
      ? '篝火直烤：浆果可以上火，树枝和蜂蜜不能直接烤。'
      : '篝火直烤：肉、鱼、蛋与蔬菜都可以单份烤制。'
    : source === 'chest'
      ? '树枝、蜂蜜和浆果都可以反复取用。'
      : '肉、鱼、蛋与蔬菜存放在这里。'
  const ingredientLimit = state.cookingTool === 'campfire' ? 1 : 4
  const disabled = state.phase !== 'SELECTING'
    || state.pot.length >= ingredientLimit
    || (state.cookingTool === 'pot' && !state.potLidOpen)
  const ingredientIds = INGREDIENTS_BY_SOURCE[source]
  const slots = Array.from({ length: 6 }, (_, index) => {
    const ingredientId = ingredientIds[index]
    if (!ingredientId) {
      return '<div class="storage-slot storage-slot--empty" aria-hidden="true"></div>'
    }

    const ingredient = INGREDIENTS[ingredientId]
    const grillBlocked = state.cookingTool === 'campfire' && !isGrillableIngredient(ingredientId)
    const itemDisabled = disabled || grillBlocked
    const itemHint = state.cookingTool === 'pot' && !state.potLidOpen
      ? '请先打开锅盖'
      : grillBlocked
        ? '篝火不能直接烤'
        : `取出${ingredient.name}`
    return `
      <button
        class="storage-slot"
        type="button"
        data-action="add-ingredient"
        data-ingredient="${ingredient.id}"
        ${itemDisabled ? 'disabled' : ''}
        aria-label="${itemHint}"
        title="${itemHint}"
      >
        <span class="storage-slot__icon" aria-hidden="true"><img src="${ingredient.image}" alt="" draggable="false" /></span>
        <span class="storage-slot__name">${ingredient.name}</span>
        ${grillBlocked ? '<span class="storage-slot__status">不可烤</span>' : ''}
      </button>
    `
  }).join('')

  return `
    <aside class="storage-panel storage-panel--${source}" role="region" aria-labelledby="storage-panel-title">
      <header class="storage-panel__header">
        <div>
          <h2 id="storage-panel-title">${title}</h2>
          <p>${state.pot.length}/${ingredientLimit} ${TOOL_COPY[state.cookingTool].noun}</p>
        </div>
        <button class="storage-close" type="button" data-action="close-storage" aria-label="关闭${title}" title="关闭">×</button>
      </header>
      <p class="storage-panel__intro">${subtitle}</p>
      <div class="storage-grid" aria-label="${title}中的食材格">
        ${slots}
      </div>
      <p class="storage-panel__tip">${statusText(state)}</p>
    </aside>
  `
}

function renderSummary(state: GameState): string {
  return `
    <div class="modal" aria-label="本局结算">
      <section class="round-summary" role="dialog" aria-modal="true" aria-labelledby="summary-title">
        <h2 id="summary-title">餐车出餐完成！</h2>
        <p>五份订单全部送达，星际食客给出了本局回执。</p>
        <dl>
          <div><dt>完成用时</dt><dd>${formatTime(getElapsedMs(state, Date.now()))}</dd></div>
          <div><dt>失误次数</dt><dd>${state.mistakes} 次</dd></div>
        </dl>
        <button class="action-button" type="button" data-action="restart">再来一局</button>
      </section>
    </div>
  `
}

function render(): void {
  const state = flow.state
  const currentOrder = dishFor(getCurrentOrderId(state))
  const stateName = visualState(state)
  const tool = TOOL_COPY[state.cookingTool]
  const nextCookingTool: CookingTool = state.cookingTool === 'pot' ? 'campfire' : 'pot'
  const nextTool = TOOL_COPY[nextCookingTool]
  const potLidOpen = state.cookingTool === 'pot' && state.potLidOpen
  const storageDisabled = state.phase !== 'SELECTING' || (
    state.cookingTool === 'pot' && !state.potLidOpen
  )
  const requiredIngredientCount = state.cookingTool === 'campfire' ? 1 : 4
  const canStartCooking = state.phase === 'SELECTING'
    && state.pot.length === requiredIngredientCount
    && (state.cookingTool === 'campfire' || potLidOpen)
  const orderFeedback = state.phase === 'DELIVERING'
    ? (state.delivery?.correct ? 'correct' : 'wrong')
    : ''
  const cookingToolState = state.phase === 'COOKING' ? 'cooking' : state.phase === 'READY' ? 'ready' : ''
  const servingState = state.phase === 'DELIVERING'
    ? (state.delivery?.correct ? 'correct' : 'wrong')
    : ''
  const readyDish = state.finishedDish
  const cookButtonLabel = state.phase === 'COOKING'
    ? `${tool.action.slice(2)}中…`
    : state.phase === 'READY' || state.phase === 'DELIVERING'
      ? '成品已送往出餐口'
      : tool.action

  app.innerHTML = `
    <div class="app-shell" data-state="${stateName}" data-tool="${state.cookingTool}">
      <header class="game-header">
        <div>
          <h1>星厨餐车</h1>
          <p>单房间星际厨房 · 取料、下锅 / 上火、出餐</p>
        </div>
        <button class="action-button secondary sound-button" type="button" data-action="toggle-sound" aria-pressed="${!audio.isMuted}">
          ${audio.isMuted ? '开启声音' : '静音'}
        </button>
      </header>
      <main class="game-stage">
        <section class="hud" aria-label="本局状态">
          <article class="order-card" data-state="${orderFeedback}">
            <span>${currentOrder ? '当前目标' : '本局状态'}</span>
            <strong>${currentOrder ? `${currentOrder.icon} ${currentOrder.name}` : '全部订单完成'}</strong>
          </article>
          <div class="hud-stat"><h2>订单</h2><strong>${state.completedOrders}/${state.totalOrders}</strong></div>
          <div class="hud-stat"><h2>失误</h2><strong>${state.mistakes}</strong></div>
          <div class="hud-stat"><h2>用时</h2><strong data-elapsed>${formatTime(getElapsedMs(state, Date.now()))}</strong></div>
        </section>
        <section class="room" aria-label="星际厨房" data-storage-open="${activePanel ? 'true' : 'false'}">
          <div class="room-background" aria-hidden="true">
            <img class="room-background__art" src="./assets/room-background.png" alt="" draggable="false" />
          </div>
          <button class="facility fridge${activePanel === 'fridge' ? ' is-active' : ''}" type="button" data-action="open-panel" data-panel="fridge" ${storageDisabled ? 'disabled' : ''}>
            <img class="facility-art facility-art--fridge" src="./assets/facilities/facility-fridge.png" alt="" aria-hidden="true" draggable="false" />
            <strong>冰箱</strong><span>肉 · 鱼 · 蛋 · 蔬菜</span>
          </button>
          <button class="facility chest${activePanel === 'chest' ? ' is-active' : ''}" type="button" data-action="open-panel" data-panel="chest" ${storageDisabled ? 'disabled' : ''}>
            <img class="facility-art facility-art--chest" src="./assets/facilities/facility-chest.png" alt="" aria-hidden="true" draggable="false" />
            <strong>箱子</strong><span>树枝 · 蜂蜜 · 浆果</span>
          </button>
          <section class="facility ${state.cookingTool}" data-tool="${state.cookingTool}" data-lid="${state.cookingTool === 'pot' ? (state.potLidOpen ? 'open' : 'closed') : 'none'}" data-state="${cookingToolState}" aria-label="${tool.name}">
            ${state.cookingTool === 'pot'
              ? `<button class="pot-lid-toggle" type="button" data-action="toggle-pot-lid" aria-pressed="${state.potLidOpen}" aria-label="${state.potLidOpen ? '合上锅盖' : '打开锅盖并准备投料'}" title="${state.potLidOpen ? '锅内有食材时不能合盖' : '打开锅盖并准备投料'}">
                  <img class="facility-art facility-art--pot" src="./assets/facilities/facility-pot-${state.potLidOpen ? 'open' : 'closed'}.png" alt="" aria-hidden="true" draggable="false" />
                </button>`
              : `<img class="facility-art facility-art--campfire" src="./assets/facilities/facility-campfire.png" alt="" aria-hidden="true" draggable="false" />`}
            <strong>${tool.icon} ${tool.name}${state.cookingTool === 'pot' ? ` · ${state.potLidOpen ? '开盖' : '合盖'}` : ''}</strong>
            <span>${statusText(state)}</span>
            <div class="pot-slots${state.cookingTool === 'campfire' ? ' campfire-slots' : ''}" aria-label="${state.cookingTool === 'campfire' ? '一个烤制槽' : '四个锅槽'}">${renderSlots(state)}</div>
            <div class="panel-actions">
              <button class="action-button secondary pot-main-action utensil-switch-button" type="button" data-action="switch-utensil" ${state.phase === 'SELECTING' ? '' : 'disabled'} aria-label="切换厨具，当前为${tool.name}">
                <span>切换厨具</span>
                <small>当前 ${tool.icon} ${tool.name} · 换成 ${nextTool.icon} ${nextTool.name}</small>
              </button>
              <button class="action-button pot-main-action" type="button" data-action="start-cooking" ${canStartCooking ? '' : 'disabled'}>${cookButtonLabel}</button>
            </div>
          </section>
          <button class="facility serving-window" type="button" data-action="deliver" data-state="${servingState}" ${state.phase === 'READY' ? '' : 'disabled'}>
            <img class="facility-art facility-art--serving" src="./assets/facilities/facility-serving.png" alt="" aria-hidden="true" draggable="false" />
            <strong>${readyDish ? `${readyDish.icon} ${readyDish.name}` : '星际出餐口'}</strong>
            <span>${state.phase === 'READY' ? '成品已到位，点击出餐' : currentOrder ? '等待成品送达' : '本局已完成'}</span>
          </button>
          ${activePanel ? renderStoragePanel(activePanel, state) : ''}
        </section>
      </main>
    </div>
    ${state.phase === 'ROUND_OVER' ? renderSummary(state) : ''}
    ${toast ? `<div class="toast ${toast.kind === 'info' ? '' : toast.kind}" data-state="${toast.kind === 'info' ? '' : toast.kind}" role="status">${toast.message}</div>` : ''}
  `
}

function showToast(message: string, kind: ToastKind = 'info'): void {
  toast = { message, kind }
  if (toastTimer) window.clearTimeout(toastTimer)
  render()
  toastTimer = window.setTimeout(() => {
    toast = null
    render()
  }, 2_400)
}

function handleResult(result: ActionResult, onSuccess?: () => void): void {
  if (!result.ok) {
    showToast(result.reason, 'error')
    return
  }
  onSuccess?.()
  // Flow mutations re-render through the subscription. This extra paint only
  // matters for view-only local state such as switching the open panel.
  render()
}

function scheduleTransitions(state: GameState): void {
  if (cookTimer) window.clearTimeout(cookTimer)
  if (deliveryTimer) window.clearTimeout(deliveryTimer)

  if (state.phase === 'COOKING' && state.cookingEndsAt !== null) {
    const remaining = Math.max(20, state.cookingEndsAt - Date.now() + 20)
    cookTimer = window.setTimeout(() => {
      handleResult(flow.finishCooking())
    }, remaining)
  }

  if (state.phase === 'DELIVERING') {
    deliveryTimer = window.setTimeout(() => {
      handleResult(flow.finishDelivery())
    }, 650)
  }
}

app.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  const control = target.closest<HTMLElement>('[data-action]')

  if (!control) return

  if (control.dataset.action !== 'toggle-sound') {
    audio.startBackgroundMusic()
  }

  switch (control.dataset.action) {
    case 'open-panel': {
      const panel = control.dataset.panel as Panel
      if (!panel || flow.state.phase !== 'SELECTING') {
        showToast('请等待当前这批料理完成。', 'error')
        return
      }
      activePanel = activePanel === panel ? null : panel
      render()
      break
    }
    case 'close-storage':
      activePanel = null
      render()
      break
    case 'add-ingredient': {
      const ingredientId = control.dataset.ingredient as IngredientId
      handleResult(flow.addIngredient(ingredientId), () => {
        audio.play('ingredient')
        const ingredientLimit = flow.state.cookingTool === 'campfire' ? 1 : 4
        if (flow.state.pot.length === ingredientLimit) {
          activePanel = null
          showToast(
            flow.state.cookingTool === 'campfire'
              ? '食材已上火，可以开始烤制。'
              : '食材已放满，可以开始烹饪。',
          )
        }
      })
      break
    }
    case 'remove-ingredient':
      handleResult(flow.removeIngredient(Number(control.dataset.index)))
      break
    case 'toggle-pot-lid':
      handleResult(flow.togglePotLid(), () => {
        if (!flow.state.potLidOpen) activePanel = null
        showToast(flow.state.potLidOpen ? '锅盖已打开，可以从冰箱或箱子投料。' : '锅盖已合上。')
      })
      break
    case 'switch-utensil':
      handleResult(flow.switchCookingTool(), () => {
        activePanel = null
        showToast(`已切换到${TOOL_COPY[flow.state.cookingTool].name}。`)
      })
      break
    case 'start-cooking':
      handleResult(flow.startCooking(), () => {
        activePanel = null
      })
      break
    case 'deliver':
      handleResult(flow.beginDelivery())
      break
    case 'restart':
      activePanel = null
      toast = null
      flow.restart()
      break
    case 'toggle-sound':
      audio.toggleMuted()
      render()
      break
    default:
      break
  }
})

flow.subscribe((state) => {
  const prior = previousPhase
  previousPhase = state.phase
  if (state.phase === 'COOKING' && prior !== 'COOKING') audio.play('cook')
  if (state.phase === 'READY' && prior === 'COOKING') {
    audio.play('ready')
    showToast(`${TOOL_COPY[state.cookingTool].name}完成，成品已自动送到右侧出餐口！`, 'success')
  }
  if (state.phase === 'DELIVERING' && state.delivery) {
    audio.play(state.delivery.correct ? 'correct' : 'wrong')
    showToast(
      state.delivery.correct ? '出餐正确！订单已记入回执。' : '订单不符，当前订单会保留。',
      state.delivery.correct ? 'success' : 'error',
    )
  }
  render()
  scheduleTransitions(state)
})

window.setInterval(() => {
  const elapsed = document.querySelector<HTMLElement>('[data-elapsed]')
  if (elapsed) elapsed.textContent = formatTime(getElapsedMs(flow.state, Date.now()))
}, 250)

render()
void initializeStarLetter()
