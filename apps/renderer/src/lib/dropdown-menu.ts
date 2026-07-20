import type { MenuItem, PopoverAnchor, PopoverMode } from '@browser/ipc-contract'
import { Popover } from './popover'

export interface DropdownMenuOptions {
  anchor: PopoverAnchor
  descriptor: { id: string; items: MenuItem[] }
  /**
   * 菜单项点击后的回调。返回 false 表示"保持菜单打开"（如需要继续交互），
   * 其它情况（返回 true / undefined / 不返回）将在回调结束后自动关闭菜单。
   */
  onAction: (payload: { menu: MenuItem; context: { close: () => void } }) => boolean | void
  onDismiss?: () => void
  mode?: PopoverMode
  autoOpen?: boolean
}

/**
 * 基于 Popover 封装的下拉菜单。
 * 对外保持与原 Popover 相同的 API（anchor + descriptor + onAction），
 * 内部将菜单事件路由为 onAction 回调。
 */
export class DropdownMenu {
  private popover: Popover
  private descriptor: { id: string; items: MenuItem[] }
  private onAction: DropdownMenuOptions['onAction']

  constructor(opts: DropdownMenuOptions) {
    console.debug('[DropdownMenu] constructor: id', opts.descriptor.id)
    const hasSubmenu = this.hasSubmenu(opts.descriptor.items)
    const resolvedMode = opts.mode ?? 'overlay'
    if (hasSubmenu && resolvedMode !== 'overlay') {
      throw new Error(
        `[DropdownMenu] ${opts.descriptor.id}: submenu items require mode='overlay', got '${resolvedMode}'`
      )
    }
    // TODO(后期优化): 子菜单只能用于 overlay 模式（bounded 模式下绝对定位子菜单会被 overflow 裁剪）。
    // 当前通过运行时遍历 items 检测，后续可改为调用方显式传 hasSubmenu: boolean 字段避免重复遍历。
    this.descriptor = opts.descriptor
    this.onAction = opts.onAction
    this.popover = new Popover({
      type: 'menu',
      anchor: opts.anchor,
      mode: opts.mode,
      data: opts.descriptor,
      onEvent: (eventName, eventData) => {
        if (eventName === 'select' && typeof eventData === 'string') {
          const menu = this.findMenuItem(this.descriptor.items, eventData)
          if (menu) {
            console.debug('[DropdownMenu] select: id', menu.id)
            const result = this.onAction({ menu, context: { close: () => this.close() } })
            // 返回 false 表示保持打开；其它情况自动关闭
            if (result !== false) this.close()
          } else {
            console.warn('[DropdownMenu] select: unknown menu id', eventData)
          }
        }
      },
      onDismiss: opts.onDismiss,
      autoOpen: opts.autoOpen,
    })
  }

  close(): void {
    this.popover.close()
  }

  /** 底层 Popover 的唯一 id，用于调用方按 id 区分 dismiss 事件归属 */
  get id(): string {
    return this.popover.id
  }

  private findMenuItem(items: MenuItem[], id: string): MenuItem | null {
    for (const it of items) {
      if (it.type === 'separator') continue
      if (it.id === id) return it
      if (it.children) {
        const found = this.findMenuItem(it.children, id)
        if (found) return found
      }
    }
    return null
  }

  private hasSubmenu(items: MenuItem[]): boolean {
    for (const it of items) {
      if (it.type === 'submenu') return true
      if (it.children && this.hasSubmenu(it.children)) return true
    }
    return false
  }
}
