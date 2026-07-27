import type {
  PopoverAnchor,
  PopoverMode,
  PopoverOpenOptions,
  PopoverType,
} from '@browser/ipc-contract'

/** Popover 面板事件，合并 eventName + eventData 为单个对象 */
export interface PopoverEvent {
  name: string
  data?: unknown
}

/** popoverId → onEvent callback，用于路由面板事件到对应的 Popover 实例 */
const eventMap = new Map<string, (event: PopoverEvent, context?: { close: () => void }) => void>()
/** popoverId → onDismiss callback，面板被外部关闭时通知 Popover 实例 */
const dismissCallbacks = new Map<string, () => void>()
/** popoverId → close 函数，供 onEvent context.close 使用 */
const closeRegistry = new Map<string, () => void>()

window.browserAPI.onPopoverEvent((payload) => {
  console.debug('[Popover] onPopoverEvent: popoverId event', payload.popoverId, payload.eventName)
  const handler = eventMap.get(payload.popoverId)
  if (handler) {
    const closeFn = closeRegistry.get(payload.popoverId)
    handler(
      { name: payload.eventName, data: payload.eventData },
      closeFn ? { close: closeFn } : undefined
    )
  }
})

window.browserAPI.onPopoverDismiss((popoverId) => {
  console.debug('[Popover] onPopoverDismiss: popoverId', popoverId)
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
  /** 常驻：失焦不自动关闭（如页内查找栏） */
  persistent?: boolean
  /** overlay 模式遮罩配置：未传则遮罩透明（仅拦截点击），传则按 color/blur 渲染半透明遮罩 */
  backdrop?: { color?: string; blur?: number }
  /** 点击遮罩是否关闭面板（默认 true）；设为 false 时点击遮罩不触发关闭 */
  closeOnBackdrop?: boolean
  /** 面板与触发按钮之间的间距（px） */
  gap?: number
  onEvent?: (event: PopoverEvent, context?: { close: () => void }) => void
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
    console.debug(
      '[Popover] constructor: id=%s type=%s autoOpen=%s mode=%s anchorType=%s',
      this.popoverId,
      this.opts.type,
      opts.autoOpen,
      opts.mode,
      opts.anchor?.type
    )
    if (opts.onDismiss) {
      dismissCallbacks.set(this.popoverId, opts.onDismiss)
    }
    if (opts.autoOpen !== false) {
      console.debug('[Popover] autoOpen trigger open')
      this.open()
    } else {
      console.debug('[Popover] autoOpen=false, not opening')
    }
  }

  open(): void {
    if (this.opened) {
      console.warn('[Popover] open: already opened id=%s', this.popoverId)
      return
    }
    console.debug('[Popover] open: id=%s type=%s', this.popoverId, this.opts.type)
    if (this.opts.onEvent) {
      eventMap.set(this.popoverId, this.opts.onEvent)
    }
    closeRegistry.set(this.popoverId, () => this.close())
    const options: PopoverOpenOptions = {
      type: this.opts.type,
      anchor: this.opts.anchor,
      data: toPlain(this.opts.data),
      mode: this.opts.mode,
      size: this.opts.size,
      persistent: this.opts.persistent,
      backdrop: this.opts.backdrop,
      closeOnBackdrop: this.opts.closeOnBackdrop,
      gap: this.opts.gap,
    }
    void window.browserAPI.popoverOpen(this.popoverId, options)
    console.debug('[Popover] browserAPI.popoverOpen called: id=%s', this.popoverId)
    this.opened = true
  }

  /**
   * 常驻 popover 重定位/换数据：切换 tab 时用新锚点与新数据重新渲染同一个 popover。
   * 主进程 open() 对已存在的 popoverId 会更新 overlay 并重新 renderTop（不重复入栈）。
   */
  reopen(anchor: PopoverAnchor, data?: unknown): void {
    this.opts.anchor = anchor
    this.opts.data = data
    if (this.opts.onEvent) eventMap.set(this.popoverId, this.opts.onEvent)
    void window.browserAPI.popoverOpen(this.popoverId, {
      type: this.opts.type,
      anchor,
      data: toPlain(data),
      mode: this.opts.mode,
      size: this.opts.size,
      persistent: this.opts.persistent,
      backdrop: this.opts.backdrop,
      closeOnBackdrop: this.opts.closeOnBackdrop,
      gap: this.opts.gap,
    })
    this.opened = true
  }

  close(): void {
    if (!this.opened) return
    console.debug('[Popover] close: id=%s', this.popoverId)
    // 先同步触发 onDismiss（避免先删回调、后等 IPC 返回导致回调丢失），
    // 再将 opened 置为 false，防止外部 dismiss IPC 回来时重复调用
    const onDismiss = dismissCallbacks.get(this.popoverId)
    dismissCallbacks.delete(this.popoverId)
    eventMap.delete(this.popoverId)
    closeRegistry.delete(this.popoverId)
    onDismiss?.()
    void window.browserAPI.popoverClose(this.popoverId)
    this.opened = false
  }

  /** 主 renderer → popover WebContentsView 双向数据同步 */
  sendData(data: unknown): void {
    if (!this.opened) return
    console.debug('[Popover] sendData: id', this.popoverId)
    void window.browserAPI.popoverSendData(this.popoverId, toPlain(data))
  }

  get id(): string {
    return this.popoverId
  }
}
