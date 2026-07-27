import type { KeyboardManager } from './KeyboardManager'

/**
 * VIM 状态机：处理 Normal/Insert/Visual/Command 模式的按键分发
 */
export class VimStateMachine {
  private km: KeyboardManager
  /** Normal 模式下待匹配的前缀序列（如 'g' 等待下一个键） */
  private pendingKeys = ''

  constructor(km: KeyboardManager) {
    this.km = km
  }

  handleKeydown(e: KeyboardEvent): boolean {
    const mode = this.km.vimMode

    switch (mode) {
      case 'normal':
        return this.handleNormal(e)
      case 'insert':
        return this.handleInsert(e)
      case 'visual':
        return this.handleVisual(e)
      case 'command':
        return this.handleCommand(e)
      default:
        return false
    }
  }

  private handleNormal(e: KeyboardEvent): boolean {
    const key = e.key
    const ctrl = e.ctrlKey
    const shift = e.shiftKey

    if (key === 'Escape') {
      this.pendingKeys = ''
      this.km.resetCount()
      return true
    }

    if (ctrl && key === '[') {
      this.pendingKeys = ''
      this.km.resetCount()
      return true
    }

    if (!ctrl && !shift && key >= '0' && key <= '9') {
      if (key === '0' && this.km.getCount() === 0) {
        return this.dispatchKey('0', e)
      }
      this.km.appendCount(parseInt(key, 10))
      return true
    }

    if (this.pendingKeys) {
      const full = this.pendingKeys + key
      this.pendingKeys = ''
      return this.dispatchKey(full, e)
    }

    return this.dispatchKey(key, e)
  }

  private dispatchKey(key: string, e: KeyboardEvent): boolean {
    const count = this.km.getCount()

    // --- 移动 ---
    if (key === 'h') return this.executeCommand('moveLeft', count)
    if (key === 'j') return this.executeCommand('moveDown', count)
    if (key === 'k') return this.executeCommand('moveUp', count)
    if (key === 'l') return this.executeCommand('moveRight', count)
    if (key === 'w') return this.executeCommand('moveWordForward', count)
    if (key === 'b') return this.executeCommand('moveWordBackward', count)
    if (key === 'e') return this.executeCommand('moveWordEnd', count)
    if (key === '0') return this.executeCommand('moveToLineStart')
    if (key === '$') return this.executeCommand('moveToLineEnd')
    if (key === '^') return this.executeCommand('moveToFirstNonBlank')
    if (key === 'G') return this.executeCommand('moveToEnd')
    if (key === 'gg') return this.executeCommand('moveToTop')

    // --- 前缀命令 ---
    if (key === 'g') {
      this.pendingKeys = 'g'
      return true
    }
    if (key === 'd') {
      this.pendingKeys = 'd'
      return true
    }
    if (key === 'y') {
      this.pendingKeys = 'y'
      return true
    }
    if (key === 'c') {
      this.pendingKeys = 'c'
      return true
    }

    // --- 编辑 ---
    if (key === 'x') return this.executeCommand('deleteChar', count)
    if (key === 'D') return this.executeCommand('deleteToLineEnd', count)
    if (key === 'C') return this.executeCommand('changeToLineEnd', count)
    if (key === 'p') return this.executeCommand('paste')
    if (key === 'P') return this.executeCommand('pasteBefore')
    if (key === 'u') return this.executeCommand('undo')
    if (key === 's') return this.executeCommand('substituteChar')
    if (key === 'S') return this.executeCommand('substituteLine')
    if (key === 'r' && e.ctrlKey) return this.executeCommand('redo')

    // --- 模式切换 ---
    if (key === 'i') {
      this.km.setVimMode('insert')
      return true
    }
    if (key === 'I') {
      this.km.setVimMode('insert')
      return this.executeCommand('moveToFirstNonBlank')
    }
    if (key === 'a') {
      this.km.setVimMode('insert')
      return this.executeCommand('moveRight')
    }
    if (key === 'A') {
      this.km.setVimMode('insert')
      return this.executeCommand('moveToLineEnd')
    }
    if (key === 'o') {
      this.km.setVimMode('insert')
      return this.executeCommand('openLineBelow')
    }
    if (key === 'O') {
      this.km.setVimMode('insert')
      return this.executeCommand('openLineAbove')
    }
    if (key === 'v') {
      this.km.setVimMode('visual')
      return true
    }
    if (key === 'V') {
      this.km.setVimMode('visual')
      return this.executeCommand('selectLine')
    }
    if (key === ':') {
      this.km.setVimMode('command')
      return this.executeCommand('openCommandLine')
    }

    // --- 搜索 ---
    if (key === '/') return this.executeCommand('searchForward')
    if (key === '?') return this.executeCommand('searchBackward')
    if (key === 'n') return this.executeCommand('searchNext')
    if (key === 'N') return this.executeCommand('searchPrev')
    if (key === '*') return this.executeCommand('searchWordUnderCursor')
    if (key === '#') return this.executeCommand('searchWordUnderCursorReverse')

    // --- 标签切换 ---
    if (key === 'gt') return this.executeCommand('tabNext')
    if (key === 'gT') return this.executeCommand('tabPrev')

    return false
  }

  private handleInsert(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.km.setVimMode('normal')
      return true
    }
    if (e.ctrlKey && e.key === '[') {
      this.km.setVimMode('normal')
      return true
    }
    return false
  }

  private handleVisual(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.km.setVimMode('normal')
      return true
    }
    if (e.key === 'd') {
      this.km.setVimMode('normal')
      return this.executeCommand('deleteSelection')
    }
    if (e.key === 'y') {
      this.km.setVimMode('normal')
      return this.executeCommand('copySelection')
    }
    if (e.key === 'c') {
      this.km.setVimMode('insert')
      return this.executeCommand('changeSelection')
    }
    return false
  }

  private handleCommand(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.km.setVimMode('normal')
      return true
    }
    return false
  }

  private executeCommand(command: string, count = 1): boolean {
    console.debug('[VimStateMachine] executeCommand: %s count=%d', command, count)
    window.browserAPI.send?.('keyboard:vim-command', { command, count })
    return true
  }
}
