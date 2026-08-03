import type { FileEntry, PreviewData } from '@browser/ipc-contract'
import { type ComputedRef, type Ref, ref } from 'vue'

/** useQuickLook 依赖的外部状态（由 useFileStore 注入） */
export interface QuickLookDeps {
  sortedFiles: ComputedRef<FileEntry[]>
}

export interface QuickLookResult {
  previewVisible: Ref<boolean>
  previewData: Ref<PreviewData | null>
  openPreview: (file: FileEntry) => Promise<void>
  closePreview: () => void
  togglePreview: (file: FileEntry) => Promise<void>
  updatePreview: (index: number) => Promise<void>
}

/**
 * Quick Look 预览状态：打开/关闭/上一条/下一条。
 * 仅预览文件（跳过文件夹），索引基于当前排序后的列表。
 */
export function useQuickLook(deps: QuickLookDeps): QuickLookResult {
  const { sortedFiles } = deps

  // Quick Look 预览
  const previewVisible = ref(false)
  const previewData = ref<PreviewData | null>(null)
  const previewIndex = ref(-1)

  async function openPreview(file: FileEntry): Promise<void> {
    console.debug('[useQuickLook] openPreview:', file.name)
    previewVisible.value = true
    previewIndex.value = sortedFiles.value.findIndex((f) => f.path === file.path)
    try {
      previewData.value = await window.browserAPI.readFilePreview(file.path)
    } catch (err) {
      previewData.value = {
        type: 'unknown',
        filePath: file.path,
        fileName: file.name,
        fileSize: 0,
      }
      console.error(
        '[useQuickLook] openPreview error:',
        err,
        'name:',
        (err as { name?: string })?.name,
        'message:',
        (err as Error)?.message
      )
    }
  }

  function closePreview(): void {
    console.debug('[useQuickLook] closePreview')
    previewVisible.value = false
    // previewData.value = null
  }

  async function togglePreview(file: FileEntry): Promise<void> {
    if (previewVisible.value) {
      closePreview()
    } else {
      await openPreview(file)
    }
  }

  async function updatePreview(index: number): Promise<void> {
    console.debug('[useQuickLook] updatePreview', index)
    if (!previewVisible.value) {
      return
    }
    if (index >= 0 && index < sortedFiles.value.length) {
      previewIndex.value = index
      const file = sortedFiles.value[index]
      await openPreview(file)
    }
  }

  return {
    previewVisible,
    previewData,
    openPreview,
    closePreview,
    updatePreview,
    togglePreview,
  }
}
