<template>
  <div class="bookmark-bar">
    <div
      ref="listRef"
      class="bookmark-list"
    >
      <div
        v-for="item in visibleItems"
        :key="item.id"
        class="bookmark-item"
        :draggable="true"
        @click="onClick(item)"
        @dragstart="onDragStart(item, $event)"
        @dragover="onDragOver(item, $event)"
        @drop="onDrop(item, $event)"
        @dragend="onDragEnd"
        @contextmenu.prevent="onContextMenu(item, $event)"
      >
        <img
          v-if="item.favicon"
          class="favicon"
          :src="item.favicon"
          :alt="item.title"
          draggable="false"
        />
        <Icon
          v-else
          :icon="item.url ? 'carbon:bookmark-filled' : 'carbon:folder'"
          width="16"
          height="16"
          class="item-icon"
        />
        <span class="label">{{ item.title }}</span>
      </div>
    </div>
    <button
      v-if="overflowItems.length > 0"
      class="overflow-btn"
      :title="t('bookmark.more')"
      @click="openOverflow"
    >
      <Icon
        icon="ic:round-keyboard-double-arrow-right"
        width="18"
        height="18"
      />
    </button>
  </div>
</template>

<script setup lang="ts">
import type { BookmarkItem } from '@browser/ipc-contract'
import { Icon } from '@iconify/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useBookmarks } from '../composables/useBookmarks'
import { useI18n } from '../composables/useI18n'
import { DropdownMenu } from '../lib/dropdown-menu'

const { t } = useI18n()
const { byParent, moveBookmark } = useBookmarks()

const topItems = computed<BookmarkItem[]>(() => byParent.value.get(null) ?? [])

const listRef = ref<HTMLElement | null>(null)
const visibleItems = ref<BookmarkItem[]>(topItems.value)
const overflowItems = ref<BookmarkItem[]>([])

let resizeObserver: ResizeObserver | null = null

/** 测量列表可用宽度与各书签项宽度，把放不下的项归入溢出区 */
function relayout(): void {
  const list = listRef.value
  if (!list) {
    return
  }
  console.debug('[BookmarkBar] relayout: topItems', topItems.value.length)
  const avail = list.clientWidth
  const children = Array.from(list.children) as HTMLElement[]
  let used = 0
  const fit: BookmarkItem[] = []
  const over: BookmarkItem[] = []
  for (let i = 0; i < topItems.value.length; i++) {
    const el = children[i]
    const w = el ? el.offsetWidth : 120
    if (used + w <= avail || fit.length === 0) {
      fit.push(topItems.value[i])
      used += w
    }
    else {
      over.push(topItems.value[i])
    }
  }
  visibleItems.value = fit
  overflowItems.value = over
  console.debug('[BookmarkBar] relayout: visible overflow', fit.length, over.length)
}

const dragId = ref<string | null>(null)
const lastOpenFolderId = ref<string | null>(null)

async function getSetting(key: string): Promise<unknown> {
  return window.browserAPI.getSetting(key as never)
}

async function openBookmark(item: BookmarkItem): Promise<void> {
  console.debug('[BookmarkBar] openBookmark: id url', item.id, item.url)
  if (!item.url) {
    window.browserAPI.openBookmarkFolder?.(item.id)
    return
  }
  const openInNewTab = Boolean(await getSetting('openBookmarkInNewTab'))
  if (openInNewTab) {
    window.browserAPI.createTab({ url: item.url as string })
  }
  else {
    window.browserAPI.loadURLCurrent(item.url as string)
  }
}

async function onClick(item: BookmarkItem): Promise<void> {
  console.debug('[BookmarkBar] onClick: id', item.id)
  await openBookmark(item)
}

function onContextMenu(item: BookmarkItem, event: MouseEvent): void {
  if (!item.url) {
    return
  }
  console.debug('[BookmarkBar] onContextMenu: id', item.id)
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const menu = new DropdownMenu({
    mode: 'bounded',
    anchor: {
      type: 'rect',
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      placement: 'bottom-start',
    },
    descriptor: {
      id: `bookmark-bar-${item.id}`,
      items: [
        { id: 'open-new', label: '在新标签页打开', icon: 'ic:round-open-in-new' },
        { id: 'delete', label: '删除', icon: 'ic:round-delete', danger: true },
      ],
    },
    onAction: ({ menu: action }) => {
      if (action.id === 'open-new') {
        window.browserAPI.createTab({ url: item.url as string })
      }
      else if (action.id === 'delete') {
        void window.browserAPI.deleteBookmark(item.id)
      }
    },
  })
  void menu
}

function openOverflow(event: MouseEvent): void {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const menu = new DropdownMenu({
    mode: 'bounded',
    anchor: {
      type: 'rect',
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      placement: 'bottom-end',
    },
    descriptor: {
      id: 'bookmark-bar-overflow',
      items: overflowItems.value.map(it => ({
        id: `overflow-${it.id}`,
        label: it.title,
        icon: it.url ? 'carbon:bookmark-filled' : 'carbon:folder',
      })),
    },
    onAction: ({ menu: action }) => {
      const id = action.id.replace('overflow-', '')
      const item = overflowItems.value.find(it => it.id === id)
      if (item) {
        void openBookmark(item)
      }
    },
  })
  void menu
}

function onDragStart(item: BookmarkItem, event: DragEvent): void {
  dragId.value = item.id
  console.debug('[BookmarkBar] onDragStart: id', item.id)
  window.browserAPI.dragBookmarkStart?.(item.id)
  event.dataTransfer?.setData('text/plain', item.id)
}

function onDragOver(item: BookmarkItem, event: DragEvent): void {
  if (!item.url) {
    event.preventDefault()
    if (lastOpenFolderId.value !== item.id) {
      lastOpenFolderId.value = item.id
      window.browserAPI.openBookmarkFolder?.(item.id)
    }
  }
}

function onDrop(item: BookmarkItem, event: DragEvent): void {
  event.preventDefault()
  const id = dragId.value
  if (!id) {
    return
  }
  const siblings = (byParent.value.get(item.parentId) ?? []).filter(s => s.id !== id)
  const position = siblings.findIndex(s => s.id === item.id)
  const finalPosition = position < 0 ? siblings.length : position
  console.debug('[BookmarkBar] onDrop: dragId targetParentId position', id, item.parentId, finalPosition)
  void moveBookmark(id, item.parentId, finalPosition)
}

function onDragEnd(): void {
  console.debug('[BookmarkBar] onDragEnd: cleanup dragId', dragId.value)
  dragId.value = null
  lastOpenFolderId.value = null
  window.browserAPI.dragBookmarkDrop?.({ targetParentId: null, targetPosition: 0 })
}

onMounted(() => {
  console.debug('[BookmarkBar] onMounted: loading bookmarks')
  const { load } = useBookmarks()
  void load()
  void nextTick(() => {
    relayout()
    if (listRef.value) {
      resizeObserver = new ResizeObserver(() => relayout())
      resizeObserver.observe(listRef.value)
    }
  })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

// 书签变化时重新计算溢出
watch(topItems, () => nextTick(relayout), { deep: true })
</script>

<style scoped>
.bookmark-bar {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 36px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
  overflow: hidden;
  padding: 0 4px;
}

.bookmark-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  white-space: nowrap;
}

.bookmark-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  cursor: pointer;
  user-select: none;
  border-radius: 6px;
  flex-shrink: 0;
}

.bookmark-item:hover {
  background: var(--bg-hover);
}

.favicon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.item-icon {
  flex-shrink: 0;
}

.label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--text-primary);
}

.overflow-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  margin-left: 2px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
}

.overflow-btn:hover {
  background: var(--bg-hover);
}
</style>
