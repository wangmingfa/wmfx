import type {
  FileBookmark,
  FileEntry,
  MenuItem,
  PreviewData,
  SystemDir,
} from '@browser/ipc-contract'
import type { ComputedRef, Ref } from 'vue'
import { computed, nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useI18n } from '@/composables/useI18n'
import { usePageTitle } from '@/composables/usePageTitle'
import { ContextMenu } from '@/lib/context-menu'
import { isMacOS } from '@/utils/os'
import { useFileDragDrop } from './useFileDragDrop'
import { useFileMetadata } from './useFileMetadata'
import { useFileNavigation } from './useFileNavigation'
import { useFileOperations } from './useFileOperations'
import { useFileRename } from './useFileRename'
import { useFileSelection } from './useFileSelection'
import type { ListViewColumn } from './useListColumns'
import { useListColumns } from './useListColumns'
import { useMarqueeSelection } from './useMarqueeSelection'
import { useQuickLook } from './useQuickLook'

// ── FileStore 接口（所有共享状态 + 操作函数 + 生命周期） ──

export interface FileStore {
  // 导航状态
  currentPath: Ref<string>
  fileEntries: Ref<FileEntry[]>
  sortedFiles: ComputedRef<FileEntry[]>
  breadcrumbSegments: ComputedRef<Array<{ label: string; path: string }>>
  directoryError: Ref<string | null>
  isLoading: Ref<boolean>
  showSkeleton: Ref<boolean>
  protocol: ComputedRef<'local' | 'ftp' | 'sftp'>

  // 视图状态
  viewMode: Ref<'icon' | 'list'>
  sortBy: Ref<string>
  searchQuery: Ref<string>

  // 选中状态
  selectedPaths: Ref<string[]>
  lastClickedIndex: Ref<number>
  selectedCount: ComputedRef<number>
  selectedPhrase: ComputedRef<string>

  // 重命名状态
  renamingPath: Ref<string | null>
  renamingName: Ref<string>
  setFileRenameInput: (el: unknown) => void

  // 拖拽状态
  dragFiles: Ref<string[]>
  dragOverFilesList: Ref<boolean>

  // 框选状态
  marqueeRect: Ref<{ left: number; top: number; right: number; bottom: number } | null>
  marqueeHitPaths: Ref<string[]>
  marqueeActive: Ref<boolean>

  // Quick Look
  previewVisible: Ref<boolean>
  previewData: Ref<PreviewData | null>

  // 元数据
  systemDirs: Ref<SystemDir[]>
  fileBookmarks: Ref<FileBookmark[]>

  // 列表列
  listColumns: Ref<ListViewColumn[]>
  listColumnLabels: Record<ListViewColumn['key'], string>
  listGridTemplate: ComputedRef<string>

  // 操作函数
  navigateTo: (path: string) => Promise<void>
  navigateToBreadcrumb: (index: number) => void
  goBack: () => Promise<void>
  goForward: () => Promise<void>
  loadDirectory: (path: string) => Promise<void>
  reloadCurrentDir: () => Promise<void>
  loadMetadata: () => Promise<void>
  handleSearch: () => Promise<void>
  clearSearch: () => void
  handleSortChange: (value: string) => void
  handleItemClick: (file: FileEntry, event: MouseEvent) => void
  handleItemDblClick: (file: FileEntry) => Promise<void>
  handleDelete: (paths: string[]) => Promise<void>
  handleCopy: () => Promise<void>
  handleCut: () => Promise<void>
  handlePaste: () => Promise<void>
  handleNewFolder: () => Promise<void>
  startRename: (file: FileEntry) => void
  confirmRename: () => Promise<void>
  cancelRename: () => void
  scheduleRename: (file: FileEntry) => void
  cancelRenameTimer: () => void
  openPreview: (file: FileEntry) => Promise<void>
  closePreview: () => void
  previousPreview: () => Promise<void>
  nextPreview: () => Promise<void>
  isSelected: (path: string) => boolean
  selectAll: () => void
  onMarqueeStart: (event: MouseEvent) => void
  clearSelection: (event: MouseEvent) => void
  onColumnResizeStart: (key: ListViewColumn['key'], event: MouseEvent) => void
  onColumnDragStart: (key: ListViewColumn['key'], event: DragEvent) => void
  onColumnDrop: (targetKey: ListViewColumn['key']) => void
  handleDragStart: (event: DragEvent, file: FileEntry) => void
  handleDragEnd: () => void
  handleDragOverList: (event: DragEvent) => void
  handleDragLeaveList: () => void
  handleDropOnList: (event: DragEvent) => Promise<void>
  renderCellContent: (file: FileEntry, key: ListViewColumn['key']) => string
  showFileContextMenu: (event: MouseEvent, file?: FileEntry | null) => void

  // 生命周期
  setup: () => Promise<void>
  teardown: () => void
}

// ── useFileStore 实现 ──

export function useFileStore(): FileStore {
  const route = useRoute()
  const router = useRouter()
  const { t } = useI18n()

  // ── 共享原始 refs ──
  const currentPath = ref('')
  const fileEntries = ref<FileEntry[]>([])
  const selectedPaths = ref<string[]>([])
  const lastClickedIndex = ref(-1)
  const sortBy = ref('name')
  const searchQuery = ref('')
  const viewMode = ref<'icon' | 'list'>('icon')
  const directoryError = ref<string | null>(null)
  const navHistory = ref<string[]>([])
  const navIndex = ref(-1)
  const isLoading = ref(false)
  const showSkeleton = ref(false)

  // 标签页标题同步为当前文件夹路径（document.title → 主进程 page-title-updated → 标签栏）
  usePageTitle(currentPath)

  // 协议类型（根据 route.path 判断）
  const protocol = computed<'local' | 'ftp' | 'sftp'>(() => {
    const path = route.path
    if (path.startsWith('/ftp')) return 'ftp'
    if (path.startsWith('/sftp')) return 'sftp'
    return 'local'
  })

  // 选中相关计算属性由 selection composable 提供

  // ── 创建 composable（按依赖顺序） ──

  // 1. Navigation（需要 route、router、protocol）
  const navigation = useFileNavigation({
    currentPath,
    fileEntries,
    selectedPaths,
    lastClickedIndex,
    sortBy,
    searchQuery,
    viewMode,
    directoryError,
    navHistory,
    navIndex,
    protocol,
    route,
    router,
  })

  // 2. Rename（需要 loadDirectory）
  const rename = useFileRename({
    fileEntries,
    currentPath,
    sortedFiles: navigation.sortedFiles,
    selectedPaths,
    lastClickedIndex,
    loadDirectory: navigation.loadDirectory,
  })

  // 3. Selection（需要 rename hooks）
  const selection = useFileSelection({
    fileEntries,
    sortedFiles: navigation.sortedFiles,
    selectedPaths,
    lastClickedIndex,
    scheduleRename: rename.scheduleRename,
    cancelRenameTimer: rename.cancelRenameTimer,
  })

  // 4. Marquee
  const marquee = useMarqueeSelection({
    sortedFiles: navigation.sortedFiles,
    viewMode,
    selectedPaths,
    onCancelRename: rename.cancelRenameTimer,
  })

  // 5. DragDrop
  const dragDrop = useFileDragDrop({ selectedPaths, currentPath })

  // 6. QuickLook
  const quickLook = useQuickLook({ sortedFiles: navigation.sortedFiles })

  // 7. ListColumns
  const listColumns = useListColumns()

  // 8. Metadata
  const metadata = useFileMetadata()

  // 9. Operations
  const operations = useFileOperations({
    currentPath,
    fileEntries,
    selectedPaths,
    loadDirectory: navigation.loadDirectory,
    navigateTo: navigation.navigateTo,
    startRename: rename.startRename,
    openPreview: quickLook.openPreview,
  })

  // ── 生命周期收集 ──

  const setups: Array<() => void | Promise<void>> = []
  const teardowns: Array<() => void> = []

  if (navigation.setup) setups.push(navigation.setup)
  if (navigation.teardown) teardowns.push(navigation.teardown)
  if (marquee.teardown) teardowns.push(marquee.teardown)

  // ── 键盘快捷键 ──

  const typeAheadBuffer = ref('')
  const typeAheadTimer = ref<number | null>(null)
  let keydownHandler: ((event: KeyboardEvent) => Promise<void>) | null = null

  async function handleKeyDown(event: KeyboardEvent): Promise<void> {
    const target = event.target as HTMLElement | null
    if (!target) return
    if (target.tagName === 'INPUT') return
    if (target.getAttribute('placeholder') === t('files.searchPlaceholder')) return

    const ctrl = event.ctrlKey || event.metaKey

    // 打开文件
    if ((isMacOS && ctrl && event.key === 'o') || (!isMacOS && !ctrl && event.key === 'Enter')) {
      event.preventDefault()
      if (selectedPaths.value.length === 1) {
        const file = fileEntries.value.find((f) => f.path === selectedPaths.value[0])
        if (file) {
          await operations.handleItemDblClick(file)
        }
      }
      return
    }

    // 上下方向键选择（Shift 范围多选）
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (event.ctrlKey || event.altKey) return
      event.preventDefault()
      const items = navigation.sortedFiles.value
      if (items.length === 0) return
      const dir = event.key === 'ArrowDown' ? 1 : -1
      const next =
        lastClickedIndex.value < 0
          ? 0
          : Math.min(items.length - 1, Math.max(0, lastClickedIndex.value + dir))
      if (event.shiftKey && lastClickedIndex.value >= 0) {
        const [from, to] =
          lastClickedIndex.value < next
            ? [lastClickedIndex.value, next]
            : [next, lastClickedIndex.value]
        selectedPaths.value = items.slice(from, to + 1).map((f: FileEntry) => f.path)
      } else {
        selectedPaths.value = [items[next].path]
        lastClickedIndex.value = next
      }
      return
    }

    // 返回上级
    if (
      (isMacOS && ctrl && event.key === 'ArrowUp') ||
      (!isMacOS && event.altKey && event.key === 'ArrowUp')
    ) {
      event.preventDefault()
      await navigation.goBack()
      return
    }

    // 前进
    if (
      (isMacOS && ctrl && event.key === 'ArrowDown') ||
      (!isMacOS && event.altKey && event.key === 'ArrowDown')
    ) {
      event.preventDefault()
      await navigation.goForward()
      return
    }

    // 重命名
    if ((isMacOS && event.key === 'Enter' && !ctrl) || (!isMacOS && !ctrl && event.key === 'F2')) {
      event.preventDefault()
      if (selectedPaths.value.length === 1) {
        const file = fileEntries.value.find((f) => f.path === selectedPaths.value[0])
        if (file) {
          rename.startRename(file)
        }
      }
      return
    }

    // 删除
    if (
      (isMacOS && ctrl && event.key === 'Backspace') ||
      (!isMacOS && !ctrl && event.key === 'Delete')
    ) {
      event.preventDefault()
      if (selectedPaths.value.length > 0) {
        await operations.handleDelete(selectedPaths.value)
      }
      return
    }

    // 复制/剪切/粘贴
    if (ctrl && event.key === 'c') {
      event.preventDefault()
      await operations.handleCopy()
      return
    }
    if (ctrl && event.key === 'x') {
      event.preventDefault()
      await operations.handleCut()
      return
    }
    if (ctrl && event.key === 'v') {
      event.preventDefault()
      await operations.handlePaste()
      return
    }

    // 全选
    if (ctrl && event.key === 'a') {
      event.preventDefault()
      selection.selectAll()
      return
    }

    // type-ahead：输入文件名前缀定位首个匹配项
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
      const idx = navigation.sortedFiles.value.findIndex((f: FileEntry) =>
        f.name.toLowerCase().startsWith(typeAheadBuffer.value)
      )
      if (idx >= 0) {
        const file = navigation.sortedFiles.value[idx]
        selectedPaths.value = [file.path]
        lastClickedIndex.value = idx
        await nextTick()
        const el = document.querySelector(
          `.file-item[data-path="${CSS.escape(file.path)}"]`
        ) as HTMLElement | null
        el?.scrollIntoView({ block: 'nearest' })
        console.debug(
          '[useFileStore] typeAhead: buffer=%s match=%s',
          typeAheadBuffer.value,
          file.name
        )
      }
      return
    }

    // Quick Look（空格键）
    if (!ctrl && event.key === ' ') {
      event.preventDefault()
      if (selectedPaths.value.length === 1) {
        const file = fileEntries.value.find((f) => f.path === selectedPaths.value[0])
        if (file && !file.isDir) {
          await quickLook.openPreview(file)
        }
      }
    }
  }

  // ── setup / teardown ──

  async function setup(): Promise<void> {
    console.debug('[useFileStore] setup')
    for (const fn of setups) {
      await fn()
    }
    await listColumns.loadListColumns()
    await metadata.loadMetadata()
    keydownHandler = handleKeyDown
    window.addEventListener('keydown', handleKeyDown)
  }

  function teardown(): void {
    console.debug('[useFileStore] teardown')
    for (const fn of teardowns) fn()
    if (keydownHandler) {
      window.removeEventListener('keydown', keydownHandler)
      keydownHandler = null
    }
    if (typeAheadTimer.value !== null) {
      window.clearTimeout(typeAheadTimer.value)
      typeAheadTimer.value = null
    }
  }

  // ── 返回完整 FileStore 对象 ──

  return {
    // 导航状态
    currentPath,
    fileEntries,
    sortedFiles: navigation.sortedFiles,
    breadcrumbSegments: navigation.breadcrumbSegments,
    directoryError,
    isLoading,
    showSkeleton,
    protocol,

    // 视图状态
    viewMode,
    sortBy,
    searchQuery,

    // 选中状态
    selectedPaths,
    lastClickedIndex,
    selectedCount: selection.selectedCount,
    selectedPhrase: selection.selectedPhrase,

    // 重命名状态
    renamingPath: rename.renamingPath,
    renamingName: rename.renamingName,
    setFileRenameInput: rename.setFileRenameInput,

    // 拖拽状态
    dragFiles: dragDrop.dragFiles,
    dragOverFilesList: dragDrop.dragOverFilesList,

    // 框选状态
    marqueeRect: marquee.marqueeRect,
    marqueeHitPaths: marquee.marqueeHitPaths,
    marqueeActive: marquee.marqueeActive,

    // Quick Look
    previewVisible: quickLook.previewVisible,
    previewData: quickLook.previewData,

    // 元数据
    systemDirs: metadata.systemDirs,
    fileBookmarks: metadata.fileBookmarks,

    // 列表列
    listColumns: listColumns.listColumns,
    listColumnLabels: listColumns.listColumnLabels,
    listGridTemplate: listColumns.listGridTemplate,

    // 操作函数
    navigateTo: navigation.navigateTo,
    navigateToBreadcrumb: navigation.navigateToBreadcrumb,
    goBack: navigation.goBack,
    goForward: navigation.goForward,
    loadDirectory: navigation.loadDirectory,
    reloadCurrentDir: navigation.reloadCurrentDir,
    loadMetadata: metadata.loadMetadata,
    handleSearch: navigation.handleSearch,
    clearSearch: navigation.clearSearch,
    handleSortChange: navigation.handleSortChange,
    handleItemClick: selection.handleItemClick,
    handleItemDblClick: operations.handleItemDblClick,
    handleDelete: operations.handleDelete,
    handleCopy: operations.handleCopy,
    handleCut: operations.handleCut,
    handlePaste: operations.handlePaste,
    handleNewFolder: operations.handleNewFolder,
    startRename: rename.startRename,
    confirmRename: rename.confirmRename,
    cancelRename: rename.cancelRename,
    scheduleRename: rename.scheduleRename,
    cancelRenameTimer: rename.cancelRenameTimer,
    openPreview: quickLook.openPreview,
    closePreview: quickLook.closePreview,
    previousPreview: quickLook.previousPreview,
    nextPreview: quickLook.nextPreview,
    isSelected: selection.isSelected,
    selectAll: selection.selectAll,
    onMarqueeStart: marquee.onMarqueeStart,
    clearSelection: marquee.clearSelection,
    onColumnResizeStart: listColumns.onColumnResizeStart,
    onColumnDragStart: listColumns.onColumnDragStart,
    onColumnDrop: listColumns.onColumnDrop,
    handleDragStart: dragDrop.handleDragStart,
    handleDragEnd: dragDrop.handleDragEnd,
    handleDragOverList: dragDrop.handleDragOverList,
    handleDragLeaveList: dragDrop.handleDragLeaveList,
    handleDropOnList: dragDrop.handleDropOnList,
    renderCellContent: listColumns.renderCellContent,

    // 右键菜单
    showFileContextMenu: (event: MouseEvent, file?: FileEntry | null) => {
      if (file) {
        console.debug('[useFileStore] showFileContextMenu: %s', file.name)
        // 选中该文件（如果未选中）
        if (!selectedPaths.value.includes(file.path)) {
          selectedPaths.value = [file.path]
          lastClickedIndex.value = navigation.sortedFiles.value.findIndex(
            (f: FileEntry) => f.path === file.path
          )
        }
      } else {
        console.debug('[useFileStore] showFileContextMenu: empty area')
      }
      event.preventDefault()
      event.stopPropagation()
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
          switch (action.id) {
            case 'open': {
              if (selectedPaths.value.length === 1) {
                const f = fileEntries.value.find((f) => f.path === selectedPaths.value[0])
                if (f) operations.handleItemDblClick(f)
              }
              break
            }
            case 'openNewTab': {
              if (selectedPaths.value.length === 1) {
                const f = fileEntries.value.find((f) => f.path === selectedPaths.value[0])
                if (f) window.browserAPI.createTab({ url: `wmfx://files${f.path}` })
              }
              break
            }
            case 'rename': {
              if (selectedPaths.value.length === 1) {
                const f = fileEntries.value.find((f) => f.path === selectedPaths.value[0])
                if (f) rename.startRename(f)
              }
              break
            }
            case 'delete':
              operations.handleDelete(selectedPaths.value)
              break
            case 'copy':
              operations.handleCopy()
              break
            case 'cut':
              operations.handleCut()
              break
            case 'newFolder':
              operations.handleNewFolder()
              break
            case 'paste':
              operations.handlePaste()
              break
            case 'selectAll':
              selectedPaths.value = fileEntries.value.map((f) => f.path)
              break
          }
        },
      })
      void menu
    },

    // 生命周期
    setup,
    teardown,
  }
}
