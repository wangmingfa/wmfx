<template>
  <div v-if="isOpen" class="popover-root" :class="{ 'is-bounded': currentMode === 'bounded' }">
    <div v-if="currentMode === 'overlay'" class="popover-backdrop" @click="dismiss" @contextmenu.prevent="dismiss" />
    <div
      ref="boxRef"
      class="popover-box"
      :class="{ ready: boxVisible, 'is-addressbar': currentType === 'addressbar' }"
      :style="boxStyle"
      @mouseleave="onMouseLeave"
    >
      <PopoverMenu
        v-if="currentType === 'menu'"
        :items="menuItems"
        :popover-id="currentPopoverId"
        :show-mnemonics="showMnemonics"
        :active-id="activeItem?.id ?? ''"
        :open-sub-ids="openSubIds"
        @hover="onHover"
        @select="onMenuSelect"
      />
      <AddressBarSuggestions
        v-else-if="currentType === 'addressbar'"
        :popover-id="currentPopoverId"
        :data="addressBarData"
        @event="onAddressBarEvent"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AutocompleteSuggestion, MenuItem, PopoverAnchor, PopoverMode, PopoverType } from '@browser/ipc-contract'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import AddressBarSuggestions from './AddressBarSuggestions.vue'
import { findItem, getLevelItems, getSelectable, pathToItem, selectableIndexOf } from './navigation'
import PopoverMenu from './PopoverMenu.vue'
import { computeBoxPosition } from './position'

// bounded popover 四周预留的透明边距（px），用于容纳 box-shadow，避免视图恰好贴合盒子
// 而把外投阴影裁成直角。需 ≥ 阴影 offsetY + blur。
const SHADOW_GUTTER = 18

const currentType = ref<PopoverType | null>(null)
const currentData = ref<unknown>(null)
const anchor = ref<PopoverAnchor | null>(null)
const currentPopoverId = ref('')
const currentMode = ref<PopoverMode>('overlay')
const isOpen = ref(false)
const boxRef = ref<HTMLElement>()
const boxVisible = ref(false)
const boxStyle = ref<Record<string, string>>({})
const showMnemonics = ref(false)
const lastPointer = ref({ x: 0, y: 0 })
let resizeObserver: ResizeObserver | null = null

// 菜单数据：仅当 type=menu 时从 currentData 解析
const menuItems = computed(() => {
  if (currentType.value === 'menu' && currentData.value) {
    return (currentData.value as { items: MenuItem[] }).items
  }
  return []
})
const addressBarData = computed(() => {
  if (currentType.value === 'addressbar' && currentData.value) {
    return currentData.value as { query: string; suggestions: AutocompleteSuggestion[] }
  }
  return { query: '', suggestions: [] }
})

// 方向键导航状态：activePath = 已展开子菜单 id 链；activeIndex = 当前层可选中项下标（-1 表示未选中）
const activePath = ref<string[]>([])
const activeIndex = ref(-1)

const currentItems = computed(() => getLevelItems(menuItems.value, activePath.value))
const selectable = computed(() => getSelectable(currentItems.value))
const activeItem = computed(() => selectable.value[activeIndex.value] ?? null)
const openSubIds = computed(() => new Set(activePath.value))

let renderHandler: ((...args: unknown[]) => void) | null = null
let dismissHandler: ((...args: unknown[]) => void) | null = null
let keyHandler: ((e: KeyboardEvent) => void) | null = null
let mouseHandler: ((e: MouseEvent) => void) | null = null

function dismiss(): void {
  if (currentPopoverId.value) window.browserAPI.popoverClose(currentPopoverId.value)
  reset()
}
function reset(): void {
  currentType.value = null
  currentData.value = null
  anchor.value = null
  currentMode.value = 'overlay'
  isOpen.value = false
  boxVisible.value = false
  resizeObserver?.disconnect()
  resizeObserver = null
  activePath.value = []
  activeIndex.value = -1
}

function onRender(popoverId: string, type: PopoverType, anc: PopoverAnchor, data?: unknown, mode?: PopoverMode): void {
  currentPopoverId.value = popoverId
  currentType.value = type
  currentData.value = data ?? null
  currentMode.value = mode ?? 'overlay'
  anchor.value = anc
  activePath.value = []
  activeIndex.value = -1
  boxVisible.value = false
  isOpen.value = true
  nextTick(() => {
    const el = boxRef.value
    if (!el || !anchor.value) return
    if (currentMode.value === 'bounded') {
      // 内容自然尺寸上报；仅地址栏 popover 用 rect 宽度约束（覆盖原输入框宽度），
      // 菜单等其它 popover 用内容自然宽度，否则会被锚点按钮宽度挤成一条溢出窗口。
      const useRectWidth = currentType.value === 'addressbar' && anchor.value.type === 'rect'
      const w = useRectWidth && anchor.value.type === 'rect' ? anchor.value.rect.width : el.offsetWidth
      // 盒子在放大后的视图内偏移 gutter，使四周留出阴影空间；视图由主进程按 gutter 放大并外移，
      // 盒子最终仍精确落在锚点位置。地址栏 popover 显式约束盒子宽度与原输入框一致，
      // 否则盒子只按内容（min-width）收缩，导致面板输入框比地址栏输入框窄。
      boxStyle.value = {
        left: `${SHADOW_GUTTER}px`,
        top: `${SHADOW_GUTTER}px`,
        ...(useRectWidth ? { width: `${w}px` } : {}),
      }
      window.browserAPI.popoverMeasure(currentPopoverId.value, {
        width: w,
        height: el.offsetHeight,
        gutter: SHADOW_GUTTER,
      })
      resizeObserver?.disconnect()
      resizeObserver = new ResizeObserver(() => {
        if (boxRef.value) {
          const bw = useRectWidth && anchor.value?.type === 'rect' ? anchor.value.rect.width : boxRef.value.offsetWidth
          window.browserAPI.popoverMeasure(currentPopoverId.value, {
            width: bw,
            height: boxRef.value.offsetHeight,
            gutter: SHADOW_GUTTER,
          })
        }
      })
      resizeObserver.observe(el)
      boxVisible.value = true
      return
    }
    // overlay：保持原内部定位逻辑
    if (currentType.value === 'addressbar' && anchor.value.type === 'rect') {
      const r = anchor.value.rect
      boxStyle.value = {
        left: `${r.x}px`,
        top: `${r.y}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      }
    } else {
      const size = { width: el.offsetWidth, height: el.offsetHeight }
      const resolved: PopoverAnchor =
        anchor.value.type === 'cursor'
          ? { type: 'point', x: lastPointer.value.x, y: lastPointer.value.y, placement: anchor.value.placement }
          : anchor.value
      const pos = computeBoxPosition(resolved, size, { width: window.innerWidth, height: window.innerHeight })
      boxStyle.value = { left: `${pos.x}px`, top: `${pos.y}px` }
    }
    boxVisible.value = true
  })
}

function onMenuSelect(itemId: string): void {
  window.browserAPI.popoverEvent({
    popoverId: currentPopoverId.value,
    eventName: 'select',
    eventData: itemId,
  })
  // 选中菜单项后关闭面板（网页右键菜单由主进程直接打开、无 renderer DropdownMenu 包裹，需面板自行关闭）
  dismiss()
}

function onAddressBarEvent(eventName: string, eventData?: unknown): void {
  window.browserAPI.popoverEvent({
    popoverId: currentPopoverId.value,
    eventName,
    eventData,
  })
}

function openCurrentSub(): void {
  const item = activeItem.value
  if (item?.type === 'submenu' && item.children) {
    activePath.value = [...activePath.value, item.id]
    activeIndex.value = 0
  }
}
function closeCurrentSub(): void {
  if (activePath.value.length === 0) return // 根层级无上一级，无操作
  const popped = activePath.value[activePath.value.length - 1]
  activePath.value = activePath.value.slice(0, -1)
  const parentItems = getLevelItems(menuItems.value, activePath.value)
  const idx = selectableIndexOf(parentItems, popped)
  if (idx >= 0) activeIndex.value = idx
}
function activateCurrent(): void {
  const item = activeItem.value
  if (!item || item.disabled) return
  if (item.type === 'submenu') openCurrentSub()
  else onMenuSelect(item.id)
}
function onMouseLeave(): void {
  // 鼠标移出整个菜单（含子菜单 flyout，因其为 box 后代，不会误触发）时取消选中
  activeIndex.value = -1
  activePath.value = []
}
function onHover(itemId: string): void {
  const item = findItem(menuItems.value, itemId)
  // 禁用项不响应 hover：保持当前高亮，避免 selectableIndexOf 返回 -1 时高亮跳回首项
  if (!item || item.disabled) return
  const path = pathToItem(menuItems.value, itemId)
  if (!path) return
  // pathToItem 只返回祖先链；悬停的子菜单项需把自身 id 追加进去，才能展开其 flyout
  const effectivePath = item.type === 'submenu' ? [...path, item.id] : path
  activePath.value = effectivePath
  activeIndex.value = Math.max(0, selectableIndexOf(getLevelItems(menuItems.value, effectivePath), itemId))
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    dismiss()
    return
  }
  if (e.key === 'Alt') {
    showMnemonics.value = true
    return
  }
  if (e.altKey) return
  const n = selectable.value.length
  if (n === 0) return
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      // 未选中时“下”跳到首项；否则顺移
      activeIndex.value = activeIndex.value === -1 ? 0 : (activeIndex.value + 1) % n
      break
    case 'ArrowUp':
      e.preventDefault()
      // 未选中时“上”跳到末项；否则逆移（n-1 处理 -1 边界）
      activeIndex.value = activeIndex.value === -1 ? n - 1 : (activeIndex.value - 1 + n) % n
      break
    case 'ArrowRight':
      e.preventDefault()
      openCurrentSub()
      break
    case 'ArrowLeft':
      e.preventDefault()
      closeCurrentSub()
      break
    case 'Enter':
    case ' ':
      e.preventDefault()
      activateCurrent()
      break
    default: {
      const hit = selectable.value.find(
        (i) => i.accessKey && i.accessKey.toLowerCase() === e.key.toLowerCase() && !i.disabled,
      )
      if (hit) {
        e.preventDefault()
        onMenuSelect(hit.id)
      }
    }
  }
}

onMounted(() => {
  renderHandler = ((popoverId: string, type: PopoverType, anc: PopoverAnchor, data?: unknown, mode?: PopoverMode) =>
    onRender(popoverId, type, anc, data, mode)) as (...args: unknown[]) => void
  dismissHandler = (() => reset()) as (...args: unknown[]) => void
  window.browserAPI.onPopoverRender(renderHandler)
  window.browserAPI.onPopoverDismiss(dismissHandler)
  keyHandler = (e: KeyboardEvent) => onKeydown(e)
  window.addEventListener('keydown', keyHandler)
  mouseHandler = (e: MouseEvent) => {
    lastPointer.value = { x: e.clientX, y: e.clientY }
  }
  window.addEventListener('mousemove', mouseHandler)
})
onBeforeUnmount(() => {
  if (renderHandler) window.browserAPI.removeListener('popover:render', renderHandler)
  if (dismissHandler) window.browserAPI.removeListener('popover:dismiss', dismissHandler)
  if (keyHandler) window.removeEventListener('keydown', keyHandler)
  if (mouseHandler) window.removeEventListener('mousemove', mouseHandler)
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<!-- 非 scoped：覆盖面板 webContents 根节点（#app 在 App.vue 里默认为白色背景）为透明，
     否则铺满窗口的面板会整体白屏，挡住下方标签页内容 -->
<style>
html,
body,
#app {
  background: transparent !important;
  margin: 0;
}
/* 隐藏 vite-plugin-vue-devtools 注入到 panel webContents 的悬浮图标，
   否则它会浮在铺满窗口的 popover 覆盖层之上 */
#__vue-devtools-container__ {
  display: none !important;
}
</style>

<style lang="less" scoped>
.popover-root {
  position: fixed;
  inset: 0;
  pointer-events: none;
}
.popover-backdrop {
  position: fixed;
  inset: 0;
  pointer-events: auto;
  background: transparent;
}
.popover-box {
  position: fixed;
  visibility: hidden;
  min-width: 180px;
  background: var(--bg-secondary);
  border: 1px solid var(--bg-tertiary);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  padding: 4px 0;
  pointer-events: auto;
  &.ready {
    visibility: visible;
  }
  &.is-bounded {
    min-width: 0;
    width: max-content;
    height: max-content;
    padding: 0;
  }
  &.is-addressbar {
    background: #fff;
    border: none;
    border-radius: 14px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
    padding: 0;
    min-width: 0;
    overflow: hidden;
  }
}
</style>
