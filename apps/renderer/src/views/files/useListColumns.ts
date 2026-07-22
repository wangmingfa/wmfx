import type { FileEntry } from '@browser/ipc-contract'
import { computed, ref } from 'vue'

import { useI18n } from '@/composables/useI18n'
import { formatDateTime } from '@/utils/datetime'

import { useFileDisplay } from './useFileDisplay'

/** 列表视图列定义（顺序 = 显示顺序；width=null 表示弹性填充 1fr） */
export interface ListViewColumn {
  key: 'name' | 'kind' | 'size' | 'date'
  width: number | null
  resizable: boolean
  reorderable: boolean
}

/**
 * 列表视图列管理：列顺序/宽度状态、列宽拖拽调整、列顺序拖拽重排、本地持久化。
 * 表头（FilesListHeader）与行（FileList）共用同一份列状态，由 FilesView 创建后分发。
 */
export function useListColumns() {
  const { t } = useI18n()
  const { getFileKind, formatSize } = useFileDisplay()

  const listColumns = ref<ListViewColumn[]>([
    { key: 'name', width: null, resizable: true, reorderable: true },
    { key: 'kind', width: 90, resizable: true, reorderable: true },
    { key: 'size', width: 90, resizable: true, reorderable: true },
    { key: 'date', width: 170, resizable: true, reorderable: true },
  ])
  const listColumnLabels: Record<ListViewColumn['key'], string> = {
    name: t('files.nameCol'),
    kind: t('files.kindCol'),
    size: t('files.sizeCol'),
    date: t('files.dateCol'),
  }
  // 列顺序 + 宽度 -> grid-template-columns（首列为固定图标列 24px）
  const listGridTemplate = computed(() => {
    const cols = listColumns.value.map((c) => (c.width == null ? '1fr' : `${c.width}px`))
    return `24px ${cols.join(' ')}`
  })

  // 列宽拖拽调整
  let resizing: { key: ListViewColumn['key']; startX: number; startW: number } | null = null
  function onColumnResizeStart(key: ListViewColumn['key'], event: MouseEvent): void {
    console.debug('[useListColumns] onColumnResizeStart:', key)
    event.preventDefault()
    event.stopPropagation()
    const col = listColumns.value.find((c) => c.key === key)
    if (!col?.resizable) {
      return
    }
    resizing = { key, startX: event.clientX, startW: col.width ?? 120 }
    window.addEventListener('mousemove', onColumnResizing)
    window.addEventListener('mouseup', onColumnResizeEnd)
  }
  function onColumnResizing(event: MouseEvent): void {
    if (!resizing) {
      return
    }
    const dx = event.clientX - resizing.startX
    const next = Math.max(60, resizing.startW + dx)
    const col = listColumns.value.find((c) => c.key === resizing!.key)
    if (col) {
      col.width = Math.round(next)
    }
  }
  function onColumnResizeEnd(): void {
    resizing = null
    window.removeEventListener('mousemove', onColumnResizing)
    window.removeEventListener('mouseup', onColumnResizeEnd)
    saveListColumns()
  }

  // 列顺序拖拽重排
  let dragColumnKey: ListViewColumn['key'] | null = null
  function onColumnDragStart(key: ListViewColumn['key'], event: DragEvent): void {
    const col = listColumns.value.find((c) => c.key === key)
    if (!col?.reorderable) {
      event.preventDefault()
      return
    }
    dragColumnKey = key
  }
  function onColumnDrop(targetKey: ListViewColumn['key']): void {
    console.debug('[useListColumns] onColumnDrop: from', dragColumnKey, 'to', targetKey)
    if (!dragColumnKey || dragColumnKey === targetKey) {
      return
    }
    const from = listColumns.value.findIndex((c) => c.key === dragColumnKey)
    const to = listColumns.value.findIndex((c) => c.key === targetKey)
    if (from < 0 || to < 0) {
      return
    }
    const arr = listColumns.value
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    dragColumnKey = null
    saveListColumns()
  }

  // 持久化列顺序/宽度
  async function saveListColumns(): Promise<void> {
    try {
      await window.browserAPI.setSetting({
        key: 'files.listColumns',
        value: JSON.stringify(listColumns.value),
      })
    } catch (err) {
      console.warn('[useListColumns] saveListColumns failed:', err)
    }
  }
  async function loadListColumns(): Promise<void> {
    try {
      const saved = (await window.browserAPI.getSetting('files.listColumns')) as string | null
      if (!saved) {
        return
      }
      const parsed = JSON.parse(saved) as ListViewColumn[]
      // 仅保留已知列，避免脏数据
      const known: ListViewColumn['key'][] = ['name', 'kind', 'size', 'date']
      const ordered = known
        .map((k) => parsed.find((c) => c.key === k))
        .filter(Boolean) as ListViewColumn[]
      const extra = parsed.filter((c) => !known.includes(c.key))
      if (ordered.length > 0) {
        listColumns.value = [...ordered, ...extra]
      }
    } catch (err) {
      console.warn('[useListColumns] loadListColumns failed:', err)
    }
  }

  // 根据列 key 渲染对应单元格内容
  function renderCellContent(file: FileEntry, key: ListViewColumn['key']): string {
    switch (key) {
      case 'name':
        return file.name
      case 'kind':
        return getFileKind(file)
      case 'size':
        return formatSize(file.size)
      case 'date':
        return formatDateTime(file.modifiedAt)
    }
  }

  return {
    listColumns,
    listColumnLabels,
    listGridTemplate,
    onColumnResizeStart,
    onColumnDragStart,
    onColumnDrop,
    loadListColumns,
    renderCellContent,
  }
}
