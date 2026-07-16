import { join } from 'node:path'
import type { ThemeMode } from '@browser/ipc-contract'
import { ProxyManager } from '@browser/proxy'
import {
  BookmarkRepository,
  DatabaseManager,
  DownloadRepository,
  HistoryRepository,
  SubscriptionRepository,
} from '@wmfx/database'
import { app, BrowserWindow, nativeImage, nativeTheme } from 'electron'
import { BookmarkManager } from './bookmark-manager'
import { CertTrustStore } from './cert-trust-store'
import { DownloadManager } from './download-manager'
import { HistoryManager } from './history-manager'
import { NavigationManager } from './navigation-manager'
import {
  getPreloadPath,
  getRendererDevServerUrl,
  getRendererIndexHtml,
  resolveFromRoot,
} from './paths'
import { PopoverManager } from './popover-manager'
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
  popoverManager: PopoverManager
  certTrustStore: CertTrustStore
}

/** 解析应用图标路径：按平台选择对应图标，统一走 resolveFromRoot 相对项目根定位 */
function resolveAppIcon(): string {
  const relative =
    process.platform === 'darwin'
      ? 'resources/icons/macos/icon.png'
      : process.platform === 'win32'
        ? 'resources/icons/windows/icon.ico'
        : 'resources/icons/linux/512x512.png'
  return resolveFromRoot(relative)
}

/** 根据主题设置解析实际背景色 */
function resolveBackgroundColor(theme: ThemeMode): string {
  const isDark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)
  return isDark ? '#353535' : '#ffffff'
}

export function createMainWindow(): BrowserWindowInstance {
  console.debug('[WindowManager] createMainWindow: creating main window')
  // macOS 的 Dock 图标由 app.dock.setIcon 控制，BrowserWindow 的 icon 选项在 macOS 上不生效
  if (process.platform === 'darwin') {
    const appIconPath = resolveAppIcon()
    console.log('设置Dock栏图标', appIconPath)
    const dockIcon = nativeImage.createFromPath(appIconPath)
    app.dock?.setIcon(dockIcon)
  }

  const settingsManager = SettingsManager.getInstance()
  const savedBounds = settingsManager.get('windowBounds')
  console.debug('[WindowManager] createMainWindow: savedBounds=%o', savedBounds)

  const win = new BrowserWindow({
    ...(savedBounds
      ? { x: savedBounds.x, y: savedBounds.y, width: savedBounds.width, height: savedBounds.height }
      : { width: 1280, height: 800 }),
    icon: resolveAppIcon(),
    backgroundColor: resolveBackgroundColor(settingsManager.get('theme')),
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
  win.webContents.setBackgroundThrottling(false)

  const sessionManager = new SessionManager()
  const database = DatabaseManager.getInstance()
  const historyRepo = new HistoryRepository(database.db)
  const downloadRepo = new DownloadRepository(database.db)
  const bookmarkRepo = new BookmarkRepository(database.db)
  const subscriptionRepo = new SubscriptionRepository(database.db)

  const historyManager = new HistoryManager(historyRepo)
  const popoverManager = new PopoverManager(win)
  const certTrustStore = new CertTrustStore(settingsManager)
  const tabManager = new TabManager(
    win,
    (name) => sessionManager.getSession(name),
    'default',
    historyManager,
    settingsManager,
    popoverManager,
    certTrustStore
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
  console.debug('[WindowManager] createMainWindow: proxy rules set up')

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
    popoverManager,
    certTrustStore,
  }
}
