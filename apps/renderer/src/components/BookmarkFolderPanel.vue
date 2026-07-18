<template>
  <div class="folder-panel">
    <div
      v-for="item in children"
      :key="item.id"
      class="folder-item"
      :class="{ dragging: dragId === item.id }"
      :draggable="true"
      @dragstart="onDragStart(item, $event)"
      @dragover.prevent="onDragOver(item, $event)"
      @dragenter.prevent="onDragOver(item, $event)"
      @drop.prevent="onDrop(item, $event)"
      @dragend="onDragEnd"
      @click="onClick(item)"
    >
      <Icon v-if="item.url" icon="ic:round-bookmark" :width="16" :height="16" class="item-icon" />
      <Icon v-else icon="ic:round-folder" :width="16" :height="16" class="item-icon" />
      <span class="item-title">{{ item.title }}</span>
    </div>
    <div v-if="children.length === 0" class="empty">
      空文件夹
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BookmarkItem } from '@browser/ipc-contract'
import { Icon } from '@iconify/vue'
import { computed, onMounted, ref } from 'vue'
import { useBookmarks } from '../composables/useBookmarks'

const props = defineProps<{ popoverId: string; folderId: string }>()

const { byParent, load } = useBookmarks()
const children = computed<BookmarkItem[]>(() => byParent.value.get(props.folderId) ?? [])

const dragId = ref<string | null>(null)

onMounted(() => {
  console.debug('[BookmarkFolderPanel] onMounted: loading bookmarks folderId', props.folderId)
  // popover 渲染进程内 useBookmarks 是独立实例，需主动拉取全量
  void load()
})

async function getSetting(key: string): Promise<unknown> {
  return window.browserAPI.getSetting(key as never)
}

function onClick(item: BookmarkItem): void {
  if (!item.url) return
  console.debug('[BookmarkFolderPanel] onClick: id url', item.id, item.url)
  void (async () => {
    const openNew = Boolean(await getSetting('openBookmarkInNewTab'))
    if (openNew) window.browserAPI.createTab({ url: item.url! })
    else window.browserAPI.loadURLCurrent(item.url!)
  })()
}

function onDragStart(item: BookmarkItem, event: DragEvent): void {
  dragId.value = item.id
  console.debug('[BookmarkFolderPanel] dragstart: id', item.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  window.browserAPI.dragBookmarkStart?.(item.id)
}

function onDragOver(item: BookmarkItem, event: DragEvent): void {
  if (!dragId.value || dragId.value === item.id) return
  console.debug('[BookmarkFolderPanel] dragover: targetId', item.id)
  // 文件夹项与书签项均为放置目标：文件夹项放置后成为其子项
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

async function onDrop(item: BookmarkItem, _event: DragEvent): Promise<void> {
  const id = dragId.value ?? (await window.browserAPI.getDragBookmarkId?.()) ?? null
  if (!id || id === item.id) {
    console.debug('[BookmarkFolderPanel] drop: ignored id targetId', id, item.id)
    return
  }
  console.debug('[BookmarkFolderPanel] drop: id targetId', id, item.id)
  // 目标父级：文件夹项 → 其自身 id（成为子项）；书签项 → 与书签同级的父级
  const targetParentId = item.url ? item.parentId : item.id
  const siblings = (byParent.value.get(targetParentId) ?? []).filter((x) => x.id !== id)
  const idx = siblings.findIndex((x) => x.id === item.id)
  const position = idx < 0 ? siblings.length : idx
  await window.browserAPI.dragBookmarkDrop?.({ targetParentId, targetPosition: position })
  dragId.value = null
}

function onDragEnd(): void {
  dragId.value = null
}
</script>

<style scoped>
.folder-panel {
  padding: 4px;
  min-width: 200px;
  max-height: 380px;
  overflow-y: auto;
  color: var(--text-primary);
  font-size: 13px;
}
.folder-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
}
.folder-item:hover {
  background: var(--bg-hover);
}
.folder-item.dragging {
  opacity: 0.4;
}
.item-icon {
  flex-shrink: 0;
  color: var(--text-secondary);
}
.item-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empty {
  padding: 8px;
  color: var(--text-muted);
  font-size: 12px;
}
</style>
