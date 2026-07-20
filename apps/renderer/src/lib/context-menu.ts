import type { MenuItem, PopoverAnchor } from '@browser/ipc-contract'
import { createApp, h } from 'vue'
import ContextMenuView from '../components/ContextMenu.vue'

export interface ContextMenuOptions {
  anchor: PopoverAnchor
  descriptor: { id: string; items: MenuItem[] }
  /**
   * 菜单项点击后的回调。返回 false 表示"保持菜单打开"（如需要继续交互），
   * 其它情况（返回 true / undefined / 不返回）将在回调结束后自动关闭菜单。
   */
  // biome-ignore lint/suspicious/noConfusingVoidType: void is correct here — callers intentionally return nothing
  onAction: (payload: { menu: MenuItem; context: { close: () => void } }) => boolean | void
  onDismiss?: () => void
  /**
   * 显示模式：
   * - 'overlay'：渲染全屏遮罩挡住整个页面，菜单浮于遮罩之上，点击遮罩即关闭（用于不希望用户操作后台元素的场景）
   * - 'normal'（默认）：无遮罩，仅监听点击外部 / Esc / 滚动关闭（适用于无 WebContentsView 遮挡的页面）
   */
  mode?: 'overlay' | 'normal'
  /** 构造即打开（默认 true） */
  autoOpen?: boolean
}

/**
 * 渲染进程内的右键/下拉菜单，API 与 DropdownMenu 保持一致，
 * 但菜单直接以固定定位渲染在当前页面（Teleport 到 body），
 * 不经过 Popover/IPC，避免在不存在 WebContentsView 遮挡的页面产生跨进程开销。
 * 菜单内容复用 PopoverMenu.vue，样式与 DropdownMenu 完全一致。
 * 通过 mode 控制是否叠加全屏遮罩。
 */
export class ContextMenu {
  private app: ReturnType<typeof createApp> | null = null
  private mountEl: HTMLElement | null = null
  private descriptor: { id: string; items: MenuItem[] }
  private onAction: ContextMenuOptions['onAction']
  private onDismiss?: () => void
  private mode: 'overlay' | 'normal'

  constructor(opts: ContextMenuOptions) {
    console.debug('[ContextMenu] constructor: id mode', opts.descriptor.id, opts.mode)
    this.descriptor = opts.descriptor
    this.onAction = opts.onAction
    this.onDismiss = opts.onDismiss
    this.mode = opts.mode ?? 'normal'
    if (opts.autoOpen !== false) this.open(opts.anchor)
  }

  private resolvePoint(anchor: PopoverAnchor): { x: number; y: number } {
    switch (anchor.type) {
      case 'point':
        return { x: anchor.x, y: anchor.y }
      case 'rect': {
        // 取锚点边缘作为菜单弹出原点（与 DropdownMenu overlay 行为一致）
        const rect = anchor.rect
        const placement = anchor.placement ?? 'bottom-start'
        let x = rect.x
        let y = rect.y
        if (placement.includes('end')) x = rect.x + rect.width
        if (placement.includes('bottom')) y = rect.y + rect.height
        return { x, y }
      }
      // cursor 无显式坐标，回退到视口左上方（实际右键等场景均使用 point）
      default:
        return { x: 0, y: 0 }
    }
  }

  private open(anchor: PopoverAnchor): void {
    const { x, y } = this.resolvePoint(anchor)
    const popoverId = this.descriptor.id
    const items = this.descriptor.items

    let closed = false
    const close = () => {
      if (closed) return
      closed = true
      this.dispose()
      this.onDismiss?.()
    }

    const onSelect = (id: string) => {
      const menu = this.findMenuItem(items, id)
      if (menu) {
        console.debug('[ContextMenu] select: id', menu.id)
        const result = this.onAction({ menu, context: { close } })
        // 返回 false 表示保持打开；其它情况自动关闭
        if (result !== false) close()
      } else {
        console.warn('[ContextMenu] select: unknown menu id', id)
      }
    }

    this.mountEl = document.createElement('div')
    document.body.appendChild(this.mountEl)
    this.app = createApp({
      render: () =>
        h(ContextMenuView, {
          popoverId,
          items,
          x,
          y,
          onSelect,
          onDismiss: close,
          overlay: this.mode === 'overlay',
        }),
    })
    this.app.mount(this.mountEl)
  }

  close(): void {
    this.dispose()
    this.onDismiss?.()
  }

  private dispose(): void {
    if (this.app) {
      this.app.unmount()
      this.app = null
    }
    if (this.mountEl) {
      this.mountEl.remove()
      this.mountEl = null
    }
  }

  get id(): string {
    return this.descriptor.id
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
