<template>
  <div class="settings-page">
    <h3>{{ t('about.updates') }}</h3>

    <div class="settings-group">
      <button
        class="settings-button"
        :disabled="updating"
        @click="checkUpdates"
      >
        {{ updating ? t('about.checking') : t('about.checkForUpdates') }}
      </button>
      <p class="update-status">
        {{ updateText }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

const updateText = ref(t('about.upToDate'))
const updating = ref(false)

function statusToText(status: { state: string, percent?: number, info?: { version: string } }): string {
  switch (status.state) {
    case 'checking':
      return t('about.checking')
    case 'available':
      return t('about.updateAvailable').replace('{version}', status.info?.version ?? '?')
    case 'downloading':
      return t('about.downloading').replace('{percent}', String(Math.round(status.percent ?? 0)))
    case 'downloaded':
      return t('about.downloaded')
    case 'not-available':
      return t('about.notAvailable')
    case 'error':
      return t('about.updateFailed')
    default:
      return t('about.upToDate')
  }
}

async function checkUpdates(): Promise<void> {
  updating.value = true
  try {
    await window.browserAPI.checkForUpdates()
  }
  finally {
    updating.value = false
  }
}

function handleUpdaterStatus(status: { state: string, percent?: number, info?: { version: string } }): void {
  updateText.value = statusToText(status)
}

onMounted(async () => {
  const status = await window.browserAPI.getUpdaterStatus()
  updateText.value = statusToText(status)
  window.browserAPI.onUpdaterStatus(handleUpdaterStatus)
})
</script>
