<template>
  <div class="settings-item">
    <div v-if="label || $slots.label" class="settings-item-label">
      <slot name="label">
        {{ label }}
      </slot>
    </div>
    <div class="settings-item-control">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
/** 设置内容项：左右结构——左侧标签、右侧控件；相邻项之间用横线分割。
 * 内部内容随意放置，但建议左侧传 label、右侧放控件，形成统一的左右对齐布局 */
withDefaults(
  defineProps<{
    /** 左侧标签文本；也可用 #label 插槽自定义 */
    label?: string
  }>(),
  { label: '' },
)
</script>

<style scoped>
.settings-item {
  width: 100%;
  /* 左右内边距放在 item 上，使分割线能贴到卡片左右边缘 */
  padding: 16px 20px;
  /* 左右结构：标签靠左、控件靠右并允许换行 */
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;

  /* 相邻项之间用横线分割，最后一项不画（避免与下一分组/页面底部多余留白冲突） */
  &:not(:last-child) {
    border-bottom: 1px solid var(--border-color);
  }
}

.settings-item-label {
  flex-shrink: 0;
  font-size: 14px;
  color: var(--text-primary);
}

.settings-item-control {
  flex: 1;
  display: flex;
  justify-content: flex-end;
  min-width: 0;
}

/* 右对齐的控件统一固定宽度，避免 input/select 过度拉伸 */
.settings-item-control :deep(.n-input),
.settings-item-control :deep(.n-input-number),
.settings-item-control :deep(.n-slider),
.settings-item-control :deep(.n-select),
.settings-item-control :deep(.n-base-selection) {
  width: 240px;
  flex-shrink: 0;
}
</style>
