<template>
  <PageLayout :title="t('settings.navDownloads')" icon="mdi:download">
    <div class="settings-group">
      <label class="settings-label" for="download-path">{{ t('settings.downloadPath') }}</label>
      <NInput
        id="download-path"
        v-model:value="downloadPath"
        :placeholder="t('settings.downloadPathPlaceholder')"
        @update:value="saveSetting('downloadPath', $event)"
      />
    </div>
  </PageLayout>
</template>

<script setup lang="ts">
import { NInput } from 'naive-ui'
import { onMounted, ref } from 'vue'
import PageLayout from '@/components/PageLayout.vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

const downloadPath = ref('')

async function saveSetting(key: string, value: unknown): Promise<void> {
  try {
    await window.browserAPI.setSetting({ key, value })
  } catch (err) {
    console.error(`Failed to save setting ${key}:`, err)
  }
}

async function loadSettings(): Promise<void> {
  const allSettings = await window.browserAPI.getAllSettings()
  downloadPath.value = (allSettings.downloadPath as string) ?? ''
}

onMounted(loadSettings)
</script>
