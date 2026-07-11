<template>
  <div class="address-bar">
    <button
      class="nav-btn"
      :disabled="!canGoBack"
      @click="goBack"
    >
      <Icon
        icon="ic:round-arrow-back"
        :width="iconSize"
        :height="iconSize"
      />
    </button>
    <button
      class="nav-btn"
      :disabled="!canGoForward"
      @click="goForward"
    >
      <Icon
        icon="ic:round-arrow-forward"
        :width="iconSize"
        :height="iconSize"
      />
    </button>
    <button
      class="nav-btn"
      @click="isLoading ? stop : reload"
    >
      <Icon
        :icon="isLoading ? 'ic:round-close' : 'ic:round-refresh'"
        :width="iconSize"
        :height="iconSize"
      />
    </button>
    <button
      class="nav-btn"
      @click="goHome"
    >
      <Icon
        icon="ic:round-home"
        :width="iconSize"
        :height="iconSize"
      />
    </button>
    <button
      class="nav-btn"
      @click="printPage"
    >
      <Icon
        icon="ic:round-print"
        :width="iconSize"
        :height="iconSize"
      />
    </button>
    <input
      ref="inputRef"
      v-model="urlInput"
      class="url-input"
      placeholder="Enter URL"
      @focus="onFocus"
      @blur="onBlur"
      @keydown.enter="navigate"
    >
    <button
      class="zoom-display"
      @click="cycleZoom"
    >
      {{ currentZoomLevel }}%
    </button>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { onMounted, ref, watch } from 'vue'

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

const urlInput = ref(props.url)
const inputRef = ref<HTMLInputElement>()

const ZOOM_LEVELS = [50, 75, 100, 125, 150]
const ZOOM_FACTORS = [0.5, 0.75, 1.0, 1.25, 1.5]
const currentZoomIndex = ref(2)
const currentZoomLevel = ref('100%')

function onFocus(): void {
  console.warn('[AddressBar] focus')
  requestAnimationFrame(() => {
    inputRef.value?.select()
  })
  console.warn('[AddressBar] focus select')
}

function onBlur(): void {
  console.warn('[AddressBar] blur')
  // window.getSelection()?.removeAllRanges()
}

watch(
  () => props.url,
  (newUrl) => {
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

function goHome(): void {
  window.browserAPI.loadURL(props.tabId, 'https://www.google.com')
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

onMounted(async () => {
  currentZoomIndex.value = await getZoomLevel()
  currentZoomLevel.value = `${ZOOM_LEVELS[currentZoomIndex.value]}%`
})
</script>

<style scoped>
.address-bar {
  display: flex;
  align-items: center;
  height: 40px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  padding: 0 8px;
  gap: 4px;
}

.nav-btn {
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

.nav-btn:disabled {
  color: var(--text-muted, #999);
  cursor: default;
}

.nav-btn:not(:disabled):hover {
  background: var(--bg-tertiary);
}

.url-input {
  flex: 1;
  height: 28px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 0 12px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.url-input:focus {
  border-color: var(--accent-color);
}

.url-input::placeholder {
  color: var(--text-muted, #999);
}

.zoom-display {
  min-width: 48px;
  height: 28px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 0 12px;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  outline: none;
}

.zoom-display:hover {
  background: var(--bg-tertiary);
}
</style>
