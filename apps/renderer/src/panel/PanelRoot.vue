<template>
  <div
    v-if="descriptor"
    class="popover-layer"
  >
    <div
      class="popover-backdrop"
      @click="dismiss"
      @contextmenu.prevent="dismiss"
    />
    <div
      ref="boxRef"
      class="popover-box"
      :class="{ ready: boxVisible }"
      :style="boxStyle"
    >
      <PopoverMenu
        :items="descriptor.items"
        :popover-id="currentPopoverId"
        :show-mnemonics="showMnemonics"
        :active-id="activeItem?.id ?? ''"
        :open-sub-ids="openSubIds"
        @hover="onHover"
        @select="onSelect"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PopoverAnchor, PopoverDescriptor } from '@browser/ipc-contract'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { findItem, getLevelItems, getSelectable, pathToItem, selectableIndexOf } from './navigation'
import PopoverMenu from './PopoverMenu.vue'
import { computeBoxPosition } from './position'

const descriptor = ref<PopoverDescriptor | null>(null)
const anchor = ref<PopoverAnchor | null>(null)
const currentPopoverId = ref('')
const boxRef = ref<HTMLElement>()
const boxVisible = ref(false)
const boxStyle = ref<Record<string, string>>({})
const showMnemonics = ref(false)
const lastPointer = ref({ x: 0, y: 0 })

// 方向键导航状态：activePath = 已展开子菜单 id 链；activeIndex = 当前层可选中项下标
const activePath = ref<string[]>([])
const activeIndex = ref(0)

const currentItems = computed(() => getLevelItems(descriptor.value?.items ?? [], activePath.value))
const selectable = computed(() => getSelectable(currentItems.value))
const activeItem = computed(() => selectable.value[activeIndex.value] ?? null)
const openSubIds = computed(() => new Set(activePath.value))

let renderHandler: ((...args: unknown[]) => void) | null = null
let dismissHandler: ((...args: unknown[]) => void) | null = null
let keyHandler: ((e: KeyboardEvent) => void) | null = null
let mouseHandler: ((e: MouseEvent) => void) | null = null

function dismiss(): void {
  if (currentPopoverId.value)
    window.browserAPI.popoverClose(currentPopoverId.value)
  reset()
}
function reset(): void {
  descriptor.value = null
  anchor.value = null
  boxVisible.value = false
  activePath.value = []
  activeIndex.value = 0
}

function onRender(popoverId: string, desc: PopoverDescriptor, anc: PopoverAnchor): void {
  currentPopoverId.value = popoverId
  descriptor.value = desc
  anchor.value = anc
  activePath.value = []
  activeIndex.value = 0
  boxVisible.value = false
  nextTick(() => {
    const el = boxRef.value
    if (!el || !anchor.value)
      return
    const size = { width: el.offsetWidth, height: el.offsetHeight }
    const resolved: PopoverAnchor = anchor.value.type === 'cursor'
      ? { type: 'point', x: lastPointer.value.x, y: lastPointer.value.y, placement: anchor.value.placement }
      : anchor.value
    const pos = computeBoxPosition(resolved, size, { width: window.innerWidth, height: window.innerHeight })
    boxStyle.value = { left: `${pos.x}px`, top: `${pos.y}px` }
    boxVisible.value = true
  })
}

function onSelect(itemId: string): void {
  window.browserAPI.popoverSelect(currentPopoverId.value, itemId)
}

function openCurrentSub(): void {
  const item = activeItem.value
  if (item?.type === 'submenu' && item.children) {
    activePath.value = [...activePath.value, item.id]
    activeIndex.value = 0
  }
}
function closeCurrentSub(): void {
  if (activePath.value.length === 0)
    return // 根层级无上一级，无操作
  const popped = activePath.value[activePath.value.length - 1]
  activePath.value = activePath.value.slice(0, -1)
  const parentItems = getLevelItems(descriptor.value?.items ?? [], activePath.value)
  const idx = selectableIndexOf(parentItems, popped)
  if (idx >= 0)
    activeIndex.value = idx
}
function activateCurrent(): void {
  const item = activeItem.value
  if (!item || item.disabled)
    return
  if (item.type === 'submenu')
    openCurrentSub()
  else onSelect(item.id)
}
function onHover(itemId: string): void {
  const path = pathToItem(descriptor.value?.items ?? [], itemId)
  if (!path)
    return
  // pathToItem 只返回祖先链；悬停的子菜单项需把自身 id 追加进去，才能展开其 flyout
  const item = findItem(descriptor.value?.items ?? [], itemId)
  const effectivePath = item?.type === 'submenu' ? [...path, item.id] : path
  activePath.value = effectivePath
  activeIndex.value = Math.max(0, selectableIndexOf(getLevelItems(descriptor.value?.items ?? [], effectivePath), itemId))
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
  if (e.altKey)
    return
  const n = selectable.value.length
  if (n === 0)
    return
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      activeIndex.value = (activeIndex.value + 1) % n
      break
    case 'ArrowUp':
      e.preventDefault()
      activeIndex.value = (activeIndex.value - 1 + n) % n
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
        i => i.accessKey && i.accessKey.toLowerCase() === e.key.toLowerCase() && !i.disabled,
      )
      if (hit) {
        e.preventDefault()
        onSelect(hit.id)
      }
    }
  }
}

onMounted(() => {
  renderHandler = ((popoverId: string, desc: PopoverDescriptor, anc: PopoverAnchor) =>
    onRender(popoverId, desc, anc)) as (...args: unknown[]) => void
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
  if (renderHandler)
    window.browserAPI.removeListener('popover:render', renderHandler)
  if (dismissHandler)
    window.browserAPI.removeListener('popover:dismiss', dismissHandler)
  if (keyHandler)
    window.removeEventListener('keydown', keyHandler)
  if (mouseHandler)
    window.removeEventListener('mousemove', mouseHandler)
})
</script>

<!-- 非 scoped：覆盖面板 webContents 根节点（#app 在 App.vue 里默认为白色背景）为透明，
     否则铺满窗口的面板会整体白屏，挡住下方标签页内容 -->
<style>
html, body, #app { background: transparent !important; margin: 0; }
</style>

<style lang="less" scoped>
.popover-layer { position: fixed; inset: 0; pointer-events: none; }
.popover-backdrop { position: fixed; inset: 0; pointer-events: auto; background: transparent; }
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
  &.ready { visibility: visible; }
}
</style>
