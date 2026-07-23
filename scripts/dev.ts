#!/usr/bin/env bun

import { startWatchesAndWait } from './dev/build.ts'
import { devLog, GREEN, RESET } from './dev/constants.ts'
import { ElectronController } from './dev/electron-controller.ts'
import { ensureEnvLocal, readDevPort } from './dev/env.ts'
import { ensurePortFree } from './dev/port.ts'
import { ensureNativeModule, generateIconTypes } from './dev/prepare.ts'
import { ProcessManager } from './dev/process-manager.ts'
import { promptLogLevel } from './dev/prompt.ts'
import { startViteServer } from './dev/vite.ts'
import { linkWorkspacePackages } from './dev/workspace.ts'

const pm = new ProcessManager()
const electron = new ElectronController({ onFatal: () => shutdown() })

let shuttingDown = false

/**
 * 优雅关闭：
 * 1. 同步向所有子进程发终止信号（Electron SIGTERM + 尽力 IPC，vite/tsup SIGTERM）。
 *    必须在任何 await 之前完成——dev.ts 是多层 shell（bun shim → mvm run → 嵌套 bun）
 *    下的孙子进程，上层收到 Ctrl+C 后可能在我们 await 期间就把本进程拆掉；
 *    信号先同步发出，即使 orchestrator 立即消失，Electron 也会自行 app.quit() 收尾。
 * 2. 等待 Electron 退出，超时后按进程组强杀 vite/tsup/Electron（连带 Mihomo），最后退场。
 */
async function shutdown(code = 0): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  electron.beginGracefulShutdown()
  pm.terminate()
  await electron.waitAndForceKill()
  pm.killAll('SIGKILL')
  console.log()
  process.exit(code)
}

// 记录收到的中断次数：第二次 Ctrl+C 直接强杀退出，不再等待优雅关闭
let signalCount = 0
async function handleSignal(): Promise<void> {
  signalCount += 1
  if (signalCount >= 2) {
    electron.forceKill()
    pm.killAll('SIGKILL')
    process.exit(1)
  }
  await shutdown()
}
process.on('SIGINT', handleSignal)
process.on('SIGTERM', handleSignal)

async function main(): Promise<void> {
  // 1. 准备 .env.local（创建 + 确保端口），再交互选择日志等级
  ensureEnvLocal()
  electron.setLogLevel(await promptLogLevel())

  // 2. 创建 workspace 软链接，否则 Electron 无法导入 workspace 包（如 @wmfx/database）
  linkWorkspacePackages()

  // 3. 检查端口占用
  const devPort = readDevPort()
  await ensurePortFree(devPort)

  // 4. 开发期开启 console 源码位置注入（仅 dev，生产构建不设此变量）
  process.env.WMFX_DEV_INSTRUMENT = '1'

  // 5. 原生模块检查 + 图标类型生成
  await ensureNativeModule()
  generateIconTypes()

  // 6. 启动 Vite（后台就绪）与全部 tsup --watch（等待首次构建完成）
  const viteReady = startViteServer(pm, devPort)
  await startWatchesAndWait(pm)

  // 7. Vite 就绪后启动 Electron，并延迟启用产物监听（避免初次构建触发重启）
  viteReady
    .then((url) => {
      electron.setDevServerUrl(url)
      devLog(`${GREEN}✅${RESET} Vite 就绪: ${url}`)
      electron.start()
      setTimeout(() => {
        electron.markStartupComplete()
        electron.watchForChanges()
      }, 1000)
    })
    .catch((err) => {
      console.error('❌', err.message)
      shutdown()
    })
}

main()
