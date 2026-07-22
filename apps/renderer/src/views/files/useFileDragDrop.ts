import type { FileEntry } from '@browser/ipc-contract'
import { type Ref, ref } from 'vue'

import { useToast } from '@/composables/useToast'

/** useFileDragDrop 依赖的外部状态（由 FilesView 注入） */
interface FileDragDropDeps {
  selectedPaths: Ref<string[]>
  currentPath: Ref<string>
}

/**
 * 文件拖拽交互：拖出（携带选中批）、列表区域拖入高亮、拖入 URL 创建下载。
 * 「拖已选中行 = 拖整批」（Windows 式）；未选中项仅拖单项。
 */
export function useFileDragDrop(deps: FileDragDropDeps) {
  const toast = useToast()
  const { selectedPaths, currentPath } = deps

  // 拖拽状态
  const dragOverTarget = ref<string | null>(null)
  const dragOverFilesList = ref(false)
  const dragFiles = ref<string[]>([])

  function handleDragStart(event: DragEvent, file: FileEntry): void {
    console.debug('[useFileDragDrop] handleDragStart:', file.name)
    if (!event.dataTransfer) {
      return
    }
    // 拖已选中批中的某项 → 携带整批；否则仅单项（Windows 式"拖已选中行=拖整批"）
    const paths =
      selectedPaths.value.includes(file.path) && selectedPaths.value.length > 1
        ? [...selectedPaths.value]
        : [file.path]
    dragFiles.value = paths
    event.dataTransfer.setData('application/x-wmfx-files', JSON.stringify(paths))
    event.dataTransfer.setData('text/plain', paths.join('\n'))
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.dropEffect = 'copy'
  }

  function handleDragEnd(): void {
    console.debug('[useFileDragDrop] handleDragEnd')
    dragFiles.value = []
    dragOverTarget.value = null
  }

  function handleDragOverList(event: DragEvent): void {
    console.debug('[useFileDragDrop] handleDragOverList')
    event.preventDefault()
    dragOverFilesList.value = true
  }

  function handleDragLeaveList(): void {
    console.debug('[useFileDragDrop] handleDragLeaveList')
    dragOverFilesList.value = false
  }

  async function handleDropOnList(event: DragEvent): Promise<void> {
    console.debug('[useFileDragDrop] handleDropOnList')
    event.preventDefault()
    dragOverFilesList.value = false
    const data = event.dataTransfer?.getData('text/uri-list')
    if (!data) {
      return
    }
    const urls = data.split('\n').filter(Boolean)
    console.debug('[useFileDragDrop] handleDropOnList: urls', urls)
    // TODO: 下载这些 URL 到当前目录
    for (const url of urls) {
      try {
        // 创建下载
        await window.browserAPI.createDownload({
          url,
          path: currentPath.value,
        })
      } catch (err) {
        console.error('[useFileDragDrop] handleDropOnList download error:', err)
        toast.error((err as Error).message || '下载失败')
      }
    }
  }

  return {
    dragOverFilesList,
    dragFiles,
    handleDragStart,
    handleDragEnd,
    handleDragOverList,
    handleDragLeaveList,
    handleDropOnList,
  }
}
