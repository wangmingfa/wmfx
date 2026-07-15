import type {
  PopoverAnchor,
  PopoverMode,
  PopoverOpenOptions,
  PopoverType,
  ThemeMode,
} from '@browser/ipc-contract'
import type { BrowserWindow } from 'electron'
import { screen, WebContentsView } from 'electron'
import { loadInternalView } from './internal-url'
import { getPreloadPath } from './paths'
import { computePopoverBounds } from './popover-position'

interface OverlayState {
  anchor: PopoverAnchor
  type: PopoverType
  data?: unknown
  mode: PopoverMode
  size?: { width?: number; height?: number }
  /** 主进程侧动作回调（如网页右键菜单），渲染进程选中菜单项时触发；函数不可经 IPC 序列化，仅主进程内部调用可用 */
  onSelect?: (eventData: unknown) => void
}

/**
 * 管理唯一一个透明、铺满窗口、置顶的 popoverView。
 * 多 popover 通过 popoverId 隔离入栈，面板渲染栈顶；主进程只负责定位与按 id 路由。
 */
/** blur 关闭保护窗口：新菜单打开后此时间内的失焦视为触发点击本身导致，不关闭菜单 */
const POPOVER_BLUR_GUARD_MS = 150

export class PopoverManager {
  private popoverView: WebContentsView
  private overlays = new Map<string, OverlayState>()
  private stack: string[] = []
  /** 已按测量尺寸显示过的 bounded popover，避免 resize 时重复聚焦 */
  private rendered = new Set<string>()
  /** 最近一次 open 的时间戳，用于在 blur 处理里过滤“打开菜单的那次点击”自身引发的失焦 */
  private lastOpenAt = 0

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
    // bounded 模式：popover 视图失焦（用户点击应用其它区域）即关闭栈顶
    this.popoverView.webContents.on('blur', () => {
      // 忽略“打开菜单的那次点击”自身引发的失焦：例如三点菜单已打开时右键标签页，
      // 会先让本视图失焦、再异步收到新菜单的 open。若此时立即关闭会把刚打开的右键菜单一起关掉，
      // 表现为“第一次右键没反应”。用时间窗口过滤掉这类紧邻 open 的 blur。
      if (Date.now() - this.lastOpenAt < POPOVER_BLUR_GUARD_MS) return
      const top = this.stack[this.stack.length - 1]
      if (top && this.overlays.get(top)?.mode === 'bounded') {
        this.close(top)
      }
    })
    // 窗口尺寸变化时重发 popover:render，让面板按最新 innerWidth 重新定位，避免布局漂移
    this.win.on('resize', () => this.renderTop())
  }

  /** 打开（或重新定位）一个 popover：入栈后渲染栈顶，多 popover 互不覆盖只切换。 */
  open(
    popoverId: string,
    options: PopoverOpenOptions & { onSelect?: (eventData: unknown) => void }
  ): void {
    this.lastOpenAt = Date.now()
    const mode = options.mode ?? 'overlay'
    // bounded 菜单互斥：打开新的下拉/右键菜单前，关闭其它已存在的 bounded 菜单。
    // 否则它们会在栈里堆叠，导致关闭新菜单后旧菜单（如三点菜单）重新出现。
    if (mode === 'bounded') {
      for (const id of [...this.stack]) {
        if (id !== popoverId && this.overlays.get(id)?.mode === 'bounded') this.close(id)
      }
    }
    this.overlays.set(popoverId, {
      anchor: options.anchor,
      type: options.type,
      data: options.data,
      mode,
      size: options.size,
      onSelect: options.onSelect,
    })
    if (!this.stack.includes(popoverId)) this.stack.push(popoverId)
    if (mode === 'bounded') {
      // 首帧移到屏幕外但保持可见，仅用于渲染测量（避免 setVisible(false) 导致测量为 0）
      this.popoverView.setVisible(true)
      this.popoverView.setBounds({ x: -10000, y: -10000, width: 1, height: 1 })
    }
    this.renderTop()
  }

  /** 把栈顶 popover 推到最前，再通知面板渲染对应数据。overlay 铺满窗口并聚焦；bounded 先渲染待测量。 */
  private renderTop(): void {
    const id = this.stack[this.stack.length - 1]
    const ov = this.overlays.get(id)
    if (!ov) return
    // WebContentsView 没有 setTopBrowserView（该 API 仅适用于已弃用的 BrowserView）；
    // 通过移除后重新 addChildView 把它放到 contentView 子视图栈顶，确保盖住所有 tab 视图。
    this.win.contentView.removeChildView(this.popoverView)
    this.win.contentView.addChildView(this.popoverView)

    if (ov.mode === 'bounded') {
      // 先发渲染让面板测量内容；定位与显示等 popover:measure 回执
      this.popoverView.webContents.send(
        'popover:render',
        id,
        ov.type,
        ov.anchor,
        ov.data,
        'bounded'
      )
      return
    }

    // overlay：铺满窗口并置于最前
    const { width, height } = this.win.getContentBounds()
    this.popoverView.setBounds({ x: 0, y: 0, width, height })
    this.popoverView.setVisible(true)
    this.popoverView.webContents.send('popover:render', id, ov.type, ov.anchor, ov.data, 'overlay')
    this.popoverView.webContents.focus()
  }

  /** 面板测量完内容尺寸后回调：据此精确定位并显示 bounded popover（仅首次聚焦）。 */
  applyMeasure(popoverId: string, size: { width: number; height: number; gutter?: number }): void {
    const ov = this.overlays.get(popoverId)
    if (ov?.mode !== 'bounded') return
    // 若调用方给定了固定尺寸，优先使用（部分维度）；否则用面板测量值
    const w = ov.size?.width ?? size.width
    const h = ov.size?.height ?? size.height
    // gutter：面板在可视盒子四周预留的透明边距，用于容纳 box-shadow。
    // 视图需按 gutter 放大并整体外移，盒子本身仍精确落在锚点计算的位置，
    // 否则视图恰好等于盒子尺寸会把外投阴影裁成直角，露出圆角外的方角。
    const gutter = Math.max(0, size.gutter ?? 0)
    const win = this.win.getContentBounds()
    const winSize = { width: win.width, height: win.height }
    let cursor: { x: number; y: number } | undefined
    if (ov.anchor.type === 'cursor') {
      const sp = screen.getCursorScreenPoint()
      cursor = { x: sp.x - win.x, y: sp.y - win.y }
    }
    const pos = computePopoverBounds(ov.anchor, { width: w, height: h }, winSize, cursor)
    this.popoverView.setBounds({
      x: pos.x - gutter,
      y: pos.y - gutter,
      width: w + gutter * 2,
      height: h + gutter * 2,
    })
    if (!this.rendered.has(popoverId)) {
      this.rendered.add(popoverId)
      this.popoverView.setVisible(true)
      this.popoverView.webContents.focus()
    }
  }

  /** 主 renderer → popover WebContentsView 双向数据同步 */
  sendData(popoverId: string, data: unknown): void {
    if (this.stack.includes(popoverId)) {
      this.popoverView.webContents.send('popover:data', popoverId, data)
    }
  }

  /** 同步主题到 popover 面板（面板自身无 data-theme 广播，需主进程主动推送） */
  sendTheme(theme: ThemeMode): void {
    this.popoverView.webContents.send('theme:change', theme)
  }

  /** popover WebContentsView → 主 renderer 事件通知 */
  notifyEvent(popoverId: string, eventName: string, eventData?: unknown): void {
    if (eventName === 'select') {
      this.overlays.get(popoverId)?.onSelect?.(eventData)
    }
    this.win.webContents.send('popover:event', { popoverId, eventName, eventData })
  }

  /** 关闭指定 popover：出栈后若仍有未关闭项则渲染新的栈顶，否则隐藏整个 popoverView。 */
  close(popoverId: string): void {
    this.overlays.delete(popoverId)
    this.rendered.delete(popoverId)
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
