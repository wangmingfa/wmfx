import { BrowserWindow, Menu, shell } from 'electron'

declare global {
  var browserInstances: Map<string, import('./window-manager').BrowserWindowInstance>
}

function getFocusedInstance() {
  const focused = BrowserWindow.getFocusedWindow()
  if (!focused) return null
  return globalThis.browserInstances?.get(String(focused.id)) ?? null
}

function getActiveTabWebContents() {
  const inst = getFocusedInstance()
  if (!inst) return null
  const tabId = inst.tabManager.getActiveTabId()
  if (!tabId) return null
  return inst.tabManager.getWebContents(tabId) ?? null
}

const isMac = process.platform === 'darwin'

export function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            const inst = getFocusedInstance()
            inst?.tabManager.create({ url: 'about:blank' })
          },
        },
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            const { createMainWindow } = require('./window-manager')
            const win = createMainWindow()
            globalThis.browserInstances.set(String(win.window.id), win)
            win.tabManager.create({ url: 'about:blank' })
          },
        },
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            const inst = getFocusedInstance()
            if (!inst) return
            const tabId = inst.tabManager.getActiveTabId()
            if (tabId) inst.tabManager.close(tabId)
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            const wc = getActiveTabWebContents()
            wc?.reload()
          },
        },
        {
          label: 'Force Reload',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            const wc = getActiveTabWebContents()
            if (wc) wc.reloadIgnoringCache()
          },
        },
        { type: 'separator' },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: () => {
            const wc = getActiveTabWebContents()
            if (wc) wc.setZoomFactor(wc.getZoomFactor() + 0.1)
          },
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            const wc = getActiveTabWebContents()
            if (wc) wc.setZoomFactor(wc.getZoomFactor() - 0.1)
          },
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            const wc = getActiveTabWebContents()
            if (wc) wc.setZoomFactor(1)
          },
        },
        { type: 'separator' },
        {
          label: 'Toggle DevTools',
          accelerator: 'F12',
          click: () => {
            const focused = BrowserWindow.getFocusedWindow()
            if (!focused) return
            const inst = globalThis.browserInstances?.get(String(focused.id))
            if (!inst) return
            const tabId = inst.tabManager.getActiveTabId()
            if (!tabId) return
            const wc = inst.tabManager.getWebContents(tabId)
            if (!wc) return
            if (wc.isDevToolsOpened()) wc.closeDevTools()
            else wc.openDevTools()
          },
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        {
          label: 'Toggle Window',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (!win) return
            if (win.isMaximized()) win.unmaximize()
            else win.maximize()
          },
        },
        ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : []),
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'About',
          click: () => {
            shell.openExternal('https://github.com/anomalyco/opencode')
          },
        },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
