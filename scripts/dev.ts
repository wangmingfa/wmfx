#!/usr/bin/env bun

import { spawnSync } from 'node:child_process'
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
  shutdownStartedAt = Date.now()
  // 全部同步——不依赖 Bun await async handler
  electron.beginGracefulShutdown()
  pm.killAll('SIGKILL')
  await electron.waitAndForceKill()
  console.log()
  process.exit(code)
}

// 记录收到的中断次数：第二次 Ctrl+C 直接强杀退出，不再等待优雅关闭
let signalCount = 0
// 优雅关闭开始时刻：用于区分「mvm 补发的信号」与「用户第二次 Ctrl+C 强杀」
let shutdownStartedAt = 0
// shutdown 卡死阈值：超过该时长仍收到信号才强杀（正常 shutdown 约 3s 内完成）
const SHUTDOWN_FORCE_TIMEOUT_MS = 5000

/**
 * 信号处理器——故意不是 async。
 * Bun 收到 SIGINT 后调用 handler 但不一定 await 返回的 Promise，
 * 因此所有 kill 操作必须在同步路径中完成。
 *
 * 为什么优雅关闭期间要忽略后续信号：dev.ts 经 mvm（MoonBit）spawn 启动，mvm 的
 * async 运行时收到 SIGINT 后会 cancel @process.run 任务并向子进程补发 SIGTERM
 * （graceful_cancel 默认信号）；终端 Ctrl+C 还可能伴随 SIGHUP。因此单次 Ctrl+C
 * 会先后收到 SIGINT + SIGTERM（+SIGHUP），若把第二次信号当成「用户再按一次
 * Ctrl+C」直接 process.exit，会在 shutdown() 完成前杀掉 dev.ts，导致 detached 的
 * Electron 变孤儿。SIGHUP 一并纳入：终端关闭时也应优雅回收 Electron。
 */
function handleSignal(): void {
  signalCount += 1
  if (shuttingDown) {
    // 优雅关闭进行中：忽略 mvm 补发的 SIGTERM / SIGHUP；仅当 shutdown 卡死超过阈值才强杀
    if (signalCount >= 2 && Date.now() - shutdownStartedAt > SHUTDOWN_FORCE_TIMEOUT_MS) {
      electron.forceKill()
      pm.killAll('SIGKILL')
      process.exit(1)
    }
    return
  }
  // 第一次 Ctrl+C：同步强杀 vite/tsup，再走 async 路径等 Electron 退出
  pm.killAll('SIGKILL')
  shutdown()
}
process.on('SIGINT', handleSignal)
process.on('SIGTERM', handleSignal)
process.on('SIGHUP', handleSignal)

/**
 * 进程退出兜底：父 shell（bun → bun run）收到 Ctrl+C 后可能直接杀掉 dev.ts，
 * 导致 shutdown() 中的 await 来不及执行。此处理器在进程即将退出时同步强杀
 * 所有子进程（killTree 内部用 spawnSync 不经过 shell，在 exit handler 中可靠；
 * forceKill 凭 electronPid 仍能按进程组回收 detached 的 Electron）。
 */
process.on('exit', () => {
  electron.forceKill()
  pm.killAll('SIGKILL')
  // 终端兜底重置：zsh zle 在某些退出路径下可能遗留异常 termios 状态，
  // stty sane 恢复标准 cooked 模式，避免方向键等转义序列被原样回显。
  if (process.platform !== 'win32') {
    try {
      spawnSync('stty', ['sane'], { stdio: 'ignore' })
    } catch {
      /* stty 不可用，忽略 */
    }
  }
})

/**
 * 清理上次 dev 残留的 Electron 进程。
 * Electron 是 detached 启动的，Ctrl+C 时如果信号处理器没来得及执行，
 * Electron 会成为孤儿继续运行。用命令行匹配项目路径来精确杀掉。
 */
function killLeftoverElectron(): void {
  if (process.platform === 'win32') {
    // PowerShell 精确匹配命令行含 wmfx 项目路径的 electron.exe
    spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Get-CimInstance Win32_Process -Filter "name='electron.exe'" | Where-Object { $_.CommandLine -like '*wmfx*' } | ForEach-Object { Stop-Process $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
      ],
      { stdio: 'ignore', windowsHide: true }
    )
  } else {
    // macOS/Linux: pkill -f 匹配命令行
    try {
      spawnSync('pkill', ['-f', 'wmfx.*electron'], { stdio: 'ignore' })
    } catch {
      /* 没有匹配进程 */
    }
  }
}

async function main(): Promise<void> {
  // 0. 清理上次 Ctrl+C 可能残留的 Electron 进程（detached 进程不共享信号组）
  killLeftoverElectron()

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
