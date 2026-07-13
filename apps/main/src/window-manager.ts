import { join } from 'node:path'
import { ProxyManager } from '@browser/proxy'
import {
  BookmarkRepository,
  DatabaseManager,
  DownloadRepository,
  HistoryRepository,
  SubscriptionRepository,
} from '@wmfx/database'
import { app, BrowserWindow } from 'electron'
import { BookmarkManager } from './bookmark-manager'
import { DownloadManager } from './download-manager'
import { HistoryManager } from './history-manager'
import { NavigationManager } from './navigation-manager'
import { getPreloadPath, getRendererDevServerUrl, getRendererIndexHtml } from './paths'
import { SessionManager } from './session-manager'
import { SettingsManager } from './settings-manager'
import { SubscriptionManager } from './subscription-manager'
import { TabManager } from './tab-manager'

export interface BrowserWindowInstance {
  window: BrowserWindow
  tabManager: TabManager
  navigationManager: NavigationManager
  settingsManager: SettingsManager
  downloadManager: DownloadManager
  historyManager: HistoryManager
  bookmarkManager: BookmarkManager
  proxyManager?: ProxyManager
  subscriptionManager: SubscriptionManager
}

export function createMainWindow(): BrowserWindowInstance {
  const settingsManager = new SettingsManager()
  const savedBounds = settingsManager.get('windowBounds')

  const win = new BrowserWindow({
    ...(savedBounds
      ? { x: savedBounds.x, y: savedBounds.y, width: savedBounds.width, height: savedBounds.height }
      : { width: 1280, height: 800 }),
    show: false,
    titleBarStyle: process.platform === 'win32' ? undefined : 'hidden',
    trafficLightPosition: { x: 12, y: 11 },
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const sessionManager = new SessionManager()
  const database = DatabaseManager.getInstance()
  const historyRepo = new HistoryRepository(database.db)
  const downloadRepo = new DownloadRepository(database.db)
  const bookmarkRepo = new BookmarkRepository(database.db)
  const subscriptionRepo = new SubscriptionRepository(database.db)

  const historyManager = new HistoryManager(historyRepo)
  const tabManager = new TabManager(
    win,
    (name) => sessionManager.getSession(name),
    'default',
    historyManager,
    settingsManager
  )
  const navigationManager = new NavigationManager(tabManager)
  const downloadManager = new DownloadManager(win, downloadRepo, settingsManager)
  const bookmarkManager = new BookmarkManager(bookmarkRepo)
  const subscriptionManager = new SubscriptionManager(subscriptionRepo)

  const proxyManager = new ProxyManager(
    /** 配置目录放在用户数据目录，而非应用包内，避免只读限制 */
    join(app.getPath('userData'), 'proxy')
  )

  /**
   * 配置 Electron session 代理
   * 所有 WebContents 的流量通过 getProxyRules() 路由到本地 Mihomo (127.0.0.1:7890)
   * 这是"应用内代理"方案，不改系统代理，只有本浏览器走代理
   */
  sessionManager.setProxyRules(proxyManager.getProxyRules())

  win.once('ready-to-show', () => win.show())

  let boundsTimer: ReturnType<typeof setTimeout> | null = null
  const saveBounds = (): void => {
    if (boundsTimer) clearTimeout(boundsTimer)
    boundsTimer = setTimeout(() => {
      if (win.isDestroyed()) return
      const isMaximized = win.isMaximized()
      settingsManager.set('windowBounds', isMaximized ? null : win.getBounds())
    }, 500)
  }
  win.on('resize', saveBounds)
  win.on('move', saveBounds)

  const devUrl = getRendererDevServerUrl()
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(getRendererIndexHtml())
  }

  return {
    window: win,
    tabManager,
    navigationManager,
    settingsManager,
    downloadManager,
    historyManager,
    bookmarkManager,
    proxyManager,
    subscriptionManager,
  }
}
