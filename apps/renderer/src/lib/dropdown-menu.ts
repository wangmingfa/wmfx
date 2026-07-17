import type { MenuItem, PopoverAnchor, PopoverMode } from '@browser/ipc-contract'
import { Popover } from './popover'

export interface DropdownMenuOptions {
  anchor: PopoverAnchor
  descriptor: { id: string; items: MenuItem[] }
  onAction: (payload: { menu: MenuItem; context: { close: () => void } }) => void
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
            this.onAction({ menu, context: { close: () => this.close() } })
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
}
