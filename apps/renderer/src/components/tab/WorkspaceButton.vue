<template>
  <div
    v-if="currentWorkspace"
    class="workspace-btn"
    :style="{ width: `${size}px`, height: `${size}px`, background: currentWorkspace.color }"
    :title="currentWorkspace.name"
    @click="openWorkspacePanel"
  >
    {{ currentWorkspace.name.charAt(0) }}
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useWorkspaceButton } from '@/composables/useWorkspaceButton'

const props = withDefaults(
  defineProps<{
    /** 弹层相对按钮的弹出方向（horizontal 用 bottom-start，vertical 用 right-start） */
    placement: 'bottom-start' | 'right-start'
    /** 弹层与按钮间距（px） */
    gap: number
    /** 按钮边长（px），默认 32 */
    size?: number
  }>(),
  { size: 32 },
)

const { currentWorkspace, openWorkspacePanel, initWorkspace } = useWorkspaceButton({
  placement: props.placement,
  gap: props.gap,
})

onMounted(async () => {
  await initWorkspace()
})
</script>

<style scoped lang="less">
.workspace-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  flex-shrink: 0;
  border-radius: 6px;
  transition: opacity 0.15s;
  -webkit-app-region: no-drag;

  &:hover {
    opacity: 0.85;
  }
}
</style>
