import type { InjectionKey } from 'vue'
import type { FileStore } from './useFileStore'

export const fileStoreInjectionKey: InjectionKey<FileStore> = Symbol('fileStore')
