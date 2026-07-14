import type { PopoverAnchor, PopoverDescriptor } from '@browser/ipc-contract'
import type { BrowserWindow } from 'electron'
import { WebContentsView } from 'electron'
import { loadInternalView } from './internal-url'
import { getPreloadPath } from './paths'
import { findMenuItem } from './popover-utils'

interface OverlayState {
  anchor: PopoverAnchor
  descriptor: PopoverDescriptor
}

/**
 * 管理唯一一个透明、铺满窗口、置顶的 popoverView。
 * 多 popover 通过 popoverId 隔离入栈，面板渲染栈顶；主进程只负责定位与按 id 路由。
 */
export class PopoverManager {
  private popoverView: WebContentsView
  private overlays = new Map<string, OverlayState>()
  private stack: string[] = []

  constructor(private win: BrowserWindow) {
    // WebContentsView 的 webContents 默认背景为白色（#FFF），必须显式设为全透明，
    // 否则铺满窗口的面板会盖住下方标签页内容。渲染进程面板根节点已把 html/body 设为透明。
    this.popoverView = new WebContentsView({
      webPreferences: {
        preload: getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    this.popoverView.setBackgroundColor('rgba(0,0,0,0)')
    this.popoverView.setVisible(false)
    this.win.contentView.addChildView(this.popoverView)
    loadInternalView(this.popoverView, 'panel')
    // 窗口尺寸变化时重发 popover:render，让面板按最新 innerWidth 重新定位，避免布局漂移
    this.win.on('resize', () => this.renderTop())
  }

  /** 打开（或重新定位）一个 popover：入栈后渲染栈顶，多 popover 互不覆盖只切换。 */
  open(popoverId: string, anchor: PopoverAnchor, descriptor: PopoverDescriptor): void {
    this.overlays.set(popoverId, { anchor, descriptor })
    if (!this.stack.includes(popoverId)) this.stack.push(popoverId)
    this.renderTop()
  }

  /** 把栈顶 popover 铺满窗口并推到最前，再通知面板渲染对应数据。 */
  private renderTop(): void {
    const id = this.stack[this.stack.length - 1]
    const ov = this.overlays.get(id)
    if (!ov) return
    // 1. 铺满窗口并置于最前，保证 popover 盖住所有 tab 视图
    const { width, height } = this.win.getContentBounds()
    this.popoverView.setBounds({ x: 0, y: 0, width, height })
    this.popoverView.setVisible(true)
    // WebContentsView 没有 setTopBrowserView（该 API 仅适用于已弃用的 BrowserView）；
    // 通过移除后重新 addChildView 把它放到 contentView 子视图栈顶，确保盖住所有 tab 视图。
    this.win.contentView.removeChildView(this.popoverView)
    this.win.contentView.addChildView(this.popoverView)
    // 2. 把栈顶 id / 描述 / 锚点推给面板渲染器，由渲染进程按 id 决定展示内容
    this.popoverView.webContents.send('popover:render', id, ov.descriptor, ov.anchor)
    // 3. 鼠标打开后焦点仍在基础渲染进程，聚焦面板 webContents 让 Esc/方向键监听器生效
    this.popoverView.webContents.focus()
  }

  /** 面板点击叶子项：解析 MenuItem 回传基础渲染进程，再关闭该 popover。 */
  select(popoverId: string, itemId: string): void {
    const ov = this.overlays.get(popoverId)
    const menu = ov ? findMenuItem(ov.descriptor.items, itemId) : null
    if (menu) {
      this.win.webContents.send('popover:action', { popoverId, menu })
    }
    this.close(popoverId)
  }

  /** 关闭指定 popover：出栈后若仍有未关闭项则渲染新的栈顶，否则隐藏整个 popoverView。 */
  close(popoverId: string): void {
    this.overlays.delete(popoverId)
    this.stack = this.stack.filter((id) => id !== popoverId)
    // 通知面板清掉该 popover 的渲染状态（descriptor 置空），否则菜单 DOM 会残留在已隐藏的
    // 面板 webContents 中，导致下次查询仍可命中旧文案。
    this.popoverView.webContents.send('popover:dismiss', popoverId)
    // 同时通知基础渲染进程清理 actionMap 中该 popover 的闭包，避免外部关闭（背景/Esc）泄漏
    this.win.webContents.send('popover:dismiss', popoverId)
    if (this.stack.length > 0) {
      this.renderTop()
    } else {
      this.popoverView.setVisible(false)
    }
  }
}
