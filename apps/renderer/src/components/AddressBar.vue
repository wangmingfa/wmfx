<template>
  <div class="address-bar">
    <IconButton
      icon="ic:round-arrow-back"
      :disabled="!canGoBack"
      @click="goBack"
    />
    <IconButton
      icon="ic:round-arrow-forward"
      :disabled="!canGoForward"
      @click="goForward"
    />
    <IconButton
      :icon="isLoading ? 'ic:round-close' : 'ic:round-refresh'"
      @click="isLoading ? stop() : reload()"
    />
    <IconButton
      icon="ic:round-home"
      @click="goHome"
    />
    <IconButton
      icon="ic:round-print"
      @click="printPage"
    />
    <div class="url-input-wrap">
      <input
        ref="inputRef"
        v-model="urlInput"
        class="url-input"
        placeholder="Enter URL"
        @focus="onFocus"
        @blur="onBlur"
        @keydown.enter="navigate"
      >
      <div class="url-input-actions">
        <button
          class="zoom-display"
          @click="cycleZoom"
        >
          {{ currentZoomLevel }}
        </button>
        <button
          class="bookmark-btn"
          :class="{ bookmarked: isBookmarked }"
          @click="toggleBookmark"
        >
          <Icon
            :icon="isBookmarked ? 'ic:round-star' : 'ic:round-star-outline'"
            :width="iconSize"
            :height="iconSize"
          />
        </button>
      </div>
    </div>
    <Autocomplete
      :query="urlInput"
      @select="onAutocompleteSelect"
      @close="onAutocompleteClose"
    />
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { onMounted, ref, watch } from 'vue'

import { useAddressBarFocus } from '../composables/useAddressBarFocus'
import Autocomplete from './Autocomplete.vue'
import IconButton from './ui/IconButton.vue'

const props = defineProps<{
  tabId: string
  url: string
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
}>()

const emit = defineEmits<{
  navigate: [url: string]
}>()

const iconSize = 18

const urlInput = ref('')
const inputRef = ref<HTMLInputElement>()
// 新开标签页时由创建方触发聚焦地址输入框
const focusNonce = useAddressBarFocus()
watch(focusNonce, () => {
  // 需要延迟确保组件已挂载且 input 已渲染到 DOM
  setTimeout(() => inputRef.value?.focus(), 50)
})
const isBookmarked = ref(false)

const ZOOM_LEVELS = [50, 75, 100, 125, 150]
const ZOOM_FACTORS = [0.5, 0.75, 1.0, 1.25, 1.5]
const currentZoomIndex = ref(2)
const currentZoomLevel = ref('100%')

function onFocus(): void {
  requestAnimationFrame(() => {
    inputRef.value?.select()
  })
}

function onBlur(): void {
  // window.getSelection()?.removeAllRanges()
}

watch(
  () => props.url,
  (newUrl) => {
    // 内部页面（如 wmfx://newtab）地址栏不显示内容
    if (newUrl.startsWith('wmfx://'))
      return
    if (newUrl !== urlInput.value) {
      urlInput.value = newUrl
    }
  },
)

function goBack(): void {
  window.browserAPI.goBack(props.tabId)
}

function goForward(): void {
  window.browserAPI.goForward(props.tabId)
}

function reload(): void {
  window.browserAPI.reload(props.tabId)
}

function stop(): void {
  window.browserAPI.stop(props.tabId)
}

async function goHome(): Promise<void> {
  const settings = await window.browserAPI.getAllSettings()
  window.browserAPI.loadURL(props.tabId, settings.newTabUrl)
}

function navigate(): void {
  const url = urlInput.value.trim()
  if (url) {
    inputRef.value!.blur()
    window.browserAPI.loadURL(props.tabId, url)
    emit('navigate', url)
  }
}

async function getZoomLevel(): Promise<number> {
  try {
    const response = await window.browserAPI.getZoom(props.tabId)
    const index = ZOOM_FACTORS.indexOf(response.factor)
    return index !== -1 ? index : 2
  }
  catch {
    return 2
  }
}

async function setZoom(factor: number): Promise<void> {
  await window.browserAPI.setZoom({ tabId: props.tabId, factor })
}

async function cycleZoom(): Promise<void> {
  currentZoomIndex.value = (currentZoomIndex.value + 1) % ZOOM_LEVELS.length
  currentZoomLevel.value = `${ZOOM_LEVELS[currentZoomIndex.value]}%`
  await setZoom(ZOOM_FACTORS[currentZoomIndex.value])
}

function printPage(): void {
  window.browserAPI.printPage({ tabId: props.tabId })
}

function onAutocompleteSelect(url: string): void {
  window.browserAPI.loadURL(props.tabId, url)
  emit('navigate', url)
}

function onAutocompleteClose(): void {
  // do nothing
}

async function syncBookmarkStatus(): Promise<void> {
  const url = props.url
  if (url && url.startsWith('http')) {
    const result = await window.browserAPI.isBookmarked(url)
    isBookmarked.value = result.isBookmarked
  }
  else {
    isBookmarked.value = false
  }
}

async function toggleBookmark(): Promise<void> {
  const url = props.url
  if (!url || !url.startsWith('http')) {
    return
  }

  if (isBookmarked.value) {
    const result = await window.browserAPI.isBookmarked(url)
    if (result.id) {
      await window.browserAPI.deleteBookmark(result.id)
    }
    isBookmarked.value = false
  }
  else {
    await window.browserAPI.addBookmark({
      title: url,
      url,
    })
    isBookmarked.value = true
  }
}

watch(
  () => props.url,
  () => {
    syncBookmarkStatus()
  },
)

onMounted(async () => {
  currentZoomIndex.value = await getZoomLevel()
  currentZoomLevel.value = `${ZOOM_LEVELS[currentZoomIndex.value]}%`
  await syncBookmarkStatus()
})
</script>

<style scoped>
.address-bar {
  position: relative;
  display: flex;
  align-items: center;
  height: 40px;
  background: var(--chrome-bg);
  border-bottom: 1px solid var(--border-color);
  padding: 0 8px;
  gap: 4px;
}

.url-input-wrap {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
}

.url-input {
  flex: 1;
  width: 100%;
  height: 28px;
  background: var(--url-input-bg);
  border: none;
  border-radius: 14px;
  padding: 0 76px 0 12px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.url-input::placeholder {
  color: var(--text-muted, #999);
}

.url-input-actions {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
}

.zoom-display {
  min-width: 44px;
  height: 22px;
  background: none;
  border: none;
  border-radius: 11px;
  padding: 0 8px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  outline: none;
}

.zoom-display:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.bookmark-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 50%;
}

.bookmark-btn:not(:disabled):hover {
  background: var(--bg-tertiary);
}

.bookmark-btn.bookmarked {
  color: #f5b041;
}
</style>
