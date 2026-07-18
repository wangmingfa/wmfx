<template>
  <div class="chrome-ui" :class="{ 'chrome-ui--incognito': isIncognito, 'chrome-ui--left': tabBarPosition === 'left' }">
    <VerticalTabBar v-if="tabBarPosition === 'left' && !isHtmlFullscreen" />
    <TabBar v-else-if="!isHtmlFullscreen" :is-incognito="isIncognito" />
    <div class="chrome-main">
      <div class="chrome-content">
        <AddressBar
          v-if="activeTab && !isHtmlFullscreen"
          :tab-id="activeTab.id"
          :url="activeTab.navigation.displayUrl"
          :can-go-back="activeTab.canGoBack"
          :can-go-forward="activeTab.canGoForward"
          :is-loading="activeTab.navigation.isLoading"
          :security-state="activeTab.navigation.securityState"
          :favicon="activeTab.favicon"
          :is-reader-mode="activeTab.isReaderMode"
        />
        <BookmarkBar v-if="showBookmarkBar && !isHtmlFullscreen" />
        <Viewport v-if="activeTab" :tab-id="activeTab.id" />
      </div>
      <FindBar v-if="!isHtmlFullscreen" :active-tab-id="activeTab?.id ?? null" />
    </div>
    <!-- 独立无痕窗口指示徽标（整窗隔离，关闭即焚） -->
    <div v-if="isIncognito && !isHtmlFullscreen" class="incognito-badge" :title="t('appMenu.incognitoWindow')">
      <span class="incognito-dot" />
      <span class="incognito-label">{{ t('appMenu.incognitoWindow') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TabState } from '@browser/ipc-contract'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { requestAddressBarFocus } from '../composables/useAddressBarFocus'
import { useI18n } from '../composables/useI18n'
import AddressBar from './AddressBar.vue'
import BookmarkBar from './BookmarkBar.vue'
import FindBar from './FindBar.vue'
import TabBar from './TabBar.vue'
import VerticalTabBar from './VerticalTabBar.vue'
import Viewport from './Viewport.vue'

const { t } = useI18n()

const activeTab = ref<TabState | null>(null)
const showBookmarkBar = ref(false)
/** 当前窗口是否为独立无痕窗口（由主进程 window:getInfo 返回） */
const isIncognito = ref(false)
/** 当前活跃标签是否处于 HTML 全屏（Fullscreen API）状态，隐藏所有 UI chrome */
const isHtmlFullscreen = computed(() => activeTab.value?.isHtmlFullscreen === true)
const tabBarPosition = ref<'top' | 'left'>('top')

function syncTabBarPosition(): void {
  void window.browserAPI.getSetting('tabBarPosition').then((v) => {
    tabBarPosition.value = (v as 'top' | 'left') ?? 'top'
  })
}

function syncBookmarkBar(): void {
  void window.browserAPI.getSetting('showBookmarkBar').then((v) => {
    showBookmarkBar.value = Boolean(v)
    console.debug('[ChromeUI] syncBookmarkBar: showBookmarkBar', showBookmarkBar.value)
  })
}

/** 拉取窗口信息，判断是否为独立无痕窗口；渲染端据此切换无痕主题与指示徽标 */
async function syncWindowInfo(): Promise<void> {
  try {
    const info = await window.browserAPI.getWindowInfo()
    isIncognito.value = Boolean(info?.isIncognito)
    console.debug('[ChromeUI] syncWindowInfo: isIncognito', isIncognito.value)
  } catch (err) {
    console.warn('[ChromeUI] syncWindowInfo: failed', err)
  }
}

async function syncActiveTab(): Promise<void> {
  console.debug('[ChromeUI] syncActiveTab: enter')
  const tabs = await window.browserAPI.getList()
  const active = tabs.find((t) => t.active)
  if (active) {
    activeTab.value = active
    console.debug('[ChromeUI] syncActiveTab: activeTabId', active.id)
  }
}

let stateChangeHandler: (state: TabState) => void
let cleanupBookmarksChanged: (() => void) | null = null
let cleanupBookmarkBarChanged: (() => void) | null = null
let cleanupFocusAddressBar: (() => void) | null = null
let cleanupTabBarPositionChanged: (() => void) | null = null

onMounted(() => {
  console.debug('[ChromeUI] onMounted: initializing')
  syncActiveTab()
  syncBookmarkBar()
  syncTabBarPosition()
  void syncWindowInfo()

  cleanupBookmarksChanged = window.browserAPI.onBookmarksChanged(() => syncBookmarkBar())
  cleanupBookmarkBarChanged = window.browserAPI.onBookmarkBarChanged(() => syncBookmarkBar())
  cleanupTabBarPositionChanged = window.browserAPI.onTabBarPositionChanged(() => syncTabBarPosition())

  stateChangeHandler = (state: TabState) => {
    if (state.active) {
      activeTab.value = state
      console.debug('[ChromeUI] tab state-change: activeTabId', state.id)
    }
  }

  window.browserAPI.onTabStateChange(stateChangeHandler)

  // Cmd/Ctrl+L：主进程窗口级快捷键转发到此，聚焦地址栏（复用新开标签的聚焦请求机制）
  cleanupFocusAddressBar = window.browserAPI.onFocusAddressBar(() => requestAddressBarFocus())
})

onUnmounted(() => {
  window.browserAPI.removeListener('tab:state-change', stateChangeHandler as (...args: unknown[]) => void)
  stateChangeHandler = undefined as unknown as (state: TabState) => void
  cleanupBookmarksChanged?.()
  cleanupBookmarksChanged = null
  cleanupBookmarkBarChanged?.()
  cleanupBookmarkBarChanged = null
  cleanupFocusAddressBar?.()
  cleanupFocusAddressBar = null
  cleanupTabBarPositionChanged?.()
  cleanupTabBarPositionChanged = null
})
</script>

<style scoped>
.chrome-ui {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-primary);
}

.chrome-ui--left {
  flex-direction: row;
}

.chrome-ui--incognito {
  background: var(--bg-primary);
}

.chrome-main {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.chrome-content {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
}

/* 独立无痕窗口指示徽标：固定在右下角，提示当前为无痕模式 */
.incognito-badge {
  position: fixed;
  right: 10px;
  bottom: 8px;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(142, 110, 220, 0.18);
  color: #c4b5fd;
  font-size: 11px;
  line-height: 1;
  user-select: none;
  pointer-events: none;
}

.incognito-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #a78bfa;
}
</style>
