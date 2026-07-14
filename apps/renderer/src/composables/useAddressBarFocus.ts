import { type Ref, ref } from 'vue'

// 模块级单例：新开标签页时由创建方调用 requestAddressBarFocus()，
// 地址栏 watch 该计数变化后将输入焦点聚焦到地址框。
const focusNonce = ref(0)

/** 请求地址栏在合适时机聚焦（用于“新开标签页默认聚焦地址输入框”）。 */
export function requestAddressBarFocus(): void {
  focusNonce.value++
}

/** 返回共享的聚焦请求计数，供地址栏 watch。 */
export function useAddressBarFocus(): Ref<number> {
  return focusNonce
}
