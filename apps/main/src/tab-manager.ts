import type {
  CreateTabOptions,
  MenuItem,
  PopoverAnchor,
  SecurityState,
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
import type { CertTrustStore } from './cert-trust-store'
import { setFavicon } from './favicon-cache'
import type { HistoryManager } from './history-manager'
import { loadInternalView } from './internal-url'
import type { ExtractedArticle, PageEnhanceManager } from './page-enhance-manager'
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
  /** webContents id → tabId 反查（O(1)，替代 getTabIdByWebContents 线性扫描） */
  private wcToTab = new Map<number, string>()
  /** 等待展示的证书错误信息（cert-warning 页面 onMounted 时拉取） */
  private certPending = new Map<string, { host: string; errorText: string; requestedUrl: string }>()
  /** 标签打开顺序栈：关闭当前 tab 时从栈尾往前找上一个存活的 tab */
  private openOrder: string[] = []
  /** 最近关闭的标签栈：Cmd+Shift+T 撤销关闭使用（LIFO，上限 20） */
  private closedTabs: ClosedTabInfo[] = []
  private static readonly MAX_CLOSED_TABS = 20

  /** 当前关联的 workspaceId（默认 'default'，切换工作区时更新） */
  private workspaceId: string = 'default'

  constructor(
    private window: BrowserWindow,
    private getSession: (name: string) => Session,
    private defaultSessionName: string = 'default',
    private historyManager: HistoryManager,
    private settingsManager: SettingsManager | null = null,
    private popoverManager: PopoverManager,
    private certTrustStore: CertTrustStore,
    private pageEnhanceManager: PageEnhanceManager
  ) {
    this.windowId = window.id.toString()
    window.on('close', () => this.destroy())
    this.suspendTimer = setInterval(() => this.checkSuspendTabs(), 60_000)
  }

  /** 切换 workspace 时更新关联的 workspaceId */
  setWorkspaceId(id: string): void {
    this.workspaceId = id
  }

  getWorkspaceId(): string {
    return this.workspaceId
  }

  create(opts?: CreateTabOptions): TabState {
    // 无痕窗口 defaultSessionName=incognito：强制所有标签走内存分区，忽略外部传入的 default
    let sessionId = opts?.sessionId ?? this.defaultSessionName
    if (this.defaultSessionName === 'incognito') {
      sessionId = 'incognito'
    }
    // 空白/about:blank 统一当作新标签页（内部页），兼容旧会话恢复遗留的 about:blank
    const rawUrl = opts?.url ?? ''
    const resolvedUrl = !rawUrl || rawUrl === 'about:blank' ? NEW_TAB_URL : rawUrl
    const wantInternal = isWmfxUrl(resolvedUrl)

    const tabId = crypto.randomUUID()
    console.debug(
      '[TabManager] create: tabId url sessionId isInternal',
      tabId,
      resolvedUrl,
      sessionId,
      wantInternal
    )
    const tab: Tab = {
      id: tabId,
      windowId: this.windowId,
      view: null as unknown as WebContentsView,
      readerView: null,
      readerArticle: null,
      sessionId,
      isInternal: wantInternal,
      state: {
        id: tabId,
        windowId: this.windowId,
        sessionId,
        navigation: {
          displayUrl: resolvedUrl,
          requestedUrl: resolvedUrl,
          committedUrl: '',
          internalUrl: '',
          isLoading: false,
          state: 'loading',
          error: null,
          securityState: isWmfxUrl(resolvedUrl)
            ? 'internal'
            : resolvedUrl.startsWith('https://')
              ? 'secure'
              : 'insecure',
        },
        title:
          opts?.title ??
          (wantInternal
            ? internalTitleFromPath(wmfxPath(resolvedUrl), this.settingsManager?.get('currentLang'))
            : ''),
        favicon: null,
        canGoBack: false,
        canGoForward: false,
        zoomFactor: 1,
        isMuted: false,
        isPinned: false,
        isSuspended: false,
        isReaderMode: false,
        isHtmlFullscreen: false,
      },
      isSuspended: false,
    }

    this.tabs.set(tabId, tab)
    this.openOrder.push(tabId)
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
      console.debug('[TabManager] relaunchView: tabId url didRelaunch=false (skipped)', tabId, url)
      return { view: tab.view, didRelaunch: false }
    }

    console.debug('[TabManager] relaunchView: tabId url didRelaunch=true', tabId, url)

    this.destroyReaderView(tab)
    this.window.contentView.removeChildView(tab.view)
    this.wcToTab.delete(tab.view.webContents.id)
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

    // 保存已关闭标签快照（Cmd+Shift+T 撤销关闭用）
    const url = tab.state.navigation.committedUrl || tab.state.navigation.requestedUrl
    if (url && !isWmfxUrl(url)) {
      this.closedTabs.push({ url, title: tab.state.title, sessionId: tab.sessionId })
      if (this.closedTabs.length > TabManager.MAX_CLOSED_TABS) this.closedTabs.shift()
      console.debug(
        '[TabManager] close: saved closedTab url=%s stack=%d',
        url,
        this.closedTabs.length
      )
    }

    if (!tab.view.webContents.isDestroyed()) {
      this.wcToTab.delete(tab.view.webContents.id)
    }
    this.certPending.delete(tabId)

    // 从打开顺序栈中移除
    const orderIdx = this.openOrder.indexOf(tabId)
    if (orderIdx !== -1) this.openOrder.splice(orderIdx, 1)

    // 先更新模型并广播移除事件：即使下方视图卸载抛错（如视图已脱离 contentView），
    // 渲染进程也能正确移除标签条，避免出现「网页已关但标签残留」的现象。
    this.tabs.delete(tabId)
    console.debug('[TabManager] close: tabId wasActive remaining', tabId, wasActive, this.tabs.size)
    this.window.webContents.send('tab:removed', tabId)

    try {
      const inChildren = this.window.contentView.children.includes(tab.view)
      if (inChildren) {
        this.window.contentView.removeChildView(tab.view)
      }
      if (!tab.view.webContents.isDestroyed()) {
        tab.view.webContents.close()
      }
    } catch {
      /* ignore */
    }

    this.destroyReaderView(tab)

    if (wasActive) {
      if (this.tabs.size > 0) {
        // 从 openOrder 尾部往前找第一个还存活的 tab
        let nextId: string | null = null
        for (let i = this.openOrder.length - 1; i >= 0; i--) {
          if (this.tabs.has(this.openOrder[i])) {
            nextId = this.openOrder[i]
            break
          }
        }
        const targetId = nextId ?? this.tabs.values().next().value!.id
        this.activate(targetId)
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
    const wasSuspended = tab.isSuspended

    console.debug(
      '[TabManager] activate: tabId prev wasSuspended',
      tabId,
      previousActive?.id ?? null,
      wasSuspended
    )

    this.activeTabId = tabId
    this.lastActiveTime.set(tabId, Date.now())

    if (previousActive) {
      try {
        if (this.window.contentView.children.includes(previousActive.view)) {
          this.window.contentView.removeChildView(previousActive.view)
        }
        // 上一个标签的 ReaderView 也一并脱离渲染，切回时按可见性重新置顶
        if (
          previousActive.readerView &&
          this.window.contentView.children.includes(previousActive.readerView)
        ) {
          this.window.contentView.removeChildView(previousActive.readerView)
        }
      } catch {
        /* 视图已脱离 contentView 时忽略 */
      }
    }

    if (tab.isSuspended) {
      this.resumeTab(tab)
    }

    // 先移除再添加：确保 Electron 强制将此 view 置顶渲染
    try {
      if (this.window.contentView.children.includes(tab.view)) {
        this.window.contentView.removeChildView(tab.view)
      }
    } catch {
      /* ignore */
    }
    this.window.contentView.addChildView(tab.view)
    this.applyBounds(tab)

    // 阅读态标签：ReaderView 重新置顶于 PageView 之上并同步 bounds
    if (tab.readerView) {
      this.window.contentView.addChildView(tab.readerView)
      const bounds = this.tabBounds.get(tab.id)
      if (bounds) tab.readerView.setBounds(bounds)
    }

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
    if (tab.readerView) tab.readerView.setBounds(bounds)
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

  /** 由 WebContents 反查所属 tabId（O(1)，通过 wcToTab 映射）。 */
  getTabIdByWebContents(wc: Electron.WebContents): string | null {
    return this.wcToTab.get(wc.id) ?? null
  }

  getCertPending(tabId: string) {
    return this.certPending.get(tabId) ?? null
  }

  getNavigationState(tabId: string) {
    const tab = this.tabs.get(tabId)
    return tab?.state.navigation ?? null
  }

  /** 每次 did-navigate 成功时按当前 URL 无条件重算，不继承上一页 */
  private deriveSecurity(url: string): SecurityState {
    if (isWmfxUrl(url)) return 'internal'
    if (url.startsWith('https://')) return 'secure'
    return 'insecure'
  }

  setNavigating(tabId: string, url: string): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    console.debug('[TabManager] setNavigating: tabId url', tabId, url)
    this.certPending.delete(tabId)
    tab.state.navigation.requestedUrl = url
    tab.state.navigation.displayUrl = url
    tab.state.navigation.state = 'loading'
    tab.state.navigation.error = null
    tab.state.navigation.isLoading = true
    tab.state.title = url
    tab.state.favicon = null
    this.broadcastState(tab)
  }

  destroy(): void {
    console.debug(
      '[TabManager] destroy: totalTabs=%d defaultSession=%s',
      this.tabs.size,
      this.defaultSessionName
    )
    // 先持久化会话状态，再清理视图：window 'close' 时若先清空 tabs 再 save，
    // openTabs 会被写成空数组，导致重启后无法恢复标签。
    // 无痕窗口不落盘（避免覆盖普通窗口会话 / 尺寸）。
    if (this.settingsManager && this.defaultSessionName !== 'incognito') {
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
      this.destroyReaderView(tab)
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
      tabs.push({
        url: tab.state.navigation.committedUrl || tab.state.navigation.requestedUrl,
        title: tab.state.title,
      })
    }
    return tabs
  }

  getActiveTabIndex(): number {
    if (!this.activeTabId) return 0
    const ids = Array.from(this.tabs.keys())
    return ids.indexOf(this.activeTabId)
  }

  restoreTabs(tabs: { url: string; title: string }[], activeIndex: number): void {
    console.debug('[TabManager] restoreTabs: count activeIndex', tabs.length, activeIndex)
    if (tabs.length === 0) {
      console.debug('[TabManager] restoreTabs: empty, creating new tab')
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
    console.debug('[TabManager] spawnView: tabId wantInternal', tab.id, wantInternal)
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

  /** 主题切换时同步所有标签页视图的背景色，避免导航时闪烁旧底色。 */
  updateAllViewBackgrounds(): void {
    const bg = this.resolveViewBackgroundColor()
    for (const tab of this.tabs.values()) {
      if (tab.view?.webContents && !tab.view.webContents.isDestroyed()) {
        tab.view.setBackgroundColor(bg)
      }
    }
  }

  /** 获取所有外部页（http/https，非内部页）的 WebContents，供主题切换时重注入暗色 CSS。 */
  getExternalWebContents(): Electron.WebContents[] {
    const result: Electron.WebContents[] = []
    for (const tab of this.tabs.values()) {
      if (
        !tab.isInternal &&
        tab.view?.webContents?.isDestroyed &&
        !tab.view.webContents.isDestroyed()
      ) {
        const url = tab.view.webContents.getURL()
        if (url.startsWith('http://') || url.startsWith('https://')) {
          result.push(tab.view.webContents)
        }
      }
    }
    return result
  }

  /** 存活且可见的 readerView webContents（供主题广播触达阅读页，避免暗色/浅色残留旧色）。 */
  getReaderWebContents(): Electron.WebContents[] {
    const result: Electron.WebContents[] = []
    for (const tab of this.tabs.values()) {
      const rv = tab.readerView
      if (rv && !rv.webContents.isDestroyed() && rv.getVisible()) {
        result.push(rv.webContents)
      }
    }
    return result
  }

  /** 主题切换时对所有外部页重注入/移除暗色 CSS（内部页由 theme:change 广播控制）。forceDark 关闭时不注入。 */
  reapplyDarkForTheme(isDark: boolean): void {
    if (this.settingsManager?.get('forceDark') !== true) {
      console.debug('[TabManager] reapplyDarkForTheme: forceDark off, skip')
      return
    }
    const targets = this.getExternalWebContents()
    console.info(`[TabManager] reapplyDarkForTheme: isDark=${isDark} count=${targets.length}`)
    for (const wc of targets) {
      this.pageEnhanceManager.applyDark(wc, isDark)
    }
  }

  /** forceDark 开关切换：立即对所有外部页注入/移除暗色 CSS（无需刷新）。 */
  setForceDark(value: boolean): void {
    const targets = this.getExternalWebContents()
    console.info(`[TabManager] setForceDark: ${value} count=${targets.length}`)
    if (!value) {
      this.pageEnhanceManager.removeDarkBatch(targets)
      return
    }
    for (const wc of targets) {
      this.pageEnhanceManager.applyDark(wc, true)
    }
  }

  /**
   * 懒创建 ReaderView（wmfx://reader 内部页，挂 preload），默认隐藏。
   * 原 PageView 永不销毁，仅在两者间切换可见性。
   */
  private ensureReaderView(tab: Tab): void {
    if (tab.readerView) return
    console.debug(`[TabManager] ensureReaderView: tabId=${tab.id}`)
    const view = new WebContentsView({
      webPreferences: {
        session: this.getSession(tab.sessionId),
        preload: getPreloadPath(),
      },
    })
    view.setBackgroundColor(this.resolveViewBackgroundColor())
    tab.readerView = view
    this.window.contentView.addChildView(view)
    const bounds = this.tabBounds.get(tab.id)
    if (bounds) view.setBounds(bounds)
    loadInternalView(view, 'reader')
    view.setVisible(false)
  }

  /**
   * 进入阅读模式：从存活的 PageView 提取正文 → 推给 ReaderView → 切换可见性。
   * 提取失败时仅广播状态（渲染端据 isReaderMode 判断展示失败），不切换视图。
   */
  async enterReadingMode(tabId: string): Promise<void> {
    console.info(`[TabManager] enterReadingMode: tabId=${tabId}`)
    const tab = this.tabs.get(tabId)
    if (!tab || tab.isInternal || tab.view.webContents.isDestroyed()) {
      console.debug(`[TabManager] enterReadingMode: guard failed tabId=${tabId}`)
      return
    }
    const article = await this.pageEnhanceManager.extractArticle(tab.view.webContents)
    if (!this.tabs.has(tabId)) return
    if (!article) {
      console.debug(`[TabManager] enterReadingMode: no article tabId=${tabId}, abort`)
      this.broadcastState(tab)
      return
    }
    this.ensureReaderView(tab)
    const readerView = tab.readerView
    if (!readerView) return
    tab.readerArticle = article
    readerView.webContents.send('reader:article', article)
    tab.view.setVisible(false)
    readerView.setVisible(true)
    console.debug(`[TabManager] enterReadingMode: shown reader tabId=${tabId}`)
    this.broadcastState(tab)
  }

  /** 退出阅读模式：隐藏 ReaderView，恢复 PageView 可见。 */
  exitReadingMode(tabId: string): void {
    console.info(`[TabManager] exitReadingMode: tabId=${tabId}`)
    const tab = this.tabs.get(tabId)
    if (!tab?.readerView) return
    tab.readerArticle = null
    tab.readerView.setVisible(false)
    tab.view.setVisible(true)
    this.broadcastState(tab)
  }

  /**
   * 渲染进程主动拉取当前 tab 的阅读文章（ReaderView 挂载后调用）。
   * 兜底首次进入竞态：send('reader:article') 可能早于 ReaderView 挂载完成而丢失。
   */
  getReaderArticle(tabId: string): ExtractedArticle | null {
    const tab = this.tabs.get(tabId)
    console.debug(
      `[TabManager] getReaderArticle: tabId=${tabId} hasArticle=${!!tab?.readerArticle}`
    )
    return tab?.readerArticle ?? null
  }

  /** 销毁 ReaderView（关闭/销毁标签或视图重建时调用）：脱离 contentView 并关闭 webContents。 */
  private destroyReaderView(tab: Tab): void {
    const readerView = tab.readerView
    if (!readerView) return
    console.debug(`[TabManager] destroyReaderView: tabId=${tab.id}`)
    try {
      if (this.window.contentView.children.includes(readerView)) {
        this.window.contentView.removeChildView(readerView)
      }
      if (!readerView.webContents.isDestroyed()) {
        readerView.webContents.close()
      }
    } catch {
      /* ignore */
    }
    tab.readerView = null
    tab.readerArticle = null
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
    console.debug(
      '[TabManager] suspendTab: tabId url',
      tab.id,
      tab.state.navigation.committedUrl || tab.state.navigation.requestedUrl
    )
    this.window.contentView.removeChildView(tab.view)
    tab.view.webContents.close()
    this.destroyReaderView(tab)
    tab.isSuspended = true
    this.broadcastState(tab)
  }

  private resumeTab(tab: Tab): void {
    if (!tab.isSuspended) return
    console.debug(
      '[TabManager] resumeTab: tabId url',
      tab.id,
      tab.state.navigation.committedUrl || tab.state.navigation.requestedUrl
    )

    this.spawnView(tab, tab.isInternal)
    tab.isSuspended = false

    const url = tab.state.navigation.committedUrl || tab.state.navigation.requestedUrl
    if (url && url !== 'about:blank') {
      if (tab.isInternal) {
        loadInternalView(tab.view, wmfxPath(url))
      } else {
        tab.view.webContents.loadURL(url)
      }
    }
  }

  private setupTabListeners(tab: Tab): void {
    console.debug('[TabManager] setupTabListeners: tabId', tab.id)
    const wc = tab.view.webContents
    this.wcToTab.set(wc.id, tab.id)

    wc.setWindowOpenHandler(({ url, frameName }) => {
      this.create({ url, sessionId: tab.sessionId, title: frameName || url })
      return { action: 'deny' }
    })

    wc.on('did-navigate', () => {
      const actual = wc.getURL()
      const url = wmfxFromActualUrl(actual) ?? actual
      const nav = tab.state.navigation

      // error / cert-warning 页 did-navigate 特判：只更新 internalUrl，不覆盖 displayUrl/committedUrl/state
      if (url === 'wmfx://error' || url === 'wmfx://cert-warning') {
        nav.internalUrl = actual
        tab.state.canGoBack = wc.navigationHistory.canGoBack()
        tab.state.canGoForward = wc.navigationHistory.canGoForward()
        this.broadcastState(tab)
        return
      }

      nav.committedUrl = url
      nav.displayUrl = url
      nav.internalUrl = actual
      nav.state = 'success'
      nav.error = null
      nav.securityState = this.deriveSecurity(url)
      tab.state.canGoBack = wc.navigationHistory.canGoBack()
      tab.state.canGoForward = wc.navigationHistory.canGoForward()
      this.broadcastState(tab)

      // 内部页跳转到外部站点：异步重建为普通标签
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

      // 外部页跳转到内部页（如 error/cert-warning）：重建为内部视图（带 preload）
      if (!tab.isInternal && isWmfxUrl(url)) {
        setTimeout(() => {
          try {
            this.relaunchView(tab.id, url)
          } catch {
            /* tab 已被关闭 */
          }
        }, 0)
        return
      }

      // 注入字体/编码设置（仅外部页面）
      const font = this.settingsManager?.get('defaultFont')
      const fontSize = this.settingsManager?.get('defaultFontSize')
      const encoding = this.settingsManager?.get('defaultEncoding')
      if (font || fontSize !== undefined || encoding) {
        wc.executeJavaScript(
          `(function() {
            const root = document.documentElement;
            ${font ? `root.style.fontFamily = '${font.replace(/'/g, "\\'")}';` : ''}
            ${fontSize !== undefined ? `root.style.fontSize = '${fontSize}px';` : ''}
            ${encoding ? `document.charset = '${encoding}';` : ''}
          })()`,
          false
        )
      }

      // 外部页导航：按 forceDark 设置注入/移除暗色 CSS（isExternal 由 PageEnhanceManager 内部判断，wmfx:// 内部页不会被处理）；若处于阅读态，文章随新页失效，自动退出
      this.pageEnhanceManager.resetDark(wc)
      this.pageEnhanceManager.applyDark(wc, this.settingsManager?.get('forceDark') === true)
      if (tab.readerView?.getVisible()) {
        this.exitReadingMode(tab.id)
      }

      // 无痕标签不写入历史（独立无痕窗口 / 无痕 session）
      if (
        tab.sessionId !== 'incognito' &&
        url &&
        !url.startsWith('about:') &&
        !url.startsWith('chrome:') &&
        !isWmfxUrl(url)
      ) {
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
      const nav = tab.state.navigation
      nav.internalUrl = actual
      nav.committedUrl = url
      nav.displayUrl = url
      nav.securityState = this.deriveSecurity(url)
      tab.state.canGoBack = wc.navigationHistory.canGoBack()
      tab.state.canGoForward = wc.navigationHistory.canGoForward()
      this.broadcastState(tab)

      // 外部页页内导航（hash/history）：按 forceDark 设置维持暗色 CSS；处于阅读态则退出
      if (!tab.isInternal && !isWmfxUrl(url)) {
        this.pageEnhanceManager.applyDark(wc, this.settingsManager?.get('forceDark') === true)
        if (tab.readerView?.getVisible()) {
          this.exitReadingMode(tab.id)
        }
      }
    })

    wc.on('page-title-updated', (_, title) => {
      tab.state.title = title
      this.broadcastState(tab)
    })

    wc.on('page-favicon-updated', (_, favicons) => {
      // 内部页（wmfx://）没有真实 favicon，浏览器会回退到页面所在源的 /favicon.ico
      // （如开发态的 http://localhost:<端口>/favicon.ico），渲染即成破图。内部页由外壳按路由展示图标。
      if (tab.isInternal) {
        return
      }
      // Use the first icon if available
      tab.state.favicon = favicons.length > 0 ? favicons[0] : null
      // 写入 favicon 缓存（按 origin 持久化），供后续同域名标签页/历史/书签直接复用
      if (tab.state.favicon) {
        setFavicon(tab.state.navigation.committedUrl, tab.state.favicon)
      }
      this.broadcastState(tab)
    })

    wc.on('did-start-loading', () => {
      tab.state.navigation.isLoading = true
      this.broadcastState(tab)
    })

    wc.on('did-stop-loading', () => {
      tab.state.navigation.isLoading = false
      this.broadcastState(tab)
    })

    // --- 错误页：did-fail-load 拦截 ---
    wc.on('did-fail-load', (_event, errorCode, errorDescription, _errorURL, isMainFrame) => {
      if (!isMainFrame) return
      // -3 = ERR_ABORTED：用户取消/重定向中断，不显示错误页
      if (errorCode === -3) return
      // 证书错误由 certificate-error 处理，跳过避免双重处理
      if (this.certPending.has(tab.id)) return

      console.debug(
        '[TabManager] did-fail-load: tabId errorCode desc',
        tab.id,
        errorCode,
        errorDescription
      )

      const nav = tab.state.navigation
      nav.error = { code: errorCode, description: errorDescription }
      nav.state = 'error'
      nav.securityState = 'insecure'
      nav.displayUrl = nav.requestedUrl
      this.broadcastState(tab)

      // 存储错误信息供 ErrorView 拉取；relaunchView 会销毁旧 webContents，必须在此之前存储
      this.certPending.set(tab.id, { host: '', errorText: '', requestedUrl: nav.requestedUrl })
      // relaunchView 加载 wmfx://error，内部会重建视图（带 preload）并 loadInternalView
      try {
        this.relaunchView(tab.id, 'wmfx://error')
      } catch {
        /* tab 已被关闭 */
      }
    })

    // --- SSL 证书警告：certificate-error 拦截 ---
    wc.on('certificate-error', (event, url, errorText, _cert, callback) => {
      let host: string
      try {
        host = new URL(url).host
      } catch {
        callback(false)
        return
      }

      console.debug(
        '[TabManager] certificate-error: tabId url host error',
        tab.id,
        url,
        host,
        errorText
      )

      if (this.certTrustStore.isTrusted(host, errorText)) {
        event.preventDefault()
        callback(true)
        this.certTrustStore.consumeOnce(host, errorText)
        return
      }

      // 未信任 → 阻止加载，导航到证书警告页
      event.preventDefault()
      callback(false)

      const nav = tab.state.navigation
      nav.error = { code: -2000, description: errorText }
      nav.state = 'error'
      nav.securityState = 'insecure'
      nav.displayUrl = nav.requestedUrl
      this.broadcastState(tab)

      // 存储证书错误信息供 CertWarningView 拉取
      this.certPending.set(tab.id, { host, errorText, requestedUrl: nav.requestedUrl })
      try {
        this.relaunchView(tab.id, 'wmfx://cert-warning')
      } catch {
        /* tab 已被关闭 */
      }
    })

    wc.on('render-process-gone', () => {
      console.debug('[TabManager] render-process-gone: tabId', tab.id)
      tab.state.navigation.state = 'crashed'
      this.broadcastState(tab)
      const url =
        tab.state.navigation.committedUrl || tab.state.navigation.requestedUrl || NEW_TAB_URL
      if (isWmfxUrl(url)) {
        loadInternalView(tab.view, wmfxPath(url))
      } else {
        tab.view.webContents.loadURL(url)
      }
    })

    // HTML 全屏：网页通过 Fullscreen API 请求全屏时隐藏 UI
    wc.on('enter-html-full-screen', () => {
      console.info('[TabManager] enter-html-full-screen: tabId', tab.id)
      tab.state.isHtmlFullscreen = true
      this.broadcastState(tab)
    })

    wc.on('leave-html-full-screen', () => {
      console.info('[TabManager] leave-html-full-screen: tabId', tab.id)
      tab.state.isHtmlFullscreen = false
      this.broadcastState(tab)
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
      isReaderMode: Boolean(tab.readerView?.getVisible()),
      isHtmlFullscreen: tab.state.isHtmlFullscreen,
    }
  }

  private broadcastState(tab: Tab): void {
    if (!this.tabs.has(tab.id)) return
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
    console.debug('[TabManager] setPinned: tabId pinned', tabId, pinned)
    tab.state.isPinned = pinned
    this.broadcastState(tab)
  }

  /** 静音/取消静音：直接作用于 WebContents 音频，并同步模型标志后广播。 */
  setMuted(tabId: string, muted: boolean): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    console.debug('[TabManager] setMuted: tabId muted', tabId, muted)
    tab.view.webContents.setAudioMuted(muted)
    tab.state.isMuted = muted
    this.broadcastState(tab)
  }

  /** 批量关闭一组标签（逐个调用 close）。空窗口退出由 IPC 层与单次关闭保持一致。 */
  closeMany(ids: string[]): void {
    console.debug('[TabManager] closeMany: count', ids.length)
    for (const id of ids) {
      this.close(id)
    }
  }

  /** 撤销最近一次关闭：从 closedTabs 栈顶 pop 并恢复。栈空时 no-op。 */
  reopenClosed(): void {
    const info = this.closedTabs.pop()
    if (!info) {
      console.debug('[TabManager] reopenClosed: stack empty')
      return
    }
    console.debug('[TabManager] reopenClosed: url=%s sessionId=%s', info.url, info.sessionId)
    this.create({ url: info.url, sessionId: info.sessionId, activate: true })
  }

  reorder(ids: string[]): void {
    if (!this.settingsManager) return
    console.debug('[TabManager] reorder: ids', ids.join(','))
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
  /** 阅读模式视图（wmfx://reader 内部页），懒创建；原 PageView 永不销毁，仅切换可见性。 */
  readerView: WebContentsView | null
  /** 最近一次提取的阅读文章：ReaderView 挂载后主动拉取（首次 send 竞态兜底），导航/退出后置空。 */
  readerArticle: ExtractedArticle | null
  sessionId: string
  /** 是否为内部页标签：决定是否挂 preload 以及在 did-navigate 中的分类逻辑。 */
  isInternal: boolean
  state: Omit<TabState, 'active'>
  isSuspended: boolean
}

/** 已关闭标签的快照，用于 Cmd+Shift+T 撤销关闭。 */
interface ClosedTabInfo {
  url: string
  title: string
  sessionId: string
}
