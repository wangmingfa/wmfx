<template>
  <div
    class="find-bar"
    :class="{ visible: isVisible }"
  >
    <input
      ref="inputRef"
      v-model="searchText"
      class="find-input"
      :placeholder="t('find.placeholder')"
      @keydown.enter="findNext"
      @keydown.esc="close"
      @input="onInput"
    >
    <span class="find-counter">{{ matches > 0 ? `${activeMatch + 1}/${matches}` : '0/0' }}</span>
    <button
      class="find-btn"
      :disabled="matches === 0"
      @click="findPrevious"
    >
      <Icon
        icon="ic:round-keyboard-arrow-up"
        width="18"
        height="18"
      />
    </button>
    <button
      class="find-btn"
      :disabled="matches === 0"
      @click="findNext"
    >
      <Icon
        icon="ic:round-keyboard-arrow-down"
        width="18"
        height="18"
      />
    </button>
    <button
      class="find-btn close-btn"
      @click="close"
    >
      <Icon
        icon="ic:sharp-close"
        width="20"
        height="20"
      />
    </button>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'

const props = defineProps<{
  tabId: string
}>()

const { t } = useI18n()

const isVisible = ref(false)
const searchText = ref('')
const matches = ref(0)
const activeMatch = ref(-1)
const inputRef = ref<HTMLInputElement>()

function onInput(): void {
  const text = searchText.value
  if (text) {
    window.browserAPI.startFind({ tabId: props.tabId, searchText: text })
  }
  else {
    window.browserAPI.endFind(props.tabId)
  }
}

function findNext(): void {
  window.browserAPI.findNext({ tabId: props.tabId, forward: true })
}

function findPrevious(): void {
  window.browserAPI.findNext({ tabId: props.tabId, forward: false })
}

function close(): void {
  window.browserAPI.endFind(props.tabId)
  isVisible.value = false
  searchText.value = ''
  matches.value = 0
  activeMatch.value = -1
}

function open(): void {
  isVisible.value = true
  nextTick(() => {
    inputRef.value?.focus()
  })
}

function onFoundInPage(data: { matches: number, activeMatch: number, tabId: string }): void {
  if (data.tabId === props.tabId) {
    matches.value = data.matches
    activeMatch.value = data.activeMatch
  }
}

onMounted(() => {
  window.browserAPI.onFoundInPage(onFoundInPage)

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault()
      open()
    }
    else if (e.key === 'Escape' && isVisible.value) {
      e.preventDefault()
      close()
    }
  })
})

onUnmounted(() => {
  document.removeEventListener('keydown', () => {})
})
</script>

<style scoped>
.find-bar {
  position: absolute;
  top: 78px;
  right: 8px;
  width: 320px;
  height: 40px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity 0.2s, transform 0.2s;
  pointer-events: none;
}

.find-bar.visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.find-input {
  flex: 1;
  height: 28px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 0 10px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.find-input:focus {
  border-color: var(--accent-color);
}

.find-input::placeholder {
  color: var(--text-muted, #999);
}

.find-counter {
  font-size: 12px;
  color: var(--text-secondary);
  min-width: 40px;
  text-align: center;
}

.find-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  background: none;
  border: none;
  color: var(--text-primary);
  cursor: pointer;
  border-radius: 50%;
}

.find-btn:disabled {
  color: var(--text-muted, #999);
  cursor: default;
}

.find-btn:not(:disabled):hover {
  background: var(--bg-tertiary);
}

.close-btn {
  color: var(--text-secondary);
}

.close-btn:hover {
  color: var(--danger-color);
}
</style>
