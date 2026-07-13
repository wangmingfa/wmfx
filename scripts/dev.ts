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
  const binary = resolveElectronBinary()
  const entry = path.join(ROOT, 'apps/main/dist/index.cjs')
  console.log(`${CYAN}[dev]${RESET} 🖥️  启动 Electron: ${binary} ${entry}`)
  electronProcess = execa(binary, [entry], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: devServerUrl },
  })

  electronProcess.catch((err) => {
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

async function main(): Promise<void> {
  // 先创建 workspace 软链接，否则 Electron 无法导入 workspace 包（如 @wmfx/database）
  linkWorkspacePackages()

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

  console.log(
    `${CYAN}[dev]${RESET} 📦 启动 shared / ipc-contract / database / proxy 实时构建 (tsup --watch)`
  )
  run('bun x tsup --watch', path.join(ROOT, 'packages/shared'))
  run('bun x tsup --watch', path.join(ROOT, 'packages/ipc-contract'))
  run('bun x tsup --watch', path.join(ROOT, 'packages/database'))
  run('bun x tsup --watch', path.join(ROOT, 'packages/proxy'))

  console.log(`${CYAN}[dev]${RESET} 🔨 构建依赖包 (初次)`)
  try {
    execaCommandSync('bun run build:shared', { cwd: ROOT, stdio: 'inherit' })
    execaCommandSync('bun run build:ipc', { cwd: ROOT, stdio: 'inherit' })
    execaCommandSync('bun run build:database', { cwd: ROOT, stdio: 'inherit' })
    execaCommandSync('bun run build:proxy', { cwd: ROOT, stdio: 'inherit' })
  } catch {
    console.log(`${RED}✗${RESET} 依赖包初次构建失败`)
    process.exit(1)
  }

  console.log(`${CYAN}[dev]${RESET} 🔨 构建主进程 (初次)`)
  try {
    execaCommandSync('bun run build', { cwd: path.join(ROOT, 'apps/main'), stdio: 'inherit' })
  } catch {
    console.log(`${RED}✗${RESET} 主进程初次构建失败`)
    process.exit(1)
  }
  run('bun x tsup --watch', path.join(ROOT, 'apps/main'))

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
