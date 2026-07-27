import { GuiMode } from './GuiMode'
import type { KeyboardMode, KeyboardState, VimMode } from './types'
import { VimStateMachine } from './VimStateMachine'

type ModeListener = (mode: KeyboardMode) => void

/**
 * 集中式键盘管理器：管理模式状态、事件分发、IPC 通信
 * 在 renderer 进程中运行，通过 window.browserAPI 与 main process 通信
 */
export class KeyboardManager {
  private static instance: KeyboardManager
  private state: KeyboardState = {
    mode: 'gui',
    vimMode: 'normal',
    count: 0,
    registers: {},
  }
  private listeners: ModeListener[] = []
  private initialized = false
  private guiMode!: GuiMode
  private vimState!: VimStateMachine

  static getInstance(): KeyboardManager {
    if (!KeyboardManager.instance) {
      KeyboardManager.instance = new KeyboardManager()
    }
    return KeyboardManager.instance
  }

  get mode(): KeyboardMode {
    return this.state.mode
  }

  get vimMode(): VimMode {
    return this.state.vimMode
  }

  async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    const saved = await window.browserAPI.getSetting('keyboardMode')
    this.state.mode = (saved as KeyboardMode) ?? 'gui'

    window.browserAPI.onKeyboardModeChanged((mode) => {
      console.info('[KeyboardManager] mode changed via IPC: %s', mode)
      this.setMode(mode)
    })

    window.addEventListener('keydown', this.handleKeydown, true)
    this.guiMode = new GuiMode()
    this.vimState = new VimStateMachine(this)

    console.info('[KeyboardManager] init: mode=%s', this.state.mode)
  }

  setMode(mode: KeyboardMode): void {
    if (this.state.mode === mode) return
    console.info('[KeyboardManager] setMode: %s → %s', this.state.mode, mode)
    this.state.mode = mode
    if (mode === 'vim') {
      this.state.vimMode = 'normal'
    }
    this.state.count = 0
    for (const listener of this.listeners) {
      listener(mode)
    }
  }

  async switchMode(mode: KeyboardMode): Promise<void> {
    await window.browserAPI.setKeyboardMode(mode)
  }

  onModeChange(listener: ModeListener): () => void {
    this.listeners.push(listener)
    return () => {
      const idx = this.listeners.indexOf(listener)
      if (idx >= 0) this.listeners.splice(idx, 1)
    }
  }

  setVimMode(vimMode: VimMode): void {
    console.debug('[KeyboardManager] setVimMode: %s', vimMode)
    this.state.vimMode = vimMode
    this.state.count = 0
  }

  appendCount(digit: number): void {
    this.state.count = this.state.count * 10 + digit
  }

  getCount(): number {
    const c = this.state.count
    this.state.count = 0
    return c || 1
  }

  resetCount(): void {
    this.state.count = 0
  }

  private handleKeydown = (e: KeyboardEvent): void => {
    if (this.state.mode === 'gui') {
      if (this.guiMode?.handleKeydown(e)) return
      return
    }

    if (this.state.mode === 'vim') {
      const target = e.target as HTMLElement
      const isInput =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      if (isInput && this.state.vimMode !== 'insert') {
        return
      }

      if (this.vimState?.handleKeydown(e)) {
        e.preventDefault()
        e.stopPropagation()
      }
      return
    }
  }
}
