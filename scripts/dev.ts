#!/usr/bin/env bun

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  watch,
  writeFileSync,
} from 'node:fs'
import { rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ResultPromise } from 'execa'
import { execa, execaCommand, execaCommandSync } from 'execa'

const require = createRequire(import.meta.url)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const CYAN = '\x1b[36m'
const RESET = '\x1b[0m'

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
type LogLevel = (typeof LOG_LEVELS)[number]
let selectedLogLevel: LogLevel = 'debug'

/** 从 .env.local 读取上一次保存的日志等级（取最后一个匹配项），不存在则返回 'debug' */
function readLastLogLevel(): LogLevel {
  try {
    const content = readFileSync(path.join(ROOT, '.env.local'), 'utf-8')
    const matches = [...content.matchAll(/^\s*WMFX_LOG_LEVEL\s*=\s*([a-z]+)\s*$/gm)]
    const last = matches[matches.length - 1]
    if (last && LOG_LEVELS.includes(last[1] as LogLevel)) return last[1] as LogLevel
  } catch {
    /* .env.local 不存在时忽略 */
  }
  return 'debug'
}

/** 将用户选择的日志等级写入 .env.local，方便下次启动复用。逐行遍历，保留原位，去除多余重复行。 */
function writeLogLevel(level: LogLevel): void {
  try {
    const envLocalPath = path.join(ROOT, '.env.local')
    const lines = readFileSync(envLocalPath, 'utf-8').split('\n')
    const newLine = `WMFX_LOG_LEVEL=${level}`
    let replaced = false
    const result: string[] = []
    for (const line of lines) {
      if (/^\s*WMFX_LOG_LEVEL\s*=/.test(line)) {
        if (!replaced) {
          result.push(newLine)
          replaced = true
        }
      } else {
        result.push(line)
      }
    }
    if (!replaced) result.push(newLine)
    writeFileSync(envLocalPath, result.join('\n'), 'utf-8')
  } catch {
    /* 写入失败忽略 */
  }
}

async function promptLogLevel(): Promise<LogLevel> {
  const lastLevel = readLastLogLevel()
  const choices: { name: string; value: LogLevel }[] = [
    { name: 'debug  (所有日志)', value: 'debug' },
    { name: 'info   (info/warn/error)', value: 'info' },
    { name: 'warn   (warn/error)', value: 'warn' },
    { name: 'error  (仅 error)', value: 'error' },
  ]
  const defaultIdx = choices.findIndex((c) => c.value === lastLevel)
  console.log(`${CYAN}[dev]${RESET} 选择日志等级:`)
  choices.forEach((c, i) => {
    console.log(`  ${i + 1}. ${i === defaultIdx ? GREEN : ''}${c.name}${RESET}`)
  })

  return new Promise<LogLevel>((resolve) => {
    let remaining = 5
    let inputBuf = ''
    let resolved = false
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf-8')

    const prompt = () =>
      `\r${CYAN}[dev]${RESET} 输入数字 (1-${choices.length}) ${GREEN}${remaining}s${RESET} 后自动选中 ${GREEN}${lastLevel}${RESET}: ${inputBuf}`

    process.stdout.write(prompt())

    const timer = setInterval(() => {
      remaining--
      if (remaining <= 0) {
        cleanupStdin()
        console.log(`\n${CYAN}[dev]${RESET} ⏱️  超时，自动选择 ${GREEN}${lastLevel}${RESET}`)
        resolve(lastLevel)
      } else {
        process.stdout.write(prompt())
      }
    }, 1000)

    function cleanupStdin(): void {
      if (resolved) return
      resolved = true
      clearInterval(timer)
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdin.removeAllListeners('data')
    }

    process.stdin.on('data', (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\x03') {
          // Ctrl+C — 恢复 stdin 然后正常退出
          cleanupStdin()
          console.log(`\n${CYAN}[dev]${RESET} 已取消`)
          process.exit(0)
          return
        } else if (ch === '\x7F' || ch === '\b') {
          // Backspace
          inputBuf = inputBuf.slice(0, -1)
        } else if (ch === '\r' || ch === '\n') {
          // Enter
          cleanupStdin()
          const idx = parseInt(inputBuf, 10) - 1
          const level = idx >= 0 && idx < choices.length ? choices[idx].value : lastLevel
          console.log(`\n${CYAN}[dev]${RESET} 📋 日志等级: ${GREEN}${level}${RESET}`)
          resolve(level)
          return
        } else if (ch >= '1' && ch <= String(choices.length)) {
          inputBuf += ch
        }
      }
      process.stdout.write(prompt())
    })
  }).then((level) => {
    if (level !== lastLevel) writeLogLevel(level)
    return level
  })
}

let devServerUrl = ''
let electronProcess: ResultPromise | null = null
let restartTimer: ReturnType<typeof setTimeout> | null = null
let isRestarting = false
let startupComplete = false
/** 重启连续失败次数，超过阈值则放弃重启并 cleanup */
let restartFailCount = 0
const MAX_RESTART_FAILS = 3

const childProcesses: ResultPromise[] = []

function run(command: string, cwd: string, env: NodeJS.ProcessEnv = {}): ResultPromise {
  const p = execaCommand(command, { cwd, stdio: 'inherit', env: { ...process.env, ...env } })
  childProcesses.push(p)
  return p
}

function resolveElectronBinary(): string {
  return require('electron')
}

function startElectron(): void {
  // 取消尚未执行的重启请求，避免刚启动就被下一轮 restart 杀掉
  if (restartTimer) {
    clearTimeout(restartTimer)
    restartTimer = null
  }
  isRestarting = false

  const binary = resolveElectronBinary()
  const entry = path.join(ROOT, 'apps/main/dist/index.cjs')
  console.log(`${CYAN}[dev]${RESET} 🖥️  启动 Electron: ${binary} ${entry} [log=${selectedLogLevel}]`)
  // 将 Electron 的 stdout/stderr 重定向到文件，避免 orchestrator 退出后
  // Electron 仍在写终端导致日志混在 shell prompt 之后
  const electronLogPath = path.join(ROOT, '.dev-electron.log')
  const electronFd = require('node:fs').openSync(electronLogPath, 'a')
  electronProcess = execa(binary, [entry], {
    cwd: ROOT,
    stdio: ['inherit', electronFd, electronFd, 'ipc'],
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: devServerUrl,
      WMFX_LOG_LEVEL: selectedLogLevel,
    },
  }) as unknown as ResultPromise

  if (!electronProcess) return

  electronProcess.catch((err) => {
    // SIGTERM 是正常重启信号（旧进程被 kill），不视为错误
    if (err.killed) return
    console.error(`${RED}[dev] Electron 启动失败:`, err.message)
    cleanup()
  })
  electronProcess.on('close', (code: number | null) => {
    electronProcess = null

    if (isRestarting) {
      isRestarting = false
      // 新进程启动后立即退出，说明启动失败
      if (code !== null && code !== 0) {
        restartFailCount++
        console.error(
          `${RED}[dev]${RESET} Electron 重启失败 (尝试 ${restartFailCount}/${MAX_RESTART_FAILS})，code=${code}`
        )
        if (restartFailCount >= MAX_RESTART_FAILS) {
          console.error(
            `${RED}[dev]${RESET} 连续重启失败 ${restartFailCount} 次，放弃重启，清理退出`
          )
          cleanup()
          return
        }
        // 继续尝试重启
        restartElectron()
        return
      }
      restartFailCount = 0
      return
    }

    if (code !== null && code !== 0) {
      console.log(`${RED}[dev]${RESET} Electron 退出，code=${code}`)
      cleanup()
    } else {
      console.log('🛑 Electron 关闭，正在清理...')
      cleanup()
    }
  })
}

/**
 * 重启 Electron：
 * 1. kill 旧进程 → 等待其完全退出（含 Mihomo 子进程清理），超时则直接 cleanup
 * 2. 短暂延迟让端口完全释放
 * 3. 启动新进程
 */
async function restartElectron(): Promise<void> {
  if (!startupComplete) return
  if (restartTimer) clearTimeout(restartTimer)

  // 异步执行，避免阻塞 tsup watch 回调
  restartTimer = setTimeout(async () => {
    isRestarting = true
    if (!electronProcess) {
      isRestarting = false
      startElectron()
      return
    }

    console.log(`${CYAN}[dev]${RESET} 🔄 重启 Electron...`)
    electronProcess.kill()

    // 等待旧进程完全退出，最多 5 秒
    await Promise.race([
      new Promise<void>((resolve) => {
        electronProcess?.once('close', () => resolve())
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ])

    // 注意：electronProcess 可能已被 close handler 置为 null
    const stillRunning = electronProcess !== null && !electronProcess.killed
    if (stillRunning) {
      console.error(`${RED}[dev]${RESET} 旧 Electron 进程未响应 kill，强制退出并清理`)
      try {
        electronProcess.kill('SIGKILL')
      } catch {
        /* ignore */
      }
      cleanup()
      return
    }

    electronProcess = null

    // 短暂延迟让 Mihomo 子进程和端口完全释放
    await new Promise((r) => setTimeout(r, 200))

    startElectron()
  }, 300)
}

function watchMainDist(): void {
  const distDir = path.join(ROOT, 'apps/main/dist')
  try {
    watch(distDir, { recursive: true }, (_eventType: string, filename: string | null) => {
      if (filename?.endsWith('.cjs')) {
        console.log(`📝 主进程变化: ${filename}`)
        restartElectron()
      }
    })
    console.log(`👀 监听 ${path.relative(ROOT, distDir)}/ 变化以重启 Electron`)
  } catch (err) {
    console.error('监听主进程 dist 失败:', err)
  }
}

/**
 * 创建 workspace 包的 node_modules 软链接
 *
 * 原因：bun 的 workspace 解析是虚拟的（不创建 node_modules 里的 symlink），
 * 但 Electron 直接运行时走 Node.js 的 require 机制，无法解析 workspace 包。
 * 需要在 node_modules 下手动建立 symlink，让 @wmfx/database、@browser/proxy 等包可被导入。
 *
 * 扫描 package.json 中的 workspaces 字段（apps/*, packages/*），
 * 读取每个子包的 name 字段，在 node_modules/<scope>/<pkg-name> 创建 symlink。
 */
function linkWorkspacePackages(): void {
  const nodeModules = path.join(ROOT, 'node_modules')
  const workspaces = ['apps/*', 'packages/*']
  const linked = new Set<string>()

  for (const pattern of workspaces) {
    const parentDir = pattern.split('/')[0]
    for (const entry of readdirSync(path.join(ROOT, parentDir))) {
      const pkgPath = path.join(ROOT, parentDir, entry)
      const pkgJsonPath = path.join(pkgPath, 'package.json')
      if (!existsSync(pkgJsonPath)) continue

      try {
        const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as { name?: string }
        const name = pkgJson.name
        if (!name) continue

        const scope = name.split('/')[0]
        const scopedDir = path.join(nodeModules, scope)
        const linkPath = path.join(scopedDir, name.split('/')[1])
        const relativeTarget = path.relative(scopedDir, pkgPath)

        mkdirSync(scopedDir, { recursive: true })
        // 先删除已存在的旧 symlink，避免 symlinkSync 因已存在而抛错
        if (existsSync(linkPath)) unlinkSync(linkPath)
        symlinkSync(relativeTarget, linkPath)
        linked.add(name)
      } catch {
        /* skip packages without valid package.json */
      }
    }
  }

  if (linked.size > 0) {
    console.log(`${CYAN}[dev]${RESET} 🔗 workspace 软链接已创建: ${[...linked].join(', ')}`)
  }
}

/**
 * 每个包的初次构建产物清单，用于「等所有 watch 首次构建完成」的轮询检查。
 * 依据各包 tsup.config.ts 的 entry/format/outExtension 得出。
 */
const DEP_PACKAGE_OUTPUTS: string[] = [
  path.join(ROOT, 'packages/shared/dist/index.js'),
  path.join(ROOT, 'packages/ipc-contract/dist/index.js'),
  path.join(ROOT, 'packages/database/dist/index.cjs'),
  path.join(ROOT, 'packages/proxy/dist/index.js'),
]
const MAIN_OUTPUTS: string[] = [
  path.join(ROOT, 'apps/main/dist/index.cjs'),
  path.join(ROOT, 'apps/main/dist/preload.cjs'),
]
const BUILD_OUTPUTS = [...DEP_PACKAGE_OUTPUTS, ...MAIN_OUTPUTS]

/**
 * 轮询等待给定产物文件全部出现（每个 200ms 检查一次），超时则报错退出。
 * 用于确认某批 tsup --watch 的首次构建已完成。
 */
async function waitForOutputs(outputs: string[], timeoutMs: number): Promise<void> {
  const start = Date.now()
  const remaining = new Set(outputs)
  while (remaining.size > 0) {
    for (const out of [...remaining]) {
      if (existsSync(out)) remaining.delete(out)
    }
    if (remaining.size === 0) return
    if (Date.now() - start > timeoutMs) {
      const missing = [...remaining].map((p) => path.relative(ROOT, p)).join(', ')
      console.log(`${RED}✗${RESET} 等待构建超时，缺失产物: ${missing}`)
      process.exit(1)
    }
    await new Promise((r) => setTimeout(r, 200))
  }
}

/**
 * 启动开发期构建编排：
 *  1. 清理所有 dist（避免旧产物被误判为「已构建」）
 *  2. 并发启动 4 个依赖包 watch，等它们首次构建全部完成
 *  3. 再启动 apps/main watch（此时依赖产物已就绪，主进程 build 不会解析失败），等其完成
 *
 * 主进程依赖前面四个包，因此分两阶段顺序等待：先依赖、后主进程。
 * 任意时刻同一 dist/ 最多一个 tsup 实例在写，消除 ENOENT / 解析失败竞争。
 */
async function startWatchesAndWait(): Promise<void> {
  const timeoutMs = 60_000
  console.log(`${CYAN}[dev]${RESET} 🧹 清理所有 dist 目录...`)
  // 并发删除各 dist 目录（Promise 版 rm），任一不存在则忽略
  await Promise.all(
    BUILD_OUTPUTS.map((out) => rm(path.dirname(out), { recursive: true, force: true }))
  )

  console.log(`${CYAN}[dev]${RESET} 📦 并发启动依赖包 tsup --watch（shared/ipc/database/proxy）`)
  run('bun x tsup --watch', path.join(ROOT, 'packages/shared'))
  run('bun x tsup --watch', path.join(ROOT, 'packages/ipc-contract'))
  run('bun x tsup --watch', path.join(ROOT, 'packages/database'))
  run('bun x tsup --watch', path.join(ROOT, 'packages/proxy'))
  await waitForOutputs(DEP_PACKAGE_OUTPUTS, timeoutMs)
  console.log(`${CYAN}[dev]${RESET} ${GREEN}✅${RESET} 依赖包初次构建完成`)

  console.log(`${CYAN}[dev]${RESET} 📦 启动主进程 tsup --watch（依赖已就绪）`)
  run('bun x tsup --watch', path.join(ROOT, 'apps/main'))
  await waitForOutputs(MAIN_OUTPUTS, timeoutMs)
  console.log(`${CYAN}[dev]${RESET} ${GREEN}✅${RESET} 主进程初次构建完成`)
}

/**
 * 检查指定端口是否被占用，若被占用则直接 kill 占用进程。
 * 跨平台：macOS/Linux 用 lsof，Windows 用 netstat + taskkill。
 */
async function ensurePortFree(port: number): Promise<void> {
  console.log(`${CYAN}[dev]${RESET} 🔍 检查端口 ${port}...`)
  try {
    const check = await execaCommand(
      process.platform === 'win32' ? `netstat -ano | findstr :${port}` : `lsof -ti tcp:${port}`,
      { cwd: ROOT, timeout: 5000 }
    )
    if (check.stdout.trim()) {
      const pids = check.stdout
        .trim()
        .split(/\r?\n/)
        .map((l) => {
          const m = l.trim().match(/(\d+)$/m)
          return m ? m[1] : l.trim()
        })
        .filter(Boolean)
      console.log(
        `${RED}══════════════════════════════════════════════════════════════════${RESET}`
      )
      console.log(`${RED} ⚠️  端口 ${port} 已被占用，已终止以下进程：${pids.join(', ')}${RESET}`)
      console.log(
        `${RED}══════════════════════════════════════════════════════════════════${RESET}`
      )
      for (const pid of pids) {
        try {
          await execaCommand(
            process.platform === 'win32' ? `taskkill //PID ${pid} //F` : `kill -9 ${pid}`,
            { timeout: 5000 }
          )
        } catch {
          /* ignore already-dead */
        }
      }
    } else {
      console.log(`${CYAN}[dev]${RESET} ✅ 端口 ${port} 可用`)
    }
  } catch {
    console.log(`${CYAN}[dev]${RESET} ✅ 端口 ${port} 可用`)
  }
}

async function main(): Promise<void> {
  // 先创建/初始化 .env.local（promptLogLevel 会读取其中的 WMFX_LOG_LEVEL）
  const envLocalPath = path.join(ROOT, '.env.local')
  const envExamplePath = path.join(ROOT, '.env.example')
  if (!existsSync(envLocalPath)) {
    const content = readFileSync(envExamplePath, 'utf-8')
    writeFileSync(envLocalPath, content, 'utf-8')
    console.log(`${CYAN}[dev]${RESET} 📝 已创建 .env.local（从 .env.example 复制）`)
  }

  // 确保 .env.local 中配置了 VITE_DEV_PORT 且有值，否则自动赋默认值
  let envLocalContent = readFileSync(envLocalPath, 'utf-8')
  const portMatch = envLocalContent.match(/^\s*VITE_DEV_PORT\s*=\s*(.*?)\s*$/m)
  if (!portMatch || portMatch[1].trim() === '') {
    if (portMatch) {
      envLocalContent = envLocalContent.replace(/^\s*VITE_DEV_PORT\s*=.*$/m, 'VITE_DEV_PORT=24680')
    } else {
      envLocalContent = `${envLocalContent}\nVITE_DEV_PORT=24680\n`
    }
    writeFileSync(envLocalPath, envLocalContent, 'utf-8')
    console.log(`${CYAN}[dev]${RESET} 📝 已设置 .env.local 默认端口 VITE_DEV_PORT=24680`)
  }

  // 选择日志等级（WMFX_LOG_LEVEL 的读写统一在 promptLogLevel 中处理）
  selectedLogLevel = await promptLogLevel()

  // promptLogLevel 可能修改了 .env.local，重新读取确保后续使用最新内容
  envLocalContent = readFileSync(envLocalPath, 'utf-8')

  // 先创建 workspace 软链接，否则 Electron 无法导入 workspace 包（如 @wmfx/database）
  linkWorkspacePackages()

  // 读取端口号并检查是否被占用
  const finalPortMatch = envLocalContent.match(/^\s*VITE_DEV_PORT\s*=\s*(\d+)\s*$/m)
  const devPort = finalPortMatch ? parseInt(finalPortMatch[1], 10) : 24680
  await ensurePortFree(devPort)

  // 开发期开启 console 源码位置注入（仅 dev，生产构建不设此变量）
  process.env.WMFX_DEV_INSTRUMENT = '1'

  console.log(`${CYAN}[dev]${RESET} 🔍 检查 better-sqlite3 原生模块...`)
  const { needsRebuild } = await import('./check-native.ts')
  if (needsRebuild()) {
    console.log(`${CYAN}[dev]${RESET} 🔧 需要重建原生模块...`)
    try {
      execaCommandSync('bun run rebuild', { cwd: ROOT, stdio: 'inherit' })
    } catch {
      console.log(`${RED}✗${RESET} 原生模块重建失败`)
      process.exit(1)
    }
  }

  // 生成图标类型文件（从已安装的图标包提取所有 icon 名称）
  console.log(`${CYAN}[dev]${RESET} 🎨 生成图标类型文件...`)
  try {
    execaCommandSync('bunx tsx scripts/generate-icon-types.ts', { cwd: ROOT, stdio: 'inherit' })
  } catch {
    console.log(`${RED}✗${RESET} 图标类型生成失败（非致命，继续启动）`)
  }

  console.log(`${CYAN}[dev]${RESET} 🚀 启动渲染进程 Vite dev server...`)
  const vite = execaCommand('bun run --filter @browser/renderer dev', {
    cwd: ROOT,
    stdio: ['inherit', 'pipe', 'inherit'],
    env: { ...process.env, VITE_DEV_PORT: String(devPort) },
  })
  childProcesses.push(vite)

  const viteReady = new Promise<string>(
    (resolve: (v: string) => void, reject: (e: Error) => void) => {
      let buf = ''
      const timeout = setTimeout(() => reject(new Error('Vite 30s 内未就绪')), 30000)
      const stdout = vite.stdout as NodeJS.ReadableStream | null
      const stderr = vite.stderr as NodeJS.ReadableStream | null
      stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        process.stdout.write(text)
        buf += text
        const match = buf.match(/http:\/\/localhost:\d+/)
        if (match) {
          clearTimeout(timeout)
          resolve(match[0])
        }
      })
      stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk))
    }
  )

  // 并发启动全部 tsup --watch 并等待首次构建全部完成（清理 dist → 各 watch 自建）
  await startWatchesAndWait()

  viteReady
    .then((url) => {
      devServerUrl = url
      console.log(`${CYAN}[dev]${RESET} ${GREEN}✅${RESET} Vite 就绪: ${devServerUrl}`)
      startElectron()
      // 延迟启用 watch，让 tsup 初次构建完成，避免重启 Electron
      setTimeout(() => {
        startupComplete = true
        watchMainDist()
      }, 1000)
    })
    .catch((err) => {
      console.error('❌', err.message)
      cleanup()
    })
}

/** 优雅关闭：先通知 Electron 优雅退出 → 再关 vite/tsup → 最后退场 */
async function cleanup(): Promise<void> {
  // 1. 先通知 Electron 优雅退出（走 before-quit → will-quit 流程），renderer 正常断开 vite
  if (electronProcess && !electronProcess.killed) {
    try {
      electronProcess.send('dev:shutdown')
    } catch {
      /* IPC 通道已不可用 */
    }
    await Promise.race([
      new Promise<void>((resolve) => {
        electronProcess?.once('close', () => resolve())
        electronProcess?.once('exit', () => resolve())
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ])
    if (electronProcess && !electronProcess.killed) {
      electronProcess.kill()
    }
    electronProcess = null
  }

  // 2. 关掉 vite + tsup
  for (const p of childProcesses) {
    try {
      if (!p.killed) p.kill()
    } catch {
      /* ignore */
    }
  }

  // 3. 退场
  console.log()
  process.exit(0)
}

process.on('SIGINT', async () => {
  await cleanup()
})
process.on('SIGTERM', async () => {
  await cleanup()
})

main()
