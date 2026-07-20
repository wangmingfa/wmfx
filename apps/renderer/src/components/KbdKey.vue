<template>
  <span class="kbd-wrap">
    <kbd
      v-for="(key, i) in keys"
      :key="i"
      class="kbd-key"
    >
      <Icon
        v-if="key.icon"
        :icon="key.icon"
        :width="16"
        :height="16"
      />
      <template v-else>{{ key.text }}</template>
    </kbd>
  </span>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import { isMacOS } from '@/utils/os'

const props = defineProps<{
  /** Electron 加速器字符串，如 'CmdOrCtrl+F' / 'CmdOrCtrl+Shift+T' */
  accelerator: string
}>()

/** 修饰键 → Iconify 图标名（macOS 用 Apple 专用图标，Win/Linux 用通用图标） */
const ICON_MAP: Record<string, { mac?: string, other?: string }> = {
  CmdOrCtrl: { mac: 'mdi:apple-keyboard-command', other: 'mdi:keyboard-esc' },
  Command: { mac: 'mdi:apple-keyboard-command' },
  Cmd: { mac: 'mdi:apple-keyboard-command' },
  Control: { other: 'mdi:apple-keyboard-control' },
  Ctrl: { other: 'mdi:apple-keyboard-control' },
  Alt: { mac: 'mdi:apple-keyboard-option', other: 'mdi:menu' },
  Option: { mac: 'mdi:apple-keyboard-option' },
  Shift: { mac: 'mdi:apple-keyboard-shift', other: 'mdi:apple-keyboard-shift' },
  Enter: { mac: 'mdi:keyboard-return', other: 'mdi:keyboard-return' },
}

interface KeyPart {
  text?: string
  icon?: string
}

function splitParts(acc: string): string[] {
  return acc
    .split('+')
    .map(p => p.trim())
    .filter(Boolean)
}

const keys = computed<KeyPart[]>(() => {
  const out: KeyPart[] = []
  for (const part of splitParts(props.accelerator)) {
    const mapping = ICON_MAP[part]
    if (mapping) {
      const icon = isMacOS ? (mapping.mac ?? mapping.other) : (mapping.other ?? mapping.mac)
      if (icon) {
        out.push({ icon })
        continue
      }
    }
    out.push({ text: part })
  }
  return out
})
</script>

<style scoped>
.kbd-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.kbd-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 26px;
  padding: 0 7px;
  color: var(--text-secondary);
  background: var(--bg-tertiary, #2a2a2a);
  border: 1px solid var(--border-color, #444);
  border-radius: 4px;
}
</style>
