<template>
  <div
    ref="tabBarRef"
    class="tab-bar"
    :class="{ 'mac-os': isMacOS, 'window-incognito': isIncognito }"
  >
    <div
      v-if="currentWorkspace"
      class="tab-bar-workspace-btn"
      :style="{ background: currentWorkspace.color }"
      :title="currentWorkspace.name"
      @click="openWorkspacePanel"
    >
      {{ currentWorkspace.name.charAt(0) }}
    </div>
    <div
      v-for="(tab, index) in tabs"
      :key="tab.id"
      class="tab-item"
      :class="{
        'active': tab.active,
        'incognito': tab.sessionId === 'incognito',
        'dragging': draggingIndex === index,
        'drag-over': dragOverIndex === index,
        'pinned': tab.isPinned,
        'menu-open': tab.id === activeMenuTabId,
        'tab-loading': showTabLoading(tab),
        'is-hovered': hoveredTabId === tab.id,
      }"
      :style="`width:${!tab.isPinned && (enteringTabs.has(tab.id) || closingTabs.has(tab.id)) ? 1 : tabWidthFor(tab)}px;min-width:${!tab.isPinned && (enteringTabs.has(tab.id) || closingTabs.has(tab.id)) ? 1 : tabWidthFor(tab)}px;max-width:${!tab.isPinned && (enteringTabs.has(tab.id) || closingTabs.has(tab.id)) ? 1 : tabWidthFor(tab)}px`"
      :draggable="true"
      @click="activateTab(tab.id)"
      @contextmenu="onTabContextMenu($event, tab)"
      @mouseenter="onTabEnter($event, tab)"
      @mouseleave="onTabLeave"
      @dragstart="onDragStart($event, index)"
      @dragover="onDragOver($event, index)"
      @dragleave="onDragLeave"
      @drop="onDrop($event, index)"
      @dragend="onDragEnd"
      @transitionend="onTabTransitionEnd($event, tab)"
    >
      <!-- 填充下方的圆角过度 -->
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
        <Spinner
          v-else-if="showTabLoading(tab)"
          class="tab-spinner"
          :size="16"
        />
        <Favicon
          class="favicon"
          :url="tab.navigation.displayUrl"
          :favicon="tab.favicon"
          :size="14"
        />
      </div>
      <span class="tab-title">{{ tab.title || 'New Tab' }}</span>
      <Icon
        v-if="tab.isMuted"
        class="tab-mute"
        icon="mdi:volume-off"
        :width="iconSize"
        :height="iconSize"
      />
      <IconButton
        v-if="!tab.isPinned"
        class="tab-close"
        :icon="{ name: 'ic:sharp-close', size: iconSize }"
        :btn-size="iconSize + 2"
        hover-variant="muted"
        @click.stop="closeTab(tab.id)"
      />
    </div>
    <IconButton
      class="tab-new"
      icon="ic:round-plus"
      @click="createNewTab"
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
import type { PopoverAnchor, TabState } from '@browser/ipc-contract'
import { Icon } from '@iconify/vue/dist/offline'
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import IconButton from '@/components/ui/IconButton.vue'
import { requestAddressBarFocus } from '@/composables/useAddressBarFocus'
import { useI18n } from '@/composables/useI18n'
import { useTabList } from '@/composables/useTabList'
import { DropdownMenu } from '@/lib/dropdown-menu'
import { Popover } from '@/lib/popover'
import { TAB_ACTION_ICONS } from '@/lib/tab-action-icons'
import { isMacOS } from '@/utils/os'
import Favicon from './Favicon.vue'
import Spinner from './ui/Spinner.vue'

/** 父组件（ChromeUI）传入：当前窗口是否为独立无痕窗口 */
defineProps<{ isIncognito?: boolean }>()

const { t } = useI18n()

const {
  tabs,
  thumbnailCache,
  loadTabs,
  setup,
  cleanup,
  applyOrder,
  isInternalUrl,
  activateTab: activateTabBase,
  closeTab,
  createNewTab: createNewTabBase,
  newTabToRight,
  reloadTab,
  duplicateTab,
  togglePin,
  toggleMute,
  closeOthers,
  closeRight,
  closeLeft,
  onTabCreated,
  onTabClosing,
  removeTab,
} = useTabList()

const tabBarRef = ref<HTMLElement>()
const tabBarWidth = ref(0)
const isMaximized = ref(false)

// --- 标签创建/关闭动画 ---
const enteringTabs = new Set<string>()
const closingTabs = new Set<string>()
// 右键菜单高亮的标签 ID、悬停标签 ID、悬停定时器
const activeMenuTabId = ref<string | null>(null)
const hoveredTabId = ref<string | null>(null)
let hoverDelayTimer: ReturnType<typeof setTimeout> | null = null
let hoverLeaveTimer: ReturnType<typeof setTimeout> | null = null

onTabCreated((tabId: string) => {
  activeMenuTabId.value = null
  hoveredTabId.value = null
  if (hoverDelayTimer) {
    clearTimeout(hoverDelayTimer)
    hoverDelayTimer = null
  }
  enteringTabs.add(tabId)
  void nextTick(() => {
    enteringTabs.delete(tabId)
  })
})

onTabClosing((tabId: string) => {
  if (activeMenuTabId.value === tabId) {
    activeMenuTabId.value = null
  }
  hoveredTabId.value = null
  closingTabs.add(tabId)
})

function onTabTransitionEnd(event: TransitionEvent, tab: TabState): void {
  if (event.propertyName !== 'width') {
    return
  }
  if (closingTabs.has(tab.id)) {
    closingTabs.delete(tab.id)
    removeTab(tab.id)
  }
}

// --- 工作区按钮 ---
const currentWorkspace = ref<{ id: string, name: string, color: string } | null>(null)
let workspacePopover: Popover | null = null

// --- 标签悬停缩略图（popover 实现） ---
let hoverPopover: Popover | null = null
let hoverPopoverTabId: string | null = null

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
  console.debug('[TabBar] openTabContextMenu: tabId=%s button=%d', tab.id, event.button)
  closeHoverPopover()
  event.preventDefault()
  event.stopPropagation()
  activeMenuTabId.value = tab.id

  const menu = new DropdownMenu({
    mode: 'bounded',
    anchor: {
      type: 'cursor',
      placement: 'bottom-start',
    },
    descriptor: {
      id: `tab-context-${tab.id}`,
      items: [
        { id: 'new-tab-right', label: t('tab.closeRight'), icon: TAB_ACTION_ICONS.newTab },
        { id: 'sep-1', type: 'separator' },
        { id: 'reload', label: t('tab.reload'), icon: TAB_ACTION_ICONS.reload },
        { id: 'duplicate', label: t('tab.duplicate'), icon: TAB_ACTION_ICONS.duplicate },
        { id: 'pin', label: tab.isPinned ? t('tab.unpinned') : t('tab.pinned'), icon: TAB_ACTION_ICONS.pin },
        {
          id: 'mute',
          label: tab.isMuted ? t('tab.unmute') : t('tab.mute'),
          icon: tab.isMuted ? TAB_ACTION_ICONS.muteOff : TAB_ACTION_ICONS.muteOn,
        },
        { id: 'sep-2', type: 'separator' },
        { id: 'close', label: t('tab.close'), icon: TAB_ACTION_ICONS.close, danger: true },
        { id: 'close-others', label: t('tab.closeOthers'), icon: TAB_ACTION_ICONS.closeOthers },
        { id: 'close-left', label: t('tab.closeLeft'), icon: TAB_ACTION_ICONS.closeLeft },
        { id: 'close-right', label: t('tab.closeRightTabs'), icon: TAB_ACTION_ICONS.closeRight },
      ],
    },
    onAction: ({ menu: action }) => {
      runTabAction(action.id, tab)
    },
    onDismiss: () => {
      activeMenuTabId.value = null
    },
  })
  void menu
}

function runTabAction(id: string, tab: TabState): void {
  console.debug('[TabBar] runTabAction: id tabId', id, tab.id)
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
  const available
    = tabBarWidth.value - PADDING_LEFT - PADDING_RIGHT - NEW_BTN_WIDTH - WINDOW_CONTROLS_WIDTH - (count - 1) * TAB_GAP
  const equal = Math.floor((available - pinnedCount * PIN_WIDTH) / unpinnedCount)
  return Math.max(TAB_MIN, Math.min(TAB_MAX, equal))
}

let resizeObserver: ResizeObserver | null = null

function activateTab(tabId: string): void {
  closeHoverPopover()
  activateTabBase(tabId)
}

function createNewTab(): void {
  createNewTabBase()
  requestAddressBarFocus()
}

function closeHoverPopover(): void {
  console.debug('[TabBar] closeHoverPopover: delayTimer=%s leaveTimer=%s', hoverDelayTimer ? 'yes' : 'no', hoverLeaveTimer ? 'yes' : 'no')
  if (hoverDelayTimer) {
    clearTimeout(hoverDelayTimer)
    hoverDelayTimer = null
    console.debug('[TabBar] closeHoverPopover: cleared delayTimer')
  }
  if (hoverLeaveTimer) {
    clearTimeout(hoverLeaveTimer)
    hoverLeaveTimer = null
  }
  hoverPopover?.close()
  hoverPopover = null
  hoverPopoverTabId = null
}

async function openWorkspacePanel(e: MouseEvent): Promise<void> {
  const rect = (e.target as HTMLElement).getBoundingClientRect()
  workspacePopover?.close()
  const workspaces = await window.browserAPI.listWorkspaces()
  const active = await window.browserAPI.getActiveWorkspace()
  workspacePopover = new Popover({
    type: 'workspace',
    anchor: { type: 'rect', rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, placement: 'bottom-start' },
    gap: 6,
    data: { workspaces, activeId: active?.id ?? '' },
    onEvent: (event) => {
      if (event.name === 'switched') {
        workspacePopover?.close()
      }
    },
    onDismiss: () => {
      workspacePopover = null
    },
  })
}

function minimizeWindow(): void {
  console.debug('[TabBar] minimizeWindow')
  window.browserAPI.minimizeWindow()
}

function maximizeWindow(): void {
  console.debug('[TabBar] maximizeWindow')
  window.browserAPI.maximizeWindow()
}

function closeWindow(): void {
  console.debug('[TabBar] closeWindow')
  window.browserAPI.closeWindow()
}

function onTabContextMenu(event: MouseEvent, tab: TabState): void {
  console.debug('[TabBar] onTabContextMenu (wrapper): tabId=%s button=%d', tab.id, event.button)
  openTabContextMenu(event, tab)
}

// --- 标签悬停缩略图（popover 实现） ---
function onTabEnter(event: MouseEvent, tab: TabState): void {
  console.debug('[TabBar] onTabEnter: tabId=%s active=%s pinned=%s', tab.id, tab.active, tab.isPinned)
  hoveredTabId.value = tab.id
  if (tab.active || tab.isPinned) {
    console.debug('[TabBar] onTabEnter: guard early return (active/pinned)')
    return
  }
  cancelHoverLeave()
  // 必须在同步阶段提前捕获 currentTarget 和 rect，
  // 因为浏览器在 setTimeout 回调执行前会清空 MouseEvent 对象，
  // 此时 event.currentTarget 为 null 导致缩略图不显示。
  const target = event.currentTarget as HTMLElement | null
  const rect = target ? target.getBoundingClientRect() : null
  console.debug('[TabBar] onTabEnter: setting 300ms timer, oldTimer=%s target=%s', hoverDelayTimer ? 'had' : 'none', rect ? 'ok' : 'null')
  if (!target || !rect) {
    return
  }
  hoverDelayTimer = setTimeout(() => {
    console.debug('[TabBar] hover setTimeout fired: tabId=%s hovered=%s', tab.id, hoveredTabId.value)
    if (hoveredTabId.value !== tab.id) {
      console.debug('[TabBar] hover: hovered changed, skip')
      return
    }
    const src = thumbnailCache.get(tab.id) ?? null
    const data = { src, loading: !src, title: tab.title || 'New Tab', url: tab.navigation.displayUrl }
    const anchor: PopoverAnchor = {
      type: 'rect',
      rect: { x: rect.left, y: rect.bottom + 6, width: rect.width, height: 0 },
      placement: 'bottom-start',
    }
    console.debug('[TabBar] hover: creating popover, rect=%j, data=%j', rect, data)
    // 关闭旧的 hover popover
    hoverPopover?.close()
    const tabId = tab.id
    hoverPopover = new Popover({
      type: 'tab-thumbnail',
      mode: 'bounded',
      anchor,
      data,
      persistent: true,
      onDismiss: () => {
        // 仅当 dismiss 的是当前 tab 的 popover 时才清理，避免旧 popover 异步 IPC 返回时覆盖新 popover 引用
        if (hoverPopoverTabId === tabId) {
          hoverPopover = null
          hoverPopoverTabId = null
        }
      },
    })
    hoverPopoverTabId = tab.id
    // 异步截取缩略图并更新 popover
    if (!thumbnailCache.has(tab.id)) {
      void window.browserAPI.captureThumbnail(tab.id).then((dataUrl: string | null) => {
        if (hoverPopoverTabId === tab.id) {
          if (dataUrl) {
            thumbnailCache.set(tab.id, dataUrl)
          }
          hoverPopover?.sendData({ ...data, src: dataUrl, loading: false })
        }
      })
    }
  }, 300)
}

function onTabLeave(): void {
  hoveredTabId.value = null
  if (hoverDelayTimer) {
    clearTimeout(hoverDelayTimer)
    hoverDelayTimer = null
  }
  hoverLeaveTimer = setTimeout(closeHoverPopover, 200)
}

function cancelHoverLeave(): void {
  if (hoverLeaveTimer) {
    clearTimeout(hoverLeaveTimer)
    hoverLeaveTimer = null
  }
}

function onDragStart(event: DragEvent, index: number): void {
  if (!event.dataTransfer) {
    return
  }
  console.debug('[TabBar] onDragStart: index', index)
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

  console.debug('[TabBar] onDrop: src target', dragSrcIndex, targetIndex)
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

onMounted(async () => {
  setup()
  void loadTabs().then(applyOrder)
  // ResizeObserver stays in TabBar (UI-specific)
  if (tabBarRef.value) {
    tabBarWidth.value = tabBarRef.value.clientWidth
    resizeObserver = new ResizeObserver(() => {
      tabBarWidth.value = tabBarRef.value!.clientWidth
    })
    resizeObserver.observe(tabBarRef.value)
  }
  // 工作区状态
  const ws = await window.browserAPI.getActiveWorkspace()
  if (ws) {
    currentWorkspace.value = ws
  }
  window.browserAPI.onWorkspaceSwitched((ws) => {
    currentWorkspace.value = ws
  })
  // Window maximize state — TODO: add isMaximized/onMaximizeChange to preload API
})

onUnmounted(() => {
  cleanup()
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  if (hoverDelayTimer) {
    clearTimeout(hoverDelayTimer)
  }
  if (hoverLeaveTimer) {
    clearTimeout(hoverLeaveTimer)
  }
  hoverPopover?.close()
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

  /* 独立无痕窗口：整条标签栏使用无痕深紫灰底色，与普通窗口区分 */
  &.window-incognito {
    background: #2b1a3d;
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
  transition: width 200ms ease-in-out, min-width 200ms ease-in-out;

  &.is-hovered,
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

.tab-bar-workspace-btn {
  width: 32px;
  height: 24px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  flex-shrink: 0;
  margin-right: 4px;
  -webkit-app-region: no-drag;
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.85;
  }
}

.window-controls {
  display: flex;
  align-items: center;
  height: 100%;
  gap: 0;
  margin-left: auto;
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
