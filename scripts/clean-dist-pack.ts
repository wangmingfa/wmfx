/**
 * 打包前清理 dist-pack 目录。
 *
 * 先杀掉从 dist-pack 启动的进程（上次打包的 WMFX 可能还在运行），
 * 再带重试删除目录。Windows 上杀毒/索引服务也可能短暂锁定文件。
 */

import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const target = resolve(import.meta.dirname, '..', 'dist-pack')

if (!existsSync(target)) {
  console.log('[clean-dist-pack] dist-pack 不存在，跳过')
  process.exit(0)
}

/** 杀掉从 dist-pack 目录启动的进程（Windows） */
function killProcessesInDistPack() {
  if (process.platform !== 'win32') return
  // 用 PowerShell 查找可执行路径在 dist-pack 下的进程并终止
  const result = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like '${target.replace(/\\/g, '\\\\')}*' } | ForEach-Object { Write-Host "killing $($_.ProcessId) $($_.Name)"; Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
    ],
    { encoding: 'utf8', timeout: 10000 }
  )
  if (result.stdout?.trim()) {
    console.log(result.stdout.trim())
  }
}

/** 同步等待 */
function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

const MAX_RETRIES = 5
const RETRY_DELAY = 1000

// 第一次尝试前先杀进程
console.log('[clean-dist-pack] 检查并终止占用进程...')
killProcessesInDistPack()
sleep(500)

for (let i = 1; i <= MAX_RETRIES; i++) {
  try {
    rmSync(target, { recursive: true, force: true })
    console.log('[clean-dist-pack] 清理完成')
    process.exit(0)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    const isLocked = code === 'EBUSY' || code === 'EPERM' || code === 'ENOTEMPTY'
    if (!isLocked || i === MAX_RETRIES) {
      console.error(`[clean-dist-pack] 清理失败 (${code})，electron-builder 会自行处理或报错`)
      process.exit(0)
    }
    // 重试时再次尝试杀进程
    killProcessesInDistPack()
    console.warn(`[clean-dist-pack] 文件被锁定，${RETRY_DELAY}ms 后重试 (${i}/${MAX_RETRIES})...`)
    sleep(RETRY_DELAY)
  }
}
