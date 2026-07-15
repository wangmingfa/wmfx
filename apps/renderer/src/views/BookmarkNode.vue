<template>
  <li class="bookmark-node" :class="{ 'bookmark-folder': node.isFolder, 'bookmark-item': !node.isFolder }">
    <div
      v-if="node.isFolder"
      class="bookmark-node-content"
      @click="handleToggle"
      @contextmenu.prevent="handleContextMenu"
    >
      <span class="bookmark-node-icon">{{ expanded ? '▾' : '▸' }}</span>
      <span class="bookmark-node-icon bookmark-icon-folder">📁</span>
      <span class="bookmark-node-title">{{ node.title }}</span>
    </div>

    <div v-else class="bookmark-node-content" @click="handleOpen" @contextmenu.prevent="handleContextMenu">
      <span class="bookmark-node-icon bookmark-icon-link">🔗</span>
      <span class="bookmark-node-title">{{ node.title }}</span>
      <span v-if="node.url" class="bookmark-node-url">{{ node.url }}</span>
    </div>

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
        @contextmenu="(e, item) => $emit('contextmenu', e, item)"
      />
    </ul>
  </li>
</template>

<script setup lang="ts">
import type { BookmarkItem } from '@browser/ipc-contract'

import { computed } from 'vue'

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
  contextmenu: [event: MouseEvent, item: BookmarkItem]
}>()

const expanded = computed(() => props.expandedFolders.has(props.node.id))

function handleToggle() {
  if (!props.node.isFolder) return
  emit('toggle', props.node)
}

function handleOpen() {
  emit('open', props.node)
}

function handleContextMenu(event: MouseEvent) {
  emit('contextmenu', event, props.node)
}
</script>

<style scoped>
.bookmark-node {
  list-style: none;
}

.bookmark-node-content {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 2px;
}

.bookmark-node-content:hover {
  background: var(--bg-tertiary, #0f3460);
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
}

.bookmark-node-url {
  font-size: 12px;
  color: var(--text-muted, #888);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-left: auto;
}

.bookmark-children {
  list-style: none;
  padding-left: 24px;
  margin: 0;
}
</style>
