<template>
  <NTooltip
    v-if="tooltipConfig"
    :keep-alive-on-hover="tooltipInteractive"
    :content-style="tooltipInteractive ? undefined : { pointerEvents: 'none' }"
    v-bind="tooltipConfig.props"
  >
    <template #trigger>
      <button
        class="icon-btn"
        :class="[
          { 'is-active': active, 'has-affix': hasAffix, 'is-danger': danger, 'is-square': !rounded },
          `hover-${hoverVariant}`,
          `variant-${variant}`,
        ]"
        :disabled="disabled"
        :style="btnStyle"
        @click="onClick"
      >
        <Icon
          v-if="prefix"
          :icon="prefix.name"
          :width="prefix.sz"
          :height="prefix.sz"
        />
        <Icon
          :icon="mainIcon.name"
          :width="mainIcon.sz"
          :height="mainIcon.sz"
        />
        <Icon
          v-if="suffix"
          :icon="suffix.name"
          :width="suffix.sz"
          :height="suffix.sz"
        />
      </button>
    </template>
    {{ tooltipConfig.content }}
  </NTooltip>
  <button
    v-else
    class="icon-btn"
    :class="[
      { 'is-active': active, 'has-affix': hasAffix, 'is-danger': danger, 'is-square': !rounded },
      `hover-${hoverVariant}`,
      `variant-${variant}`,
    ]"
    :disabled="disabled"
    :style="btnStyle"
    @click="onClick"
  >
    <Icon
      v-if="prefix"
      :icon="prefix.name"
      :width="prefix.sz"
      :height="prefix.sz"
    />
    <Icon
      :icon="mainIcon.name"
      :width="mainIcon.sz"
      :height="mainIcon.sz"
    />
    <Icon
      v-if="suffix"
      :icon="suffix.name"
      :width="suffix.sz"
      :height="suffix.sz"
    />
  </button>
</template>

<script setup lang="ts">
import type { TooltipProps } from 'naive-ui'
import { Icon } from '@iconify/vue'
import { NTooltip } from 'naive-ui'
import { computed } from 'vue'

interface IconConfig {
  name: string
  size: number
}

type IconArg = string | IconConfig

/** tooltip 对象形式：content 为提示文本，其余字段透传给 NTooltip */
type TooltipConfig = Partial<TooltipProps> & { content: string }

const props = withDefaults(
  defineProps<{
    /** 前置图标 */
    prefixIcon?: IconArg
    icon: IconArg
    /** 后置图标 */
    suffixIcon?: IconArg
    /** 按钮尺寸，number 表示宽高一致，[宽, 高] 表示分别指定；不传则自动计算 */
    btnSize?: number | [number, number]
    /** 图标之间的间距（px） */
    gap?: number
    /** 按钮内边距，number 表示 px，string 直接作为 CSS 值；不传则按 affix 自动（无 affix 为 0，有 affix 为 0 6px） */
    padding?: number | string
    /**
     * hover / active 背景档位（按按钮所在背景选择，具体色值由组件内置）：
     * - default：常规底色上（默认，用 --bg-hover）
     * - muted：灰色/已变色背景上（如 hover 中的标签），再突出一档
     * - dark：深色背景上，用半透明白叠加
     * - prominent：更明显的 hover 背景（用半透明白 0.25），适合背景色较浅的区域
     */
    hoverVariant?: 'default' | 'muted' | 'dark' | 'prominent'
    /** 危险操作按钮（如删除）：hover 时图标变告警红 + 淡红背景。与 hoverVariant 正交，可组合 */
    danger?: boolean
    /**
     * 悬浮提示：
     * - string：提示文本，用 NTooltip 默认配置
     * - object：{ content: 文本, ...其余 NTooltip props }，可自定义 placement/delay 等
     * 不传或空时不渲染 NTooltip。
     */
    tooltip?: string | TooltipConfig
    /**
     * tooltip 是否可交互（鼠标可移入其上）。
     * 默认 false：tooltip 鼠标穿透（pointer-events:none）、移入即消失，纯提示用。
     * true：去掉穿透并保活，可在 tooltip 内放可点击内容。
     */
    tooltipInteractive?: boolean
    active?: boolean
    disabled?: boolean
    /** 是否显示为圆形按钮，默认 true；设为 false 则为圆角矩形（border-radius: 8px） */
    rounded?: boolean
    /** 默认状态背景档位：'transparent'（无背景，默认）| 'subtle'（--bg-hover 背景） */
    variant?: 'transparent' | 'subtle' | 'accent'
  }>(),
  {
    gap: 6,
    hoverVariant: 'default',
    variant: 'transparent',
    danger: false,
    tooltipInteractive: false,
    active: false,
    disabled: false,
    rounded: true,
  },
)

const emit = defineEmits<{ (e: 'click', ev: MouseEvent): void }>()

const DEFAULT_SIZE = 18

/** 归一化 tooltip 配置：string → { content, props:{} }；object → { content, props: 其余字段 }；空 → null */
const tooltipConfig = computed<{ content: string, props: Partial<TooltipProps> } | null>(() => {
  const tip = props.tooltip
  if (!tip) {
    return null
  }
  if (typeof tip === 'string') {
    return tip.length > 0 ? { content: tip, props: {} } : null
  }
  const { content, ...rest } = tip
  return content && content.length > 0 ? { content, props: rest } : null
})

function parseIcon(arg: IconArg): { name: string, sz: number } {
  if (typeof arg === 'string') {
    return { name: arg, sz: DEFAULT_SIZE }
  }
  return { name: arg.name, sz: arg.size }
}

const hasAffix = computed(() => !!(props.prefixIcon || props.suffixIcon))
const prefix = computed(() => (props.prefixIcon ? parseIcon(props.prefixIcon) : null))
const suffix = computed(() => (props.suffixIcon ? parseIcon(props.suffixIcon) : null))
const mainIcon = computed(() => parseIcon(props.icon))

function toEven(n: number): number {
  const v = Math.floor(n)
  return v % 2 === 0 ? v : v - 1
}

const btnStyle = computed(() => {
  const style: Record<string, string> = {}
  if (hasAffix.value) {
    // 有 affix 图标时宽度自动撑开，不设置 width
    let h: number
    if (props.btnSize !== undefined) {
      h = Array.isArray(props.btnSize) ? props.btnSize[1] : props.btnSize
    }
    else {
      const allIcons = [mainIcon.value, prefix.value, suffix.value].filter(Boolean) as { sz: number }[]
      const maxIcon = Math.max(...allIcons.map(i => i.sz))
      h = toEven(maxIcon * 1.5)
    }
    style.height = `${h}px`
  }
  else if (props.btnSize !== undefined) {
    const [w, h] = Array.isArray(props.btnSize) ? props.btnSize : [props.btnSize, props.btnSize]
    style.width = `${w}px`
    style.height = `${h}px`
  }
  else {
    const size = toEven(DEFAULT_SIZE * 1.5)
    style.width = `${size}px`
    style.height = `${size}px`
  }
  if (props.padding !== undefined) {
    style.padding = typeof props.padding === 'number' ? `${props.padding}px` : props.padding
  }
  else if (hasAffix.value && props.btnSize === undefined) {
    style.padding = '0 6px'
  }
  style.gap = `${props.gap}px`
  return style
})

function onClick(ev: MouseEvent): void {
  if (props.disabled) {
    return
  }
  emit('click', ev)
}
</script>

<style lang="less" scoped>
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color 0.12s ease;

  &.has-affix {
    border-radius: 8px;
  }

  &.is-square {
    border-radius: 8px;
  }

  &:disabled {
    color: var(--text-muted);
    cursor: not-allowed;
  }
}

/* hover / active 背景按档位内置，外部只通过 hoverVariant 选择所在背景，无需传色值 */
.icon-btn {
  /* 默认状态背景 */
  &.variant-transparent {
    background: none;
  }
  &.variant-subtle {
    background: var(--bg-hover);
  }
  &.variant-accent {
    background: var(--accent-color);
    color: #fff;
  }

  /* hover / active 状态 */
  &.hover-default:hover:not(:disabled),
  &.hover-default.is-active {
    background: var(--bg-hover);
  }
  &.hover-muted:hover:not(:disabled),
  &.hover-muted.is-active {
    background: var(--bg-hover);
  }
  &.hover-dark:hover:not(:disabled),
  &.hover-dark.is-active {
    background: rgba(255, 255, 255, 0.12);
  }
  &.hover-prominent:hover:not(:disabled),
  &.hover-prominent.is-active {
    background: var(--accent-color-translucent);
  }

  /* variant-accent 的 hover：叠半透明白提亮 */
  &.variant-accent.hover-default:hover:not(:disabled),
  &.variant-accent.hover-default.is-active,
  &.variant-accent.hover-muted:hover:not(:disabled),
  &.variant-accent.hover-muted.is-active,
  &.variant-accent.hover-dark:hover:not(:disabled),
  &.variant-accent.hover-dark.is-active,
  &.variant-accent.hover-prominent:hover:not(:disabled),
  &.variant-accent.hover-prominent.is-active {
    background: var(--accent-color);
    box-shadow: inset 0 0 0 999px rgba(255, 255, 255, 0.12);
  }
}

/* danger：危险操作按钮 hover 时图标变告警红 + 淡红背景。
   放在各 hoverVariant 规则之后以覆盖其背景（同特异性、后者胜出）。 */
.icon-btn.is-danger:hover:not(:disabled),
.icon-btn.is-danger.is-active {
  color: var(--danger-color);
  background: color-mix(in srgb, var(--danger-color) 14%, transparent);
}
</style>
