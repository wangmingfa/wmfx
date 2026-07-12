<template>
  <div class="settings-view">
    <h2 class="settings-title">
      Settings
    </h2>

    <form @submit.prevent>
      <div class="settings-section">
        <h3>Appearance</h3>

        <div class="settings-group">
          <label class="settings-label">Theme</label>
          <div class="settings-radio-group">
            <label
              v-for="mode in themeModes"
              :key="mode.value"
              class="settings-radio"
            >
              <input
                v-model="themeMode"
                type="radio"
                :value="mode.value"
                @change="onThemeChange"
              >
              <span>{{ mode.label }}</span>
            </label>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3>Downloads</h3>

        <div class="settings-group">
          <label
            class="settings-label"
            for="download-path"
          >Download path</label>
          <input
            id="download-path"
            v-model="downloadPath"
            type="text"
            placeholder="Enter download path"
            @change="saveSetting('downloadPath', downloadPath)"
          >
        </div>
      </div>

      <div class="settings-section">
        <h3>Search</h3>

        <div class="settings-group">
          <label
            class="settings-label"
            for="search-engine"
          >Default search engine</label>
          <select
            id="search-engine"
            v-model="searchEngine"
            @change="saveSetting('searchEngine', searchEngine)"
          >
            <option
              v-for="engine in searchEngines"
              :key="engine.value"
              :value="engine.value"
            >
              {{ engine.label }}
            </option>
          </select>
        </div>
      </div>

      <div class="settings-section">
        <h3>General</h3>

        <div class="settings-group">
          <label
            class="settings-label"
            for="new-tab-url"
          >New tab URL</label>
          <input
            id="new-tab-url"
            v-model="newTabUrl"
            type="text"
            placeholder="e.g. https://www.baidu.com"
            @change="saveSetting('newTabUrl', newTabUrl)"
          >
        </div>

        <div class="settings-group">
          <label
            class="settings-label"
            for="default-zoom"
          >Default zoom</label>
          <div class="zoom-control">
            <input
              id="default-zoom"
              v-model.number="defaultZoom"
              type="number"
              min="0.5"
              max="3"
              step="0.1"
              @change="saveSetting('defaultZoom', defaultZoom)"
            >
            <span class="zoom-value">{{ (defaultZoom * 100).toFixed(0) }}%</span>
          </div>
        </div>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import type { ThemeMode } from '@browser/ipc-contract'
import { onMounted, ref } from 'vue'

const themeModes: { label: string, value: ThemeMode }[] = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'System', value: 'system' },
]

const searchEngines: { label: string, value: string }[] = [
  { label: 'Google', value: 'google' },
  { label: 'Baidu', value: 'baidu' },
  { label: 'Bing', value: 'bing' },
]

const themeMode = ref<ThemeMode>('dark')
const downloadPath = ref('')
const searchEngine = ref('google')
const newTabUrl = ref('')
const defaultZoom = ref(1.0)

async function loadSettings(): Promise<void> {
  const allSettings = await window.browserAPI.getAllSettings()

  themeMode.value = (allSettings.theme as ThemeMode) ?? 'dark'
  downloadPath.value = (allSettings.downloadPath as string) ?? ''
  searchEngine.value = (allSettings.searchEngine as string) ?? 'google'
  newTabUrl.value = (allSettings.newTabUrl as string) ?? ''
  defaultZoom.value = Number(allSettings.defaultZoom) ?? 1.0
}

async function onThemeChange(): Promise<void> {
  applyTheme(themeMode.value)
  await window.browserAPI.setTheme(themeMode.value)
  await saveSetting('theme', themeMode.value)
}

function applyTheme(mode: ThemeMode): void {
  const el = document.documentElement
  if (mode === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    el.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
  }
  else {
    el.setAttribute('data-theme', mode)
  }
}

async function saveSetting(key: string, value: unknown): Promise<void> {
  try {
    await window.browserAPI.setSetting({ key, value })
  }
  catch (err) {
    console.error(`Failed to save setting ${key}:`, err)
  }
}

onMounted(async () => {
  await loadSettings()
  applyTheme(themeMode.value)
})
</script>

<style scoped>
.settings-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 20px;
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow-y: auto;
}

.settings-title {
  margin: 0 0 20px;
  font-size: 20px;
  font-weight: 600;
}

.settings-section {
  margin-bottom: 28px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border-color);
}

.settings-section:last-child {
  border-bottom: none;
}

.settings-section h3 {
  margin: 0 0 16px;
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}

.settings-group {
  margin-bottom: 16px;
}

.settings-group:last-child {
  margin-bottom: 0;
}

.settings-label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  color: var(--text-primary);
}

.settings-view input[type="text"],
.settings-view input[type="number"],
.settings-view select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.settings-view input[type="text"]:focus,
.settings-view input[type="number"]:focus,
.settings-view select:focus {
  border-color: var(--accent-color);
}

.settings-view input[type="text"]::placeholder {
  color: var(--text-secondary);
}

.settings-radio-group {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.settings-radio {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-primary);
}

.settings-radio input[type="radio"] {
  accent-color: var(--accent-color);
  width: 16px;
  height: 16px;
}

.zoom-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

.zoom-control input[type="number"] {
  width: 100px;
}

.zoom-value {
  font-size: 14px;
  color: var(--text-secondary);
}
</style>
