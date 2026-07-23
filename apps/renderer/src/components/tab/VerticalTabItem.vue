<template>
  <div
    class="vtab-item"
    :class="{
      'vtab-item--active': tab.active,
      'vtab-item--pinned': tab.isPinned,
      'vtab-item--menu-open': tab.id === activeMenuTabId,
    }"
    draggable="true"
    @click="$emit('activate', tab.id)"
    @contextmenu.prevent="$emit('contextmenu', $event, tab)"
    @dragstart="$emit('dragstart', $event, tab)"
    @dragover.prevent="$emit('dragover', $event, tab)"
    @dragleave="$emit('dragleave')"
    @drop="$emit('drop', $event, tab)"
    @dragend="$emit('dragend')"
    @mouseenter="$emit('enter', $event, tab)"
    @mouseleave="$emit('leave')"
  >
    <div
      v-if="tab.active"
      class="vtab-indicator"
    />
    <TabFavicon
      class="vtab-favicon"
      :url="tab.navigation.committedUrl"
      :favicon="tab.favicon"
      :is-loading="showTabLoading"
      :size="isExpanded ? 16 : 20"
    />
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
        @click.stop="$emit('close', tab.id)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { TabState } from '@browser/ipc-contract'
import { computed } from 'vue'
import IconButton from '@/components/ui/IconButton.vue'
import TabFavicon from './TabFavicon.vue'

const props = defineProps<{
  tab: TabState
  isExpanded: boolean
  activeMenuTabId: string | null
  isInternalUrl: (url: string) => boolean
}>()

defineEmits<{
  activate: [tabId: string]
  contextmenu: [event: MouseEvent, tab: TabState]
  dragstart: [event: DragEvent, tab: TabState]
  dragover: [event: DragEvent, tab: TabState]
  dragleave: []
  drop: [event: DragEvent, tab: TabState]
  dragend: []
  enter: [event: MouseEvent, tab: TabState]
  leave: []
  close: [tabId: string]
}>()

const showTabLoading = computed(
  () => props.tab.navigation.isLoading && !props.isInternalUrl(props.tab.navigation.committedUrl),
)
</script>

<style scoped lang="less">
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
  width: 20px;
  height: 20px;

  /* 展开态 favicon 缩小为 16px（重构前逻辑） */
  .vertical-tab-bar--expanded & {
    width: 16px;
    height: 16px;
  }

  /* 折叠态（仅图标、无标题）：在标签项内水平居中（重构前 margin:0 auto 逻辑） */
  .vertical-tab-bar:not(.vertical-tab-bar--expanded) & {
    margin: 0 auto;
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
</style>
