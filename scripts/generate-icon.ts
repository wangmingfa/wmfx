#!/usr/bin/env bun
/**
 * 从 resources/icons/logo.png 生成各平台应用图标，按操作系统分目录存放：
 * - macOS:   resources/icons/macos/icon.png（1024x1024，带留白+圆角，electron-builder 会据此生成 icns）
 * - Windows: resources/icons/windows/icon.ico（1024x1024 圆角 PNG 转换）
 * - Linux:   resources/icons/linux/ 下的多尺寸圆角 PNG（electron-builder 直接使用）
 *
 * 参考 meat-desktop/scripts/generate-dock-icon.ts 的 sharp 用法，
 * Windows 用 png2icons 生成 ico 这类平台专属容器格式。
 * 所有图标统一加圆角：用 rounded-rect 遮罩以 destination-in 混合裁出圆角。
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import png2icons from 'png2icons'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')

const SOURCE_ICON = join(PROJECT_ROOT, 'resources', 'icons', 'logo.png')
const OUTPUT_DIR = join(PROJECT_ROOT, 'resources', 'icons')
const MACOS_DIR = join(OUTPUT_DIR, 'macos')
const WINDOWS_DIR = join(OUTPUT_DIR, 'windows')
const LINUX_DIR = join(OUTPUT_DIR, 'linux')

const MAC_CANVAS_SIZE = 1024
const MAC_CONTENT_SIZE = 824
const MAC_PADDING = (MAC_CANVAS_SIZE - MAC_CONTENT_SIZE) / 2
const LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024]

/**
 * 生成带圆角的图标 PNG（返回 Buffer）。
 * @param size        画布边长（正方形）
 * @param padding     内容四周留白像素（留白区保持透明，不参与圆角）
 * @param radiusRatio 圆角半径占「内容区」边长的比例（0~0.5）
 *
 * 实现：先按比例缩放 logo 到内容区并居中铺在透明画布，再用 rounded-rect 遮罩
 * 以 destination-in 混合裁出圆角，圆角外（含留白）变透明。
 */
async function roundedIcon(
  sourcePath: string,
  opts: { size: number; padding?: number; radiusRatio?: number }
): Promise<Buffer> {
  const padding = opts.padding ?? 0
  const radiusRatio = opts.radiusRatio ?? 0.2
  const content = opts.size - padding * 2
  const radius = Math.round(content * radiusRatio)

  const base = sharp(sourcePath)
    .resize(content, content, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })

  const mask = Buffer.from(
    `<svg width="${opts.size}" height="${opts.size}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="${padding}" y="${padding}" width="${content}" height="${content}" rx="${radius}" ry="${radius}" fill="#000"/>` +
      `</svg>`
  )

  return base
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()
}

async function generatePlatformIcons(): Promise<void> {
  if (!existsSync(SOURCE_ICON)) {
    console.error('源图标不存在:', SOURCE_ICON)
    process.exit(1)
  }
  if (!existsSync(MACOS_DIR)) mkdirSync(MACOS_DIR, { recursive: true })
  if (!existsSync(WINDOWS_DIR)) mkdirSync(WINDOWS_DIR, { recursive: true })
  if (!existsSync(LINUX_DIR)) mkdirSync(LINUX_DIR, { recursive: true })

  // macOS：留白 + 圆角（参考 meat-desktop 的 Dock 图标观感）
  const macBuf = await roundedIcon(SOURCE_ICON, {
    size: MAC_CANVAS_SIZE,
    padding: MAC_PADDING,
    radiusRatio: 0.18,
  })
  writeFileSync(join(MACOS_DIR, 'icon.png'), macBuf)
  console.log(`  mac: ${join(MACOS_DIR, 'icon.png')}`)

  // Windows：全幅 + 圆角，转 .ico
  const winBuf = await roundedIcon(SOURCE_ICON, { size: 1024, padding: 0, radiusRatio: 0.2 })
  const ico = png2icons.createICO(winBuf, png2icons.BICUBIC, 0, true, true)
  if (ico) {
    writeFileSync(join(WINDOWS_DIR, 'icon.ico'), ico)
    console.log(`  win: ${join(WINDOWS_DIR, 'icon.ico')}`)
  } else {
    console.error('生成 .ico 失败')
  }

  // Linux：多尺寸 + 圆角
  console.log('  linux:')
  for (const size of LINUX_SIZES) {
    const out = join(LINUX_DIR, `${size}x${size}.png`)
    const buf = await roundedIcon(SOURCE_ICON, { size, padding: 0, radiusRatio: 0.2 })
    writeFileSync(out, buf)
    console.log(`  linux: ${out}`)
  }

  console.log('\n图标生成完成')
}

generatePlatformIcons().catch((error) => {
  console.error('生成图标失败:', error)
  process.exit(1)
})
