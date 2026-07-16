/**
 * 默认浏览器管理 — 交互对齐 Chrome 的「设置为默认浏览器」
 *
 * 设计原则：
 * - 用 Electron 原生的 app.setAsDefaultProtocolClient 注册 http/https 协议，
 *   这是 Electron 下让应用接管系统 http(s) 链接的标准做法（macOS 写 LSRegister、
 *   Windows 写注册表、Linux 写 .desktop 并置为默认）。
 * - 注册后，其它应用/系统点击链接会唤起本应用，通过 open-url（macOS）
 *   或 second-instance（Windows/Linux，因启用单实例锁，链接作为参数传入）接收，
 *   统一在新标签页打开。
 * - 仅打包后生效：开发期 setAsDefaultProtocolClient 在 macOS 会失败并告警，
 *   属预期行为，UI 会如实反映结果。
 */
import { app, BrowserWindow } from 'electron'

import type { BrowserWindowInstance } from './window-manager'

/** 接管 http/https 才能成为系统默认浏览器 */
const SCHEMES = ['http', 'https'] as const

/** 在已有窗口的新标签页打开外部链接（聚焦到该窗口）。 */
function openUrlInNewTab(url: string, instances: Map<string, BrowserWindowInstance>): void {
  for (const inst of instances.values()) {
    inst.tabManager.create({ url, activate: true })
  }
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
}

/** 注册协议唤起监听（open-url / second-instance）。需在 app ready 前注册。 */
export function registerDefaultBrowserHandlers(
  getInstances: () => Map<string, BrowserWindowInstance>
): void {
  // macOS：系统通过 open-url 把链接交给已运行的应用
  app.on('open-url', (_event, url) => {
    if (/^https?:\/\//i.test(url)) openUrlInNewTab(url, getInstances())
  })

  // Windows / Linux：设为默认浏览器后点击链接会启动新实例，
  // 因启用单实例锁，新实例被扼杀、参数由本回调在已有实例中处理
  app.on('second-instance', (_event, argv) => {
    const url = argv.find((a) => /^https?:\/\//i.test(a))
    if (url) openUrlInNewTab(url, getInstances())
  })
}

/** 设为默认浏览器：注册 http/https 协议，返回是否全部成功。 */
export function setAsDefaultBrowser(): { success: boolean; error?: string } {
  try {
    let ok = true
    for (const scheme of SCHEMES) {
      if (!app.setAsDefaultProtocolClient(scheme)) ok = false
    }
    return { success: ok }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

/** 是否已设为默认浏览器（http/https 均注册才算）。 */
export function isDefaultBrowser(): boolean {
  return SCHEMES.every((s) => app.isDefaultProtocolClient(s))
}
