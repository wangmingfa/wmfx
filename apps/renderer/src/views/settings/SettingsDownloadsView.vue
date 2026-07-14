<template>
  <div class="settings-page">
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
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

const downloadPath = ref('')

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
  downloadPath.value = (allSettings.downloadPath as string) ?? ''
}

onMounted(loadSettings)
</script>
