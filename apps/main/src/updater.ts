/**
 * 自动更新管理器 — 基于 electron-updater + GitHub Releases
 *
 * 设计原则：
 * - 仅在打包后（app.isPackaged）生效，开发期跳过，避免本地频繁请求更新
 * - electron-updater 负责版本比对、增量下载与退出时静默安装
 * - 状态变更通过 onStatus 回调广播给所有渲染进程窗口（见 ipc/register.ts）
 * - GitHub Releases 作为分发源，发布需在 CI 中执行 electron-builder --publish
 */
import type { UpdateInfo, UpdaterStatus } from '@browser/ipc-contract'
import { app } from 'electron'
import type { ProgressInfo } from 'electron-updater'
import { autoUpdater } from 'electron-updater'

// AppUpdater.on() 在新版 electron-updater 里运行时尚存在但类型未暴露；
// 用 as any 桥接字符串事件，并用 signals API 获取类型安全的 progress 回调。
// biome-ignore lint/suspicious/noExplicitAny: electron-updater 未暴露 AppUpdater.on() 类型
const au = autoUpdater as any

/** 把 electron-updater 的事件载荷映射到我们的 UpdateInfo */
function adaptInfo(raw: unknown): UpdateInfo {
  const r = raw as {
    version?: string
    releaseDate?: string | Date
    releaseName?: string | null
    // biome-ignore lint/suspicious/noExplicitAny: releaseNotes 结构未定义，any 是合理选择
    releaseNotes?: any
  }
  return {
    version: String(r.version ?? 'unknown'),
    releaseDate: r.releaseDate
      ? r.releaseDate instanceof Date
        ? r.releaseDate.toISOString()
        : String(r.releaseDate)
      : '',
    releaseName: r.releaseName ?? null,
    releaseNotes: r.releaseNotes,
  }
}

type Listener = (status: UpdaterStatus) => void

class UpdaterManager {
  /** 当前更新状态，渲染进程首次连接时回放 */
  private status: UpdaterStatus = { state: 'idle' }
  /** 状态订阅者（由 ipc/register.ts 注入，用于广播到渲染进程） */
  private listeners = new Set<Listener>()

  /** 应用就绪后调用：注册事件并立即检查一次更新 */
  init(): void {
    if (!app.isPackaged) {
      console.info('[updater] 开发模式跳过自动更新')
      return
    }

    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = null

    // 无类型的事件直接用 on()
    au.on('checking-for-update', () => this.set({ state: 'checking' }))
    au.on('update-available', (raw: unknown) =>
      this.set({ state: 'available', info: adaptInfo(raw) })
    )
    au.on('update-not-available', () => this.set({ state: 'not-available' }))
    au.on('error', (e: Error) => this.set({ state: 'error', message: e.message }))

    // signals API 提供类型安全的 progress
    autoUpdater.signals.progress((p: ProgressInfo) =>
      this.set({ state: 'downloading', percent: p.percent })
    )
    // updateDownloaded 事件体本身就是 UpdateInfo 的超集
    au.on('update-downloaded', (raw: unknown) =>
      this.set({ state: 'downloaded', info: adaptInfo(raw) })
    )

    // 启动时静默检查，有更新则自动下载
    autoUpdater.checkForUpdatesAndNotify().catch((e: Error) => {
      console.warn('[updater] 检查更新失败:', e)
    })
  }

  /** 供渲染进程手动触发检查 */
  checkForUpdates(): void {
    console.debug('[updater] checkForUpdates')
    if (!app.isPackaged) return
    autoUpdater.checkForUpdatesAndNotify().catch((e: Error) => {
      this.set({ state: 'error', message: e.message })
    })
  }

  /** 返回当前状态快照 */
  getStatus(): UpdaterStatus {
    return this.status
  }

  /** 退出应用并安装已下载好的更新（下载完成后由关于页「重启更新」按钮触发） */
  restartAndInstall(): void {
    console.debug('[updater] restartAndInstall')
    if (!app.isPackaged) return
    autoUpdater.quitAndInstall()
  }

  /** 注册状态监听，返回取消函数 */
  onStatus(cb: Listener): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private set(status: UpdaterStatus): void {
    this.status = status
    console.info(`[updater] 状态变更: ${status.state}`)
    for (const l of this.listeners) l(status)
  }
}

export const updater = new UpdaterManager()
