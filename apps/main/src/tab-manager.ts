import type {
  CreateTabOptions,
  MenuItem,
  PopoverAnchor,
  TabState,
  ViewBounds,
} from '@browser/ipc-contract'
import {
  internalTitleFromPath,
  isWmfxUrl,
  NEW_TAB_URL,
  wmfxFromActualUrl,
  wmfxPath,
} from '@browser/shared'
import {
  type BrowserWindow,
  type ContextMenuParams,
  clipboard,
  nativeTheme,
  type Session,
  WebContentsView,
} from 'electron'
import type { HistoryManager } from './history-manager'
import { loadInternalView } from './internal-url'
import { getPreloadPath } from './paths'
import type { PopoverManager } from './popover-manager'
import type { SettingsManager } from './settings-manager'

export interface TabManagerConfig {
  defaultSessionName?: string
}

export class TabManager {
  private tabs = new Map<string, Tab>()
  private activeTabId: string | null = null
  private windowId: string
  private tabBounds = new Map<string, ViewBounds>()
  private lastActiveTime = new Map<string, number>()
  private suspendTimer: ReturnType<typeof setInterval> | null = null
  private readonly SUSPEND_THRESHOLD = 5 * 60 * 1000 // 5 minutes

  constructor(
    private window: BrowserWindow,
    private getSession: (name: string) => Session,
    private defaultSessionName: string = 'default',
    private historyManager: HistoryManager,
    private settingsManager: SettingsManager | null = null,
    private popoverManager: PopoverManager
  ) {
    this.windowId = window.id.toString()
    window.on('close', () => this.destroy())
    this.suspendTimer = setInterval(() => this.checkSuspendTabs(), 60_000)
  }

  create(opts?: CreateTabOptions): TabState {
    const sessionId = opts?.sessionId ?? this.defaultSessionName
    // 空白/about:blank 统一当作新标签页（内部页），兼容旧会话恢复遗留的 about:blank
    const rawUrl = opts?.url ?? ''
    const resolvedUrl = !rawUrl || rawUrl === 'about:blank' ? NEW_TAB_URL : rawUrl
    const wantInternal = isWmfxUrl(resolvedUrl)

    const tabId = crypto.randomUUID()
    const tab: Tab = {
      id: tabId,
      windowId: this.windowId,
      view: null as unknown as WebContentsView,
      sessionId,
      isInternal: wantInternal,
      state: {
        id: tabId,
        windowId: this.windowId,
        sessionId,
        url: resolvedUrl,
        title:
          opts?.title ??
          (wantInternal
            ? internalTitleFromPath(wmfxPath(resolvedUrl), this.settingsManager?.get('currentLang'))
            : ''),
        favicon: null,
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        zoomFactor: 1,
        isMuted: false,
        isPinned: false,
        isSuspended: false,
      },
      isSuspended: false,
    }

    this.tabs.set(tabId, tab)
    this.spawnView(tab, wantInternal)

    if (opts?.activate !== false) {
      this.activate(tabId)
    } else {
      this.window.contentView.addChildView(tab.view)
      tab.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    }

    if (wantInternal) {
      loadInternalView(tab.view, wmfxPath(resolvedUrl))
    } else {
      tab.view.webContents.loadURL(resolvedUrl)
    }

    this.window.webContents.send('tab:created', this.buildTabState(tab))

    return this.buildTabState(tab)
  }

  /**
   * 销毁旧视图并按 internal/external 重建：内部页挂 preload + isPinned，外部页不挂 preload。
   * 守卫：`tab.isInternal === wantInternal` 时直接返回原 view（didRelaunch=false），
   * 防止 did-navigate 递归与重复加载。
   */
  relaunchView(tabId: string, url: string): { view: WebContentsView; didRelaunch: boolean } {
    const tab = this.tabs.get(tabId)
    if (!tab) {
      throw new Error(`Tab not found: ${tabId}`)
    }
    const wantInternal = isWmfxUrl(url)
    if (tab.isInternal === wantInternal) {
      return { view: tab.view, didRelaunch: false }
    }

    this.window.contentView.removeChildView(tab.view)
    tab.view.webContents.close()
    tab.isInternal = wantInternal
    this.spawnView(tab, wantInternal)

    this.window.contentView.addChildView(tab.view)
    this.applyBounds(tab)

    if (wantInternal) {
      loadInternalView(tab.view, wmfxPath(url))
    } else {
      tab.view.webContents.loadURL(url)
    }

    return { view: tab.view, didRelaunch: true }
  }

  close(tabId: string): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return

    const wasActive = this.activeTabId === tabId

    // 先更新模型并广播移除事件：即使下方视图卸载抛错（如视图已脱离 contentView），
    // 渲染进程也能正确移除标签条，避免出现「网页已关但标签残留」的现象。
    this.tabs.delete(tabId)
    this.window.webContents.send('tab:removed', tabId)

    try {
      if (this.window.contentView.children.includes(tab.view)) {
        this.window.contentView.removeChildView(tab.view)
      }
      if (!tab.view.webContents.isDestroyed()) {
        tab.view.webContents.close()
      }
    } catch {
      /* 视图卸载失败不阻塞标签移除 */
    }

    if (wasActive) {
      if (this.tabs.size > 0) {
        const nextTab = Array.from(this.tabs.values())[0]
        this.activate(nextTab.id)
      } else {
        this.activeTabId = null
      }
    }

    this.broadcastAllStates()
  }

  activate(tabId: string): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return

    if (this.activeTabId === tabId) return

    const previousActive = this.activeTabId ? this.tabs.get(this.activeTabId) : null

    this.activeTabId = tabId
    this.lastActiveTime.set(tabId, Date.now())

    if (previousActive) {
      try {
        if (this.window.contentView.children.includes(previousActive.view)) {
          this.window.contentView.removeChildView(previousActive.view)
        }
      } catch {
        /* 视图已脱离 contentView 时忽略 */
      }
    }

    if (tab.isSuspended) {
      this.resumeTab(tab)
    }

    if (!this.window.contentView.children.includes(tab.view)) {
      this.window.contentView.addChildView(tab.view)
    }
    tab.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })

    this.broadcastAllStates()
  }

  setViewportBounds(tabId: string, bounds: ViewBounds): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    this.tabBounds.set(tabId, bounds)
    this.applyBounds(tab)
  }

  private applyBounds(tab: Tab): void {
    const bounds = this.tabBounds.get(tab.id)
    if (!bounds) return
    tab.view.setBounds(bounds)
  }

  getState(tabId: string): TabState | null {
    const tab = this.tabs.get(tabId)
    if (!tab) return null
    return this.buildTabState(tab)
  }

  getList(): TabState[] {
    const states: TabState[] = []
    for (const tab of this.tabs.values()) {
      states.push(this.buildTabState(tab))
    }
    return states
  }

  /** 获取所有内置页（wmfx://）的 tab id 和 webContents */
  getInternalTabs(): Array<{ id: string; webContents: Electron.WebContents }> {
    const result: Array<{ id: string; webContents: Electron.WebContents }> = []
    for (const tab of this.tabs.values()) {
      if (
        tab.isInternal &&
        tab.view?.webContents?.isDestroyed &&
        !tab.view.webContents.isDestroyed()
      ) {
        result.push({ id: tab.id, webContents: tab.view.webContents })
      }
    }
    return result
  }

  getActiveTabId(): string | null {
    return this.activeTabId
  }

  getWebContents(tabId: string): Electron.WebContents | null {
    const tab = this.tabs.get(tabId)
    if (!tab) return null
    return tab.view.webContents
  }

  /** 由 WebContents 反查所属 tabId（nav:loadURLCurrent 用）。 */
  getTabIdByWebContents(wc: Electron.WebContents): string | null {
    for (const tab of this.tabs.values()) {
      if (tab.view.webContents === wc) return tab.id
    }
    return null
  }

  setNavigating(tabId: string, url: string): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    tab.state.url = url
    tab.state.title = url
    tab.state.favicon = null
    tab.state.isLoading = true
    this.broadcastState(tab)
  }

  destroy(): void {
    // 先持久化会话状态，再清理视图：window 'close' 时若先清空 tabs 再 save，
    // openTabs 会被写成空数组，导致重启后无法恢复标签。
    if (this.settingsManager) {
      this.settingsManager.set('openTabs', this.serializeTabs())
      this.settingsManager.set('activeTabIndex', this.getActiveTabIndex())
      this.settingsManager.set(
        'windowBounds',
        this.window.isMaximized() ? null : this.window.getBounds()
      )
    }
    if (this.suspendTimer) {
      clearInterval(this.suspendTimer)
      this.suspendTimer = null
    }
    for (const tab of this.tabs.values()) {
      this.window.contentView.removeChildView(tab.view)
      if (tab.view?.webContents?.isDestroyed && !tab.view.webContents.isDestroyed()) {
        tab.view.webContents.close()
      }
    }
    this.tabs.clear()
    this.activeTabId = null
  }

  serializeTabs(): { url: string; title: string }[] {
    const tabs: { url: string; title: string }[] = []
    for (const tab of this.tabs.values()) {
      tabs.push({ url: tab.state.url, title: tab.state.title })
    }
    return tabs
  }

  getActiveTabIndex(): number {
    if (!this.activeTabId) return 0
    const ids = Array.from(this.tabs.keys())
    return ids.indexOf(this.activeTabId)
  }

  restoreTabs(tabs: { url: string; title: string }[], activeIndex: number): void {
    if (tabs.length === 0) {
      this.createNewTab()
      return
    }
    for (let i = 0; i < tabs.length; i++) {
      this.create({ url: tabs[i].url, title: tabs[i].title, activate: i === activeIndex })
    }
  }

  /** 新建标签页（默认使用新标签页内部页 wmfx://newtab）。 */
  createNewTab(sessionId?: string): TabState {
    return this.create({ url: NEW_TAB_URL, sessionId, activate: true })
  }

  // --- Private helpers ---

  /**
   * 创建并接入一个 WebContentsView。内部页挂 preload 并标记 isPinned；外部页不挂 preload。
   */
  private spawnView(tab: Tab, wantInternal: boolean): void {
    const webPreferences: Electron.WebPreferences = {
      session: this.getSession(tab.sessionId),
    }
    if (wantInternal) {
      webPreferences.preload = getPreloadPath()
    }

    const view = new WebContentsView({ webPreferences })
    view.setBackgroundColor(this.resolveViewBackgroundColor())
    tab.view = view

    this.setupTabListeners(tab)
    this.applyBounds(tab)
  }

  /**
   * 解析视图初始背景色，避免刷新/加载时闪烁与主题不符的底色。
   * 依据当前主题设置（含 system 跟随系统）返回浅色/深色底色。
   */
  private resolveViewBackgroundColor(): string {
    const theme = this.settingsManager?.get('theme') ?? 'system'
    const isDark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)
    return isDark ? '#353535' : '#ffffff'
  }

  private checkSuspendTabs(): void {
    const now = Date.now()
    for (const tab of this.tabs.values()) {
      if (tab.id === this.activeTabId) continue
      if (tab.isSuspended) continue
      if (tab.state.isPinned) continue

      const lastActive = this.lastActiveTime.get(tab.id) ?? 0
      if (now - lastActive > this.SUSPEND_THRESHOLD) {
        this.suspendTab(tab)
      }
    }
  }

  private suspendTab(tab: Tab): void {
    if (tab.isSuspended) return
    this.window.contentView.removeChildView(tab.view)
    tab.view.webContents.close()
    tab.isSuspended = true
    this.broadcastState(tab)
  }

  private resumeTab(tab: Tab): void {
    if (!tab.isSuspended) return

    this.spawnView(tab, tab.isInternal)
    tab.isSuspended = false

    const url = tab.state.url
    if (url && url !== 'about:blank') {
      if (tab.isInternal) {
        loadInternalView(tab.view, wmfxPath(url))
      } else {
        tab.view.webContents.loadURL(url)
      }
    }
  }

  private setupTabListeners(tab: Tab): void {
    const wc = tab.view.webContents

    wc.setWindowOpenHandler(({ url, frameName }) => {
      this.create({ url, sessionId: tab.sessionId, title: frameName || url })
      return { action: 'deny' }
    })

    wc.on('did-navigate', () => {
      const actual = wc.getURL()
      const url = wmfxFromActualUrl(actual) ?? actual
      tab.state.url = url
      tab.state.canGoBack = wc.navigationHistory.canGoBack()
      tab.state.canGoForward = wc.navigationHistory.canGoForward()
      this.broadcastState(tab)

      // 内部页跳转到外部站点：异步重建为普通标签，避免在处理旧 webContents 事件时销毁自身
      if (tab.isInternal && !isWmfxUrl(url)) {
        setTimeout(() => {
          try {
            this.relaunchView(tab.id, url)
          } catch {
            /* tab 已被关闭 */
          }
        }, 0)
        return
      }

      if (url && !url.startsWith('about:') && !url.startsWith('chrome:') && !isWmfxUrl(url)) {
        this.historyManager.add({
          url,
          title: tab.state.title || null,
          favicon: tab.state.favicon,
        })
      }
    })

    wc.on('did-navigate-in-page', () => {
      const actual = wc.getURL()
      const url = wmfxFromActualUrl(actual) ?? actual
      tab.state.url = url
      tab.state.canGoBack = wc.navigationHistory.canGoBack()
      tab.state.canGoForward = wc.navigationHistory.canGoForward()
      this.broadcastState(tab)
    })

    wc.on('page-title-updated', (_, title) => {
      tab.state.title = title
      this.broadcastState(tab)
    })

    wc.on('page-favicon-updated', (_, favicons) => {
      // 内部页（wmfx://）没有真实 favicon，浏览器会回退到页面所在源的 /favicon.ico
      // （如开发态的 http://localhost:5173/favicon.ico），渲染即成破图。内部页由外壳按路由展示图标。
      if (tab.isInternal) {
        return
      }
      // Use the first icon if available
      tab.state.favicon = favicons.length > 0 ? favicons[0] : null
      this.broadcastState(tab)
    })

    wc.on('did-start-loading', () => {
      tab.state.isLoading = true
      this.broadcastState(tab)
    })

    wc.on('did-stop-loading', () => {
      tab.state.isLoading = false
      this.broadcastState(tab)
    })

    wc.on('render-process-gone', () => {
      const url = tab.state.url || NEW_TAB_URL
      if (tab.isInternal) {
        loadInternalView(tab.view, wmfxPath(url))
      } else {
        tab.view.webContents.loadURL(url)
      }
    })

    // 网页右键菜单：外部页无 preload，必须由主进程拦截 context-menu 事件并复用 Popover 渲染
    wc.on('context-menu', (_event, params) => {
      this.openWebContextMenu(tab, params)
    })
  }

  /** 依据 context-menu 参数构建网页右键菜单项（编辑/链接/图片/导航/检查元素）。 */
  private buildWebContextItems(tab: Tab, params: ContextMenuParams): MenuItem[] {
    const wc = tab.view.webContents
    const items: MenuItem[] = []
    let sepSeq = 0
    const sep = (): MenuItem => ({ id: `web-sep-${sepSeq++}`, type: 'separator' })
    const ef = params.editFlags

    if (params.isEditable) {
      if (ef.canUndo) items.push({ id: 'web-undo', label: '撤销', icon: 'mdi:undo' })
      if (ef.canRedo) items.push({ id: 'web-redo', label: '重做', icon: 'mdi:redo' })
      if (ef.canUndo || ef.canRedo) items.push(sep())
      if (ef.canCut) items.push({ id: 'web-cut', label: '剪切', icon: 'mdi:content-cut' })
      if (ef.canCopy) items.push({ id: 'web-copy', label: '复制', icon: 'mdi:content-copy' })
      if (ef.canPaste) items.push({ id: 'web-paste', label: '粘贴', icon: 'mdi:content-paste' })
      if (ef.canDelete) items.push({ id: 'web-delete', label: '删除' })
      if (ef.canCut || ef.canCopy || ef.canPaste || ef.canDelete) items.push(sep())
      if (ef.canSelectAll)
        items.push({ id: 'web-select-all', label: '全选', icon: 'mdi:select-all' })
    } else if (params.selectionText) {
      items.push({ id: 'web-copy', label: '复制', icon: 'mdi:content-copy' })
    }

    if (params.linkURL) {
      items.push({ id: 'web-open-link', label: '在新标签页中打开', icon: 'mdi:open-in-new' })
      items.push({ id: 'web-copy-link', label: '复制链接地址', icon: 'mdi:link-variant' })
    }

    if (params.mediaType === 'image' && params.srcURL) {
      items.push({ id: 'web-open-image', label: '在新标签页中打开图片', icon: 'mdi:image' })
      items.push({ id: 'web-copy-image-url', label: '复制图片地址', icon: 'mdi:image-outline' })
      items.push({ id: 'web-save-image', label: '图片另存为', icon: 'mdi:download' })
    }

    if (items.length) items.push(sep())
    items.push({
      id: 'web-back',
      label: '后退',
      icon: 'mdi:arrow-left',
      disabled: !wc.navigationHistory.canGoBack(),
    })
    items.push({
      id: 'web-forward',
      label: '前进',
      icon: 'mdi:arrow-right',
      disabled: !wc.navigationHistory.canGoForward(),
    })
    items.push({ id: 'web-reload', label: '重新加载', icon: 'mdi:refresh' })
    items.push(sep())
    items.push({ id: 'web-inspect', label: '检查元素', icon: 'mdi:code-tags' })

    return items
  }

  /** 打开网页右键菜单：把内容坐标转换为窗口坐标作为锚点，主进程直接处理选中动作。 */
  private openWebContextMenu(tab: Tab, params: ContextMenuParams): void {
    const items = this.buildWebContextItems(tab, params)
    const bounds = tab.view.getBounds()
    const anchor: PopoverAnchor = {
      type: 'point',
      x: Math.round(bounds.x + params.x),
      y: Math.round(bounds.y + params.y),
    }
    this.popoverManager.open('web-context-menu', {
      type: 'menu',
      anchor,
      data: { id: 'web-context-menu', items },
      onSelect: (eventData) => {
        if (typeof eventData === 'string') {
          this.handleWebContextAction(tab, params, eventData)
        }
      },
    })
  }

  /** 执行网页右键菜单的选中动作，全部在主进程操作对应 webContents。 */
  private handleWebContextAction(tab: Tab, params: ContextMenuParams, id: string): void {
    const wc = tab.view.webContents
    switch (id) {
      case 'web-back':
        wc.navigationHistory.goBack()
        break
      case 'web-forward':
        wc.navigationHistory.goForward()
        break
      case 'web-reload':
        wc.reload()
        break
      case 'web-undo':
        wc.undo()
        break
      case 'web-redo':
        wc.redo()
        break
      case 'web-cut':
        wc.cut()
        break
      case 'web-copy':
        wc.copy()
        break
      case 'web-paste':
        wc.paste()
        break
      case 'web-delete':
        wc.delete()
        break
      case 'web-select-all':
        wc.selectAll()
        break
      case 'web-open-link':
        if (params.linkURL) this.create({ url: params.linkURL, sessionId: tab.sessionId })
        break
      case 'web-copy-link':
        if (params.linkURL) clipboard.writeText(params.linkURL)
        break
      case 'web-open-image':
        if (params.srcURL) this.create({ url: params.srcURL, sessionId: tab.sessionId })
        break
      case 'web-copy-image-url':
        if (params.srcURL) clipboard.writeText(params.srcURL)
        break
      case 'web-save-image':
        if (params.srcURL) wc.downloadURL(params.srcURL)
        break
      case 'web-inspect':
        wc.inspectElement(params.x, params.y)
        break
    }
  }

  private buildTabState(tab: Tab): TabState {
    return {
      ...tab.state,
      active: tab.id === this.activeTabId,
      isSuspended: tab.isSuspended,
    }
  }

  private broadcastState(tab: Tab): void {
    const state = this.buildTabState(tab)
    this.window.webContents.send('tab:state-change', state)
  }

  private broadcastAllStates(): void {
    for (const tab of this.tabs.values()) {
      this.broadcastState(tab)
    }
  }

  /** 切换固定状态：仅更新模型标志并广播，排序与窄宽由渲染进程负责。 */
  setPinned(tabId: string, pinned: boolean): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    tab.state.isPinned = pinned
    this.broadcastState(tab)
  }

  /** 静音/取消静音：直接作用于 WebContents 音频，并同步模型标志后广播。 */
  setMuted(tabId: string, muted: boolean): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    tab.view.webContents.setAudioMuted(muted)
    tab.state.isMuted = muted
    this.broadcastState(tab)
  }

  /** 批量关闭一组标签（逐个调用 close）。空窗口退出由 IPC 层与单次关闭保持一致。 */
  closeMany(ids: string[]): void {
    for (const id of ids) {
      this.close(id)
    }
  }

  reorder(ids: string[]): void {
    if (!this.settingsManager) return
    this.settingsManager.set('tabOrder', ids)

    for (const tab of this.tabs.values()) {
      tab.view.setBounds({ ...tab.view.getBounds(), y: -10000 })
    }

    const activeId = this.activeTabId
    let activeIdx = -1

    for (let i = 0; i < ids.length; i++) {
      const tab = this.tabs.get(ids[i])
      if (!tab) continue

      if (ids[i] === activeId) {
        activeIdx = i
      }

      const bounds = this.tabBounds.get(tab.id)
      const newY = i * 20 - 20
      tab.view.setBounds({
        x: bounds?.x ?? 0,
        y: newY,
        width: bounds?.width ?? 0,
        height: bounds?.height ?? 0,
      })
    }

    if (activeIdx >= 0 && activeId) {
      const activeTab = this.tabs.get(activeId)
      if (activeTab) {
        this.activeTabId = null
        this.activate(activeId)
      }
    }
  }
}

interface Tab {
  id: string
  windowId: string
  view: WebContentsView
  sessionId: string
  /** 是否为内部页标签：决定是否挂 preload 以及在 did-navigate 中的分类逻辑。 */
  isInternal: boolean
  state: Omit<TabState, 'active'>
  isSuspended: boolean
}
