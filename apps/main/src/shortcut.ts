import { type BrowserWindow, globalShortcut, type WebContents } from 'electron'

export function registerAppShortcut(
  win: BrowserWindow,
  accelerator: Electron.Accelerator,
  callback: () => void
) {
  console.debug('[Shortcut] registerAppShortcut: win accelerator', win.id, accelerator)
  if (String(accelerator).toUpperCase() === 'F12') {
    win.on('focus', () => {
      console.debug('[Shortcut] F12 focus: registering')
      globalShortcut.register('F12', callback)
    })
    win.on('blur', () => {
      console.debug('[Shortcut] F12 blur: unregistering')
      globalShortcut.unregister('F12')
    })
    win.on('closed', () => {
      console.debug('[Shortcut] F12 closed: unregistering')
      globalShortcut.unregister('F12')
    })
    if (win.isFocused()) {
      globalShortcut.register('F12', callback)
    }
    return
  }

  const register = () => {
    console.debug('[Shortcut] focus: registering accelerator', accelerator)
    globalShortcut.register(accelerator, callback)
  }
  const unregister = () => {
    console.debug('[Shortcut] blur/closed: unregistering accelerator', accelerator)
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
  target: WebContents,
  restoreSize?: { width: number; height: number }
): void {
  console.debug('[Shortcut] toggleDevTools: win opened', win.id, target.isDevToolsOpened())
  if (target.isDevToolsOpened()) {
    target.closeDevTools()
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
    // 在标签页的 WebContentsView 上打开 DevTools，Vue DevTools 扩展才会注入到 Vue 运行的页面
    target.openDevTools({ mode: 'bottom' })
  }
}
