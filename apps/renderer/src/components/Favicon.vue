<template>
  <!-- 内部页：直接按路由展示固定图标，不查缓存；显式用主题文本色，避免深色模式下继承黑色看不清 -->
  <Icon
    v-if="isInternal"
    :icon="internalIconName"
    :width="size"
    :height="size"
    :style="internalStyle"
  />
  <!-- 外部页：有 favicon 且未加载失败 → 真实图标；否则（含缓存未返回时）回退默认图标 -->
  <img
    v-else-if="displayFavicon && !loadError"
    class="favicon-img"
    :src="displayFavicon"
    :width="size"
    :height="size"
    alt=""
    @error="loadError = true"
  />
  <DefaultFavicon
    v-else
    :size="size"
    :color="resolvedColor"
  />
</template>

<script setup lang="ts">
import { faviconKeyOf, isWmfxUrl } from '@browser/shared'
import { Icon } from '@iconify/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useTheme } from '@/composables/useTheme'
import DefaultFavicon from './DefaultFavicon.vue'

const props = withDefaults(
  defineProps<{
    /** 页面全路径（必填），用于计算缓存 key 与内部页判断 */
    url: string
    /** 可选：页面当前 favicon（如 TabState.favicon），有则优先直接使用，避免空查缓存 */
    favicon?: string | null
    /** 图标尺寸（px），默认 16 */
    size?: number
    /** 默认图标颜色：传字符串两侧同色；传 { dark, light } 按当前主题取对应色 */
    color?: string | { dark: string, light: string }
  }>(),
  {
    favicon: null,
    size: 16,
    color: undefined,
  },
)

/** 内部页路由 → 固定图标（复用 TabBar 既有映射，新增内部页在此补充即可） */
const INTERNAL_ICONS: Record<string, string> = {
  newtab: 'mdi:earth',
  bookmarks: 'mdi:bookmark',
  history: 'mdi:history',
  downloads: 'mdi:download',
  proxy: 'mdi:network',
  settings: 'mdi:cog',
  files: 'mdi:folder',
  ftp: 'mdi:server-network',
  sftp: 'mdi:shield-key',
}

const { theme } = useTheme()

const displayFavicon = ref<string | null>(null)
const loadError = ref(false)

const isInternal = computed(() => isWmfxUrl(props.url))

const internalIconName = computed(() => {
  const path = props.url.replace('wmfx://', '').split('/')[0]
  return INTERNAL_ICONS[path] ?? 'mdi:web'
})

const resolvedColor = computed(() => {
  const c = props.color
  if (!c) {
    return undefined
  }
  if (typeof c === 'string') {
    return c
  }
  return theme.value === 'dark' ? c.dark : c.light
})

// 内部页图标颜色：未单独传入 color 时，统一用次级文本色（深色/浅色主题均清晰可见）
const internalStyle = computed(() => {
  const color = resolvedColor.value ?? 'var(--text-secondary)'
  return { color }
})

/** 解析最终展示的 favicon：优先用传入的 favicon，否则查缓存（仅外部页） */
async function resolve(): Promise<void> {
  console.debug('[Favicon] resolve: url favicon', props.url, props.favicon)
  loadError.value = false
  if (props.favicon) {
    displayFavicon.value = props.favicon
    return
  }
  if (!isInternal.value) {
    displayFavicon.value = await window.browserAPI.faviconGet(faviconKeyOf(props.url))
  }
}

onMounted(resolve)
watch(
  () => [props.favicon, props.url],
  () => {
    void resolve()
  },
)
</script>

<style scoped>
.favicon-img {
  display: block;
  border-radius: 3px;
  object-fit: contain;
}
</style>
