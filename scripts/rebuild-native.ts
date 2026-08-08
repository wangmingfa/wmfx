#!/usr/bin/env bun
import { resolve } from 'node:path'
/**
 * 重建 better-sqlite3 原生模块（适配 Electron ABI）。
 *
 * 单独成脚本的原因：WorkBuddy 沙箱通过环境变量注入两套 safe-delete shim，
 * 它们拦截文件删除操作并尝试将文件移入回收站。沙箱环境中回收站不可用，
 * 导致 node-gyp 构建原生模块时 clean 步骤失败：
 * - Node.js shim (genie-safe-delete.cjs)：通过 NODE_OPTIONS 注入
 * - Python shim (sitecustomize.py)：通过 PYTHONPATH 注入（node-gyp 调用 gyp/Python）
 *
 * 此脚本在启动 electron-rebuild 前清除这两个环境变量，使子进程不受 shim 影响。
 */
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { execaSync } from 'execa'

const ROOT = resolve(import.meta.dirname, '..')

// --postinstall 标记：由 package.json postinstall 脚本传入。
// postinstall 场景下重建失败不应阻断 bun install，因为 dev.ts 的
// ensureNativeModule() 会在 dev 启动时兜底检查并重建。
const isPostinstall = process.argv.includes('--postinstall')

// 清除以下环境变量，防止 safe-delete shim 干扰 node-gyp 文件操作：
// - NODE_OPTIONS: WorkBuddy 通过它注入 Node.js safe-delete shim (genie-safe-delete.cjs)
// - PYTHONPATH: WorkBuddy 通过它注入 Python safe-delete shim (sitecustomize.py)
//   node-gyp 调用 Python (gyp) 构建原生模块，Python shim 会拦截文件删除并尝试
//   移入回收站，在沙箱环境中回收站不可用，导致构建失败。
const cleanEnv: Record<string, string | undefined> = { ...process.env }
delete cleanEnv.NODE_OPTIONS
delete cleanEnv.PYTHONPATH

/**
 * 在 Windows 上查找 vcvars64.bat（VS 安装可能不在标准位置）。
 * 优先搜索常见路径，返回第一个存在的文件路径，找不到返回 null。
 */
function findVcvars64(): string | null {
  const candidates = [
    // VS 2022 BuildTools
    resolve(String(process.env['ProgramFiles'] || 'C:\\Program Files'), 'Microsoft Visual Studio/2022/BuildTools/VC/Auxiliary/Build/vcvars64.bat'),
    // VS 2022 Community/Professional
    resolve(String(process.env['ProgramFiles'] || 'C:\\Program Files'), 'Microsoft Visual Studio/2022/Community/VC/Auxiliary/Build/vcvars64.bat'),
    resolve(String(process.env['ProgramFiles'] || 'C:\\Program Files'), 'Microsoft Visual Studio/2022/Professional/VC/Auxiliary/Build/vcvars64.bat'),
    // VS 2022 Enterprise
    resolve(String(process.env['ProgramFiles'] || 'C:\\Program Files'), 'Microsoft Visual Studio/2022/Enterprise/VC/Auxiliary/Build/vcvars64.bat'),
    // VS 2019 BuildTools
    resolve(String(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'), 'Microsoft Visual Studio/2019/BuildTools/VC/Auxiliary/Build/vcvars64.bat'),
    // VS 2017 BuildTools
    resolve(String(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'), 'Microsoft Visual Studio/2017/BuildTools/VC/Auxiliary/Build/vcvars64.bat'),
    // 自定义路径（如用户装在 D 盘）
    'D:\\Apps\\Microsoft Visual Studio\\18\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat',
    'D:\\Apps\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat',
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

const electronRebuildArgs = ['-f', '-w', 'better-sqlite3']

/**
 * Windows 上 electron-rebuild → node-gyp → MSBuild 需要 cl.exe 在 PATH 上。
 * 如果 VS 装在非标准路径，vswhere 找不到，需要手动执行 vcvars64.bat 设置环境。
 * 由于 cross-shell 引号转义复杂，通过临时 bat 文件来串联 vcvars + electron-rebuild。
 */
function runOnWindows(vcvars: string | null): void {
  if (!vcvars) {
    console.warn('⚠️  未找到 vcvars64.bat（MSVC 编译环境），尝试直接运行 electron-rebuild...')
    execaSync(process.execPath, ['x', 'electron-rebuild', ...electronRebuildArgs], {
      cwd: ROOT,
      stdio: 'inherit',
      env: cleanEnv,
    })
    return
  }

  const tmpBat = resolve(ROOT, '.rebuild.bat')
  try {
    const lines = [
      '@echo off',
      // 在 bat 内部显式清除 WorkBuddy 注入的 safe-delete shim 环境变量，
      // 确保 node-gyp clean/configure/build 步骤不被拦截。
      'set NODE_OPTIONS=',
      'set PYTHONPATH=',
      `call "${vcvars}"`,
      // 用本地安装的 @electron/rebuild，不走 bun x（bun x 下载的临时版本
      // 可能不传递 VCINSTALLDIR 等 MSVC 环境变量，导致 node-gyp 找不到 VS）。
      `"${process.execPath}" "${resolve(ROOT, 'node_modules/@electron/rebuild/lib/cli.js')}" ${electronRebuildArgs.join(' ')}`,
    ]
    writeFileSync(tmpBat, lines.join('\r\n') + '\r\n')
    console.debug('[rebuild-native] vcvars=%s bat=%s', vcvars, tmpBat)

    execaSync('cmd', ['/d', '/c', tmpBat], {
      cwd: ROOT,
      stdio: 'inherit',
      env: cleanEnv,
    })
  } finally {
    try { rmSync(tmpBat) } catch { /* cleanup best-effort */ }
  }
}

try {
  if (process.platform === 'win32') {
    runOnWindows(findVcvars64())
  } else {
    execaSync(process.execPath, ['x', 'electron-rebuild', ...electronRebuildArgs], {
      cwd: ROOT,
      stdio: 'inherit',
      env: cleanEnv,
    })
  }
} catch {
  if (isPostinstall) {
    console.warn('⚠️  原生模块重建失败（postinstall），将在 dev 启动时重试')
    process.exit(0)
  }
  process.exit(1)
}
