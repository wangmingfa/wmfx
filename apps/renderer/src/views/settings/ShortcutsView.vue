<template>
  <div class="shortcuts-view">
    <Section
      v-for="grp in orderedGroups"
      :key="grp"
      :title="groupTitle(grp)"
    >
      <SectionItem
        v-for="s in grouped[grp]"
        :key="s.id"
      >
        <template #label>
          <span class="shortcut-label">
            {{ currentLang === 'zh-CN' ? s.description['zh-CN'] : s.description['en-US'] }}
          </span>
          <span
            class="scope-tag"
            :class="s.scope"
          >
            {{ s.scope === 'global' ? t('shortcuts.scopeGlobal') : t('shortcuts.scopeInApp') }}
          </span>
        </template>
        <KbdKey :accelerator="s.accelerator" />
      </SectionItem>
    </Section>

    <Section
      v-if="grouped.global && grouped.global.length === 0"
      :title="groupTitle('global')"
    >
      <div class="empty-global">
        {{ t('shortcuts.emptyGlobal') }}
      </div>
    </Section>

    <Section
      class="keyboard-mode"
      :title="t('settings.sections.keyboard')"
    >
      <div class="keyboard-mode-header">
        <span class="keyboard-mode-title">{{ t('settings.keyboardMode') }}</span>
        <NSelect
          :value="keyboardMode"
          :options="keyboardModeOptions"
          style="width: 140px"
          @update:value="onKeyboardModeChange"
        />
      </div>

      <div
        v-if="keyboardMode === 'vim'"
        class="vim-mode-warning"
      >
        {{ t('settings.vimModeWarning') }}
      </div>

      <div class="keybinding-scope-legend">
        <span class="scope-tag scope-global">{{ t('settings.scopeGlobal') }}</span>
        <span class="scope-tag scope-shell">{{ t('settings.scopeShell') }}</span>
        <span class="scope-tag scope-page">{{ t('settings.scopePage') }}</span>
      </div>

      <div
        v-for="section in currentKeybindingSections"
        :key="section.title"
        class="keybinding-group"
      >
        <div class="keybinding-group-title">
          {{ section.title }}
        </div>
        <div
          v-for="entry in section.entries"
          :key="entry.key"
          class="keybinding-row"
        >
          <div class="keybinding-left">
            <kbd class="keybinding-key">{{ entry.key }}</kbd>
            <span class="keybinding-desc">{{ entry.description }}</span>
          </div>
          <span
            class="scope-tag"
            :class="{
              'scope-global': entry.scope === 'global',
              'scope-shell': entry.scope === 'shell',
              'scope-page': entry.scope === 'page',
            }"
          >
            {{ scopeLabels[entry.scope] }}
          </span>
        </div>
      </div>
    </Section>
  </div>
</template>

<script setup lang="ts">
import type { ShortcutInfo } from '@browser/ipc-contract'
import type { KeybindingSection } from '@/keyboard/keybindings'
import { NSelect } from 'naive-ui'
import { computed, onMounted, ref } from 'vue'
import KbdKey from '@/components/KbdKey.vue'
import Section from '@/components/Section.vue'
import SectionItem from '@/components/SectionItem.vue'
import { useI18n } from '@/composables/useI18n'
import { keybindingModes } from '@/keyboard/keybindings'
import { KeyboardManager } from '@/keyboard/KeyboardManager'

const { t, lang } = useI18n()
const currentLang = computed(() =>
  lang.value === 'system' ? (navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US') : lang.value,
)

const scopeLabels: Record<string, string> = {
  global: '全局',
  shell: '外壳级',
  page: '页面级',
}

const keyboardMode = ref<'gui' | 'vim'>('gui')
const keyboardModeOptions = [
  { label: 'GUI 模式', value: 'gui' },
  { label: 'VIM 模式', value: 'vim' },
]

const currentKeybindingSections = computed<KeybindingSection[]>(() => {
  const config = keybindingModes.find(m => m.value === keyboardMode.value)
  return config?.sections ?? []
})

async function onKeyboardModeChange(value: 'gui' | 'vim'): Promise<void> {
  console.info('[ShortcutsView] keyboardMode changed to:', value)
  keyboardMode.value = value
  await KeyboardManager.getInstance().switchMode(value)
}

type Group = 'navigation' | 'tab' | 'window' | 'devtools' | 'global'
const ORDER: Group[] = ['navigation', 'tab', 'window', 'devtools', 'global']

const shortcuts = ref<ShortcutInfo[]>([])

const grouped = computed<Record<string, ShortcutInfo[]>>(() => {
  const map: Record<string, ShortcutInfo[]> = {}
  for (const g of ORDER) {
    map[g] = []
  }
  for (const s of shortcuts.value) {
    if (s.hidden) {
      continue
    }
    if (!map[s.group]) {
      map[s.group] = []
    }
    map[s.group].push(s)
  }
  return map
})

const orderedGroups = computed<Group[]>(() => ORDER.filter(g => (grouped.value[g]?.length ?? 0) > 0))

function groupTitle(g: Group): string {
  const titles: Record<Group, string> = {
    navigation: t('shortcuts.navGroupNavigation'),
    tab: t('shortcuts.navGroupTab'),
    window: t('shortcuts.navGroupWindow'),
    devtools: t('shortcuts.navGroupDevtools'),
    global: t('shortcuts.scopeGlobal'),
  }
  return titles[g]
}

onMounted(async () => {
  console.debug('[ShortcutsView] onMounted: pulling shortcuts list')
  shortcuts.value = await window.browserAPI.getShortcuts()
  const kbMode = (await window.browserAPI.getSetting('keyboardMode')) as string
  if (kbMode === 'gui' || kbMode === 'vim') {
    keyboardMode.value = kbMode
  }
})
</script>

<style lang="less" scoped>
.shortcuts-view {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.shortcut-label {
  font-size: 14px;
  color: var(--text-primary);
}

.scope-tag {
  margin-left: 8px;
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  color: var(--text-muted);
}

.scope-tag.global {
  color: var(--color-primary, #4361ee);
  border-color: var(--color-primary, #4361ee);
}

.empty-global {
  padding: 16px 20px;
  color: var(--text-muted);
  font-size: 13px;
}

.keyboard-mode {
  :deep(.section-body) {
    padding: 10px;
  }
}

.keyboard-mode-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.keyboard-mode-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.vim-mode-warning {
  margin-bottom: 16px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--warning-color);
  background: var(--warning-bg);
  border: 1px solid var(--warning-color);
  border-radius: 6px;
}

.keybinding-scope-legend {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  padding: 8px 0;
  background: var(--bg-secondary);
  border-radius: 6px;
}

.keybinding-group {
  margin-bottom: 16px;
}

.keybinding-group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  padding-left: 4px;
}

.keybinding-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 4px;
  border-bottom: 1px solid var(--border-light);

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: var(--bg-hover);
  }
}

.keybinding-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.keybinding-key {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 2px 6px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-light);
  border-radius: 4px;
  min-width: 80px;
  text-align: center;
  color: var(--text-primary);
}

.keybinding-desc {
  font-size: 13px;
  color: var(--text-secondary);
}

.scope-tag {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  color: var(--text-muted);

  &.scope-global {
    color: var(--color-primary, #4361ee);
    border-color: var(--color-primary, #4361ee);
  }

  &.scope-shell {
    background: var(--warning-bg);
    color: var(--warning-color);
    border-color: var(--warning-color);
  }

  &.scope-page {
    background: var(--success-bg);
    color: var(--success-color);
    border-color: var(--success-color);
  }
}
</style>
