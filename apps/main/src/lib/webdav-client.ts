/**
 * WebDAV 客户端（主进程，零外部依赖）
 *
 * 设计原则：
 * - 用 Electron 内置的 net 模块发 HTTP，不引入 http/got/axios 等外部包
 * - 只实现同步所需的最小子集：PROPFIND / GET / PUT / DELETE / MKCOL
 * - 所有路径操作都是 UTF-8 编码（WebDAV 标准要求 URI 转义）
 *
 * WebDAV 协议要点：
 * - 路径始终以 / 结尾表示目录，否则表示文件
 * - 认证走 HTTP Basic Auth（大多数 WebDAV 服务支持）
 * - PROPFIND 返回 XML（RFC 4918），本实现只解析自己需要的字段
 *
 * 类型说明：
 * - Electron 的 net.request 在运行时支持 timeout/setTimeout/destroy 等 Node 标准属性，
 *   但 @types/electron 的 TS 定义并不完整。因此对这类成员使用 @ts-expect-error 显式说明。
 */

import { net } from 'electron'

/** WebDAV 连接配置，存储在设置中 */
export interface WebDAVConfig {
  /** 例如 https://dav.jianguoyun.com/dav/ */
  baseUrl: string
  username: string
  /** 密码在 settings-manager 中明文存储，云端同步时用于 HTTP Basic Auth */
  password: string
  /** 云端存储路径（相对于 baseUrl），默认 /.wmfx/ */
  remotePath: string
}

/** 文件/目录元信息 */
export interface WebDAVEntry {
  name: string
  /** 完整 WebDAV 路径 */
  path: string
  /** 是否为目录 */
  isDirectory: boolean
  /** 文件大小（字节），目录为 -1 */
  size: number
  /** 最后修改时间（unix ms），解析失败为 0 */
  modifiedAt: number
}

/**
 * WebDAV 错误：区分"网络/认证问题"和"资源不存在/权限问题"，方便 UI 展示
 */
export class WebDAVError extends Error {
  readonly status: number
  readonly code: WebDAVErrorCode

  constructor(code: WebDAVErrorCode, message: string, status: number = 0) {
    super(message)
    this.name = 'WebDAVError'
    this.code = code
    this.status = status
  }
}

export type WebDAVErrorCode =
  | 'NETWORK_ERROR' // 网络不通 / DNS 失败
  | 'AUTH_FAILED' // 401：账号密码错
  | 'NOT_FOUND' // 404
  | 'CONFLICT' // 409：目标已存在
  | 'SERVER_ERROR' // 5xx
  | 'PARSE_ERROR' // 响应 XML 解析失败
  | 'TIMEOUT' // 超时

/**
 * 将本地相对路径映射为 WebDAV 绝对路径。
 * 例如 config.remotePath='/.wmfx/'，key='settings.wmfx' → '/.wmfx/settings.wmfx'
 */
function toDavPath(config: WebDAVConfig, key: string): string {
  let base = config.remotePath
  if (!base.endsWith('/')) base += '/'
  const safeKey = key.replace(/\/\//g, '/')
  return base + safeKey
}

/**
 * 执行一个 WebDAV HTTP 请求，返回 { status, headers, body }
 */
async function request(
  config: WebDAVConfig,
  method: string,
  davPath: string,
  body?: Buffer | string
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const target = new URL(davPath, config.baseUrl).toString()

  console.debug('[WebDAV] request: %s %s', method, target)

  const opts: Record<string, unknown> = {
    url: target,
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`,
      ...(body
        ? { 'Content-Length': String(Buffer.byteLength(typeof body === 'string' ? body : body)) }
        : {}),
    },
    timeout: 15_000,
  }

  return new Promise((resolve, reject) => {
    try {
      const req = net.request(opts)

      // @ts-expect-error electron 43 ClientRequest type lacks setTimeout/destroy (runtime supported)
      req.setTimeout(15_000, () => {
        // @ts-expect-error electron 43 ClientRequest type lacks destroy
        req.destroy()
        reject(new WebDAVError('TIMEOUT', 'WebDAV request timeout (15s)', 0))
      })

      req.on('response', (res) => {
        console.debug('[WebDAV] response: status', res.statusCode, res.statusMessage)
        const headers: Record<string, string> = {}
        const rawHeaders = res.headers as unknown as Record<string, string | string[]> | undefined
        if (rawHeaders) {
          for (const [k, v] of Object.entries(rawHeaders)) {
            headers[k] = Array.isArray(v) ? v[0] : String(v)
          }
        }
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8')
          resolve({ status: res.statusCode ?? 0, headers, body })
        })
        res.on('error', (err) => reject(new WebDAVError('NETWORK_ERROR', err.message, 0)))
      })

      req.on('error', (err) => {
        console.error('[WebDAV] request error:', err)
        reject(new WebDAVError('NETWORK_ERROR', err.message, 0))
      })

      if (body) {
        const buf = typeof body === 'string' ? Buffer.from(body, 'utf8') : body
        req.write(buf)
      }
      req.end()
    } catch (err) {
      reject(new WebDAVError('NETWORK_ERROR', String(err), 0))
    }
  })
}

/** 统一错误映射 */
function mapError(status: number, method: string, path: string): never {
  console.error('[WebDAV] error: status', status, method, path)
  if (status === 401)
    throw new WebDAVError('AUTH_FAILED', '401 Unauthorized: 账号密码错误或 WebDAV 未启用', 401)
  if (status === 403) throw new WebDAVError('AUTH_FAILED', '403 Forbidden: 无权限访问该路径', 403)
  if (status === 404) throw new WebDAVError('NOT_FOUND', '404 Not Found: 远程路径不存在', 404)
  if (status === 409) throw new WebDAVError('CONFLICT', '409 Conflict: 目标已存在', 409)
  if (status >= 500) throw new WebDAVError('SERVER_ERROR', `5xx Server Error: ${status}`, status)
  if (status === 0) throw new WebDAVError('NETWORK_ERROR', '无法连接到 WebDAV 服务器', 0)
  throw new WebDAVError('SERVER_ERROR', `Unexpected status: ${status}`, status)
}

/**
 * 从 PROPFIND 的 XML 响应中提取文件列表。
 * 兼容坚果云、Nextcloud、Seafile 等常见 WebDAV 服务器的 XML 格式差异。
 */
function parsePropfindXml(xml: string, davPath: string): WebDAVEntry[] {
  const entries: WebDAVEntry[] = []

  // 匹配 <D:response> ... </D:response> 块
  const responseBlocks = xml.match(/<D:response>[\s\S]*?<\/D:response>/g) || []

  for (const block of responseBlocks) {
    const hrefMatch = block.match(/<D:href>([^<]+)<\/D:href>/)
    if (!hrefMatch) continue
    const href = decodeURIComponent(hrefMatch[1])

    // 相对路径
    const entryPath = href.replace(/^https?:\/\/[^/]+/, '').replace(/^\/[^/]+/, davPath)
    const name = entryPath.split('/').filter(Boolean).pop() || entryPath

    const isDirectory =
      block.includes('<D:resourcetype><D:collection') ||
      block.includes('<D:resourcetype><D:collection/')

    const sizeMatch = block.match(/<D:getcontentlength>([^<]+)<\/D:getcontentlength>/)
    const size = sizeMatch ? Number.parseInt(sizeMatch[1], 10) : isDirectory ? -1 : 0

    const modMatch = block.match(/<D:getlastmodified>([^<]+)<\/D:getlastmodified>/)
    let modifiedAt = 0
    if (modMatch) {
      modifiedAt = Date.parse(modMatch[1])
      if (Number.isNaN(modifiedAt)) modifiedAt = 0
    }

    entries.push({ name, path: entryPath, isDirectory, size, modifiedAt })
  }

  console.debug('[WebDAV] parsePropfindXml: entries', entries.length)
  return entries
}

export class WebDAVClient {
  readonly config: WebDAVConfig

  constructor(config: WebDAVConfig) {
    this.config = config
  }

  async test(): Promise<boolean> {
    try {
      const root = toDavPath(this.config, '')
      const res = await request(this.config, 'PROPFIND', root, propfindBody)
      if (res.status < 200 || res.status >= 400) {
        mapError(res.status, 'PROPFIND', root)
        return false
      }
      console.info('[WebDAV] test: OK')
      return true
    } catch (err) {
      console.error('[WebDAV] test failed:', err)
      throw err
    }
  }

  async list(key: string): Promise<WebDAVEntry[]> {
    const davPath = toDavPath(this.config, key)
    const finalPath = davPath.endsWith('/') ? davPath : `${davPath}/`
    console.debug('[WebDAV] list: davPath', finalPath)

    const res = await request(this.config, 'PROPFIND', finalPath, propfindBody)
    if (res.status < 200 || res.status >= 400) mapError(res.status, 'PROPFIND', finalPath)

    const entries = parsePropfindXml(res.body, finalPath)
    return entries.filter((e) => e.name && e.name !== '' && e.name !== '.')
  }

  async upload(key: string, data: Buffer): Promise<void> {
    const davPath = toDavPath(this.config, key)
    console.info('[WebDAV] upload: key', key, 'bytes', data.length)

    const parentPath = davPath.substring(0, davPath.lastIndexOf('/'))
    if (parentPath) {
      try {
        await this.mkdir(parentPath)
      } catch (err) {
        if (err instanceof WebDAVError && (err.code === 'CONFLICT' || err.status === 200)) {
          // ok
        } else throw err
      }
    }

    const res = await request(this.config, 'PUT', davPath, data)
    if (res.status < 200 || res.status >= 400) mapError(res.status, 'PUT', davPath)
    console.info('[WebDAV] upload: OK', davPath)
  }

  async download(key: string): Promise<Buffer> {
    const davPath = toDavPath(this.config, key)
    console.debug('[WebDAV] download: key', key)

    const url = new URL(davPath, this.config.baseUrl).toString()
    return new Promise((resolve, reject) => {
      const opts: Record<string, unknown> = {
        url,
        method: 'GET',
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64'),
        },
        timeout: 60_000,
      }
      const req = net.request(opts)

      // @ts-expect-error electron 43 ClientRequest type lacks setTimeout
      req.setTimeout(60_000, () => {
        // @ts-expect-error electron 43 ClientRequest type lacks destroy
        req.destroy()
        reject(new WebDAVError('TIMEOUT', 'download timeout (60s)', 0))
      })

      req.on('response', (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 400)) {
          mapError(res.statusCode, 'GET', davPath)
        }
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const buf = Buffer.concat(chunks)
          console.debug('[WebDAV] download: OK', davPath, buf.length, 'bytes')
          resolve(buf)
        })
        res.on('error', reject)
      })

      req.on('error', reject)
      req.end()
    })
  }

  async delete(key: string): Promise<void> {
    const davPath = toDavPath(this.config, key)
    console.debug('[WebDAV] delete: key', key)
    const res = await request(this.config, 'DELETE', davPath)
    if (res.status >= 200 && res.status < 300) return
    if (res.status === 404) {
      console.debug('[WebDAV] delete: not found, skip', key)
      return
    }
    mapError(res.status, 'DELETE', davPath)
  }

  async mkdir(key: string): Promise<void> {
    const davPath = toDavPath(this.config, key)
    const finalPath = davPath.endsWith('/') ? davPath : `${davPath}/`
    console.debug('[WebDAV] mkdir: key', key)
    try {
      const res = await request(this.config, 'MKCOL', finalPath)
      if (res.status === 409 || res.status === 200 || res.status === 201) {
        console.debug('[WebDAV] mkdir: already exists', key)
        return
      }
      if (res.status < 200 || res.status >= 400) mapError(res.status, 'MKCOL', finalPath)
    } catch (err) {
      if (err instanceof WebDAVError && err.code === 'CONFLICT') return
      throw err
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.list(key)
      return true
    } catch (err) {
      if (err instanceof WebDAVError && err.code === 'NOT_FOUND') return false
      console.error('[WebDAV] exists check failed:', err)
      throw err
    }
  }
}

const propfindBody = `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:displayname/>
    <D:getcontentlength/>
    <D:getlastmodified/>
    <D:resourcetype/>
  </D:prop>
</D:propfind>`
