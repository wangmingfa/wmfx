<template>
  <div class="new-tab">
    <div ref="settingsWrapperRef" class="settings-wrapper">
      <IconButton
        icon="ic:round-settings"
        :btn-size="32"
        :active="settingsOpen"
        title="设置"
        @click="settingsOpen = !settingsOpen"
      />
      <div v-if="settingsOpen" class="settings-panel">
        <div class="settings-title">
          {{ t('settings.title') }}
        </div>
        <div class="setting-row">
          <span class="setting-label">{{ t('newTab.openInNewTab') }}</span>
          <NSwitch v-model:value="openInNewTab" size="small" />
        </div>
      </div>
    </div>
    <div ref="searchBoxRef" class="search-box">
      <IconButton
        class="engine-trigger"
        :icon="{ name: currentEngineIcon, size: 18 }"
        :suffix-icon="{ name: 'mdi:chevron-down', size: 12 }"
        :btn-size="32"
        :gap="1"
        padding="0 6px"
        title="搜索引擎"
        @click="engineDropdownVisible = !engineDropdownVisible"
      />
      <input
        v-model="searchQuery"
        class="search-input"
        :placeholder="t('search.placeholder')"
        @keydown.enter="onSearch"
      />
      <button class="search-btn" @click="onSearch">
        <Icon icon="mdi:magnify" width="20" height="20" />
      </button>
      <div v-if="engineDropdownVisible" class="engine-dropdown">
        <button
          v-for="engine in engines"
          :key="engine.key"
          class="engine-option"
          :class="{ active: currentEngine === engine.key }"
          @mousedown.prevent="selectEngine(engine.key)"
        >
          <Icon :icon="engine.icon" width="16" height="16" />
          <span>{{ engine.label }}</span>
        </button>
      </div>
    </div>
    <div class="quick-links">
      <div v-for="link in quickLinks" :key="link.id" class="quick-link" @click="openLink(link.url)">
        <Icon class="quick-link-icon" icon="mdi:earth" width="20" height="20" />
        <span class="quick-link-title">{{ link.title }}</span>
      </div>
    </div>
    <div class="recent-history">
      <h3>{{ t('newTab.recentHistory') }}</h3>
      <div v-for="item in recentHistory" :key="item.id" class="recent-item" @click="openLink(item.url)">
        <img v-if="item.favicon" :src="item.favicon" class="recent-favicon" alt="" />
        <DefaultFavicon v-else class="recent-icon" :size="16" />
        <span class="recent-title">{{ item.title || item.url }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { QuickLink } from '@browser/ipc-contract'
import { Icon } from '@iconify/vue'
import { NSwitch } from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePageTitle } from '@/composables/usePageTitle'
import DefaultFavicon from '../components/DefaultFavicon.vue'
import IconButton from '../components/ui/IconButton.vue'
import { useI18n } from '../composables/useI18n'

const { t } = useI18n()

// 网页标题（窗口标题）设为新标签页
usePageTitle(computed(() => t('newTab.title')))

const searchQuery = ref('')
const engineDropdownVisible = ref(false)
const settingsOpen = ref(false)
const currentEngine = ref('google')
const openInNewTab = ref(true)
const searchBoxRef = ref<HTMLElement | null>(null)
const settingsWrapperRef = ref<HTMLElement | null>(null)

const engines = computed(() => [
  { key: 'google', label: t('search.engines.google'), icon: 'logos:google-icon' },
  { key: 'baidu', label: t('search.engines.baidu'), icon: 'selfhst:baidu' },
  { key: 'bing', label: t('search.engines.bing'), icon: 'logos:bing' },
])

const currentEngineIcon = computed(() => {
  return engines.value.find((e) => e.key === currentEngine.value)?.icon ?? 'logos:google-icon'
})

function selectEngine(key: string): void {
  currentEngine.value = key
  engineDropdownVisible.value = false
}

function onClickOutside(e: MouseEvent): void {
  const target = e.target as Node
  if (searchBoxRef.value && !searchBoxRef.value.contains(target)) {
    engineDropdownVisible.value = false
  }
  if (settingsWrapperRef.value && !settingsWrapperRef.value.contains(target)) {
    settingsOpen.value = false
  }
}

const quickLinks = ref<QuickLink[]>([])
const recentHistory = ref<
  {
    id: string
    url: string
    title: string | null
    favicon: string | null
  }[]
>([])

function onSearch(): void {
  const query = searchQuery.value.trim()
  if (!query) return
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
  } else {
    window.browserAPI.loadURLCurrent(url)
  }
}

async function loadQuickLinks(): Promise<void> {
  quickLinks.value = await window.browserAPI.getQuickLinks()
}

async function loadRecentHistory(): Promise<void> {
  recentHistory.value = await window.browserAPI.getHistoryList({ limit: 5 })
}

function loadSettings(): void {
  const saved = localStorage.getItem('newTabOpenInNewTab')
  if (saved !== null) {
    openInNewTab.value = saved === 'true'
  }
}

watch(openInNewTab, (value) => {
  localStorage.setItem('newTabOpenInNewTab', String(value))
})

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside)
  loadSettings()
  loadQuickLinks()
  loadRecentHistory()
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onClickOutside)
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

.settings-wrapper {
  position: absolute;
  top: 16px;
  right: 16px;
}

.settings-panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 12px 16px;
  min-width: 260px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  z-index: 10;
}

.settings-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.setting-label {
  font-size: 13px;
  color: var(--text-primary);
}

.search-box {
  width: 100%;
  max-width: 600px;
  position: relative;
  display: flex;
  align-items: center;
}

.search-box :deep(.engine-trigger) {
  position: absolute;
  left: 10px;
  z-index: 1;
}

.search-box :deep(.engine-trigger):hover {
  background: var(--bg-tertiary);
}

.search-box :deep(.engine-trigger svg:last-child) {
  opacity: 0.5;
  transition: opacity 0.15s;
}

.search-box :deep(.engine-trigger):hover svg:last-child {
  opacity: 0.8;
}

.search-input {
  width: 100%;
  height: 48px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 24px;
  padding: 0 52px 0 64px;
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

.search-btn {
  position: absolute;
  right: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: none;
  border: none;
  border-radius: 8px;
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}

.search-btn:hover {
  background: var(--bg-tertiary);
  color: var(--accent-color);
}

.engine-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 8px;
  min-width: 160px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  z-index: 10;
}

.engine-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
  border-radius: 8px;
  text-align: left;
}

.engine-option:hover,
.engine-option.active {
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
