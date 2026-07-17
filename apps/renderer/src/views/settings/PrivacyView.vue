<template>
  <SettingsSection :title="t('settings.sections.privacy')">
    <SettingsItem :label="t('settings.clearDataDesc')">
      <NButton @click="showDialog = true">
        {{ t('settings.openClearDialog') }}
      </NButton>
    </SettingsItem>
    <ClearDataDialog v-model:show="showDialog" />
  </SettingsSection>
</template>

<script setup lang="ts">
import { NButton } from 'naive-ui'
import { ref } from 'vue'
import ClearDataDialog from '@/components/ClearDataDialog.vue'
import SettingsItem from '@/components/SettingsItem.vue'
import SettingsSection from '@/components/SettingsSection.vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
const showDialog = ref(false)
</script>
