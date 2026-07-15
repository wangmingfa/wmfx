import type {
  PopoverAnchor,
  PopoverMode,
  PopoverOpenOptions,
  PopoverType,
} from '@browser/ipc-contract'

/** popoverId → onEvent callback，用于路由面板事件到对应的 Popover 实例 */
const eventMap = new Map<string, (eventName: string, eventData?: unknown) => void>()
/** popoverId → onDismiss callback，面板被外部关闭时通知 Popover 实例 */
const dismissCallbacks = new Map<string, () => void>()

window.browserAPI.onPopoverEvent((payload) => {
  eventMap.get(payload.popoverId)?.(payload.eventName, payload.eventData)
})

window.browserAPI.onPopoverDismiss((popoverId) => {
  eventMap.delete(popoverId)
  dismissCallbacks.get(popoverId)?.()
  dismissCallbacks.delete(popoverId)
})

/** 剥离 Vue 响应式 Proxy，返回可结构化克隆的纯对象 */
function toPlain<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value))
}

export interface PopoverOptions {
  type: PopoverType
  anchor: PopoverAnchor
  data?: unknown
  mode?: PopoverMode
  size?: { width?: number; height?: number }
  onEvent?: (eventName: string, eventData?: unknown) => void
  onDismiss?: () => void
  autoOpen?: boolean
}

/**
 * 通用 Popover 底层：封装 browserAPI.popover* 调用。
 * 通过 type 区分面板类型（menu/addressbar），data 传递序列化数据。
 * 更换底层实现（如不再用 WebContentsView）时，调用处代码无需改动。
 */
export class Popover {
  private popoverId = crypto.randomUUID()
  private opened = false

  constructor(private opts: PopoverOptions) {
    if (opts.onDismiss) {
      dismissCallbacks.set(this.popoverId, opts.onDismiss)
    }
    if (opts.autoOpen !== false) this.open()
  }

  open(): void {
    if (this.opened) return
    if (this.opts.onEvent) {
      eventMap.set(this.popoverId, this.opts.onEvent)
    }
    const options: PopoverOpenOptions = {
      type: this.opts.type,
      anchor: this.opts.anchor,
      data: toPlain(this.opts.data),
      mode: this.opts.mode,
      size: this.opts.size,
    }
    void window.browserAPI.popoverOpen(this.popoverId, options)
    this.opened = true
  }

  close(): void {
    if (!this.opened) return
    eventMap.delete(this.popoverId)
    dismissCallbacks.delete(this.popoverId)
    void window.browserAPI.popoverClose(this.popoverId)
    this.opened = false
  }

  /** 主 renderer → popover WebContentsView 双向数据同步 */
  sendData(data: unknown): void {
    if (!this.opened) return
    void window.browserAPI.popoverSendData(this.popoverId, toPlain(data))
  }

  get id(): string {
    return this.popoverId
  }
}
