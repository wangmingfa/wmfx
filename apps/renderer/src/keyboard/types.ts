export type KeyboardMode = 'gui' | 'vim'
export type VimMode = 'normal' | 'insert' | 'visual' | 'command'

export interface KeyboardState {
  mode: KeyboardMode
  vimMode: VimMode
  count: number
  registers: Record<string, string>
}

export type KeyboardEventAction =
  | { type: 'handled' }
  | { type: 'pass-through' }
  | { type: 'execute'; command: string; args?: unknown }
