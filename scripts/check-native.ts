#!/usr/bin/env bun
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getAbi } from 'node-abi'

const ROOT = resolve(import.meta.dirname, '..')

function getElectronVersion(): string {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'))
  const ver = (pkg.devDependencies?.electron || pkg.dependencies?.electron || '').replace(
    /^[\^~]/,
    ''
  )
  return ver
}

function getBuiltAbi(pkg: string): number | null {
  const metaPath = resolve(ROOT, 'node_modules', pkg, 'build/Release/.forge-meta')
  if (!existsSync(metaPath)) return null
  const meta = readFileSync(metaPath, 'utf-8').trim()
  const parts = meta.split('--')
  return parts.length === 2 ? Number.parseInt(parts[1], 10) : null
}

function main(): void {
  const electronVer = getElectronVersion()
  const targetAbi = Number.parseInt(getAbi(electronVer, 'electron'), 10)
  const builtAbi = getBuiltAbi('better-sqlite3')

  if (builtAbi === null) {
    console.log(`⚠️  better-sqlite3 未重建，需要执行 bun run rebuild`)
    process.exit(1)
  }

  if (builtAbi === targetAbi) {
    console.log(`✅ better-sqlite3 已适配 Electron ABI ${targetAbi}`)
    process.exit(0)
  }

  console.log(
    `⚠️  better-sqlite3 ABI ${builtAbi} ≠ Electron ABI ${targetAbi}，需要执行 bun run rebuild`
  )
  process.exit(1)
}

main()
