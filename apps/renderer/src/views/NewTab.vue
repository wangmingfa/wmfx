<template>
  <div class="new-tab">
    <div class="search-box">
      <input
        v-model="searchQuery"
        class="search-input"
        placeholder="Search or enter URL"
        @keydown.enter="onSearch"
        @focus="showEngine = true"
        @blur="hideEngine"
      >
      <div
        v-if="showEngine"
        class="engine-select"
      >
        <button
          v-for="engine in engines"
          :key="engine.key"
          class="engine-btn"
          :class="{ active: currentEngine === engine.key }"
          @click="currentEngine = engine.key"
        >
          <Icon
            :icon="engine.icon"
            width="16"
            height="16"
          />
          {{ engine.label }}
        </button>
      </div>
    </div>
    <div class="quick-links">
      <div
        v-for="link in quickLinks"
        :key="link.id"
        class="quick-link"
        @click="openLink(link.url)"
      >
        <Icon
          class="quick-link-icon"
          icon="mdi:earth"
          width="20"
          height="20"
        />
        <span class="quick-link-title">{{ link.title }}</span>
      </div>
    </div>
    <div class="recent-history">
      <h3>最近访问</h3>
      <div
        v-for="item in recentHistory"
        :key="item.id"
        class="recent-item"
        @click="openLink(item.url)"
      >
        <img
          v-if="item.favicon"
          :src="item.favicon"
          class="recent-favicon"
        >
        <DefaultFavicon
          v-else
          class="recent-icon"
          :size="16"
        />
        <span class="recent-title">{{ item.title || item.url }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { QuickLink } from '@browser/ipc-contract'
import { Icon } from '@iconify/vue'
import { onMounted, ref } from 'vue'
import DefaultFavicon from '../components/DefaultFavicon.vue'

const searchQuery = ref('')
const showEngine = ref(false)
const currentEngine = ref('google')
const openInNewTab = ref(true)

const engines = [
  { key: 'google', label: 'Google', icon: 'logos:google-icon' },
  { key: 'baidu', label: 'Baidu', icon: 'logos:baidu-icon' },
  { key: 'bing', label: 'Bing', icon: 'logos:bing' },
]

const quickLinks = ref<QuickLink[]>([])
const recentHistory = ref<{
  id: string
  url: string
  title: string | null
  favicon: string | null
}[]>([])

function hideEngine(): void {
  setTimeout(() => {
    showEngine.value = false
  }, 200)
}

function onSearch(): void {
  const query = searchQuery.value.trim()
  if (!query)
    return
  let url = query
  if (!query.startsWith('http://') && !query.startsWith('https://')) {
    const engineUrl = {
      google: 'https://www.baidu.com/s?wd=',
      baidu: 'https://www.baidu.com/s?wd=',
      bing: 'https://www.bing.com/search?q=',
    }[currentEngine.value]
    url = `${engineUrl}${encodeURIComponent(query)}`
  }
  openLink(url)
}

function openLink(url: string): void {
  if (openInNewTab.value) {
    window.browserAPI.createTab({ url })
  }
  else {
    window.browserAPI.loadURLCurrent(url)
  }
}

async function loadQuickLinks(): Promise<void> {
  quickLinks.value = await window.browserAPI.getQuickLinks()
}

async function loadRecentHistory(): Promise<void> {
  recentHistory.value = await window.browserAPI.getHistoryList({ limit: 5 })
}

async function loadSettings(): Promise<void> {
  const saved = await window.browserAPI.getSetting('newTabOpenInNewTab')
  if (typeof saved === 'boolean') {
    openInNewTab.value = saved
  }
}

onMounted(() => {
  loadSettings()
  loadQuickLinks()
  loadRecentHistory()
})
</script>

<style scoped>
.new-tab {
  position: relative;
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 40px;
  padding: 40px;
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow: hidden;
}

.search-box {
  width: 100%;
  max-width: 600px;
  position: relative;
}

.search-input {
  width: 100%;
  height: 48px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 24px;
  padding: 0 24px;
  color: var(--text-primary);
  font-size: 16px;
  outline: none;
}

.search-input:focus {
  border-color: var(--accent-color);
}

.search-input::placeholder {
  color: var(--text-muted, #999);
}

.engine-select {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 8px;
  display: flex;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 8px;
  gap: 4px;
}

.engine-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: none;
  border: none;
  color: var(--text-primary);
  cursor: pointer;
  border-radius: 8px;
}

.engine-btn:hover,
.engine-btn.active {
  background: var(--bg-tertiary);
}

.quick-links {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 16px;
  max-width: 720px;
  width: 100%;
}

.quick-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 8px;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.quick-link:hover {
  background: var(--bg-secondary);
}

.quick-link-icon,
.quick-link-favicon {
  width: 24px;
  height: 24px;
  color: var(--text-secondary);
}

.quick-link-title {
  font-size: 12px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  text-align: center;
}

.recent-history {
  max-width: 600px;
  width: 100%;
}

.recent-history h3 {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 12px 0;
}

.recent-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
}

.recent-item:hover {
  background: var(--bg-secondary);
}

.recent-icon,
.recent-favicon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.recent-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
