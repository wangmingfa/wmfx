import type { IpcContract } from '@browser/ipc-contract'
import { ipcMain } from 'electron'

/** 类型安全的 handle 包装：约束通道名与处理函数签名一致。 */
function handle<K extends keyof IpcContract>(
  channel: K,
  handler: (
    ...args: Parameters<IpcContract[K]>
  ) => ReturnType<IpcContract[K]> | Promise<ReturnType<IpcContract[K]>>
): void {
  ipcMain.handle(channel, (_event, ...args) => handler(...(args as Parameters<IpcContract[K]>)))
}

export function registerIpcHandlers(): void {
  handle('app:ping', (message) => `pong: ${message}`)
}
