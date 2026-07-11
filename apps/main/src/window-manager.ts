import { BrowserWindow } from 'electron'
import { getPreloadPath, getRendererDevServerUrl, getRendererIndexHtml } from './paths'

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.once('ready-to-show', () => win.show())

  const devUrl = getRendererDevServerUrl()
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(getRendererIndexHtml())
  }

  return win
}
