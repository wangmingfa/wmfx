import type { FileEntry } from '@browser/ipc-contract'
import { type ComputedRef, nextTick, type Ref, ref } from 'vue'

import { useToast } from '@/composables/useToast'

/** useFileRename 依赖的外部状态（由 useFileStore 注入，避免状态复制） */
export interface FileRenameDeps {
  fileEntries: Ref<FileEntry[]>
  currentPath: Ref<string>
  sortedFiles: ComputedRef<FileEntry[]>
  selectedPaths: Ref<string[]>
  lastClickedIndex: Ref<number>
  loadDirectory: (path: string) => Promise<void>
}

export interface FileRenameResult {
  renamingPath: Ref<string | null>
  renamingName: Ref<string>
  setFileRenameInput: (el: unknown) => void
  cancelRenameTimer: () => void
  getRenameTimer: () => number
  scheduleRename: (file: FileEntry) => void
  startRename: (file: FileEntry) => void
  confirmRename: () => Promise<void>
  cancelRename: () => void
}

/**
 * 文件重命名状态机：延迟重命名计时器（单击已选中项触发）、输入框绑定、确认/取消。
 * dblclick（导航/打开）会先 cancelRenameTimer 取消挂起的重命名，二者不冲突。
 */
export function useFileRename(deps: FileRenameDeps): FileRenameResult {
  const toast = useToast()
  const { fileEntries, currentPath, sortedFiles, selectedPaths, lastClickedIndex, loadDirectory } =
    deps

  // 重命名状态
  let renameTimer = 0
  const renamingPath = ref<string | null>(null)
  const renamingName = ref('')
  // 文件重命名输入框（v-for 内同一时刻仅一个渲染）；用函数 ref 确保正确绑定
  const fileRenameInput = ref<HTMLInputElement | null>(null)
  function setFileRenameInput(el: unknown): void {
    fileRenameInput.value = (el as HTMLInputElement | null) ?? null
  }

  // 取消待触发的延迟重命名计时器（多选/范围选择/双击导航/清空选中/重新设置前调用）
  function cancelRenameTimer(): void {
    clearTimeout(renameTimer)
    renameTimer = 0
  }

  // 读取当前计时器 id（仅用于调试日志）
  function getRenameTimer(): number {
    return renameTimer
  }

  // 单击已选中项后延迟进入重命名；若随后触发 dblclick 会被 cancelRenameTimer 取消。
  // 延迟需大于双击两击间隔（通常 100~250ms），否则重命名会在第二击到来前触发，
  // 后续点击落在输入框上导致 dblclick 无法取消（双击变重命名的 bug）；取 300ms 兼顾响应速度
  function scheduleRename(file: FileEntry): void {
    cancelRenameTimer()
    renameTimer = window.setTimeout(startRename, 300, file)
  }

  function startRename(file: FileEntry): void {
    console.debug(
      '[useFileRename] startRename: %s renamingPath(before)=%s',
      file.name,
      renamingPath.value
    )
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
    const currentName = fileEntries.value.find((f) => f.path === renamingPath.value)?.name
    if (newName === currentName) {
      cancelRename()
      return
    }
    const newPath = currentPath.value.endsWith('/')
      ? `${currentPath.value}${newName}`
      : `${currentPath.value}/${newName}`
    try {
      await window.browserAPI.rename(renamingPath.value, newPath)
      cancelRename()
      await loadDirectory(currentPath.value)
      // 重命名后选中新文件（路径已变化）
      selectedPaths.value = [newPath]
      lastClickedIndex.value = sortedFiles.value.findIndex((f) => f.path === newPath)
    } catch (err) {
      console.error('[useFileRename] confirmRename error:', err)
      toast.error((err as Error).message || '重命名失败')
      cancelRename()
    }
  }

  function cancelRename(): void {
    renamingPath.value = null
    renamingName.value = ''
  }

  return {
    renamingPath,
    renamingName,
    setFileRenameInput,
    cancelRenameTimer,
    getRenameTimer,
    scheduleRename,
    startRename,
    confirmRename,
    cancelRename,
  }
}
