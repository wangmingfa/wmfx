import type { NativeIconName } from './icon-names'

export type NativeMenuItemType = 'item' | 'separator' | 'checkbox' | 'radio' | 'submenu'

export interface NativeMenuItemDescriptor {
  id: string
  type?: NativeMenuItemType
  label?: string
  icon?: NativeIconName
  shortcut?: string
  enabled?: boolean
  checked?: boolean
  /** 预留字段，Electron 原生菜单暂不支持自定义颜色 */
  danger?: boolean
  children?: NativeMenuItemDescriptor[]
}
