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
  </div>
</template>

<script setup lang="ts">
import type { ShortcutInfo } from '@browser/ipc-contract'
import { computed, onMounted, ref } from 'vue'
import KbdKey from '@/components/KbdKey.vue'
import Section from '@/components/Section.vue'
import SectionItem from '@/components/SectionItem.vue'
import { useI18n } from '@/composables/useI18n'

const { t, lang } = useI18n()
const currentLang = computed(() =>
  lang.value === 'system' ? (navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US') : lang.value,
)

type Group = 'navigation' | 'tab' | 'window' | 'devtools' | 'global'
const ORDER: Group[] = ['navigation', 'tab', 'window', 'devtools', 'global']

const shortcuts = ref<ShortcutInfo[]>([])

const grouped = computed<Record<string, ShortcutInfo[]>>(() => {
  const map: Record<string, ShortcutInfo[]> = {}
  for (const g of ORDER) map[g] = []
  for (const s of shortcuts.value) {
    if (s.hidden)
      continue
    if (!map[s.group])
      map[s.group] = []
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
})
</script>

<style scoped>
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
</style>
