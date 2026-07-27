/**
 * VIM 命令定义和执行
 * : 命令在地址栏中输入，前缀 ':' 表示 VIM 命令
 */
export interface VimCommand {
  names: string[]
  description: string
  execute: () => void
}

export class VimCommands {
  private commands: VimCommand[] = [
    {
      names: ['open', 'o'],
      description: '打开 URL',
      execute: () => {
        // URL 输入通过地址栏处理（Command 模式在地址栏中）
      },
    },
    {
      names: ['tabnew'],
      description: '新建标签',
      execute: () => {
        window.browserAPI.createNewTab()
      },
    },
    {
      names: ['tabclose', 'tabc'],
      description: '关闭标签',
      execute: () => {
        window.browserAPI.send('shell:closeCurrentTab')
      },
    },
    {
      names: ['tabnext'],
      description: '下一个标签',
      execute: () => {
        window.browserAPI.send('shell:nextTab')
      },
    },
    {
      names: ['tabprev', 'tabp'],
      description: '上一个标签',
      execute: () => {
        window.browserAPI.send('shell:prevTab')
      },
    },
    {
      names: ['tabfirst', 'tabfir'],
      description: '第一个标签',
      execute: () => {
        window.browserAPI.send('shell:switchTab', 0)
      },
    },
    {
      names: ['tablast'],
      description: '最后一个标签',
      execute: () => {
        window.browserAPI.send('shell:lastTab')
      },
    },
    {
      names: ['set', 'se'],
      description: '设置选项',
      execute: () => {
        // :set gui 在 handle 中由调用方处理
      },
    },
    {
      names: ['nohlsearch', 'noh'],
      description: '取消搜索高亮',
      execute: () => {
        window.browserAPI.send?.('content:nohlsearch')
      },
    },
  ]

  execute(input: string): boolean {
    const trimmed = input.trim()
    if (!trimmed) return false

    const spaceIdx = trimmed.indexOf(' ')
    const cmdName = spaceIdx >= 0 ? trimmed.slice(0, spaceIdx) : trimmed
    const args = spaceIdx >= 0 ? trimmed.slice(spaceIdx + 1) : ''

    const cmd = this.commands.find((c) => c.names.includes(cmdName))
    if (cmd) {
      console.info('[VimCommands] execute: %s %s', cmdName, args)
      // :set gui 需要特殊处理
      if (cmdName === 'set' && args.trim() === 'gui') {
        window.browserAPI.setKeyboardMode('gui')
      } else {
        cmd.execute()
      }
      return true
    }

    console.debug('[VimCommands] unknown command: %s', cmdName)
    return false
  }

  getCompletions(partial: string): string[] {
    const results: string[] = []
    for (const cmd of this.commands) {
      for (const name of cmd.names) {
        if (name.startsWith(partial)) {
          results.push(name)
        }
      }
    }
    return results
  }
}
