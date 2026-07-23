import * as fs from 'node:fs'
import * as path from 'node:path'
import type {
  ClipboardData,
  FileBookmark,
  FileEntry,
  FileStat,
  FileType,
  FtpConnectOptions,
  PreviewData,
  SftpConnectOptions,
  SystemDir,
} from '@browser/ipc-contract'
import { Client as FtpClient } from 'basic-ftp'
import { app, BrowserWindow, clipboard, shell } from 'electron'
import { type SFTPWrapper, Client as SftpClient } from 'ssh2'
import { getImageDimensions } from './thumbnail'

// 只对图片文件读取尺寸
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'])

export interface FileOpResult {
  success: boolean
  error?: string
}

/** 文件操作错误类型 */
export class FileBrowserError extends Error {
  constructor(
    public readonly code:
      | 'PATH_TRAVERSAL'
      | 'SENSITIVE_DIR'
      | 'NOT_FOUND'
      | 'PERMISSION_DENIED'
      | 'DISK_FULL'
      | 'SESSION_NOT_FOUND'
      | 'UNKNOWN',
    message: string
  ) {
    super(message)
    this.name = 'FileBrowserError'
  }
}

/** 系统敏感目录（相对路径模式，用于匹配 home/user 下不应访问的路径） */
const SENSITIVE_DIR_PATTERNS: string[] = []

const SENSITIVE_DIRS = ['/etc/passwd', '/etc/shadow', '/root', '/boot', '/sys', '/proc', '/var/log']

/** 校验路径安全：拒绝 `..` 穿越，检查敏感目录 */
export function validatePath(rawPath: string): string {
  const resolved = path.resolve(rawPath)

  // 拒绝 `..` 穿越到系统根
  if (process.platform === 'win32') {
    // Windows: 拒绝访问系统盘根目录下的敏感路径
    if (/^[A-Z]:\\?(Windows|Program Files|ProgramData)/i.test(resolved)) {
      throw new FileBrowserError('SENSITIVE_DIR', `不允许访问系统目录：${resolved}`)
    }
  } else {
    // macOS/Linux: 拒绝直接访问敏感目录
    for (const sensitive of SENSITIVE_DIRS) {
      if (resolved === sensitive || resolved.startsWith(`${sensitive}/`)) {
        throw new FileBrowserError('SENSITIVE_DIR', `不允许访问敏感目录：${resolved}`)
      }
    }
    // 拒绝访问 /root（需要 root 权限的目录）
    if (resolved === '/root' || resolved.startsWith('/root/')) {
      throw new FileBrowserError('SENSITIVE_DIR', `不允许访问 /root`)
    }
  }

  // 拒绝敏感文件名/目录名（防误入隐藏系统文件）
  const basename = path.basename(resolved)
  if (SENSITIVE_DIR_PATTERNS.some((p) => basename === p)) {
    throw new FileBrowserError('SENSITIVE_DIR', `不允许访问特殊文件：${basename}`)
  }

  return resolved
}

/** 文件浏览器主进程核心模块：目录读写、文件操作、系统剪贴板、书签、系统目录、FTP/SFTP。 */
export class FileBrowserManager {
  // 应用内剪贴板（跨标签页共享）
  private clipboardData: ClipboardData | null = null

  // 快速访问书签
  private fileBookmarks: FileBookmark[] = []

  // FTP/SFTP 会话（后续实现时重新添加）

  // 书签持久化路径
  private readonly bookmarksPath: string = path.join(app.getPath('userData'), 'file-bookmarks.json')

  // 实时目录监听：按目录路径引用计数，多标签/多窗口共享同一 fs.watch
  private dirWatchers = new Map<string, { watcher: fs.FSWatcher; refCount: number }>()
  // 每个目录的去抖定时器，避免高频事件触发过多次广播
  private dirWatchTimers = new Map<string, NodeJS.Timeout>()

  // 活动会话
  private ftpSessions = new Map<string, FtpClient>()
  private sftpSessions = new Map<string, SFTPWrapper>()

  constructor() {
    this.loadBookmarks()
  }

  // ─── 目录操作 ──────────────────────────────────────────────

  /** 读取目录内容，返回文件/文件夹列表；图片文件并行读取尺寸元数据 */
  async readDir(dirPath: string): Promise<FileEntry[]> {
    console.info('[FileBrowserManager] readDir: dirPath=%s', dirPath)
    const validated = validatePath(dirPath)
    try {
      const entries = await fs.promises.readdir(validated, { withFileTypes: true })

      const fileEntries: FileEntry[] = []

      // 并行处理所有文件
      await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(validated, entry.name)
          try {
            const stat = await fs.promises.stat(fullPath)
            const fileEntry = this.buildFileEntry(entry, fullPath, stat)

            // 图片文件并行获取尺寸（仅支持尺寸检测的格式）
            if (IMAGE_EXTENSIONS.has(path.extname(fullPath))) {
              try {
                const dimensions = await getImageDimensions(fullPath)
                if (dimensions) {
                  fileEntry.info = dimensions
                }
              } catch {
                console.debug(
                  '[FileBrowserManager] readDir getImageDimensions failed: %s',
                  fullPath
                )
              }
            }

            fileEntries.push(fileEntry)
          } catch (err) {
            console.warn('[FileBrowserManager] readDir stat error: %s err=%s', fullPath, err)
          }
        })
      )

      console.info(
        '[FileBrowserManager] readDir: dirPath=%s entries=%d',
        dirPath,
        fileEntries.length
      )
      return fileEntries
    } catch (err) {
      console.error('[FileBrowserManager] readDir error:', err)
      throw err
    }
  }

  /** 获取文件/目录状态 */
  stat(filePath: string): FileStat {
    console.debug('[FileBrowserManager] stat: filePath', filePath)
    const validated = validatePath(filePath)
    try {
      const st = fs.statSync(validated)
      return {
        size: st.size,
        isDir: st.isDirectory(),
        isFile: st.isFile(),
        isSymbolicLink: st.isSymbolicLink(),
        modifiedAt: st.mtimeMs,
        createdAt: st.birthtimeMs,
        permissions: this.formatPermissions(st.mode),
      }
    } catch (err) {
      console.error('[FileBrowserManager] stat error:', err)
      throw err
    }
  }

  /** 创建文件夹 */
  mkdir(dirPath: string): void {
    console.debug('[FileBrowserManager] mkdir: dirPath', dirPath)
    const validated = validatePath(dirPath)
    try {
      fs.mkdirSync(validated, { recursive: false })
    } catch (err) {
      console.error('[FileBrowserManager] mkdir error:', err)
      throw err
    }
  }

  /** 重命名文件/文件夹 */
  rename(oldPath: string, newPath: string): void {
    console.debug('[FileBrowserManager] rename: oldPath → newPath', oldPath, newPath)
    const validatedOld = validatePath(oldPath)
    const validatedNew = validatePath(newPath)
    try {
      fs.renameSync(validatedOld, validatedNew)
    } catch (err) {
      console.error('[FileBrowserManager] rename error:', err)
      throw err
    }
  }

  /** 删除文件/文件夹（移入回收站） */
  async delete(paths: string[]): Promise<void> {
    console.debug('[FileBrowserManager] delete: paths', paths)
    const validated = paths.map((p) => validatePath(p))
    for (const p of validated) {
      try {
        await shell.trashItem(p)
      } catch (err) {
        console.error('[FileBrowserManager] delete error:', p, err)
        throw err
      }
    }
  }

  /** 复制文件/文件夹到目标目录 */
  async copy(sources: string[], dest: string): Promise<void> {
    console.debug('[FileBrowserManager] copy: sources → dest', sources, dest)
    const validatedDest = validatePath(dest)
    const validatedSources = sources.map((s) => validatePath(s))
    for (const src of validatedSources) {
      try {
        const stat = fs.statSync(src)
        if (!stat.isFile()) {
          console.warn('[FileBrowserManager] copy: 暂不支持文件夹复制', src)
          continue
        }
        const destPath = path.join(validatedDest, path.basename(src))
        // 处理重名：追加 (2) (3)
        const resolved = this.resolveUniquePath(destPath)
        fs.copyFileSync(src, resolved)
        console.debug('[FileBrowserManager] copy done:', src, '→', resolved)
      } catch (err) {
        console.error('[FileBrowserManager] copy error:', src, err)
        throw err
      }
    }
  }

  /** 剪切（复制 + 删除源） */
  async cut(sources: string[], dest: string): Promise<void> {
    console.debug('[FileBrowserManager] cut: sources → dest', sources, dest)
    const validatedDest = validatePath(dest)
    const validatedSources = sources.map((s) => validatePath(s))
    try {
      await this.copy(validatedSources, validatedDest)
      // 复制成功后删除源
      await this.delete(sources)
    } catch (err) {
      console.error('[FileBrowserManager] cut error:', err)
      throw err
    }
  }

  /** 粘贴：从应用内剪贴板读取，执行复制/移动 */
  async paste(dest: string): Promise<void> {
    console.debug('[FileBrowserManager] paste to:', dest)
    const validatedDest = validatePath(dest)
    if (!this.clipboardData) {
      console.debug('[FileBrowserManager] paste: 剪贴板为空')
      return
    }
    const { paths, operation } = this.clipboardData
    try {
      if (operation === 'copy') {
        await this.copy(paths, validatedDest)
      } else {
        await this.cut(paths, validatedDest)
      }
    } catch (err) {
      console.error('[FileBrowserManager] paste error:', err)
      throw err
    }
  }

  /** 设置应用内剪贴板 */
  setClipboard(paths: string[], operation: 'copy' | 'cut'): void {
    console.debug('[FileBrowserManager] setClipboard: operation', operation, paths)
    this.clipboardData = { paths, operation }
  }

  /** 获取应用内剪贴板内容 */
  getClipboard(): ClipboardData | null {
    return this.clipboardData
  }

  // ─── 系统剪贴板（跨应用） ──────────────────────────────────

  /** 从系统剪贴板读取文件路径（平台特定格式） */
  clipboardReadFiles(): string[] {
    console.debug('[FileBrowserManager] clipboardReadFiles')
    const platform = process.platform
    const files: string[] = []

    try {
      if (platform === 'darwin') {
        // macOS: NSFilenamesPboardType → plist 编码路径数组
        const buffer = clipboard.readBuffer('NSFilenamesPboardType')
        if (buffer.length > 0) {
          const str = buffer.toString('utf-8').trim()
          // 解析 plist（简化版，实际需用 plist 库）
          const match = str.match(/<string>(.*?)<\/string>/g)
          if (match) {
            match.forEach((m) => {
              const path = m.replace(/<\/?string>/g, '')
              files.push(path)
            })
          }
        }
      } else if (platform === 'win32') {
        // Windows: CF_HDROP → DROPFILES 结构体
        const buffer = clipboard.readBuffer('CF_HDROP')
        if (buffer.length > 0) {
          // DROPFILES 结构体：4 个 uint + flags + paths
          // 简化：尝试读取
          console.warn('[FileBrowserManager] clipboardReadFiles: Windows CF_HDROP 需原生解析')
        }
      } else {
        // Linux: text/uri-list
        const buffer = clipboard.readBuffer('text/uri-list')
        if (buffer.length > 0) {
          const urls = buffer.toString('utf-8').split('\n').filter(Boolean)
          urls.forEach((url) => {
            try {
              const p = new URL(url).pathname
              files.push(p)
            } catch {
              // 忽略
            }
          })
        }
      }
    } catch {
      console.debug('[FileBrowserManager] clipboardReadFiles: 无文件在剪贴板')
    }

    return files
  }

  /** 写入文件路径到系统剪贴板（平台特定格式） */
  clipboardWriteFiles(paths: string[]): void {
    console.debug('[FileBrowserManager] clipboardWriteFiles: paths', paths)
    const platform = process.platform

    try {
      if (platform === 'darwin') {
        // macOS: NSFilenamesPboardType
        // 写入 plist 格式：文件路径用 \x00 分隔
        const data = Buffer.from(paths.join('\x00'), 'utf-8')
        clipboard.writeBuffer('NSFilenamesPboardType', data)
      } else if (platform === 'win32') {
        // Windows: CF_HDROP 需原生结构体，暂不支持
        console.warn('[FileBrowserManager] clipboardWriteFiles: Windows CF_HDROP 需原生实现')
        // 回退：写入文件路径为文本
        clipboard.writeText(paths.join('\n'))
      } else {
        // Linux: text/uri-list
        const urls = `${paths.map((p) => `file://${p.replace(/ /g, '%20')}`).join('\n')}\n`
        const data = Buffer.from(urls, 'utf-8')
        clipboard.writeBuffer('text/uri-list', data)
      }
    } catch (err) {
      console.error('[FileBrowserManager] clipboardWriteFiles error:', err)
      throw err
    }
  }

  // ─── Quick Look 预览 ──────────────────────────────────────

  /** 读取文件预览数据 */
  async readFilePreview(filePath: string): Promise<PreviewData> {
    console.debug('[FileBrowserManager] readFilePreview: filePath', filePath)
    const validated = validatePath(filePath)
    try {
      const stat = fs.statSync(validated)
      const modifiedAt = stat.mtimeMs
      const ext = path.extname(filePath).toLowerCase().slice(1)
      const fileName = path.basename(filePath)
      const fileSize = stat.size

      // 文件夹
      if (stat.isDirectory()) {
        return {
          type: 'directory',
          filePath,
          fileName,
          modifiedAt,
          fileSize,
        }
      }

      // 图片：通过 wmfx:// 协议加载（sharp 缩放/直出 + 磁盘缓存），
      // 不受 10MB 限制，支持大图 / gigapixel；gif 走 file-raw 保留动画，其余走 file-preview 缩放。
      // 尺寸仅解析元数据获取，超大图也能秒回。
      if (this.isImageExt(ext)) {
        const enc = encodeURIComponent(validated)
        const data =
          ext === 'gif' ? `wmfx://file-raw?path=${enc}` : `wmfx://file-preview?path=${enc}`
        const dimensions = await getImageDimensions(validated)
        return {
          type: 'image',
          filePath,
          modifiedAt,
          mimeType: this.getImageMimeType(ext),
          data,
          dimensions,
          fileName,
          fileSize,
        }
      }

      // 大文件（>10MB）仅显示元信息
      if (fileSize > 10 * 1024 * 1024) {
        return {
          type: this.detectType(ext),
          filePath,
          fileName,
          fileSize,
        }
      }

      const data = fs.readFileSync(validated)

      // 文本
      if (this.isTextExt(ext)) {
        // 截断至 50KB
        const truncated = data.length > 50 * 1024
        const text = truncated ? data.slice(0, 50 * 1024).toString('utf-8') : data.toString('utf-8')
        return {
          type: 'text',
          filePath,
          modifiedAt,
          mimeType: 'text/plain',
          data: text,
          truncated,
          fileName,
          fileSize,
        }
      }

      // PDF / 音频 / 视频：返回元信息，渲染端用 file:// 加载
      if (ext === 'pdf') {
        return { type: 'pdf', filePath, fileName, fileSize, modifiedAt }
      }
      if (this.isAudioExt(ext)) {
        return { type: 'audio', filePath, fileName, fileSize, modifiedAt }
      }
      if (this.isVideoExt(ext)) {
        return { type: 'video', filePath, fileName, fileSize, modifiedAt }
      }

      return { type: 'unknown', filePath, fileName, fileSize, modifiedAt }
    } catch (err) {
      console.error('[FileBrowserManager] readFilePreview error:', err)
      throw err
    }
  }

  // ─── 搜索 ──────────────────────────────────────────────────

  /** 目录内搜索（递归子目录，最多 500 条） */
  searchDir(dirPath: string, query: string): FileEntry[] {
    console.debug('[FileBrowserManager] searchDir: dirPath query', dirPath, query)
    // 搜索不强制校验根路径安全性：即便根目录本身是特殊目录也允许搜索（返回空结果而非抛错）
    let validated: string
    try {
      validated = validatePath(dirPath)
    } catch (err) {
      console.debug('[FileBrowserManager] searchDir 跳过不可访问目录:', (err as Error).message)
      return []
    }
    const results: FileEntry[] = []
    const lowerQuery = query.toLowerCase()

    const walk = (dir: string, depth: number): void => {
      if (depth > 10) return // 深度限制
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.name.startsWith('.') && entry.name !== '.' && entry.name !== '..') {
            continue // 忽略隐藏文件
          }
          // 跳过敏感目录（node_modules/.git 等）：既不深入遍历，也不作为结果返回，避免触发校验抛错与无意义海量结果
          if (entry.isDirectory() && SENSITIVE_DIR_PATTERNS.includes(entry.name)) {
            continue
          }
          const fullPath = path.join(dir, entry.name)
          try {
            const stat = fs.statSync(fullPath)
            if (lowerQuery && entry.name.toLowerCase().includes(lowerQuery)) {
              results.push(this.buildFileEntry(entry, fullPath, stat))
              if (results.length >= 500) return
            }
            if (entry.isDirectory()) {
              walk(fullPath, depth + 1)
            }
          } catch {}
        }
      } catch {
        return
      }
    }

    walk(validated, 0)
    return results
  }

  // ─── 系统目录 ──────────────────────────────────────────────

  /** 获取系统常用目录列表（自动检测存在） */
  getSystemDirs(): SystemDir[] {
    console.debug('[FileBrowserManager] getSystemDirs')
    const dirs: Array<{ name: string; path: string; icon: string }> = [
      { name: '桌面', path: app.getPath('desktop'), icon: 'mdi:desktop-mac' },
      { name: '下载', path: app.getPath('downloads'), icon: 'mdi:download' },
      { name: '文档', path: app.getPath('documents'), icon: 'mdi:file-document' },
      { name: '图片', path: app.getPath('pictures'), icon: 'mdi:image' },
      { name: '音乐', path: app.getPath('music'), icon: 'mdi:music-note' },
      { name: '视频', path: app.getPath('videos'), icon: 'mdi:video' },
      { name: '主目录', path: app.getPath('home'), icon: 'mdi:home' },
    ]

    return dirs
      .filter((d) => fs.existsSync(d.path))
      .map((d) => ({ ...d, path: path.normalize(d.path) }))
  }

  // ─── 书签 ──────────────────────────────────────────────────

  /** 获取书签列表 */
  getBookmarks(): FileBookmark[] {
    return this.fileBookmarks
  }

  /** 添加书签 */
  addBookmark(dirPath: string, name: string): void {
    console.debug('[FileBrowserManager] addBookmark: dirPath name', dirPath, name)
    const validated = validatePath(dirPath)
    const bookmark: FileBookmark = {
      id: `bm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      path: validated,
      icon: 'mdi:folder',
    }
    this.fileBookmarks.push(bookmark)
    this.saveBookmarks()
  }

  /** 移除书签 */
  removeBookmark(id: string): void {
    console.debug('[FileBrowserManager] removeBookmark: id', id)
    this.fileBookmarks = this.fileBookmarks.filter((b) => b.id !== id)
    this.saveBookmarks()
  }

  /** 重命名书签（仅修改展示名，不影响其指向的路径） */
  renameBookmark(id: string, name: string): void {
    console.debug('[FileBrowserManager] renameBookmark: id name', id, name)
    const bm = this.fileBookmarks.find((b) => b.id === id)
    if (!bm) throw new FileBrowserError('NOT_FOUND', `书签不存在：${id}`)
    const trimmed = name.trim()
    if (!trimmed) throw new FileBrowserError('UNKNOWN', '书签名称不能为空')
    bm.name = trimmed
    this.saveBookmarks()
  }

  /** 重新排序书签 */
  reorderBookmarks(ids: string[]): void {
    console.debug('[FileBrowserManager] reorderBookmarks: ids', ids)
    const map = new Map(this.fileBookmarks.map((b) => [b.id, b]))
    this.fileBookmarks = ids
      .map((id) => map.get(id))
      .filter((b): b is FileBookmark => b !== undefined)
    this.saveBookmarks()
  }

  // ─── FTP / SFTP ────────────────────────────────────────────

  /** 连接 FTP 服务器 */
  async ftpConnect(opts: FtpConnectOptions): Promise<string> {
    console.debug('[FileBrowserManager] ftpConnect: host', opts.host)
    const sessionId = `ftp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const client = new FtpClient()
    const port = opts.port || 21
    const user = opts.user || 'anonymous'
    const password = opts.password || ''
    try {
      await client.access({ host: opts.host, port, user, password })
      console.info('[FileBrowserManager] ftpConnect: connected to', opts.host)
      this.ftpSessions.set(sessionId, client)
    } catch (err) {
      console.error('[FileBrowserManager] ftpConnect: error', opts.host, err)
      throw new Error(`FTP 连接失败：${err instanceof Error ? err.message : String(err)}`)
    }
    return sessionId
  }

  /** 连接 SFTP 服务器 */
  async sftpConnect(opts: SftpConnectOptions): Promise<string> {
    console.debug('[FileBrowserManager] sftpConnect: host', opts.host)
    const sessionId = `sftp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const client = new SftpClient()
    const port = opts.port || 22
    return new Promise((resolve, reject) => {
      client
        .on('ready', () => {
          console.info('[FileBrowserManager] sftpConnect: connected to', opts.host)
          client.sftp((err, sftp) => {
            if (err) {
              reject(new Error(`SFTP 初始化失败：${err.message}`))
              return
            }
            this.sftpSessions.set(sessionId, sftp)
            resolve(sessionId)
          })
        })
        .on('error', (err: Error) => {
          reject(new Error(`SFTP 连接失败：${err.message}`))
        })
        .connect({
          host: opts.host,
          port,
          username: opts.user,
          password: opts.password,
          privateKey: opts.privateKeyPath ? fs.readFileSync(opts.privateKeyPath) : undefined,
          passphrase: opts.privateKeyPassword,
          readyTimeout: 60000,
          keepaliveInterval: 15000,
          keepaliveCountMax: 3,
        })
    })
  }

  /** 列出 FTP/SFTP 目录 */
  async ftpList(sessionId: string, remotePath: string): Promise<FileEntry[]> {
    console.debug('[FileBrowserManager] ftpList: sessionId remotePath', sessionId, remotePath)
    const isFtp = sessionId.startsWith('ftp')
    const client = isFtp ? this.ftpSessions.get(sessionId) : this.sftpSessions.get(sessionId)
    if (!client) {
      throw new Error(`会话不存在或已断开：${sessionId}`)
    }
    if (isFtp) {
      const list = await (client as FtpClient).list(remotePath)
      return list.map((item) => ({
        name: item.name,
        path: `${remotePath}/${item.name}`,
        type: ((item.type as number) === 2 ? 'directory' : 'unknown') as FileType,
        size: item.size || 0,
        modifiedAt: Date.now(),
        createdAt: Date.now(),
        extension: path.extname(item.name).toLowerCase().slice(1),
        isHidden: item.name.startsWith('.'),
      }))
    } else {
      return new Promise((resolve, reject) => {
        ;(client as SFTPWrapper).readdir(remotePath, (err: Error | undefined, files: unknown[]) => {
          if (err) {
            reject(err)
            return
          }
          const entries: FileEntry[] = []
          for (const name of files as string[]) {
            ;(client as SFTPWrapper).stat(
              `${remotePath}/${name}`,
              // biome-ignore lint/suspicious/noExplicitAny: ssh2 Stats callback type
              (statErr: Error | undefined, stat: any) => {
                if (statErr) {
                  console.error('[FileBrowserManager] ftpList: stat error', statErr)
                  return
                }
                entries.push({
                  name,
                  path: `${remotePath}/${name}`,
                  // biome-ignore lint/suspicious/noExplicitAny: ssh2 Stats has no .isDirectory() TS type
                  type: (((stat as any).isDirectory?.() ?? false)
                    ? 'directory'
                    : 'unknown') as FileType,
                  // biome-ignore lint/suspicious/noExplicitAny: ssh2 Stats size property
                  size: (stat as any).size || 0,
                  modifiedAt: Date.now(),
                  createdAt: Date.now(),
                  extension: path.extname(name).toLowerCase().slice(1),
                  isHidden: name.startsWith('.'),
                })
                if (entries.length === files.length) {
                  resolve(entries)
                }
              }
            )
          }
        })
      })
    }
  }

  /** 上传文件到 FTP/SFTP */
  async ftpUpload(sessionId: string, localPath: string, remotePath: string): Promise<void> {
    console.debug(
      '[FileBrowserManager] ftpUpload: sessionId localPath -> remotePath',
      sessionId,
      localPath,
      remotePath
    )
    const validatedLocal = validatePath(localPath)
    const isFtp = sessionId.startsWith('ftp')
    const client = isFtp ? this.ftpSessions.get(sessionId) : this.sftpSessions.get(sessionId)
    if (!client) {
      throw new Error(`会话不存在或已断开：${sessionId}`)
    }
    if (isFtp) {
      await (client as FtpClient).uploadFrom(validatedLocal, remotePath)
    } else {
      return new Promise((resolve, reject) => {
        ;(client as SFTPWrapper).fastPut(
          validatedLocal,
          remotePath,
          (err: Error | null | undefined) => {
            if (err) reject(err)
            else resolve()
          }
        )
      })
    }
  }

  /** 从 FTP/SFTP 下载文件 */
  async ftpDownload(sessionId: string, remotePath: string, localPath: string): Promise<void> {
    console.debug(
      '[FileBrowserManager] ftpDownload: sessionId remotePath -> localPath',
      sessionId,
      remotePath,
      localPath
    )
    const validatedLocal = validatePath(localPath)
    const isFtp = sessionId.startsWith('ftp')
    const client = isFtp ? this.ftpSessions.get(sessionId) : this.sftpSessions.get(sessionId)
    if (!client) {
      throw new Error(`会话不存在或已断开：${sessionId}`)
    }
    if (isFtp) {
      await (client as FtpClient).downloadTo(validatedLocal, remotePath)
    } else {
      return new Promise((resolve, reject) => {
        ;(client as SFTPWrapper).fastGet(
          remotePath,
          validatedLocal,
          (err: Error | null | undefined) => {
            if (err) reject(err)
            else resolve()
          }
        )
      })
    }
  }

  /** 断开 FTP/SFTP 连接 */
  async ftpDisconnect(sessionId: string): Promise<void> {
    console.debug('[FileBrowserManager] ftpDisconnect: sessionId', sessionId)
    const isFtp = sessionId.startsWith('ftp')
    if (isFtp) {
      const client = this.ftpSessions.get(sessionId)
      if (client) {
        await (client as FtpClient).close()
        this.ftpSessions.delete(sessionId)
      }
    } else {
      const client = this.sftpSessions.get(sessionId)
      if (client) {
        ;(client as SFTPWrapper).end()
        this.sftpSessions.delete(sessionId)
      }
    }
  }

  // ─── 内部辅助方法 ──────────────────────────────────────────

  private buildFileEntry(entry: fs.Dirent, fullPath: string, stat: fs.Stats): FileEntry {
    const ext = path.extname(fullPath).toLowerCase().slice(1)
    const type = entry.isDirectory() ? 'directory' : this.detectFileType(ext)
    return {
      name: entry.name,
      path: fullPath,
      type,
      size: stat.size,
      modifiedAt: stat.mtimeMs,
      createdAt: stat.birthtimeMs,
      extension: ext,
      isHidden: entry.name.startsWith('.'),
    }
  }

  private formatPermissions(mode: number): string {
    const perms = [
      mode & 0o400 ? 'r' : '-',
      mode & 0o200 ? 'w' : '-',
      mode & 0o100 ? 'x' : '-',
      mode & 0o040 ? 'r' : '-',
      mode & 0o020 ? 'w' : '-',
      mode & 0o010 ? 'x' : '-',
      mode & 0o004 ? 'r' : '-',
      mode & 0o002 ? 'w' : '-',
      mode & 0o001 ? 'x' : '-',
    ]
    return perms.join('')
  }

  private resolveUniquePath(target: string): string {
    let counter = 1
    while (fs.existsSync(target)) {
      const dir = path.dirname(target)
      const name = path.basename(target)
      const dotIndex = name.lastIndexOf('.')
      const baseName = dotIndex > 0 ? name.slice(0, dotIndex) : name
      const ext = dotIndex > 0 ? name.slice(dotIndex) : ''
      target = path.join(dir, `${baseName} (${counter})${ext}`)
      counter++
    }
    return target
  }

  // 文件类型检测

  private detectType(ext: string): PreviewData['type'] {
    if (this.isImageExt(ext)) return 'image'
    if (this.isTextExt(ext)) return 'text'
    if (ext === 'pdf') return 'pdf'
    if (this.isAudioExt(ext)) return 'audio'
    if (this.isVideoExt(ext)) return 'video'
    return 'unknown'
  }

  private detectFileType(ext: string): FileType {
    if (this.isImageExt(ext)) return 'image'
    if (this.isAudioExt(ext)) return 'audio'
    if (this.isVideoExt(ext)) return 'video'
    return 'unknown'
  }

  private isImageExt(ext: string): boolean {
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)
  }

  private isTextExt(ext: string): boolean {
    return [
      'txt',
      'md',
      'json',
      'ts',
      'js',
      'tsx',
      'jsx',
      'css',
      'html',
      'xml',
      'yaml',
      'yml',
      'toml',
      'ini',
      'log',
    ].includes(ext)
  }

  private isAudioExt(ext: string): boolean {
    return ['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma'].includes(ext)
  }

  private isVideoExt(ext: string): boolean {
    return ['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv'].includes(ext)
  }

  private getImageMimeType(ext: string): string {
    const map: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      bmp: 'image/bmp',
      ico: 'image/x-icon',
    }
    return map[ext] || 'image/octet-stream'
  }

  // 书签持久化

  private loadBookmarks(): void {
    try {
      if (fs.existsSync(this.bookmarksPath)) {
        const data = JSON.parse(fs.readFileSync(this.bookmarksPath, 'utf-8'))
        this.fileBookmarks = (data as FileBookmark[]).filter((b) => fs.existsSync(b.path))
        console.debug('[FileBrowserManager] loadBookmarks: loaded', this.fileBookmarks.length)
      }
    } catch (err) {
      console.warn('[FileBrowserManager] loadBookmarks error:', err)
      this.fileBookmarks = []
    }
  }

  private saveBookmarks(): void {
    try {
      fs.writeFileSync(this.bookmarksPath, JSON.stringify(this.fileBookmarks, null, 2))
      console.debug('[FileBrowserManager] saveBookmarks: saved', this.fileBookmarks.length)
    } catch (err) {
      console.error('[FileBrowserManager] saveBookmarks error:', err)
    }
  }

  // ─── 实时目录监听（fs.watch） ──────────────────────────────

  /** 开始监听目录变化；按目录路径引用计数，首次建立 watcher，重复调用仅 +1 */
  watchDir(dirPath: string): void {
    const validated = validatePath(dirPath)
    console.debug('[FileBrowserManager] watchDir: dirPath', validated)
    const existing = this.dirWatchers.get(validated)
    if (existing) {
      existing.refCount += 1
      return
    }
    let watcher: fs.FSWatcher
    try {
      watcher = fs.watch(validated, { recursive: false }, () => {
        // fs.watch 在 macOS 不保证 filename，且事件密集；统一去抖后广播目录路径
        this.scheduleChangedBroadcast(validated)
      })
    } catch (err) {
      console.error('[FileBrowserManager] watchDir error:', err)
      return
    }
    watcher.on('error', (err) => {
      console.error('[FileBrowserManager] watch error:', validated, err)
      this.closeWatcher(validated)
    })
    this.dirWatchers.set(validated, { watcher, refCount: 1 })
  }

  /** 停止监听目录变化；引用计数归零时关闭并移除 watcher */
  unwatchDir(dirPath: string): void {
    const validated = validatePath(dirPath)
    console.debug('[FileBrowserManager] unwatchDir: dirPath', validated)
    const existing = this.dirWatchers.get(validated)
    if (!existing) return
    existing.refCount -= 1
    if (existing.refCount <= 0) this.closeWatcher(validated)
  }

  /** 去抖广播：目录内容变化后通知所有渲染窗口重载该目录 */
  private scheduleChangedBroadcast(dirPath: string): void {
    const prev = this.dirWatchTimers.get(dirPath)
    if (prev) clearTimeout(prev)
    const timer = setTimeout(() => {
      this.dirWatchTimers.delete(dirPath)
      console.info('[FileBrowserManager] fs:changed broadcast:', dirPath)
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('fs:changed', dirPath)
      }
    }, 300)
    this.dirWatchTimers.set(dirPath, timer)
  }

  /** 关闭并清理指定目录的 watcher */
  private closeWatcher(dirPath: string): void {
    const existing = this.dirWatchers.get(dirPath)
    if (!existing) return
    try {
      existing.watcher.close()
    } catch (err) {
      console.error('[FileBrowserManager] closeWatcher error:', err)
    }
    this.dirWatchers.delete(dirPath)
    const timer = this.dirWatchTimers.get(dirPath)
    if (timer) {
      clearTimeout(timer)
      this.dirWatchTimers.delete(dirPath)
    }
  }

  // ─── 单例 ──────────────────────────────────────────────────

  private static instance: FileBrowserManager

  static getInstance(): FileBrowserManager {
    if (!FileBrowserManager.instance) {
      console.debug('[FileBrowserManager] getInstance: creating singleton')
      FileBrowserManager.instance = new FileBrowserManager()
    }
    return FileBrowserManager.instance
  }
}
