<template>
  <div class="settings-page">
    <h3>General</h3>

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

    <div class="settings-group settings-switch-row">
      <label class="settings-label">在新标签页打开链接</label>
      <Switch v-model:checked="openInNewTab" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import Switch from '../../components/ui/switch/Switch.vue'

const searchEngines: { label: string, value: string }[] = [
  { label: 'Google', value: 'google' },
  { label: 'Baidu', value: 'baidu' },
  { label: 'Bing', value: 'bing' },
]

const searchEngine = ref('google')
const newTabUrl = ref('')
const defaultZoom = ref(1.0)
const openInNewTab = ref(true)

async function saveSetting(key: string, value: unknown): Promise<void> {
  try {
    await window.browserAPI.setSetting({ key, value })
  }
  catch (err) {
    console.error(`Failed to save setting ${key}:`, err)
  }
}

async function loadSettings(): Promise<void> {
  const allSettings = await window.browserAPI.getAllSettings()
  searchEngine.value = (allSettings.searchEngine as string) ?? 'google'
  newTabUrl.value = (allSettings.newTabUrl as string) ?? ''
  defaultZoom.value = Number(allSettings.defaultZoom) ?? 1.0
  const saved = await window.browserAPI.getSetting('newTabOpenInNewTab')
  if (typeof saved === 'boolean') {
    openInNewTab.value = saved
  }
}

onMounted(loadSettings)

// 同标签/新标签开关持久化（原 NewTab 内联设置，迁移至此）
watch(openInNewTab, (value) => {
  void saveSetting('newTabOpenInNewTab', value)
})
</script>
