/**
 * 标签拖拽重排的共享纯函数，供 TabBar（水平，按 index）与 VerticalTabBar（垂直，按 id）复用。
 * 仅负责数组变换，顺序落库由调用方在结果上调用 applyOrder()。
 */
export function reorderByIndex<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) {
    return list
  }
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** 按源/目标 id 在列表中定位后重排（VerticalTabBar 使用）。 */
export function reorderById<T extends { id: string }>(
  list: T[],
  srcId: string,
  targetId: string
): T[] {
  if (srcId === targetId) {
    return list
  }
  const srcIdx = list.findIndex((t) => t.id === srcId)
  const targetIdx = list.findIndex((t) => t.id === targetId)
  if (srcIdx < 0 || targetIdx < 0) {
    return list
  }
  return reorderByIndex(list, srcIdx, targetIdx)
}
