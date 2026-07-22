import type { FileEntry, PreviewData } from '@browser/ipc-contract'
import { type ComputedRef, ref } from 'vue'

import { useToast } from '@/composables/useToast'

/** useQuickLook 依赖的外部状态（由 FilesView 注入） */
interface QuickLookDeps {
  sortedFiles: ComputedRef<FileEntry[]>
}

/**
 * Quick Look 预览状态：打开/关闭/上一条/下一条。
 * 仅预览文件（跳过文件夹），索引基于当前排序后的列表。
 */
export function useQuickLook(deps: QuickLookDeps) {
  const toast = useToast()
  const { sortedFiles } = deps

  // Quick Look 预览
  const previewVisible = ref(false)
  const previewData = ref<PreviewData | null>(null)
  const previewIndex = ref(-1)

  async function openPreview(file: FileEntry): Promise<void> {
    console.debug('[useQuickLook] openPreview:', file.name)
    if (file.isDir) {
      return
    }
    try {
      previewData.value = await window.browserAPI.readFilePreview(file.path)
      previewIndex.value = sortedFiles.value.findIndex((f) => f.path === file.path)
      previewVisible.value = true
    } catch (err) {
      console.error('[useQuickLook] openPreview error:', err)
      toast.error((err as Error).message || '无法预览文件')
    }
  }

  function closePreview(): void {
    console.debug('[useQuickLook] closePreview')
    previewVisible.value = false
    previewData.value = null
  }

  async function previousPreview(): Promise<void> {
    console.debug('[useQuickLook] previousPreview')
    if (previewIndex.value > 0) {
      const file = sortedFiles.value[previewIndex.value - 1]
      if (file && !file.isDir) {
        previewIndex.value--
        await openPreview(file)
      }
    }
  }

  async function nextPreview(): Promise<void> {
    console.debug('[useQuickLook] nextPreview')
    if (previewIndex.value < sortedFiles.value.length - 1) {
      const file = sortedFiles.value[previewIndex.value + 1]
      if (file && !file.isDir) {
        previewIndex.value++
        await openPreview(file)
      }
    }
  }

  return {
    previewVisible,
    previewData,
    openPreview,
    closePreview,
    previousPreview,
    nextPreview,
  }
}
