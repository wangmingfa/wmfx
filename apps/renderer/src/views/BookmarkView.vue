<template>
  <PageLayout
    v-model:search="searchQuery"
    :title="t('bookmark.title')"
    icon="mdi:bookmark-outline"
    :search-placeholder="t('bookmark.searchPlaceholder')"
  >
    <template #actions>
      <button class="btn btn-sm" @click="handleImport">
        {{ t('bookmark.import') }}
      </button>
      <button class="btn btn-sm" @click="handleExport">
        {{ t('bookmark.export') }}
      </button>
      <button class="btn btn-sm btn-primary" @click="handleAddBookmark">
        {{ t('bookmark.add') }}
      </button>
    </template>

    <div v-if="treeNodes.length === 0" class="bookmark-empty">
      <p>{{ t('bookmark.empty') }}</p>
    </div>

    <ul v-else class="bookmark-tree">
      <BookmarkNode
        v-for="node in treeNodes"
        :key="node.id"
        :node="node"
        :expanded-folders="expandedFolders"
        @toggle="handleToggle"
        @rename="handleRename"
        @delete="handleDelete"
        @add="handleAddChild"
        @open="handleOpenBookmark"
        @contextmenu="handleContextMenu"
      />
    </ul>

    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{
        position: 'fixed',
        top: `${contextMenu.y}px`,
        left: `${contextMenu.x}px`,
      }"
      @mousedown.prevent
    >
      <ul>
        <li @click="contextAddBookmark">
          {{ t('bookmark.addBookmark') }}
        </li>
        <li v-if="contextMenu.item && !contextMenu.item.url" @click="contextAddChild">
          {{ t('bookmark.addSubfolder') }}
        </li>
        <li v-if="contextMenu.item" @click="contextRename">
          {{ t('bookmark.rename') }}
        </li>
        <li v-if="contextMenu.item" @click="contextDelete">
          {{ t('bookmark.delete') }}
        </li>
      </ul>
    </div>
  </PageLayout>
</template>

<script setup lang="ts">
import type { BookmarkCreateOptions, BookmarkItem } from '@browser/ipc-contract'

import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import PageLayout from '@/components/PageLayout.vue'
import { useI18n } from '@/composables/useI18n'
import BookmarkNode from './BookmarkNode.vue'

const bookmarks = ref<BookmarkItem[]>([])
const searchQuery = ref('')
const searchTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const expandedFolders = ref<Set<string>>(new Set())

const { t } = useI18n()

const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  item: null as BookmarkItem | null,
})

interface TreeNode extends BookmarkItem {
  children: TreeNode[]
  isFolder: boolean
}

const treeNodes = computed<TreeNode[]>(() => buildTree(bookmarks.value))

function buildTree(items: BookmarkItem[]): TreeNode[] {
  const itemMap = new Map<string, TreeNode>()
  const roots: TreeNode[] = []

  for (const item of items) {
    const node: TreeNode = {
      ...item,
      children: [],
      isFolder: !item.url,
    }
    itemMap.set(item.id, node)
  }

  for (const node of itemMap.values()) {
    if (node.parentId === null) {
      roots.push(node)
    } else {
      const parent = itemMap.get(node.parentId)
      if (parent) {
        parent.children.push(node)
      }
    }
  }

  roots.sort((a, b) => a.position - b.position)
  for (const node of itemMap.values()) {
    node.children.sort((a, b) => a.position - b.position)
  }

  return roots
}

async function loadBookmarks() {
  bookmarks.value = await window.browserAPI.getBookmarks(null)
}

function handleToggle(node: TreeNode) {
  if (!node.isFolder) return
  const id = node.id
  if (expandedFolders.value.has(id)) {
    expandedFolders.value.delete(id)
  } else {
    expandedFolders.value.add(id)
  }
}

async function handleAddBookmark() {
  // eslint-disable-next-line no-alert
  const title = prompt(t('bookmark.promptTitle'))
  if (!title) return
  // eslint-disable-next-line no-alert
  const url = prompt(t('bookmark.promptUrl')) || null
  await window.browserAPI.addBookmark({ title, url })
  await loadBookmarks()
}

async function handleAddChild(parentNode: TreeNode | BookmarkItem) {
  // eslint-disable-next-line no-alert
  const title = prompt(t('bookmark.promptTitle'))
  if (!title) return
  // eslint-disable-next-line no-alert
  const url = prompt(t('bookmark.promptUrl')) || null
  const options: BookmarkCreateOptions = {
    title,
    url,
    parentId: parentNode.id,
  }
  await window.browserAPI.addBookmark(options)
  await loadBookmarks()
  const isTreeNode = (parentNode as any).children
  if (isTreeNode && !expandedFolders.value.has(parentNode.id)) {
    expandedFolders.value.add(parentNode.id)
  }
}

async function handleRename(item: BookmarkItem) {
  // eslint-disable-next-line no-alert
  const newTitle = prompt(t('bookmark.promptNewTitle'), item.title)
  if (!newTitle) return
  await window.browserAPI.renameBookmark({ id: item.id, title: newTitle })
  await loadBookmarks()
}

async function handleDelete(item: BookmarkItem) {
  const confirmMsg = t('bookmark.deleteConfirm').replace('{title}', JSON.stringify(item.title))
  // eslint-disable-next-line no-alert
  if (!confirm(confirmMsg)) return
  await window.browserAPI.deleteBookmark(item.id)
  await loadBookmarks()
}

async function handleOpenBookmark(item: BookmarkItem) {
  if (item.url) {
    await window.browserAPI.createTab({ url: item.url })
  }
}

function contextAddBookmark() {
  hideContextMenu()
  handleAddBookmark()
}

function contextAddChild() {
  if (!contextMenu.value.item) return
  hideContextMenu()
  handleAddChild(contextMenu.value.item)
}

function contextRename() {
  if (!contextMenu.value.item) return
  hideContextMenu()
  handleRename(contextMenu.value.item)
}

function contextDelete() {
  if (!contextMenu.value.item) return
  hideContextMenu()
  handleDelete(contextMenu.value.item)
}

function debouncedSearch() {
  if (searchTimer.value) {
    clearTimeout(searchTimer.value)
  }
  searchTimer.value = setTimeout(async () => {
    if (searchQuery.value.trim()) {
      bookmarks.value = await window.browserAPI.searchBookmarks({ query: searchQuery.value })
    } else {
      await loadBookmarks()
    }
  }, 300)
}

watch(searchQuery, debouncedSearch)

async function handleImport() {
  const picker = (window as any).showOpenFilePicker as ((opts: any) => Promise<unknown[]>) | undefined
  if (!picker) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.html'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (file) {
        const html = await file.text()
        await window.browserAPI.importBookmarks(html)
        await loadBookmarks()
      }
    }
    input.click()
    return
  }
  const result = await picker({
    types: [{ description: 'HTML Files', accept: { 'text/html': ['.html'] } }],
  })
  const fileHandle = (result as unknown as any[])[0]
  const file = await fileHandle.getFile()
  const html = await file.text()
  await window.browserAPI.importBookmarks(html)
  await loadBookmarks()
}

async function handleExport() {
  const { html } = await window.browserAPI.exportBookmarks()
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'bookmarks.html'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function hideContextMenu() {
  contextMenu.value.visible = false
  contextMenu.value.item = null
}

function handleContextMenu(event: MouseEvent, item: BookmarkItem) {
  contextMenu.value.visible = true
  contextMenu.value.x = event.clientX
  contextMenu.value.y = event.clientY
  contextMenu.value.item = item
}

const hideContextMenuRef = () => hideContextMenu()

onMounted(async () => {
  await loadBookmarks()
  document.addEventListener('click', hideContextMenuRef)
})

onUnmounted(() => {
  document.removeEventListener('click', hideContextMenuRef)
  if (searchTimer.value) {
    clearTimeout(searchTimer.value)
  }
})
</script>

<style scoped>
.bookmark-empty {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
  color: var(--text-muted, #888);
  font-size: 15px;
}

.bookmark-tree {
  list-style: none;
  padding: 0;
  margin: 0;
}

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

.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: var(--bg-secondary, #16213e);
  color: var(--text-primary, #e0e0e0);
  border: 1px solid var(--border-color, #333);
  transition: opacity 0.2s;
}

.btn-sm:hover {
  opacity: 0.8;
}

.btn-primary {
  background: var(--color-primary, #4361ee);
  border-color: var(--color-primary, #4361ee);
  color: #fff;
}

.context-menu {
  z-index: 1000;
  min-width: 180px;
  background: var(--bg-secondary, #16213e);
  border: 1px solid var(--border-color, #333);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.context-menu ul {
  list-style: none;
  padding: 4px 0;
  margin: 0;
}

.context-menu li {
  padding: 8px 16px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-primary, #e0e0e0);
}

.context-menu li:hover {
  background: var(--bg-tertiary, #0f3460);
}
</style>
