<template>
  <div class="address-bar">
    <!-- macOS 折叠垂直标签栏时，展开按钮放在地址栏最左侧（在 back/forward 之前） -->
    <IconButton
      v-if="showLeftToggle"
      icon="ic:baseline-menu"
      :btn-size="28"
      :rounded="false"
      :tooltip="t('settings.tabBarExpand')"
      @click="emit('leftToggleClick')"
    />
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
      v-if="isExternal"
      :icon="isReaderMode ? 'mdi:book-open-page-variant' : 'mdi:book-open-outline'"
      :active="isReaderMode"
      :tooltip="isReaderMode ? t('reader.exit') : t('reader.enter')"
      @click="toggleReader"
    />
    <div class="url-input-wrap">
      <AddressInput
        ref="inputRef"
        v-model="urlInput"
        :placeholder="ADDRESS_BAR_PLACEHOLDER"
        :padding-right="actionsRightPadding"
        :security-state="securityState"
        :url="props.url"
        :favicon="props.favicon"
        @focus="onFocus"
        @blur="closePopover"
        @keydown.enter="onEnter"
        @keydown.escape="onEscape"
      />
      <div class="url-input-actions">
        <button
          class="zoom-display"
          @click="cycleZoom"
        >
          {{ currentZoomLevel }}
        </button>
        <IconButton
          icon="mdi:invert-colors"
          :active="forceDarkDisplayed"
          :tooltip="forceDarkDisplayed ? t('settings.forceDarkOff') : t('settings.forceDarkOn')"
          @click="toggleForceDark"
        />
        <IconButton
          icon="ic:round-print"
          :tooltip="t('settings.printPage')"
          @click="printPage"
        />
        <IconButton
          v-if="isExternal"
          :icon="isBookmarked ? 'ic:round-star' : 'ic:round-star-outline'"
          :active="isBookmarked"
          :tooltip="isBookmarked ? t('bookmark.remove') : t('bookmark.add')"
          @click="toggleBookmark"
        />
      </div>
    </div>
    <DownloadIndicator />
    <AppMenuButton />
  </div>
</template>

<script setup lang="ts">
import { ADDRESS_BAR_PLACEHOLDER, formatAddressBarUrl, isWmfxUrl, resolveAddressBarTarget } from '@browser/shared'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useAddressBarFocus } from '../composables/useAddressBarFocus'
import { useI18n } from '../composables/useI18n'
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
  isReaderMode?: boolean
  /** macOS 折叠垂直标签栏时，在地址栏最左侧显示展开 toggle */
  showLeftToggle?: boolean
}>()

const emit = defineEmits<{
  leftToggleClick: []
  navigate: [url: string]
}>()

const { t } = useI18n()

/** 地址栏右侧动作按钮的宽度常量（px） */
const ZOOM_DISPLAY_WIDTH = 52 // min-width 44px + padding 0 8px
const ICON_BTN_WIDTH = 26 // IconButton 默认 ~26px
const ACTION_GAP = 2 // .url-input-actions 的 gap
const ACTIONS_RIGHT_MARGIN = 6 // .url-input-actions right: 6px

const isExternal = computed(() => {
  const u = props.url ?? ''
  return (u.startsWith('http://') || u.startsWith('https://')) && !isWmfxUrl(u)
})

/** 计算右侧动作按钮的总宽度，作为输入框的 padding-right */
const actionsRightPadding = computed(() => {
  let total = ZOOM_DISPLAY_WIDTH + ACTION_GAP // zoom-display (始终显示)
  total += ICON_BTN_WIDTH + ACTION_GAP // invert-colors (始终显示)
  total += ICON_BTN_WIDTH + ACTION_GAP // print (始终显示)
  if (isExternal.value) {
    total += ICON_BTN_WIDTH + ACTION_GAP // bookmark star (条件显示)
  }
  return total + ACTIONS_RIGHT_MARGIN
})

async function toggleReader(): Promise<void> {
  console.info(`[AddressBar] toggleReader: tabId=${props.tabId} isReader=${props.isReaderMode}`)
  try {
    if (props.isReaderMode) {
      await window.browserAPI.exitReadingMode(props.tabId)
    } else {
      await window.browserAPI.enterReadingMode(props.tabId)
    }
  } catch (err) {
    console.error(`[AddressBar] toggleReader failed: ${String(err)}`)
  }
}

const searchEngine = ref('google')
const urlInput = ref('')
const inputRef = ref<InstanceType<typeof AddressInput>>()
const suggestions = ref<{ type: 'history' | 'bookmark' | 'search' | 'engine', title: string, url: string }[]>([])
const activeIndex = ref(-1)
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let currentPopover: Popover | null = null

// Cmd+L / 新建标签页聚焦时跳过 popover：panel 的 applyMeasure 会 focus() 抢走键盘焦点
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
const forceDarkEnabled = ref(false)
/** 用户点击意图（立即翻转，不等 IPC 返回），防抖后统一提交 */
const forceDarkTarget = ref<boolean | null>(null)
/** 按钮展示状态：有未提交意图时展示意图，否则展示已生效状态（点击即时反馈） */
const forceDarkDisplayed = computed(() => forceDarkTarget.value ?? forceDarkEnabled.value)
let forceDarkTimer: ReturnType<typeof setTimeout> | null = null
/** 串行化 setSetting，避免快速连点时并发 IPC 乱序 */
let forceDarkApplying: Promise<void> = Promise.resolve()

const ZOOM_LEVELS = [50, 75, 100, 125, 150]
const ZOOM_FACTORS = [0.5, 0.75, 1.0, 1.25, 1.5]
const currentZoomIndex = ref(2)
const currentZoomLevel = ref('100%')

// 防止面板 WebContentsView 失焦后浏览器“还原”焦点到本输入框 → onFocus 反复弹出
// 在 openPopover 中设 true，closePopover 中恢复 false
// 面板 WebContentsView 抢焦点时，input blur 先于 WebContentsView blur 触发，
// 此时 closePopover 会提前关闭尚未 applyMeasure 完成的面板。用 skipCloseOnBlur +
// 真实 timeout 覆盖这个窗口：openPopover 后 500ms 内不关闭，让 WebContentsView blur
// 有机会先关闭；500ms 后如果用户没点走，自动关闭（此时 applyMeasure 已完成）。
let skipCloseOnBlur = false

/** 重置 AddressBar 内部的焦点/blur 抑制状态，供测试 afterEach 调用 */
function resetPopoverState(): void {
  suppressPopover = false
  skipCloseOnBlur = false
}
;(window as any).__resetAddressBarPopoverState = resetPopoverState

function closePopover(): void {
  if (skipCloseOnBlur) {
    return
  }
  const pop = currentPopover
  currentPopover = null
  pop?.close()
  urlInput.value = formatAddressBarUrl(props.url ?? '')
  // 防止 blur 关闭弹窗后，浏览器恢复焦点立即重新打开弹窗
  suppressPopover = true
  setTimeout(() => {
    suppressPopover = false
  }, 50)
}

function onFocus(): void {
  if (suppressPopover) {
    console.debug('[AddressBar] onFocus: suppressed (suppressPopover)')
    return
  }
  // 弹窗已打开时不再重复创建，避免焦点竞争循环（blur → 浏览器恢复焦点 → focus → 重复 openPopover）
  if (currentPopover) {
    console.debug('[AddressBar] onFocus: popover already open, skip')
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
    onEvent: (event) => {
      if (event.name === 'select' && typeof event.data === 'string') {
        selectSuggestion(event.data)
      } else if (event.name === 'update-query' && typeof event.data === 'string') {
        urlInput.value = event.data
        fetchSuggestions()
        currentPopover?.sendData({
          query: urlInput.value,
          suggestions: suggestions.value,
          favicon: props.favicon ?? null,
          securityState: props.securityState,
          url: props.url,
        })
      } else if (event.name === 'navigate' && typeof event.data === 'string') {
        urlInput.value = event.data
        navigate()
      } else if (event.name === 'close') {
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
  // openPopover 后立即设 skipCloseOnBlur，用 500ms timeout 覆盖 input blur 窗口：
  // 1) WebContentsView 抢焦点时，input blur 在 500ms 内触发，closePopover 被 skip 跳过
  // 2) 用户点走时，WebContentsView blur 先于 input blur 关闭面板
  // 3) 500ms 后如果面板还在，自动关闭（applyMeasure 已完成，安全）
  skipCloseOnBlur = true
  setTimeout(() => {
    skipCloseOnBlur = false
  }, 500)
  console.debug('[AddressBar] openPopover: created popover')
}

function fetchSuggestions(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  if (!urlInput.value.trim()) {
    suggestions.value = []
    return
  }
  debounceTimer = setTimeout(async () => {
    console.debug('[AddressBar] fetchSuggestions: query', urlInput.value)
    try {
      suggestions.value = await window.browserAPI.getAutocompleteSuggestions({
        query: urlInput.value,
        limit: 6,
      })
    } catch (err) {
      console.error('[AddressBar] fetchSuggestions 失败', err)
      suggestions.value = []
      return
    }
    activeIndex.value = -1
    // 防抖完成后，如果弹窗仍开着，推送新建议让其渲染
    if (currentPopover) {
      currentPopover.sendData({ query: urlInput.value, suggestions: suggestions.value })
    }
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
  // 清空旧建议，避免防抖触发前弹窗显示过时的搜索建议（如输入"21"时仍显示"用 Google 搜索 '2'"）
  suggestions.value = []
  activeIndex.value = -1
  fetchSuggestions()
  if (currentPopover) {
    currentPopover.sendData({ query: urlInput.value, suggestions: [] })
  }
})

watch(
  () => props.url,
  (newUrl) => {
    if (newUrl !== urlInput.value) {
      urlInput.value = formatAddressBarUrl(newUrl)
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
  if (!raw) {
    return
  }
  // 识别是否为链接：是则按原流程加载，否则用默认搜索引擎搜索
  const url = resolveAddressBarTarget(raw, searchEngine.value)
  console.info('[AddressBar] navigate: raw target', raw, url)
  // 关闭弹窗但不重置 URL（closePopover 会重置到旧 URL，watch(props.url) 会在导航完成后更新）
  currentPopover?.close()
  currentPopover = null
  inputRef.value!.blur()
  window.browserAPI.loadURL(props.tabId, url)
  emit('navigate', url)
  // 在 watch(props.url) 更新前先设为目标 URL 的显示值，避免 displayUrl 不变时地址栏残留输入
  urlInput.value = formatAddressBarUrl(url)
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

/**
 * 切换强制暗色（防抖 + 意图取反）：
 * 快速连点时基于"意图状态"取反并合并为最后一次，避免 IPC 返回前的
 * forceDarkEnabled 过期导致目标值错乱 / 连点产生并发 IPC 乱序。
 */
function toggleForceDark(): void {
  const base = forceDarkTarget.value ?? forceDarkEnabled.value
  const target = !base
  console.info('[AddressBar] toggleForceDark: tabId', props.tabId, 'target', target)
  // 先更新意图（按钮即时反馈），防抖后统一提交
  forceDarkTarget.value = target
  if (forceDarkTimer) {
    clearTimeout(forceDarkTimer)
  }
  forceDarkTimer = setTimeout(() => {
    void applyForceDark(target)
  }, 250)
}

async function applyForceDark(value: boolean): Promise<void> {
  // 串行化：等前一次 setSetting 完成再发下一次，避免 IPC 乱序
  forceDarkApplying = forceDarkApplying
    .then(() => window.browserAPI.setSetting({ key: 'forceDark', value }))
    .then(() => {
      forceDarkEnabled.value = value
      // 只有提交值仍等于当前意图时才清意图，防止旧提交覆盖新点击
      if (forceDarkTarget.value === value) {
        forceDarkTarget.value = null
      }
      console.debug('[AddressBar] applyForceDark: applied value=%s', value)
    })
    .catch((err) => {
      console.error('[AddressBar] applyForceDark: failed value=%s', value, err)
      // 失败回滚：重新读取服务端真实状态
      forceDarkTarget.value = null
      void window.browserAPI
        .getSetting('forceDark')
        .then((v) => {
          forceDarkEnabled.value = v === true
        })
        .catch(() => {})
    })
  await forceDarkApplying
}

async function initForceDark(): Promise<void> {
  const v = (await window.browserAPI.getSetting('forceDark')) as boolean
  forceDarkEnabled.value = v === true
  forceDarkTarget.value = null
  console.debug('[AddressBar] initForceDark: value', v)
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
  await initForceDark()
  await syncBookmarkStatus()
  console.debug('[AddressBar] onMounted: done')
})

onBeforeUnmount(() => {
  // 清理强制暗色防抖定时器，避免卸载后仍提交意图
  if (forceDarkTimer) {
    clearTimeout(forceDarkTimer)
  }
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
  height: var(--addressbar-height);
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
</style>
