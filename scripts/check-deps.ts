#!/usr/bin/env bun
/**
 * 依赖检查（适配 bun）。
 * 检查 node_modules 是否存在、package.json 声明的依赖版本是否满足 semver 范围，
 * 不匹配时自动执行 bun install 并重检。
 */

import { execSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'
const RESET = '\x1b[0m'

type SemVerModule = typeof import('semver')

function getInstalledVersion(name: string): string | null {
  const d = path.join(ROOT, 'node_modules', name)
  try {
    const pkg = require(path.join(d, 'package.json'))
    return pkg.version || null
  } catch {
    return null
  }
}

function isSpecialDep(version: string): boolean {
  return /^(workspace:|file:|link:|git|git\+|github:|http)/.test(version)
}

function findMismatches(
  semver: SemVerModule | null
): Array<{ name: string; required: string; installed: string }> {
  const mismatches: Array<{ name: string; required: string; installed: string }> = []
  if (!semver) return mismatches
  const pkg = require(path.join(ROOT, 'package.json'))
  const deps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies }
  for (const [name, range] of Object.entries(deps)) {
    if (isSpecialDep(range)) continue
    const installed = getInstalledVersion(name)
    if (!installed) {
      mismatches.push({ name, required: range, installed: '(未安装)' })
      continue
    }
    if (!semver.satisfies(installed, range)) {
      mismatches.push({ name, required: range, installed })
    }
  }
  return mismatches
}

function ensureNodeModules(): boolean {
  if (!getInstalledVersion('semver')) {
    console.log(`${CYAN}[dev]${RESET} 未检测到依赖，正在执行 bun install ...`)
    try {
      execSync('bun install', { stdio: 'inherit', timeout: 180000 })
    } catch {
      console.log(`${RED}✗${RESET} 依赖安装失败，请手动运行 bun install`)
      return false
    }
  }
  return true
}

/**
 * dev 流程依赖的关键 CLI 工具（对应 node_modules/.bin/ 下的可执行文件）。
 * bun 在 Windows 上创建 .exe / .bunx 变体，在 macOS/Linux 上创建无后缀符号链接。
 */
const CRITICAL_BINS = ['electron-rebuild', 'tsup', 'vite']

/**
 * 检查 node_modules/.bin 目录是否存在且包含 dev 流程所需的关键可执行文件。
 * .bin 缺失通常意味着 bun install 未正常完成（如 postinstall 失败导致中断）。
 */
function ensureBinLinks(): boolean {
  const binDir = path.join(ROOT, 'node_modules', '.bin')
  if (!existsSync(binDir)) return false
  const entries = readdirSync(binDir)
  return CRITICAL_BINS.every((bin) => entries.some((f) => f.startsWith(bin)))
}

export async function checkDependencies(): Promise<boolean> {
  if (!ensureNodeModules()) return false
  let semver: SemVerModule | null = null
  try {
    semver = require('semver') as SemVerModule
  } catch {
    semver = null
  }
  if (!semver) {
    console.log(`${YELLOW}⚠${RESET} semver 模块损坏，正在重新安装依赖...`)
    try {
      execSync('bun install', { stdio: 'inherit', timeout: 180000 })
      semver = require('semver') as SemVerModule
    } catch {
      console.log(`${RED}✗${RESET} 依赖安装失败`)
      return false
    }
  }

  const mismatches = findMismatches(semver)
  if (mismatches.length === 0) {
    // 版本匹配后再检查 .bin 链接完整性，防止 install 部分失败导致 .bin 缺失
    if (!ensureBinLinks()) {
      console.log(`${YELLOW}⚠${RESET} node_modules/.bin 缺失或不完整，正在重新执行 bun install ...`)
      try {
        execSync('bun install', { stdio: 'inherit', timeout: 180000 })
      } catch {
        console.log(`${RED}✗${RESET} bun install 失败，请手动运行后重试`)
        return false
      }
      if (!ensureBinLinks()) {
        console.log(`${RED}✗${RESET} bun install 后 .bin 仍不完整，请删除 node_modules 后重新 bun install`)
        return false
      }
    }
    console.log(`${CYAN}[dev]${RESET} ${GREEN}✓${RESET} 依赖检查通过`)
    return true
  }

  console.log(`${RED}✗${RESET} 依赖版本不匹配，正在自动执行 bun install ...`)
  try {
    execSync('bun install', { stdio: 'inherit', timeout: 180000 })
    const recheck = findMismatches(semver)
    if (recheck.length > 0) {
      console.log(`${RED}✗${RESET} 安装后仍有 ${recheck.length} 个依赖版本不匹配，请手动处理`)
      return false
    }
    if (!ensureBinLinks()) {
      console.log(`${RED}✗${RESET} 安装后 .bin 仍不完整，请删除 node_modules 后重新 bun install`)
      return false
    }
    console.log(`${CYAN}[dev]${RESET} ${GREEN}✓${RESET} 依赖重新检查通过`)
    return true
  } catch {
    console.log(`${RED}✗${RESET} bun install 失败，请手动运行后重试`)
    return false
  }
}

if (import.meta.main) {
  await checkDependencies()
}
