import type { FileEntry } from '@browser/ipc-contract'
import { type ComputedRef, computed, type Ref } from 'vue'

import { useI18n } from '@/composables/useI18n'
import { useFileDisplay } from './useFileDisplay'

/** useFileSelection 依赖的外部状态（由 useFileStore 注入，选区原始 refs 与 navigation 共享） */
export interface FileSelectionDeps {
  sortedFiles: ComputedRef<FileEntry[]>
  fileEntries: Ref<FileEntry[]>
  selectedPaths: Ref<string[]>
  lastClickedIndex: Ref<number>
  scheduleRename: (file: FileEntry) => void
  cancelRenameTimer: () => void
}

export interface FileSelectionResult {
  selectedPaths: Ref<string[]>
  lastClickedIndex: Ref<number>
  selectedCount: ComputedRef<number>
  selectedPhrase: ComputedRef<string>
  isSelected: (path: string) => boolean
  selectAll: () => void
  handleItemClick: (file: FileEntry, event: MouseEvent) => void
}

/**
 * 文件选区管理：单选/多选/范围选择、锚点（lastClickedIndex）、选中摘要文案。
 * 选区原始 refs（selectedPaths/lastClickedIndex）由 useFileStore 持有，
 * 重命名钩子（scheduleRename/cancelRenameTimer）通过 deps 直接传入。
 */
export function useFileSelection(deps: FileSelectionDeps): FileSelectionResult {
  const {
    sortedFiles,
    fileEntries,
    selectedPaths,
    lastClickedIndex,
    scheduleRename,
    cancelRenameTimer,
  } = deps
  const { t } = useI18n()
  const { formatSize } = useFileDisplay()

  // 选中数量（无选中时为 0）
  const selectedCount = computed(() => selectedPaths.value.length)
  // 若选中项全部为文件，给出友好总大小；否则为空
  const selectedSizeText = computed(() => {
    const selected = selectedPaths.value
    if (selected.length === 0) {
      return ''
    }
    const entries = fileEntries.value.filter((f) => selected.includes(f.path))
    const allFiles = entries.length > 0 && entries.every((f) => f.type !== 'directory')
    return allFiles ? formatSize(entries.reduce((sum, f) => sum + (f.size || 0), 0)) : ''
  })
  // 选中状态文案：已选择 M 个项目（，总大小）
  const selectedPhrase = computed(() => {
    const base = t('files.selectedCount', { count: selectedCount.value })
    return selectedSizeText.value ? `${base}，${selectedSizeText.value}` : base
  })

  // 选中状态
  function isSelected(path: string): boolean {
    return selectedPaths.value.includes(path)
  }

  // 全选
  function selectAll(): void {
    selectedPaths.value = fileEntries.value.map((f) => f.path)
  }

  // 点击文件项（支持 ctrl/cmd 多选、shift 范围选择）
  function handleItemClick(file: FileEntry, event: MouseEvent): void {
    const isSel = isSelected(file.path)
    console.debug(
      '[useFileSelection] handleItemClick: %s selected=%s multi=%s shift=%s selCount=%d',
      file.name,
      isSel,
      event.ctrlKey || event.metaKey,
      event.shiftKey,
      selectedPaths.value.length
    )
    // 阻止冒泡到 .files-list 的 clearSelection，否则选中会被立即清空
    event.stopPropagation()
    const items = sortedFiles.value
    const idx = items.findIndex((f) => f.path === file.path)
    const isMulti = event.ctrlKey || event.metaKey
    const isShift = event.shiftKey

    // shift 范围选择：以最近一次点击为锚点
    if (isShift && lastClickedIndex.value >= 0 && idx >= 0) {
      cancelRenameTimer()
      const [from, to] =
        lastClickedIndex.value < idx ? [lastClickedIndex.value, idx] : [idx, lastClickedIndex.value]
      selectedPaths.value = items.slice(from, to + 1).map((f) => f.path)
      return
    }

    if (isMulti) {
      cancelRenameTimer()
      const pos = selectedPaths.value.indexOf(file.path)
      if (pos === -1) {
        selectedPaths.value = [...selectedPaths.value, file.path]
      } else {
        selectedPaths.value = selectedPaths.value.filter((p) => p !== file.path)
      }
    } else if (isSelected(file.path) && selectedPaths.value.length === 1) {
      // 已选中的单项再次单击：延迟进入重命名；若随后触发 dblclick（导航/打开），
      // 打开动作会取消本次重命名，因此文件与文件夹均适用。
      // 双击的第二击（detail>=2）不再重复安排，紧随的 dblclick 会负责取消第一击安排的计时器
      console.debug(
        '[useFileSelection] handleItemClick: 单击已选中项 %s isDir=%s detail=%d → 设置 renameTimer',
        file.name,
        file.type === 'directory',
        event.detail
      )
      if (event.detail <= 1) {
        scheduleRename(file)
      }
    } else {
      cancelRenameTimer()
      selectedPaths.value = [file.path]
    }
    lastClickedIndex.value = idx
  }

  return {
    selectedPaths,
    lastClickedIndex,
    selectedCount,
    selectedPhrase,
    isSelected,
    selectAll,
    handleItemClick,
  }
}
