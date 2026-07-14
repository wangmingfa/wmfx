#!/usr/bin/env bun
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PROJECT_ROOT = join(import.meta.dir, '..')
const MIHOMO_VERSION = 'v1.19.0'
const BASE_URL = `https://github.com/MetaCubeX/mihomo/releases/download/${MIHOMO_VERSION}`

const PLATFORM_MAP: Record<string, string> = {
  'darwin-arm64': 'darwin-arm64',
  'darwin-x64': 'darwin-x64',
  'linux-x64': 'linux-amd64',
  'win32-x64': 'windows-amd64',
}

function getPlatformKey(): string {
  return `${process.platform}-${process.arch}`
}

function getDownloadUrl(): string {
  const key = getPlatformKey()
  const mapped = PLATFORM_MAP[key]
  if (!mapped) throw new Error(`Unsupported platform: ${key}`)

  const ver = MIHOMO_VERSION
  const archiveName = mapped.startsWith('windows')
    ? `mihomo-${mapped}-${ver}.zip`
    : `mihomo-${mapped}-${ver}.gz`
  return `${BASE_URL}/${archiveName}`
}

async function download() {
  const key = getPlatformKey()
  const dir = join(PROJECT_ROOT, 'mihomo', key)
  mkdirSync(dir, { recursive: true })

  const binaryName = process.platform === 'win32' ? 'mihomo.exe' : 'mihomo'
  const targetPath = join(dir, binaryName)

  if (existsSync(targetPath)) {
    console.log(`✓ Mihomo already exists at ${targetPath}`)
    return
  }

  const url = getDownloadUrl()
  console.log(`Downloading mihomo from ${url}...`)

  if (process.platform === 'win32') {
    const tmpZip = join('/tmp', 'mihomo.zip')
    execSync(`curl -L "${url}" -o "${tmpZip}"`, { stdio: 'inherit' })
    execSync(
      `powershell -Command "Expand-Archive -Path '${tmpZip.replace(/\//g, '\\')}' -DestinationPath '${dir.replace(/\//g, '\\')}' -Force"`,
      { stdio: 'inherit' }
    )
    // 递归查找目录下第一个 .exe 文件
    function findExe(d: string): string | null {
      const entries = readdirSync(d)
      for (const entry of entries) {
        const fullPath = join(d, entry)
        const st = statSync(fullPath)
        if (st.isDirectory()) {
          const found = findExe(fullPath)
          if (found) return found
        }
        if (entry.endsWith('.exe')) return fullPath
      }
      return null
    }
    const exe = findExe(dir)
    if (exe) {
      execSync(`copy /Y "${exe.replace(/\//g, '\\')}" "${targetPath.replace(/\//g, '\\')}"`, {
        stdio: 'inherit',
      })
    }
    return
  }

  // macOS / Linux：使用系统自带 curl / gunzip / unzip / chmod
  const isZip = url.endsWith('.zip')
  if (isZip) {
    execSync(
      `curl -L "${url}" -o /tmp/mihomo.zip && unzip -o /tmp/mihomo.zip -d "${dir}" && chmod +x "${targetPath}"`,
      { stdio: 'inherit' }
    )
  } else {
    execSync(`curl -L "${url}" | gunzip > "${targetPath}" && chmod +x "${targetPath}"`, {
      stdio: 'inherit',
    })
  }

  console.log(`✓ Mihomo installed at ${targetPath}`)
}

download().catch(console.error)
