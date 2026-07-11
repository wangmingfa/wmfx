<template>
  <div class="history-view">
    <div class="history-header">
      <h2>History</h2>
      <span class="history-count">{{ historyItems.length }}</span>
    </div>

    <div class="history-search">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search history..."
        @input="debouncedSearch"
      >
    </div>

    <div
      v-if="historyItems.length === 0"
      class="history-empty"
    >
      <p>No history</p>
    </div>

    <ul
      v-else
      class="history-list"
    >
      <li
        v-for="item in historyItems"
        :key="item.id"
        class="history-item"
        @contextmenu.prevent="showContextMenu($event, item)"
      >
        <div class="history-item-icon">
          <img
            v-if="item.favicon"
            :src="item.favicon"
            :alt="item.title || item.url"
            class="history-favicon"
            @error="handleFaviconError"
          >
          <div
            v-else
            class="history-favicon-placeholder"
          >
            {{ getDomain(item.url) }}
          </div>
        </div>

        <div class="history-item-info">
          <div class="history-item-title">
            {{ item.title || getDomain(item.url) }}
          </div>
          <div class="history-item-url">
            {{ item.url }}
          </div>
          <div class="history-item-meta">
            <span>{{ formatVisitTime(item.visitTime) }}</span>
            <span class="visit-count">{{ item.visitCount }} visits</span>
          </div>
        </div>
      </li>
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
        <li @click="openInNewTab">
          在新标签页打开
        </li>
        <li @click="deleteItem">
          删除
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HistoryItem } from '@browser/ipc-contract'

import { onMounted, onUnmounted, ref } from 'vue'

const historyItems = ref<HistoryItem[]>([])
const searchQuery = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null

const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  item: null as HistoryItem | null,
})

async function loadHistory() {
  historyItems.value = await window.browserAPI.getHistoryList()
}

function showContextMenu(event: MouseEvent, item: HistoryItem) {
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    item,
  }
}

function hideContextMenu() {
  contextMenu.value.visible = false
  contextMenu.value.item = null
}

function debouncedSearch() {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
  searchTimer = setTimeout(async () => {
    if (searchQuery.value.trim()) {
      historyItems.value = await window.browserAPI.searchHistory({ query: searchQuery.value })
    }
    else {
      await loadHistory()
    }
  }, 300)
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname
  }
  catch {
    return url
  }
}

function formatVisitTime(visitTime: number): string {
  const date = new Date(visitTime)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1)
    return 'just now'
  if (diffMins < 60)
    return `${diffMins}m ago`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24)
    return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7)
    return `${diffDays}d ago`

  return date.toLocaleDateString()
}

function handleFaviconError(event: Event) {
  const img = event.target as HTMLImageElement
  img.style.display = 'none'
}

async function openInNewTab() {
  if (!contextMenu.value.item)
    return
  await window.browserAPI.createTab({ url: contextMenu.value.item.url })
  hideContextMenu()
}

async function deleteItem() {
  if (!contextMenu.value.item)
    return
  await window.browserAPI.deleteHistory(contextMenu.value.item.id)
  hideContextMenu()
  await loadHistory()
}

const hideContextMenuRef = () => hideContextMenu()

onMounted(async () => {
  await loadHistory()
  document.addEventListener('click', hideContextMenuRef)
})

onUnmounted(() => {
  document.removeEventListener('click', hideContextMenuRef)
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
})
</script>

<style scoped>
.history-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  background: var(--bg-primary, #1a1a2e);
  color: var(--text-primary, #e0e0e0);
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.history-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.history-count {
  font-size: 13px;
  color: var(--text-muted, #888);
}

.history-search {
  margin-bottom: 16px;
}

.history-search input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-color, #333);
  border-radius: 6px;
  background: var(--bg-secondary, #16213e);
  color: var(--text-primary, #e0e0e0);
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.history-search input::placeholder {
  color: var(--text-muted, #888);
}

.history-search input:focus {
  border-color: var(--color-primary, #4361ee);
}

.history-empty {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
  color: var(--text-muted, #888);
  font-size: 15px;
}

.history-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border-color, #333);
  border-radius: 8px;
  background: var(--bg-secondary, #16213e);
  cursor: context-menu;
}

.history-item-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.history-favicon {
  width: 16px;
  height: 16px;
  border-radius: 2px;
}

.history-favicon-placeholder {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: var(--color-primary, #4361ee);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.history-item-info {
  flex: 1;
  min-width: 0;
}

.history-item-title {
  font-weight: 500;
  font-size: 14px;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-item-url {
  font-size: 12px;
  color: var(--text-muted, #888);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-muted, #888);
  margin-top: 2px;
}

.visit-count {
  color: var(--color-primary, #4361ee);
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
