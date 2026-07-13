import { app, BrowserWindow, Menu, nativeTheme } from 'electron'
import { registerIpcHandlers } from './ipc/register'
import { initLogger, startLogRotation } from './logger'
import { registerAppShortcut, toggleDevTools } from './shortcut'
import { updater } from './updater'
import type { BrowserWindowInstance } from './window-manager'
import { createMainWindow } from './window-manager'

// 尽早覆写 console，使后续日志统一走文件落盘
initLogger()

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

app.whenReady().then(async () => {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
  }

  // 启动兜底归档 + 清理（删掉已归档旧行）完成后，应用才正式可用
  await startLogRotation()
  registerIpcHandlers()

  // 启动自动更新检查（仅打包后生效，开发模式跳过）
  updater.init()

  const mainWindow = createMainWindow()
  globalThis.browserInstances.set(String(mainWindow.window.id), mainWindow)

  const theme = mainWindow.settingsManager.get('theme')
  if (theme === 'dark') {
    nativeTheme.themeSource = 'dark'
  } else if (theme === 'light') {
    nativeTheme.themeSource = 'light'
  }

  const savedTabs = mainWindow.settingsManager.get('openTabs')
  const savedActiveIndex = mainWindow.settingsManager.get('activeTabIndex')

  if (savedTabs && savedTabs.length > 0) {
    mainWindow.tabManager.restoreTabs(savedTabs, savedActiveIndex ?? 0)
  } else {
    mainWindow.tabManager.create({ url: 'about:blank' })
  }

  // Start mihomo proxy
  try {
    await mainWindow.proxyManager?.start()
  } catch (e) {
    console.warn('Mihomo proxy failed to start:', e)
  }
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

  // Cmd/Ctrl+F12 打开/关闭 mainWindow 本身的 DevTools
  registerAppShortcut(mainWindow.window, 'CmdOrCtrl+F12', () => {
    toggleDevTools(mainWindow.window)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = createMainWindow()
      globalThis.browserInstances.set(String(win.window.id), win)
      win.tabManager.create({ url: 'about:blank' })
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
  for (const instance of globalThis.browserInstances.values()) {
    instance.proxyManager?.stop()
  }
})
