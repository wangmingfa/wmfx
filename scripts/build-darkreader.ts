#!/usr/bin/env bun
/**
 * 将 darkreader 自带的 UMD 产物拷贝到 resources/darkreader.js，暴露全局 DarkReader。
 *
 * 为什么是"拷贝"而不是"esbuild 二次打包"：
 * - darkreader 包主入口（darkreader.js）本身已是 UMD，专为 `<script>` / 页面注入设计，
 *   执行时直接 `factory(globalThis.DarkReader = {})` 挂全局，无需再打包。
 * - 若用 esbuild 以 globalName=DarkReader 再包一层，会生成
 *   `var DarkReader = (() => {...})()` 且 IIFE 无 return；executeJavaScript 的求值作用域
 *   里该 var 是函数作用域局部变量（值为 undefined），会遮蔽 UMD 挂到 globalThis 上的
 *   DarkReader，导致后续 `DarkReader.enable(...)` 报 "reading 'enable' of undefined"。
 *
 * 供强制暗色在外部页面内通过 executeJavaScript 注入使用（PageEnhanceManager 会
 * fs.readFile 读取该产物，再调用 DarkReader.enable/disable 开关暗色）。
 */

import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const SRC = require.resolve('darkreader')
const OUTFILE = resolve(ROOT, 'resources/darkreader.js')

mkdirSync(dirname(OUTFILE), { recursive: true })
copyFileSync(SRC, OUTFILE)

console.log(`[build-darkreader] 拷贝完成: ${SRC} → ${OUTFILE}`)
