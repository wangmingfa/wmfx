<template>
  <div
    class="tab-item"
    :class="{
      'active': tab.active,
      'incognito': tab.sessionId === 'incognito',
      'dragging': dragging,
      'drag-over': dragOver,
      'pinned': tab.isPinned,
      'menu-open': tab.id === activeMenuTabId,
      'tab-loading': showTabLoading,
    }"
    :style="`width:${width}px;min-width:${width}px;max-width:${width}px`"
    :draggable="true"
    @click="$emit('activate', tab.id)"
    @contextmenu.prevent="$emit('contextmenu', $event, tab)"
    @mouseenter="$emit('enter', $event, tab)"
    @mouseleave="$emit('leave')"
    @dragstart="$emit('dragstart', $event, index)"
    @dragover.prevent="$emit('dragover', $event, index)"
    @dragleave="$emit('dragleave')"
    @drop="$emit('drop', $event, index)"
    @dragend="$emit('dragend')"
  >
    <!-- 填充下方的圆角过渡 -->
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

    <TabFavicon
      class="tab-favicon"
      :url="tab.navigation.displayUrl"
      :favicon="tab.favicon"
      :is-loading="showTabLoading"
      :is-incognito="tab.sessionId === 'incognito'"
      :size="14"
    />

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
      @click.stop="$emit('close', tab.id)"
    />
  </div>
</template>

<script setup lang="ts">
import type { TabState } from '@browser/ipc-contract'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import IconButton from '@/components/ui/IconButton.vue'
import TabFavicon from './TabFavicon.vue'

const props = defineProps<{
  tab: TabState
  index: number
  width: number
  dragging: boolean
  dragOver: boolean
  iconSize: number
  activeMenuTabId: string | null
  isInternalUrl: (url: string) => boolean
}>()

defineEmits<{
  activate: [tabId: string]
  contextmenu: [event: MouseEvent, tab: TabState]
  enter: [event: MouseEvent, tab: TabState]
  leave: []
  dragstart: [event: DragEvent, index: number]
  dragover: [event: DragEvent, index: number]
  dragleave: []
  drop: [event: DragEvent, index: number]
  dragend: []
  close: [tabId: string]
}>()

const tabItemBorderRadius = 5
const tabItemBackgroundBorderRadius = tabItemBorderRadius * 1.2

const showTabLoading = computed(
  () => !props.isInternalUrl(props.tab.navigation.displayUrl) && props.tab.navigation.isLoading,
)
</script>

<style scoped lang="less">
.tab-item {
  position: relative;
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 8px;
  border-radius: 5px;
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

    path {
      fill: var(--chrome-bg);
    }

    &.before {
      left: 0;
      transform: translateX(-100%) translateY(5px);
    }

    &.after {
      right: 0;
      transform: translateX(100%) translateY(5px);
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
      height: 5px;
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
  margin-right: 6px;
  width: 14px;
  height: 14px;
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
</style>
