import { type ComputedRef, computed, type Ref, ref, watch } from 'vue'

/** 支持 watch 的响应式类型（ref/computed）。 */
type WatchableValue = string | Ref<string> | ComputedRef<string>

/**
 * 设置网页（窗口）标题，返回 useState 风格的元组。
 * - title: 只读计算属性（同步 document.title）
 * - setTitle: (value: string) => void
 */
export function usePageTitle(initial?: WatchableValue) {
  // 判断是否为 watchable 对象
  const isWatchable = typeof initial === 'object' && initial !== null

  // 初始值：watchable 取 .value，否则直接取值
  const rawValue = isWatchable
    ? ((initial as Ref<string> | ComputedRef<string>).value ?? '')
    : (initial ?? '')

  // 内部可写 ref，无论 initial 是否 watchable 都存在这里
  const titleRef = ref(rawValue)

  // 如果传的是 watchable 源，watch 它的变化并同步到 titleRef
  if (isWatchable) {
    watch(
      initial,
      (v) => {
        titleRef.value = v ?? ''
      },
      { immediate: true }
    )
  }

  // 同步到 document.title
  watch(
    titleRef,
    (v) => {
      console.debug('[usePageTitle] sync: title', v)
      document.title = v
    },
    { immediate: true }
  )

  // 返回只读计算属性
  const title = computed(() => titleRef.value)

  const setTitle = (value: string) => {
    titleRef.value = value
  }

  return [title, setTitle] as const
}
