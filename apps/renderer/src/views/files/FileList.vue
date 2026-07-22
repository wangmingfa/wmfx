<template>
  <div
    class="files-list"
    :class="[viewMode, { 'drag-over': dragOverFilesList, 'marquee-active': marqueeActive }]"
    @click="emit('listClick', $event)"
    @contextmenu="emit('listContextMenu', $event)"
    @mousedown="emit('marqueeStart', $event)"
    @dragover="emit('listDragOver', $event)"
    @dragleave="emit('listDragLeave')"
    @drop="emit('listDrop', $event)"
  >
    <template v-if="showSkeleton">
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
    <template v-else-if="directoryError || isEmpty">
      <div class="files-empty-wrap">
        <div
          v-if="directoryError"
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
          <span>{{ directoryError }}</span>
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
        v-for="file in files"
        :key="file.path"
        class="file-item"
        :data-path="file.path"
        :class="[{ 'selected': isSelected(file.path), 'folder': file.isDir, 'dragging': dragFiles.includes(file.path), 'marquee-hit': marqueeHitPaths.includes(file.path) }]"
        :draggable="isSelected(file.path)"
        @click="emit('itemClick', file, $event)"
        @dblclick="emit('itemDblClick', file)"
        @contextmenu.prevent="emit('itemContextMenu', $event, file)"
        @dragstart="emit('itemDragStart', $event, file)"
        @dragend="emit('itemDragEnd')"
        @mouseenter="itemHovered = file.path"
        @mouseleave="itemHovered = ''"
      >
        <!-- 图标视图 -->
        <div
          v-if="viewMode === 'icon'"
          class="file-icon-cell"
          :draggable="!isSelected(file.path)"
        >
          <Icon
            :icon="getFileIcon(file)"
            :width="48"
            :height="48"
            class="file-icon-large"
            :style="{ color: getFileIconColor(file) }"
          />
          <span
            v-if="renamingPath !== file.path"
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
            :ref="(el) => setRenameInput(el)"
            v-model="renamingName"
            class="file-rename-input"
            :title="renamingName"
            @click.stop
            @dblclick.stop
            @keydown.enter="emit('renameConfirm')"
            @keydown.esc="emit('renameKeydown')"
            @blur="emit('renameBlur')"
          />
        </div>
        <!-- 列表视图 -->
        <div
          v-else
          class="file-row-cell"
          :style="{ gridTemplateColumns: gridTemplate }"
          :draggable="isSelected(file.path)"
        >
          <Icon
            :icon="getFileIcon(file)"
            :width="20"
            :height="20"
            class="file-icon-small"
            :style="{ color: getFileIconColor(file) }"
          />
          <template
            v-for="col in columns"
            :key="col.key"
          >
            <input
              v-if="col.key === 'name' && renamingPath === file.path"
              :ref="(el) => setRenameInput(el)"
              v-model="renamingName"
              class="file-rename-input"
              :title="renamingName"
              @click.stop
              @dblclick.stop
              @keydown.enter="emit('renameConfirm')"
              @keydown.esc="emit('renameKeydown')"
              @blur="emit('renameBlur')"
            />
            <span
              v-else-if="col.key === 'name' && searchQuery"
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
              :title="renderCellContent(file, col.key)"
            >{{ renderCellContent(file, col.key) }}</span>
          </template>
        </div>
      </div>
    </template>
    <div
      v-if="marqueeRect"
      class="marquee-box"
      :style="{
        left: `${marqueeRect.left}px`,
        top: `${marqueeRect.top}px`,
        width: `${marqueeRect.right - marqueeRect.left}px`,
        height: `${marqueeRect.bottom - marqueeRect.top}px`,
      }"
    />
  </div>
</template>

<script setup lang="ts">
import type { FileEntry } from '@browser/ipc-contract'
import type { ListViewColumn } from './useListColumns'
import { Icon } from '@iconify/vue'

import { ref } from 'vue'

import { useI18n } from '@/composables/useI18n'
import { useFileDisplay } from './useFileDisplay'

/**
 * 文件列表区：图标/列表两种视图、骨架屏、空态/错误态、框选矩形。
 * 交互（点击/双击/右键/拖拽/框选/重命名）统一 emit 给 FilesView 处理。
 */
const props = defineProps<{
  viewMode: 'icon' | 'list'
  files: FileEntry[]
  selectedPaths: string[]
  renamingPath: string | null
  dragFiles: string[]
  marqueeHitPaths: string[]
  marqueeActive: boolean
  marqueeRect: { left: number, top: number, right: number, bottom: number } | null
  dragOverFilesList: boolean
  showSkeleton: boolean
  directoryError: string | null
  isEmpty: boolean
  searchQuery: string
  columns: ListViewColumn[]
  gridTemplate: string
  /** 重命名输入框绑定（v-for 内同一时刻仅一个渲染，函数 ref 确保正确绑定） */
  setRenameInput: (el: unknown) => void
  /** 按列渲染单元格内容（来自 useListColumns） */
  renderCellContent: (file: FileEntry, key: ListViewColumn['key']) => string
}>()

const emit = defineEmits<{
  listClick: [event: MouseEvent]
  listContextMenu: [event: MouseEvent]
  marqueeStart: [event: MouseEvent]
  listDragOver: [event: DragEvent]
  listDragLeave: []
  listDrop: [event: DragEvent]
  itemClick: [file: FileEntry, event: MouseEvent]
  itemDblClick: [file: FileEntry]
  itemContextMenu: [event: MouseEvent, file: FileEntry]
  itemDragStart: [event: DragEvent, file: FileEntry]
  itemDragEnd: []
  renameConfirm: []
  renameKeydown: []
  renameBlur: []
}>()

const renamingName = defineModel<string>('renamingName', { default: '' })

const { t } = useI18n()
const { getFileIcon, getFileIconColor } = useFileDisplay()

// 当前悬停项（预留态，供后续悬停操作按钮使用）
const itemHovered = ref('')

// 选中状态
function isSelected(path: string): boolean {
  return props.selectedPaths.includes(path)
}

// 文件名高亮分段：搜索时把命中的子串标记为 hit，渲染层用 <mark> 区分颜色
function getHighlightParts(name: string): Array<{ text: string, hit: boolean }> {
  const query = props.searchQuery.trim().toLowerCase()
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
  height: 100%;
  min-height: 200px;
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
