import { CYAN, GREEN, type LogLevel, RESET } from './constants.ts'
import { readLastLogLevel, writeLogLevel } from './env.ts'

/**
 * 交互式选择日志等级：
 *  - 5 秒倒计时，超时自动选中上次的等级
 *  - 支持输入数字后回车确认、Backspace 修正、Ctrl+C 取消
 *  - 选择结果与上次不同才写回 .env.local
 */
export async function promptLogLevel(): Promise<LogLevel> {
  const lastLevel = readLastLogLevel()
  const choices: { name: string; value: LogLevel }[] = [
    { name: 'debug  (所有日志)', value: 'debug' },
    { name: 'info   (info/warn/error)', value: 'info' },
    { name: 'warn   (warn/error)', value: 'warn' },
    { name: 'error  (仅 error)', value: 'error' },
  ]
  const defaultIdx = choices.findIndex((c) => c.value === lastLevel)
  console.log(`${CYAN}[dev]${RESET} 选择日志等级:`)
  choices.forEach((c, i) => {
    console.log(`  ${i + 1}. ${i === defaultIdx ? GREEN : ''}${c.name}${RESET}`)
  })

  const level = await new Promise<LogLevel>((resolve) => {
    let remaining = 5
    let inputBuf = ''
    let resolved = false
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf-8')

    const prompt = () =>
      `\r${CYAN}[dev]${RESET} 输入数字 (1-${choices.length}) ${GREEN}${remaining}s${RESET} 后自动选中 ${GREEN}${lastLevel}${RESET}: ${inputBuf}`

    process.stdout.write(prompt())

    const timer = setInterval(() => {
      remaining--
      if (remaining <= 0) {
        cleanupStdin()
        console.log(`\n${CYAN}[dev]${RESET} ⏱️  超时，自动选择 ${GREEN}${lastLevel}${RESET}`)
        resolve(lastLevel)
      } else {
        process.stdout.write(prompt())
      }
    }, 1000)

    function cleanupStdin(): void {
      if (resolved) return
      resolved = true
      clearInterval(timer)
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdin.removeAllListeners('data')
    }

    process.stdin.on('data', (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\x03') {
          // Ctrl+C — 恢复 stdin 然后正常退出
          cleanupStdin()
          console.log(`\n${CYAN}[dev]${RESET} 已取消`)
          process.exit(0)
          return
        } else if (ch === '\x7F' || ch === '\b') {
          // Backspace
          inputBuf = inputBuf.slice(0, -1)
        } else if (ch === '\r' || ch === '\n') {
          // Enter
          cleanupStdin()
          const idx = parseInt(inputBuf, 10) - 1
          const chosen = idx >= 0 && idx < choices.length ? choices[idx].value : lastLevel
          console.log(`\n${CYAN}[dev]${RESET} 📋 日志等级: ${GREEN}${chosen}${RESET}`)
          resolve(chosen)
          return
        } else if (ch >= '1' && ch <= String(choices.length)) {
          inputBuf += ch
        }
      }
      process.stdout.write(prompt())
    })
  })

  if (level !== lastLevel) writeLogLevel(level)
  return level
}
