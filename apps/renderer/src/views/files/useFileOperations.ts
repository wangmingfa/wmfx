import type { FileEntry } from '@browser/ipc-contract'
import type { Ref } from 'vue'

import { useToast } from '@/composables/useToast'

/** useFileOperations 依赖的外部状态（由 useFileStore 注入） */
export interface FileOperationsDeps {
  currentPath: Ref<string>
  fileEntries: Ref<FileEntry[]>
  selectedPaths: Ref<string[]>
  loadDirectory: (path: string) => Promise<void>
  navigateTo: (path: string) => Promise<void>
  startRename: (file: FileEntry) => void
  openPreview: (file: FileEntry) => Promise<void>
}

export interface FileOperationsResult {
  handleDelete: (paths: string[]) => Promise<void>
  handleCopy: () => Promise<void>
  handleCut: () => Promise<void>
  handlePaste: () => Promise<void>
  handleNewFolder: () => Promise<void>
  handleItemDblClick: (file: FileEntry) => Promise<void>
}

/**
 * 文件操作：删除、复制/剪切/粘贴、新建文件夹、双击打开/导航。
 * 从 FilesView.vue 完整复制，行为与重构前完全一致。
 */
export function useFileOperations(deps: FileOperationsDeps): FileOperationsResult {
  const { currentPath, fileEntries, selectedPaths, loadDirectory, navigateTo, startRename } = deps
  const toast = useToast()

  // 删除
  async function handleDelete(paths: string[]): Promise<void> {
    console.debug('[useFileOperations] handleDelete: paths', paths)
    // 仅保留字符串路径并生成普通数组，避免 Vue 响应式代理 / 非克隆对象传入 IPC 时抛 "could not be cloned"
    const plainPaths = paths.filter((p) => typeof p === 'string')
    if (plainPaths.length !== paths.length) {
      console.warn('[useFileOperations] handleDelete: 跳过非字符串路径', paths)
    }
    try {
      await window.browserAPI.deleteFiles(plainPaths)
      selectedPaths.value = selectedPaths.value.filter((p) => !plainPaths.includes(p))
      await loadDirectory(currentPath.value)
    } catch (err) {
      console.error('[useFileOperations] handleDelete error:', err)
      toast.error((err as Error).message || '删除失败')
    }
  }

  // 新建文件夹
  async function handleNewFolder(): Promise<void> {
    console.debug('[useFileOperations] handleNewFolder')
    try {
      // 创建默认名称的文件夹
      let folderName = '未命名文件夹'
      let counter = 1
      while (fileEntries.value.some((f) => f.name === folderName)) {
        folderName = `未命名文件夹 (${counter})`
        counter++
      }
      const newPath = currentPath.value.endsWith('/')
        ? `${currentPath.value}${folderName}`
        : `${currentPath.value}/${folderName}`
      await window.browserAPI.mkdir(newPath)
      // 立即进入重命名状态
      await loadDirectory(currentPath.value)
      const newEntry = fileEntries.value.find((f) => f.name === folderName)
      if (newEntry) {
        startRename(newEntry)
      }
    } catch (err) {
      console.error('[useFileOperations] handleNewFolder error:', err)
      toast.error((err as Error).message || '新建文件夹失败')
    }
  }

  // 复制
  async function handleCopy(): Promise<void> {
    console.debug('[useFileOperations] handleCopy: selected', selectedPaths.value)
    if (selectedPaths.value.length === 0) {
      return
    }
    try {
      await window.browserAPI.copyFiles(selectedPaths.value, currentPath.value)
    } catch (err) {
      console.error('[useFileOperations] handleCopy error:', err)
      toast.error((err as Error).message || '复制失败')
    }
  }

  // 剪切
  async function handleCut(): Promise<void> {
    console.debug('[useFileOperations] handleCut: selected', selectedPaths.value)
    if (selectedPaths.value.length === 0) {
      return
    }
    try {
      await window.browserAPI.cutFiles(selectedPaths.value, currentPath.value)
    } catch (err) {
      console.error('[useFileOperations] handleCut error:', err)
      toast.error((err as Error).message || '剪切失败')
    }
  }

  // 粘贴
  async function handlePaste(): Promise<void> {
    console.debug('[useFileOperations] handlePaste to:', currentPath.value)
    try {
      await window.browserAPI.pasteFiles(currentPath.value)
      await loadDirectory(currentPath.value)
    } catch (err) {
      console.error('[useFileOperations] handlePaste error:', err)
      toast.error((err as Error).message || '粘贴失败')
    }
  }

  // 双击文件项
  async function handleItemDblClick(file: FileEntry): Promise<void> {
    console.debug('[useFileOperations] handleItemDblClick: %s', file.name)
    if (file.isDir) {
      await navigateTo(file.path)
    } else {
      await window.browserAPI.openFile(file.path)
    }
  }

  return {
    handleDelete,
    handleCopy,
    handleCut,
    handlePaste,
    handleNewFolder,
    handleItemDblClick,
  }
}
