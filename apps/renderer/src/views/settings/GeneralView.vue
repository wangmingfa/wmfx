<template>
  <div class="settings-page">
    <h3>{{ t('settings.navGeneral') }}</h3>

    <div class="settings-group">
      <label
        class="settings-label"
        for="search-engine"
      >{{ t('settings.searchEngine') }}</label>
      <NSelect
        id="search-engine"
        v-model:value="searchEngine"
        :options="searchEngines"
        @update:value="saveSetting('searchEngine', $event)"
      />
    </div>

    <div class="settings-group">
      <label
        class="settings-label"
        for="new-tab-url"
      >{{ t('settings.newTabUrl') }}</label>
      <NInput
        id="new-tab-url"
        v-model:value="newTabUrl"
        :placeholder="t('settings.zoomPlaceholder')"
        @update:value="saveSetting('newTabUrl', $event)"
      />
    </div>

    <div class="settings-group">
      <label
        class="settings-label"
        for="default-zoom"
      >{{ t('settings.defaultZoom') }}</label>
      <div class="zoom-control">
        <NInputNumber
          id="default-zoom"
          v-model:value="defaultZoom"
          :min="0.5"
          :max="3"
          :step="0.1"
          @update:value="saveSetting('defaultZoom', $event)"
        />
        <span class="zoom-value">{{ (defaultZoom * 100).toFixed(0) }}%</span>
      </div>
    </div>

    <div class="settings-group settings-switch-row">
      <label class="settings-label">{{ t('settings.openInNewTab') }}</label>
      <NSwitch v-model:value="openInNewTab" />
    </div>

    <div class="settings-group">
      <label
        class="settings-label"
        for="language"
      >{{ t('settings.language') }}</label>
      <NSelect
        id="language"
        v-model:value="currentLang"
        :options="languageOptions"
        @update:value="saveLanguage()"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { NInput, NInputNumber, NSelect, NSwitch } from 'naive-ui'
import { computed, onMounted, ref, watch } from 'vue'
import { setLang, useI18n } from '@/composables/useI18n'

const { t } = useI18n()

const searchEngines = [
  { label: 'Google', value: 'google' },
  { label: 'Baidu', value: 'baidu' },
  { label: 'Bing', value: 'bing' },
]

const searchEngine = ref('google')
const newTabUrl = ref('')
const defaultZoom = ref(1.0)
const openInNewTab = ref(true)

const languageOptions = computed(() => [
  { label: t('settings.languageOptions.system'), value: 'system' },
  { label: t('settings.languageOptions.chinese'), value: 'zh-CN' },
  { label: t('settings.languageOptions.english'), value: 'en-US' },
])

const currentLang = ref('zh-CN')

async function saveSetting(key: string, value: unknown): Promise<void> {
  try {
    await window.browserAPI.setSetting({ key, value })
  }
  catch (err) {
    console.error(`Failed to save setting ${key}:`, err)
  }
}

async function saveLanguage(): Promise<void> {
  try {
    await window.browserAPI.setSetting({ key: 'currentLang', value: currentLang.value })
    setLang(currentLang.value)
  }
  catch (err) {
    console.error('Failed to save language setting:', err)
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
  const langSaved = (await window.browserAPI.getSetting('currentLang')) as string
  currentLang.value = langSaved ?? 'zh-CN'
  setLang(currentLang.value)
}

onMounted(loadSettings)

watch(openInNewTab, (value) => {
  void saveSetting('newTabOpenInNewTab', value)
})
</script>
