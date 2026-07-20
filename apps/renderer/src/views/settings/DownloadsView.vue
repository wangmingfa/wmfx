<template>
  <Section :title="t('settings.sections.downloadLocation')">
    <SectionItem :label="t('settings.downloadPath')">
      <div class="download-path-control">
        <span
          class="download-path-text"
          :class="{ 'is-empty': !downloadPath }"
        >
          {{ downloadPath || t('settings.downloadPathEmpty') }}
        </span>
        <NButton @click="chooseFolder">
          <template #icon>
            <Icon icon="mdi:folder-outline" />
          </template>
          {{ t('settings.selectFolder') }}
        </NButton>
      </div>
    </SectionItem>
  </Section>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { NButton } from 'naive-ui'
import { onMounted, ref } from 'vue'
import Section from '@/components/Section.vue'
import SectionItem from '@/components/SectionItem.vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

const downloadPath = ref('')

async function saveSetting(key: string, value: unknown): Promise<void> {
  console.debug('[Settings/Downloads] saveSetting: key', key)
  try {
    await window.browserAPI.setSetting({ key, value })
  }
  catch (err) {
    console.error(`[Settings/Downloads] Failed to save setting ${key}:`, err)
  }
}

async function chooseFolder(): Promise<void> {
  console.debug('[Settings/Downloads] chooseFolder')
  const selected = await window.browserAPI.selectFolder()
  if (selected) {
    downloadPath.value = selected
    await saveSetting('downloadPath', selected)
  }
}

async function loadSettings(): Promise<void> {
  console.debug('[Settings/Downloads] loadSettings')
  const allSettings = await window.browserAPI.getAllSettings()
  downloadPath.value = (allSettings.downloadPath as string) ?? ''
}

onMounted(loadSettings)
</script>

<style scoped>
.download-path-control {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  justify-content: flex-end;
}

.download-path-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  font-size: 14px;
  color: var(--text-primary);

  &.is-empty {
    color: var(--text-secondary);
  }
}
</style>
