<template>
  <div class="address-bar">
    <IconButton icon="ic:round-arrow-back" :disabled="!canGoBack" @click="goBack" />
    <IconButton icon="ic:round-arrow-forward" :disabled="!canGoForward" @click="goForward" />
    <IconButton :icon="isLoading ? 'ic:round-close' : 'ic:round-refresh'" @click="isLoading ? stop() : reload()" />
    <IconButton icon="ic:round-home" @click="goHome" />
    <IconButton icon="ic:round-print" @click="printPage" />
    <div class="url-input-wrap">
      <AddressInput
        ref="inputRef"
        v-model="urlInput"
        :placeholder="ADDRESS_BAR_PLACEHOLDER"
        :security-state="securityState"
        :url="props.url"
        :favicon="props.favicon"
        @focus="onFocus"
        @keydown.enter="onEnter"
        @keydown.escape="onEscape"
      />
      <div class="url-input-actions">
        <button class="zoom-display" @click="cycleZoom">
          {{ currentZoomLevel }}
        </button>
        <button class="bookmark-btn" :class="{ bookmarked: isBookmarked }" @click="toggleBookmark">
          <Icon :icon="isBookmarked ? 'ic:round-star' : 'ic:round-star-outline'" :width="iconSize" :height="iconSize" />
        </button>
      </div>
    </div>
    <DownloadIndicator />
    <AppMenuButton />
  </div>
</template>

<script setup lang="ts">
import { ADDRESS_BAR_PLACEHOLDER, resolveAddressBarTarget } from '@browser/shared'
import { Icon } from '@iconify/vue'
import { onMounted, ref, watch } from 'vue'

import { useAddressBarFocus } from '../composables/useAddressBarFocus'
import { Popover } from '../lib/popover'
import AddressInput from './AddressInput.vue'
import AppMenuButton from './AppMenuButton.vue'
import DownloadIndicator from './DownloadIndicator.vue'
import IconButton from './ui/IconButton.vue'

const props = defineProps<{
  tabId: string
  url: string
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
  securityState?: 'secure' | 'insecure' | 'internal'
  favicon?: string | null
}>()

const emit = defineEmits<{
  navigate: [url: string]
}>()

const iconSize = 18

const searchEngine = ref('google')
const urlInput = ref('')
const inputRef = ref<InstanceType<typeof AddressInput>>()
const suggestions = ref<{ type: 'history' | 'bookmark' | 'search' | 'engine'; title: string; url: string }[]>([])
const activeIndex = ref(-1)
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let currentPopover: Popover | null = null

// Cmd+L 聚焦时跳过 popover：panel 的 applyMeasure 会 focus() 抢走键盘焦点，
// 导致主输入框看似选中但实际无法输入。
let suppressPopover = false

// 新开标签页时由创建方触发聚焦地址输入框；Cmd/Ctrl+L 也复用此机制
const focusNonce = useAddressBarFocus()
watch(focusNonce, () => {
  console.debug('[AddressBar] watch focusNonce: nonce', focusNonce.value)
  // 需要延迟确保组件已挂载且 input 已渲染到 DOM
  suppressPopover = true
  setTimeout(() => {
    inputRef.value?.focus()
    // 类 Chrome：聚焦时全选当前地址，方便直接覆盖输入（空地址栏无副作用）
    inputRef.value?.select()
    suppressPopover = false
    console.debug('[AddressBar] focusNonce applied: focused and selected')
  }, 50)
})

const isBookmarked = ref(false)

const ZOOM_LEVELS = [50, 75, 100, 125, 150]
const ZOOM_FACTORS = [0.5, 0.75, 1.0, 1.25, 1.5]
const currentZoomIndex = ref(2)
const currentZoomLevel = ref('100%')

function onFocus(): void {
  if (suppressPopover) {
    console.debug('[AddressBar] onFocus: suppressed (Cmd+L focus)')
    return
  }
  console.debug('[AddressBar] onFocus: opening suggestions popover')
  fetchSuggestions()
  openPopover()
}

function onEnter(): void {
  console.debug('[AddressBar] onEnter: navigating')
  navigate()
}

function onEscape(): void {
  console.debug('[AddressBar] onEscape: reverting and blurring')
  closePopover()
  urlInput.value = props.url ?? ''
  inputRef.value?.blur()
}

function openPopover(): void {
  console.debug('[AddressBar] openPopover: enter')
  const rect = inputRef.value?.getWrapEl()?.getBoundingClientRect()
  if (!rect) {
    console.warn('[AddressBar] openPopover: input wrap rect missing, abort')
    return
  }
  currentPopover = new Popover({
    type: 'addressbar',
    mode: 'bounded',
    // 仅约束宽度与输入框一致；高度由面板测量内容（输入框 + 建议列表）后回传，避免裁切建议
    size: { width: rect.width },
    anchor: {
      type: 'rect',
      // 顶部对齐到输入框顶部，弹出层从输入框上沿展开（原行为）
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      placement: 'cover-start',
    },
    data: {
      query: urlInput.value,
      suggestions: suggestions.value,
      favicon: props.favicon ?? null,
      securityState: props.securityState,
      url: props.url,
    },
    onEvent: (eventName, eventData) => {
      if (eventName === 'select' && typeof eventData === 'string') {
        selectSuggestion(eventData)
      } else if (eventName === 'update-query' && typeof eventData === 'string') {
        urlInput.value = eventData
        fetchSuggestions()
        currentPopover?.sendData({
          query: urlInput.value,
          suggestions: suggestions.value,
          favicon: props.favicon ?? null,
          securityState: props.securityState,
          url: props.url,
        })
      } else if (eventName === 'navigate' && typeof eventData === 'string') {
        urlInput.value = eventData
        navigate()
      } else if (eventName === 'close') {
        closePopover()
      }
    },
    onDismiss: () => {
      currentPopover = null
      suggestions.value = []
      activeIndex.value = -1
      console.debug('[AddressBar] popover dismissed: cleared suggestions')
    },
  })
  // 面板 WebContentsView 会抢占焦点；关闭后浏览器会把焦点“还原”到本输入框，
  // 再次触发 onFocus 导致 popover 反复弹出。这里主动 blur，打断焦点还原链。
  setTimeout(() => inputRef.value?.blur(), 50)
  console.debug('[AddressBar] openPopover: created popover')
}

function closePopover(): void {
  console.debug('[AddressBar] closePopover: enter')
  currentPopover?.close()
  currentPopover = null
}

function fetchSuggestions(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (!urlInput.value.trim()) {
    suggestions.value = []
    return
  }
  debounceTimer = setTimeout(async () => {
    console.debug('[AddressBar] fetchSuggestions: query', urlInput.value)
    suggestions.value = await window.browserAPI.getAutocompleteSuggestions({
      query: urlInput.value,
      limit: 6,
    })
    activeIndex.value = -1
  }, 200)
}

function selectSuggestion(url: string): void {
  console.debug('[AddressBar] selectSuggestion: url', url)
  closePopover()
  suggestions.value = []
  window.browserAPI.loadURL(props.tabId, url)
  emit('navigate', url)
}

watch(urlInput, () => {
  fetchSuggestions()
  if (currentPopover) {
    currentPopover.sendData({ query: urlInput.value, suggestions: suggestions.value })
  }
})

watch(
  () => props.url,
  (newUrl) => {
    // 仅新标签页地址栏清空，其它内部页（settings/proxy 等）仍显示 URL
    if (newUrl.startsWith('wmfx://newtab')) {
      urlInput.value = ''
      return
    }
    if (newUrl !== urlInput.value) {
      urlInput.value = newUrl
    }
  },
  { immediate: true },
)

function goBack(): void {
  console.info('[AddressBar] goBack: tabId', props.tabId)
  window.browserAPI.goBack(props.tabId)
}

function goForward(): void {
  console.info('[AddressBar] goForward: tabId', props.tabId)
  window.browserAPI.goForward(props.tabId)
}

function reload(): void {
  console.info('[AddressBar] reload: tabId', props.tabId)
  window.browserAPI.reload(props.tabId)
}

function stop(): void {
  console.info('[AddressBar] stop: tabId', props.tabId)
  window.browserAPI.stop(props.tabId)
}

async function goHome(): Promise<void> {
  console.debug('[AddressBar] goHome: tabId', props.tabId)
  const settings = await window.browserAPI.getAllSettings()
  window.browserAPI.loadURL(props.tabId, settings.newTabUrl)
}

function navigate(): void {
  const raw = urlInput.value.trim()
  if (!raw) return
  // 识别是否为链接：是则按原流程加载，否则用默认搜索引擎搜索
  const url = resolveAddressBarTarget(raw, searchEngine.value)
  console.info('[AddressBar] navigate: raw target', raw, url)
  closePopover()
  inputRef.value!.blur()
  window.browserAPI.loadURL(props.tabId, url)
  emit('navigate', url)
}

async function getZoomLevel(): Promise<number> {
  try {
    const response = await window.browserAPI.getZoom(props.tabId)
    const index = ZOOM_FACTORS.indexOf(response.factor)
    return index !== -1 ? index : 2
  } catch (err) {
    console.warn('[AddressBar] getZoomLevel failed', String(err))
    return 2
  }
}

async function setZoom(factor: number): Promise<void> {
  console.debug('[AddressBar] setZoom: tabId factor', props.tabId, factor)
  await window.browserAPI.setZoom({ tabId: props.tabId, factor })
}

async function cycleZoom(): Promise<void> {
  console.debug('[AddressBar] cycleZoom: from', currentZoomIndex.value)
  currentZoomIndex.value = (currentZoomIndex.value + 1) % ZOOM_LEVELS.length
  currentZoomLevel.value = `${ZOOM_LEVELS[currentZoomIndex.value]}%`
  await setZoom(ZOOM_FACTORS[currentZoomIndex.value])
}

function printPage(): void {
  console.debug('[AddressBar] printPage: tabId', props.tabId)
  window.browserAPI.printPage({ tabId: props.tabId })
}

async function syncBookmarkStatus(): Promise<void> {
  const url = props.url
  if (url && url.startsWith('http')) {
    const result = await window.browserAPI.isBookmarked(url)
    isBookmarked.value = result.isBookmarked
    console.debug('[AddressBar] syncBookmarkStatus: url isBookmarked', url, result.isBookmarked)
  } else {
    isBookmarked.value = false
  }
}

async function toggleBookmark(): Promise<void> {
  const url = props.url
  if (!url || !url.startsWith('http')) {
    console.debug('[AddressBar] toggleBookmark: skip non-http url', url)
    return
  }

  if (isBookmarked.value) {
    const result = await window.browserAPI.isBookmarked(url)
    if (result.id) {
      console.info('[AddressBar] toggleBookmark: removing bookmark id', result.id)
      await window.browserAPI.deleteBookmark(result.id)
    }
    isBookmarked.value = false
  } else {
    console.info('[AddressBar] toggleBookmark: adding bookmark url', url)
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
  console.debug('[AddressBar] onMounted: initializing')
  currentZoomIndex.value = await getZoomLevel()
  currentZoomLevel.value = `${ZOOM_LEVELS[currentZoomIndex.value]}%`
  const settings = await window.browserAPI.getAllSettings()
  searchEngine.value = (settings.searchEngine as string) ?? 'google'
  await syncBookmarkStatus()
  console.debug('[AddressBar] onMounted: done searchEngine', searchEngine.value)
})
</script>

<style scoped lang="less">
.address-bar {
  position: relative;
  display: flex;
  align-items: center;
  /* 偶数高度；底部分隔线用 ::after 伪元素绘制，不占用内容高度，
     保证 .url-input-wrap 内容区为偶数 → 28px 输入框居中后顶部落在整数像素，
     避免 popover 锚点亚像素偏差导致的抖动 */
  box-sizing: border-box;
  height: 40px;
  background: var(--chrome-bg);
  padding: 0 8px;
  gap: 4px;

  &::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 1px;
    background: var(--border-color);
    pointer-events: none;
  }
}

.url-input-wrap {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  background: var(--url-input-bg);
  border-radius: 14px;
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

  &:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
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

  &:not(:disabled):hover {
    background: var(--bg-tertiary);
  }

  &.bookmarked {
    color: #f5b041;
  }
}
</style>
