import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getMihomoBinaryPath, isMihomoDownloaded } from './CoreDownloader'

const ORIG_PLATFORM = process.platform
const ORIG_ARCH = process.arch
const ORIG_RP = (process as unknown as { resourcesPath?: string }).resourcesPath

function mockPlatform(platform: string, arch: string, resourcesPath: string): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  Object.defineProperty(process, 'arch', { value: arch, configurable: true })
  Object.defineProperty(process, 'resourcesPath', {
    value: resourcesPath,
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  mockPlatform(ORIG_PLATFORM, ORIG_ARCH, ORIG_RP as string)
})

describe('CoreDownloader 二进制路径解析', () => {
  it('win32 使用 mihomo.exe 且按 platform-arch 拼出路径', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wmfx-core-'))
    mockPlatform('win32', 'x64', tmp)
    mkdirSync(join(tmp, 'mihomo', 'win32-x64'), { recursive: true })
    expect(getMihomoBinaryPath()).toBe(join(tmp, 'mihomo', 'win32-x64', 'mihomo.exe'))
    expect(isMihomoDownloaded()).toBe(false)
    rmSync(tmp, { recursive: true, force: true })
  })

  it('非 win32 使用无后缀的 mihomo 二进制名', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wmfx-core-'))
    mockPlatform('darwin', 'arm64', tmp)
    mkdirSync(join(tmp, 'mihomo', 'darwin-arm64'), { recursive: true })
    expect(getMihomoBinaryPath()).toBe(join(tmp, 'mihomo', 'darwin-arm64', 'mihomo'))
    rmSync(tmp, { recursive: true, force: true })
  })

  it('二进制文件存在时 isMihomoDownloaded 返回 true', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wmfx-core-'))
    mockPlatform('linux', 'x64', tmp)
    const dir = join(tmp, 'mihomo', 'linux-x64')
    mkdirSync(dir, { recursive: true })
    expect(isMihomoDownloaded()).toBe(false)
    writeFileSync(join(dir, 'mihomo'), '')
    expect(isMihomoDownloaded()).toBe(true)
    rmSync(tmp, { recursive: true, force: true })
  })
})
