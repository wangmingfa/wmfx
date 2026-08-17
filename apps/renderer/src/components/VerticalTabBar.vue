<template>
  <div
    class="vertical-tab-bar"
    :class="{ 'vertical-tab-bar--expanded': isExpanded, 'mac-os': isMacOS }"
    @transitionend="onBarTransitionEnd"
  >
    <div class="vtab-header">
      <IconButton
        v-show="isExpanded"
        class="vtab-toggle"
        :icon="{ name: isExpanded ? 'ic:baseline-chevron-left' : 'ic:baseline-menu', size: 18 }"
        :btn-size="32"
        :rounded="false"
        :title="isExpanded ? t('settings.tabBarCollapse') : t('settings.tabBarExpand')"
        hover-variant="prominent"
        variant="accent"
        @click="toggleExpand"
      />
      <div
        v-if="currentWorkspace"
        class="vtab-workspace-btn"
        :style="{ background: currentWorkspace.color }"
        :title="currentWorkspace.name"
        @click="openWorkspacePanel"
      >
        {{ currentWorkspace.name.charAt(0) }}
      </div>
    </div>
    <div class="vtab-list">
      <template
        v-for="tab in tabs"
        :key="tab.id"
      >
        <div
          v-if="!tab.isPinned && hasPinned && isFirstUnpinned(tab)"
          class="vtab-separator"
          :class="{ 'vtab-separator--visible': isExpanded }"
        />
        <div
          class="vtab-item"
          :class="{
            'vtab-item--active': tab.active,
            'vtab-item--pinned': tab.isPinned,
            'vtab-item--menu-open': tab.id === activeMenuTabId,
          }"
          draggable="true"
          @click="activateTab(tab.id)"
          @contextmenu.prevent="openTabContextMenu($event, tab)"
          @dragstart="onDragStart($event, tab)"
          @dragover.prevent="onDragOver($event, tab)"
          @dragleave="onDragLeave"
          @drop="onDrop($event, tab)"
          @dragend="onDragEnd"
          @mouseenter="onTabEnter($event, tab)"
          @mouseleave="onTabLeave"
        >
          <div
            v-if="tab.active"
            class="vtab-indicator"
          />
          <div
            class="vtab-favicon"
            :class="{ 'tab-loading': showTabLoading(tab) }"
          >
            <Favicon
              class="favicon"
              :url="tab.navigation.displayUrl"
              :favicon="tab.favicon"
              :size="isExpanded ? 16 : 20"
            />
            <Spinner
              v-if="showTabLoading(tab)"
              class="tab-spinner"
              :size="14"
            />
          </div>
          <template v-if="isExpanded">
            <div class="vtab-title">
              {{ tab.title || 'New Tab' }}
            </div>
            <IconButton
              v-if="!tab.isPinned"
              class="vtab-close"
              :icon="{ name: 'ic:sharp-close', size: 14 }"
              :btn-size="18"
              hover-variant="prominent"
              @click.stop="closeTab(tab.id)"
            />
          </template>
        </div>
      </template>
      <div
        class="vtab-new"
        @click="createNewTab()"
      >
        <IconButton
          icon="ic:round-plus"
          :btn-size="24"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PopoverAnchor, TabState } from '@browser/ipc-contract'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import IconButton from '@/components/ui/IconButton.vue'
import { isMacOS } from '@/utils/os'
import { useI18n } from '../composables/useI18n'
import { useTabList } from '../composables/useTabList'
import { DropdownMenu } from '../lib/dropdown-menu'
import { Popover } from '../lib/popover'
import { TAB_ACTION_ICONS } from '../lib/tab-action-icons'
import Favicon from './Favicon.vue'
import Spinner from './ui/Spinner.vue'

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
  reloadTab,
  duplicateTab,
  togglePin,
  toggleMute,
  closeOthers,
  closeRight,
  closeLeft,
} = useTabList()

const isExpanded = ref(false)
const activeMenuTabId = ref<string | null>(null)
const dragOverTabId = ref<string | null>(null)
// 是否存在固定（pinned）标签：分隔线仅在固定区与非固定区之间显示
const hasPinned = computed(() => tabs.value.some(t => t.isPinned))

// --- 工作区按钮 ---
const currentWorkspace = ref<{ id: string, name: string, color: string } | null>(null)
let workspacePopover: Popover | null = null

// Hover popover state
let hoverDelayTimer: ReturnType<typeof setTimeout> | null = null
let hoverLeaveTimer: ReturnType<typeof setTimeout> | null = null
let hoverPopover: Popover | null = null
let hoverPopoverTabId: string | null = null

function isFirstUnpinned(tab: TabState): boolean {
  if (tab.isPinned) {
    return false
  }
  const idx = tabs.value.findIndex(t => t.id === tab.id)
  return tabs.value.findIndex(t => !t.isPinned) === idx
}

function showTabLoading(tab: TabState): boolean {
  return tab.navigation.isLoading && !isInternalUrl(tab.navigation.committedUrl)
}

function activateTab(tabId: string): void {
  closeHoverPopover()
  activateTabBase(tabId)
}

function createNewTab(): void {
  createNewTabBase()
}

// --- 展开/收起：点击切换按钮控制（不再依赖 hover，避免与拖拽区冲突） ---
function toggleExpand(): void {
  isExpanded.value = !isExpanded.value
  console.debug('[VerticalTabBar] toggleExpand: expanded', isExpanded.value)
  void window.browserAPI.setSetting({ key: 'tabBarCollapsed', value: !isExpanded.value })
  window.dispatchEvent(new Event('vtab:resizing'))
  // 通知父级：折叠状态变化（ChromeUI 据此在 AddressBar 侧显示/隐藏 toggle）
  window.dispatchEvent(new CustomEvent('vtab:collapsed-changed', { detail: { collapsed: !isExpanded.value } }))
}

// 宽度过渡结束：通知 Viewport 停止逐帧同步并做最终对齐
function onBarTransitionEnd(event: TransitionEvent): void {
  if (event.propertyName !== 'width') {
    return
  }
  window.dispatchEvent(new Event('vtab:resize-end'))
}

// --- Context menu ---
function openTabContextMenu(event: MouseEvent, tab: TabState): void {
  closeHoverPopover()
  event.stopPropagation()
  activeMenuTabId.value = tab.id
  const menu = new DropdownMenu({
    mode: 'bounded',
    anchor: { type: 'cursor', placement: 'bottom-start' },
    descriptor: {
      id: `vtab-context-${tab.id}`,
      items: [
        { id: 'reload', label: t('tab.reload'), icon: TAB_ACTION_ICONS.reload },
        { id: 'duplicate', label: t('tab.duplicate'), icon: TAB_ACTION_ICONS.duplicate },
        { id: 'pin', label: tab.isPinned ? t('tab.unpinned') : t('tab.pinned'), icon: TAB_ACTION_ICONS.pin },
        {
          id: 'mute',
          label: tab.isMuted ? t('tab.unmute') : t('tab.mute'),
          icon: tab.isMuted ? TAB_ACTION_ICONS.muteOff : TAB_ACTION_ICONS.muteOn,
        },
        { id: 'sep-1', type: 'separator' },
        { id: 'close', label: t('tab.close'), icon: TAB_ACTION_ICONS.close, danger: true },
        { id: 'close-others', label: t('tab.closeOthers'), icon: TAB_ACTION_ICONS.closeOthers },
        { id: 'close-above', label: t('tab.closeAbove'), icon: TAB_ACTION_ICONS.closeAbove },
        { id: 'close-below', label: t('tab.closeBelow'), icon: TAB_ACTION_ICONS.closeBelow },
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
  switch (id) {
    case 'reload':
      reloadTab(tab)
      break
    case 'duplicate':
      duplicateTab(tab)
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
    case 'close-above':
      closeLeft(tab)
      break
    case 'close-below':
      closeRight(tab)
      break
  }
}

// --- Hover thumbnail popover ---
function onTabEnter(event: MouseEvent, tab: TabState): void {
  if (tab.active || tab.isPinned) {
    return
  }
  cancelHoverLeave()
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  hoverDelayTimer = setTimeout(() => {
    const src = thumbnailCache.get(tab.id) ?? null
    const data = { src, loading: !src, title: tab.title || 'New Tab', url: tab.navigation.displayUrl }
    const anchor: PopoverAnchor = {
      type: 'rect',
      rect: { x: rect.right + 6, y: rect.top, width: 0, height: rect.height },
      placement: 'right-start',
    }
    hoverPopover?.close()
    const tabId = tab.id
    hoverPopover = new Popover({
      type: 'tab-thumbnail',
      mode: 'bounded',
      anchor,
      data,
      size: { width: 280 },
      persistent: true,
      onDismiss: () => {
        if (hoverPopoverTabId === tabId) {
          hoverPopover = null
          hoverPopoverTabId = null
        }
      },
    })
    hoverPopoverTabId = tab.id
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

function closeHoverPopover(): void {
  if (hoverDelayTimer) {
    clearTimeout(hoverDelayTimer)
    hoverDelayTimer = null
  }
  if (hoverLeaveTimer) {
    clearTimeout(hoverLeaveTimer)
    hoverLeaveTimer = null
  }
  hoverPopover?.close()
  hoverPopover = null
  hoverPopoverTabId = null
}

// --- Drag & drop ---
function onDragStart(event: DragEvent, tab: TabState): void {
  if (!event.dataTransfer) {
    return
  }
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', tab.id)
}

function onDragOver(event: DragEvent, tab: TabState): void {
  if (!event.dataTransfer) {
    return
  }
  dragOverTabId.value = tab.id
}

function onDragLeave(): void {
  dragOverTabId.value = null
}

function onDrop(event: DragEvent, targetTab: TabState): void {
  if (!event.dataTransfer) {
    return
  }
  const srcId = event.dataTransfer.getData('text/plain')
  if (!srcId || srcId === targetTab.id) {
    return
  }
  const srcIdx = tabs.value.findIndex(t => t.id === srcId)
  const targetIdx = tabs.value.findIndex(t => t.id === targetTab.id)
  if (srcIdx < 0 || targetIdx < 0) {
    return
  }
  const [moved] = tabs.value.splice(srcIdx, 1)
  tabs.value.splice(targetIdx, 0, moved)
  applyOrder()
  dragOverTabId.value = null
}

function onDragEnd(): void {
  dragOverTabId.value = null
}

async function openWorkspacePanel(e: MouseEvent): Promise<void> {
  const rect = (e.target as HTMLElement).getBoundingClientRect()
  workspacePopover?.close()
  const workspaces = await window.browserAPI.listWorkspaces()
  const active = await window.browserAPI.getActiveWorkspace()
  workspacePopover = new Popover({
    type: 'workspace',
    anchor: { type: 'rect', rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, placement: 'right-start' },
    data: { workspaces, activeId: active?.id ?? '' },
    gap: 8,
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

// --- Lifecycle ---
/** onWorkspaceSwitched 的取消函数，卸载时调用避免泄漏 */
let disposeWorkspaceSwitched: (() => void) | null = null
/** vtab:toggle-from-addressbar 具名 handler，卸载时按引用移除 */
function onVtabToggleFromAddressbar(): void {
  if (!isExpanded.value) {
    toggleExpand()
  }
}

onMounted(async () => {
  setup()
  void loadTabs().then(applyOrder)
  const collapsed = await window.browserAPI.getSetting('tabBarCollapsed')
  if (typeof collapsed === 'boolean') {
    isExpanded.value = !collapsed
  }
  const ws = await window.browserAPI.getActiveWorkspace()
  if (ws) {
    currentWorkspace.value = ws
  }
  disposeWorkspaceSwitched = window.browserAPI.onWorkspaceSwitched((ws) => {
    currentWorkspace.value = ws
  })
  // 折叠时 toggle 已移到 AddressBar 左侧，点击后在此展开
  window.addEventListener('vtab:toggle-from-addressbar', onVtabToggleFromAddressbar)
})

onUnmounted(() => {
  cleanup()
  if (hoverDelayTimer) {
    clearTimeout(hoverDelayTimer)
  }
  if (hoverLeaveTimer) {
    clearTimeout(hoverLeaveTimer)
  }
  // 注销监听：避免切换标签栏布局（top↔left）卸载/重挂时累积监听器
  disposeWorkspaceSwitched?.()
  disposeWorkspaceSwitched = null
  window.removeEventListener('vtab:toggle-from-addressbar', onVtabToggleFromAddressbar)
  hoverPopover?.close()
})
</script>

<style lang="less" scoped>
.vertical-tab-bar {
  display: flex;
  flex-direction: column;
  width: var(--vtab-width-collapsed);
  background: var(--vtab-bg);
  border-right: 1px solid var(--border);
  overflow: hidden;
  flex-shrink: 0;
  transition: all 150ms ease;
  user-select: none;
  margin-top: var(--addressbar-height);

  &.mac-os {
    /* macOS 无系统标题栏：允许拖拽整个栏区 */
    -webkit-app-region: drag;
  }

  &--expanded {
    width: var(--vtab-width-expanded);
    margin-top: 0;
  }

  &:not(&--expanded) .vtab-favicon {
    margin: 0 auto;
  }
}

.vtab-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px;
}

.vtab-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  min-height: var(--addressbar-height);
  flex-shrink: 0;
  -webkit-app-region: no-drag;
  position: relative;
  gap: 4px;
  padding: 0 4px 0 70px;
  transition: all 150ms ease;
}

/* macOS 折叠时：背景与 AddressBar 一致，隐藏 toggle，工作区按钮绝对定位避交通灯 */
.vertical-tab-bar.mac-os:not(.vertical-tab-bar--expanded) {
  .vtab-header {
    justify-content: center;
    padding: 0;
  }
  .vtab-toggle {
    opacity: 0;
    pointer-events: none;
  }
}

.vtab-workspace-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
  border-radius: 8px;
  background: var(--accent-color);

  &:hover {
    opacity: 0.85;
  }
}

.vtab-toggle {
  margin: 0;
  transition: all 150ms ease;
}

.vtab-item {
  display: flex;
  align-items: center;
  height: var(--vtab-item-height-collapsed);
  border-radius: 6px;
  padding: 0 8px;
  margin-bottom: 4px;
  cursor: pointer;
  position: relative;
  gap: 8px;
  transition: background 100ms;
  -webkit-app-region: no-drag;

  .vertical-tab-bar--expanded & {
    height: var(--vtab-item-height);
    padding: 0 8px 0 12px;
  }

  &:hover,
  &--menu-open {
    background: var(--vtab-item-active-bg);
  }

  &--active {
    background: var(--vtab-item-active-bg);
  }

  &:hover .vtab-close,
  &--menu-open .vtab-close {
    opacity: 1;
  }
}

.vtab-indicator {
  position: absolute;
  left: 0;
  top: 25%;
  bottom: 25%;
  width: var(--vtab-indicator-width);
  background: var(--accent-color);
  border-radius: 2px;
}

.vtab-favicon {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;

  .vertical-tab-bar:not(.vertical-tab-bar--expanded) & {
    width: 20px;
    height: 20px;
  }

  .tab-spinner {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
    transition: opacity 0.15s ease;
  }

  .favicon {
    transition: transform 0.15s ease;
  }

  &.tab-loading .favicon {
    transform: scale(0.6);
  }
}

.vtab-title {
  flex: 1;
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.vtab-close {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 100ms;
}

.vtab-separator {
  height: 0;
  overflow: hidden;
  margin: 4px 8px;
  border-top: 1px solid var(--border);
  transition: height 150ms;

  &--visible {
    height: 1px;
  }
}

.vtab-new {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}
</style>
