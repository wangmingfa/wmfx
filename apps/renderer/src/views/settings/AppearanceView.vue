<template>
  <Section :title="t('settings.sections.theme')">
    <SectionItem :label="t('settings.theme')">
      <NRadioGroup :value="themeSetting" class="settings-radio-group" @update:value="onThemeChange">
        <NRadio v-for="mode in themeModes" :key="mode.value" :value="mode.value" :label="mode.label" />
      </NRadioGroup>
    </SectionItem>
  </Section>
</template>

<script setup lang="ts">
import type { ThemeMode } from '@browser/ipc-contract'
import { NRadio, NRadioGroup } from 'naive-ui'
import Section from '@/components/Section.vue'
import SectionItem from '@/components/SectionItem.vue'
import { useI18n } from '@/composables/useI18n'
import { useTheme } from '@/composables/useTheme'

const { t } = useI18n()
const { themeSetting } = useTheme()

const themeModes: { label: string; value: ThemeMode }[] = [
  { label: t('settings.themeModes.light'), value: 'light' },
  { label: t('settings.themeModes.dark'), value: 'dark' },
  { label: t('settings.themeModes.system'), value: 'system' },
]

async function onThemeChange(theme: ThemeMode): Promise<void> {
  console.debug('[Appearance] onThemeChange: theme', theme)
  await window.browserAPI.setTheme(theme)
}
</script>
