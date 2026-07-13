<template>
  <div
    class="sidebar"
    :class="{ open: isOpen }"
  >
    <div class="sidebar-header">
      <Icon
        class="sidebar-close"
        icon="ic:sharp-close"
        width="20"
        height="20"
        @click="close"
      />
    </div>
    <div class="sidebar-tabs">
      <div
        v-for="t in sidebarTabs"
        :key="t.key"
        class="sidebar-tab"
        :class="{ active: activeTab === t.key }"
        @click="activeTab = t.key"
      >
        <Icon
          :icon="t.icon"
          :width="18"
          :height="18"
        />
        <span class="sidebar-tab-label">{{ t.label }}</span>
      </div>
    </div>
    <div class="sidebar-content">
      <div
        v-show="activeTab === 'history'"
        class="sidebar-panel"
      >
        <div
          v-if="historyItems.length === 0"
          class="sidebar-empty"
        >
          <Icon
            icon="carbon:time"
            width="48"
            height="48"
          />
          <p>No history yet</p>
        </div>
        <div
          v-else
          class="sidebar-list"
        >
          <div
            v-for="item in historyItems"
            :key="item.id"
            class="sidebar-item"
          >
            <img
              v-if="item.favicon"
              class="sidebar-item-favicon"
              :src="item.favicon"
              alt=""
            >
            <DefaultFavicon
              v-else
              class="sidebar-item-favicon"
              :size="16"
            />
            <span class="sidebar-item-title">{{ item.title || item.url }}</span>
          </div>
        </div>
      </div>
      <div
        v-show="activeTab === 'bookmarks'"
        class="sidebar-panel"
      >
        <div
          v-if="bookmarks.length === 0"
          class="sidebar-empty"
        >
          <Icon
            icon="carbon:bookmark-filled"
            width="48"
            height="48"
          />
          <p>No bookmarks yet</p>
        </div>
        <div
          v-else
          class="sidebar-list"
        >
          <div
            v-for="b in bookmarks"
            :key="b.id"
            class="sidebar-item"
          >
            <img
              v-if="b.favicon"
              class="sidebar-item-favicon"
              :src="b.favicon"
              alt=""
            >
            <Icon
              v-else
              class="sidebar-item-favicon"
              icon="carbon:bookmark-filled"
              width="16"
              height="16"
            />
            <span class="sidebar-item-title">{{ b.title }}</span>
          </div>
        </div>
      </div>
      <div
        v-show="activeTab === 'downloads'"
        class="sidebar-panel"
      >
        <div
          v-if="downloads.length === 0"
          class="sidebar-empty"
        >
          <Icon
            icon="carbon:download"
            width="48"
            height="48"
          />
          <p>No downloads</p>
        </div>
        <div
          v-else
          class="sidebar-list"
        >
          <div
            v-for="d in downloads"
            :key="d.id"
            class="sidebar-item"
          >
            <Icon
              class="sidebar-item-favicon"
              icon="carbon:attachment"
              width="16"
              height="16"
            />
            <span class="sidebar-item-title">{{ d.filename }}</span>
          </div>
        </div>
      </div>
      <div
        v-show="activeTab === 'settings'"
        class="sidebar-panel"
      >
        <div class="sidebar-settings">
          <div class="sidebar-setting">
            <span class="sidebar-setting-label">Theme</span>
            <select
              class="sidebar-setting-select"
              :value="theme"
              @change="onThemeChange"
            >
              <option value="light">
                Light
              </option>
              <option value="dark">
                Dark
              </option>
              <option value="system">
                System
              </option>
            </select>
          </div>
        </div>
      </div>
      <div
        v-show="activeTab === 'proxy'"
        class="sidebar-panel proxy-panel-wrapper"
      >
        <ProxyPanel />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BookmarkItem, DownloadItem, HistoryItem, ThemeMode } from '@browser/ipc-contract'
import { Icon } from '@iconify/vue'
import { onMounted, onUnmounted, ref } from 'vue'
import ProxyPanel from '../views/ProxyPanel.vue'
import DefaultFavicon from './DefaultFavicon.vue'

defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const activeTab = ref('history')

const historyItems = ref<HistoryItem[]>([])
const bookmarks = ref<BookmarkItem[]>([])
const downloads = ref<DownloadItem[]>([])
const theme = ref<ThemeMode>('system')

const sidebarTabs = [
  { key: 'history', label: 'History', icon: 'carbon:time' },
  { key: 'bookmarks', label: 'Bookmarks', icon: 'carbon:bookmark-filled' },
  { key: 'downloads', label: 'Downloads', icon: 'carbon:download' },
  { key: 'proxy', label: 'Proxy', icon: 'carbon:network-4' },
  { key: 'settings', label: 'Settings', icon: 'carbon:settings' },
]

function close(): void {
  emit('close')
}

async function loadHistory(): Promise<void> {
  historyItems.value = await window.browserAPI.getHistoryList({ limit: 50 })
}

async function loadBookmarks(): Promise<void> {
  bookmarks.value = await window.browserAPI.getBookmarks()
}

async function loadDownloads(): Promise<void> {
  downloads.value = await window.browserAPI.getDownloads()
}

async function loadTheme(): Promise<void> {
  theme.value = await window.browserAPI.getTheme()
  applyTheme(theme.value)
}

function applyTheme(mode: ThemeMode): void {
  const el = document.documentElement
  let theme: string
  if (mode === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    theme = prefersDark ? 'dark' : 'light'
  }
  else {
    theme = mode
  }
  el.setAttribute('data-theme', theme)
  el.classList.toggle('dark', theme === 'dark')
}

async function onThemeChange(event: Event): Promise<void> {
  const target = event.target as HTMLSelectElement
  const value = target.value as ThemeMode
  theme.value = value
  applyTheme(value)
  await window.browserAPI.setTheme(value)
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null

function scheduleRefresh(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
  }
  refreshTimer = setTimeout(() => {
    loadHistory()
    loadBookmarks()
    loadDownloads()
    loadTheme()
  }, 300)
}

onMounted(() => {
  scheduleRefresh()
})

onUnmounted(() => {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
  }
})
</script>

<style scoped>
.sidebar {
  position: fixed;
  top: 0;
  right: 0;
  width: 280px;
  height: 100vh;
  background: var(--bg-secondary);
  color: var(--text-primary);
  z-index: 1000;
  transform: translateX(100%);
  transition: transform 0.25s ease-in-out;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-color);
  box-shadow: -4px 0 12px rgba(0, 0, 0, 0.15);
}

.sidebar.open {
  transform: translateX(0);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  -webkit-app-region: no-drag;
}

.sidebar-close {
  color: var(--text-secondary);
  cursor: pointer;

  &:hover {
    color: var(--danger-color);
  }
}

.sidebar-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px 4px;
  cursor: pointer;
  color: var(--text-secondary);
  gap: 4px;

  &.active {
    color: var(--accent-color);
    border-bottom: 2px solid var(--accent-color);
  }

  &:hover {
    background: var(--bg-tertiary);
  }
}

.sidebar-tab-label {
  font-size: 10px;
  white-space: nowrap;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
}

.sidebar-panel {
  height: 100%;
  padding: 12px;
}

.sidebar-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
  gap: 12px;
}

.sidebar-empty p {
  font-size: 13px;
}

.sidebar-list {
  display: flex;
  flex-direction: column;
}

.sidebar-item {
  display: flex;
  align-items: center;
  padding: 8px 6px;
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background: var(--bg-tertiary);
  }
}

.sidebar-item-favicon {
  width: 16px;
  height: 16px;
  margin-right: 8px;
  flex-shrink: 0;
}

.sidebar-item-title {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sidebar-setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sidebar-setting-label {
  font-size: 13px;
  color: var(--text-primary);
}

.sidebar-setting-select {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  outline: none;
}

.proxy-panel-wrapper {
  padding: 8px;
}
</style>
