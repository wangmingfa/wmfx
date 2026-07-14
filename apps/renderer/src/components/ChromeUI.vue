<template>
  <div class="chrome-ui">
    <TabBar />
    <div class="chrome-main">
      <div class="chrome-content">
        <AddressBar
          v-if="activeTab"
          :tab-id="activeTab.id"
          :url="activeTab.url"
          :can-go-back="activeTab.canGoBack"
          :can-go-forward="activeTab.canGoForward"
          :is-loading="activeTab.isLoading"
        />
        <Viewport
          v-if="activeTab"
          :tab-id="activeTab.id"
        />
      </div>
      <FindBar
        v-if="activeTab"
        :tab-id="activeTab.id"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TabState } from '@browser/ipc-contract'
import { onMounted, onUnmounted, ref } from 'vue'
import AddressBar from './AddressBar.vue'
import FindBar from './FindBar.vue'
import TabBar from './TabBar.vue'
import Viewport from './Viewport.vue'

const activeTab = ref<TabState | null>(null)

async function syncActiveTab(): Promise<void> {
  const tabs = await window.browserAPI.getList()
  const active = tabs.find(t => t.active)
  if (active) {
    activeTab.value = active
  }
}

let stateChangeHandler: (state: TabState) => void

onMounted(() => {
  syncActiveTab()

  stateChangeHandler = (state: TabState) => {
    if (state.active) {
      activeTab.value = state
    }
  }

  window.browserAPI.onTabStateChange(stateChangeHandler)
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
