/**
 * 所有 IPC 通道的类型契约：通道名 -> (参数) => 返回值。
 * 主进程用它约束 handle，渲染进程用它约束 invoke。
 * 后续里程碑在此扩展（tab:*, nav:*, proxy:* ...）。
 */
export interface IpcContract {
  'app:ping': (message: string) => string
}

export type IpcChannel = keyof IpcContract

export const IPC_CHANNELS: readonly IpcChannel[] = ['app:ping'] as const

export function isIpcChannel(name: string): name is IpcChannel {
  return (IPC_CHANNELS as readonly string[]).includes(name)
}

/** 渲染进程侧调用类型：invoke 返回 Promise。 */
export type IpcInvoke = {
  [K in IpcChannel]: (...args: Parameters<IpcContract[K]>) => Promise<ReturnType<IpcContract[K]>>
}
