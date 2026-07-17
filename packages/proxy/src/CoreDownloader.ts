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
  if (existsSync(mihomoDir)) {
    console.debug(`[CoreDownloader] getBaseResourcePath: using resourcesPath base=${base}`)
    return base
  }
  const projectRoot = join(process.cwd())
  if (existsSync(join(projectRoot, 'mihomo', getPlatformArchDir()))) {
    console.debug(`[CoreDownloader] getBaseResourcePath: using projectRoot=${projectRoot}`)
    return projectRoot
  }
  console.debug(`[CoreDownloader] getBaseResourcePath: falling back to base=${base}`)
  return base
}

export function getMihomoBinaryPath(): string {
  const dir = join(getBaseResourcePath(), 'mihomo', getPlatformArchDir())
  const path = join(dir, getBinaryName())
  console.debug(`[CoreDownloader] getMihomoBinaryPath: ${path}`)
  return path
}

export function isMihomoDownloaded(): boolean {
  return existsSync(getMihomoBinaryPath())
}

export async function downloadMihomo(resourcePath: string): Promise<string> {
  console.debug(`[CoreDownloader] downloadMihomo: resourcePath=${resourcePath}`)
  const dir = join(resourcePath, 'mihomo', getPlatformArchDir())
  mkdirSync(dir, { recursive: true })

  const binaryName = getBinaryName()
  const targetPath = join(dir, binaryName)

  if (existsSync(targetPath)) {
    console.debug(`[CoreDownloader] downloadMihomo: binary already exists at ${targetPath}`)
    return targetPath
  }

  const downloadUrl = `${BASE_URL}/${binaryName}`
  console.debug(`[CoreDownloader] downloadMihomo: url=${downloadUrl}, target=${targetPath}`)

  throw new Error(
    `Mihomo binary not found at ${targetPath}. ` +
      `Run 'bun run download:cores' or download manually from ${BASE_URL}`
  )
}
