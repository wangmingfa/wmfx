import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import sharp from 'sharp'

/**
 * 文件缩略图生成与磁盘缓存。
 *
 * 设计原则：
 * - 原图可能极大（gigapixel 图片可达数十 MB），直接返回原图会撑爆内存/渲染，
 *   因此统一用 sharp 缩放到 {@link THUMBNAIL_MAX_DIM} 的 webp 缩略图再返回。
 * - 生成结果按「绝对路径 + mtimeMs + size」哈希缓存到 userData/thumbnails/，
 *   命中缓存直接读文件，避免重复解码大图；源文件变化（mtime/size 变）会自然生成新键。
 * - 矢量图（svg）本身很小且需保持清晰，直接返回原文件，不做栅格化。
 */

/** 列表/网格缩略图最长边（像素），保证清晰度的同时控制体积 */
const THUMBNAIL_MAX_DIM = 320

/** Quick Look 预览最长边（像素），足够铺满预览面板，又避免把超大图全量塞进 <img> */
const PREVIEW_MAX_DIM = 2048

/** 允许解码的源文件上限（100 MB），超过视为异常文件，避免 sharp 解码占用过多内存 */
const MAX_SOURCE_SIZE = 100 * 1024 * 1024

/** 可用 sharp 栅格化并缓存的位图类型 → 原始 MIME（用于回退返回原图） */
const RASTER_MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
}

/** 直接原样返回（不栅格化）的矢量/小体积类型 */
const PASSTHROUGH_MIME_MAP: Record<string, string> = {
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
}

/** 缩略图请求的结果：二进制内容 + MIME；null 表示不支持或生成失败 */
export interface ThumbnailResult {
  buffer: Buffer
  mimeType: string
}

let cacheDirPromise: Promise<string> | null = null

/** 懒创建并复用缩略图缓存目录 userData/thumbnails/ */
function getCacheDir(): Promise<string> {
  if (!cacheDirPromise) {
    const dir = path.join(app.getPath('userData'), 'thumbnails')
    cacheDirPromise = fs.promises.mkdir(dir, { recursive: true }).then(() => dir)
  }
  return cacheDirPromise
}

/** 以「绝对路径 + mtime + size + 最长边」为缓存键，源文件或目标尺寸变更即失效 */
function cacheKey(resolved: string, mtimeMs: number, size: number, maxDim: number): string {
  return crypto
    .createHash('sha256')
    .update(`${resolved}:${mtimeMs}:${size}:${maxDim}`)
    .digest('hex')
}

/**
 * 生成缩放后的图片（webp）并磁盘缓存；矢量/图标直接原样返回。
 * @param resolved 已校验的绝对路径
 * @param maxDim 缩放最长边（列表缩略图与 Quick Look 预览用不同值）
 * @returns 成功返回缓冲区 + MIME；不支持的类型或生成失败返回 null。
 */
async function getScaledImage(resolved: string, maxDim: number): Promise<ThumbnailResult | null> {
  const stat = await fs.promises.stat(resolved)
  if (stat.isDirectory()) {
    console.debug('[Thumbnail] getScaledImage: 拒绝目录 %s', resolved)
    return null
  }
  if (stat.size > MAX_SOURCE_SIZE) {
    console.debug('[Thumbnail] getScaledImage: 源文件过大 %s size=%d', resolved, stat.size)
    return null
  }

  const ext = path.extname(resolved).slice(1).toLowerCase()

  // 矢量/图标：直接返回原文件（体积小，栅格化反而失真）
  const passthroughMime = PASSTHROUGH_MIME_MAP[ext]
  if (passthroughMime) {
    const buffer = await fs.promises.readFile(resolved)
    return { buffer, mimeType: passthroughMime }
  }

  if (!RASTER_MIME_MAP[ext]) {
    console.debug('[Thumbnail] getScaledImage: 不支持的类型 %s', ext)
    return null
  }

  const dir = await getCacheDir()
  const cacheFile = path.join(dir, `${cacheKey(resolved, stat.mtimeMs, stat.size, maxDim)}.webp`)

  // 命中缓存直接返回
  try {
    const cached = await fs.promises.readFile(cacheFile)
    console.debug('[Thumbnail] getScaledImage: 命中缓存 %s', cacheFile)
    return { buffer: cached, mimeType: 'image/webp' }
  } catch {
    // 未命中，继续生成
  }

  try {
    // 用首帧（动图）+ EXIF 方向校正，等比缩放到最长边，不放大小图
    const buffer = await sharp(resolved, { failOn: 'none', animated: false })
      .rotate()
      .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()

    // 写缓存失败不影响本次返回（如磁盘满/权限），仅记录
    fs.promises.writeFile(cacheFile, buffer).catch((err) => {
      console.debug('[Thumbnail] 写缓存失败 %s: %o', cacheFile, err)
    })
    console.debug(
      '[Thumbnail] getScaledImage: 生成 maxDim=%d %s bytes=%d',
      maxDim,
      resolved,
      buffer.length
    )
    return { buffer, mimeType: 'image/webp' }
  } catch (err) {
    console.debug('[Thumbnail] getScaledImage: sharp 生成失败 %s: %o', resolved, err)
    return null
  }
}

/**
 * 读取图片原始尺寸（仅解析元数据，不解码全图），失败返回 undefined。
 * 用于 Quick Look 元信息展示（W × H），即使超大图也能秒回，不影响预览本身。
 */
export async function getImageDimensions(
  resolved: string
): Promise<{ width: number; height: number } | undefined> {
  try {
    const meta = await sharp(resolved, { failOn: 'none' }).metadata()
    if (meta.width && meta.height) {
      return { width: meta.width, height: meta.height }
    }
  } catch (err) {
    console.debug('[Thumbnail] getImageDimensions: 读取尺寸失败 %s: %o', resolved, err)
  }
  return undefined
}

/** 列表/网格缩略图（最长边 {@link THUMBNAIL_MAX_DIM}） */
export function getThumbnail(resolved: string): Promise<ThumbnailResult | null> {
  return getScaledImage(resolved, THUMBNAIL_MAX_DIM)
}

/** Quick Look 预览图（最长边 {@link PREVIEW_MAX_DIM}），比缩略图更清晰 */
export function getPreview(resolved: string): Promise<ThumbnailResult | null> {
  return getScaledImage(resolved, PREVIEW_MAX_DIM)
}

/**
 * 原图直出（不缩放、不缓存），用于需要保留动画的场景（如 gif）。
 * 仍受 {@link MAX_SOURCE_SIZE} 上限保护。
 */
export async function getRawImage(resolved: string): Promise<ThumbnailResult | null> {
  const stat = await fs.promises.stat(resolved)
  if (stat.isDirectory() || stat.size > MAX_SOURCE_SIZE) {
    console.debug('[Thumbnail] getRawImage: 拒绝目录或过大 %s size=%d', resolved, stat.size)
    return null
  }
  const ext = path.extname(resolved).slice(1).toLowerCase()
  const mimeType = RASTER_MIME_MAP[ext] ?? PASSTHROUGH_MIME_MAP[ext]
  if (!mimeType) {
    console.debug('[Thumbnail] getRawImage: 不支持的类型 %s', ext)
    return null
  }
  const buffer = await fs.promises.readFile(resolved)
  return { buffer, mimeType }
}
