<template>
  <div class="addressbar-panel">
    <AddressInput
      ref="inputRef"
      :model-value="data.query"
      :placeholder="ADDRESS_BAR_PLACEHOLDER"
      :favicon="data.favicon"
      :security-state="data.securityState"
      :url="data.url"
      @input="onInput"
      @keydown="onKeydown"
    />
    <div v-if="data.suggestions?.length" class="addressbar-suggestions">
      <div
        v-for="(item, index) in data.suggestions"
        :key="item.url"
        class="addressbar-suggestion-item"
        :class="{ active: index === activeIndex }"
        @mousedown.prevent="onSelect(item.url)"
        @mouseenter="activeIndex = index"
      >
        <!-- history: 本地历史；bookmark: 本地书签；search: 地址栏"用X搜索"直达；engine: 搜索引擎实时建议 -->
        <Icon v-if="item.type === 'history'" icon="carbon:time" width="14" height="14" />
        <Icon v-else-if="item.type === 'bookmark'" icon="carbon:bookmark-filled" width="14" height="14" />
        <Icon v-else-if="item.type === 'engine'" icon="mdi:magnify" width="14" height="14" />
        <Icon v-else icon="ic:round-search" width="14" height="14" />
        <span class="suggestion-title">{{ item.title }}</span>
        <span class="suggestion-url">{{ item.url }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AutocompleteSuggestion } from '@browser/ipc-contract'
import { ADDRESS_BAR_PLACEHOLDER } from '@browser/shared'
import { Icon } from '@iconify/vue'
import { onMounted, ref, watch } from 'vue'
import AddressInput from '../components/AddressInput.vue'

const props = defineProps<{
  popoverId: string
  data: {
    query: string
    suggestions: AutocompleteSuggestion[]
    favicon?: string | null
    securityState?: 'secure' | 'insecure' | 'internal'
    url?: string
  }
}>()

const emit = defineEmits<{
  event: [eventName: string, eventData?: unknown]
}>()

const inputRef = ref<InstanceType<typeof AddressInput>>()
const activeIndex = ref(-1)

onMounted(() => {
  // 延迟到下一帧，确保面板 WebContentsView 已获得焦点（主进程 renderTop 中 webContents.focus）
  console.debug('[AddressBarSuggestions] onMounted: 聚焦输入框')
  requestAnimationFrame(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
  })
})

watch(
  () => props.data.suggestions,
  (suggestions) => {
    console.debug('[AddressBarSuggestions] watch suggestions: count', suggestions?.length ?? 0)
    activeIndex.value = -1
  },
)

function onInput(e: Event): void {
  const value = (e.target as HTMLInputElement).value
  emit('event', 'update-query', value)
}

function onKeydown(e: KeyboardEvent): void {
  const suggestions = props.data.suggestions ?? []
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, suggestions.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, -1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (activeIndex.value >= 0 && suggestions[activeIndex.value]) {
      console.debug('[AddressBarSuggestions] onKeydown: Enter 选中建议 url', suggestions[activeIndex.value].url)
      onSelect(suggestions[activeIndex.value].url)
    } else {
      // 用输入框本地值，而非 props.data.query：后者经主进程异步回传，
      // 快速回车时仍是旧值（可能为空），导致 navigate('') 无响应。
      const value = inputRef.value?.getValue() ?? props.data.query
      console.debug('[AddressBarSuggestions] onKeydown: Enter 直接导航 value', value)
      emit('event', 'navigate', value)
    }
  } else if (e.key === 'Escape') {
    emit('event', 'close')
  }
}

function onSelect(url: string): void {
  console.debug('[AddressBarSuggestions] onSelect: url', url)
  emit('event', 'select', url)
}
</script>

<style scoped>
.addressbar-panel {
  padding: 0;
  min-width: 300px;
}

.addressbar-suggestions {
  padding: 4px 0;
}

.addressbar-suggestion-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
}

.addressbar-suggestion-item:hover,
.addressbar-suggestion-item.active {
  background: var(--bg-tertiary);
}

.suggestion-title {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.suggestion-url {
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}
</style>
