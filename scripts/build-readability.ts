#!/usr/bin/env bun
/**
 * 将 CommonJS 的 @mozilla/readability 打包为自包含 IIFE，产物写入
 * resources/readability.js，暴露全局 Readability。供阅读模式在页面内
 * 通过 executeJavaScript 注入使用（Task 2 会 fs.readFile 读取该产物）。
 */

import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { build } from 'esbuild'

const ROOT = resolve(import.meta.dirname, '..')
const OUTFILE = resolve(ROOT, 'resources/readability.js')

const outDir = dirname(OUTFILE)
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: [require.resolve('@mozilla/readability/Readability.js')],
  bundle: true,
  format: 'iife',
  globalName: 'Readability',
  outfile: OUTFILE,
  logLevel: 'info',
})

console.log(`[build-readability] 打包完成: 产物 ${OUTFILE}`)
