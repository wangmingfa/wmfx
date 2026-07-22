<template>
  <PageLayout
    v-model:search="searchQuery"
    :title="t('bookmark.title')"
    icon="mdi:bookmark-outline"
    :search-placeholder="t('bookmark.searchPlaceholder')"
  >
    <template #actions>
      <button
        class="btn btn-sm"
        @click="handleImport"
      >
        {{ t('bookmark.import') }}
      </button>
      <button
        class="btn btn-sm"
        @click="handleExport"
      >
        {{ t('bookmark.export') }}
      </button>
      <button
        class="btn btn-sm btn-primary"
        @click="handleAddBookmark"
      >
        {{ t('bookmark.add') }}
      </button>
    </template>

    <div
      v-if="treeNodes.length === 0"
      class="bookmark-empty"
    >
      <p>{{ t('bookmark.empty') }}</p>
    </div>

    <Section v-else>
      <ul class="bookmark-tree">
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
          @dragstart="handleDragStart"
          @dragover="handleDragOver"
          @drop="handleDrop"
        />
      </ul>
    </Section>
  </PageLayout>
</template>

<script setup lang="ts">
import type { BookmarkCreateOptions, BookmarkItem } from '@browser/ipc-contract'

import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import PageLayout from '@/components/PageLayout.vue'
import Section from '@/components/Section.vue'
import { useBookmarks } from '@/composables/useBookmarks'
import { useConfirm } from '@/composables/useConfirm'
import { useI18n } from '@/composables/useI18n'
import BookmarkNode from './BookmarkNode.vue'

const searchQuery = ref('')
const searchTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const expandedFolders = ref<Set<string>>(new Set())

const { t } = useI18n()
const { confirm, prompt, promptForm } = useConfirm()
const { bookmarks, moveBookmark, load } = useBookmarks()

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

function handleToggle(node: TreeNode) {
  if (!node.isFolder) {
    return
  }
  const id = node.id
  console.debug('[BookmarkView] handleToggle: id', id)
  if (expandedFolders.value.has(id)) {
    expandedFolders.value.delete(id)
  } else {
    expandedFolders.value.add(id)
  }
}

async function handleAddBookmark() {
  const result = await promptForm({
    title: t('bookmark.addBookmark'),
    positiveText: t('bookmark.confirmOk'),
    negativeText: t('bookmark.cancel'),
    fields: [
      { key: 'title', label: t('bookmark.labelTitle'), placeholder: t('bookmark.promptTitle'), required: true },
      { key: 'url', label: t('bookmark.labelUrl'), placeholder: t('bookmark.promptUrl') },
    ],
  })
  if (!result) {
    return
  }
  const url = result.url || null
  console.debug('[BookmarkView] handleAddBookmark: title url', result.title, url)
  await window.browserAPI.addBookmark({ title: result.title, url })
  await load()
}

async function handleAddChild(parentNode: TreeNode | BookmarkItem) {
  const result = await promptForm({
    title: t('bookmark.addSubfolder'),
    positiveText: t('bookmark.confirmOk'),
    negativeText: t('bookmark.cancel'),
    fields: [
      { key: 'title', label: t('bookmark.labelTitle'), placeholder: t('bookmark.promptTitle'), required: true },
      { key: 'url', label: t('bookmark.labelUrl'), placeholder: t('bookmark.promptUrl') },
    ],
  })
  if (!result) {
    return
  }
  const options: BookmarkCreateOptions = {
    title: result.title,
    url: result.url || null,
    parentId: parentNode.id,
  }
  console.debug('[BookmarkView] handleAddChild: parentId title', parentNode.id, result.title)
  await window.browserAPI.addBookmark(options)
  await load()
  const isTreeNode = 'children' in parentNode
  if (isTreeNode && !expandedFolders.value.has(parentNode.id)) {
    expandedFolders.value.add(parentNode.id)
  }
}

async function handleRename(item: BookmarkItem) {
  const newTitle = await prompt({
    title: t('bookmark.rename'),
    positiveText: t('bookmark.confirmOk'),
    negativeText: t('bookmark.cancel'),
    label: t('bookmark.labelTitle'),
    placeholder: t('bookmark.promptNewTitle'),
    defaultValue: item.title,
  })
  if (!newTitle) {
    return
  }
  console.debug('[BookmarkView] handleRename: id newTitle', item.id, newTitle)
  await window.browserAPI.renameBookmark({ id: item.id, title: newTitle })
  await load()
}

async function handleDelete(item: BookmarkItem) {
  const ok = await confirm({
    title: t('bookmark.deleteTitle'),
    content: t('bookmark.deleteConfirm', { title: item.title }),
    positiveText: t('bookmark.delete'),
    negativeText: t('bookmark.cancel'),
  })
  if (!ok) {
    return
  }
  console.debug('[BookmarkView] handleDelete: id', item.id)
  await window.browserAPI.deleteBookmark(item.id)
  await load()
}

async function handleOpenBookmark(item: BookmarkItem) {
  if (item.url) {
    console.debug('[BookmarkView] handleOpenBookmark: url', item.url)
    await window.browserAPI.createTab({ url: item.url })
  }
}

const dragId = ref<string | null>(null)

function handleDragStart(event: DragEvent, node: TreeNode) {
  dragId.value = node.id
  console.debug('[BookmarkView] dragstart: id isFolder', node.id, node.isFolder)
  event.dataTransfer?.setData('text/plain', node.id)
}

function handleDragOver(event: DragEvent, _node: TreeNode) {
  event.preventDefault()
}

async function handleDrop(event: DragEvent, node: TreeNode) {
  event.preventDefault()
  const id = dragId.value
  dragId.value = null
  if (!id || id === node.id) {
    console.debug('[BookmarkView] drop: 忽略无效拖放 id', id)
    return
  }
  // 两层分类：拖到文件夹则归到该文件夹下，拖到书签则归到其同级
  const targetParentId = node.isFolder ? node.id : node.parentId
  // 计算目标兄弟列表时排除被拖拽项自身（其在重插入前会被移除），避免索引偏移
  const siblings = bookmarks.value.filter(s => s.parentId === targetParentId && s.id !== id)
  // 在过滤后的列表中查找落点目标节点，插入到其之前（drop-before 语义）
  const targetIndex = siblings.findIndex(s => s.id === node.id)
  const finalPosition = targetIndex < 0 ? siblings.length : targetIndex
  console.debug('[BookmarkView] drop: dragId targetParentId position', id, targetParentId, finalPosition)
  await moveBookmark(id, targetParentId, finalPosition)
  await load()
}

function debouncedSearch() {
  if (searchTimer.value) {
    clearTimeout(searchTimer.value)
  }
  searchTimer.value = setTimeout(async () => {
    console.debug('[BookmarkView] debouncedSearch: query', searchQuery.value)
    if (searchQuery.value.trim()) {
      bookmarks.value = await window.browserAPI.searchBookmarks({ query: searchQuery.value })
    } else {
      await load()
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
        await load()
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
  await load()
}

async function handleExport() {
  console.debug('[BookmarkView] handleExport: 导出书签')
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

onMounted(async () => {
  console.debug('[BookmarkView] onMounted: 加载书签')
  await load()
})

onUnmounted(() => {
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
</style>
