#!/usr/bin/env bun
/**
 * 依赖检查（适配 bun）。
 * 移植自 meat-desktop/scripts/check-deps.ts，将 npm 指令替换为 bun。
 * 检查 node_modules 是否存在、package.json 声明的依赖版本是否满足 semver 范围，
 * 不匹配时自动执行 bun install 并重检。
 */

import { execSync } from 'node:child_process'
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
    console.log(`${CYAN}[dev]${RESET} ${GREEN}✓${RESET} 依赖重新检查通过`)
    return true
  } catch {
    console.log(`${RED}✗${RESET} bun install 失败，请手动运行后重试`)
    return false
  }
}
// test
