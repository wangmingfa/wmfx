import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  archiveOldLogs,
  cleanOldArchives,
  cleanupLive,
  closeLogStreams,
  parseLineDate,
  parseLineId,
} from './logger'

const LOG_NAMES = [
  'main',
  'error',
  'main-backend',
  'main-frontend',
  'error-backend',
  'error-frontend',
]

function ymd(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return ymd(d)
}
function line(date: string, id: string, msg = 'x'): string {
  return `[${date} 00:00:00] [main] [INFO] [id=${id}] ${msg}\n`
}

let tmp: string

beforeEach(() => {
  // 指向临时目录，日志模块不会加载 electron
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wmfx-log-'))
  process.env.WMFX_LOG_DIR = tmp
})

afterEach(() => {
  closeLogStreams()
  fs.rmSync(tmp, { recursive: true, force: true })
  delete process.env.WMFX_LOG_DIR
})

describe('parseLineDate / parseLineId', () => {
  it('解析日期与 32 位十六进制 id', () => {
    const l = line('2026-07-12', 'abcdef0123456789abcdef0123456789', 'hello')
    expect(parseLineDate(l)).toBe('2026-07-12')
    expect(parseLineId(l)).toBe('abcdef0123456789abcdef0123456789')
  })
  it('无日期 / 无 id 时返回 null', () => {
    expect(parseLineDate('no date here')).toBeNull()
    expect(parseLineId('[2026-07-12 00:00:00] [main] [INFO] msg')).toBeNull()
  })
})

describe('archiveOldLogs', () => {
  it('把非今天的行按日期追加到对应归档文件，今日行留在实时文件', async () => {
    fs.writeFileSync(
      path.join(tmp, 'main.log'),
      line(daysAgo(1), 'a'.repeat(32)) + line(ymd(new Date()), 'b'.repeat(32))
    )
    await archiveOldLogs()
    const archive = fs.readFileSync(path.join(tmp, `main-${daysAgo(1)}.log`), 'utf8')
    expect(archive).toContain('a'.repeat(32))
    const live = fs.readFileSync(path.join(tmp, 'main.log'), 'utf8')
    expect(live).toContain('b'.repeat(32)) // 今日行仍在实时文件
    expect(live).toContain('a'.repeat(32)) // 归档阶段不改写实时文件
  })

  it('目标归档文件已含该 id 时跳过，不重复归档（崩溃恢复）', async () => {
    const old = daysAgo(3)
    const id = 'c'.repeat(32)
    // 预置归档文件（模拟上次已归档）
    fs.writeFileSync(path.join(tmp, `main-${old}.log`), line(old, id, 'archived'))
    // 实时文件里又有同一 id 的旧行
    fs.writeFileSync(path.join(tmp, 'main.log'), line(old, id, 'archived'))
    await archiveOldLogs()
    const archive = fs.readFileSync(path.join(tmp, `main-${old}.log`), 'utf8')
    const count = archive.split(id).length - 1
    expect(count).toBe(1) // 没有重复写入
  })

  it('同一轮内第二次遇到同 id 也不会重复', async () => {
    const old = daysAgo(2)
    const id = 'd'.repeat(32)
    fs.writeFileSync(path.join(tmp, 'main.log'), line(old, id) + line(old, id))
    await archiveOldLogs()
    const archive = fs.readFileSync(path.join(tmp, `main-${old}.log`), 'utf8')
    expect(archive.split(id).length - 1).toBe(1)
  })
})

describe('cleanupLive', () => {
  it('原子清理后实时文件只保留今日行', async () => {
    const today = ymd(new Date())
    fs.writeFileSync(
      path.join(tmp, 'main.log'),
      line(daysAgo(1), 'e'.repeat(32)) +
        line(today, 'f'.repeat(32)) +
        line(daysAgo(5), 'g'.repeat(32))
    )
    // 先把旧行归档，使其进入归档文件
    await archiveOldLogs()
    await cleanupLive()
    const live = fs.readFileSync(path.join(tmp, 'main.log'), 'utf8')
    expect(live).toContain('f'.repeat(32)) // 今日保留
    expect(live).not.toContain('e'.repeat(32)) // 旧行删除
    expect(live).not.toContain('g'.repeat(32))
    // 归档文件仍含旧行
    expect(fs.readFileSync(path.join(tmp, `main-${daysAgo(1)}.log`), 'utf8')).toContain(
      'e'.repeat(32)
    )
    expect(fs.readFileSync(path.join(tmp, `main-${daysAgo(5)}.log`), 'utf8')).toContain(
      'g'.repeat(32)
    )
  })
})

describe('cleanOldArchives', () => {
  it('按 mtime 删除超期归档文件，并保留实时文件', async () => {
    const oldArchive = path.join(tmp, `main-${daysAgo(40)}.log`)
    const freshArchive = path.join(tmp, `main-${daysAgo(1)}.log`)
    fs.writeFileSync(oldArchive, 'old\n')
    fs.writeFileSync(freshArchive, 'fresh\n')
    // 把旧归档的 mtime 拨到 40 天前
    const t = Date.now() - 40 * 24 * 60 * 60 * 1000
    fs.utimesSync(oldArchive, new Date(t), new Date(t))
    // 实时文件即使很旧也绝不被删
    const live = path.join(tmp, 'main.log')
    fs.writeFileSync(live, 'live\n')
    fs.utimesSync(live, new Date(t), new Date(t))

    await cleanOldArchives(30)

    expect(fs.existsSync(oldArchive)).toBe(false)
    expect(fs.existsSync(freshArchive)).toBe(true)
    expect(fs.existsSync(live)).toBe(true)
  })

  it('所有 6 个实时文件都不会被删除', async () => {
    const t = Date.now() - 100 * 24 * 60 * 60 * 1000
    for (const name of LOG_NAMES) {
      const f = path.join(tmp, `${name}.log`)
      fs.writeFileSync(f, 'x\n')
      fs.utimesSync(f, new Date(t), new Date(t))
    }
    await cleanOldArchives(30)
    for (const name of LOG_NAMES) {
      expect(fs.existsSync(path.join(tmp, `${name}.log`))).toBe(true)
    }
  })
})
