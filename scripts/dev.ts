#!/usr/bin/env bun

import { cleanAllDists, startWatchesAndWait } from './dev/build.ts'
import { devLog, GREEN, RESET } from './dev/constants.ts'
import { ElectronController } from './dev/electron-controller.ts'
import { ensureEnvLocal, readDevPort } from './dev/env.ts'
import { ensurePortFree } from './dev/port.ts'
import { ensureNativeModule, generateIconTypes } from './dev/prepare.ts'
import { ProcessManager } from './dev/process-manager.ts'
import { promptLogLevel } from './dev/prompt.ts'
import { startViteServer } from './dev/vite.ts'

const pm = new ProcessManager()
const electron = new ElectronController({ onFatal: () => shutdown() })

let shuttingDown = false

/**
 * 优雅关闭：
 * 1. 同步向所有子进程发终止信号（Electron SIGTERM + 尽力 IPC，vite/tsup SIGTERM）。
 *    必须在任何 await 之前完成——dev.ts 是多层 shell（bun shim → mvm run → 嵌套 bun）
 *    下的孙子进程，上层收到 Ctrl+C 后可能在我们 await 期间就把本进程拆掉；
 *    信号先同步发出，即使 orchestrator 立即消失，Electron 也会自行 app.quit() 收尾。
 * 2. 立即 SIGKILL 强杀所有子进程组，避免在 await 期间 process.exit 导致 dev.ts
 *    退出而 vite/tsup 等孤儿进程继续后台监听文件（修改文件后会触发意外构建）。
 * 3. 等待 Electron 退出，超时后按进程组强杀（连带 Mihomo），最后退场。
 */
async function shutdown(code = 0): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  electron.beginGracefulShutdown()
  pm.terminate()
  // 立即强杀 vite/tsup 等所有子进程，防止 await 期间 dev.ts 被上层 shell 拆掉，
  // 留下孤儿进程继续监听文件变化
  pm.killAll('SIGKILL')
  await electron.waitAndForceKill()
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

/**
 * 进程退出兜底：父 shell（bun → bun run）收到 Ctrl+C 后可能直接杀掉 dev.ts，
 * 导致 shutdown() 中的 await 来不及执行。此处理器在进程即将退出时同步强杀
 * Electron 进程树，防止 detached 的 Electron 成为孤儿继续运行。
 */
process.on('exit', () => {
  electron.forceKill()
  pm.killAll('SIGKILL')
})

async function main(): Promise<void> {
  // 1. 准备 .env.local（创建 + 确保端口），再交互选择日志等级
  ensureEnvLocal()
  electron.setLogLevel(await promptLogLevel())

  // 2. 第一次端口检查：尽早 kill 旧进程（packages 源码由 bundler alias 直接读取，无需软链接）
  const devPort = readDevPort()
  await ensurePortFree(devPort)

  // 3. 开发期开启 console 源码位置注入（仅 dev，生产构建不设此变量）
  process.env.WMFX_DEV_INSTRUMENT = '1'

  // 4. 原生模块检查 + 图标类型生成
  await ensureNativeModule()
  generateIconTypes()

  // 5. 先清理 dist（必须在 Vite 之前，否则 Vite 检测到 dist 删除会重启导致端口冲突）
  await cleanAllDists()

  // 6. 第二次端口检查：前两步可能耗时，消除 Vite 启动前的竞态窗口
  await ensurePortFree(devPort)
  const viteReady = startViteServer(pm, devPort)
  await startWatchesAndWait(pm)

  // 7. Vite 就绪后启动 Electron，并延迟启用产物监听（避免初次构建触发重启）
  viteReady
    .then(async (url) => {
      electron.setDevServerUrl(url)
      devLog(`${GREEN}✅${RESET} Vite 就绪: ${url}`)
      await electron.start()
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
