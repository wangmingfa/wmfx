import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import type { Session } from 'electron'
import { logBoxError } from './logger'

let devtoolsPath: string | undefined

/**
 * 根据当前操作系统返回常见的 Chrome 扩展存放目录提示，帮助用户快速定位扩展路径。
 * 各平台默认用户数据目录下的 Extensions 子目录，<id> 为扩展 ID（chrome://extensions 开启开发者模式可见）。
 */
function getChromeExtensionDirHints(): string[] {
  const home = homedir()
  const expand = (p: string): string => p.replace(/^~/, home)
  switch (process.platform) {
    case 'darwin':
      return [
        'Chrome:',
        `${home}/Library/Application Support/Google/Chrome/Default/Extensions/<id>/<version>_0`,
        `${home}/Library/Application Support/Google/Chrome/Profile 1/Extensions/<id>/<version>_0`,
        'Edge:',
        `${home}/Library/Application Support/Microsoft Edge/Default/Extensions/<id>/<version>_0`,
        `${home}/Library/Application Support/Microsoft Edge/Profile 1/Extensions/<id>/<version>_0`,
      ]
    case 'win32':
      return [
        'Chrome:',
        `${home}\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Extensions\\<id>\\<version>_0`,
        `${home}\\AppData\\Local\\Google\\Chrome\\User Data\\Profile 1\\Extensions\\<id>\\<version>_0`,
        'Edge:',
        `${home}\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Extensions\\<id>\\<version>_0`,
        `${home}\\AppData\\Local\\Microsoft\\Edge\\User Data\\Profile 1\\Extensions\\<id>\\<version>_0`,
      ]
    default: // linux 等
      return [
        'Chrome:',
        expand('~/.config/google-chrome/Default/Extensions/<id>/<version>_0'),
        expand('~/.config/google-chrome/Profile 1/Extensions/<id>/<version>_0'),
        'Edge:',
        expand('~/.config/microsoft-edge/Default/Extensions/<id>/<version>_0'),
        expand('~/.config/microsoft-edge/Profile 1/Extensions/<id>/<version>_0'),
      ]
  }
}

/**
 * 读取 .env.local 中的 VUE_DEVTOOLS_PATH（Vue DevTools 扩展目录的绝对路径）。
 * 必须在应用启动时最早调用一次，后续由 SessionManager 为每个 session 装载扩展。
 * 若配置了路径但目录不存在，用 logBoxError 醒目提示（不阻断启动）。
 */
export function initVueDevToolsPath(): void {
  loadEnv({ path: resolve(process.cwd(), '.env.local') })
  devtoolsPath = process.env.VUE_DEVTOOLS_PATH

  if (!devtoolsPath) {
    console.debug('[DevTools] initVueDevToolsPath: VUE_DEVTOOLS_PATH 未配置，跳过')
    return
  }

  if (!existsSync(devtoolsPath)) {
    const hints = getChromeExtensionDirHints()
    logBoxError(
      [
        'VUE_DEVTOOLS_PATH 指向的扩展目录不存在:',
        devtoolsPath,
        '请检查 .env.local 中的 VUE_DEVTOOLS_PATH 是否正确',
        '（应为 Chrome 扩展解压目录，形如 .../Extensions/<id>/<version>_0）',
        '常见 Chrome 扩展目录：',
        ...hints,
      ],
      [1]
    )
    devtoolsPath = undefined
    return
  }

  console.debug('[DevTools] initVueDevToolsPath: path', devtoolsPath)
}

/**
 * 为指定 session 装载 Vue DevTools 扩展（若已配置路径且尚未装载）。
 * 在 SessionManager 创建/获取每个 session 时调用，使所有 WebContents 都能用 F12 调试 Vue。
 */
/** 返回当前生效的 Vue DevTools 扩展路径（未配置则为空字符串）。 */
export function getVueDevToolsPath(): string {
  return devtoolsPath ?? ''
}

export async function loadVueDevToolsForSession(targetSession: Session): Promise<boolean> {
  if (!devtoolsPath) return false

  try {
    await targetSession.extensions.loadExtension(devtoolsPath, { allowFileAccess: true })
    console.debug(
      '[DevTools] loadVueDevToolsForSession: 已装载 path session',
      devtoolsPath,
      targetSession.getStoragePath()
    )
    return true
  } catch (e) {
    // 扩展已装载时会抛错，可忽略；其他错误告警
    console.warn('[DevTools] loadVueDevToolsForSession: 装载失败 path error', devtoolsPath, e)
    return false
  }
}
