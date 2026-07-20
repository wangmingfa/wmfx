<template>
  <Section :title="t('settings.sections.basic')">
    <SectionItem :label="t('settings.searchEngine')">
      <NSelect
        v-model:value="searchEngine"
        :options="searchEngines"
        @update:value="saveSetting('searchEngine', $event)"
      />
    </SectionItem>

    <SectionItem :label="t('settings.searchSuggestions')">
      <NSwitch v-model:value="searchSuggestions" />
    </SectionItem>

    <SectionItem :label="t('settings.launchBehavior')">
      <NSelect
        v-model:value="launchBehavior"
        :options="launchBehaviorOptions"
        @update:value="saveSetting('launchBehavior', $event)"
      />
    </SectionItem>

    <SectionItem :label="t('settings.newTabUrl')">
      <NInput
        v-model:value="newTabUrl"
        :placeholder="t('settings.zoomPlaceholder')"
        @update:value="saveSetting('newTabUrl', $event)"
      />
    </SectionItem>

    <SectionItem :label="t('settings.defaultFont')">
      <NSelect
        v-model:value="defaultFont"
        :options="fontOptions"
        @update:value="saveSetting('defaultFont', $event)"
      />
    </SectionItem>

    <SectionItem :label="t('settings.defaultFontSize')">
      <NSelect
        v-model:value="defaultFontSize"
        :options="fontSizeOptions"
        @update:value="saveSetting('defaultFontSize', $event)"
      />
    </SectionItem>

    <SectionItem :label="t('settings.defaultEncoding')">
      <NSelect
        v-model:value="defaultEncoding"
        :options="encodingOptions"
        @update:value="saveSetting('defaultEncoding', $event)"
      />
    </SectionItem>
  </Section>

  <Section :title="t('settings.sections.appearance')">
    <SectionItem :label="t('settings.defaultZoom')">
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
    </SectionItem>

    <SectionItem :label="t('settings.openInNewTab')">
      <NSwitch v-model:value="openInNewTab" />
    </SectionItem>

    <SectionItem :label="t('settings.openBookmarkInNewTab')">
      <NSwitch v-model:value="openBookmarkInNewTabSetting" />
    </SectionItem>
  </Section>

  <Section :title="t('settings.sections.system')">
    <SectionItem :label="t('settings.defaultBrowser')">
      <div class="default-browser-row">
        <span
          v-if="isDefaultBrowser"
          class="default-browser-status"
        >{{ t('settings.isDefaultBrowser') }}</span>
        <span
          v-else-if="failedTip"
          class="default-browser-status error"
        >{{ t('settings.defaultBrowserFailed') }}</span>
        <span
          v-else
          class="default-browser-status muted"
        >{{ t('settings.notDefaultBrowser') }}</span>
        <NButton
          type="primary"
          :disabled="isDefaultBrowser"
          :loading="setting"
          @click="makeDefault"
        >
          {{ t('settings.makeDefault') }}
        </NButton>
      </div>
    </SectionItem>
  </Section>

  <Section :title="t('settings.sections.language')">
    <SectionItem :label="t('settings.language')">
      <NSelect
        v-model:value="currentLang"
        :options="languageOptions"
        @update:value="saveLanguage()"
      />
    </SectionItem>
  </Section>
</template>

<script setup lang="ts">
import { NButton, NInput, NSelect, NSlider, NSwitch } from 'naive-ui'
import { computed, onMounted, ref, watch } from 'vue'
import Section from '@/components/Section.vue'
import SectionItem from '@/components/SectionItem.vue'
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
const openBookmarkInNewTabSetting = ref(false)
const searchSuggestions = ref(true)
const launchBehavior = ref('restore')
const defaultFont = ref('system-ui')
const defaultFontSize = ref(16)
const defaultEncoding = ref('utf-8')

const fontOptions = [
  { label: '系统默认', value: 'system-ui' },
  { label: '无衬线', value: 'sans-serif' },
  { label: '衬线', value: 'serif' },
  { label: '等宽', value: 'monospace' },
]

const fontSizeOptions = [
  { label: '12px', value: 12 },
  { label: '14px', value: 14 },
  { label: '16px', value: 16 },
  { label: '18px', value: 18 },
  { label: '20px', value: 20 },
  { label: '24px', value: 24 },
]

const encodingOptions = [
  { label: 'UTF-8', value: 'utf-8' },
  { label: 'GBK', value: 'gbk' },
  { label: 'GB2312', value: 'gb2312' },
  { label: 'Big5', value: 'big5' },
  { label: 'Shift_JIS', value: 'shift_jis' },
  { label: 'ISO-8859-1', value: 'iso-8859-1' },
]

const launchBehaviorOptions = [
  { label: t('settings.launchBehaviorOptions.restore'), value: 'restore' },
  { label: t('settings.launchBehaviorOptions.newtab'), value: 'newtab' },
  { label: t('settings.launchBehaviorOptions.homepage'), value: 'homepage' },
]

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
  if (isDefaultBrowser.value || setting.value)
    return
  setting.value = true
  failedTip.value = false
  try {
    const res = await window.browserAPI.setDefaultBrowser()
    isDefaultBrowser.value = res.success
    if (!res.success)
      failedTip.value = true
  }
  catch (err) {
    console.error('[Settings/General] Failed to set default browser:', err)
    failedTip.value = true
  }
  finally {
    setting.value = false
  }
}

async function saveSetting(key: string, value: unknown): Promise<void> {
  console.debug('[Settings/General] saveSetting: key', key)
  try {
    await window.browserAPI.setSetting({ key, value })
  }
  catch (err) {
    console.error(`[Settings/General] Failed to save setting ${key}:`, err)
  }
}

async function saveLanguage(): Promise<void> {
  console.debug('[Settings/General] saveLanguage: lang', currentLang.value)
  try {
    await window.browserAPI.setSetting({ key: 'currentLang', value: currentLang.value })
    setLang(currentLang.value)
  }
  catch (err) {
    console.error('[Settings/General] Failed to save language setting:', err)
  }
}

async function loadSettings(): Promise<void> {
  console.debug('[Settings/General] loadSettings')
  const allSettings = await window.browserAPI.getAllSettings()
  searchEngine.value = (allSettings.searchEngine as string) ?? 'google'
  newTabUrl.value = (allSettings.newTabUrl as string) ?? ''
  defaultZoom.value = Number(allSettings.defaultZoom) ?? 1.0
  const saved = await window.browserAPI.getSetting('newTabOpenInNewTab')
  if (typeof saved === 'boolean') {
    openInNewTab.value = saved
  }
  openBookmarkInNewTabSetting.value = Boolean(await window.browserAPI.getSetting('openBookmarkInNewTab'))
  searchSuggestions.value = Boolean(await window.browserAPI.getSetting('searchSuggestions'))
  launchBehavior.value = ((await window.browserAPI.getSetting('launchBehavior')) as string) ?? 'restore'
  defaultFont.value = ((await window.browserAPI.getSetting('defaultFont')) as string) ?? 'system-ui'
  defaultFontSize.value = Number(await window.browserAPI.getSetting('defaultFontSize')) ?? 16
  defaultEncoding.value = ((await window.browserAPI.getSetting('defaultEncoding')) as string) ?? 'utf-8'
  const langSaved = (await window.browserAPI.getSetting('currentLang')) as string
  currentLang.value = langSaved ?? 'zh-CN'
  setLang(currentLang.value)
  isDefaultBrowser.value = await window.browserAPI.isDefaultBrowser()
}

onMounted(loadSettings)

watch(openInNewTab, (value) => {
  console.debug('[Settings/General] watch openInNewTab', value)
  void saveSetting('newTabOpenInNewTab', value)
})

watch(openBookmarkInNewTabSetting, (value) => {
  console.debug('[Settings/General] watch openBookmarkInNewTab', value)
  void saveSetting('openBookmarkInNewTab', value)
})

watch(searchSuggestions, (value) => {
  void saveSetting('searchSuggestions', value)
})

watch(launchBehavior, (value) => {
  void saveSetting('launchBehavior', value)
})

watch(defaultFont, (value) => {
  void saveSetting('defaultFont', value)
})

watch(defaultFontSize, (value) => {
  void saveSetting('defaultFontSize', value)
})

watch(defaultEncoding, (value) => {
  void saveSetting('defaultEncoding', value)
})
</script>
