/** 拖拽上下文：跨渲染进程/窗口传递 dragId（HTML5 DnD 无法跨窗口直传） */
let currentDragId: string | null = null

export function setDragBookmark(id: string): void {
  currentDragId = id
  console.debug('[DragState] set: id', id)
}

export function getDragBookmark(): string | null {
  return currentDragId
}

export function clearDragBookmark(): void {
  if (currentDragId !== null) console.debug('[DragState] clear: id', currentDragId)
  currentDragId = null
}
