<template>
  <div class="settings-page">
    <h3>{{ t('settings.navAppearance') }}</h3>

    <div class="settings-group">
      <label class="settings-label">{{ t('settings.theme') }}</label>
      <NRadioGroup
        :value="themeSetting"
        class="settings-radio-group"
        @update:value="onThemeChange"
      >
        <NRadio
          v-for="mode in themeModes"
          :key="mode.value"
          :value="mode.value"
          :label="mode.label"
        />
      </NRadioGroup>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ThemeMode } from '@browser/ipc-contract'
import { NRadio, NRadioGroup } from 'naive-ui'
import { useI18n } from '@/composables/useI18n'
import { useTheme } from '@/composables/useTheme'

const { t } = useI18n()
const { themeSetting } = useTheme()

const themeModes: { label: string, value: ThemeMode }[] = [
  { label: t('settings.themeModes.light'), value: 'light' },
  { label: t('settings.themeModes.dark'), value: 'dark' },
  { label: t('settings.themeModes.system'), value: 'system' },
]

async function onThemeChange(theme: ThemeMode): Promise<void> {
  await window.browserAPI.setTheme(theme)
}
</script>
