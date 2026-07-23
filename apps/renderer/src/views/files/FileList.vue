<template>
  <div
    ref="fileListEl"
    class="files-list"
    :class="[
      store!.viewMode.value,
      {
        'drag-over': store!.dragOverFilesList.value,
        'marquee-active': store!.marqueeActive.value,
        'empty': !store!.showSkeleton.value && store!.directoryError.value === null && store!.fileEntries.value.length === 0,
      },
    ]"
    @click="store!.clearSelection($event)"
    @contextmenu="store!.showFileContextMenu($event)"
    @mousedown="store!.onMarqueeStart($event)"
  >
    <template v-if="store!.showSkeleton.value">
      <div class="files-loading-skeleton">
        <div
          v-for="i in 6"
          :key="i"
          class="skeleton-row"
        >
          <div class="skeleton-icon" />
          <div class="skeleton-text short" />
          <div class="skeleton-text long" />
          <div class="skeleton-text meta" />
        </div>
      </div>
    </template>
    <template v-else-if="store!.directoryError.value || store!.fileEntries.value.length === 0">
      <div class="files-empty-wrap">
        <div
          v-if="store!.directoryError.value"
          class="files-empty files-empty--warn"
        >
          <svg
            class="files-empty-icon"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            aria-hidden="true"
          >
            <path
              fill="currentColor"
              d="M12 2 1 21h22L12 2Zm0 5 7.5 13h-15L12 7Zm-1 4v4h2v-4h-2Zm0 5v2h2v-2h-2Z"
            />
          </svg>
          <span>{{ store!.directoryError.value }}</span>
        </div>
        <div
          v-else
          class="files-empty"
        >
          {{ t('files.emptyDir') }}
        </div>
      </div>
    </template>
    <template v-else>
      <div
        v-for="file in store!.sortedFiles.value"
        :key="file.path"
        class="file-item"
        :data-path="file.path"
        :class="[{ 'selected': store!.isSelected(file.path), 'folder': file.type === 'directory', 'dragging': store!.dragFiles.value.includes(file.path), 'marquee-hit': store!.marqueeHitPaths.value.includes(file.path) }]"
        :draggable="store!.isSelected(file.path)"
        @click="store!.handleItemClick(file, $event)"
        @dblclick="store!.handleItemDblClick(file)"
        @contextmenu.prevent="store!.showFileContextMenu($event, file)"
        @dragstart="store!.handleDragStart($event, file)"
        @dragend="store!.handleDragEnd()"
        @mouseenter="itemHovered = file.path"
        @mouseleave="itemHovered = ''"
      >
        <!-- 图标视图 -->
        <div
          v-if="store!.viewMode.value === 'icon'"
          class="file-icon-cell"
          :draggable="!store!.isSelected(file.path)"
        >
          <FileThumbnail
            v-if="isImageFile(file)"
            :file="file"
          />

          <Icon
            v-else
            :icon="getFileIcon(file)"
            :width="48"
            :height="48"
            class="file-icon-large"
            :style="{ color: getFileIconColor(file) }"
            :data-layout-id="file.path"
          />
          <span
            v-if="store!.renamingPath.value !== file.path"
            class="file-name-cell"
            :title="file.name"
          ><template
            v-for="(seg, si) in getHighlightParts(file.name)"
            :key="si"
          ><mark
            v-if="seg.hit"
            class="name-hit"
          >{{ seg.text }}</mark><template
            v-else
          >{{ seg.text }}</template></template></span>
          <input
            v-else
            :ref="(el) => store!.setFileRenameInput(el)"
            v-model="store!.renamingName.value"
            class="file-rename-input"
            :title="store!.renamingName.value"
            @click.stop
            @dblclick.stop
            @keydown.enter="store!.confirmRename()"
            @keydown.esc="store!.cancelRename()"
            @blur="store!.cancelRename()"
          />
        </div>
        <!-- 列表视图 -->
        <div
          v-else
          class="file-row-cell"
          :style="{ gridTemplateColumns: store!.listGridTemplate.value }"
          :draggable="store!.isSelected(file.path)"
        >
          <Icon
            :icon="getFileIcon(file)"
            :width="20"
            :height="20"
            class="file-icon-small"
            :style="{ color: getFileIconColor(file) }"
          />
          <template
            v-for="col in store!.listColumns.value"
            :key="col.key"
          >
            <input
              v-if="col.key === 'name' && store!.renamingPath.value === file.path"
              :ref="(el) => store!.setFileRenameInput(el)"
              v-model="store!.renamingName.value"
              class="file-rename-input"
              :title="store!.renamingName.value"
              @click.stop
              @dblclick.stop
              @keydown.enter="store!.confirmRename()"
              @keydown.esc="store!.cancelRename()"
              @blur="store!.cancelRename()"
            />
            <span
              v-else-if="col.key === 'name' && store!.searchQuery.value"
              class="file-cell cell-name"
              :title="file.name"
            ><span
              class="file-cell-content"
              draggable="true"
            ><template
              v-for="(seg, si) in getHighlightParts(file.name)"
              :key="si"
            ><mark
              v-if="seg.hit"
              class="name-hit"
            >{{ seg.text }}</mark><template
              v-else
            >{{ seg.text }}</template></template></span></span>
            <span
              v-else-if="col.key === 'name'"
              class="file-cell cell-name"
              :title="file.name"
            ><span
              class="file-cell-content"
              draggable="true"
            >{{ file.name }}</span></span>
            <span
              v-else
              class="file-cell"
              :class="`cell-${col.key}`"
              :title="store!.renderCellContent(file, col.key)"
            >{{ store!.renderCellContent(file, col.key) }}</span>
          </template>
        </div>
      </div>
    </template>
    <div
      v-if="store!.marqueeRect.value"
      class="marquee-box"
      :style="{
        left: `${store!.marqueeRect.value.left}px`,
        top: `${store!.marqueeRect.value.top}px`,
        width: `${store!.marqueeRect.value.right - store!.marqueeRect.value.left}px`,
        height: `${store!.marqueeRect.value.bottom - store!.marqueeRect.value.top}px`,
      }"
    />
  </div>
</template>

<script setup lang="ts">
import type { FileStore } from './useFileStore'

import { Icon } from '@iconify/vue'
import { inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from '@/composables/useI18n'
import FileThumbnail from './FileThumbnail.vue'
import { fileStoreInjectionKey } from './injectionKeys'

import { useFileDisplay } from './useFileDisplay'

/**
 * 文件列表区：图标/列表两种视图、骨架屏、空态/错误态、框选矩形。
 * 通过 inject 读取共享 FileStore，不再通过 props 接收状态和 emit 事件。
 */
const store = inject<FileStore>(fileStoreInjectionKey)
const { t } = useI18n()
const { getFileIcon, getFileIconColor, isImageFile } = useFileDisplay()

// 当前悬停项（组件内部状态）
const itemHovered = ref('')

/** 计算图标视图列数（基于实际 DOM grid 布局） */
function calcIconColumns(): number {
  const items = document.querySelectorAll('.file-item')
  if (items.length === 0) {
    return 1
  }
  const firstTop = items[0].getBoundingClientRect().top
  let count = 0
  for (const item of items) {
    if (Math.abs(item.getBoundingClientRect().top - firstTop) < 1) {
      count++
    } else {
      break
    }
  }
  return Math.max(1, count)
}

/** 图标列表容器 ref */
const fileListEl = ref<HTMLElement | null>(null)
let iconListResizeObserver: ResizeObserver | null = null

/** 更新图标视图列数 */
function updateIconColumnCount(): void {
  store!.iconColumnCount.value = calcIconColumns()
}

onMounted(() => {
  if (!fileListEl.value) {
    return
  }
  iconListResizeObserver = new ResizeObserver(() => {
    updateIconColumnCount()
  })
  iconListResizeObserver.observe(fileListEl.value)
  // 初始计算
  updateIconColumnCount()
})

// 文件列表内容或视图模式变化后，DOM grid 布局会改变但容器尺寸不变，
// ResizeObserver 不会触发，需在此主动重算列数，否则 iconColumnCount 会停留在初始的 1，
// 导致图标视图上下方向键退化成左右（步进 = 列数 = 1）。
watch(
  [() => store!.sortedFiles.value.length, () => store!.viewMode.value],
  updateIconColumnCount,
  { flush: 'post' },
)

onUnmounted(() => {
  iconListResizeObserver?.disconnect()
  iconListResizeObserver = null
})

// 文件名高亮分段：搜索时把命中的子串标记为 hit，渲染层用 <mark> 区分颜色
function getHighlightParts(name: string): Array<{ text: string, hit: boolean }> {
  const query = store!.searchQuery.value.trim().toLowerCase()
  if (!query) {
    return [{ text: name, hit: false }]
  }
  const lower = name.toLowerCase()
  const parts: Array<{ text: string, hit: boolean }> = []
  let start = 0
  let idx = lower.indexOf(query, start)
  if (idx === -1) {
    return [{ text: name, hit: false }]
  }
  while (idx !== -1) {
    if (idx > start) {
      parts.push({ text: name.slice(start, idx), hit: false })
    }
    parts.push({ text: name.slice(idx, idx + query.length), hit: true })
    start = idx + query.length
    idx = lower.indexOf(query, start)
  }
  if (start < name.length) {
    parts.push({ text: name.slice(start), hit: false })
  }
  return parts
}
</script>

<style scoped lang="less">
/* 文件列表 */
.files-list {
  flex: 1;
  min-height: 0;
  padding: 16px;
  overflow-y: auto;

  &.icon {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    align-content: start;
    align-items: start;
    gap: 16px;
  }

  &.list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &.drag-over {
    background: var(--bg-drag-over);
    outline: 2px dashed var(--accent-color);
    outline-offset: -2px;
    border-radius: 8px;
  }

  /* 空目录时关闭 grid 布局，改用 flex 居中 */
  &.empty {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }
}

/* 框选矩形 */
.marquee-box {
  position: absolute;
  background: var(--accent-color-translucent);
  border: 1px solid var(--accent-color);
  pointer-events: none;
  z-index: 5;
}

/* 框选命中高亮 */
.file-item.marquee-hit {
  background: var(--bg-selected);
}

/* 框选进行中禁用文本选择 */
.files-list.marquee-active {
  user-select: none;

  /* 框选期间 hover 不显示灰色背景，命中项保持选中样式 */
  .file-item:hover {
    background: transparent;
  }

  .file-item.marquee-hit:hover {
    background: var(--bg-selected);
  }
}

/* 列表视图文字内容子元素（仅它是拖拽手柄） */
.file-cell-content {
  max-width: 100%;
}

.file-item {
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
  user-select: none;

  &:hover {
    background: var(--bg-hover);
  }

  &.selected {
    background: var(--bg-selected);
  }

  &.dragging {
    opacity: 0.5;
  }
}

/* 图标视图 */
.file-icon-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;

  .file-icon-large {
    opacity: 0.9;
  }

  .file-thumbnail {
    width: 48px;
    height: 48px;
    object-fit: cover;
    border-radius: 6px;
  }

  .file-name-cell {
    min-height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    line-height: 1.3;
    word-break: break-all;
    max-width: 100%;
    color: var(--text-primary);
  }

  // 图标视图的重命名输入框与名称字号/居中保持一致，避免位置跳动
  .file-rename-input {
    font-size: 12px;
    text-align: center;
  }
}

/* 列表视图 */
.file-row-cell {
  display: grid;
  align-items: center;
  gap: 8px;

  .file-icon-small {
    opacity: 0.8;
  }
}

.file-cell {
  height: 22px;
  line-height: 22px;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary);

  &.cell-name {
    font-size: 13px;
  }

  &.cell-size {
    font-size: 12px;
    color: var(--text-secondary);
    text-align: right;
  }

  &.cell-kind,
  &.cell-date {
    font-size: 12px;
    color: var(--text-secondary);
    text-align: right;
  }
}

/* 搜索命中高亮：用强调色区分文件名中的匹配子串 */
.name-hit {
  background: transparent;
  color: var(--accent-color);
  font-weight: 600;
}

.file-rename-input {
  box-sizing: border-box;
  width: 100%;
  height: 22px;
  font-size: 13px;
  /* 保留左右内边距（视觉留白），用负 margin-left 抵消左边框+左内边距，使文字起点与未编辑文件名对齐，避免进入重命名时右移 */
  padding: 0 4px;
  margin-left: -5px;
  border: 1px solid var(--accent-color);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-primary);
  outline: none;
}

/* 状态 */
.files-loading-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 0;

  .skeleton-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 8px;
    border-radius: 6px;
  }

  .skeleton-icon {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    background: linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-elevated) 50%, var(--bg-hover) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }

  .skeleton-text {
    height: 14px;
    border-radius: 4px;
    background: linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-elevated) 50%, var(--bg-hover) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;

    &.short {
      width: 80px;
    }

    &.long {
      flex: 1;
    }

    &.meta {
      width: 120px;
    }
  }
}

.files-empty-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 100%;
  padding: 24px;
  box-sizing: border-box;
}

.files-empty {
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--text-muted);

  &.files-empty--warn {
    gap: 8px;
    margin: 24px auto;
    padding: 12px 16px;
    max-width: 420px;
    border-radius: 8px;
    border: 1px solid var(--warning-color, var(--divider-color));
    background: var(--warning-bg, var(--bg-drag-over));
    color: var(--warning-color, var(--text-secondary));
    font-size: 13px;

    .files-empty-icon {
      flex-shrink: 0;
    }
  }
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}
</style>
