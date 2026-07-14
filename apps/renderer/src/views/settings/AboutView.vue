<template>
  <div class="settings-page">
    <h3>Updates</h3>

    <div class="settings-group">
      <button
        class="settings-button"
        :disabled="updating"
        @click="checkUpdates"
      >
        {{ updating ? 'Checking…' : 'Check for updates' }}
      </button>
      <p class="update-status">
        {{ updateText }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

const updateText = ref('Up to date')
const updating = ref(false)

function statusToText(status: { state: string, percent?: number, info?: { version: string } }): string {
  switch (status.state) {
    case 'checking':
      return 'Checking for updates…'
    case 'available':
      return `Update available: v${status.info?.version ?? '?'}`
    case 'downloading':
      return `Downloading… ${Math.round(status.percent ?? 0)}%`
    case 'downloaded':
      return 'Update downloaded, will install on quit'
    case 'not-available':
      return 'Up to date'
    case 'error':
      return 'Update check failed'
    default:
      return 'Up to date'
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
