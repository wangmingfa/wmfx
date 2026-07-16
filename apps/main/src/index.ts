import { app, BrowserWindow, Menu } from 'electron'
import { registerDefaultBrowserHandlers } from './default-browser'
import { registerIpcHandlers } from './ipc/register'
import { initLogger, startLogRotation } from './logger'
import { registerAppShortcut, toggleDevTools } from './shortcut'
import { updater } from './updater'
import type { BrowserWindowInstance } from './window-manager'
import { createMainWindow } from './window-manager'

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

function saveSessionState(instance: BrowserWindowInstance): void {
  const tabs = instance.tabManager.serializeTabs()
  const activeIndex = instance.tabManager.getActiveTabIndex()
  const bounds = instance.window.getBounds()
  const isMaximized = instance.window.isMaximized()

  instance.settingsManager.set('openTabs', tabs)
  instance.settingsManager.set('activeTabIndex', activeIndex)
  instance.settingsManager.set('windowBounds', isMaximized ? null : bounds)
}

function saveAllSessionStates(): void {
  for (const instance of globalThis.browserInstances.values()) {
    saveSessionState(instance)
  }
}

function bootstrapWindow(instance: BrowserWindowInstance): void {
  globalThis.browserInstances.set(String(instance.window.id), instance)

  const savedTabs = instance.settingsManager.get('openTabs')
  const savedActiveIndex = instance.settingsManager.get('activeTabIndex')
  console.debug('[App] bootstrapWindow: savedTabs=%d', savedTabs?.length ?? 0)

  // 关窗时由 TabManager.destroy() 落盘会话（必须在清空 tabs 之前），此处不再重复注册。

  if (savedTabs && savedTabs.length > 0) {
    instance.tabManager.restoreTabs(savedTabs, savedActiveIndex ?? 0)
  } else {
    instance.tabManager.create({ url: 'about:blank' })
  }
}

app.whenReady().then(async () => {
  console.debug('[App] whenReady: app starting')
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
  }

  // 启动兜底归档 + 清理（删掉已归档旧行）完成后，应用才正式可用
  await startLogRotation()
  registerIpcHandlers()

  // 启动自动更新检查（仅打包后生效，开发模式跳过）
  updater.init()

  const mainWindow = createMainWindow()

  mainWindow.settingsManager.setNativeTheme()

  bootstrapWindow(mainWindow)

  // Start mihomo proxy
  try {
    await mainWindow.proxyManager?.start()
  } catch (e) {
    console.warn('Mihomo proxy failed to start:', e)
  }

  // 广播代理流量数据到渲染进程
  mainWindow.proxyManager?.onData((data) => {
    mainWindow.window.webContents.send('proxy:traffic', data)
  })
  // F12 打开/关闭当前标签页 DevTools
  registerAppShortcut(mainWindow.window, 'F12', () => {
    const focused = BrowserWindow.getFocusedWindow()
    if (!focused) {
      toggleDevTools(mainWindow.window)
      return
    }
    const inst = globalThis.browserInstances.get(String(focused.id))
    if (!inst) return
    const activeTabId = inst.tabManager.getActiveTabId()
    if (!activeTabId) return
    const wc = inst.tabManager.getWebContents(activeTabId)
    if (!wc) return
    if (wc.isDevToolsOpened()) {
      wc.closeDevTools()
    } else {
      wc.openDevTools()
    }
  })

  // Cmd/Ctrl+F 打开当前标签页的页内查找栏。
  // 用窗口级快捷键而非网页 view 的 before-input-event：只要应用在前台，
  // 无论焦点在网页、地址栏还是其它 shell 区域都能触发，体验一致。
  registerAppShortcut(mainWindow.window, 'CmdOrCtrl+F', () => {
    const focused = BrowserWindow.getFocusedWindow()
    if (!focused) return
    const inst = globalThis.browserInstances.get(String(focused.id))
    if (!inst) return
    const activeTabId = inst.tabManager.getActiveTabId()
    if (!activeTabId) return
    focused.webContents.send('page:openFind', activeTabId)
  })

  // Cmd/Ctrl+L 聚焦地址栏（类 Chrome）。窗口级快捷键，焦点在任意区域均可触发。
  registerAppShortcut(mainWindow.window, 'CmdOrCtrl+L', () => {
    const focused = BrowserWindow.getFocusedWindow()
    if (!focused) return
    focused.webContents.send('shell:focusAddressBar')
  })

  // Cmd/Ctrl+F12 打开/关闭 mainWindow 本身的 DevTools
  registerAppShortcut(mainWindow.window, 'CmdOrCtrl+F12', () => {
    toggleDevTools(mainWindow.window)
  })

  // Cmd/Ctrl+W 关闭当前标签页（最后一个标签则关闭窗口）
  registerAppShortcut(mainWindow.window, 'CmdOrCtrl+W', () => {
    const focused = BrowserWindow.getFocusedWindow()
    if (!focused) return
    const inst = globalThis.browserInstances.get(String(focused.id))
    if (!inst) return
    const activeTabId = inst.tabManager.getActiveTabId()
    if (!activeTabId) return
    inst.tabManager.close(activeTabId)
    if (inst.tabManager.getList().length === 0) {
      app.quit()
    }
  })

  // F5 刷新当前标签页网页（与地址栏刷新按钮同逻辑）
  registerAppShortcut(mainWindow.window, 'F5', () => {
    const focused = BrowserWindow.getFocusedWindow()
    if (!focused) return
    const inst = globalThis.browserInstances.get(String(focused.id))
    if (!inst) return
    const activeTabId = inst.tabManager.getActiveTabId()
    if (!activeTabId) return
    inst.navigationManager.reload(activeTabId)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      bootstrapWindow(createMainWindow())
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
  for (const instance of globalThis.browserInstances.values()) {
    instance.proxyManager?.stop()
  }
})
