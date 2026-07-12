#!/usr/bin/env bun
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

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

  const archiveName = mapped.startsWith('windows') ? `mihomo-${mapped}.zip` : `mihomo-${mapped}.gz`
  return `${BASE_URL}/${archiveName}`
}

async function download() {
  const key = getPlatformKey()
  const dir = join(process.cwd(), 'resources', 'mihomo', key)
  mkdirSync(dir, { recursive: true })

  const binaryName = process.platform === 'win32' ? 'mihomo.exe' : 'mihomo'
  const targetPath = join(dir, binaryName)

  if (existsSync(targetPath)) {
    console.log(`✓ Mihomo already exists at ${targetPath}`)
    return
  }

  const url = getDownloadUrl()
  console.log(`Downloading mihomo from ${url}...`)

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
