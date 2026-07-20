import type { MessageProviderInst } from 'naive-ui'
import { inject, type Ref } from 'vue'

/** 从注入的消息提供者创建 toast 工具 */
export function useToast() {
  const messageProvider = inject<Ref<MessageProviderInst | undefined>>('messageProvider')
  return {
    success(msg: string) {
      messageProvider?.value?.success(msg)
    },
    error(msg: string) {
      messageProvider?.value?.error(msg)
    },
    info(msg: string) {
      messageProvider?.value?.info(msg)
    },
    warning(msg: string) {
      messageProvider?.value?.warning(msg)
    },
  }
}
