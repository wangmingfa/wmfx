/// <reference types="vite/client" />

import type { IpcInvoke } from '@browser/ipc-contract'

declare global {
  interface Window {
    browserAPI: {
      ping: IpcInvoke['app:ping']
    }
  }
}
