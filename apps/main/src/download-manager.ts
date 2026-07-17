import fs from 'node:fs'
import path from 'node:path'
import type { DownloadRepository, DownloadState } from '@wmfx/database'
import {
  app,
  type BrowserWindow,
  type DownloadItem as ElectronDownloadItem,
  Notification,
  type Session,
  session,
  shell,
} from 'electron'
import type { SettingsManager } from './settings-manager'
import type { TabManager } from './tab-manager'

/** 可能存在安全风险的文件扩展名列表 */
const DANGEROUS_EXTENSIONS = new Set([
  '.exe',
  '.msi',
  '.bat',
  '.cmd',
  '.ps1',
  '.vbs',
  '.scr',
  '.com',
  '.pif',
  '.reg',
  '.chm',
])

export class DownloadManager {
  private activeDownloads = new Map<
    string,
    { download: ElectronDownloadItem; receiver: () => void }
  >()

  /**
   * @param tabSession — 选项卡实际使用的 session（`persist:default` / `persist:incognito`），
   *   必须在此 session 上监听 will-download，否则 Electron 会走原生 Save As 对话框。
   * @param tabManager — 用于通过 WebContents 反查 tab 并关闭触发下载的标签页。
   */
  constructor(
    private window: BrowserWindow,
    private repo: DownloadRepository,
    private settingsManager: SettingsManager,
    private tabSession?: Session,
    private tabManager?: TabManager
  ) {
    console.debug('[DownloadManager] constructor: window initialized')
    this.setupDownloadHandler()
  }

  private setupDownloadHandler(): void {
    const target = this.tabSession ?? session.defaultSession
    console.debug(
      '[DownloadManager] setupDownloadHandler: registering will-download on partition',
      (target as { partition?: string }).partition || '(defaultSession)'
    )
    target.on('will-download', (_e, downloadItem, triggeringWebContents) => {
      const url = downloadItem.getURL()
      const filename = downloadItem.getFilename()
      console.debug(`[DownloadManager] will-download: url=${url}, filename=${filename}`)
      const defaultPath = this.getDefaultPath()

      // 生成唯一文件名，避免重名覆盖：file.pdf → file (1).pdf → file (2).pdf ...
      const savePath = this.uniquePath(path.join(defaultPath, filename))

      // 创建下载记录
      const id = this.repo.create({
        url,
        filename: path.basename(savePath),
        path: savePath,
        state: 'downloading',
        received_bytes: 0,
        total_bytes: downloadItem.getTotalBytes(),
        error_msg: null,
      })

      downloadItem.setSavePath(savePath)

      // will-download 第三参数 triggeringWebContents 是触发下载的标签页 WebContents，
      // 下载完成后通过 tabManager.close() 关闭该标签（不关主窗口）
      if (this.tabManager && triggeringWebContents && !triggeringWebContents.isDestroyed()) {
        const tabId = this.tabManager.getTabIdByWebContents(triggeringWebContents)
        if (tabId) {
          console.debug('[DownloadManager] will close tab after download', tabId)
          downloadItem.once('done', () => {
            console.debug('[DownloadManager] closing triggering tab', tabId)
            this.tabManager?.close(tabId)
          })
        }
      }

      // 监听进度
      downloadItem.on('updated', (_e, state) => {
        console.debug(
          `[DownloadManager] updated: id=${id}, state=${state}, received=${downloadItem.getReceivedBytes()}`
        )
        if (state === 'progressing') {
          const progress = downloadItem.getReceivedBytes()
          const total = downloadItem.getTotalBytes()
          this.update(id, { received_bytes: progress, total_bytes: total })
          this.broadcastProgress({
            id,
            state: 'downloading',
            receivedBytes: progress,
            totalBytes: total,
          })
        } else if (state === 'interrupted') {
          this.update(id, { state: 'paused' })
        }
      })

      downloadItem.on('done', (_e, state) => {
        console.debug(`[DownloadManager] done: id=${id}, state=${state}`)
        if (state === 'completed') {
          this.update(id, { state: 'completed' })
          this.broadcastProgress({
            id,
            state: 'completed',
            receivedBytes: downloadItem.getTotalBytes(),
            totalBytes: downloadItem.getTotalBytes(),
          })
          // 下载完成通知
          this.notifyComplete(filename, savePath)
        } else {
          this.update(id, {
            state: 'error',
            error_msg: state === 'cancelled' ? 'User cancelled' : 'Download failed',
          })
          this.broadcastProgress({
            id,
            state: 'error',
            receivedBytes: 0,
            totalBytes: downloadItem.getTotalBytes(),
          })
        }
        this.activeDownloads.delete(id)
      })

      this.activeDownloads.set(id, { download: downloadItem, receiver: () => {} })
    })
  }

  /** 如果文件已存在，自动追加序号：file.pdf → file (1).pdf → file (2).pdf ... */
  private uniquePath(p: string): string {
    if (!fs.existsSync(p)) return p
    const ext = path.extname(p)
    const base = path.basename(p, ext)
    const dir = path.dirname(p)
    let i = 1
    while (fs.existsSync(path.join(dir, `${base} (${i})${ext}`))) i++
    return path.join(dir, `${base} (${i})${ext}`)
  }

  create(_opts: { url: string; filename?: string; path?: string }): { id: string } {
    console.debug(`[DownloadManager] create: url=${_opts.url}, filename=${_opts.filename}`)
    // 通过 Electron downloadItem 创建下载（实际下载由 will-download 处理）
    // 这里返回一个占位 ID，实际创建由 will-download 事件触发
    return {
      id: this.repo.create({
        url: _opts.url,
        filename: _opts.filename ?? 'unknown',
        path: '',
        state: 'pending',
        received_bytes: 0,
        total_bytes: 0,
        error_msg: null,
      }),
    }
  }

  pause(id: string): void {
    console.debug(`[DownloadManager] pause: id=${id}`)
    const active = this.activeDownloads.get(id)
    if (active) {
      active.download.pause()
      this.update(id, { state: 'paused' })
    }
  }

  resume(id: string): void {
    console.debug(`[DownloadManager] resume: id=${id}`)
    const active = this.activeDownloads.get(id)
    if (active) {
      active.download.resume()
      this.update(id, { state: 'downloading' })
    }
  }

  cancel(id: string): void {
    console.debug(`[DownloadManager] cancel: id=${id}`)
    const active = this.activeDownloads.get(id)
    if (active) {
      active.download.cancel()
      this.update(id, { state: 'cancelled', error_msg: 'User cancelled' })
    }
  }

  get(id: string): ReturnType<DownloadRepository['getById']> {
    console.debug('[DownloadManager] get: id', id)
    return this.repo.getById(id)
  }

  delete(id: string): boolean {
    console.debug('[DownloadManager] delete: id', id)
    return this.repo.delete(id)
  }

  getList(opts?: { state?: DownloadState; limit?: number; offset?: number }) {
    console.debug('[DownloadManager] getList: opts', JSON.stringify(opts ?? null))
    return this.repo.getList(opts)
  }

  setPath(_path: string): void {
    console.debug('[DownloadManager] setPath: ignored (persisted in SettingsManager)')
    // 路径设置保存在 SettingsManager 中
  }

  private update(
    id: string,
    updates: {
      state?: DownloadState
      received_bytes?: number
      total_bytes?: number
      error_msg?: string | null
    }
  ): void {
    console.debug('[DownloadManager] update: id updates', id, JSON.stringify(updates))
    this.repo.update(id, updates)
  }

  private getDefaultPath(): string {
    const p = this.settingsManager.get('downloadPath') || app.getPath('downloads')
    console.debug('[DownloadManager] getDefaultPath', p)
    return p
  }

  private broadcastProgress(data: {
    id: string
    state: string
    receivedBytes: number
    totalBytes: number
  }): void {
    console.debug('[DownloadManager] broadcastProgress: id state', data.id, data.state)
    this.window.webContents.send('download:progress', data)
  }

  /** 发送系统通知：下载完成 */
  private notifyComplete(filename: string, filePath: string): void {
    if (!Notification.isSupported()) return
    const notif = new Notification({
      title: 'Download Complete',
      body: filename,
      silent: true,
    })
    notif.on('click', () => {
      shell.openPath(filePath).catch((err) => {
        console.error('[DownloadManager] notifyComplete: openPath failed', filePath, err)
      })
    })
    notif.show()
    console.debug('[DownloadManager] notifyComplete: shown for', filename)
  }

  /** 检查文件扩展名是否属于潜在危险类型 */
  static isDangerousFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase()
    return DANGEROUS_EXTENSIONS.has(ext)
  }
}
