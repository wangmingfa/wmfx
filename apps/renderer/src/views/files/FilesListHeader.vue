<template>
  <div
    class="list-header"
    :style="{ gridTemplateColumns: store!.listGridTemplate.value }"
  >
    <div class="list-header-icon" />
    <div
      v-for="col in store!.listColumns.value"
      :key="col.key"
      class="list-header-cell"
      :class="{ 'col-resizable': col.resizable, 'col-reorderable': col.reorderable }"
      :draggable="col.reorderable"
      @dragstart="store!.onColumnDragStart(col.key, $event)"
      @dragover.prevent
      @drop="store!.onColumnDrop(col.key)"
    >
      <span class="list-header-label">{{ store!.listColumnLabels[col.key] }}</span>
      <span
        v-if="col.resizable"
        class="list-header-resizer"
        @mousedown="store!.onColumnResizeStart(col.key, $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FileStore } from './useFileStore'
import { inject } from 'vue'

import { fileStoreInjectionKey } from './injectionKeys'

/**
 * 列表视图表头（仅 list 模式显示）：列标题渲染，
 * 列宽拖拽调整与列顺序拖拽重排通过 inject 的 store 处理。
 */
const store = inject<FileStore>(fileStoreInjectionKey)
</script>

<style scoped lang="less">
/* 列表视图表头 */
.list-header {
  display: grid;
  align-items: center;
  gap: 8px;
  height: 36px;
  /* 仅保留水平 padding 与 .file-item(padding:8px) + .files-list(padding:16px) 对齐：内容左缘 = 24px */
  padding: 0 24px;
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 2;
  user-select: none;

  .list-header-icon {
    width: 24px;
  }

  .list-header-cell {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    height: 100%;

    /* 列间竖线隔离（伪元素实现，避免用 border） */
    &::before {
      content: '';
      position: absolute;
      top: 6px;
      bottom: 6px;
      right: 0;
      width: 1px;
      background: var(--divider-color, var(--border-color));
    }

    /* 最后一列右侧不再画竖线 */
    &:last-child::before {
      display: none;
    }

    &.col-reorderable {
      cursor: grab;

      &:active {
        cursor: grabbing;
      }
    }
  }

  .list-header-resizer {
    position: absolute;
    top: 0;
    right: -4px;
    width: 8px;
    height: 100%;
    cursor: col-resize;
    z-index: 3;

    /* 悬停时高亮该列分隔竖线，提示可拖动调宽 */
    &:hover {
      &::before {
        content: '';
        position: absolute;
        top: 6px;
        bottom: 6px;
        left: 3px;
        width: 2px;
        border-radius: 1px;
        background: var(--accent-color);
      }
    }
  }
}
</style>
