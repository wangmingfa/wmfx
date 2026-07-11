import { app, BrowserWindow, nativeTheme } from 'electron'
import { registerIpcHandlers } from './ipc/register'
import { registerAppShortcut, toggleDevTools } from './shortcut'
import type { BrowserWindowInstance } from './window-manager'
import { createMainWindow } from './window-manager'

declare global {
  var browserInstances: Map<string, BrowserWindowInstance>
}
globalThis.browserInstances = new Map()

app.whenReady().then(() => {
  registerIpcHandlers()

  const mainWindow = createMainWindow()
  globalThis.browserInstances.set(String(mainWindow.window.id), mainWindow)

  const theme = mainWindow.settingsManager.get('theme')
  if (theme === 'dark') {
    nativeTheme.themeSource = 'dark'
  } else if (theme === 'light') {
    nativeTheme.themeSource = 'light'
  }

  mainWindow.tabManager.create({ url: 'about:blank' })
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
