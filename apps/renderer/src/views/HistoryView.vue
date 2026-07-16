<template>
  <PageLayout
    v-model:search="searchQuery"
    :title="`${t('history.title')} (${historyItems.length})`"
    icon="mdi:history"
    :search-placeholder="t('history.placeholder')"
  >
    <template #actions>
      <button class="btn btn-sm" @click="handleClear">
        {{ t('history.clear') }}
      </button>
    </template>

    <div v-if="historyItems.length === 0" class="history-empty">
      <p>{{ t('history.empty') }}</p>
    </div>

    <ul v-else class="history-list">
      <li v-for="item in historyItems" :key="item.id" class="history-item" @click="openInNewTab(item)">
        <div class="history-item-icon">
          <Favicon :url="item.url" :favicon="item.favicon" :size="24" />
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
            <span class="visit-count">{{ item.visitCount }}{{ t('history.visits') }}</span>
          </div>
        </div>

        <IconButton
          icon="mdi:delete-outline"
          :btn-size="28"
          :title="t('history.contextDelete')"
          class="history-delete-btn"
          @click.stop="deleteItem(item)"
        />
      </li>
    </ul>
  </PageLayout>
</template>

<script setup lang="ts">
import type { HistoryItem } from '@browser/ipc-contract'

import { onMounted, onUnmounted, ref, watch } from 'vue'
import Favicon from '@/components/Favicon.vue'
import PageLayout from '@/components/PageLayout.vue'
import IconButton from '@/components/ui/IconButton.vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

const historyItems = ref<HistoryItem[]>([])
const searchQuery = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null

async function loadHistory() {
  historyItems.value = await window.browserAPI.getHistoryList()
}

function debouncedSearch() {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
  searchTimer = setTimeout(async () => {
    if (searchQuery.value.trim()) {
      historyItems.value = await window.browserAPI.searchHistory({ query: searchQuery.value })
    } else {
      await loadHistory()
    }
  }, 300)
}

watch(searchQuery, debouncedSearch)

async function handleClear() {
  // eslint-disable-next-line no-alert
  if (!confirm(t('history.clearConfirm'))) return
  await window.browserAPI.clearHistory()
  await loadHistory()
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function formatVisitTime(visitTime: number): string {
  const date = new Date(visitTime)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString()
}

async function openInNewTab(item: HistoryItem) {
  await window.browserAPI.createTab({ url: item.url })
}

async function deleteItem(item: HistoryItem) {
  await window.browserAPI.deleteHistory(item.id)
  await loadHistory()
}

onMounted(async () => {
  await loadHistory()
})

onUnmounted(() => {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
})
</script>

<style scoped>
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
  cursor: pointer;
  transition: background 0.15s;
}

.history-item:hover {
  background: var(--bg-hover);
}

.history-item-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
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

.history-delete-btn {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;
}

.history-item:hover .history-delete-btn {
  opacity: 1;
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
</style>
