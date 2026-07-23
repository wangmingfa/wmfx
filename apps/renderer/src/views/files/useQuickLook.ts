import type { FileEntry, PreviewData } from '@browser/ipc-contract'
import { type ComputedRef, type Ref, ref } from 'vue'

import { useToast } from '@/composables/useToast'

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
  const toast = useToast()
  const { sortedFiles } = deps

  // Quick Look 预览
  const previewVisible = ref(false)
  const previewData = ref<PreviewData | null>(null)
  const previewIndex = ref(-1)

  async function openPreview(file: FileEntry): Promise<void> {
    console.debug('[useQuickLook] openPreview:', file.name)
    try {
      previewData.value = await window.browserAPI.readFilePreview(file.path)
      previewIndex.value = sortedFiles.value.findIndex((f) => f.path === file.path)
      previewVisible.value = true
    } catch (err) {
      console.error(
        '[useQuickLook] openPreview error:',
        err,
        'name:',
        (err as { name?: string })?.name,
        'message:',
        (err as Error)?.message
      )
      toast.error(getFriendlyPreviewError(err))
    }
  }

  // 将任意错误转为字符串
  function errToString(err: unknown): string {
    if (err == null) return ''
    if (typeof err === 'string') return err
    if (typeof err === 'object' && 'message' in err) return String((err as Error).message)
    return String(err)
  }

  // 根据错误类型返回用户友好的提示文案
  function getFriendlyPreviewError(err: unknown): string {
    const message = errToString(err)

    // 主进程 FileBrowserError：message 本身就包含面向用户的友好文案，直接展示
    if (
      message.includes('不允许访问') ||
      message.includes('无权限') ||
      message.includes('磁盘空间')
    ) {
      // 去掉 IPC 包装前缀和错误类型前缀，只保留面向用户的文案
      return message
        .replace(/^Error invoking remote method '.*?': /, '')
        .replace(/^FileBrowserError: /, '')
    }

    // 超时错误
    if (message.includes('timeout') || message.includes('Timeout')) {
      return '预览超时，文件可能过大'
    }

    return '无法预览此文件'
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
