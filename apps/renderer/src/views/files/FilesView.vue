<template>
  <div
    class="files-view"
    :class="{ 'files--loading': showSkeleton }"
    @contextmenu.prevent
  >
    <!-- 左侧快捷访问 -->
    <FilesSidebar
      :system-dirs="systemDirs"
      :file-bookmarks="fileBookmarks"
      :current-path="currentPath"
      @navigate="navigateTo"
      @refresh-metadata="loadMetadata"
    />

    <!-- 右侧内容区 -->
    <section class="files-content">
      <!-- 面包屑 + 工具栏 合并单行 -->
      <FilesTopbar
        v-model:search-query="searchQuery"
        v-model:view-mode="viewMode"
        :segments="breadcrumbSegments"
        :sort-by="sortBy"
        @navigate-breadcrumb="navigateToBreadcrumb"
        @search="handleSearch"
        @clear-search="clearSearch"
        @sort-change="handleSortChange"
      />

      <!-- 列表视图表头（仅 list 模式显示，支持列拖拽重排 + 列宽拖拽调整） -->
      <FilesListHeader
        v-if="viewMode === 'list'"
        :columns="listColumns"
        :labels="listColumnLabels"
        :grid-template="listGridTemplate"
        @resize-start="onColumnResizeStart"
        @drag-start="onColumnDragStart"
        @drop="onColumnDrop"
      />

      <!-- 文件列表 -->
      <FileList
        v-model:renaming-name="renamingName"
        :view-mode="viewMode"
        :files="sortedFiles"
        :selected-paths="selectedPaths"
        :renaming-path="renamingPath"
        :drag-files="dragFiles"
        :marquee-hit-paths="marqueeHitPaths"
        :marquee-active="marqueeActive"
        :marquee-rect="marqueeRect"
        :drag-over-files-list="dragOverFilesList"
        :show-skeleton="showSkeleton"
        :directory-error="directoryError"
        :is-empty="fileEntries.length === 0"
        :search-query="searchQuery"
        :columns="listColumns"
        :grid-template="listGridTemplate"
        :set-rename-input="setFileRenameInput"
        :render-cell-content="renderCellContent"
        @list-click="clearSelection"
        @list-context-menu="handleContextMenu"
        @marquee-start="onMarqueeStart"
        @list-drag-over="handleDragOverList"
        @list-drag-leave="handleDragLeaveList"
        @list-drop="handleDropOnList"
        @item-click="handleItemClick"
        @item-dbl-click="handleItemDblClick"
        @item-context-menu="handleFileContextMenu"
        @item-drag-start="handleDragStart"
        @item-drag-end="handleDragEnd"
        @rename-confirm="confirmRename"
        @rename-keydown="cancelRename"
        @rename-blur="cancelRename"
      />

      <!-- 状态栏 -->
      <FilesStatusBar
        :total-count="fileEntries.length"
        :selected-phrase="selectedPhrase"
      />
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
import type { FileBookmark, FileEntry, MenuItem, SystemDir } from '@browser/ipc-contract'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useI18n } from '@/composables/useI18n'
import { usePageTitle } from '@/composables/usePageTitle'
import { useToast } from '@/composables/useToast'
import { ContextMenu } from '@/lib/context-menu'
import { isMacOS } from '@/utils/os'

import FileList from './FileList.vue'
import FilesListHeader from './FilesListHeader.vue'
import FilesSidebar from './FilesSidebar.vue'
import FilesStatusBar from './FilesStatusBar.vue'
import FilesTopbar from './FilesTopbar.vue'
import QuickLookPanel from './QuickLookPanel.vue'
import { useFileDisplay } from './useFileDisplay'
import { useFileDragDrop } from './useFileDragDrop'
import { useFileRename } from './useFileRename'
import { useListColumns } from './useListColumns'
import { useMarqueeSelection } from './useMarqueeSelection'
import { useQuickLook } from './useQuickLook'

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
  } catch {
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
const searchQuery = ref('')
const selectedPaths = ref<string[]>([])
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
const { formatSize } = useFileDisplay()
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

// ─── 功能模块（composables） ────────────────────────────────

// 列表视图列：顺序/宽度/拖拽/持久化
const {
  listColumns,
  listColumnLabels,
  listGridTemplate,
  onColumnResizeStart,
  onColumnDragStart,
  onColumnDrop,
  loadListColumns,
  renderCellContent,
} = useListColumns()

// 文件重命名状态机
const {
  renamingPath,
  renamingName,
  setFileRenameInput,
  cancelRenameTimer,
  getRenameTimer,
  scheduleRename,
  startRename,
  confirmRename,
  cancelRename,
} = useFileRename({
  fileEntries,
  currentPath,
  sortedFiles,
  selectedPaths,
  lastClickedIndex,
  loadDirectory,
})

// 框选与清空选中
const {
  marqueeRect,
  marqueeHitPaths,
  marqueeActive,
  onMarqueeStart,
  clearSelection,
} = useMarqueeSelection({
  sortedFiles,
  viewMode,
  selectedPaths,
  onCancelRename: cancelRenameTimer,
})

// 文件拖拽交互
const {
  dragOverFilesList,
  dragFiles,
  handleDragStart,
  handleDragEnd,
  handleDragOverList,
  handleDragLeaveList,
  handleDropOnList,
} = useFileDragDrop({ selectedPaths, currentPath })

// Quick Look 预览
const {
  previewVisible,
  previewData,
  openPreview,
  closePreview,
  previousPreview,
  nextPreview,
} = useQuickLook({ sortedFiles })

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
  } catch (err) {
    const message = (err as Error).message || '读取目录失败'
    console.error('[FilesView] loadDirectory error:', err)
    // 敏感目录 / 无权限等受保护目录：页面内提示，不弹 toast
    if (isAccessDeniedError(message)) {
      console.debug('[FilesView] loadDirectory 受保护目录，页面内提示:', message)
      directoryError.value = t('files.accessDenied')
      fileEntries.value = []
    } else {
      toast.error(message)
    }
  } finally {
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
    cancelRenameTimer()
    const [from, to] = lastClickedIndex.value < idx ? [lastClickedIndex.value, idx] : [idx, lastClickedIndex.value]
    selectedPaths.value = items.slice(from, to + 1).map(f => f.path)
    return
  }

  if (isMulti) {
    cancelRenameTimer()
    const pos = selectedPaths.value.indexOf(file.path)
    if (pos === -1) {
      selectedPaths.value = [...selectedPaths.value, file.path]
    } else {
      selectedPaths.value = selectedPaths.value.filter(p => p !== file.path)
    }
  } else if (isSelected(file.path) && selectedPaths.value.length === 1) {
    // 已选中的单项再次单击：延迟进入重命名；若随后触发 dblclick（导航/打开），
    // handleItemDblClick 会取消本次重命名，因此文件与文件夹均适用。
    // 双击的第二击（detail>=2）不再重复安排，紧随的 dblclick 会负责取消第一击安排的计时器
    console.debug('[FilesView] handleItemClick: 单击已选中项 %s isDir=%s detail=%d → 设置 renameTimer', file.name, file.isDir, event.detail)
    if (event.detail <= 1) {
      scheduleRename(file)
    }
  } else {
    cancelRenameTimer()
    selectedPaths.value = [file.path]
  }
  lastClickedIndex.value = idx
}

// 双击文件项
async function handleItemDblClick(file: FileEntry): Promise<void> {
  console.debug('[FilesView] handleItemDblClick: %s, 清除renameTimer=%d', file.name, getRenameTimer())
  cancelRenameTimer()
  if (file.isDir) {
    await navigateTo(file.path)
  } else {
    await window.browserAPI.openFile(file.path)
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
  } catch (err) {
    console.error('[FilesView] handleSearch error:', err)
    toast.error((err as Error).message || '搜索失败')
  } finally {
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
  } catch (err) {
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
  } catch (err) {
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
  } catch (err) {
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
  } catch (err) {
    console.error('[FilesView] handleCut error:', err)
    toast.error((err as Error).message || '剪切失败')
  }
}

async function handlePaste(): Promise<void> {
  console.debug('[FilesView] handlePaste to:', currentPath.value)
  try {
    await window.browserAPI.pasteFiles(currentPath.value)
    await loadDirectory(currentPath.value)
  } catch (err) {
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
  } else {
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
    } else {
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
  } catch (err) {
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

/* 右侧内容区 */
.files-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
}
</style>
