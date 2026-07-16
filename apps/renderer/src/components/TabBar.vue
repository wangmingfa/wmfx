<template>
  <div ref="tabBarRef" class="tab-bar" :class="{ 'mac-os': isMacOS }">
    <div
      v-for="(tab, index) in tabs"
      :key="tab.id"
      class="tab-item"
      :class="{
        active: tab.active,
        incognito: tab.sessionId === 'incognito',
        dragging: draggingIndex === index,
        'drag-over': dragOverIndex === index,
        pinned: tab.isPinned,
        'menu-open': tab.id === activeMenuTabId,
        'tab-loading': showTabLoading(tab),
      }"
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
      <!--填充下方的圆角过度-->
      <template v-if="tab.active">
        <svg
          :width="tabItemBackgroundBorderRadius"
          :height="tabItemBackgroundBorderRadius"
          class="tabs-background before"
        >
          <path
            :d="`M 0 ${tabItemBackgroundBorderRadius} A ${tabItemBackgroundBorderRadius} ${tabItemBackgroundBorderRadius} 0 0 0 ${tabItemBackgroundBorderRadius} 0 L ${tabItemBackgroundBorderRadius} ${tabItemBackgroundBorderRadius} Z`"
          />
        </svg>
        <svg
          :width="tabItemBackgroundBorderRadius"
          :height="tabItemBackgroundBorderRadius"
          class="tabs-background after"
        >
          <path
            :d="`M 0 0 A ${tabItemBackgroundBorderRadius} ${tabItemBackgroundBorderRadius} 0 0 0 ${tabItemBackgroundBorderRadius} ${tabItemBackgroundBorderRadius} L 0 ${tabItemBackgroundBorderRadius} Z`"
          />
        </svg>
      </template>
      <div class="tab-favicon">
        <!-- 无痕模式下的图标 -->
        <Icon
          v-if="tab.sessionId === 'incognito'"
          class="incognito-icon"
          icon="mdi:account-off"
          width="14"
          height="14"
        />
        <!-- 内部页面不显示 loading -->
        <Spinner v-else-if="showTabLoading(tab)" class="tab-spinner" :size="16" />
        <Favicon v-else :url="tab.navigation.displayUrl" :favicon="tab.favicon" :size="14" />
      </div>
      <span class="tab-title">{{ tab.title || 'New Tab' }}</span>
      <Icon v-if="tab.isMuted" class="tab-mute" icon="mdi:volume-off" :width="iconSize" :height="iconSize" />
      <IconButton
        v-if="!tab.isPinned"
        class="tab-close"
        :icon="{ name: 'ic:sharp-close', size: iconSize }"
        :btn-size="iconSize + 2"
        :hover-color="{ light: '#DBDBDC', dark: 'var(--bg-hover)' }"
        @click.stop="closeTab(tab.id)"
      />
    </div>
    <IconButton class="tab-new" icon="ic:round-plus" @click="createNewTab" />
    <div v-if="!isMacOS" class="window-controls">
      <div class="window-btn" @click="minimizeWindow">
        <Icon icon="mdi:window-minimize" width="22" height="22" />
      </div>
      <div class="window-btn" @click="maximizeWindow">
        <Icon :icon="isMaximized ? 'mdi:window-restore' : 'mdi:window-maximize'" width="22" height="22" />
      </div>
      <div class="window-btn close-btn" @click="closeWindow">
        <Icon icon="mdi:window-close" width="22" height="22" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PopoverAnchor, TabState } from '@browser/ipc-contract'
import { Icon } from '@iconify/vue'
import { onMounted, onUnmounted, ref } from 'vue'
import IconButton from '@/components/ui/IconButton.vue'
import { requestAddressBarFocus } from '../composables/useAddressBarFocus'
import { useI18n } from '../composables/useI18n'
import { DropdownMenu } from '../lib/dropdown-menu'
import { isMacOS } from '../utils/os'
import Favicon from './Favicon.vue'
import Spinner from './ui/Spinner.vue'

const { t } = useI18n()

const tabs = ref<TabState[]>([])
const tabBarRef = ref<HTMLElement>()
const tabBarWidth = ref(0)
const isMaximized = ref(false)
// 当前因右键菜单而高亮的触发元素（popover 关闭时由 onPopoverDismiss 清空）
const activeMenuTabId = ref<string | null>(null)
// 当前打开的标签右键菜单的 popover id，用于区分 dismiss 事件归属：
// 打开新菜单会因“bounded 互斥”关闭旧菜单并广播旧菜单的 dismiss，
// 若不区分 id 会把新菜单标签页的高亮一并清除。
let currentMenuPopoverId: string | null = null

const TAB_MIN = 30
const TAB_MAX = 240
const TAB_GAP = 2
const PIN_WIDTH = 30
const PADDING_LEFT = 80
const PADDING_RIGHT = 8
const NEW_BTN_WIDTH = 32
const WINDOW_CONTROLS_WIDTH = 112
const iconSize = 14
const tabItemBorderRadius = 5
const tabItemBorderRadiusWithPx = `${tabItemBorderRadius}px`
const tabItemBackgroundBorderRadius = tabItemBorderRadius * 1.2

function showTabLoading(tab: TabState) {
  return tab.navigation.isLoading && !isInternalUrl(tab.navigation.displayUrl)
}

function openTabContextMenu(event: MouseEvent, tab: TabState): void {
  event.preventDefault()
  event.stopPropagation()
  // 按鼠标实际位置定位（contextmenu 事件携带 clientX/clientY），而非标签元素矩形
  const anchor: PopoverAnchor = { type: 'point', x: event.clientX, y: event.clientY, placement: 'bottom-start' }
  activeMenuTabId.value = tab.id
  const menu = new DropdownMenu({
    mode: 'bounded',
    anchor,
    descriptor: {
      id: 'tab-context',
      items: [
        { id: 'new-tab-right', label: t('tab.closeRight'), icon: 'mdi:plus' },
        { id: 'sep-1', type: 'separator' },
        { id: 'reload', label: t('tab.reload'), icon: 'mdi:refresh' },
        { id: 'duplicate', label: t('tab.duplicate'), icon: 'mdi:content-copy' },
        { id: 'pin', label: tab.isPinned ? t('tab.unpinned') : t('tab.pinned'), icon: 'mdi:pin' },
        {
          id: 'mute',
          label: tab.isMuted ? t('tab.unmute') : t('tab.mute'),
          icon: tab.isMuted ? 'mdi:volume-off' : 'mdi:volume-high',
        },
        { id: 'sep-2', type: 'separator' },
        { id: 'close', label: t('tab.close'), icon: 'mdi:close', danger: true },
        { id: 'close-others', label: t('tab.closeOthers'), icon: 'mdi:close-box-multiple' },
        { id: 'close-left', label: t('tab.closeLeft'), icon: 'mdi:arrow-left-bold-box-outline' },
        { id: 'close-right', label: t('tab.closeRightTabs'), icon: 'mdi:arrow-right-bold-box-outline' },
      ],
    },
    onAction: ({ menu: item, context }) => {
      runTabAction(item.id, tab)
      context.close()
    },
  })
  currentMenuPopoverId = menu.id
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
  const pinnedCount = tabs.value.filter((t) => t.isPinned).length
  const unpinnedCount = count - pinnedCount
  if (unpinnedCount === 0) {
    return TAB_MAX
  }
  const available =
    tabBarWidth.value - PADDING_LEFT - PADDING_RIGHT - NEW_BTN_WIDTH - WINDOW_CONTROLS_WIDTH - (count - 1) * TAB_GAP
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
  const pinned = tabs.value.filter((t) => t.isPinned)
  const unpinned = tabs.value.filter((t) => !t.isPinned)
  const ordered = [...pinned, ...unpinned]
  tabs.value = ordered
  window.browserAPI.reorderTabs(ordered.map((t) => t.id))
}

/** 将新标签插入到目标标签右侧并同步顺序。 */
function insertAfter(targetId: string, newTab: TabState): void {
  const others = tabs.value.filter((t) => t.id !== newTab.id)
  const pos = others.findIndex((t) => t.id === targetId)
  others.splice(pos + 1, 0, newTab)
  tabs.value = others
  window.browserAPI.reorderTabs(others.map((t) => t.id))
}

/** 内部页（wmfx://）按路由展示固定图标，避免回退到破图 favicon。 */
function isInternalUrl(url: string): boolean {
  return url.startsWith('wmfx://')
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
    url: tab.navigation.displayUrl,
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
  const ids = tabs.value.filter((t) => t.id !== tab.id).map((t) => t.id)
  window.browserAPI.closeTabs(ids)
}

function closeRight(tab: TabState): void {
  const idx = tabs.value.findIndex((t) => t.id === tab.id)
  const ids = tabs.value.slice(idx + 1).map((t) => t.id)
  window.browserAPI.closeTabs(ids)
}

function closeLeft(tab: TabState): void {
  const idx = tabs.value.findIndex((t) => t.id === tab.id)
  const ids = tabs.value.slice(0, idx).map((t) => t.id)
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
    const idx = tabs.value.findIndex((t) => t.id === state.id)
    if (idx >= 0) {
      const wasPinned = tabs.value[idx].isPinned
      tabs.value[idx] = state
      if (wasPinned !== state.isPinned) {
        applyOrder()
      }
    }
    // Unknown tab IDs are silently ignored — state-change only updates
    // existing tabs, never creates them.  Tab creation goes through
    // tab:created → createdHandler; stale events from closed tabs would
    // otherwise be pushed back as ghost entries.
  }

  createdHandler = (state: TabState) => {
    if (!tabs.value.some((t) => t.id === state.id)) {
      tabs.value.push(state)
      applyOrder()
    }
  }

  removedHandler = (tabId: string) => {
    tabs.value = tabs.value.filter((t) => t.id !== tabId)
  }

  window.browserAPI.onTabStateChange(stateChangeHandler)
  window.browserAPI.onTabCreated(createdHandler)
  window.browserAPI.onTabRemoved(removedHandler)
  // popover 关闭（无论是点击菜单项还是背景/Esc）时，清除触发元素高亮。
  // 仅当关闭的是当前标签菜单时才清除，避免“互斥”关闭旧菜单误清新菜单标签页的高亮。
  dismissHandler = (popoverId: string) => {
    if (popoverId !== currentMenuPopoverId) return
    activeMenuTabId.value = null
    currentMenuPopoverId = null
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

  &:hover,
  &.menu-open:not(.active) {
    background: var(--bg-tab-hover);
  }

  .tabs-background {
    position: absolute;
    content: '';
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

  &.tab-loading {
    .tab-spinner {
      opacity: 1;
    }
    .favicon {
      transform: scale(0.6);
    }
  }

  &.active {
    background: var(--chrome-bg);
    border-radius: 8px 8px 0 0;
    z-index: 1;

    &::before {
      position: absolute;
      content: '';
      left: 0;
      bottom: 0;
      width: 100%;
      height: ((@tabBarHeight - @tabItemHeight) / 2);
      background: var(--chrome-bg);
      transform: translateY(100%);
    }
  }

  &.incognito {
    &::after {
      content: '';
      position: absolute;
      left: 6px;
      right: 6px;
      bottom: 0;
      height: 2px;
      background: var(--accent-color);
      border-radius: 0 0 2px 2px;
    }
  }

  &.dragging {
    opacity: 0.5;
  }

  &.drag-over {
    border-left: 2px solid var(--accent-color);
  }
}

.tab-favicon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 6px;
  @faviconSize: 14px;
  width: @faviconSize;
  height: @faviconSize;
  flex-shrink: 0;

  .tab-spinner {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease;
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

  img.favicon {
    width: @faviconSize;
    height: @faviconSize;

    &:not(.internal-favicon) {
      transition: transform 0.1s ease;
      transform-origin: center center;
    }
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

.tab-close {
  -webkit-app-region: no-drag;
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
