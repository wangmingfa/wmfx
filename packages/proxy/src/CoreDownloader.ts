import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const MIHOMO_VERSION = 'v1.19.0'
const BASE_URL = `https://github.com/MetaCubeX/mihomo/releases/download/${MIHOMO_VERSION}`

function getBinaryName(): string {
  return process.platform === 'win32' ? 'mihomo.exe' : 'mihomo'
}

function getPlatformArchDir(): string {
  return `${process.platform}-${process.arch}`
}

function getBaseResourcePath(): string {
  const rp = (process as unknown as Record<string, unknown>).resourcesPath
  const base = typeof rp === 'string' ? rp : process.cwd()
  const mihomoDir = join(base, 'mihomo', getPlatformArchDir())
  if (existsSync(mihomoDir)) return base
  const projectRoot = join(process.cwd())
  if (existsSync(join(projectRoot, 'mihomo', getPlatformArchDir()))) return projectRoot
  return base
}

export function getMihomoBinaryPath(): string {
  const dir = join(getBaseResourcePath(), 'mihomo', getPlatformArchDir())
  return join(dir, getBinaryName())
}

export function isMihomoDownloaded(): boolean {
  return existsSync(getMihomoBinaryPath())
}

export async function downloadMihomo(resourcePath: string): Promise<string> {
  const dir = join(resourcePath, 'mihomo', getPlatformArchDir())
  mkdirSync(dir, { recursive: true })

  const binaryName = getBinaryName()
  const targetPath = join(dir, binaryName)

  if (existsSync(targetPath)) {
    return targetPath
  }

  throw new Error(
    `Mihomo binary not found at ${targetPath}. ` +
      `Run 'bun run download:cores' or download manually from ${BASE_URL}`
  )
}
