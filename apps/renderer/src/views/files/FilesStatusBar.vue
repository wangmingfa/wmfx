<template>
  <div class="files-statusbar">
    <span class="status-count">{{ t('files.totalCount', { count: totalCount }) }}</span>
    <span
      v-if="selectedPhrase"
      class="status-count status-selected"
    >，{{ selectedPhrase }}</span>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '@/composables/useI18n'

/** 文件管理器状态栏：总条目数 + 选中摘要（数量与总大小） */
defineProps<{
  totalCount: number
  /** 选中状态文案（无选中时为空串，不渲染） */
  selectedPhrase: string
}>()

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
