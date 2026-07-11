import { type BrowserWindow, globalShortcut } from 'electron'

export function registerAppShortcut(
  win: BrowserWindow,
  accelerator: Electron.Accelerator,
  callback: () => void
) {
  if (String(accelerator).toUpperCase() === 'F12') {
    win.on('focus', () => {
      globalShortcut.register('F12', callback)
    })
    win.on('blur', () => {
      globalShortcut.unregister('F12')
    })
    win.on('closed', () => {
      globalShortcut.unregister('F12')
    })
    if (win.isFocused()) {
      globalShortcut.register('F12', callback)
    }
    return
  }

  const register = () => {
    globalShortcut.register(accelerator, callback)
  }
  const unregister = () => {
    globalShortcut.unregister(accelerator)
  }

  win.on('focus', register)
  win.on('blur', unregister)
  win.on('closed', unregister)

  if (win.isFocused()) {
    register()
  }
}

const originalSizes = new WeakMap<BrowserWindow, { width: number; height: number }>()

export function toggleDevTools(
  win: BrowserWindow,
  restoreSize?: { width: number; height: number }
): void {
  if (win.webContents.isDevToolsOpened()) {
    win.webContents.closeDevTools()
    const saved = restoreSize || originalSizes.get(win)
    if (saved) {
      win.setSize(saved.width, saved.height)
      win.center()
      originalSizes.delete(win)
    }
  } else {
    const [w, h] = win.getSize()
    if (w < 1200 || h < 800) {
      originalSizes.set(win, { width: w, height: h })
      win.setSize(1200, 800)
      win.center()
    }
    win.webContents.openDevTools({ mode: 'bottom' })
  }
}
