/**
 * 主进程统一日志：覆盖 console 方法，为每条输出加上时间戳、[main]/[renderer] 标记与唯一 UUID，并持久化到日志文件。
 *
 * 日志文件（位于 app.getPath('userData')/logs）：
 *   实时文件（不带日期，始终同名，方便 tail -f）：
 *     main.log / error.log / main-backend.log / main-frontend.log / error-backend.log / error-frontend.log
 *   归档文件（带日期，仅含非今天的旧日志）：
 *     main-YYYY-MM-DD.log / error-YYYY-MM-DD.log / main-backend-YYYY-MM-DD.log ...
 *
 * 归档策略（按天 + UUID 去重）：
 *   - 每条日志在落盘时即分配一个 UUID（[id=...]），该 UUID 在「归档」「删除」两阶段都用来定位同一行，因此必须写入时生成。
 *   - 午夜定时触发一次归档：把实时文件里「非今天」的行按日期追加到对应归档文件；
 *     判断「是否已归档」只需看该行目标归档文件本身（一个 id 只落到 name-<日期>.log 这一个文件），
 *     懒加载并按文件名缓存该文件的已归档 id 集合，命中即跳过——即使上次归档被中断（进程被杀），
 *     重复行也不会写进归档，天然崩溃安全，且只读取实际出现的旧日期对应文件，无需全量扫描（归档文件本身即真相源）。
 *   - 归档阶段完全不改写实时文件：实时文件只追加，新日志照常写入，不阻塞、不丢；按行读取分片（时间预算 + 让出事件循环）。
 *   - 启动兜底跑一次归档（补上跨午夜未开应用的漏搬），随后做「启动清理」：
 *     把实时文件里「已归档的旧行」原子地（temp + rename）删掉，只保留今天的行，使实时文件保持精简。
 *     清理期间的新日志先缓冲，清理完成后 flush，保证不丢。
 *   - 归档文件保留 30 天，超期自动清理。
 *
 * 模块不自动初始化：须由调用方显式执行 initLogger() 覆写 console（见导出）。
 * 日志目录优先取 process.env.WMFX_LOG_DIR，便于单测指向临时目录而不加载 electron。
 */

import { randomBytes } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as readline from 'node:readline'
import type { LogEntry } from '@browser/ipc-contract'
import type { App } from 'electron'

type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
type Source = 'main' | 'renderer'

// 日志等级过滤（仅 dev 模式生效，生产包不设 WMFX_LOG_LEVEL → 全部保留）
const LEVEL_ORDER: Record<Level, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }
const MIN_LEVEL: Level = (process.env.WMFX_LOG_LEVEL?.toUpperCase() as Level) || 'DEBUG'
const MIN_LEVEL_NUM = LEVEL_ORDER[MIN_LEVEL] ?? 0

const LOG_NAMES = [
  'main',
  'error',
  'main-backend',
  'main-frontend',
  'error-backend',
  'error-frontend',
] as const
type LogName = (typeof LOG_NAMES)[number]

const RETENTION_DAYS = 30

// 单次归档分片的时间预算（毫秒）：读取超过该时长就先让出事件循环，避免大文件阻塞主进程。
const ARCHIVE_TIME_BUDGET_MS = 30
// 兜底行数分片：即使单批极快也定期让出，保证主进程响应式。
const ARCHIVE_CHUNK_LINES = 2000
const UUID_RE = /\[id=([0-9a-f]{32})\]/
const DATE_PREFIX_RE = /^\[(\d{4}-\d{2}-\d{2})\s/

// 日志目录可经环境变量覆盖（便于单测指向临时目录）；否则回退到 userData/logs。
const LOG_DIR_ENV = 'WMFX_LOG_DIR'

// electron 仅在运行期（未设 WMFX_LOG_DIR）才按需加载，单测设了 env 后永远不会 require 它。
let appRef: App | null = null
function getApp(): App {
  if (!appRef) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    appRef = require('electron').app as App
  }
  return appRef
}

const logDir = (): string => {
  const fromEnv = process.env[LOG_DIR_ENV]
  if (fromEnv) return fromEnv
  return path.join(getApp().getPath('userData'), 'logs')
}

let streamsOpen = false
const streams = new Map<LogName, fs.WriteStream>()

// 启动清理期间置位：此间新日志先缓冲，清理完成（原子重写实时文件）后再落盘，保证不丢。
let cleaning = false
let pending: Array<{ line: string; source: Source; level: Level }> = []
// 防止午夜归档与启动归档并发重叠。
let archiving = false

function openStreams(): void {
  if (streamsOpen) return
  const dir = logDir()
  fs.mkdirSync(dir, { recursive: true })
  for (const name of LOG_NAMES) {
    streams.set(name, fs.createWriteStream(path.join(dir, `${name}.log`), { flags: 'a' }))
  }
  streamsOpen = true
}

function openStreamsSafe(): void {
  try {
    openStreams()
  } catch {
    /* app.getPath 在未 ready 时可能失败，延后到下次 emit 再试 */
  }
}

/** 关闭并清空所有日志流（供单测 afterEach 清理，避免测试进程挂起）。 */
export function closeLogStreams(): void {
  for (const s of streams.values()) {
    // 吞掉异步打开/写入错误（如测试临时目录已被删除），避免变为 unhandledRejection
    s.on('error', () => {})
    try {
      s.destroy()
    } catch {
      /* ignore */
    }
  }
  streams.clear()
  streamsOpen = false
}

function dateStr(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseLineDate(line: string): string | null {
  const m = line.match(DATE_PREFIX_RE)
  return m ? m[1] : null
}

export function parseLineId(line: string): string | null {
  const m = line.match(UUID_RE)
  return m ? m[1] : null
}

function formatTimestamp(date: Date = new Date()): string {
  const pad = (n: number, len = 2): string => String(n).padStart(len, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function formatArg(arg: unknown): string {
  if (typeof arg === 'string') return arg
  if (arg instanceof Error) return `${arg.message}\n${arg.stack ?? ''}`
  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}

/** 生成一行完整日志：时间戳 [来源] [级别?] [id=UUID] 消息。UUID 在此写入时分配，归档/删除均靠它定位。 */
function formatLine(source: Source, level: Level, message: string): string {
  return `[${formatTimestamp()}] [${source}] [${level}] [id=${randomBytes(16).toString('hex')}] ${message}\n`
}

/** 按来源/级别把一行写入对应的实时文件（合并文件始终包含两端）。 */
function writeToFiles(source: Source, level: Level, line: string): void {
  const mainFiles = source === 'main' ? ['main', 'main-backend'] : ['main', 'main-frontend']
  for (const name of mainFiles) streams.get(name as LogName)?.write(line)

  if (level === 'ERROR') {
    const errFiles = source === 'main' ? ['error', 'error-backend'] : ['error', 'error-frontend']
    for (const name of errFiles) streams.get(name as LogName)?.write(line)
  }
}

function emit(source: Source, level: Level, message: string): void {
  if (LEVEL_ORDER[level] < MIN_LEVEL_NUM) return
  openStreamsSafe()
  const line = formatLine(source, level, message)

  // 控制台始终即时输出（ERROR/WARN 走 stderr）
  const consoleStream = level === 'ERROR' || level === 'WARN' ? process.stderr : process.stdout
  consoleStream.write(line)

  if (cleaning) {
    pending.push({ line, source, level })
    return
  }
  writeToFiles(source, level, line)
}

function write(level: Level, args: unknown[]): void {
  emit('main', level, args.map(formatArg).join(' '))
}

/** 主进程接收渲染进程转发来的日志条目后写入（由 ipc/register 调用）。 */
export function handleFrontendLog(entry: LogEntry): void {
  const level: Level =
    entry.level === 'error'
      ? 'ERROR'
      : entry.level === 'warn'
        ? 'WARN'
        : entry.level === 'debug'
          ? 'DEBUG'
          : 'INFO'
  emit('renderer', level, entry.message)
}

/**
 * 判断某行「是否已归档」时，只需看它目标归档文件本身：
 * 一个 id 只会落到 name-<日期>.log 这一个文件，因此按目标文件局部判断即可，
 * 无需扫描全部归档文件。这里按归档文件名懒加载并缓存「已归档 id 集合」，
 * 一轮归档内只读取 live 中实际出现的旧日期对应的那几个文件（通常仅昨天/前几天），
 * 文件量大时远比全量扫描快。集合写入后即更新缓存，保证同轮内不重复追加。
 */
export async function archiveOldLogs(): Promise<void> {
  if (archiving) return
  archiving = true
  const today = dateStr(new Date())
  const dir = logDir()
  // 归档文件名 -> 已归档 id 集合（懒加载缓存）
  const archivedCache = new Map<string, Set<string>>()
  const getArchived = async (file: string): Promise<Set<string>> => {
    const cached = archivedCache.get(file)
    if (cached) return cached
    const set = new Set<string>()
    try {
      const rl = readline.createInterface({ input: fs.createReadStream(path.join(dir, file)) })
      for await (const line of rl) {
        const id = parseLineId(line)
        if (id) set.add(id)
      }
    } catch {
      /* 文件不存在（首次归档该天）视为空集合 */
    }
    archivedCache.set(file, set)
    return set
  }

  try {
    for (const name of LOG_NAMES) {
      const live = path.join(dir, `${name}.log`)
      if (!fs.existsSync(live)) continue

      const rl = readline.createInterface({ input: fs.createReadStream(live) })
      const buckets = new Map<string, string[]>()
      let count = 0
      const chunkStart = Date.now()

      const flush = async (): Promise<void> => {
        for (const [d, lines] of buckets) {
          await fs.promises.appendFile(path.join(dir, `${name}-${d}.log`), `${lines.join('')}\n`)
        }
        buckets.clear()
      }

      for await (const line of rl) {
        if (!line) continue
        const d = parseLineDate(line)
        // 今天或无日期（无法判定）的行保留在实时文件，不归档
        if (d === null || d === today) continue
        const id = parseLineId(line)
        const archiveFile = `${name}-${d}.log`
        // 只在该行目标归档文件内判断是否已经归档，防重复
        const archived = await getArchived(archiveFile)
        if (id && archived.has(id)) continue
        if (!buckets.has(d)) buckets.set(d, [])
        buckets.get(d)!.push(line)
        if (id) archived.add(id)
        if (
          ++count % ARCHIVE_CHUNK_LINES === 0 &&
          Date.now() - chunkStart >= ARCHIVE_TIME_BUDGET_MS
        ) {
          await flush()
          await new Promise((r) => setImmediate(r))
        }
      }
      await flush()
    }
  } catch (e) {
    process.stderr.write(`[Logger] archive failed: ${String(e)}\n`)
  } finally {
    archiving = false
  }
}

/**
 * 启动清理：把实时文件里「已归档的旧行」原子删除，只保留今天的行，使实时文件保持精简。
 * 期间新日志先缓冲（cleaning 置位），重写完成（temp + rename）后 flush，保证不丢。
 */
export async function cleanupLive(): Promise<void> {
  cleaning = true
  const today = dateStr(new Date())
  const dir = logDir()
  try {
    for (const name of LOG_NAMES) {
      const live = path.join(dir, `${name}.log`)
      if (!fs.existsSync(live)) continue

      // 先把该文件流 flush 落盘，避免遗漏尚未写入磁盘的缓冲行
      const old = streams.get(name)
      if (old) {
        await new Promise<void>((resolve) => old.end(() => resolve()))
      }

      const rl = readline.createInterface({ input: fs.createReadStream(live) })
      const kept: string[] = []
      for await (const line of rl) {
        const d = parseLineDate(line)
        // 保留今天的行（无日期的行也保留，避免误删）
        if (d === null || d === today) kept.push(line)
      }

      // 原子重写：写临时文件再 rename 覆盖，避免清理过程中断留下半截文件
      const tmp = `${live}.clean`
      await fs.promises.writeFile(tmp, kept.length ? `${kept.join('\n')}\n` : '')
      fs.renameSync(tmp, live)
      streams.set(name, fs.createWriteStream(live, { flags: 'a' }))
    }
  } catch (e) {
    process.stderr.write(`[Logger] cleanup failed: ${String(e)}\n`)
  } finally {
    // 把清理期间产生的新日志补写进实时文件
    if (pending.length) {
      const buffered = pending
      pending = []
      for (const p of buffered) writeToFiles(p.source, p.level, p.line)
    }
    cleaning = false
  }
}

/** 清理超过保留期的日志文件：按文件最后修改时间（mtime）判断，不再解析文件名中的日期。 */
export async function cleanOldArchives(maxDays: number): Promise<void> {
  let entries: string[]
  try {
    entries = await fs.promises.readdir(logDir())
  } catch {
    return
  }
  const cutoff = Date.now() - maxDays * 24 * 60 * 60 * 1000
  // 实时文件是常开且持续写入的流，绝不可按 mtime 删除（否则已打开的流会写到被 unlink 的 inode 上导致丢日志）
  const liveNames = new Set(LOG_NAMES.map((n) => `${n}.log`))
  for (const f of entries) {
    if (!f.endsWith('.log')) continue
    if (liveNames.has(f)) continue
    const stat = await fs.promises.stat(path.join(logDir(), f))
    if (stat.mtimeMs < cutoff) {
      await fs.promises.unlink(path.join(logDir(), f)).catch(() => {})
    }
  }
}

/** 排到下一个午夜触发归档（仅追加归档，不改写实时文件），并循环排程。 */
function scheduleMidnight(): void {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5)
  const ms = next.getTime() - now.getTime()
  setTimeout(() => {
    void archiveOldLogs()
    scheduleMidnight()
  }, ms)
}

/** 启动时在控制台醒目地打印日志存储目录，方便排查时快速定位文件。 */
function printLogLocation(): void {
  const dir = logDir()
  const line = '════════════════════════════════════════════════════════════════════════'
  const banner = `\n${line}\n  日志文件存储位置 (Log Directory):\n    ${dir}\n${line}\n`
  process.stdout.write(`${banner}\n`)
}

/**
 * 启动日志归档：启动兜底归档一次 + 启动清理（删掉已归档旧行）+ 排午夜定时。
 * 须在 app ready 后调用（依赖 userData 路径）。
 */
export async function startLogRotation(): Promise<void> {
  openStreams()
  printLogLocation()
  await archiveOldLogs()
  await cleanupLive()
  await cleanOldArchives(RETENTION_DAYS)
  scheduleMidnight()
}

export function initLogger(): void {
  console.debug = (...args: unknown[]): void => write('DEBUG', args)
  console.log = (...args: unknown[]): void => write('INFO', args)
  console.info = (...args: unknown[]): void => write('INFO', args)
  console.warn = (...args: unknown[]): void => write('WARN', args)
  console.error = (...args: unknown[]): void => write('ERROR', args)
}
