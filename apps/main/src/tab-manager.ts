import type { CreateTabOptions, TabState, ViewBounds } from '@browser/ipc-contract'
import { type BrowserWindow, type Session, WebContentsView } from 'electron'

import type { HistoryManager } from './history-manager'
import type { SettingsManager } from './settings-manager'

export interface TabManagerConfig {
  defaultSessionName?: string
}

export class TabManager {
  private tabs = new Map<string, Tab>()
  private activeTabId: string | null = null
  private windowId: string
  private sidebarOpen = false
  private tabBounds = new Map<string, ViewBounds>()
  private readonly SIDEBAR_WIDTH = 280
  private lastActiveTime = new Map<string, number>()
  private suspendTimer: ReturnType<typeof setInterval> | null = null
  private readonly SUSPEND_THRESHOLD = 5 * 60 * 1000 // 5 minutes

  constructor(
    private window: BrowserWindow,
    private getSession: (name: string) => Session,
    private defaultSessionName: string = 'default',
    private historyManager: HistoryManager,
    private settingsManager: SettingsManager | null = null
  ) {
    this.windowId = window.id.toString()
    window.on('close', () => this.destroy())
    this.suspendTimer = setInterval(() => this.checkSuspendTabs(), 60_000)
  }

  create(opts?: CreateTabOptions): TabState {
    const sessionId = opts?.sessionId ?? this.defaultSessionName
    const view = new WebContentsView({
      webPreferences: {
        session: this.getSession(sessionId),
      },
    })

    const tabId = crypto.randomUUID()
    const tab: Tab = {
      id: tabId,
      windowId: this.windowId,
      view,
      sessionId,
      state: {
        id: tabId,
        windowId: this.windowId,
        sessionId,
        url: '',
        title: '',
        favicon: null,
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        zoomFactor: 1,
        isMuted: false,
        isPinned: false,
      },
      isSuspended: false,
    }

    this.setupTabListeners(tab)

    this.tabs.set(tabId, tab)

    if (opts?.activate !== false) {
      this.activate(tabId)
    } else {
      this.window.contentView.addChildView(view)
      view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    }

    if (opts?.url) {
      view.webContents.loadURL(opts.url)
    }

    this.window.webContents.send('tab:created', this.buildTabState(tab))

    return this.buildTabState(tab)
  }

  close(tabId: string): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return

    const wasActive = this.activeTabId === tabId

    this.window.contentView.removeChildView(tab.view)
    tab.view.webContents.close()
    this.tabs.delete(tabId)

    this.window.webContents.send('tab:removed', tabId)

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
      this.window.contentView.removeChildView(previousActive.view)
    }

    if (tab.isSuspended) {
      this.resumeTab(tab)
    }

    this.window.contentView.addChildView(tab.view)
    tab.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })

    this.broadcastAllStates()
  }

  setViewportBounds(tabId: string, bounds: ViewBounds): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    this.tabBounds.set(tabId, bounds)
    this.applyBounds(tab)
  }

  setSidebarOpen(open: boolean): void {
    this.sidebarOpen = open
    for (const tab of this.tabs.values()) {
      this.applyBounds(tab)
    }
  }

  private applyBounds(tab: Tab): void {
    const bounds = this.tabBounds.get(tab.id)
    if (!bounds) return
    if (this.sidebarOpen) {
      tab.view.setBounds({
        ...bounds,
        width: Math.max(0, bounds.width - this.SIDEBAR_WIDTH),
      })
    } else {
      tab.view.setBounds(bounds)
    }
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

  getActiveTabId(): string | null {
    return this.activeTabId
  }

  getWebContents(tabId: string): Electron.WebContents | null {
    const tab = this.tabs.get(tabId)
    if (!tab) return null
    return tab.view.webContents
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
    if (this.suspendTimer) {
      clearInterval(this.suspendTimer)
      this.suspendTimer = null
    }
    for (const tab of this.tabs.values()) {
      this.window.contentView.removeChildView(tab.view)
      tab.view.webContents.close()
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
      this.create({ url: 'about:blank' })
      return
    }
    for (let i = 0; i < tabs.length; i++) {
      this.create({ url: tabs[i].url, activate: i === activeIndex })
    }
  }

  // --- Private helpers ---

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

    const view = new WebContentsView({
      webPreferences: {
        session: this.getSession(tab.sessionId),
      },
    })

    tab.view = view
    tab.isSuspended = false
    this.setupTabListeners(tab)

    if (tab.state.url && tab.state.url !== 'about:blank') {
      view.webContents.loadURL(tab.state.url)
    }
  }

  private setupTabListeners(tab: Tab): void {
    const wc = tab.view.webContents

    wc.on('did-navigate', () => {
      const url = wc.getURL()
      tab.state.url = url
      tab.state.canGoBack = wc.navigationHistory.canGoBack()
      tab.state.canGoForward = wc.navigationHistory.canGoForward()
      this.broadcastState(tab)

      if (url && !url.startsWith('about:') && !url.startsWith('chrome:')) {
        this.historyManager.add({
          url,
          title: tab.state.title || null,
          favicon: tab.state.favicon,
        })
      }
    })

    wc.on('did-navigate-in-page', () => {
      tab.state.url = wc.getURL()
      tab.state.canGoBack = wc.navigationHistory.canGoBack()
      tab.state.canGoForward = wc.navigationHistory.canGoForward()
      this.broadcastState(tab)
    })

    wc.on('page-title-updated', (_, title) => {
      tab.state.title = title
      this.broadcastState(tab)
    })

    wc.on('page-favicon-updated', (_, favicons) => {
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
      const url = tab.state.url || 'about:blank'
      tab.view.webContents.loadURL(url)
    })
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
  state: Omit<TabState, 'active'>
  isSuspended: boolean
}
