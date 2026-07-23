<template>
  <span
    class="tab-favicon"
    :class="{ 'tab-loading': isLoading }"
  >
    <!-- 无痕模式图标（loading 时缩小并保留，spinner 覆盖其上） -->
    <Icon
      v-if="isIncognito"
      class="favicon-icon incognito-icon"
      icon="mdi:account-off"
      :width="iconSize"
      :height="iconSize"
    />
    <!-- 普通页 favicon（loading 时缩小到 70%，spinner 覆盖形成转圈包围效果） -->
    <Favicon
      v-else
      class="favicon-icon"
      :url="url"
      :favicon="favicon"
      :size="size"
    />
    <!-- 加载中：spinner 覆盖在 favicon 上 -->
    <Spinner
      v-if="isLoading"
      class="tab-spinner"
      :size="spinnerSize"
    />
  </span>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import Favicon from '@/components/Favicon.vue'
import Spinner from '@/components/ui/Spinner.vue'

const props = withDefaults(
  defineProps<{
    /** 地址栏显示的 URL（用于判断内部页） */
    url: string
    /** 主进程下发的 favicon dataURL */
    favicon?: string | null
    /** 是否加载中 */
    isLoading?: boolean
    /** 是否无痕 session */
    isIncognito?: boolean
    /** 图标尺寸（px），默认 14 */
    size?: number
  }>(),
  {
    favicon: null,
    isLoading: false,
    isIncognito: false,
    size: 14,
  },
)

const iconSize = computed(() => Math.max(10, props.size - 2))
// spinner 略大于底层图标，形成转圈包围 favicon 的视觉效果
const spinnerSize = computed(() => Math.round(props.size * 1.15))
</script>

<style scoped lang="less">
.tab-favicon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 100%;
  height: 100%;

  /* 加载中：底层图标缩小到 70%，spinner 居中覆盖形成转圈包围效果 */
  &.tab-loading {
    .favicon-icon {
      transform: scale(0.6);
    }
  }

  .favicon-icon {
    transition: transform 0.1s ease;
    transform-origin: center center;
  }

  .tab-spinner {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .incognito-icon {
    position: absolute;
    color: var(--accent-color);
  }

  :deep(img.favicon) {
    color: var(--text-secondary);
  }
}
</style>
