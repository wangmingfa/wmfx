import path from 'node:path'
import type { DownloadRepository, DownloadState } from '@wmfx/database'
import {
  app,
  type BrowserWindow,
  type DownloadItem as ElectronDownloadItem,
  session,
} from 'electron'
import type { SettingsManager } from './settings-manager'

export class DownloadManager {
  private activeDownloads = new Map<
    string,
    { download: ElectronDownloadItem; receiver: () => void }
  >()

  constructor(
    private window: BrowserWindow,
    private repo: DownloadRepository,
    private settingsManager: SettingsManager
  ) {
    this.setupDownloadHandler()
  }

  private setupDownloadHandler(): void {
    session.defaultSession.on('will-download', (_e, downloadItem) => {
      const url = downloadItem.getURL()
      const filename = downloadItem.getFilename()
      const defaultPath = this.getDefaultPath()

      // 创建下载记录
      const id = this.repo.create({
        url,
        filename,
        path: path.join(defaultPath, filename),
        state: 'downloading',
        received_bytes: 0,
        total_bytes: downloadItem.getTotalBytes(),
        error_msg: null,
      })

      // 设置保存路径
      const savePath = path.join(defaultPath, filename)
      downloadItem.setSavePath(savePath)

      // 监听进度
      downloadItem.on('updated', (_e, state) => {
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
        if (state === 'completed') {
          this.update(id, { state: 'completed' })
          this.broadcastProgress({
            id,
            state: 'completed',
            receivedBytes: downloadItem.getTotalBytes(),
            totalBytes: downloadItem.getTotalBytes(),
          })
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

  create(_opts: { url: string; filename?: string; path?: string }): { id: string } {
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
    const active = this.activeDownloads.get(id)
    if (active) {
      active.download.pause()
      this.update(id, { state: 'paused' })
    }
  }

  resume(id: string): void {
    const active = this.activeDownloads.get(id)
    if (active) {
      active.download.resume()
      this.update(id, { state: 'downloading' })
    }
  }

  cancel(id: string): void {
    const active = this.activeDownloads.get(id)
    if (active) {
      active.download.cancel()
      this.update(id, { state: 'cancelled', error_msg: 'User cancelled' })
    }
  }

  get(id: string): ReturnType<DownloadRepository['getById']> {
    return this.repo.getById(id)
  }

  getList(opts?: { state?: DownloadState; limit?: number; offset?: number }) {
    return this.repo.getList(opts)
  }

  setPath(_path: string): void {
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
    this.repo.update(id, updates)
  }

  private getDefaultPath(): string {
    return this.settingsManager.get('downloadPath') || app.getPath('downloads')
  }

  private broadcastProgress(data: {
    id: string
    state: string
    receivedBytes: number
    totalBytes: number
  }): void {
    this.window.webContents.send('download:progress', data)
  }
}
