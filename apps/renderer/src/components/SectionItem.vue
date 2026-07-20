<template>
  <div
    class="section-item"
    :class="{ 'section-item-hoverable': hover }"
  >
    <div
      v-if="label || $slots.label"
      class="section-item-label"
    >
      <slot name="label">
        {{ label }}
      </slot>
    </div>
    <div class="section-item-control">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 通用内容项：左右结构——左侧标签/内容（label 插槽，占满剩余空间、可省略号截断），右侧控件。
 * 相邻项之间用横线分割。既用于设置页的「标签+控件」行，也用于列表（如下载/历史）的每条数据：
 * 此时把图标+标题+描述放进 #label 插槽，把操作按钮放进默认插槽（控件区）。
 */
withDefaults(
  defineProps<{
    /** 左侧标签文本；也可用 #label 插槽自定义富内容 */
    label?: string
    /** 是否启用 hover 高亮背景效果（用于可点击的列表项）。默认开启 */
    hover?: boolean
  }>(),
  { label: '', hover: true },
)
</script>

<style scoped>
.section-item {
  width: 100%;
  /* 左右内边距放在 item 上，使分割线能贴到卡片左右边缘 */
  padding: 16px 20px;
  /* 左右结构：左侧内容占满、右侧控件靠右 */
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;

  /* 相邻项之间用横线分割，最后一项不画 */
  &:not(:last-child) {
    border-bottom: 1px solid var(--border-color);
  }
}

/* 可点击列表项的 hover 高亮背景，由 hover prop 控制（默认开启） */
.section-item-hoverable {
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    /* 列表行 hover 用更淡的专用变量，弱于全局 --bg-hover */
    background: var(--bg-hover-subtle);
  }
}

.section-item-label {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  color: var(--text-primary);
}

.section-item-control {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}

/* 右对齐的控件统一固定宽度，避免 input/select 过度拉伸 */
.section-item-control :deep(.n-input),
.section-item-control :deep(.n-input-number),
.section-item-control :deep(.n-slider),
.section-item-control :deep(.n-select),
.section-item-control :deep(.n-base-selection) {
  width: 240px;
  flex-shrink: 0;
}
</style>
