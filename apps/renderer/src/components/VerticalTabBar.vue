<template>
  <div
    class="vertical-tab-bar"
    :class="{ 'vertical-tab-bar--expanded': isExpanded, 'mac-os': isMacOS }"
    @transitionend="onBarTransitionEnd"
  >
    <div class="vtab-header">
      <IconButton
        class="vtab-toggle"
        :icon="{ name: isExpanded ? 'ic:baseline-chevron-left' : 'ic:baseline-menu', size: 18 }"
        :btn-size="28"
        :title="isExpanded ? t('settings.tabBarCollapse') : t('settings.tabBarExpand')"
        hover-variant="muted"
        @click="toggleExpand"
      />
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
          <div class="vtab-favicon">
            <Favicon
              v-if="!showTabLoading(tab)"
              :url="tab.navigation.displayUrl"
              :favicon="tab.favicon"
              :size="16"
            />
            <Spinner
              v-else
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
              hover-variant="muted"
              @click.stop="closeTab(tab.id)"
            />
          </template>
        </div>
      </template>
    </div>
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

// Hover popover state
let hoverDelayTimer: ReturnType<typeof setTimeout> | null = null
let hoverLeaveTimer: ReturnType<typeof setTimeout> | null = null
let hoverPopover: Popover | null = null
let hoverPopoverTabId: string | null = null

function isFirstUnpinned(tab: TabState): boolean {
  if (tab.isPinned)
    return false
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
  // 通知 Viewport 在展开/收起动画期间逐帧同步 WebContentsView 边界，避免遮挡
  window.dispatchEvent(new Event('vtab:resizing'))
}

// 宽度过渡结束：通知 Viewport 停止逐帧同步并做最终对齐
function onBarTransitionEnd(event: TransitionEvent): void {
  if (event.propertyName !== 'width')
    return
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
        { id: 'close-right', label: t('tab.closeRightTabs'), icon: TAB_ACTION_ICONS.closeRight },
        { id: 'close-left', label: t('tab.closeLeft'), icon: TAB_ACTION_ICONS.closeLeft },
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
    case 'close-right':
      closeRight(tab)
      break
    case 'close-left':
      closeLeft(tab)
      break
  }
}

// --- Hover thumbnail popover ---
function onTabEnter(event: MouseEvent, tab: TabState): void {
  if (tab.active || tab.isPinned)
    return
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
          if (dataUrl)
            thumbnailCache.set(tab.id, dataUrl)
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
  if (!event.dataTransfer)
    return
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', tab.id)
}

function onDragOver(event: DragEvent, tab: TabState): void {
  if (!event.dataTransfer)
    return
  dragOverTabId.value = tab.id
}

function onDragLeave(): void {
  dragOverTabId.value = null
}

function onDrop(event: DragEvent, targetTab: TabState): void {
  if (!event.dataTransfer)
    return
  const srcId = event.dataTransfer.getData('text/plain')
  if (!srcId || srcId === targetTab.id)
    return
  const srcIdx = tabs.value.findIndex(t => t.id === srcId)
  const targetIdx = tabs.value.findIndex(t => t.id === targetTab.id)
  if (srcIdx < 0 || targetIdx < 0)
    return
  const [moved] = tabs.value.splice(srcIdx, 1)
  tabs.value.splice(targetIdx, 0, moved)
  applyOrder()
  dragOverTabId.value = null
}

function onDragEnd(): void {
  dragOverTabId.value = null
}

// --- Lifecycle ---
onMounted(() => {
  setup()
  void loadTabs().then(applyOrder)
})

onUnmounted(() => {
  cleanup()
  if (hoverDelayTimer)
    clearTimeout(hoverDelayTimer)
  if (hoverLeaveTimer)
    clearTimeout(hoverLeaveTimer)
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
  transition: width 150ms ease;
  user-select: none;

  &.mac-os {
    padding-top: 28px;
    /* macOS 无系统标题栏：整条垂直标签栏作为窗口拖拽区（交互元素用 no-drag 排除） */
    -webkit-app-region: drag;
  }

  &--expanded {
    width: var(--vtab-width-expanded);
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
  align-items: center;
  height: 32px;
  padding: 0 4px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.vtab-toggle {
  margin: 0 auto;
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
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
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
  padding: 8px;
  border-top: 1px solid var(--border);
  -webkit-app-region: no-drag;
}
</style>
