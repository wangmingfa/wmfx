<template>
  <div
    ref="tabBarRef"
    class="tab-bar"
    :class="{ 'mac-os': isMacOS }"
    @contextmenu="onContextMenu"
  >
    <div
      v-for="(tab, index) in tabs"
      :key="tab.id"
      class="tab-item"
      :class="{ 'active': tab.active, 'incognito': tab.sessionId === 'incognito', 'dragging': draggingIndex === index, 'drag-over': dragOverIndex === index, 'pinned': tab.isPinned }"
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
        <Icon
          v-if="tab.sessionId === 'incognito'"
          class="incognito-icon"
          icon="mdi:account-off"
          width="14"
          height="14"
        />
        <Icon
          v-if="tab.isLoading"
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
    <div class="app-menu-wrap">
      <Icon
        class="app-menu"
        icon="carbon:overflow-menu-vertical"
        width="18"
        height="18"
        @click.stop="toggleAppMenu"
      />
      <div
        v-if="appMenuOpen"
        class="app-menu-dropdown"
      >
        <div
          v-for="item in menuItems"
          :key="item.label"
          class="app-menu-item"
          @click="onAppMenuItem(item)"
        >
          <Icon
            :icon="item.icon"
            width="16"
            height="16"
          />
          <span>{{ item.label }}</span>
        </div>
      </div>
    </div>
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
    <div
      v-if="contextMenu.tab"
      class="tab-context-menu"
      :style="`top:${contextMenu.y}px; left:${contextMenu.x}px`"
    >
      <div
        class="tab-context-menu-item"
        @click="newTabToRight(contextMenu.tab!)"
      >
        <Icon
          icon="mdi:plus"
          width="16"
          height="16"
        />
        <span>在右侧新增标签页</span>
      </div>
      <div class="tab-context-menu-divider" />
      <div
        class="tab-context-menu-item"
        @click="reloadTab(contextMenu.tab!)"
      >
        <Icon
          icon="mdi:refresh"
          width="16"
          height="16"
        />
        <span>重新加载</span>
      </div>
      <div
        class="tab-context-menu-item"
        @click="duplicateTab(contextMenu.tab!)"
      >
        <Icon
          icon="mdi:content-copy"
          width="16"
          height="16"
        />
        <span>复制</span>
      </div>
      <div
        class="tab-context-menu-item"
        @click="togglePin(contextMenu.tab!)"
      >
        <Icon
          icon="mdi:pin"
          width="16"
          height="16"
        />
        <span>{{ contextMenu.tab!.isPinned ? '取消固定' : '固定' }}</span>
      </div>
      <div
        class="tab-context-menu-item"
        @click="toggleMute(contextMenu.tab!)"
      >
        <Icon
          :icon="contextMenu.tab!.isMuted ? 'mdi:volume-off' : 'mdi:volume-high'"
          width="16"
          height="16"
        />
        <span>{{ contextMenu.tab!.isMuted ? '取消静音' : '将这个网站静音' }}</span>
      </div>
      <div class="tab-context-menu-divider" />
      <div
        class="tab-context-menu-item"
        @click="closeTab(contextMenu.tab!.id)"
      >
        <Icon
          icon="mdi:close"
          width="16"
          height="16"
        />
        <span>关闭</span>
      </div>
      <div
        class="tab-context-menu-item"
        @click="closeOthers(contextMenu.tab!)"
      >
        <Icon
          icon="mdi:close-box-multiple"
          width="16"
          height="16"
        />
        <span>关闭其它标签页</span>
      </div>
      <div
        class="tab-context-menu-item"
        @click="closeRight(contextMenu.tab!)"
      >
        <Icon
          icon="mdi:arrow-right-bold-box-outline"
          width="16"
          height="16"
        />
        <span>关闭右侧标签页</span>
      </div>
      <div
        class="tab-context-menu-item"
        @click="closeLeft(contextMenu.tab!)"
      >
        <Icon
          icon="mdi:arrow-left-bold-box-outline"
          width="16"
          height="16"
        />
        <span>关闭左侧标签页</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TabState } from '@browser/ipc-contract'
import { Icon } from '@iconify/vue'
import { onMounted, onUnmounted, ref } from 'vue'
import { isMacOS } from '../utils/os'
import DefaultFavicon from './DefaultFavicon.vue'

const tabs = ref<TabState[]>([])
const tabBarRef = ref<HTMLElement>()
const tabBarWidth = ref(0)
const isMaximized = ref(false)
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

interface AppMenuItem {
  label: string
  icon: string
  url?: string
  action?: string
}

const menuItems: AppMenuItem[] = [
  { label: '新建隐身标签页', icon: 'mdi:account-off', action: 'incognito' },
  { label: '书签', url: 'wmfx://bookmarks', icon: 'mdi:bookmark' },
  { label: '历史', url: 'wmfx://history', icon: 'mdi:history' },
  { label: '下载', url: 'wmfx://downloads', icon: 'mdi:download' },
  { label: '代理', url: 'wmfx://proxy', icon: 'mdi:network' },
  { label: '设置', url: 'wmfx://settings', icon: 'mdi:cog' },
]

const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  tab: null as TabState | null,
})

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
}

/** 应用菜单项：隐身项新建隐身标签，内部页项已存在则激活否则新建。 */
async function onAppMenuItem(item: AppMenuItem): Promise<void> {
  if (item.action === 'incognito') {
    window.browserAPI.createNewTab('incognito')
  }
  else if (item.url) {
    const list = await window.browserAPI.getList()
    const existing = list.find(t => t.url === item.url || t.url.startsWith(`${item.url}/`))
    if (existing) {
      window.browserAPI.activateTab(existing.id)
    }
    else {
      window.browserAPI.createTab({ url: item.url })
    }
  }
  appMenuOpen.value = false
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
  newtab: 'mdi:home',
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

function toggleAppMenu(): void {
  appMenuOpen.value = !appMenuOpen.value
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
  event.preventDefault()
  event.stopPropagation()
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    tab,
  }
}

function onContextMenu(event: MouseEvent): void {
  event.preventDefault()
  hideContextMenu()
}

function hideContextMenu(): void {
  contextMenu.value = { visible: false, x: 0, y: 0, tab: null }
}

/** 在目标标签右侧新增空白标签页并激活。 */
async function newTabToRight(tab: TabState): Promise<void> {
  const newTab = await window.browserAPI.createTab({ url: 'wmfx://newtab', activate: true })
  insertAfter(tab.id, newTab)
  hideContextMenu()
}

function reloadTab(tab: TabState): void {
  window.browserAPI.reload(tab.id)
  hideContextMenu()
}

/** 复制标签：以相同 url 与会话新建，并插入到原标签右侧。 */
async function duplicateTab(tab: TabState): Promise<void> {
  const newTab = await window.browserAPI.createTab({
    url: tab.url,
    sessionId: tab.sessionId,
    activate: true,
  })
  insertAfter(tab.id, newTab)
  hideContextMenu()
}

function togglePin(tab: TabState): void {
  window.browserAPI.setPinned(tab.id, !tab.isPinned)
  hideContextMenu()
}

function toggleMute(tab: TabState): void {
  window.browserAPI.setMuted(tab.id, !tab.isMuted)
  hideContextMenu()
}

function closeOthers(tab: TabState): void {
  const ids = tabs.value.filter(t => t.id !== tab.id).map(t => t.id)
  window.browserAPI.closeTabs(ids)
  hideContextMenu()
}

function closeRight(tab: TabState): void {
  const idx = tabs.value.findIndex(t => t.id === tab.id)
  const ids = tabs.value.slice(idx + 1).map(t => t.id)
  window.browserAPI.closeTabs(ids)
  hideContextMenu()
}

function closeLeft(tab: TabState): void {
  const idx = tabs.value.findIndex(t => t.id === tab.id)
  const ids = tabs.value.slice(0, idx).map(t => t.id)
  window.browserAPI.closeTabs(ids)
  hideContextMenu()
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

function onDocClick(): void {
  appMenuOpen.value = false
  hideContextMenu()
}

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

  document.addEventListener('click', onDocClick)
  document.addEventListener('contextmenu', onDocClick)

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
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('contextmenu', onDocClick)
  window.browserAPI.removeListener('tab:state-change', stateChangeHandler as (...args: unknown[]) => void)
  window.browserAPI.removeListener('tab:created', createdHandler as (...args: unknown[]) => void)
  window.browserAPI.removeListener('tab:removed', removedHandler as (...args: unknown[]) => void)
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
  background: var(--bg-tertiary);
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

.app-menu-wrap {
  position: relative;
  flex-shrink: 0;
  margin: 0 12px 0 auto;
  -webkit-app-region: no-drag;
}

.app-menu {
  color: var(--text-secondary);
  cursor: pointer;

  &:hover {
    color: var(--accent-color);
  }
}

.app-menu-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 9999;
  min-width: 160px;
  background: var(--bg-secondary);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  padding: 4px 0;
  pointer-events: auto;
}

.app-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;

  &:hover {
    background: var(--bg-tertiary);
  }
}

.tab-context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 160px;
  background: var(--bg-secondary);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  padding: 4px 0;
  pointer-events: auto;
}

.tab-context-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;

  &:hover {
    background: var(--bg-tertiary);
  }
}

.tab-context-menu-divider {
  height: 1px;
  margin: 4px 0;
  background: var(--bg-tertiary);
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
