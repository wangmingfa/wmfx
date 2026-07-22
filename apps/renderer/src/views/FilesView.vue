<template>
  <div
    class="files-view"
    :class="{ 'files--loading': showSkeleton }"
    @contextmenu.prevent
  >
    <!-- 左侧快捷访问 -->
    <aside class="files-sidebar">
      <div class="sidebar-section">
        <div class="sidebar-header">
          {{ t('files.systemDirs') }}
        </div>
        <div
          v-for="dir in systemDirs"
          :key="dir.path"
          class="sidebar-item"
          @click="navigateTo(dir.path)"
        >
          <Icon
            :icon="dir.icon"
            :width="18"
            :height="18"
            class="sidebar-icon"
          />
          <span class="sidebar-label">{{ dir.name }}</span>
        </div>
      </div>

      <div class="sidebar-divider" />

      <div class="sidebar-section">
        <div class="sidebar-header">
          <span>{{ t('files.bookmarks') }}</span>
          <IconButton
            icon="mdi:plus"
            :btn-size="20"
            :tooltip="t('files.addBookmark')"
            @click="handleAddBookmark"
          />
        </div>
        <div
          v-for="bm in fileBookmarks"
          :key="bm.id"
          class="sidebar-item"
          :class="{ 'is-active': activeBookmarkId === bm.id || renamingBookmarkId === bm.id }"
          @click="renamingBookmarkId === bm.id ? undefined : navigateTo(bm.path)"
          @contextmenu.prevent="handleBookmarkContextMenu($event, bm)"
        >
          <Icon
            :icon="bm.icon"
            :width="18"
            :height="18"
            class="sidebar-icon"
          />
          <input
            v-if="renamingBookmarkId === bm.id"
            :ref="(el) => setBookmarkRenameInput(el)"
            v-model="renamingBookmarkName"
            class="sidebar-rename-input"
            :title="renamingBookmarkName"
            @click.stop
            @keydown.enter="confirmBookmarkRename"
            @keydown="cancelBookmarkRename"
            @blur="confirmBookmarkRename"
          />
          <span
            v-else
            class="sidebar-label"
          >{{ bm.name }}</span>
        </div>
      </div>
    </aside>

    <!-- 右侧内容区 -->
    <section class="files-content">
      <!-- 面包屑 + 工具栏 合并单行 -->
      <div class="files-topbar">
        <div class="files-breadcrumb">
          <span
            v-for="(segment, idx) in breadcrumbSegments"
            :key="idx"
            class="breadcrumb-item"
            @click="navigateToBreadcrumb(idx)"
          >
            {{ segment.label }}
            <Icon
              v-if="idx < breadcrumbSegments.length - 1"
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
            @update:value="handleSearch"
            @keydown.escape="clearSearch"
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
              @update:value="handleSortChange"
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

      <!-- 列表视图表头（仅 list 模式显示，支持列拖拽重排 + 列宽拖拽调整） -->
      <div
        v-if="viewMode === 'list'"
        class="list-header"
        :style="{ gridTemplateColumns: listGridTemplate }"
      >
        <div class="list-header-icon" />
        <div
          v-for="col in listColumns"
          :key="col.key"
          class="list-header-cell"
          :class="{ 'col-resizable': col.resizable, 'col-reorderable': col.reorderable }"
          :draggable="col.reorderable"
          @dragstart="onColumnDragStart(col.key, $event)"
          @dragover.prevent
          @drop="onColumnDrop(col.key)"
        >
          <span class="list-header-label">{{ listColumnLabels[col.key] }}</span>
          <span
            v-if="col.resizable"
            class="list-header-resizer"
            @mousedown="onColumnResizeStart(col.key, $event)"
          />
        </div>
      </div>

      <!-- 文件列表 -->
      <div
        class="files-list"
        :class="[viewMode, { 'drag-over': dragOverFilesList, 'marquee-active': marqueeActive }]"
        @click="clearSelection($event)"
        @contextmenu="handleContextMenu"
        @mousedown="onMarqueeStart"
        @dragover="handleDragOverList($event)"
        @dragleave="handleDragLeaveList"
        @drop="handleDropOnList"
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
        <template v-else-if="directoryError || fileEntries.length === 0">
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
            v-for="file in sortedFiles"
            :key="file.path"
            class="file-item"
            :data-path="file.path"
            :class="[{ 'selected': isSelected(file.path), 'folder': file.isDir, 'dragging': dragFiles.includes(file.path), 'marquee-hit': marqueeHitPaths.includes(file.path) }]"
            :draggable="isSelected(file.path)"
            @click="handleItemClick(file, $event)"
            @dblclick="handleItemDblClick(file)"
            @contextmenu.prevent="handleFileContextMenu($event, file)"
            @dragstart="handleDragStart($event, file)"
            @dragend="handleDragEnd"
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
                :ref="(el) => setFileRenameInput(el)"
                v-model="renamingName"
                class="file-rename-input"
                :title="renamingName"
                @click.stop
                @dblclick.stop
                @keydown.enter="confirmRename"
                @keydown="cancelRename"
                @blur="cancelRename"
              />
            </div>
            <!-- 列表视图 -->
            <div
              v-else
              class="file-row-cell"
              :style="{ gridTemplateColumns: listGridTemplate }"
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
                v-for="col in listColumns"
                :key="col.key"
              >
                <input
                  v-if="col.key === 'name' && renamingPath === file.path"
                  :ref="(el) => setFileRenameInput(el)"
                  v-model="renamingName"
                  class="file-rename-input"
                  :title="renamingName"
                  @click.stop
                  @dblclick.stop
                  @keydown.enter="confirmRename"
                  @keydown="cancelRename"
                  @blur="cancelRename"
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

      <!-- 状态栏 -->
      <div class="files-statusbar">
        <span class="status-count">{{ t('files.totalCount', { count: fileEntries.length }) }}</span>
        <span
          v-if="selectedCount > 0"
          class="status-count status-selected"
        >，{{ selectedPhrase }}</span>
      </div>
    </section>
  </div>
  <!-- Quick Look 预览面板 -->
  <QuickLookPanel
    v-if="previewVisible && previewData"
    :preview-data="previewData"
    @close="closePreview"
    @previous="previousPreview"
    @next="nextPreview"
  />
</template>

<script setup lang="ts">
import type { FileBookmark, FileEntry, MenuItem, PreviewData, SystemDir } from '@browser/ipc-contract'
import { Icon } from '@iconify/vue'
import { NInput, NSelect } from 'naive-ui'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import IconButton from '@/components/ui/IconButton.vue'

import { useI18n } from '@/composables/useI18n'
import { usePageTitle } from '@/composables/usePageTitle'
import { useToast } from '@/composables/useToast'
import { ContextMenu } from '@/lib/context-menu'
import { formatDateTime } from '@/utils/datetime'
import { isMacOS } from '@/utils/os'
import QuickLookPanel from './QuickLookPanel.vue'

const { t } = useI18n()
const toast = useToast()
const route = useRoute()
const router = useRouter()

/**
 * 把内部路由的 hash 路径（/files/<encodedPath>）转换为渲染端使用的绝对本地路径。
 * hash 中可能含编码字符（%2F / 空格等），统一解码；结果为绝对路径（补前导 /）。
 */
function toLocalPath(encoded: string): string {
  let decoded = encoded
  try {
    decoded = decodeURIComponent(encoded)
  }
  catch {
    /* 非编码字符串，原样使用 */
  }
  return decoded.startsWith('/') ? decoded : `/${decoded}`
}

// 协议类型
const protocol = computed(() => {
  const path = route.path
  if (path.startsWith('/ftp')) {
    return 'ftp'
  }
  if (path.startsWith('/sftp')) {
    return 'sftp'
  }
  return 'local'
})

// 当前路径
const currentPath = ref<string>('')
// 标签页标题同步为当前文件夹路径（document.title → 主进程 page-title-updated → 标签栏）
usePageTitle(currentPath)
const isLoading = ref(false)
// 仅在加载超过阈值后才展示骨架屏，避免本地目录秒回时一闪而过
const showSkeleton = ref(false)
let skeletonTimer: ReturnType<typeof setTimeout> | null = null
const fileEntries = ref<FileEntry[]>([])
// 目录访问受限（敏感目录/无权限）时的页面内提示，替代 toast 报错
const directoryError = ref<string | null>(null)
const systemDirs = ref<SystemDir[]>([])
const fileBookmarks = ref<FileBookmark[]>([])

// 视图状态
const viewMode = ref<'icon' | 'list'>('icon')
const sortBy = ref('name')
const sortOptions = [
  { label: t('files.sortName'), value: 'name' },
  { label: t('files.sortSize'), value: 'size' },
  { label: t('files.sortModified'), value: 'modified' },
  { label: t('files.sortType'), value: 'type' },
]
const searchQuery = ref('')
const selectedPaths = ref<string[]>([])
// 框选（marquee selection）状态
const marqueeRect = ref<{ left: number, top: number, right: number, bottom: number } | null>(null)
const marqueeHitPaths = ref<string[]>([])
const marqueeActive = ref(false)
// 框选提交后抑制紧随 mouseup 的 click（click 会触发 .files-list 的 clearSelection 清空选择）
const marqueeSuppressClick = ref(false)
// 输入字符定位（type-ahead）：输入缓冲与重置计时器
const typeAheadBuffer = ref('')
const typeAheadTimer = ref<number | null>(null)
// 实时目录监听：当前已建立 watcher 的目录、变更去抖定时器
const watchedDir = ref<string | null>(null)
const filesChangedTimer = ref<number | null>(null)
// 变更事件监听的取消函数（onMounted 注册，onUnmounted 调用）
let filesChangedUnsub: (() => void) | void
// 选中数量（无选中时为 0）
const selectedCount = computed(() => selectedPaths.value.length)
// 若选中项全部为文件，给出友好总大小；否则为空
const selectedSizeText = computed(() => {
  const selected = selectedPaths.value
  if (selected.length === 0) {
    return ''
  }
  const entries = fileEntries.value.filter(f => selected.includes(f.path))
  const allFiles = entries.length > 0 && entries.every(f => !f.isDir)
  return allFiles
    ? formatSize(entries.reduce((sum, f) => sum + (f.size || 0), 0))
    : ''
})
// 选中状态文案：已选择 M 个项目（，总大小）
const selectedPhrase = computed(() => {
  const base = t('files.selectedCount', { count: selectedCount.value })
  return selectedSizeText.value ? `${base}，${selectedSizeText.value}` : base
})
const lastClickedIndex = ref(-1)
const itemHovered = ref('')

// 列表视图列定义（顺序 = 显示顺序；width=null 表示弹性填充 1fr）
interface ListViewColumn {
  key: 'name' | 'kind' | 'size' | 'date'
  width: number | null
  resizable: boolean
  reorderable: boolean
}
const listColumns = ref<ListViewColumn[]>([
  { key: 'name', width: null, resizable: true, reorderable: true },
  { key: 'kind', width: 90, resizable: true, reorderable: true },
  { key: 'size', width: 90, resizable: true, reorderable: true },
  { key: 'date', width: 170, resizable: true, reorderable: true },
])
const listColumnLabels: Record<ListViewColumn['key'], string> = {
  name: t('files.nameCol'),
  kind: t('files.kindCol'),
  size: t('files.sizeCol'),
  date: t('files.dateCol'),
}
// 列顺序 + 宽度 -> grid-template-columns（首列为固定图标列 24px）
const listGridTemplate = computed(() => {
  const cols = listColumns.value.map(c => (c.width == null ? '1fr' : `${c.width}px`))
  return `24px ${cols.join(' ')}`
})

// 列宽拖拽调整
let resizing: { key: ListViewColumn['key'], startX: number, startW: number } | null = null
function onColumnResizeStart(key: ListViewColumn['key'], event: MouseEvent): void {
  console.debug('[FilesView] onColumnResizeStart:', key)
  event.preventDefault()
  event.stopPropagation()
  const col = listColumns.value.find(c => c.key === key)
  if (!col || !col.resizable) {
    return
  }
  resizing = { key, startX: event.clientX, startW: col.width ?? 120 }
  window.addEventListener('mousemove', onColumnResizing)
  window.addEventListener('mouseup', onColumnResizeEnd)
}
function onColumnResizing(event: MouseEvent): void {
  if (!resizing) {
    return
  }
  const dx = event.clientX - resizing.startX
  const next = Math.max(60, resizing.startW + dx)
  const col = listColumns.value.find(c => c.key === resizing!.key)
  if (col) {
    col.width = Math.round(next)
  }
}
function onColumnResizeEnd(): void {
  resizing = null
  window.removeEventListener('mousemove', onColumnResizing)
  window.removeEventListener('mouseup', onColumnResizeEnd)
  saveListColumns()
}

// 列顺序拖拽重排
let dragColumnKey: ListViewColumn['key'] | null = null
function onColumnDragStart(key: ListViewColumn['key'], event: DragEvent): void {
  const col = listColumns.value.find(c => c.key === key)
  if (!col?.reorderable) {
    event.preventDefault()
    return
  }
  dragColumnKey = key
}
function onColumnDrop(targetKey: ListViewColumn['key']): void {
  console.debug('[FilesView] onColumnDrop: from', dragColumnKey, 'to', targetKey)
  if (!dragColumnKey || dragColumnKey === targetKey) {
    return
  }
  const from = listColumns.value.findIndex(c => c.key === dragColumnKey)
  const to = listColumns.value.findIndex(c => c.key === targetKey)
  if (from < 0 || to < 0) {
    return
  }
  const arr = listColumns.value
  const [moved] = arr.splice(from, 1)
  arr.splice(to, 0, moved)
  dragColumnKey = null
  saveListColumns()
}

// 持久化列顺序/宽度
async function saveListColumns(): Promise<void> {
  try {
    await window.browserAPI.setSetting({ key: 'files.listColumns', value: JSON.stringify(listColumns.value) })
  }
  catch (err) {
    console.warn('[FilesView] saveListColumns failed:', err)
  }
}
async function loadListColumns(): Promise<void> {
  try {
    const saved = (await window.browserAPI.getSetting('files.listColumns')) as string | null
    if (!saved) {
      return
    }
    const parsed = JSON.parse(saved) as ListViewColumn[]
    // 仅保留已知列，避免脏数据
    const known: ListViewColumn['key'][] = ['name', 'kind', 'size', 'date']
    const ordered = known.map(k => parsed.find(c => c.key === k)).filter(Boolean) as ListViewColumn[]
    const extra = parsed.filter(c => !known.includes(c.key))
    if (ordered.length > 0) {
      listColumns.value = [...ordered, ...extra]
    }
  }
  catch (err) {
    console.warn('[FilesView] loadListColumns failed:', err)
  }
}
// 根据列 key 渲染对应单元格内容
function renderCellContent(file: FileEntry, key: ListViewColumn['key']): string {
  switch (key) {
    case 'name':
      return file.name
    case 'kind':
      return getFileKind(file)
    case 'size':
      return formatSize(file.size)
    case 'date':
      return formatDateTime(file.modifiedAt)
  }
}

// 文件名高亮分段：搜索时把命中的子串标记为 hit，渲染层用 <mark> 区分颜色
function getHighlightParts(name: string): Array<{ text: string, hit: boolean }> {
  const query = searchQuery.value.trim().toLowerCase()
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

// 拖拽状态
const dragOverTarget = ref<string | null>(null)
const dragOverFilesList = ref(false)
const dragFiles = ref<string[]>([])

// Quick Look 预览
const previewVisible = ref(false)
const previewData = ref<PreviewData | null>(null)
const previewIndex = ref(-1)
// 重命名状态
let renameTimer = 0
const renamingPath = ref<string | null>(null)
const renamingName = ref('')
// 文件重命名输入框（v-for 内同一时刻仅一个渲染）；用函数 ref 确保正确绑定
const fileRenameInput = ref<HTMLInputElement | null>(null)
function setFileRenameInput(el: unknown): void {
  fileRenameInput.value = (el as HTMLInputElement | null) ?? null
}
// 书签重命名状态（仅修改展示名）
const renamingBookmarkId = ref<string | null>(null)
const renamingBookmarkName = ref('')
// 右键菜单打开时处于激活态的书签（高亮显示）
const activeBookmarkId = ref<string | null>(null)
// 书签重命名输入框（v-for 内同一时刻仅一个渲染）；用函数 ref 确保正确绑定
const bookmarkRenameInput = ref<HTMLInputElement | null>(null)
function setBookmarkRenameInput(el: unknown): void {
  bookmarkRenameInput.value = (el as HTMLInputElement | null) ?? null
}

// 导航历史
const navHistory = ref<string[]>([])
const navIndex = ref(-1)

// 面包屑
const breadcrumbSegments = computed(() => {
  const parts = currentPath.value.split('/').filter(Boolean)
  let accumulated = ''
  return parts.map((part) => {
    accumulated = accumulated ? `${accumulated}/${part}` : `/${part}`
    return { label: part, path: accumulated }
  })
})

// 排序后的文件列表
const sortedFiles = computed(() => {
  const entries = [...fileEntries.value]
  const lower = sortBy.value
  entries.sort((a, b) => {
    // 文件夹始终排在前面
    if (a.isDir && !b.isDir) {
      return -1
    }
    if (!a.isDir && b.isDir) {
      return 1
    }
    switch (lower) {
      case 'name':
        return a.name.localeCompare(b.name)
      case 'size':
        return b.size - a.size
      case 'modified':
        return b.modifiedAt - a.modifiedAt
      case 'type':
        return a.extension.localeCompare(b.extension)
      default:
        return 0
    }
  })
  return entries
})

// ─── 框选（marquee selection） ───────────────────────────────

// 框选起点：仅在空白/列间隙（未命中 draggable）启动；已选中行兜底走拖拽
function onMarqueeStart(event: MouseEvent): void {
  console.debug('[FilesView] onMarqueeStart: target=%o isElement=%s button=%d', event.target, event.target instanceof HTMLElement, event.button)
  if (event.button !== 0) {
    return
  }
  // text node 没有 closest()，点击文件名文字时 event.target 可能是 text node
  if (!(event.target instanceof HTMLElement)) {
    console.debug('[FilesView] onMarqueeStart: target is not HTMLElement, skip. nodeType=%d', (event.target as Node | null)?.nodeType)
    return
  }
  // 命中 draggable 元素（未选中行的 .file-icon-cell / .file-cell-content，或已选中整行/整块）→ 拖文件
  if (event.target.closest('[draggable="true"]')) {
    console.debug('[FilesView] onMarqueeStart: hit draggable, skip')
    return
  }
  const rowEl = event.target.closest('.file-item, .file-row-cell')
  const isRowSelected = !!rowEl && rowEl.classList.contains('selected')
  console.debug('[FilesView] onMarqueeStart: rowEl=%s isRowSelected=%s', rowEl?.className, isRowSelected)
  // 已选中行的非内容空白区域：整行可拖（draggable 已为 true，此处兜底）
  if (isRowSelected) {
    return
  }
  // 否则进入框选
  console.debug('[FilesView] onMarqueeStart: 启动框选')
  marqueeActive.value = true
  const startX = event.clientX
  const startY = event.clientY
  let baseSelection: string[] = []
  const ctrl = event.ctrlKey || event.metaKey
  // 若起点所在文件已选中且为 Ctrl，则基于当前选择做切换；否则清空
  const startFile = sortedFiles.value.find(f => f.path === (rowEl as HTMLElement | null)?.getAttribute('data-path'))
  if (ctrl && startFile && selectedPaths.value.includes(startFile.path)) {
    baseSelection = [...selectedPaths.value]
  }
  const onMove = (e: MouseEvent) => {
    const left = Math.min(startX, e.clientX)
    const top = Math.min(startY, e.clientY)
    const right = Math.max(startX, e.clientX)
    const bottom = Math.max(startY, e.clientY)
    marqueeRect.value = { left, top, right, bottom }
    marqueeHitPaths.value = computeMarqueeHit({ left, top, right, bottom }, ctrl, baseSelection)
  }
  const onUp = (e: MouseEvent) => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    onMarqueeEnd(e, startX, startY)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// 根据 marquee 矩形计算命中文件集合
function computeMarqueeHit(
  rect: { left: number, top: number, right: number, bottom: number },
  ctrl: boolean,
  baseSelection: string[],
): string[] {
  const hit: string[] = []
  for (const file of sortedFiles.value) {
    const el = document.querySelector(`.file-item[data-path="${CSS.escape(file.path)}"]`) as HTMLElement | null
    if (!el) {
      continue
    }
    const r = el.getBoundingClientRect()
    let matched = false
    if (viewMode.value === 'icon') {
      matched = !(r.right < rect.left || r.left > rect.right || r.bottom < rect.top || r.top > rect.bottom)
    }
    else {
      matched = !(r.bottom < rect.top || r.top > rect.bottom)
    }
    if (matched) {
      hit.push(file.path)
    }
  }
  if (ctrl && baseSelection.length > 0) {
    const set = new Set(baseSelection)
    for (const p of hit) {
      if (set.has(p)) {
        set.delete(p)
      }
      else {
        set.add(p)
      }
    }
    return [...set]
  }
  return hit
}

function onMarqueeEnd(event: MouseEvent, startX: number, startY: number): void {
  console.debug('[FilesView] onMarqueeEnd')
  const dx = Math.abs(event.clientX - startX)
  const dy = Math.abs(event.clientY - startY)
  // 位移极小 → 视为单击空白 → 复用 clearSelection
  if (dx < 4 && dy < 4) {
    clearSelection(event)
  }
  else {
  // 抑制紧随 mouseup 的 click（会触发 .files-list clearSelection 清空刚提交的框选）
    marqueeSuppressClick.value = true
    selectedPaths.value = marqueeHitPaths.value
  }
  marqueeRect.value = null
  marqueeHitPaths.value = []
  marqueeActive.value = false
}

// 选中状态
function isSelected(path: string): boolean {
  return selectedPaths.value.includes(path)
}

// 导航历史管理
function pushHistory(newPath: string): void {
  if (navIndex.value < navHistory.value.length - 1) {
    navHistory.value.splice(navIndex.value + 1)
  }
  navHistory.value.push(newPath)
  navIndex.value = navHistory.value.length - 1
}

// 后退
async function goBack(): Promise<void> {
  console.debug('[FilesView] goBack')
  if (navIndex.value > 0) {
    navIndex.value--
    const path = navHistory.value[navIndex.value]
    selectedPaths.value = []
    // 仅更新路由 hash，由 watch(route.path) 统一加载目录并同步地址栏
    gotoPath(path)
  }
}

// 前进
async function goForward(): Promise<void> {
  console.debug('[FilesView] goForward')
  if (navIndex.value < navHistory.value.length - 1) {
    navIndex.value++
    const path = navHistory.value[navIndex.value]
    selectedPaths.value = []
    // 仅更新路由 hash，由 watch(route.path) 统一加载目录并同步地址栏
    gotoPath(path)
  }
}

// 开始加载：标记 isLoading 并延迟后再展示骨架屏，避免快速返回时闪烁
function beginLoading(): void {
  isLoading.value = true
  if (skeletonTimer) {
    clearTimeout(skeletonTimer)
  }
  skeletonTimer = setTimeout(() => {
    if (isLoading.value) {
      showSkeleton.value = true
    }
  }, 120)
}

// 结束加载：清理计时器与骨架屏
function endLoading(): void {
  isLoading.value = false
  showSkeleton.value = false
  if (skeletonTimer) {
    clearTimeout(skeletonTimer)
    skeletonTimer = null
  }
}

// 加载目录
async function loadDirectory(dirPath: string): Promise<void> {
  console.debug('[FilesView] loadDirectory: dirPath', dirPath)
  if (protocol.value !== 'local') {
    console.warn('[FilesView] 远程协议暂未实现')
    return
  }
  beginLoading()
  try {
    fileEntries.value = await window.browserAPI.readDir(dirPath)
    directoryError.value = null
    lastClickedIndex.value = -1
  }
  catch (err) {
    const message = (err as Error).message || '读取目录失败'
    console.error('[FilesView] loadDirectory error:', err)
    // 敏感目录 / 无权限等受保护目录：页面内提示，不弹 toast
    if (isAccessDeniedError(message)) {
      console.debug('[FilesView] loadDirectory 受保护目录，页面内提示:', message)
      directoryError.value = t('files.accessDenied')
      fileEntries.value = []
    }
    else {
      toast.error(message)
    }
  }
  finally {
    endLoading()
  }
}

// 判断读取目录失败是否属于"受保护/无权限"类（敏感目录、权限不足），这类走页面内提示而非 toast
function isAccessDeniedError(message: string): boolean {
  return /不允许访问|受保护|permission|EACCES|EPERM/i.test(message)
}

// ─── 实时目录监听（外部变更感知） ────────────────────────────

// 切换当前监听目录：释放旧目录 watcher，建立新目录 watcher（主进程按路径引用计数）
function setWatchDir(dirPath: string): void {
  if (watchedDir.value === dirPath) {
    return
  }
  if (watchedDir.value) {
    window.browserAPI.unwatchDir(watchedDir.value)
  }
  watchedDir.value = dirPath
  window.browserAPI.watchDir(dirPath)
  console.debug('[FilesView] setWatchDir:', dirPath)
}

// 外部变更后重载当前目录，并尽量保留原有选中项（仅保留仍存在者）
async function reloadCurrentDir(): Promise<void> {
  console.debug('[FilesView] reloadCurrentDir:', currentPath.value)
  const prevSelected = new Set(selectedPaths.value)
  await loadDirectory(currentPath.value)
  if (prevSelected.size > 0) {
    const existing = new Set(fileEntries.value.map(f => f.path))
    selectedPaths.value = [...prevSelected].filter(p => existing.has(p))
  }
}

// 路由跳转：更新 hash（#/files/<path>），主进程据此更新地址栏 displayUrl
function gotoPath(dirPath: string): void {
  console.debug('[FilesView] gotoPath: dirPath', dirPath)
  const rel = dirPath.replace(/^\/+/, '')
  router.push({ path: `/files/${rel}` })
}

// 导航到目录
async function navigateTo(dirPath: string): Promise<void> {
  console.debug('[FilesView] navigateTo: dirPath', dirPath)
  if (dirPath === currentPath.value) {
    return
  }
  pushHistory(dirPath)
  currentPath.value = dirPath
  selectedPaths.value = []
  searchQuery.value = ''
  directoryError.value = null
  // 仅更新路由 hash，由 watch(route.path) 统一加载目录并同步地址栏
  gotoPath(dirPath)
}

// 面包屑导航
function navigateToBreadcrumb(index: number): void {
  const segment = breadcrumbSegments.value[index]
  if (segment) {
    navigateTo(segment.path)
  }
}

// 点击文件项（支持 ctrl/cmd 多选、shift 范围选择）
function handleItemClick(file: FileEntry, event: MouseEvent): void {
  const isSel = isSelected(file.path)
  console.debug('[FilesView] handleItemClick: %s selected=%s multi=%s shift=%s selCount=%d', file.name, isSel, event.ctrlKey || event.metaKey, event.shiftKey, selectedPaths.value.length)
  // 阻止冒泡到 .files-list 的 clearSelection，否则选中会被立即清空
  event.stopPropagation()
  const items = sortedFiles.value
  const idx = items.findIndex(f => f.path === file.path)
  const isMulti = event.ctrlKey || event.metaKey
  const isShift = event.shiftKey

  // shift 范围选择：以最近一次点击为锚点
  if (isShift && lastClickedIndex.value >= 0 && idx >= 0) {
    clearTimeout(renameTimer)
    renameTimer = 0
    const [from, to] = lastClickedIndex.value < idx ? [lastClickedIndex.value, idx] : [idx, lastClickedIndex.value]
    selectedPaths.value = items.slice(from, to + 1).map(f => f.path)
    return
  }

  if (isMulti) {
    clearTimeout(renameTimer)
    renameTimer = 0
    const pos = selectedPaths.value.indexOf(file.path)
    if (pos === -1) {
      selectedPaths.value = [...selectedPaths.value, file.path]
    }
    else {
      selectedPaths.value = selectedPaths.value.filter(p => p !== file.path)
    }
  }
  else if (isSelected(file.path) && selectedPaths.value.length === 1) {
    // 已选中的单项再次单击：延迟进入重命名；若随后触发 dblclick（导航/打开），
    // handleItemDblClick 会 clearTimeout 取消本次重命名，因此文件与文件夹均适用
    console.debug('[FilesView] handleItemClick: 单击已选中项 %s isDir=%s → 设置 renameTimer', file.name, file.isDir)
    clearTimeout(renameTimer)
    renameTimer = window.setTimeout(startRename, 100, file)
  }
  else {
    clearTimeout(renameTimer)
    renameTimer = 0
    selectedPaths.value = [file.path]
  }
  lastClickedIndex.value = idx
}

// 双击文件项
async function handleItemDblClick(file: FileEntry): Promise<void> {
  console.debug('[FilesView] handleItemDblClick: %s, 清除renameTimer=%d', file.name, renameTimer)
  clearTimeout(renameTimer)
  renameTimer = 0
  if (file.isDir) {
    await navigateTo(file.path)
  }
  else {
    await window.browserAPI.openFile(file.path)
  }
}

// 清空选中：点击列表空白处时触发。多选模式（按住 Ctrl/Shift/⌘）下误触空白间隙不应清掉已选，故忽略带修饰键的点击
function clearSelection(event: MouseEvent): void {
  console.debug('[FilesView] clearSelection: ctrl=%s shift=%s marqueeSuppress=%s', event.ctrlKey || event.metaKey, event.shiftKey, marqueeSuppressClick.value)
  if (event.ctrlKey || event.metaKey || event.shiftKey) {
    return
  }
  // 框选提交后产生的 click：保留刚框选的结果，不清除
  if (marqueeSuppressClick.value) {
    marqueeSuppressClick.value = false
    return
  }
  clearTimeout(renameTimer)
  renameTimer = 0
  selectedPaths.value = []
}

// ─── 拖拽交互 ─────────────────────────────────────────────

function handleDragStart(event: DragEvent, file: FileEntry): void {
  console.debug('[FilesView] handleDragStart:', file.name)
  if (!event.dataTransfer) {
    return
  }
  // 拖已选中批中的某项 → 携带整批；否则仅单项（Windows 式"拖已选中行=拖整批"）
  const paths = selectedPaths.value.includes(file.path) && selectedPaths.value.length > 1
    ? [...selectedPaths.value]
    : [file.path]
  dragFiles.value = paths
  event.dataTransfer.setData('application/x-wmfx-files', JSON.stringify(paths))
  event.dataTransfer.setData('text/plain', paths.join('\n'))
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.dropEffect = 'copy'
}

function handleDragEnd(): void {
  console.debug('[FilesView] handleDragEnd')
  dragFiles.value = []
  dragOverTarget.value = null
}

function handleDragOverList(event: DragEvent): void {
  console.debug('[FilesView] handleDragOverList')
  event.preventDefault()
  dragOverFilesList.value = true
}

function handleDragLeaveList(): void {
  console.debug('[FilesView] handleDragLeaveList')
  dragOverFilesList.value = false
}

async function handleDropOnList(event: DragEvent): Promise<void> {
  console.debug('[FilesView] handleDropOnList')
  event.preventDefault()
  dragOverFilesList.value = false
  const data = event.dataTransfer?.getData('text/uri-list')
  if (!data) {
    return
  }
  const urls = data.split('\n').filter(Boolean)
  console.debug('[FilesView] handleDropOnList: urls', urls)
  // TODO: 下载这些 URL 到当前目录
  for (const url of urls) {
    try {
      // 创建下载
      await window.browserAPI.createDownload({
        url,
        path: currentPath.value,
      })
    }
    catch (err) {
      console.error('[FilesView] handleDropOnList download error:', err)
      toast.error((err as Error).message || '下载失败')
    }
  }
}

// 搜索
async function handleSearch(): Promise<void> {
  console.debug('[FilesView] handleSearch: query', searchQuery.value)
  if (!searchQuery.value) {
    await loadDirectory(currentPath.value)
    return
  }
  beginLoading()
  directoryError.value = null
  try {
    fileEntries.value = await window.browserAPI.searchDir(currentPath.value, searchQuery.value)
  }
  catch (err) {
    console.error('[FilesView] handleSearch error:', err)
    toast.error((err as Error).message || '搜索失败')
  }
  finally {
    endLoading()
  }
}

// 清除搜索
function clearSearch(): void {
  searchQuery.value = ''
  fileEntries.value = []
  void loadDirectory(currentPath.value)
}

// 排序
function handleSortChange(value: string): void {
  console.debug('[FilesView] handleSortChange: value', value)
  sortBy.value = value
}

// ─── 重命名 ───────────────────────────────────────────────────

function startRename(file: FileEntry): void {
  console.debug('[FilesView] startRename: %s renamingPath(before)=%s', file.name, renamingPath.value)
  renamingPath.value = file.path
  renamingName.value = file.name
  // 延迟聚焦：等右键菜单关闭并释放焦点后再聚焦输入框，避免被菜单关闭抢走焦点
  nextTick(() => {
    const el = fileRenameInput.value
    if (el) {
      el.focus()
      el.select()
    }
  })
}

async function confirmRename(): Promise<void> {
  if (!renamingPath.value) {
    return
  }
  const newName = renamingName.value.trim()
  if (!newName) {
    cancelRename()
    return
  }
  const currentName = fileEntries.value.find(f => f.path === renamingPath.value)?.name
  if (newName === currentName) {
    cancelRename()
    return
  }
  const newPath = currentPath.value.endsWith('/') ? `${currentPath.value}${newName}` : `${currentPath.value}/${newName}`
  try {
    await window.browserAPI.rename(renamingPath.value, newPath)
    cancelRename()
    await loadDirectory(currentPath.value)
    // 重命名后选中新文件（路径已变化）
    selectedPaths.value = [newPath]
    lastClickedIndex.value = sortedFiles.value.findIndex(f => f.path === newPath)
  }
  catch (err) {
    console.error('[FilesView] confirmRename error:', err)
    toast.error((err as Error).message || '重命名失败')
    cancelRename()
  }
}

function cancelRename(): void {
  renamingPath.value = null
  renamingName.value = ''
}

// ─── 书签右键菜单（重命名 / 删除） ─────────────────────────

function handleBookmarkContextMenu(event: MouseEvent, bm: FileBookmark): void {
  console.debug('[FilesView] handleBookmarkContextMenu:', bm.name)
  event.preventDefault()
  activeBookmarkId.value = bm.id
  const items: MenuItem[] = [
    { id: 'openNewTab', label: t('files.openInNewTab'), icon: 'mdi:tab' },
    { id: 'rename', label: t('files.rename'), icon: 'mdi:pencil' },
    { id: 'delete', label: t('files.delete'), icon: 'mdi:trash-can', danger: true },
  ]
  const menu = new ContextMenu({
    mode: 'normal',
    anchor: { type: 'point', x: event.clientX, y: event.clientY },
    descriptor: { id: 'bookmark-context-menu', items },
    onAction: ({ menu: action }) => {
      switch (action.id) {
        case 'openNewTab':
          window.browserAPI.createTab({ url: `wmfx://files${bm.path}` })
          break
        case 'rename':
          startBookmarkRename(bm)
          break
        case 'delete':
          handleDeleteBookmark(bm)
          break
      }
    },
    onDismiss: () => {
      activeBookmarkId.value = null
    },
  })
  void menu
}

function startBookmarkRename(bm: FileBookmark): void {
  console.debug('[FilesView] startBookmarkRename:', bm.name)
  renamingBookmarkId.value = bm.id
  renamingBookmarkName.value = bm.name
  // 延迟聚焦：等右键菜单关闭并释放焦点后再聚焦输入框，避免被菜单关闭抢走焦点
  setTimeout(() => {
    const el = bookmarkRenameInput.value
    if (el) {
      el.focus()
      el.select()
    }
  }, 100)
}

async function confirmBookmarkRename(): Promise<void> {
  const id = renamingBookmarkId.value
  if (!id) {
    return
  }
  const newName = renamingBookmarkName.value.trim()
  cancelBookmarkRename()
  const bm = fileBookmarks.value.find(b => b.id === id)
  if (!bm || newName === bm.name || !newName) {
    return
  }
  try {
    await window.browserAPI.renameFileBookmark(id, newName)
    await loadMetadata()
  }
  catch (err) {
    console.error('[FilesView] confirmBookmarkRename error:', err)
    toast.error((err as Error).message || '重命名书签失败')
  }
}

function cancelBookmarkRename(): void {
  renamingBookmarkId.value = null
  renamingBookmarkName.value = ''
}

async function handleDeleteBookmark(bm: FileBookmark): Promise<void> {
  console.debug('[FilesView] handleDeleteBookmark:', bm.name)
  try {
    await window.browserAPI.removeFileBookmark(bm.id)
    await loadMetadata()
  }
  catch (err) {
    console.error('[FilesView] handleDeleteBookmark error:', err)
    toast.error((err as Error).message || '删除书签失败')
  }
}

// ─── 删除 ─────────────────────────────────────────────────────

async function handleDelete(paths: string[]): Promise<void> {
  console.debug('[FilesView] handleDelete: paths', paths)
  // 仅保留字符串路径并生成普通数组，避免 Vue 响应式代理 / 非克隆对象传入 IPC 时抛 "could not be cloned"
  const plainPaths = paths.filter(p => typeof p === 'string')
  if (plainPaths.length !== paths.length) {
    console.warn('[FilesView] handleDelete: 跳过非字符串路径', paths)
  }
  try {
    await window.browserAPI.deleteFiles(plainPaths)
    selectedPaths.value = selectedPaths.value.filter(p => !plainPaths.includes(p))
    await loadDirectory(currentPath.value)
  }
  catch (err) {
    console.error('[FilesView] handleDelete error:', err)
    toast.error((err as Error).message || '删除失败')
  }
}

// ─── 新建文件夹 ─────────────────────────────────────────────

async function handleNewFolder(): Promise<void> {
  console.debug('[FilesView] handleNewFolder')
  try {
    // 创建默认名称的文件夹
    let folderName = '未命名文件夹'
    let counter = 1
    while (fileEntries.value.some(f => f.name === folderName)) {
      folderName = `未命名文件夹 (${counter})`
      counter++
    }
    const newPath = currentPath.value.endsWith('/')
      ? `${currentPath.value}${folderName}`
      : `${currentPath.value}/${folderName}`
    await window.browserAPI.mkdir(newPath)
    // 立即进入重命名状态
    await loadDirectory(currentPath.value)
    const newEntry = fileEntries.value.find(f => f.name === folderName)
    if (newEntry) {
      startRename(newEntry)
    }
  }
  catch (err) {
    console.error('[FilesView] handleNewFolder error:', err)
    toast.error((err as Error).message || '新建文件夹失败')
  }
}

// ─── 复制/剪切/粘贴 ─────────────────────────────────────────

async function handleCopy(): Promise<void> {
  console.debug('[FilesView] handleCopy: selected', selectedPaths.value)
  if (selectedPaths.value.length === 0) {
    return
  }
  try {
    await window.browserAPI.copyFiles(selectedPaths.value, currentPath.value)
  }
  catch (err) {
    console.error('[FilesView] handleCopy error:', err)
    toast.error((err as Error).message || '复制失败')
  }
}

async function handleCut(): Promise<void> {
  console.debug('[FilesView] handleCut: selected', selectedPaths.value)
  if (selectedPaths.value.length === 0) {
    return
  }
  try {
    await window.browserAPI.cutFiles(selectedPaths.value, currentPath.value)
  }
  catch (err) {
    console.error('[FilesView] handleCut error:', err)
    toast.error((err as Error).message || '剪切失败')
  }
}

async function handlePaste(): Promise<void> {
  console.debug('[FilesView] handlePaste to:', currentPath.value)
  try {
    await window.browserAPI.pasteFiles(currentPath.value)
    await loadDirectory(currentPath.value)
  }
  catch (err) {
    console.error('[FilesView] handlePaste error:', err)
    toast.error((err as Error).message || '粘贴失败')
  }
}

// ─── 右键菜单 ─────────────────────────────────────────────

// 容器空白处右键（无选中时显示新建文件夹/粘贴）
function handleContextMenu(event: MouseEvent): void {
  console.debug('[FilesView] handleContextMenu')
  event.preventDefault()
  showFileContextMenu(event)
}

// 在文件项上右键：无需提前选中。若目标文件已在多选集合中，保留整个选择；
// 否则仅选中该文件，再弹出与容器右键一致的菜单
function handleFileContextMenu(event: MouseEvent, file: FileEntry): void {
  console.debug('[FilesView] handleFileContextMenu:', file.name)
  event.preventDefault()
  event.stopPropagation()
  if (!selectedPaths.value.includes(file.path)) {
    selectedPaths.value = [file.path]
    lastClickedIndex.value = sortedFiles.value.findIndex(f => f.path === file.path)
  }
  showFileContextMenu(event)
}

// 容器空白处右键（无选中时显示新建文件夹/粘贴）
function showFileContextMenu(event: MouseEvent): void {
  console.debug('[FilesView] showFileContextMenu')
  const hasSelection = selectedPaths.value.length > 0
  const items: MenuItem[] = []

  if (hasSelection) {
    items.push({ id: 'open', label: t('files.open'), icon: 'mdi:open-in-new' })
    items.push({ id: 'openNewTab', label: t('files.openInNewTab'), icon: 'mdi:tab' })
    items.push({ id: 'sep1', type: 'separator' })
    items.push({ id: 'rename', label: t('files.rename'), icon: 'mdi:pencil' })
    items.push({ id: 'delete', label: t('files.delete'), icon: 'mdi:trash-can', danger: true })
    items.push({ id: 'sep2', type: 'separator' })
    items.push({ id: 'copy', label: t('files.copy'), icon: 'mdi:content-copy' })
    items.push({ id: 'cut', label: t('files.cut'), icon: 'mdi:content-cut' })
  }
  else {
    items.push({ id: 'newFolder', label: t('files.newFolder'), icon: 'mdi:folder-plus' })
    items.push({ id: 'sep1', type: 'separator' })
    items.push({ id: 'paste', label: t('files.paste'), icon: 'mdi:content-paste' })
    items.push({ id: 'sep2', type: 'separator' })
  }

  items.push({ id: 'selectAll', label: t('files.selectAll'), icon: 'mdi:select-all' })

  const menu = new ContextMenu({
    mode: 'normal',
    anchor: { type: 'point', x: event.clientX, y: event.clientY },
    descriptor: { id: 'files-context-menu', items },
    onAction: ({ menu: action }) => {
      onFileMenuAction(action.id)
    },
  })
  void menu
}

// 文件右键菜单统一动作处理
function onFileMenuAction(id: string): void {
  switch (id) {
    case 'open':
      if (selectedPaths.value.length === 1) {
        const file = fileEntries.value.find(f => f.path === selectedPaths.value[0])
        if (file) {
          handleItemDblClick(file)
        }
      }
      break
    case 'openNewTab':
      if (selectedPaths.value.length === 1) {
        const file = fileEntries.value.find(f => f.path === selectedPaths.value[0])
        if (file) {
          window.browserAPI.createTab({ url: `wmfx://files${file.path}` })
        }
      }
      break
    case 'rename':
      if (selectedPaths.value.length === 1) {
        const file = fileEntries.value.find(f => f.path === selectedPaths.value[0])
        if (file) {
          startRename(file)
        }
      }
      break
    case 'delete':
      if (selectedPaths.value.length > 0) {
        handleDelete(selectedPaths.value)
      }
      break
    case 'copy':
      handleCopy()
      break
    case 'cut':
      handleCut()
      break
    case 'newFolder':
      handleNewFolder()
      break
    case 'paste':
      handlePaste()
      break
    case 'selectAll':
      selectedPaths.value = fileEntries.value.map(f => f.path)
      break
  }
  // 菜单项点击后默认自动关闭（return false 可保持打开）
}

// ─── 快捷键处理 ───────────────────────────────────────────

async function handleKeyDown(event: KeyboardEvent): Promise<void> {
  const target = event.target as HTMLElement | null
  if (!target) {
    return
  }
  // 忽略重命名输入框
  if (target.tagName === 'INPUT') {
    return
  }
  // 忽略搜索框
  if (target.getAttribute('placeholder') === t('files.searchPlaceholder')) {
    return
  }

  const ctrl = event.ctrlKey || event.metaKey

  // 打开文件
  if ((isMacOS && ctrl && event.key === 'o') || (!isMacOS && !ctrl && event.key === 'Enter')) {
    event.preventDefault()
    if (selectedPaths.value.length === 1) {
      const file = fileEntries.value.find(f => f.path === selectedPaths.value[0])
      if (file) {
        handleItemDblClick(file)
      }
    }
    return
  }

  // 上下方向键选择（Shift 范围多选）；ctrl/alt+方向键留给返回/前进
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (event.ctrlKey || event.altKey) {
      return
    }
    event.preventDefault()
    const items = sortedFiles.value
    if (items.length === 0) {
      return
    }
    const dir = event.key === 'ArrowDown' ? 1 : -1
    const next = lastClickedIndex.value < 0 ? 0 : Math.min(items.length - 1, Math.max(0, lastClickedIndex.value + dir))
    if (event.shiftKey && lastClickedIndex.value >= 0) {
      const [from, to] = lastClickedIndex.value < next ? [lastClickedIndex.value, next] : [next, lastClickedIndex.value]
      selectedPaths.value = items.slice(from, to + 1).map(f => f.path)
    }
    else {
      selectedPaths.value = [items[next].path]
      lastClickedIndex.value = next
    }
    return
  }

  // 返回上级
  if ((isMacOS && ctrl && event.key === 'ArrowUp') || (!isMacOS && event.altKey && event.key === 'ArrowUp')) {
    event.preventDefault()
    goBack()
    return
  }

  // 前进
  if ((isMacOS && ctrl && event.key === 'ArrowDown') || (!isMacOS && event.altKey && event.key === 'ArrowDown')) {
    event.preventDefault()
    goForward()
    return
  }

  // 重命名
  if ((isMacOS && event.key === 'Enter' && !ctrl) || (!isMacOS && !ctrl && event.key === 'F2')) {
    event.preventDefault()
    if (selectedPaths.value.length === 1) {
      const file = fileEntries.value.find(f => f.path === selectedPaths.value[0])
      if (file) {
        startRename(file)
      }
    }
    return
  }

  // 删除
  if ((isMacOS && ctrl && event.key === 'Backspace') || (!isMacOS && !ctrl && event.key === 'Delete')) {
    event.preventDefault()
    if (selectedPaths.value.length > 0) {
      handleDelete(selectedPaths.value)
    }
    return
  }

  // 复制/剪切/粘贴
  if (ctrl && event.key === 'c') {
    event.preventDefault()
    handleCopy()
    return
  }
  if (ctrl && event.key === 'x') {
    event.preventDefault()
    handleCut()
    return
  }
  if (ctrl && event.key === 'v') {
    event.preventDefault()
    handlePaste()
    return
  }

  // 全选
  if (ctrl && event.key === 'a') {
    event.preventDefault()
    selectedPaths.value = fileEntries.value.map(f => f.path)
    return
  }

  // 输入字符定位（type-ahead）：输入文件名前缀定位首个匹配项（Windows/macOS 通用）
  if (!ctrl && !event.metaKey && !event.altKey && event.key.length === 1 && event.key !== ' ') {
    event.preventDefault()
    typeAheadBuffer.value += event.key.toLowerCase()
    if (typeAheadTimer.value !== null) {
      window.clearTimeout(typeAheadTimer.value)
    }
    typeAheadTimer.value = window.setTimeout(() => {
      typeAheadBuffer.value = ''
      typeAheadTimer.value = null
    }, 600)
    const items = sortedFiles.value
    const idx = items.findIndex(f => f.name.toLowerCase().startsWith(typeAheadBuffer.value))
    if (idx >= 0) {
      const file = items[idx]
      selectedPaths.value = [file.path]
      lastClickedIndex.value = idx
      await nextTick()
      const el = document.querySelector(`.file-item[data-path="${CSS.escape(file.path)}"]`) as HTMLElement | null
      el?.scrollIntoView({ block: 'nearest' })
      console.debug('[FilesView] typeAhead: buffer=%s match=%s', typeAheadBuffer.value, file.name)
    }
    return
  }

  // Quick Look
  if (!ctrl && event.key === ' ') {
    event.preventDefault()
    if (selectedPaths.value.length === 1) {
      const file = fileEntries.value.find(f => f.path === selectedPaths.value[0])
      if (file && !file.isDir) {
        await openPreview(file)
      }
    }
  }
}

// ─── Quick Look 预览 ────────────────────────────────────────

async function openPreview(file: FileEntry): Promise<void> {
  console.debug('[FilesView] openPreview:', file.name)
  if (file.isDir) {
    return
  }
  try {
    previewData.value = await window.browserAPI.readFilePreview(file.path)
    previewIndex.value = sortedFiles.value.findIndex(f => f.path === file.path)
    previewVisible.value = true
  }
  catch (err) {
    console.error('[FilesView] openPreview error:', err)
    toast.error((err as Error).message || '无法预览文件')
  }
}

function closePreview(): void {
  console.debug('[FilesView] closePreview')
  previewVisible.value = false
  previewData.value = null
}

async function previousPreview(): Promise<void> {
  console.debug('[FilesView] previousPreview')
  if (previewIndex.value > 0) {
    const file = sortedFiles.value[previewIndex.value - 1]
    if (file && !file.isDir) {
      previewIndex.value--
      await openPreview(file)
    }
  }
}

async function nextPreview(): Promise<void> {
  console.debug('[FilesView] nextPreview')
  if (previewIndex.value < sortedFiles.value.length - 1) {
    const file = sortedFiles.value[previewIndex.value + 1]
    if (file && !file.isDir) {
      previewIndex.value++
      await openPreview(file)
    }
  }
}

// 添加书签
async function handleAddBookmark(): Promise<void> {
  console.debug('[FilesView] handleAddBookmark')
  const baseName = currentPath.value.split('/').pop() || '书签'
  // 同名书签追加序号，如「项目」「项目 (2)」「项目 (3)」
  const existing = new Set(fileBookmarks.value.map(b => b.name))
  let bmName = baseName
  if (existing.has(bmName)) {
    let n = 2
    while (existing.has(`${baseName} (${n})`)) {
      n++
    }
    bmName = `${baseName} (${n})`
  }
  try {
    await window.browserAPI.addFileBookmark(currentPath.value, bmName)
    await loadMetadata()
  }
  catch (err) {
    console.error('[FilesView] handleAddBookmark error:', err)
    toast.error((err as Error).message || '添加书签失败')
  }
}

// 文件图标
function getFileIcon(file: FileEntry): string {
  if (file.isDir) {
    return 'mdi:folder'
  }
  const ext = file.extension.toLowerCase()
  const iconMap: Record<string, string> = {
    jpg: 'mdi:file-image',
    jpeg: 'mdi:file-image',
    png: 'mdi:file-image',
    gif: 'mdi:file-image',
    svg: 'mdi:file-image',
    pdf: 'mdi:file-pdf-box',
    txt: 'mdi:file-document',
    md: 'mdi:file-document',
    js: 'mdi:file-code',
    ts: 'mdi:file-code',
    html: 'mdi:file-code',
    css: 'mdi:file-code',
    json: 'mdi:file-code',
    mp3: 'mdi:file-music',
    mp4: 'mdi:file-video',
    zip: 'mdi:zip-box',
  }
  return iconMap[ext] || 'mdi:file'
}

/** 按文件类型返回图标颜色（与图标语义一致，便于快速区分文件种类） */
function getFileIconColor(file: FileEntry): string {
  if (file.isDir) {
    return '#f5a623'
  } // 文件夹：橙黄
  const ext = file.extension.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)) {
    return '#27ae60'
  } // 图片：绿
  if (['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv'].includes(ext)) {
    return '#9b59b6'
  } // 视频：紫
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma'].includes(ext)) {
    return '#e91e63'
  } // 音频：粉
  if (ext === 'pdf') {
    return '#d32f2f'
  } // PDF：红
  if (['zip', 'rar', '7z', 'tar', 'gz', 'tgz'].includes(ext)) {
    return '#8d6e63'
  } // 压缩包：棕
  if (['js', 'ts', 'tsx', 'jsx', 'json', 'css', 'html', 'vue', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'sh'].includes(ext)) {
    return '#2196f3'
  } // 代码：蓝
  if (['txt', 'md', 'doc', 'docx', 'rtf', 'log'].includes(ext)) {
    return '#607d8b'
  } // 文档：蓝灰
  return 'var(--text-muted)' // 未知类型：随主题弱化
}

/** 按文件类型返回种类标签（列表视图「种类」列） */
function getFileKind(file: FileEntry): string {
  if (file.isDir) {
    return t('files.kindFolder')
  }
  const ext = file.extension.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)) {
    return t('files.kindImage')
  }
  if (['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv'].includes(ext)) {
    return t('files.kindVideo')
  }
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma'].includes(ext)) {
    return t('files.kindAudio')
  }
  if (ext === 'pdf') {
    return t('files.kindPdf')
  }
  if (['zip', 'rar', '7z', 'tar', 'gz', 'tgz'].includes(ext)) {
    return t('files.kindArchive')
  }
  if (['js', 'ts', 'tsx', 'jsx', 'json', 'css', 'html', 'vue', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'sh'].includes(ext)) {
    return t('files.kindCode')
  }
  if (['txt', 'md', 'doc', 'docx', 'rtf', 'log'].includes(ext)) {
    return t('files.kindDoc')
  }
  return t('files.kindOther')
}

// 格式化工具
function formatSize(bytes: number): string {
  if (bytes === 0) {
    return ''
  }
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / 1024 ** i).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`
}

// 加载系统目录和书签
async function loadMetadata(): Promise<void> {
  console.debug('[FilesView] loadMetadata')
  try {
    const [dirs, bookmarks] = await Promise.all([
      window.browserAPI.getSystemDirs(),
      window.browserAPI.getFileBookmarks(),
    ])
    systemDirs.value = dirs
    fileBookmarks.value = bookmarks
  }
  catch (err) {
    console.error('[FilesView] loadMetadata error:', err)
    toast.error((err as Error).message || '加载系统目录失败')
  }
}

// 从 URL 解析初始路径
function parseInitialPath(): string {
  const fullPath = route.path
  const match = fullPath.match(/^(\/files|\/ftp|\/sftp)\/(.+)$/)
  if (match) {
    return toLocalPath(match[2])
  }
  // 默认打开主目录（后续改为 IPC 获取）
  return '~'
}

// 监听路由变化
watch(
  () => route.path,
  async () => {
    const dirPath = parseInitialPath()
    currentPath.value = dirPath
    selectedPaths.value = []
    await loadDirectory(dirPath)
    // 路由切到新目录：重新监听该目录的外部变更
    setWatchDir(dirPath)
  },
  { immediate: false },
)

// 视图模式持久化
watch(viewMode, (mode) => {
  console.debug('[FilesView] viewMode changed:', mode)
  window.browserAPI.setSetting({ key: 'files.viewMode', value: mode })
})

onMounted(async () => {
  console.debug('[FilesView] onMounted')
  await loadMetadata()
  // 恢复列表列顺序/宽度（本地持久化）
  await loadListColumns()
  // 恢复视图模式（本地持久化）
  const savedView = (await window.browserAPI.getSetting('files.viewMode')) as string | null
  if (savedView === 'list' || savedView === 'icon') {
    viewMode.value = savedView
  }
  const dirPath = parseInitialPath()
  currentPath.value = dirPath
  pushHistory(dirPath)
  await loadDirectory(dirPath)
  // 监听当前目录的外部变更，实时重载
  setWatchDir(dirPath)
  filesChangedUnsub = window.browserAPI.onFilesChanged((dirPath: string) => {
    // 仅处理当前正在浏览的目录（主进程按目录广播，可能含其他标签目录）
    if (dirPath !== currentPath.value) {
      return
    }
    if (filesChangedTimer.value !== null) {
      window.clearTimeout(filesChangedTimer.value)
    }
    filesChangedTimer.value = window.setTimeout(() => {
      filesChangedTimer.value = null
      void reloadCurrentDir()
    }, 300)
  })
  // 注册快捷键
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  console.debug('[FilesView] onUnmounted')
  window.removeEventListener('keydown', handleKeyDown)
  // 框选进行中卸载：复位状态（window 监听为一次性，mouseup 已移除；兜底清理）
  if (marqueeActive.value) {
    marqueeRect.value = null
    marqueeHitPaths.value = []
    marqueeActive.value = false
  }
  // 输入定位计时器清理
  if (typeAheadTimer.value !== null) {
    window.clearTimeout(typeAheadTimer.value)
    typeAheadTimer.value = null
  }
  // 实时变更去抖计时器清理
  if (filesChangedTimer.value !== null) {
    window.clearTimeout(filesChangedTimer.value)
    filesChangedTimer.value = null
  }
  // 取消变更监听并释放当前目录 watcher
  if (typeof filesChangedUnsub === 'function') {
    filesChangedUnsub()
  }
  if (watchedDir.value) {
    window.browserAPI.unwatchDir(watchedDir.value)
  }
})
</script>

<style scoped lang="less">
.files-view {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-secondary);

  &--loading {
    opacity: 0.5;
  }
}

/* 左侧快捷访问 */
.files-sidebar {
  width: 200px;
  flex-shrink: 0;
  padding: 16px 8px;
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  background: var(--bg-secondary);

  .sidebar-section {
    margin-bottom: 16px;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .sidebar-divider {
    height: 1px;
    background: var(--border-color);
    margin: 8px 0 16px;
  }

  .sidebar-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
    color: var(--text-primary);

    &:hover {
      background: var(--bg-hover);
    }

    &.is-active {
      background: var(--bg-selected);
    }
  }

  .sidebar-icon {
    flex-shrink: 0;
    opacity: 0.8;
  }

  .sidebar-label {
    height: 22px;
    line-height: 22px;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sidebar-rename-input {
    box-sizing: border-box;
    height: 22px;
    flex: 1;
    min-width: 0;
    font-size: 13px;
    padding: 0 4px;
    border: 1px solid var(--accent-color);
    border-radius: 4px;
    background: var(--bg-input-focus);
    color: var(--text-primary);
    outline: none;
  }
}

/* 右侧内容区 */
.files-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);

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
