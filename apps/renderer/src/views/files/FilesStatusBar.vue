<template>
  <div class="files-statusbar">
    <span class="status-count">{{ t('files.totalCount', { count: store!.fileEntries.value.length }) }}</span>
    <span
      v-if="store!.selectedPhrase.value"
      class="status-count status-selected"
    >，{{ store!.selectedPhrase.value }}</span>
  </div>
</template>

<script setup lang="ts">
import type { FileStore } from './useFileStore'
import { inject } from 'vue'
import { useI18n } from '@/composables/useI18n'
import { fileStoreInjectionKey } from './injectionKeys'

const store = inject<FileStore>(fileStoreInjectionKey)
const { t } = useI18n()
</script>

<style scoped lang="less">
/* 状态栏 */
.files-statusbar {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-muted);

  .status-selected {
    color: var(--accent-color);
  }
}
</style>
