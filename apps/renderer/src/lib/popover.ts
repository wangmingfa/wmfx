import type {
  MenuItem,
  PopoverActionPayload,
  PopoverAnchor,
  PopoverDescriptor,
} from '@browser/ipc-contract'

const actionMap = new Map<string, (menu: MenuItem) => void>()

window.browserAPI.onPopoverAction(({ popoverId, menu }) => {
  actionMap.get(popoverId)?.(menu)
})

window.browserAPI.onPopoverDismiss((popoverId) => {
  actionMap.delete(popoverId)
})

export interface PopoverOptions {
  anchor: PopoverAnchor
  descriptor: PopoverDescriptor
  onAction: (p: PopoverActionPayload) => void
  autoOpen?: boolean
}

/**
 * 稳定调用接口：封装 preload 的 browserAPI.popover* 调用。
 * 后期更换底层实现（如不再用独立 WebContentsView）时，调用处代码无需改动。
 */
export class Popover {
  private popoverId = crypto.randomUUID()
  private opened = false

  constructor(private opts: PopoverOptions) {
    if (opts.autoOpen !== false) this.open()
  }

  open(): void {
    if (this.opened) return
    actionMap.set(this.popoverId, (menu) =>
      this.opts.onAction({ menu, context: { close: () => this.close() } })
    )
    window.browserAPI.popoverOpen(this.popoverId, this.opts.anchor, this.opts.descriptor)
    this.opened = true
  }

  close(): void {
    if (!this.opened) return
    actionMap.delete(this.popoverId)
    window.browserAPI.popoverClose(this.popoverId)
    this.opened = false
  }
}
