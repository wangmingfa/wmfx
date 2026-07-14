<template>
  <div class="settings-page">
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
</template>

<script setup lang="ts">
import type { ThemeMode } from '@browser/ipc-contract'
import { onMounted, ref } from 'vue'

const themeModes: { label: string, value: ThemeMode }[] = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'System', value: 'system' },
]

const themeMode = ref<ThemeMode>('dark')

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

async function onThemeChange(): Promise<void> {
  applyTheme(themeMode.value)
  await window.browserAPI.setTheme(themeMode.value)
  await window.browserAPI.setSetting({ key: 'theme', value: themeMode.value })
}

async function loadSettings(): Promise<void> {
  const allSettings = await window.browserAPI.getAllSettings()
  themeMode.value = (allSettings.theme as ThemeMode) ?? 'dark'
}

onMounted(async () => {
  await loadSettings()
  applyTheme(themeMode.value)
})
</script>
