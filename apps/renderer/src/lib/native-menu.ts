import type { NativeMenuItemDescriptor } from '@browser/ipc-contract'

/** menuId → onEvent callback，用于路由面板事件到对应的 NativeMenu 实例 */
const eventMap = new Map<string, (eventName: string, eventData?: unknown) => void>()
/** menuId → onClose callback，菜单被外部关闭时通知 NativeMenu 实例 */
const closeCallbacks = new Map<string, () => void>()

// 模块加载时注册一次全局 IPC 监听
window.browserAPI.onNativeMenuAction((payload) => {
  console.debug('[NativeMenu] onNativeMenuAction: menuId itemId', payload.menuId, payload.itemId)
  eventMap.get(payload.menuId)?.('select', payload.itemId)
})

window.browserAPI.onNativeMenuClosed((menuId) => {
  console.debug('[NativeMenu] onNativeMenuClosed: menuId', menuId)
  eventMap.delete(menuId)
  closeCallbacks.get(menuId)?.()
  closeCallbacks.delete(menuId)
})

/**
 * Electron 原生菜单的渲染器侧封装。
 * 通过 IPC 将菜单描述符发送到主进程，主进程构建 Menu 并 popup。
 * 点击/关闭事件通过 menuId 路由回对应实例。
 *
 * 使用方式：
 * - TabBar：鼠标位置弹出 `new NativeMenu({ items }).open(event)`
 * - AppMenuButton：rect 对齐 `new NativeMenu({ items, rect: el.getBoundingClientRect() }).open(event)`
 * - 无 rect → 用 event.clientX/Y（鼠标位置）
 * - 有 rect → 用 rect 右下角
 * - 二级菜单方向由操作系统自动控制，靠近屏幕边缘时自动翻转
 */
export interface NativeMenuOptions {
  items: NativeMenuItemDescriptor[]
  onEvent?: (eventName: string, eventData?: unknown) => void
  onClose?: () => void
  autoOpen?: boolean
  /** 触发元素的 rect（viewport 坐标），用于计算菜单弹出位置 */
  rect?: DOMRect
}

/**
 * Electron 原生菜单的渲染器侧封装。
 * 通过 IPC 将菜单描述符发送到主进程，主进程构建 Menu 并 popup。
 * 点击/关闭事件通过 menuId 路由回对应实例。
 */
export class NativeMenu {
  private menuId = crypto.randomUUID()
  private opened = false

  constructor(private opts: NativeMenuOptions) {
    if (opts.onClose) {
      closeCallbacks.set(this.menuId, opts.onClose)
    }
    if (opts.autoOpen !== false) this.open()
  }

  open(e?: MouseEvent): Promise<void> {
    if (this.opened) return Promise.resolve()
    console.debug('[NativeMenu] open: menuId itemCount', this.menuId, this.opts.items.length)

    if (this.opts.onEvent) {
      eventMap.set(this.menuId, this.opts.onEvent)
    }

    let position: { x: number; y: number } | undefined
    if (this.opts.rect) {
      const r = this.opts.rect
      position = {
        x: Math.round(r.right),
        y: Math.round(r.bottom),
      }
    } else if (e) {
      position = { x: e.clientX, y: e.clientY }
    }

    this.opened = true
    return window.browserAPI.nativeMenuOpen(this.menuId, this.opts.items, position)
  }

  close(): void {
    if (!this.opened) return
    console.debug('[NativeMenu] close: menuId', this.menuId)
    eventMap.delete(this.menuId)
    closeCallbacks.delete(this.menuId)
    void window.browserAPI.nativeMenuClose(this.menuId)
    this.opened = false
  }

  get id(): string {
    return this.menuId
  }
}
