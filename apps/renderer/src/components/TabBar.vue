<template>
  <div
    ref="tabBarRef"
    class="tab-bar"
    @contextmenu="onContextMenu"
  >
    <div
      v-for="(tab, index) in tabs"
      :key="tab.id"
      class="tab-item"
      :class="{ 'active': tab.active, 'incognito': tab.sessionId === 'incognito', 'dragging': draggingIndex === index, 'drag-over': dragOverIndex === index }"
      :style="`width:${tabWidth}px;min-width:${tabWidth}px;max-width:${tabWidth}px`"
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
        <img
          v-if="tab.favicon"
          class="favicon"
          :src="tab.favicon"
          :alt="tab.title"
        >
        <Icon
          v-else
          class="favicon default-favicon"
          icon="carbon:earth-filled"
          width="14"
          height="14"
        />
      </span>
      <span class="tab-title">{{ tab.title || 'New Tab' }}</span>
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
      @click="createTab"
    />
    <Icon
      class="sidebar-toggle"
      :icon="isSidebarOpen ? 'carbon:right-panel-close' : 'carbon:right-panel-open'"
      width="18"
      height="18"
      @click="toggleSidebar"
    />
    <div
      v-if="contextMenu.tab"
      class="tab-context-menu"
      :style="`top:${contextMenu.y}px; left:${contextMenu.x}px`"
    >
      <div
        class="tab-context-menu-item"
        @click="createIncognitoTab"
      >
        <Icon
          icon="mdi:account-off"
          width="16"
          height="16"
        />
        <span>新建隐身标签页</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TabState } from '@browser/ipc-contract'
import { Icon } from '@iconify/vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'

defineProps<{
  isSidebarOpen: boolean
}>()

const emit = defineEmits<{
  toggleSidebar: []
}>()

const tabs = ref<TabState[]>([])
const tabBarRef = ref<HTMLElement>()
const tabBarWidth = ref(0)

const TAB_MIN = 30
const TAB_MAX = 240
const TAB_GAP = 2
const PADDING_LEFT = 80
const PADDING_RIGHT = 8
const NEW_BTN_WIDTH = 32
const SIDEBAR_BTN_WIDTH = 32
const iconSize = 14
const plusIconSize = 16
const tabItemBorderRadius = 5
const tabItemBorderRadiusWithPx = `${tabItemBorderRadius}px`
const tabItemBackgroundBorderRadius = tabItemBorderRadius * 1.2

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

const tabWidth = computed(() => {
  const count = tabs.value.length
  if (count === 0) {
    return TAB_MAX
  }
  const available = tabBarWidth.value - PADDING_LEFT - PADDING_RIGHT - NEW_BTN_WIDTH - SIDEBAR_BTN_WIDTH - (count - 1) * TAB_GAP
  const equal = Math.floor(available / count)
  return Math.max(TAB_MIN, Math.min(TAB_MAX, equal))
})

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

function createTab(): void {
  window.browserAPI.createTab({ url: 'https://www.google.com' })
}

function createIncognitoTab(): void {
  window.browserAPI.createTab({ url: 'https://www.google.com', sessionId: 'incognito' })
  hideContextMenu()
}

function toggleSidebar(): void {
  emit('toggleSidebar')
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
  const newIds = newOrder.map(t => t.id)

  tabs.value = newOrder
  window.browserAPI.reorderTabs(newIds)

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

onMounted(() => {
  loadTabs()

  if (tabBarRef.value) {
    tabBarWidth.value = tabBarRef.value.clientWidth
    resizeObserver = new ResizeObserver(() => {
      tabBarWidth.value = tabBarRef.value!.clientWidth
    })
    resizeObserver.observe(tabBarRef.value)
  }

  stateChangeHandler = (state: TabState) => {
    const idx = tabs.value.findIndex(t => t.id === state.id)
    if (idx >= 0) {
      tabs.value[idx] = state
    }
    else {
      tabs.value.push(state)
    }
  }

  createdHandler = (state: TabState) => {
    if (!tabs.value.some(t => t.id === state.id)) {
      tabs.value.push(state)
    }
  }

  removedHandler = (tabId: string) => {
    tabs.value = tabs.value.filter(t => t.id !== tabId)
  }

  document.addEventListener('click', hideContextMenu)
  document.addEventListener('contextmenu', hideContextMenu)

  window.browserAPI.onTabStateChange(stateChangeHandler)
  window.browserAPI.onTabCreated(createdHandler)
  window.browserAPI.onTabRemoved(removedHandler)
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  document.removeEventListener('click', hideContextMenu)
  document.removeEventListener('contextmenu', hideContextMenu)
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
  padding: 0 8px 0 80px;
  position: relative;
  -webkit-app-region: drag;
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
      fill: var(--bg-primary);
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
  background: var(--bg-primary);
  border-radius: 8px 8px 0 0;
  z-index: 1;

  &::before {
    position: absolute;
    content: "";
    left: 0;
    bottom: 0;
    width: 100%;
    height: ((@tabBarHeight - @tabItemHeight) / 2);
    background: var(--bg-primary);
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
  }

  .incognito-icon {
    position: absolute;
    right: -10px;
    bottom: -4px;
    background: var(--accent-color);
    border-radius: 50%;
    padding: 1px;
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

.tab-new {
  color: var(--text-secondary);
  cursor: pointer;
  -webkit-app-region: no-drag;

  &:hover {
    color: var(--accent-color);
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

.sidebar-toggle {
  color: var(--text-secondary);
  cursor: pointer;
  -webkit-app-region: no-drag;
  flex-shrink: 0;
  margin-left: auto;

  &:hover {
    color: var(--accent-color);
  }
}
</style>
