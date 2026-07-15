<template>
  <div class="addressbar-panel">
    <input
      ref="inputRef"
      :value="data.query"
      class="addressbar-input"
      :placeholder="ADDRESS_BAR_PLACEHOLDER"
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
        <Icon v-if="item.type === 'history'" icon="carbon:time" width="14" height="14" />
        <Icon v-else-if="item.type === 'bookmark'" icon="carbon:bookmark-filled" width="14" height="14" />
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

const props = defineProps<{
  popoverId: string
  data: { query: string; suggestions: AutocompleteSuggestion[] }
}>()

const emit = defineEmits<{
  event: [eventName: string, eventData?: unknown]
}>()

const inputRef = ref<HTMLInputElement>()
const activeIndex = ref(-1)

onMounted(() => {
  // 延迟到下一帧，确保面板 WebContentsView 已获得焦点（主进程 renderTop 中 webContents.focus）
  requestAnimationFrame(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
  })
})

watch(
  () => props.data.suggestions,
  () => {
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
      onSelect(suggestions[activeIndex.value].url)
    } else {
      emit('event', 'navigate', props.data.query)
    }
  } else if (e.key === 'Escape') {
    emit('event', 'close')
  }
}

function onSelect(url: string): void {
  emit('event', 'select', url)
}
</script>

<style scoped>
.addressbar-panel {
  padding: 0;
  min-width: 300px;
}

.addressbar-input {
  width: 100%;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 0 76px 0 12px;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 28px;
  outline: none;
  box-sizing: border-box;
}

.addressbar-input:focus {
  outline: none;
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
