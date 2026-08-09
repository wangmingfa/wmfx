/**
 * 打包前清理 dist-pack 目录，带重试机制。
 * Windows 上杀毒软件/资源管理器/索引服务可能短暂锁定文件，
 * 导致 rmSync 报 EBUSY/EPERM，重试几次即可。
 */
import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const target = resolve(import.meta.dirname, '..', 'dist-pack')

if (!existsSync(target)) {
  console.log('[clean-dist-pack] dist-pack 不存在，跳过')
  process.exit(0)
}

const MAX_RETRIES = 5
const RETRY_DELAY = 1000

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
    console.warn(`[clean-dist-pack] 文件被锁定，${RETRY_DELAY}ms 后重试 (${i}/${MAX_RETRIES})...`)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_DELAY)
  }
}
