<template>
  <div v-if="isOpen" class="popover-root" :class="{ 'is-bounded': currentMode === 'bounded' }">
    <div v-if="currentMode === 'overlay'" class="popover-backdrop" @click="dismiss" @contextmenu.prevent="dismiss" />
    <div
      ref="boxRef"
      class="popover-box"
      :class="{
        ready: boxVisible,
        'is-overlay': currentMode === 'overlay',
        'is-addressbar': currentType === 'addressbar',
        'is-find': currentType === 'find',
        'is-tab-thumbnail': currentType === 'tab-thumbnail',
      }"
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
      <FindPanel
        v-else-if="currentType === 'find'"
        :popover-id="currentPopoverId"
        :data="findData"
        @event="onAddressBarEvent"
      />
      <DownloadPanel
        v-else-if="currentType === 'downloads'"
        :popover-id="currentPopoverId"
        :data="downloadData"
        @event="onAddressBarEvent"
      />
      <BookmarkFolderPanel
        v-else-if="currentType === 'bookmark-folder'"
        :popover-id="currentPopoverId"
        :folder-id="bookmarkFolderId"
      />
      <TabThumbnailPanel
        v-else-if="currentType === 'tab-thumbnail'"
        :popover-id="currentPopoverId"
        :data="tabThumbnailData"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  AutocompleteSuggestion,
  DownloadItem,
  MenuItem,
  PopoverAnchor,
  PopoverMode,
  PopoverType,
} from '@browser/ipc-contract'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import BookmarkFolderPanel from '../components/BookmarkFolderPanel.vue'
import AddressBarSuggestions from './AddressBarSuggestions.vue'
import DownloadPanel from './DownloadPanel.vue'
import FindPanel from './FindPanel.vue'
import { findItem, getLevelItems, getSelectable, pathToItem, selectableIndexOf } from './navigation'
import PopoverMenu from './PopoverMenu.vue'
import { computeBoxPosition } from './position'
import TabThumbnailPanel from './TabThumbnailPanel.vue'

// bounded popover 已移除阴影，但仍有 1px border，需 gutter 确保边框不贴 WebContentsView 边缘
const SHADOW_GUTTER = 2

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
let mutationObserver: MutationObserver | null = null

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
const findData = computed(() => {
  if (currentType.value === 'find' && currentData.value) {
    return currentData.value as { query: string; matches: number; activeMatch: number }
  }
  return { query: '', matches: 0, activeMatch: -1 }
})
const downloadData = computed(() => {
  if (currentType.value === 'downloads' && currentData.value) {
    return currentData.value as { items: DownloadItem[] }
  }
  return { items: [] }
})
const bookmarkFolderId = computed(() => {
  if (currentType.value === 'bookmark-folder' && currentData.value) {
    return (currentData.value as { folderId: string }).folderId
  }
  return ''
})
const tabThumbnailData = computed(() => {
  if (currentType.value === 'tab-thumbnail' && currentData.value) {
    return currentData.value as { src: string | null; loading: boolean; title: string; url: string }
  }
  return { src: null, loading: false, title: '', url: '' }
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
let dataHandler: ((...args: unknown[]) => void) | null = null
let keyHandler: ((e: KeyboardEvent) => void) | null = null
let mouseHandler: ((e: MouseEvent) => void) | null = null

function dismiss(): void {
  console.debug('[PanelRoot] dismiss: popoverId', currentPopoverId.value)
  if (currentPopoverId.value) window.browserAPI.popoverClose(currentPopoverId.value)
  reset()
}
function reset(): void {
  console.debug('[PanelRoot] reset: 清空面板状态')
  currentType.value = null
  currentData.value = null
  anchor.value = null
  currentMode.value = 'overlay'
  isOpen.value = false
  boxVisible.value = false
  resizeObserver?.disconnect()
  resizeObserver = null
  mutationObserver?.disconnect()
  mutationObserver = null
  activePath.value = []
  activeIndex.value = -1
}

function onRender(popoverId: string, type: PopoverType, anc: PopoverAnchor, data?: unknown, mode?: PopoverMode): void {
  console.debug('[PanelRoot] onRender: popoverId type mode', popoverId, type, mode)
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
      console.debug('[PanelRoot] onRender: bounded 模式，测量并上报盒子尺寸')
      // 内容自然尺寸上报；仅地址栏 popover 用 rect 宽度约束（覆盖原输入框宽度），
      // 菜单等其它 popover 用内容自然宽度，否则会被锚点按钮宽度挤成一条溢出窗口。
      const useRectWidth = currentType.value === 'addressbar' && anchor.value.type === 'rect'
      const gutter = currentType.value === 'tab-thumbnail' ? 0 : SHADOW_GUTTER
      // 盒子在放大后的视图内偏移 gutter，使四周留出阴影空间；视图由主进程按 gutter 放大并外移，
      // 盒子最终仍精确落在锚点位置。地址栏 popover 显式约束盒子宽度与原输入框一致，
      // 否则盒子只按内容（min-width）收缩，导致面板输入框比地址栏输入框窄。
      boxStyle.value = {
        left: `${gutter}px`,
        top: `${gutter}px`,
        ...(useRectWidth && anchor.value.type === 'rect' ? { width: `${anchor.value.rect.width}px` } : {}),
      }
      const initialW = useRectWidth && anchor.value.type === 'rect' ? anchor.value.rect.width : el.offsetWidth
      window.browserAPI.popoverMeasure(currentPopoverId.value, {
        width: initialW,
        height: el.offsetHeight,
        gutter,
      })

      // 菜单的 box 用 max-content，但 max-content 不计算绝对定位后代（子菜单 flyout），
      // 当子菜单打开时 box 不撑大，导致 WebContentsView 边界不变、子菜单被裁切。
      // 用 MutationObserver 检测菜单 DOM 变化（子菜单打开/关闭），遍历所有后代元素
      // 计算实际视觉范围（含绝对定位 flyout），据此撑大外层 WebContentsView。
      const getVisualRect = (el: HTMLElement): DOMRect => {
        const rects: DOMRect[] = [el.getBoundingClientRect()]
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT)
        let node: Node | null = walker.nextNode()
        while (node) {
          rects.push((node as HTMLElement).getBoundingClientRect())
          node = walker.nextNode()
        }
        const left = Math.min(...rects.map((r) => r.left))
        const top = Math.min(...rects.map((r) => r.top))
        const right = Math.max(...rects.map((r) => r.right))
        const bottom = Math.max(...rects.map((r) => r.bottom))
        return new DOMRect(left, top, right - left, bottom - top)
      }
      const measureMenuExtent = () => {
        if (!boxRef.value || !boxVisible.value || currentMode.value !== 'bounded') return
        const vr = getVisualRect(boxRef.value)
        window.browserAPI.popoverMeasure(currentPopoverId.value, {
          width: vr.width,
          height: vr.height,
          gutter,
          offsetX: vr.left,
          offsetY: vr.top,
        })
      }

      resizeObserver?.disconnect()
      resizeObserver = new ResizeObserver(() => {
        if (boxRef.value && boxVisible.value && currentMode.value === 'bounded') {
          const vr = getVisualRect(boxRef.value)
          window.browserAPI.popoverMeasure(currentPopoverId.value, {
            width: vr.width,
            height: vr.height,
            gutter,
            offsetX: vr.left,
            offsetY: vr.top,
          })
        }
      })
      resizeObserver.observe(el)

      // 检测子菜单展开/收起，重新测量菜单范围并撑大 WebContentsView
      // 只监听结构变化（childList），不监听属性变化（如 hover 改变 class），
      // 否则每次 hover 都会触发重测量 → 主进程重定位 → 视图闪烁 → 阴影看起来在变。
      mutationObserver = new MutationObserver(() => {
        measureMenuExtent()
      })
      mutationObserver.observe(el, { childList: true, subtree: true })

      // 延迟一帧确保菜单渲染完毕后再注册 mutation observer（避免初始渲染时菜单不存在）
      nextTick(() => {
        // 初始测量一次，确保 WebContentsView 边界正确
        measureMenuExtent()
      })

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
      console.debug('[PanelRoot] onRender: overlay 定位 x y', pos.x, pos.y)
      boxStyle.value = { left: `${pos.x}px`, top: `${pos.y}px` }
    }
    boxVisible.value = true
  })
}

function onMenuSelect(itemId: string): void {
  console.debug('[PanelRoot] onMenuSelect: itemId', itemId)
  window.browserAPI.popoverEvent({
    popoverId: currentPopoverId.value,
    eventName: 'select',
    eventData: itemId,
  })
  // 选中菜单项后关闭面板（网页右键菜单由主进程直接打开、无 renderer DropdownMenu 包裹，需面板自行关闭）
  dismiss()
}

function onAddressBarEvent(eventName: string, eventData?: unknown): void {
  console.debug('[PanelRoot] onAddressBarEvent: event', eventName)
  window.browserAPI.popoverEvent({
    popoverId: currentPopoverId.value,
    eventName,
    eventData,
  })
}

function openCurrentSub(): void {
  const item = activeItem.value
  if (item?.type === 'submenu' && item.children) {
    console.debug('[PanelRoot] openCurrentSub: itemId', item.id)
    activePath.value = [...activePath.value, item.id]
    activeIndex.value = 0
  }
}
function closeCurrentSub(): void {
  if (activePath.value.length === 0) return // 根层级无上一级，无操作
  const popped = activePath.value[activePath.value.length - 1]
  console.debug('[PanelRoot] closeCurrentSub: popped', popped)
  activePath.value = activePath.value.slice(0, -1)
  const parentItems = getLevelItems(menuItems.value, activePath.value)
  const idx = selectableIndexOf(parentItems, popped)
  if (idx >= 0) activeIndex.value = idx
}
function activateCurrent(): void {
  const item = activeItem.value
  if (!item || item.disabled) return
  console.debug('[PanelRoot] activateCurrent: itemId type', item.id, item.type)
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
  // 键盘导航（Esc/方向键/字母助记符）仅用于菜单。addressbar 与 find 面板各自在组件内处理键盘事件
  // （find 面板需在 IME 合成期间忽略 Esc/Enter），此处不得抢占，否则会绕过其 IME 守卫直接关闭面板。
  if (currentType.value !== 'menu') return
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
  console.debug('[PanelRoot] onKeydown: key selectable', e.key, n)
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
  console.debug('[PanelRoot] onMounted: 注册 popover 与全局事件监听')
  renderHandler = ((popoverId: string, type: PopoverType, anc: PopoverAnchor, data?: unknown, mode?: PopoverMode) =>
    onRender(popoverId, type, anc, data, mode)) as (...args: unknown[]) => void
  dismissHandler = (() => reset()) as (...args: unknown[]) => void
  // 主 renderer 通过 sendData 增量更新面板数据（如查找匹配计数、地址栏建议）
  dataHandler = ((popoverId: string, data: unknown) => {
    if (popoverId === currentPopoverId.value) currentData.value = data
  }) as (...args: unknown[]) => void
  window.browserAPI.onPopoverRender(renderHandler)
  window.browserAPI.onPopoverDismiss(dismissHandler)
  window.browserAPI.onPopoverData(dataHandler)
  keyHandler = (e: KeyboardEvent) => onKeydown(e)
  window.addEventListener('keydown', keyHandler)
  mouseHandler = (e: MouseEvent) => {
    lastPointer.value = { x: e.clientX, y: e.clientY }
  }
  window.addEventListener('mousemove', mouseHandler)
})
onBeforeUnmount(() => {
  console.debug('[PanelRoot] onBeforeUnmount: 注销事件监听与 observer')
  if (renderHandler) window.browserAPI.removeListener('popover:render', renderHandler)
  if (dismissHandler) window.browserAPI.removeListener('popover:dismiss', dismissHandler)
  if (dataHandler) window.browserAPI.removeListener('popover:data', dataHandler)
  if (keyHandler) window.removeEventListener('keydown', keyHandler)
  if (mouseHandler) window.removeEventListener('mousemove', mouseHandler)
  resizeObserver?.disconnect()
  resizeObserver = null
  mutationObserver?.disconnect()
  mutationObserver = null
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
  overflow: hidden;
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
    overflow: visible;
  }
  &.is-overlay {
    overflow: visible;
  }
  &.is-addressbar {
    background: var(--url-input-bg);
    border: none;
    border-radius: 14px;
    padding: 0;
    min-width: 0;
    overflow: hidden;
  }
  &.is-find {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 0;
    min-width: 0;
    overflow: hidden;
  }
  &.is-tab-thumbnail {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 0;
    min-width: 0;
    overflow: hidden;
  }
}
</style>
