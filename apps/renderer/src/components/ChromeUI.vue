<template>
  <div class="chrome-ui">
    <TabBar />
    <div class="chrome-main">
      <div class="chrome-content">
        <AddressBar
          v-if="activeTab"
          :tab-id="activeTab.id"
          :url="activeTab.navigation.displayUrl"
          :can-go-back="activeTab.canGoBack"
          :can-go-forward="activeTab.canGoForward"
          :is-loading="activeTab.navigation.isLoading"
          :security-state="activeTab.navigation.securityState"
          :favicon="activeTab.favicon"
        />
        <BookmarkBar v-if="showBookmarkBar" />
        <Viewport v-if="activeTab" :tab-id="activeTab.id" />
      </div>
      <FindBar :active-tab-id="activeTab?.id ?? null" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TabState } from '@browser/ipc-contract'
import { onMounted, onUnmounted, ref } from 'vue'
import { requestAddressBarFocus } from '../composables/useAddressBarFocus'
import AddressBar from './AddressBar.vue'
import BookmarkBar from './BookmarkBar.vue'
import FindBar from './FindBar.vue'
import TabBar from './TabBar.vue'
import Viewport from './Viewport.vue'

const activeTab = ref<TabState | null>(null)
const showBookmarkBar = ref(false)

function syncBookmarkBar(): void {
  void window.browserAPI.getSetting('showBookmarkBar').then((v) => {
    showBookmarkBar.value = Boolean(v)
    console.debug('[ChromeUI] syncBookmarkBar: showBookmarkBar', showBookmarkBar.value)
  })
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

onMounted(() => {
  console.debug('[ChromeUI] onMounted: initializing')
  syncActiveTab()
  syncBookmarkBar()

  window.browserAPI.onBookmarksChanged(() => syncBookmarkBar())

  stateChangeHandler = (state: TabState) => {
    if (state.active) {
      activeTab.value = state
      console.debug('[ChromeUI] tab state-change: activeTabId', state.id)
    }
  }

  window.browserAPI.onTabStateChange(stateChangeHandler)

  // Cmd/Ctrl+L：主进程窗口级快捷键转发到此，聚焦地址栏（复用新开标签的聚焦请求机制）
  window.browserAPI.onFocusAddressBar(() => requestAddressBarFocus())
})

onUnmounted(() => {
  window.browserAPI.removeListener('tab:state-change', stateChangeHandler as (...args: unknown[]) => void)
})
</script>

<style scoped>
.chrome-ui {
  display: flex;
  flex-direction: column;
  height: 100vh;
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
</style>
