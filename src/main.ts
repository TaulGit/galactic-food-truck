import './styles.css'

import { KitchenAudio } from './audio'
import { INGREDIENTS, INGREDIENTS_BY_SOURCE, type IngredientId, type IngredientSource } from './game/ingredients'
import { GameFlow, type ActionResult } from './game/gameFlow'
import { getCurrentOrderId, getElapsedMs, type GamePhase, type GameState } from './game/gameState'
import { RECIPES, type Recipe } from './game/recipes'
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
let activePanel: Panel = null
let toast: Toast | null = null
let toastTimer: number | undefined
let cookTimer: number | undefined
let deliveryTimer: number | undefined
let previousPhase: GamePhase = flow.state.phase

function recipeFor(id: string | null): Recipe | null {
  return RECIPES.find((recipe) => recipe.id === id) ?? null
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
  if (state.phase === 'COOKING') return '星炉加热中，请等待 3 秒。'
  if (state.phase === 'READY') return '料理完成，成品已送往右侧出餐口。'
  if (state.phase === 'DELIVERING') {
    return state.delivery?.correct ? '订单核验通过。' : '订单不符，料理已退回回收槽。'
  }
  if (state.phase === 'ROUND_OVER') return '本局已结算，准备好就再来一局。'
  if (state.pot.length === 0) return '先点左侧箱子或冰箱，选入第一份食材。'
  if (state.pot.length < 4) return `还差 ${4 - state.pot.length} 份食材。`
  return '食材已放满，点击“开始烹饪”。'
}

function renderSlots(state: GameState): string {
  return Array.from({ length: 4 }, (_, index) => {
    // 成品完成后会被送往出餐口；锅台视觉上随即腾空，避免让玩家误以为
    // 还需要再从锅里取一次成品。
    const ingredientId = state.phase === 'READY' || state.phase === 'DELIVERING'
      ? undefined
      : state.pot[index]
    const ingredient = ingredientId ? INGREDIENTS[ingredientId] : null
    const isRemovable = state.phase === 'SELECTING' && ingredient
    return `
      <button
        class="pot-slot${ingredient ? ' filled' : ''}"
        type="button"
        data-action="remove-ingredient"
        data-index="${index}"
        ${isRemovable ? '' : 'disabled'}
        aria-label="${ingredient ? `移除${ingredient.name}` : '空锅槽'}"
        title="${ingredient ? `移除${ingredient.name}` : '空锅槽'}"
      >${ingredient ? `<span>${ingredient.icon}</span>` : ''}</button>
    `
  }).join('')
}

function renderStoragePanel(source: IngredientSource, state: GameState): string {
  const title = source === 'chest' ? '食材箱' : '冰箱'
  const subtitle = source === 'chest'
    ? '树枝、蜂蜜和浆果都可以反复取用。'
    : '肉、鱼、蛋与蔬菜存放在这里。'
  const disabled = state.phase !== 'SELECTING' || state.pot.length >= 4
  const ingredientIds = INGREDIENTS_BY_SOURCE[source]
  const slots = Array.from({ length: 6 }, (_, index) => {
    const ingredientId = ingredientIds[index]
    if (!ingredientId) {
      return '<div class="storage-slot storage-slot--empty" aria-hidden="true"></div>'
    }

    const ingredient = INGREDIENTS[ingredientId]
    return `
      <button
        class="storage-slot"
        type="button"
        data-action="add-ingredient"
        data-ingredient="${ingredient.id}"
        ${disabled ? 'disabled' : ''}
        aria-label="取出${ingredient.name}"
        title="取出${ingredient.name}"
      >
        <span class="storage-slot__icon" aria-hidden="true">${ingredient.icon}</span>
        <span class="storage-slot__name">${ingredient.name}</span>
      </button>
    `
  }).join('')

  return `
    <aside class="storage-panel storage-panel--${source}" role="region" aria-labelledby="storage-panel-title">
      <header class="storage-panel__header">
        <div>
          <h2 id="storage-panel-title">${title}</h2>
          <p>${state.pot.length}/4 已下锅</p>
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
  const currentOrder = recipeFor(getCurrentOrderId(state))
  const stateName = visualState(state)
  const orderFeedback = state.phase === 'DELIVERING'
    ? (state.delivery?.correct ? 'correct' : 'wrong')
    : ''
  const potState = state.phase === 'COOKING' ? 'cooking' : state.phase === 'READY' ? 'ready' : ''
  const servingState = state.phase === 'DELIVERING'
    ? (state.delivery?.correct ? 'correct' : 'wrong')
    : ''
  const readyDish = state.finishedDish
  const cookButtonLabel = state.phase === 'COOKING'
    ? '烹饪中…'
    : state.phase === 'READY' || state.phase === 'DELIVERING'
      ? '成品已送往出餐口'
      : '开始烹饪'

  app.innerHTML = `
    <div class="app-shell" data-state="${stateName}">
      <header class="game-header">
        <div>
          <h1>银河餐车</h1>
          <p>单房间星际厨房 · 取料、下锅、出餐</p>
        </div>
        <button class="action-button secondary sound-button" type="button" data-action="toggle-sound" aria-pressed="${!audio.isMuted}">
          ${audio.isMuted ? '开启音效' : '静音'}
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
          <div class="room-background" aria-hidden="true"></div>
          <button class="facility fridge${activePanel === 'fridge' ? ' is-active' : ''}" type="button" data-action="open-panel" data-panel="fridge" ${state.phase === 'SELECTING' ? '' : 'disabled'}>
            <strong>冰箱</strong><span>肉 · 鱼 · 蛋 · 蔬菜</span>
          </button>
          <button class="facility chest${activePanel === 'chest' ? ' is-active' : ''}" type="button" data-action="open-panel" data-panel="chest" ${state.phase === 'SELECTING' ? '' : 'disabled'}>
            <strong>箱子</strong><span>树枝 · 蜂蜜 · 浆果</span>
          </button>
          <section class="facility pot" data-state="${potState}" aria-label="星炉烹饪锅">
            <strong>星炉烹饪锅</strong>
            <span>${statusText(state)}</span>
            <div class="pot-slots" aria-label="四个锅槽">${renderSlots(state)}</div>
            <div class="panel-actions">
              <button class="action-button secondary pot-main-action" type="button" data-action="clear-pot" ${state.phase === 'SELECTING' && state.pot.length ? '' : 'disabled'}>清空锅槽</button>
              <button class="action-button pot-main-action" type="button" data-action="start-cooking" ${state.phase === 'SELECTING' && state.pot.length === 4 ? '' : 'disabled'}>${cookButtonLabel}</button>
            </div>
          </section>
          <button class="facility serving-window" type="button" data-action="deliver" data-state="${servingState}" ${state.phase === 'READY' ? '' : 'disabled'}>
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
        if (flow.state.pot.length === 4) {
          activePanel = null
          showToast('食材已放满，可以开始烹饪。')
        }
      })
      break
    }
    case 'remove-ingredient':
      handleResult(flow.removeIngredient(Number(control.dataset.index)))
      break
    case 'clear-pot':
      handleResult(flow.clearPot())
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
    showToast('料理完成，成品已自动送到右侧出餐口！', 'success')
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
