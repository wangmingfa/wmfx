<template>
  <PageLayout
    v-model:search="searchQuery"
    :title="`${t('history.title')} (${historyItems.length})`"
    icon="mdi:history"
    :search-placeholder="t('history.placeholder')"
  >
    <template #actions>
      <button
        class="btn btn-sm"
        @click="handleClear"
      >
        {{ t('history.clear') }}
      </button>
    </template>

    <div
      v-if="historyItems.length === 0"
      class="history-empty"
    >
      <p>{{ t('history.empty') }}</p>
    </div>
    <template v-else>
      <Section
        v-for="group in groupedItems"
        :key="group.label"
        :title="group.label"
      >
        <SectionItem
          v-for="item in group.items"
          :key="item.id"
          class="history-row"
          @click="openInNewTab(item)"
        >
          <template #label>
            <div class="history-content">
              <div class="history-item-icon">
                <Favicon
                  :url="item.url"
                  :favicon="item.favicon"
                  :size="24"
                />
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
            </div>
          </template>
          <IconButton
            icon="mdi:delete-outline"
            :btn-size="28"
            danger
            :tooltip="t('history.contextDelete')"
            class="history-delete-btn"
            @click.stop="deleteItem(item)"
          />
        </SectionItem>
      </Section>
    </template>
  </PageLayout>
</template>

<script setup lang="ts">
import type { HistoryItem } from '@browser/ipc-contract'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import Favicon from '@/components/Favicon.vue'
import PageLayout from '@/components/PageLayout.vue'
import Section from '@/components/Section.vue'
import SectionItem from '@/components/SectionItem.vue'
import IconButton from '@/components/ui/IconButton.vue'
import { useConfirm } from '@/composables/useConfirm'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
const { confirm } = useConfirm()

const historyItems = ref<HistoryItem[]>([])
const searchQuery = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null

async function loadHistory() {
  console.debug('[History] loadHistory')
  historyItems.value = await window.browserAPI.getAllHistory()
}

function debouncedSearch() {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
  searchTimer = setTimeout(async () => {
    console.debug('[History] debouncedSearch: query', searchQuery.value)
    if (searchQuery.value.trim()) {
      historyItems.value = await window.browserAPI.searchHistory({ query: searchQuery.value })
    } else {
      await loadHistory()
    }
  }, 300)
}
watch(searchQuery, debouncedSearch)

async function handleClear() {
  const ok = await confirm({
    title: t('history.clearTitle'),
    content: t('history.clearConfirm'),
    positiveText: t('history.clearPositive'),
    negativeText: t('history.clearNegative'),
  })
  if (!ok) {
    return
  }
  console.debug('[History] handleClear: 清空历史')
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
  if (diffMins < 1) {
    return 'just now'
  }
  if (diffMins < 60) {
    return `${diffMins}m ago`
  }
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) {
    return `${diffHours}h ago`
  }
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) {
    return `${diffDays}d ago`
  }
  return date.toLocaleDateString()
}

function getDateGroup(visitTime: number): 'today' | 'yesterday' | 'thisWeek' | 'earlier' {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (visitTime >= startOfToday.getTime()) {
    return 'today'
  }
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000)
  if (visitTime >= startOfYesterday.getTime()) {
    return 'yesterday'
  }
  const dayOfWeek = now.getDay() || 7
  const startOfWeek = new Date(startOfToday.getTime() - (dayOfWeek - 1) * 86400000)
  if (visitTime >= startOfWeek.getTime()) {
    return 'thisWeek'
  }
  return 'earlier'
}

interface HistoryGroup {
  label: string
  items: HistoryItem[]
}

const groupedItems = computed<HistoryGroup[]>(() => {
  const groupOrder: Array<'today' | 'yesterday' | 'thisWeek' | 'earlier'> = [
    'today',
    'yesterday',
    'thisWeek',
    'earlier',
  ]
  const groupLabels: Record<string, string> = {
    today: t('history.today'),
    yesterday: t('history.yesterday'),
    thisWeek: t('history.thisWeek'),
    earlier: t('history.earlier'),
  }
  const buckets = new Map<string, HistoryItem[]>()
  for (const key of groupOrder) {
    buckets.set(key, [])
  }
  for (const item of historyItems.value) {
    buckets.get(getDateGroup(item.visitTime))!.push(item)
  }
  const result: HistoryGroup[] = []
  for (const key of groupOrder) {
    const items = buckets.get(key)!
    if (items.length > 0) {
      result.push({ label: groupLabels[key], items })
    }
  }
  return result
})

async function openInNewTab(item: HistoryItem) {
  console.debug('[History] openInNewTab: url', item.url)
  await window.browserAPI.createTab({ url: item.url })
}
async function deleteItem(item: HistoryItem) {
  console.debug('[History] deleteItem: id', item.id)
  await window.browserAPI.deleteHistory(item.id)
  await loadHistory()
}

onMounted(async () => {
  console.debug('[History] onMounted: 加载历史记录')
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
.history-content {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
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
  opacity: 0;
  transition: opacity 0.15s;
}
.history-row:hover .history-delete-btn {
  opacity: 1;
}
.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  background: var(--bg-secondary, #16213e);
  color: var(--text-primary, #e0e0e0);
  border: 1px solid var(--border-color, #333);
  border-radius: 4px;
  transition: opacity 0.2s;
}
.btn-sm:hover {
  opacity: 0.8;
}
</style>
