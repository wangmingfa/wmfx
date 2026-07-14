import type { MenuItem } from '@browser/ipc-contract'

/** 递归在菜单树中按 id 查找 MenuItem（含子菜单）；分隔符不计入，找不到返回 null。 */
export function findMenuItem(items: MenuItem[], id: string): MenuItem | null {
  for (const it of items) {
    if (it.type === 'separator') continue
    if (it.id === id) return it
    if (it.children) {
      const found = findMenuItem(it.children, id)
      if (found) return found
    }
  }
  return null
}
