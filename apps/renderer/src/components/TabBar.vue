<template>
  <div
    ref="tabBarRef"
    class="tab-bar"
    :class="{ 'mac-os': isMacOS }"
  >
    <div
      v-for="(tab, index) in tabs"
      :key="tab.id"
      class="tab-item"
      :class="{ 'active': tab.active, 'incognito': tab.sessionId === 'incognito', 'dragging': draggingIndex === index, 'drag-over': dragOverIndex === index, 'pinned': tab.isPinned, 'menu-open': tab.id === activeMenuTabId }"
      :style="`width:${tabWidthFor(tab)}px;min-width:${tabWidthFor(tab)}px;max-width:${tabWidthFor(tab)}px`"
      :draggable="true"
      @click="activateTab(tab.id)"
      @contextmenu="onTabContextMenu($event, tab)"
      @dragstart="onDragStart($event, index)"
      @dragover="onDragOver($event, index)"
      @dragleave="onDragLeave"
      @drop="onDrop($event, index)"
      @dragend="onDragEnd"
    >
      <template v-if="tab.active">
        <svg
          :width="tabItemBackgroundBorderRadius"
          :height="tabItemBackgroundBorderRadius"
          class="tabs-background before"
        >
          <path :d="`M 0 ${tabItemBackgroundBorderRadius} A ${tabItemBackgroundBorderRadius} ${tabItemBackgroundBorderRadius} 0 0 0 ${tabItemBackgroundBorderRadius} 0 L ${tabItemBackgroundBorderRadius} ${tabItemBackgroundBorderRadius} Z`" />
        </svg>
        <svg
          :width="tabItemBackgroundBorderRadius"
          :height="tabItemBackgroundBorderRadius"
          class="tabs-background after"
        >
          <path :d="`M 0 0 A ${tabItemBackgroundBorderRadius} ${tabItemBackgroundBorderRadius} 0 0 0 ${tabItemBackgroundBorderRadius} ${tabItemBackgroundBorderRadius} L 0 ${tabItemBackgroundBorderRadius} Z`" />
        </svg>
      </template>
      <span class="tab-favicon">
        <!-- 无痕模式下的图标 -->
        <Icon
          v-if="tab.sessionId === 'incognito'"
          class="incognito-icon"
          icon="mdi:account-off"
          width="14"
          height="14"
        />
        <!-- 内部页面不显示loading -->
        <Icon
          v-if="tab.isLoading && !isInternalUrl(tab.url)"
          class="tab-loading-icon"
          icon="line-md:loading-loop"
          width="22"
          height="22"
        />
        <Icon
          v-if="isInternalUrl(tab.url)"
          :icon="internalIcon(tab.url)"
          class="favicon internal-favicon"
          width="14"
          height="14"
        />
        <img
          v-else-if="tab.favicon"
          class="favicon"
          :src="tab.favicon"
          :alt="tab.title"
        >
        <DefaultFavicon
          v-else
          class="favicon"
          :size="14"
        />
      </span>
      <span class="tab-title">{{ tab.title || 'New Tab' }}</span>
      <Icon
        v-if="tab.isMuted"
        class="tab-mute"
        icon="mdi:volume-off"
        :width="iconSize"
        :height="iconSize"
      />
      <Icon
        class="tab-close"
        icon="ic:sharp-close"
        :width="iconSize"
        :height="iconSize"
        @click.stop="closeTab(tab.id)"
      />
    </div>
    <Icon
      class="tab-new"
      icon="ic:round-plus"
      :width="plusIconSize"
      :height="plusIconSize"
      @click="createNewTab"
    />
    <IconButton
      class="app-menu"
      icon="carbon:overflow-menu-vertical"
      :size="18"
      :active="appMenuOpen"
      :title="t('tab.menu')"
      @click.stop="openAppMenu"
    />
    <div
      v-if="!isMacOS"
      class="window-controls"
    >
      <div
        class="window-btn"
        @click="minimizeWindow"
      >
        <Icon
          icon="mdi:window-minimize"
          width="22"
          height="22"
        />
      </div>
      <div
        class="window-btn"
        @click="maximizeWindow"
      >
        <Icon
          :icon="isMaximized ? 'mdi:window-restore' : 'mdi:window-maximize'"
          width="22"
          height="22"
        />
      </div>
      <div
        class="window-btn close-btn"
        @click="closeWindow"
      >
        <Icon
          icon="mdi:window-close"
          width="22"
          height="22"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MenuItem, PopoverAnchor, PopoverDescriptor, TabState } from '@browser/ipc-contract'
import { Icon } from '@iconify/vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { requestAddressBarFocus } from '../composables/useAddressBarFocus'
import { useI18n } from '../composables/useI18n'
import { Popover } from '../lib/popover'
import { isMacOS } from '../utils/os'
import DefaultFavicon from './DefaultFavicon.vue'
import IconButton from './ui/IconButton.vue'

const { t } = useI18n()

const tabs = ref<TabState[]>([])
const tabBarRef = ref<HTMLElement>()
const tabBarWidth = ref(0)
const isMaximized = ref(false)
// 当前因右键/三点菜单而高亮的触发元素（popover 关闭时由 onPopoverDismiss 清空）
const activeMenuTabId = ref<string | null>(null)
const appMenuOpen = ref(false)

const TAB_MIN = 30
const TAB_MAX = 240
const TAB_GAP = 2
const PIN_WIDTH = 30
const PADDING_LEFT = 80
const PADDING_RIGHT = 8
const NEW_BTN_WIDTH = 32
const APP_MENU_WIDTH = 32
const WINDOW_CONTROLS_WIDTH = 112
const iconSize = 14
const plusIconSize = 16
const tabItemBorderRadius = 5
const tabItemBorderRadiusWithPx = `${tabItemBorderRadius}px`
const tabItemBackgroundBorderRadius = tabItemBorderRadius * 1.2

const appMenuItems = computed<MenuItem[]>(() => [
  { id: 'incognito', label: t('appMenu.incognito'), icon: 'mdi:account-off' },
  { id: 'wmfx://bookmarks', label: t('appMenu.bookmarks'), icon: 'mdi:bookmark' },
  { id: 'wmfx://history', label: t('appMenu.history'), icon: 'mdi:history' },
  { id: 'wmfx://downloads', label: t('appMenu.downloads'), icon: 'mdi:download' },
  { id: 'wmfx://proxy', label: t('appMenu.proxy'), icon: 'mdi:network' },
  { id: 'wmfx://settings', label: t('appMenu.settings'), icon: 'mdi:cog' },
])

function openAppMenu(event: MouseEvent): void {
  event.stopPropagation()
  appMenuOpen.value = true
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const descriptor: PopoverDescriptor = { id: 'app-menu', kind: 'menu', items: appMenuItems.value }
  void new Popover({
    anchor: { type: 'rect', rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height }, placement: 'bottom-end' },
    descriptor,
    onAction: ({ menu, context }) => {
      void runAppMenuItem(menu.id)
      context.close()
    },
  })
}

async function runAppMenuItem(id: string): Promise<void> {
  if (id === 'incognito') {
    await window.browserAPI.createNewTab('incognito')
    requestAddressBarFocus()
    return
  }
  const list = await window.browserAPI.getList()
  const existing = list.find(t => t.url === id || t.url.startsWith(`${id}/`))
  if (existing) {
    window.browserAPI.activateTab(existing.id)
  }
  else {
    window.browserAPI.createTab({ url: id })
  }
}

function openTabContextMenu(event: MouseEvent, tab: TabState): void {
  event.preventDefault()
  event.stopPropagation()
  // 按鼠标实际位置定位（contextmenu 事件携带 clientX/clientY），而非标签元素矩形
  const anchor: PopoverAnchor = { type: 'point', x: event.clientX, y: event.clientY, placement: 'bottom-start' }
  activeMenuTabId.value = tab.id
  const descriptor: PopoverDescriptor = {
    id: 'tab-context',
    kind: 'menu',
    items: [
      { id: 'new-tab-right', label: t('tab.closeRight'), icon: 'mdi:plus' },
      { id: 'sep-1', type: 'separator' },
      { id: 'reload', label: t('tab.reload'), icon: 'mdi:refresh' },
      { id: 'duplicate', label: t('tab.duplicate'), icon: 'mdi:content-copy' },
      { id: 'pin', label: tab.isPinned ? t('tab.unpinned') : t('tab.pinned'), icon: 'mdi:pin' },
      { id: 'mute', label: tab.isMuted ? t('tab.unmute') : t('tab.mute'), icon: tab.isMuted ? 'mdi:volume-off' : 'mdi:volume-high' },
      { id: 'sep-2', type: 'separator' },
      { id: 'close', label: t('tab.close'), icon: 'mdi:close', danger: true },
      { id: 'close-others', label: t('tab.closeOthers'), icon: 'mdi:close-box-multiple' },
      { id: 'close-left', label: t('tab.closeLeft'), icon: 'mdi:arrow-left-bold-box-outline' },
      { id: 'close-right', label: t('tab.closeRightTabs'), icon: 'mdi:arrow-right-bold-box-outline' },
    ],
  }
  void new Popover({
    anchor,
    descriptor,
    onAction: ({ menu, context }) => {
      runTabAction(menu.id, tab)
      context.close()
    },
  })
}

function runTabAction(id: string, tab: TabState): void {
  switch (id) {
    case 'new-tab-right':
      void newTabToRight(tab)
      break
    case 'reload':
      reloadTab(tab)
      break
    case 'duplicate':
      void duplicateTab(tab)
      break
    case 'pin':
      togglePin(tab)
      break
    case 'mute':
      toggleMute(tab)
      break
    case 'close':
      closeTab(tab.id)
      break
    case 'close-others':
      closeOthers(tab)
      break
    case 'close-right':
      closeRight(tab)
      break
    case 'close-left':
      closeLeft(tab)
      break
  }
}

const draggingIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

let dragSrcIndex: number | null = null
let isDragging = false

/** 单标签宽度：固定标签使用窄宽（仅图标），未固定标签按剩余空间均分。 */
function tabWidthFor(tab: TabState): number {
  const count = tabs.value.length
  if (count === 0) {
    return TAB_MAX
  }
  if (tab.isPinned) {
    return PIN_WIDTH
  }
  const pinnedCount = tabs.value.filter(t => t.isPinned).length
  const unpinnedCount = count - pinnedCount
  if (unpinnedCount === 0) {
    return TAB_MAX
  }
  const available = tabBarWidth.value - PADDING_LEFT - PADDING_RIGHT - NEW_BTN_WIDTH - APP_MENU_WIDTH - WINDOW_CONTROLS_WIDTH - (count - 1) * TAB_GAP
  const equal = Math.floor((available - pinnedCount * PIN_WIDTH) / unpinnedCount)
  return Math.max(TAB_MIN, Math.min(TAB_MAX, equal))
}

let resizeObserver: ResizeObserver | null = null

async function loadTabs(): Promise<void> {
  tabs.value = await window.browserAPI.getList()
}

function activateTab(tabId: string): void {
  window.browserAPI.activateTab(tabId)
}

function closeTab(tabId: string): void {
  window.browserAPI.closeTab(tabId)
}

function createNewTab(): void {
  window.browserAPI.createNewTab()
  requestAddressBarFocus()
}

/** 固定标签永远排在最前（保持相对顺序），并同步到主进程层叠顺序。 */
function applyOrder(): void {
  const pinned = tabs.value.filter(t => t.isPinned)
  const unpinned = tabs.value.filter(t => !t.isPinned)
  const ordered = [...pinned, ...unpinned]
  tabs.value = ordered
  window.browserAPI.reorderTabs(ordered.map(t => t.id))
}

/** 将新标签插入到目标标签右侧并同步顺序。 */
function insertAfter(targetId: string, newTab: TabState): void {
  const others = tabs.value.filter(t => t.id !== newTab.id)
  const pos = others.findIndex(t => t.id === targetId)
  others.splice(pos + 1, 0, newTab)
  tabs.value = others
  window.browserAPI.reorderTabs(others.map(t => t.id))
}

/** 内部页（wmfx://）按路由展示固定图标，避免回退到破图 favicon。 */
function isInternalUrl(url: string): boolean {
  return url.startsWith('wmfx://')
}

const INTERNAL_ICONS: Record<string, string> = {
  newtab: 'mdi:earth',
  bookmarks: 'mdi:bookmark',
  history: 'mdi:history',
  downloads: 'mdi:download',
  proxy: 'mdi:network',
  settings: 'mdi:cog',
}

function internalIcon(url: string): string {
  const path = url.replace('wmfx://', '').split('/')[0]
  return INTERNAL_ICONS[path] ?? 'mdi:web'
}

function minimizeWindow(): void {
  window.browserAPI.minimizeWindow()
}

function maximizeWindow(): void {
  window.browserAPI.maximizeWindow()
}

function closeWindow(): void {
  window.browserAPI.closeWindow()
}

function onTabContextMenu(event: MouseEvent, tab: TabState): void {
  openTabContextMenu(event, tab)
}

/** 在目标标签右侧新增空白标签页并激活。 */
async function newTabToRight(tab: TabState): Promise<void> {
  const newTab = await window.browserAPI.createTab({ url: 'wmfx://newtab', activate: true })
  insertAfter(tab.id, newTab)
}

function reloadTab(tab: TabState): void {
  window.browserAPI.reload(tab.id)
}

/** 复制标签：以相同 url 与会话新建，并插入到原标签右侧。 */
async function duplicateTab(tab: TabState): Promise<void> {
  const newTab = await window.browserAPI.createTab({
    url: tab.url,
    sessionId: tab.sessionId,
    activate: true,
  })
  insertAfter(tab.id, newTab)
}

function togglePin(tab: TabState): void {
  window.browserAPI.setPinned(tab.id, !tab.isPinned)
}

function toggleMute(tab: TabState): void {
  window.browserAPI.setMuted(tab.id, !tab.isMuted)
}

function closeOthers(tab: TabState): void {
  const ids = tabs.value.filter(t => t.id !== tab.id).map(t => t.id)
  window.browserAPI.closeTabs(ids)
}

function closeRight(tab: TabState): void {
  const idx = tabs.value.findIndex(t => t.id === tab.id)
  const ids = tabs.value.slice(idx + 1).map(t => t.id)
  window.browserAPI.closeTabs(ids)
}

function closeLeft(tab: TabState): void {
  const idx = tabs.value.findIndex(t => t.id === tab.id)
  const ids = tabs.value.slice(0, idx).map(t => t.id)
  window.browserAPI.closeTabs(ids)
}

function onDragStart(event: DragEvent, index: number): void {
  if (!event.dataTransfer) {
    return
  }
  dragSrcIndex = index
  draggingIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', String(index))
  isDragging = true
}

function onDragOver(event: DragEvent, index: number): void {
  event.preventDefault()
  if (!isDragging || dragSrcIndex === null || dragSrcIndex === index) {
    return
  }
  dragOverIndex.value = index
}

function onDragLeave(): void {
  dragOverIndex.value = null
}

function onDrop(_event: DragEvent, targetIndex: number): void {
  if (dragSrcIndex === null || dragSrcIndex === targetIndex) {
    dragOverIndex.value = null
    return
  }

  const newOrder = [...tabs.value]
  const [removed] = newOrder.splice(dragSrcIndex, 1)
  newOrder.splice(targetIndex, 0, removed)

  tabs.value = newOrder
  applyOrder()

  dragOverIndex.value = null
}

function onDragEnd(): void {
  draggingIndex.value = null
  dragOverIndex.value = null
  dragSrcIndex = null
  isDragging = false
}

let stateChangeHandler: (state: TabState) => void
let createdHandler: (state: TabState) => void
let removedHandler: (tabId: string) => void
let dismissHandler: ((popoverId: string) => void) | null = null

onMounted(() => {
  // 先注册 IPC 监听器，再拉取初始标签列表：避免主进程在两者间隙创建首个标签时，
  // tab:created 事件被错过导致标签栏永久为空（偶发白屏）。
  stateChangeHandler = (state: TabState) => {
    const idx = tabs.value.findIndex(t => t.id === state.id)
    if (idx >= 0) {
      const wasPinned = tabs.value[idx].isPinned
      tabs.value[idx] = state
      if (wasPinned !== state.isPinned) {
        applyOrder()
      }
    }
    else {
      tabs.value.push(state)
      applyOrder()
    }
  }

  createdHandler = (state: TabState) => {
    if (!tabs.value.some(t => t.id === state.id)) {
      tabs.value.push(state)
      applyOrder()
    }
  }

  removedHandler = (tabId: string) => {
    tabs.value = tabs.value.filter(t => t.id !== tabId)
  }

  window.browserAPI.onTabStateChange(stateChangeHandler)
  window.browserAPI.onTabCreated(createdHandler)
  window.browserAPI.onTabRemoved(removedHandler)
  // popover 关闭（无论是点击菜单项还是背景/Esc）时，清除触发元素高亮
  dismissHandler = () => {
    activeMenuTabId.value = null
    appMenuOpen.value = false
  }
  window.browserAPI.onPopoverDismiss(dismissHandler)

  if (tabBarRef.value) {
    tabBarWidth.value = tabBarRef.value.clientWidth
    resizeObserver = new ResizeObserver(() => {
      tabBarWidth.value = tabBarRef.value!.clientWidth
    })
    resizeObserver.observe(tabBarRef.value)
  }

  loadTabs().then(applyOrder)
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  window.browserAPI.removeListener('tab:state-change', stateChangeHandler as (...args: unknown[]) => void)
  window.browserAPI.removeListener('tab:created', createdHandler as (...args: unknown[]) => void)
  window.browserAPI.removeListener('tab:removed', removedHandler as (...args: unknown[]) => void)
  if (dismissHandler)
    window.browserAPI.removeListener('popover:dismiss', dismissHandler as (...args: unknown[]) => void)
})
</script>

<style lang="less" scoped>
@tabBarHeight: 38px;
@tabItemHeight: 28px;
@gap: ((@tabBarHeight - @tabItemHeight) / 2);
.tab-bar {
  display: flex;
  align-items: center;
  gap: @gap;
  height: @tabBarHeight;
  background: var(--tabbar-bg);
  padding: 0;
  position: relative;
  -webkit-app-region: drag;

  &.mac-os {
    padding-left: 80px;
  }
}

.tab-item {
  position: relative;
  display: flex;
  align-items: center;
  height: @tabItemHeight;
  padding: 0 8px;
  border-radius: v-bind(tabItemBorderRadiusWithPx);
  cursor: pointer;
  flex-shrink: 0;
  z-index: 0;
  -webkit-app-region: no-drag;

  &:hover {
    background: var(--bg-secondary);
  }

  .tabs-background {
    position: absolute;
    content: "";
    bottom: 0;
    @translateY: @gap;

    path {
      fill: var(--chrome-bg);
    }

    &.before {
      left: 0;
      transform: translateX(-100%) translateY(@translateY);
    }
    &.after {
      right: 0;
      transform: translateX(100%) translateY(@translateY);
    }
  }
}

.tab-item.active {
  background: var(--chrome-bg);
  border-radius: 8px 8px 0 0;
  z-index: 1;

  &::before {
    position: absolute;
    content: "";
    left: 0;
    bottom: 0;
    width: 100%;
    height: ((@tabBarHeight - @tabItemHeight) / 2);
    background: var(--chrome-bg);
    transform: translateY(100%);
  }
}

.tab-item.incognito {
  &::after {
    content: "";
    position: absolute;
    left: 6px;
    right: 6px;
    bottom: 0;
    height: 2px;
    background: var(--accent-color);
    border-radius: 0 0 2px 2px;
  }
}

.tab-item.dragging {
  opacity: 0.5;
}

.tab-item.drag-over {
  border-left: 2px solid var(--accent-color);
}

.tab-item.menu-open {
  background: var(--bg-secondary);
}

.tab-favicon {
  position: relative;
  display: flex;
  align-items: center;
  margin-right: 6px;
  flex-shrink: 0;

  img {
    width: 14px;
    height: 14px;
    display: block;
  }

  .tab-loading-icon {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    color: var(--text-secondary);
  }

  .incognito-icon {
    position: absolute;
    right: -10px;
    bottom: -4px;
    background: var(--accent-color);
    border-radius: 50%;
    padding: 1px;
  }

  .favicon {
    color: var(--text-secondary);
  }
}

.tab-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1;
  color: var(--text-primary);
}

.tab-loading {
  color: var(--accent-color);
  margin-left: 4px;
  font-size: 10px;
  flex-shrink: 0;
}

.tab-close {
  color: var(--text-secondary);
  cursor: pointer;
  -webkit-app-region: no-drag;

  &:hover {
    color: var(--danger-color);
  }
}

.tab-mute {
  color: var(--danger-color);
  cursor: pointer;
  -webkit-app-region: no-drag;
  flex-shrink: 0;
}

.tab-new {
  color: var(--text-secondary);
  cursor: pointer;
  -webkit-app-region: no-drag;

  &:hover {
    color: var(--accent-color);
  }
}

.app-menu {
  margin: 0 12px 0 auto;
  -webkit-app-region: no-drag;
}

.window-controls {
  display: flex;
  align-items: center;
  height: 100%;
  gap: 0;
  margin-left: 8px;
  -webkit-app-region: no-drag;
  flex-shrink: 0;
}

.window-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: @tabBarHeight;
  height: 100%;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;

  &:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  &.close-btn:hover {
    background: var(--danger-color);
    color: white;
  }
}
</style>
