import type { IpcInvoke } from '@browser/ipc-contract'
import { contextBridge, ipcRenderer } from 'electron'

const api: { ping: IpcInvoke['app:ping'] } = {
  ping: (message: string) => ipcRenderer.invoke('app:ping', message),
}

contextBridge.exposeInMainWorld('browserAPI', api)
