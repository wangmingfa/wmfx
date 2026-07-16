<template>
  <SettingsSection :title="t('settings.sections.basic')">
    <SettingsItem :label="t('settings.searchEngine')">
      <NSelect
        v-model:value="searchEngine"
        :options="searchEngines"
        @update:value="saveSetting('searchEngine', $event)"
      />
    </SettingsItem>

    <SettingsItem :label="t('settings.newTabUrl')">
      <NInput
        v-model:value="newTabUrl"
        :placeholder="t('settings.zoomPlaceholder')"
        @update:value="saveSetting('newTabUrl', $event)"
      />
    </SettingsItem>
  </SettingsSection>

  <SettingsSection :title="t('settings.sections.appearance')">
    <SettingsItem :label="t('settings.defaultZoom')">
      <div class="zoom-control">
        <span class="zoom-value">{{ (defaultZoom * 100).toFixed(0) }}%</span>
        <NSlider
          v-model:value="defaultZoom"
          :min="0.5"
          :max="3"
          step="mark"
          :marks="zoomMarks"
          :tooltip="false"
          @update:value="saveSetting('defaultZoom', $event)"
        />
      </div>
    </SettingsItem>

    <SettingsItem :label="t('settings.openInNewTab')">
      <NSwitch v-model:value="openInNewTab" />
    </SettingsItem>
  </SettingsSection>

  <SettingsSection :title="t('settings.sections.system')">
    <SettingsItem :label="t('settings.defaultBrowser')">
      <div class="default-browser-row">
        <span v-if="isDefaultBrowser" class="default-browser-status">{{ t('settings.isDefaultBrowser') }}</span>
        <span v-else-if="failedTip" class="default-browser-status error">{{ t('settings.defaultBrowserFailed') }}</span>
        <span v-else class="default-browser-status muted">{{ t('settings.notDefaultBrowser') }}</span>
        <NButton type="primary" :disabled="isDefaultBrowser" :loading="setting" @click="makeDefault">
          {{ t('settings.makeDefault') }}
        </NButton>
      </div>
    </SettingsItem>
  </SettingsSection>

  <SettingsSection :title="t('settings.sections.language')">
    <SettingsItem :label="t('settings.language')">
      <NSelect v-model:value="currentLang" :options="languageOptions" @update:value="saveLanguage()" />
    </SettingsItem>
  </SettingsSection>
</template>

<script setup lang="ts">
import { NButton, NInput, NSelect, NSlider, NSwitch } from 'naive-ui'
import { computed, onMounted, ref, watch } from 'vue'
import SettingsItem from '@/components/SettingsItem.vue'
import SettingsSection from '@/components/SettingsSection.vue'
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

// 缩放滑块刻度：50% / 100% / 150% / 200% / 250% / 300%（对应值 0.5~3.0）
const zoomMarks: Record<number, string> = {
  0.5: '50%',
  1: '100%',
  1.5: '150%',
  2: '200%',
  2.5: '250%',
  3: '300%',
}

const languageOptions = computed(() => [
  { label: t('settings.languageOptions.system'), value: 'system' },
  { label: t('settings.languageOptions.chinese'), value: 'zh-CN' },
  { label: t('settings.languageOptions.english'), value: 'en-US' },
])

const currentLang = ref('zh-CN')

const isDefaultBrowser = ref(false)
const setting = ref(false)
const failedTip = ref(false)

async function makeDefault(): Promise<void> {
  if (isDefaultBrowser.value || setting.value) return
  setting.value = true
  failedTip.value = false
  try {
    const res = await window.browserAPI.setDefaultBrowser()
    isDefaultBrowser.value = res.success
    if (!res.success) failedTip.value = true
  } catch (err) {
    console.error('Failed to set default browser:', err)
    failedTip.value = true
  } finally {
    setting.value = false
  }
}

async function saveSetting(key: string, value: unknown): Promise<void> {
  try {
    await window.browserAPI.setSetting({ key, value })
  } catch (err) {
    console.error(`Failed to save setting ${key}:`, err)
  }
}

async function saveLanguage(): Promise<void> {
  try {
    await window.browserAPI.setSetting({ key: 'currentLang', value: currentLang.value })
    setLang(currentLang.value)
  } catch (err) {
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
  isDefaultBrowser.value = await window.browserAPI.isDefaultBrowser()
}

onMounted(loadSettings)

watch(openInNewTab, (value) => {
  void saveSetting('newTabOpenInNewTab', value)
})
</script>
