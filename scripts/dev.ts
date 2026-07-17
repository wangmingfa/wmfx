#!/usr/bin/env bun

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  watch,
} from 'node:fs'
import { rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ResultPromise } from 'execa'
import { execa, execaCommand, execaCommandSync } from 'execa'
import inquirer from 'inquirer'

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

async function promptLogLevel(): Promise<LogLevel> {
  console.log(`${CYAN}[dev]${RESET} 选择日志等级 (5 秒后自动选中 ${GREEN}debug${RESET}):`)
  const timeout = new Promise<LogLevel>((resolve) =>
    setTimeout(() => {
      console.log(`\n${CYAN}[dev]${RESET} ⏱️  超时，自动选择 ${GREEN}debug${RESET}`)
      resolve('debug')
    }, 5000)
  )
  const picker = inquirer
    .prompt<{ level: LogLevel }>({
      type: 'select',
      name: 'level',
      message: '日志等级:',
      choices: [
        { name: 'debug  (所有日志)', value: 'debug' },
        { name: 'info   (info/warn/error)', value: 'info' },
        { name: 'warn   (warn/error)', value: 'warn' },
        { name: 'error  (仅 error)', value: 'error' },
      ],
      default: 'debug',
    })
    .then((a) => a.level)
  return Promise.race([timeout, picker])
}

let devServerUrl = ''
let electronProcess: ResultPromise | null = null
let restartTimer: ReturnType<typeof setTimeout> | null = null
let isRestarting = false
let startupComplete = false

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
  electronProcess = execa(binary, [entry], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: devServerUrl,
      WMFX_LOG_LEVEL: selectedLogLevel,
    },
  })

  electronProcess.catch((err) => {
    // SIGTERM 是正常重启信号，不视为错误
    if (err.killed) return
    console.error(`${RED}[dev] Electron 启动失败:`, err.message)
    cleanup()
  })
  electronProcess.on('close', (code: number | null) => {
    electronProcess = null
    if (isRestarting) {
      isRestarting = false
      startElectron()
    } else if (code !== null && code !== 0) {
      console.log(`${RED}[dev]${RESET} Electron 退出，code=${code}`)
    } else {
      console.log('🛑 Electron 关闭，正在清理...')
      cleanup()
    }
  })
}

function restartElectron(): void {
  if (!startupComplete) return // tsup 初次构建期间不重启
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = setTimeout(() => {
    isRestarting = true
    if (electronProcess) {
      console.log(`${CYAN}[dev]${RESET} 🔄 重启 Electron...`)
      electronProcess.kill()
    } else {
      isRestarting = false
      startElectron()
    }
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

async function main(): Promise<void> {
  // 选择日志等级
  selectedLogLevel = await promptLogLevel()
  console.log(`${CYAN}[dev]${RESET} 📋 日志等级: ${GREEN}${selectedLogLevel}${RESET}\n`)

  // 先创建 workspace 软链接，否则 Electron 无法导入 workspace 包（如 @wmfx/database）
  linkWorkspacePackages()

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

function cleanup(): void {
  if (electronProcess) {
    electronProcess.kill()
  }
  for (const p of childProcesses) {
    try {
      p.kill()
    } catch {
      /* ignore */
    }
  }
  process.exit(0)
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)

main()
