<template>
  <div class="files-topbar">
    <div class="files-breadcrumb">
      <span
        v-for="(segment, idx) in segments"
        :key="idx"
        class="breadcrumb-item"
        @click="emit('navigateBreadcrumb', idx)"
      >
        {{ segment.label }}
        <Icon
          v-if="idx < segments.length - 1"
          icon="mdi:chevron-right"
          :width="14"
          :height="14"
          class="breadcrumb-separator"
        />
      </span>
    </div>

    <!-- 工具栏 -->
    <div class="files-toolbar">
      <NInput
        v-model:value="searchQuery"
        :placeholder="t('files.searchPlaceholder')"
        clearable
        size="small"
        class="toolbar-search"
        @update:value="emit('search')"
        @keydown.escape="emit('clearSearch')"
      >
        <template #prefix>
          <Icon
            icon="mdi:magnify"
            :width="16"
            :height="16"
            class="search-icon"
          />
        </template>
      </NInput>
      <div class="toolbar-actions">
        <NSelect
          class="sort-select"
          :value="sortBy"
          :options="sortOptions"
          size="small"
          :consistent-menu-width="false"
          @update:value="emit('sortChange', $event)"
        />
        <IconButton
          icon="mdi:view-list"
          :tooltip="t('files.listView')"
          :active="viewMode === 'list'"
          @click="viewMode = 'list'"
        />
        <IconButton
          icon="mdi:view-grid"
          :tooltip="t('files.iconView')"
          :active="viewMode === 'icon'"
          @click="viewMode = 'icon'"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { NInput, NSelect } from 'naive-ui'

import IconButton from '@/components/ui/IconButton.vue'
import { useI18n } from '@/composables/useI18n'

/**
 * 文件管理器顶栏：面包屑导航 + 工具栏（搜索、排序、视图模式切换）。
 * searchQuery / viewMode 通过 v-model 与父组件双向绑定。
 */
defineProps<{
  segments: Array<{ label: string, path: string }>
  sortBy: string
}>()

const emit = defineEmits<{
  navigateBreadcrumb: [index: number]
  search: []
  clearSearch: []
  sortChange: [value: string]
}>()

const searchQuery = defineModel<string>('searchQuery', { default: '' })
const viewMode = defineModel<'icon' | 'list'>('viewMode', { default: 'icon' })

const { t } = useI18n()

const sortOptions = [
  { label: t('files.sortName'), value: 'name' },
  { label: t('files.sortSize'), value: 'size' },
  { label: t('files.sortModified'), value: 'modified' },
  { label: t('files.sortType'), value: 'type' },
]
</script>

<style scoped lang="less">
/* 顶栏：面包屑 + 工具栏 合并单行 */
.files-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 16px;
  border-bottom: 1px solid var(--border-color);
}

/* 面包屑 */
.files-breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 1 auto;
  min-width: 0;
  font-size: 14px;
  overflow-x: auto;
  white-space: nowrap;

  .breadcrumb-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-muted);
    transition: background 0.15s;

    &:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
  }

  .breadcrumb-separator {
    opacity: 0.5;
  }
}

/* 工具栏 */
.files-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
  flex-shrink: 0;

  .toolbar-search {
    width: 240px;
    flex-shrink: 0;

    /* 聚焦时主色边框（覆盖 NInput 默认边框变量） */
    .n-input {
      --n-border-hover: var(--accent-color);
      --n-border-focus: var(--accent-color);
    }
  }

  .search-icon {
    opacity: 0.5;
  }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sort-select {
    width: 98px;
  }
}
</style>
