import type { MenuItem } from '@browser/ipc-contract'

/** 按 path（子菜单 id 链）下钻到对应层级的可选项列表。 */
export function getLevelItems(items: MenuItem[], path: string[]): MenuItem[] {
  let level = items.filter((i) => i.type !== 'separator')
  for (const id of path) {
    const sub = level.find((i) => i.id === id)
    if (sub?.children) level = sub.children.filter((i) => i.type !== 'separator')
    else break
  }
  return level
}

/** 过滤出可导航项（非 separator 且未禁用）。 */
export function getSelectable(items: MenuItem[]): MenuItem[] {
  return items.filter((i) => i.type !== 'separator' && !i.disabled)
}

/** 在可选中项中按 id 定位下标；找不到返回 -1。 */
export function selectableIndexOf(items: MenuItem[], id: string): number {
  return getSelectable(items).findIndex((i) => i.id === id)
}

/** 返回某 id 在菜单树中的祖先链（含自身父链，不含自身）；找不到返回 null。 */
export function pathToItem(
  items: MenuItem[],
  targetId: string,
  trail: string[] = []
): string[] | null {
  for (const it of items) {
    if (it.id === targetId) return trail
    if (it.children) {
      const r = pathToItem(it.children, targetId, [...trail, it.id])
      if (r) return r
    }
  }
  return null
}

/** 在全树中按 id 查找 MenuItem（含自身）；找不到返回 null。 */
export function findItem(items: MenuItem[], targetId: string): MenuItem | null {
  for (const it of items) {
    if (it.id === targetId) return it
    if (it.children) {
      const r = findItem(it.children, targetId)
      if (r) return r
    }
  }
  return null
}
