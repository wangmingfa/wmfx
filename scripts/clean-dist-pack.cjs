/**
 * 打包前清理 dist-pack 目录，带重试机制。
 * Windows 上杀毒软件/资源管理器/索引服务可能短暂锁定文件，
 * 导致 rmSync 报 EBUSY/EPERM，重试几次即可。
 */
const { rmSync, existsSync } = require('node:fs')
const { resolve } = require('node:path')

const target = resolve(__dirname, '..', 'dist-pack')

if (!existsSync(target)) {
  console.log('[clean-dist-pack] dist-pack 不存在，跳过')
  return
}

const MAX_RETRIES = 5
const RETRY_DELAY = 1000

for (let i = 1; i <= MAX_RETRIES; i++) {
  try {
    rmSync(target, { recursive: true, force: true })
    console.log('[clean-dist-pack] 清理完成')
    return
  } catch (err) {
    const isLocked = err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'ENOTEMPTY'
    if (!isLocked || i === MAX_RETRIES) {
      console.error(`[clean-dist-pack] 清理失败 (${err.code})，electron-builder 会自行处理或报错`)
      return
    }
    console.warn(`[clean-dist-pack] 文件被锁定，${RETRY_DELAY}ms 后重试 (${i}/${MAX_RETRIES})...`)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_DELAY)
  }
}
