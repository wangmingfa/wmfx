<template>
  <li class="bookmark-node" :class="{ 'bookmark-folder': node.isFolder, 'bookmark-item': !node.isFolder }">
    <SectionItem class="bookmark-row">
      <template #label>
        <div
          class="bookmark-node-content"
          :draggable="true"
          @click="node.isFolder ? handleToggle() : handleOpen()"
          @dragstart="(e) => $emit('dragstart', e, node)"
          @dragover.prevent="(e) => $emit('dragover', e, node)"
          @drop.prevent="(e) => $emit('drop', e, node)"
        >
          <span v-if="node.isFolder" class="bookmark-node-icon">{{ expanded ? '▾' : '▸' }}</span>
          <span class="bookmark-node-icon" :class="node.isFolder ? 'bookmark-icon-folder' : 'bookmark-icon-link'">
            {{ node.isFolder ? '📁' : '🔗' }}
          </span>
          <span class="bookmark-node-title">{{ node.title }}</span>
          <span v-if="!node.isFolder && node.url" class="bookmark-node-url">{{ node.url }}</span>
        </div>
      </template>

      <div class="bookmark-row-actions">
        <IconButton
          v-if="node.isFolder"
          icon="mdi:folder-plus-outline"
          :btn-size="28"
          :tooltip="t('bookmark.addSubfolder')"
          @click.stop="$emit('add', node)"
        />
        <IconButton
          icon="mdi:pencil-outline"
          :btn-size="28"
          :tooltip="t('bookmark.rename')"
          @click.stop="$emit('rename', node)"
        />
        <IconButton
          icon="mdi:delete-outline"
          :btn-size="28"
          danger
          :tooltip="t('bookmark.delete')"
          @click.stop="$emit('delete', node)"
        />
      </div>
    </SectionItem>

    <ul v-show="node.isFolder && expanded" class="bookmark-children">
      <BookmarkNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :expanded-folders="expandedFolders"
        @toggle="$emit('toggle', $event)"
        @rename="$emit('rename', $event)"
        @delete="$emit('delete', $event)"
        @add="$emit('add', $event)"
        @open="$emit('open', $event)"
        @dragstart="(e, item) => $emit('dragstart', e, item)"
        @dragover="(e, item) => $emit('dragover', e, item)"
        @drop="(e, item) => $emit('drop', e, item)"
      />
    </ul>
  </li>
</template>

<script setup lang="ts">
import type { BookmarkItem } from '@browser/ipc-contract'

import { computed } from 'vue'
import SectionItem from '@/components/SectionItem.vue'
import IconButton from '@/components/ui/IconButton.vue'
import { useI18n } from '@/composables/useI18n'

interface TreeNode extends BookmarkItem {
  children: TreeNode[]
  isFolder: boolean
}

const props = defineProps<{
  node: TreeNode
  expandedFolders: Set<string>
}>()

const emit = defineEmits<{
  toggle: [node: TreeNode]
  rename: [item: BookmarkItem]
  delete: [item: BookmarkItem]
  add: [node: TreeNode]
  open: [item: BookmarkItem]
  dragstart: [event: DragEvent, node: TreeNode]
  dragover: [event: DragEvent, node: TreeNode]
  drop: [event: DragEvent, node: TreeNode]
}>()

const { t } = useI18n()

const expanded = computed(() => props.expandedFolders.has(props.node.id))

function handleToggle() {
  if (!props.node.isFolder) return
  console.debug('[BookmarkNode] handleToggle: id', props.node.id)
  emit('toggle', props.node)
}

function handleOpen() {
  console.debug('[BookmarkNode] handleOpen: id url', props.node.id, props.node.url)
  emit('open', props.node)
}
</script>

<style scoped>
.bookmark-node {
  list-style: none;
}

/* 行内操作按钮：默认隐藏，hover 整行时显示（与历史页一致） */
.bookmark-row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.bookmark-row:hover .bookmark-row-actions {
  opacity: 1;
}

.bookmark-node-content {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  min-width: 0;
}

.bookmark-node-icon {
  font-size: 14px;
  width: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.bookmark-icon-link {
  color: var(--color-primary, #4361ee);
}

.bookmark-icon-folder {
  font-size: 16px;
}

.bookmark-node-title {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}

.bookmark-node-url {
  font-size: 12px;
  color: var(--text-muted, #888);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-left: 8px;
  min-width: 0;
}

/* 子项缩进 */
.bookmark-children {
  list-style: none;
  padding: 0;
  margin: 0;
  padding-left: 24px;
}
</style>
