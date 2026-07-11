<template>
  <div class="chrome-ui">
    <TabBar
      :is-sidebar-open="isSidebarOpen"
      @toggle-sidebar="toggleSidebar"
    />
    <div
      class="chrome-main"
    >
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
    </div>
    <Sidebar
      :is-open="isSidebarOpen"
      @close="onCloseSidebar"
    />
  </div>
</template>

<script setup lang="ts">
import type { TabState } from '@browser/ipc-contract'
import { onMounted, onUnmounted, ref } from 'vue'
import AddressBar from './AddressBar.vue'
import Sidebar from './Sidebar.vue'
import TabBar from './TabBar.vue'
import Viewport from './Viewport.vue'

const activeTab = ref<TabState | null>(null)
const isSidebarOpen = ref(false)

function toggleSidebar(): void {
  const next = !isSidebarOpen.value
  isSidebarOpen.value = next
  window.browserAPI.setSidebarOpen(next)
}

function onCloseSidebar(): void {
  isSidebarOpen.value = false
  window.browserAPI.setSidebarOpen(false)
}

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

<style>
:root {
  --bg-primary: #1e1e1e;
  --bg-secondary: #2d2d2d;
  --bg-tertiary: #3d3d3d;
  --text-primary: #e0e0e0;
  --text-secondary: #888;
  --border-color: #1a1a1a;
  --accent-color: #4fc3f7;
  --danger-color: #ff5555;
}

[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --bg-tertiary: #e8e8e8;
  --text-primary: #1a1a1a;
  --text-secondary: #666;
  --border-color: #e0e0e0;
  --accent-color: #1976d2;
  --danger-color: #d32f2f;
}
</style>

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
