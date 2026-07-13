#!/usr/bin/env bun
import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

const dirs = [
  'node_modules',
  'apps/*/dist',
  'apps/*/node_modules',
  'packages/*/dist',
  'packages/*/node_modules',
  'mihomo',
  '.vite',
  '.vitest',
  'coverage',
  'test-results',
  'playwright-report',
]

for (const pattern of dirs) {
  if (pattern.includes('*')) {
    const [parent, dir] = pattern.split('/*/')
    const parentDir = resolve(ROOT, parent)
    if (!existsSync(parentDir)) continue
    const { readdirSync } = await import('node:fs')
    for (const entry of readdirSync(parentDir)) {
      const target = resolve(parentDir, entry, dir)
      if (existsSync(target)) {
        rmSync(target, { recursive: true, force: true })
        console.log(`  removed ${parent}/${entry}/${dir}`)
      }
    }
  } else {
    const target = resolve(ROOT, pattern)
    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true })
      console.log(`  rm -rf ${pattern}`)
    }
  }
}
