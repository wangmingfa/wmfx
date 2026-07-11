#!/usr/bin/env bun

import { watch } from 'node:fs'
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

async function main(): Promise<void> {
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

  console.log(`${CYAN}[dev]${RESET} 📦 启动 shared / ipc-contract 实时构建 (tsup --watch)`)
  run('bun x tsup --watch', path.join(ROOT, 'packages/shared'))
  run('bun x tsup --watch', path.join(ROOT, 'packages/ipc-contract'))

  console.log(`${CYAN}[dev]${RESET} 🔍 检查 better-sqlite3 原生模块...`)
  try {
    execaCommandSync('bun run scripts/check-native.ts', { cwd: ROOT, stdio: 'inherit' })
  } catch {
    console.log(`${CYAN}[dev]${RESET} 🔧 需要重建原生模块...`)
    try {
      execaCommandSync('bun run rebuild', { cwd: ROOT, stdio: 'inherit' })
    } catch {
      console.log(`${RED}✗${RESET} 原生模块重建失败`)
      process.exit(1)
    }
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
