<template>
  <div
    v-if="suggestions.length > 0 && isOpen"
    class="autocomplete"
  >
    <div
      v-for="(item, index) in suggestions"
      :key="item.url"
      class="autocomplete-item"
      :class="{ active: index === activeIndex }"
      @click="select(item.url)"
      @mouseenter="activeIndex = index"
    >
      <Icon
        v-if="item.type === 'history'"
        icon="carbon:time"
        width="14"
        height="14"
      />
      <Icon
        v-else-if="item.type === 'bookmark'"
        icon="carbon:bookmark-filled"
        width="14"
        height="14"
      />
      <Icon
        v-else
        icon="ic:round-search"
        width="14"
        height="14"
      />
      <span class="item-title">{{ item.title }}</span>
      <span class="item-url">{{ item.url }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { ref, watch } from 'vue'

const props = defineProps<{
  query: string
}>()

const emit = defineEmits<{
  select: [url: string]
  close: []
}>()

const suggestions = ref<{ type: 'history' | 'bookmark' | 'search', title: string, url: string }[]>([])
const isOpen = ref(false)
const activeIndex = ref(-1)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(() => props.query, async (newQuery) => {
  activeIndex.value = -1
  if (debounceTimer)
    clearTimeout(debounceTimer)
  if (!newQuery.trim()) {
    suggestions.value = []
    isOpen.value = false
    return
  }
  debounceTimer = setTimeout(async () => {
    suggestions.value = await window.browserAPI.getAutocompleteSuggestions({
      query: newQuery,
      limit: 6,
    })
    isOpen.value = suggestions.value.length > 0
  }, 200)
})

function select(url: string): void {
  emit('select', url)
  isOpen.value = false
  suggestions.value = []
}
</script>

<style scoped>
.autocomplete {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 999;
  max-height: 240px;
  overflow-y: auto;
}

.autocomplete-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
}

.autocomplete-item:hover,
.autocomplete-item.active {
  background: var(--bg-tertiary);
}

.item-title {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-url {
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}
</style>
