/**
 * 窗口管理 — 创建 BrowserWindow 并装配各 Manager
 *
 * 设计原则：
 * - 每个窗口独立 TabManager / NavigationManager / PopoverManager / DownloadManager
 * - ProxyManager 由调用方注入（全应用共享同一 Mihomo 核心）
 * - SessionManager 模块级单例，保证 default / incognito 分区跨窗口一致
 * - 无痕窗口：defaultSessionName='incognito'、不持久化会话/尺寸、整窗视觉隔离
 */
import type { ThemeMode } from '@browser/ipc-contract'
import type { ProxyManager } from '@browser/proxy'
import { NEW_TAB_URL } from '@browser/shared'
import {
  BookmarkRepository,
  DatabaseManager,
  DownloadRepository,
  HistoryRepository,
  SubscriptionRepository,
} from '@wmfx/database'
import { app, BrowserWindow, nativeImage, nativeTheme } from 'electron'
import type { AdBlocker } from './ad-blocker'
import { BookmarkManager } from './bookmark-manager'
import { CertTrustStore } from './cert-trust-store'
import { loadVueDevToolsForSession } from './devtools'
import { DownloadManager } from './download-manager'
import { HistoryManager } from './history-manager'
import { NavigationManager } from './navigation-manager'
import { PageEnhanceManager } from './page-enhance-manager'
import {
  getPreloadPath,
  getRendererDevServerUrl,
  getRendererIndexHtml,
  resolveFromRoot,
} from './paths'
import { PopoverManager } from './popover-manager'
import { PrivacyManager } from './privacy-manager'
import { SessionManager } from './session-manager'
import { type LaunchBehavior, SettingsManager } from './settings-manager'
import { SubscriptionManager } from './subscription-manager'
import { TabManager } from './tab-manager'

export interface BrowserWindowInstance {
  window: BrowserWindow
  tabManager: TabManager
  navigationManager: NavigationManager
  settingsManager: SettingsManager
  downloadManager: DownloadManager
  historyManager: HistoryManager
  privacyManager: PrivacyManager
  bookmarkManager: BookmarkManager
  /** 全应用共享的代理管理器（同一 Mihomo 核心），所有窗口复用，避免重复启动进程 */
  proxyManager: ProxyManager
  subscriptionManager: SubscriptionManager
  popoverManager: PopoverManager
  certTrustStore: CertTrustStore
  /** 是否为独立无痕窗口（整窗隔离，非窗口内无痕标签） */
  isIncognito: boolean
}

/** 创建窗口时传入的可选项 */
export interface CreateWindowOptions {
  /**
   * 强制以该 URL 打开首个新标签（忽略 launchBehavior）。
   * 用于 Cmd+N 新建普通窗口 / 无痕窗口的固定 newtab。
   */
  launchUrl?: string
  /** 创建独立无痕窗口：整窗使用内存 partition，不落盘会话 */
  incognito?: boolean
}

/** 跨窗口共享的 SessionManager（default / incognito 分区一致） */
let sharedSessionManager: SessionManager | null = null

/** 应用级共享 AdBlocker，由 setAdBlocker 注入后挂载到每个 session */
let appAdBlocker: AdBlocker | null = null

function getSharedSessionManager(): SessionManager {
  if (!sharedSessionManager) {
    sharedSessionManager = new SessionManager()
    console.debug('[WindowManager] getSharedSessionManager: created shared SessionManager')
    // 每个新建 session 挂载广告拦截器（AdBlocker.attach 内部幂等）
    if (appAdBlocker) {
      sharedSessionManager.setOnSessionReady((sess) => appAdBlocker!.attach(sess))
    }
  }
  return sharedSessionManager
}

/** 解析应用图标路径：按平台选择对应图标，统一走 resolveFromRoot 相对项目根定位 */
function resolveAppIcon(): string {
  console.debug('[WindowManager] resolveAppIcon: platform', process.platform)
  const relative =
    process.platform === 'darwin'
      ? 'resources/icons/macos/icon.png'
      : process.platform === 'win32'
        ? 'resources/icons/windows/icon.ico'
        : 'resources/icons/linux/512x512.png'
  return resolveFromRoot(relative)
}

/** 根据主题设置解析实际背景色；无痕窗口用更深底色作视觉区分 */
function resolveBackgroundColor(theme: ThemeMode, isIncognito: boolean): string {
  if (isIncognito) {
    return '#2b1a3d'
  }
  const isDark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)
  return isDark ? '#353535' : '#ffffff'
}

/**
 * 新窗口相对焦点窗口轻微偏移，避免完全重叠
 */
function resolveWindowBounds(
  settingsManager: SettingsManager,
  isIncognito: boolean
): { x?: number; y?: number; width: number; height: number } {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && !focused.isDestroyed()) {
    const b = focused.getBounds()
    console.debug(
      '[WindowManager] resolveWindowBounds: offset from focused id=%s incognito=%s',
      focused.id,
      isIncognito
    )
    return {
      x: b.x + 24,
      y: b.y + 24,
      width: b.width,
      height: b.height,
    }
  }
  // 首个窗口：无痕不复用已保存的普通窗口位置（避免盖住主窗），用默认尺寸居中
  if (isIncognito) {
    console.debug('[WindowManager] resolveWindowBounds: default size for first incognito')
    return { width: 1280, height: 800 }
  }
  const savedBounds = settingsManager.get('windowBounds')
  console.debug('[WindowManager] resolveWindowBounds: savedBounds', savedBounds)
  if (savedBounds) {
    return {
      x: savedBounds.x,
      y: savedBounds.y,
      width: savedBounds.width,
      height: savedBounds.height,
    }
  }
  return { width: 1280, height: 800 }
}

/**
 * 创建并初始化一个浏览器窗口实例
 *
 * 多窗口设计要点：
 * 1. 每个窗口拥有独立的 TabManager / NavigationManager / PopoverManager / DownloadManager；
 * 2. proxyManager 由调用方注入（全应用共享同一 Mihomo 核心）；
 * 3. 窗口实例注册进全局 `browserInstances` Map（key=window.id），关闭时反注册；
 * 4. 无痕窗口 defaultSessionName='incognito'，下载监听绑在 incognito session 上。
 */
export function createWindow(
  options: CreateWindowOptions = {},
  proxyManager: ProxyManager
): BrowserWindowInstance {
  const isIncognito = options.incognito === true
  console.info(
    '[WindowManager] createWindow: incognito=%s launchUrl=%s',
    isIncognito,
    options.launchUrl ?? '(restore/launchBehavior)'
  )

  // macOS 的 Dock 图标由 app.dock.setIcon 控制，BrowserWindow 的 icon 选项在 macOS 上不生效
  if (process.platform === 'darwin') {
    const appIconPath = resolveAppIcon()
    console.debug('[WindowManager] createWindow: setting Dock icon path', appIconPath)
    const dockIcon = nativeImage.createFromPath(appIconPath)
    app.dock?.setIcon(dockIcon)
  }

  const settingsManager = SettingsManager.getInstance()
  const bounds = resolveWindowBounds(settingsManager, isIncognito)

  const win = new BrowserWindow({
    ...bounds,
    icon: resolveAppIcon(),
    backgroundColor: resolveBackgroundColor(settingsManager.get('theme'), isIncognito),
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
  // Vue 壳层 UI 运行在主窗口的默认 session，须装载 Vue DevTools 扩展
  void loadVueDevToolsForSession(win.webContents.session)

  const sessionManager = getSharedSessionManager()
  const database = DatabaseManager.getInstance()
  const historyRepo = new HistoryRepository(database.db)
  const downloadRepo = new DownloadRepository(database.db)
  const bookmarkRepo = new BookmarkRepository(database.db)
  const subscriptionRepo = new SubscriptionRepository(database.db)

  const historyManager = new HistoryManager(historyRepo)
  const privacyManager = new PrivacyManager()
  const popoverManager = new PopoverManager(win)
  const certTrustStore = new CertTrustStore(settingsManager)

  // 无痕窗口强制 defaultSessionName=incognito，新建标签默认走内存分区
  const defaultSessionName = isIncognito ? 'incognito' : 'default'
  const pageEnhanceManager = new PageEnhanceManager()
  const tabManager = new TabManager(
    win,
    (name) => sessionManager.getSession(name),
    defaultSessionName,
    historyManager,
    settingsManager,
    popoverManager,
    certTrustStore,
    pageEnhanceManager
  )
  const navigationManager = new NavigationManager(tabManager)
  const tabSession = sessionManager.getSession(defaultSessionName)
  const downloadManager = new DownloadManager(
    win,
    downloadRepo,
    settingsManager,
    tabSession,
    tabManager
  )
  const bookmarkManager = new BookmarkManager(bookmarkRepo)
  const subscriptionManager = new SubscriptionManager(subscriptionRepo)

  /**
   * 配置 Electron session 代理
   * 所有 WebContents 的流量通过 getProxyRules() 路由到本地 Mihomo (127.0.0.1:7890)
   */
  sessionManager.setProxyRules(proxyManager.getProxyRules())
  console.debug('[WindowManager] createWindow: proxy rules set up isIncognito=%s', isIncognito)

  win.once('ready-to-show', () => win.show())

  // 无痕窗口不持久化尺寸；普通窗口仅当为首个普通窗口时写回
  if (!isIncognito) {
    let boundsTimer: ReturnType<typeof setTimeout> | null = null
    const saveBounds = (): void => {
      console.debug('[WindowManager] saveBounds: scheduling debounce')
      if (boundsTimer) clearTimeout(boundsTimer)
      boundsTimer = setTimeout(() => {
        if (win.isDestroyed()) return
        const isMaximized = win.isMaximized()
        // 只让「第一个非无痕窗口」写回，避免多普通窗口互相覆盖
        const normalWindows = BrowserWindow.getAllWindows().filter((w) => {
          if (w.isDestroyed()) return false
          const inst = globalThis.browserInstances?.get(String(w.id))
          return inst && !inst.isIncognito
        })
        if (normalWindows[0]?.id === win.id) {
          console.debug('[WindowManager] saveBounds: persisted isMaximized', isMaximized)
          settingsManager.set('windowBounds', isMaximized ? null : win.getBounds())
        }
      }, 500)
    }
    win.on('resize', saveBounds)
    win.on('move', saveBounds)
  }

  const devUrl = getRendererDevServerUrl()
  if (devUrl) {
    console.debug('[WindowManager] createWindow: loading dev server url', devUrl)
    void win.loadURL(devUrl)
  } else {
    const indexHtml = getRendererIndexHtml()
    console.debug('[WindowManager] createWindow', indexHtml)
    void win.loadFile(indexHtml)
  }

  const instance: BrowserWindowInstance = {
    window: win,
    tabManager,
    navigationManager,
    settingsManager,
    downloadManager,
    historyManager,
    privacyManager,
    bookmarkManager,
    proxyManager,
    subscriptionManager,
    popoverManager,
    certTrustStore,
    isIncognito,
  }

  // 注册到全局实例表，供 IPC getInstance(event) 按 sender 窗口定位
  globalThis.browserInstances.set(String(win.id), instance)
  // 关闭时反注册，避免残留失效实例
  win.on('closed', () => {
    console.debug(
      '[WindowManager] closed: unregistering instance id=%s isIncognito=%s',
      win.id,
      isIncognito
    )
    globalThis.browserInstances.delete(String(win.id))
    // 最后一个无痕窗口关闭后清空内存 partition 存储（关闭即焚）
    if (isIncognito) {
      const stillIncognito = Array.from(globalThis.browserInstances.values()).some(
        (i) => i.isIncognito
      )
      if (!stillIncognito) {
        console.info('[WindowManager] last incognito window closed: clearing in-memory session')
        void sessionManager.clearIncognitoData()
      }
    }
  })

  return instance
}

/** 兼容旧调用名：创建普通主窗口 */
export function createMainWindow(proxyManager: ProxyManager): BrowserWindowInstance {
  return createWindow({}, proxyManager)
}

/** 应用级共享 ProxyManager，供 openIncognitoWindow 等工厂方法使用 */
let appProxyManager: ProxyManager | null = null

/** 新窗口创建后的钩子（index 注入快捷键绑定等） */
let onWindowReady: ((instance: BrowserWindowInstance) => void) | null = null

/** 在 app 启动时注入共享 ProxyManager */
export function setAppProxyManager(pm: ProxyManager): void {
  console.debug('[WindowManager] setAppProxyManager: set')
  appProxyManager = pm
}

/** 在 app 启动时注入共享 AdBlocker，并挂载到后续创建的每个 session */
export function setAdBlocker(ab: AdBlocker): void {
  console.debug('[WindowManager] setAdBlocker: set')
  appAdBlocker = ab
  // 若 SessionManager 已存在（先建窗口后注入的极端情况），补挂已有 session
  if (sharedSessionManager) {
    sharedSessionManager.setOnSessionReady((sess) => appAdBlocker!.attach(sess))
    for (const name of sharedSessionManager.getPartitions()) {
      appAdBlocker.attach(sharedSessionManager.getSession(name))
    }
  }
}

/** 获取应用级共享广告拦截器（供 IPC 注册使用） */
export function requireAdBlocker(): AdBlocker {
  return requireAdBlockerInternal()
}

/** 注入「窗口就绪」回调（如注册快捷键），open* 工厂会在 bootstrap 后调用 */
export function setOnWindowReady(cb: (instance: BrowserWindowInstance) => void): void {
  console.debug('[WindowManager] setOnWindowReady: set')
  onWindowReady = cb
}

function requireProxyManager(): ProxyManager {
  if (!appProxyManager) {
    throw new Error('[WindowManager] appProxyManager not set; call setAppProxyManager first')
  }
  return appProxyManager
}

function requireAdBlockerInternal(): AdBlocker {
  if (!appAdBlocker) {
    throw new Error('[WindowManager] appAdBlocker not set; call setAdBlocker first')
  }
  return appAdBlocker
}

/**
 * 根据 launchBehavior 为窗口打开首个（批）标签
 * @param launchUrl 若提供则忽略 launchBehavior，直接以该 URL 打开首标签
 */
export function bootstrapWindow(instance: BrowserWindowInstance, launchUrl?: string): void {
  // 无痕窗口：始终只开一个新标签页，永不恢复上次会话
  if (instance.isIncognito) {
    const url = launchUrl || NEW_TAB_URL
    console.info('[WindowManager] bootstrapWindow: incognito url=%s', url)
    instance.tabManager.create({ url, sessionId: 'incognito' })
    return
  }

  const settings = instance.settingsManager
  const launchBehavior = settings.get('launchBehavior') as LaunchBehavior

  if (launchUrl) {
    console.debug('[WindowManager] bootstrapWindow: forced launchUrl', launchUrl)
    instance.tabManager.create({ url: launchUrl })
    return
  }

  if (launchBehavior === 'restore') {
    const savedTabs = settings.get('openTabs')
    const savedActiveIndex = settings.get('activeTabIndex')
    console.debug(
      '[WindowManager] bootstrapWindow: launchBehavior=restore savedTabs',
      savedTabs?.length ?? 0
    )

    if (savedTabs && savedTabs.length > 0) {
      instance.tabManager.restoreTabs(savedTabs, savedActiveIndex ?? 0)
    } else {
      instance.tabManager.create({ url: 'about:blank' })
    }
  } else if (launchBehavior === 'newtab') {
    console.debug('[WindowManager] bootstrapWindow: launchBehavior=newtab')
    instance.tabManager.create({ url: NEW_TAB_URL })
  } else if (launchBehavior === 'homepage') {
    const homepage = settings.get('newTabUrl')
    console.debug('[WindowManager] bootstrapWindow: launchBehavior=homepage url', homepage)
    instance.tabManager.create({ url: homepage || 'about:blank' })
  }
}

/** 新建独立无痕窗口（整窗隔离） */
export function openIncognitoWindow(url?: string): BrowserWindowInstance {
  const target = url || NEW_TAB_URL
  console.info('[WindowManager] openIncognitoWindow: url=%s', target)
  const instance = createWindow({ incognito: true, launchUrl: target }, requireProxyManager())
  bootstrapWindow(instance, target)
  onWindowReady?.(instance)
  return instance
}

/** 新建普通浏览器窗口 */
export function openNormalWindow(url?: string): BrowserWindowInstance {
  const target = url || NEW_TAB_URL
  console.info('[WindowManager] openNormalWindow: url=%s', target)
  const instance = createWindow({ launchUrl: target }, requireProxyManager())
  bootstrapWindow(instance, target)
  onWindowReady?.(instance)
  return instance
}
