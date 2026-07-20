import type { InterceptorRule } from '@browser/ipc-contract'
import { ProxyManager, resolveProxyConfigDir, type TrafficData } from '@browser/proxy'
import { app, BrowserWindow, Menu } from 'electron'
import { AdBlocker } from './ad-blocker'
import { registerDefaultBrowserHandlers } from './default-browser'
import { initVueDevToolsPath } from './devtools'
import { initNativeMenu, registerIpcHandlers } from './ipc/register'
import { initLogger, startLogRotation } from './logger'
import { RequestCapturer } from './request-interceptor'
import { SettingsManager } from './settings-manager'
import { registerAppShortcut, toggleDevTools } from './shortcut'
import { SHORTCUT_REGISTRY } from './shortcut-registry'
import { updater } from './updater'
import type { BrowserWindowInstance } from './window-manager'
import {
  bootstrapWindow,
  createWindow,
  openIncognitoWindow,
  openNormalWindow,
  setAdBlocker,
  setAppProxyManager,
  setOnWindowReady,
  setRequestCapturer,
} from './window-manager'

// 单实例锁：设为默认浏览器后，系统点击链接会尝试启动新实例，
// 由 second-instance 在已有实例中接管并打开链接；无锁则无法正确接收链接。
if (!app.requestSingleInstanceLock()) {
  app.quit()
  // 阻止后续逻辑在已退出实例上继续执行
  throw new Error('Another instance is already running')
}

// 尽早覆写 console，使后续日志统一走文件落盘
initLogger()

// 注册协议唤起监听（open-url / second-instance），需在 ready 前注册
registerDefaultBrowserHandlers(() => globalThis.browserInstances)

declare global {
  var browserInstances: Map<string, BrowserWindowInstance>
}
globalThis.browserInstances = new Map()

/**
 * 全应用共享的代理管理器：所有窗口复用同一 Mihomo 核心进程，
 * 避免多窗口各自启动一个代理进程互相抢占端口。
 */
const proxyManager = new ProxyManager(resolveProxyConfigDir(app.getPath('userData')))
setAppProxyManager(proxyManager)

/** 全应用共享广告拦截器：基于 session.webRequest.onBeforeRequest 拦截广告/追踪请求 */
const adBlocker = AdBlocker.getInstance(SettingsManager.getInstance())
setAdBlocker(adBlocker)

/** 全应用共享请求拦截器：捕获所有请求并推送到 wmfx://interceptor 页面 */
const requestCapturer = new RequestCapturer(
  () => (SettingsManager.getInstance().get('interceptorRules') as InterceptorRule[]) ?? []
)
setRequestCapturer(requestCapturer)

function saveSessionState(instance: BrowserWindowInstance): void {
  // 无痕窗口不落盘会话与窗口尺寸
  if (instance.isIncognito) {
    console.debug('[App] saveSessionState: skip incognito window id=%s', instance.window.id)
    return
  }
  const tabs = instance.tabManager.serializeTabs()
  const activeIndex = instance.tabManager.getActiveTabIndex()
  const bounds = instance.window.getBounds()
  const isMaximized = instance.window.isMaximized()

  instance.settingsManager.set('openTabs', tabs)
  instance.settingsManager.set('activeTabIndex', activeIndex)
  // 仅首个普通窗口持久化尺寸，避免多窗口互相覆盖
  const normalWindows = BrowserWindow.getAllWindows().filter((w) => {
    if (w.isDestroyed()) return false
    const inst = globalThis.browserInstances.get(String(w.id))
    return inst && !inst.isIncognito
  })
  if (normalWindows[0]?.id === instance.window.id) {
    instance.settingsManager.set('windowBounds', isMaximized ? null : bounds)
  }
}

function saveAllSessionStates(): void {
  for (const instance of globalThis.browserInstances.values()) {
    saveSessionState(instance)
  }
}

/**
 * 关闭空窗口（关末标签时调用）：只关当前窗口，不退出应用。
 */
function closeWindowIfEmpty(instance: BrowserWindowInstance): void {
  if (instance.tabManager.getList().length > 0) return
  console.info(
    '[App] closeWindowIfEmpty: closing empty window id=%s isIncognito=%s',
    instance.window.id,
    instance.isIncognito
  )
  if (!instance.window.isDestroyed()) {
    instance.window.close()
  }
}

/**
 * 为窗口注册应用级快捷键。
 * 每个窗口各自在 focus/blur 时 register/unregister，切换窗口时由目标窗重新注册。
 */
function wireWindowShortcuts(instance: BrowserWindowInstance): void {
  const win = instance.window
  console.debug('[App] wireWindowShortcuts: windowId=%s', win.id)

  // 按 id 分发 action 回调（回调保留原 index.ts 逻辑，不进注册表）
  const actions: Record<string, () => void> = {
    find: () => {
      const focused = BrowserWindow.getFocusedWindow()
      if (!focused) return
      const inst = globalThis.browserInstances.get(String(focused.id))
      if (!inst) return
      const activeTabId = inst.tabManager.getActiveTabId()
      if (!activeTabId) return
      focused.webContents.send('page:openFind', activeTabId)
    },
    'focus-url': () => {
      const focused = BrowserWindow.getFocusedWindow()
      if (!focused) return
      focused.webContents.send('shell:focusAddressBar')
    },
    'devtools-page': () => {
      const focused = BrowserWindow.getFocusedWindow()
      const inst = focused
        ? globalThis.browserInstances.get(String(focused.id))
        : globalThis.browserInstances.get(String(win.id))
      if (!inst) return
      const activeTabId = inst.tabManager.getActiveTabId()
      if (!activeTabId) return
      const wc = inst.tabManager.getWebContents(activeTabId)
      if (!wc) return
      if (wc.isDevToolsOpened()) wc.closeDevTools()
      else wc.openDevTools()
    },
    'devtools-app': () => {
      const focused = BrowserWindow.getFocusedWindow()
      if (!focused) return
      const inst = globalThis.browserInstances.get(String(focused.id))
      if (!inst) return
      toggleDevTools(inst.window, inst.window.webContents)
    },
    'close-tab': () => {
      const focused = BrowserWindow.getFocusedWindow()
      if (!focused) return
      const inst = globalThis.browserInstances.get(String(focused.id))
      if (!inst) return
      const activeTabId = inst.tabManager.getActiveTabId()
      if (!activeTabId) return
      inst.tabManager.close(activeTabId)
      closeWindowIfEmpty(inst)
    },
    reload: () => {
      const focused = BrowserWindow.getFocusedWindow()
      if (!focused) return
      const inst = globalThis.browserInstances.get(String(focused.id))
      if (!inst) return
      const activeTabId = inst.tabManager.getActiveTabId()
      if (!activeTabId) return
      inst.navigationManager.reload(activeTabId)
    },
    'reopen-tab': () => {
      const focused = BrowserWindow.getFocusedWindow()
      if (!focused) return
      const inst = globalThis.browserInstances.get(String(focused.id))
      if (!inst) return
      inst.tabManager.reopenClosed()
    },
    'new-incognito': () => {
      console.debug('[App] shortcut: new incognito window')
      openIncognitoWindow()
    },
    'new-window': () => {
      console.debug('[App] shortcut: new normal window')
      openNormalWindow()
    },
  }

  for (const def of SHORTCUT_REGISTRY) {
    if (def.scope !== 'in-app') continue
    const cb = actions[def.id]
    if (!cb) {
      console.warn('[App] wireWindowShortcuts: 注册表有定义但缺少 action 回调，id=%s', def.id)
      continue
    }
    registerAppShortcut(win, def.accelerator, cb)
  }
}

// 新窗口（含 IPC / 快捷键创建）统一走此回调绑定快捷键
setOnWindowReady((instance) => {
  wireWindowShortcuts(instance)
})

app.whenReady().then(async () => {
  console.debug('[App] whenReady: app starting')
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
  }

  initVueDevToolsPath()
  // 启动兜底归档 + 清理（删掉已归档旧行）完成后，应用才正式可用
  await startLogRotation()
  registerIpcHandlers()

  updater.init()

  try {
    await proxyManager.start()
  } catch (e) {
    console.warn('Mihomo proxy failed to start:', e)
  }

  // 广播代理流量到所有窗口
  proxyManager.onData((data: TrafficData) => {
    for (const inst of globalThis.browserInstances.values()) {
      try {
        inst.window.webContents.send('proxy:traffic', data)
      } catch {
        /* webContents 已销毁 */
      }
    }
  })

  const mainWindow = createWindow({}, proxyManager)
  initNativeMenu(mainWindow.window)
  mainWindow.settingsManager.setNativeTheme()
  bootstrapWindow(mainWindow)
  wireWindowShortcuts(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = createWindow({}, proxyManager)
      bootstrapWindow(win)
      wireWindowShortcuts(win)
    }
  })
})

app.on('before-quit', () => {
  saveAllSessionStates()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  console.debug('[App] will-quit: stopping proxy')
  proxyManager.stop()
})

const cleanupProxy = () => {
  console.debug('[App] signal received: stopping proxy before exit')
  proxyManager.stop()
}
process.on('SIGINT', cleanupProxy)
process.on('SIGTERM', cleanupProxy)
