import type { FileBookmark, SystemDir } from '@browser/ipc-contract'
import { type Ref, ref } from 'vue'

import { useToast } from '@/composables/useToast'

export interface FileMetadataResult {
  systemDirs: Ref<SystemDir[]>
  fileBookmarks: Ref<FileBookmark[]>
  loadMetadata: () => Promise<void>
}

/**
 * 文件管理器元数据：系统目录与书签列表。
 * 侧栏展示与书签增删改后通过 loadMetadata 重新拉取。
 * loadMetadata 由 useFileStore.setup() 调用，不再自动执行。
 */
export function useFileMetadata(): FileMetadataResult {
  const toast = useToast()

  const systemDirs = ref<SystemDir[]>([])
  const fileBookmarks = ref<FileBookmark[]>([])

  // 加载系统目录和书签
  async function loadMetadata(): Promise<void> {
    console.debug('[useFileMetadata] loadMetadata')
    try {
      const [dirs, bookmarks] = await Promise.all([
        window.browserAPI.getSystemDirs(),
        window.browserAPI.getFileBookmarks(),
      ])
      systemDirs.value = dirs
      fileBookmarks.value = bookmarks
    } catch (err) {
      console.error('[useFileMetadata] loadMetadata error:', err)
      toast.error((err as Error).message || '加载系统目录失败')
    }
  }

  return { systemDirs, fileBookmarks, loadMetadata }
}
