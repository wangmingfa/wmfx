import { WMFX_SCHEME_NAME } from '@browser/shared'
import { protocol, session } from 'electron'
import { validatePath } from './file-browser-manager'
import { getPreview, getRawImage, getThumbnail, type ThumbnailResult } from './thumbnail'

/**
 * wmfx:// 自定义协议：为文件浏览器提供图片缩略图 / 预览 / 原图直出。
 *
 * 关键设计：
 * - scheme 必须在 app.whenReady() 之前通过 registerSchemesAsPrivileged 声明为 standard，
 *   否则 `<img src="wmfx://...">` / fetch 会报 ERR_UNKNOWN_URL_SCHEME。
 * - 声明为 standard 后，URL 按标准格式解析：`wmfx://<host>?path=<file>`，
 *   其中 host（file-thumbnail / file-preview / file-raw）即端点名，用 url.hostname 匹配
 *   （不是 pathname，standard scheme 会把首段解析为 host）。
 * - 实际图片处理委托给 thumbnail.ts（sharp 缩放 + 磁盘缓存），本文件只做路由与响应封装。
 */

/** 缩略图端点：列表/网格用小图（sharp 缩放到 320px webp，带缓存） */
const THUMBNAIL_HOST = 'file-thumbnail'
/** 预览端点：Quick Look 用大图（sharp 缩放到 2048px webp，带缓存） */
const PREVIEW_HOST = 'file-preview'
/** 原图端点：原样直出（保留动图动画，如 gif），不缩放不缓存 */
const RAW_HOST = 'file-raw'

/**
 * 在 app.whenReady() 之前调用：把 wmfx 声明为 standard/secure scheme，
 * 使渲染进程能通过 <img>/fetch 加载 wmfx:// 资源。必须早于 whenReady，否则协议不被识别。
 */
export function registerWmfxSchemePrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: WMFX_SCHEME_NAME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ])
  console.debug('[WmfxProtocol] scheme 已声明为 privileged: %s', WMFX_SCHEME_NAME)
}

/** 把 ThumbnailResult 封装为成功的 web Response；null 结果由调用方处理 */
function toResponse(result: ThumbnailResult): Response {
  return new Response(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      'Content-Type': result.mimeType,
      'Content-Length': String(result.buffer.length),
      'Cache-Control': 'no-cache',
    },
  })
}

/**
 * 处理 wmfx:// 请求：按 host 分发到缩略图 / 预览 / 原图。
 * 供 session.protocol.handle() 使用。
 */
async function handleWmfxRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const host = url.hostname
  const filePath = url.searchParams.get('path')

  if (host !== THUMBNAIL_HOST && host !== PREVIEW_HOST && host !== RAW_HOST) {
    console.debug('[WmfxProtocol] 未知 host: %s', host)
    return new Response(null, { status: 404 })
  }
  if (!filePath) {
    console.debug('[WmfxProtocol] %s: 缺少 path 参数', host)
    return new Response(null, { status: 400 })
  }

  try {
    const resolved = validatePath(filePath)
    let result: ThumbnailResult | null
    if (host === THUMBNAIL_HOST) {
      result = await getThumbnail(resolved)
    } else if (host === PREVIEW_HOST) {
      result = await getPreview(resolved)
    } else {
      result = await getRawImage(resolved)
    }

    if (!result) {
      console.debug('[WmfxProtocol] %s: 不支持或生成失败 %s', host, resolved)
      return new Response(null, { status: 415 })
    }
    return toResponse(result)
  } catch (err) {
    console.debug('[WmfxProtocol] %s error: %o', host, err)
    return new Response(null, { status: 404 })
  }
}

/**
 * 在指定 session 上注册 wmfx:// 协议处理器。
 * 使用 session.protocol.handle()（现代 API，替代已废弃的 protocol.registerStreamProtocol）。
 */
function registerOnSession(sess: Electron.Session): void {
  try {
    sess.protocol.handle(WMFX_SCHEME_NAME, handleWmfxRequest)
    console.debug('[WmfxProtocol] registered on session')
  } catch {
    // scheme 已在此 session 上注册（重复调用安全）
  }
}

/**
 * 注册 wmfx:// 协议处理器（需在 app.whenReady() 之后调用）。
 *
 * 渲染进程用 `<img src="wmfx://file-thumbnail?path=/Users/.../test.png">`
 * 直接展示文件缩略图，加载失败时浏览器自动显示破损图标。
 *
 * 逐 session 注册，覆盖 default session（主窗口 UI）和 SessionManager 创建的分区 session
 * （文件浏览器标签页使用 persist:default 等分区）。
 */
export function registerWmfxProtocol(): void {
  // 注册到 default session（主窗口 UI 的 webContents 使用 default session）
  registerOnSession(session.defaultSession)

  // 注册到后续创建的分区 session（文件浏览器标签页使用 persist:default 等分区）
  const { getSharedSessionManager } = require('./window-manager')
  const sessionManager = getSharedSessionManager()
  sessionManager.onSessionReady((sess: Electron.Session) => {
    registerOnSession(sess)
  })

  console.debug('[WmfxProtocol] wmfx:// 协议注册完成')
}
