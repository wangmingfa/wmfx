<template>
  <div
    class="command-palette"
    @keydown="onKeydown"
  >
    <div class="command-palette-input-wrapper">
      <input
        ref="inputRef"
        :value="query"
        class="command-palette-input"
        :placeholder="t('commandPalette.placeholder')"
        autofocus
        @input="onInput"
      />
    </div>
    <div class="command-palette-results">
      <div
        v-if="isLoading"
        class="command-palette-loading"
      >
        {{ t('commandPalette.loading') }}
      </div>
      <div
        v-else-if="error"
        class="command-palette-error"
      >
        {{ error }}
      </div>
      <div
        v-else-if="items.length === 0"
        class="command-palette-empty"
      >
        {{ t('commandPalette.noResults') }}
      </div>
      <template v-else>
        <div
          v-for="(group, groupIndex) in groupedItems"
          :key="group.category"
          class="command-palette-group"
        >
          <div
            v-if="groupIndex > 0"
            class="command-palette-separator"
          />
          <div class="command-palette-group-label">
            {{ group.category }}
          </div>
          <div
            v-for="item in group.items"
            :key="item.id"
            class="command-palette-item"
            :class="{ 'is-selected': items.indexOf(item) === selectedIndex }"
            @mouseenter="onItemHover(items.indexOf(item))"
            @click="onItemClick"
          >
            <Icon
              :icon="item.icon"
              :width="16"
              :height="16"
              class="command-palette-item-icon"
            />
            <span class="command-palette-item-title">{{ item.title }}</span>
            <span
              v-if="item.subtitle"
              class="command-palette-item-subtitle"
            >{{ item.subtitle }}</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { onMounted, ref } from 'vue'
import { useI18n } from '../composables/useI18n'
import { useCommandPalette } from './composables/useCommandPalette'

const props = defineProps<{
  popoverId: string
}>()

const { t } = useI18n()
const {
  query,
  items,
  selectedIndex,
  isLoading,
  error,
  groupedItems,
  loadData,
  setQuery,
  moveUp,
  moveDown,
  moveToNextCategory,
  executeSelected,
} = useCommandPalette(t)

const inputRef = ref<HTMLInputElement>()

function onInput(e: Event): void {
  const target = e.target as HTMLInputElement
  setQuery(target.value)
}

function onItemHover(index: number): void {
  selectedIndex.value = index
}

async function onItemClick(): Promise<void> {
  await executeSelected()
  window.browserAPI.popoverClose(props.popoverId)
}

async function onKeydown(e: KeyboardEvent): Promise<void> {
  switch (e.key) {
    case 'ArrowUp':
      e.preventDefault()
      moveUp()
      break
    case 'ArrowDown':
      e.preventDefault()
      moveDown()
      break
    case 'Tab':
      e.preventDefault()
      moveToNextCategory()
      break
    case 'Enter':
      e.preventDefault()
      await executeSelected()
      window.browserAPI.popoverClose(props.popoverId)
      break
    case 'Escape':
      e.preventDefault()
      window.browserAPI.popoverClose(props.popoverId)
      break
  }
}

onMounted(async () => {
  await loadData()
  inputRef.value?.focus()
})
</script>

<style lang="less" scoped>
.command-palette {
  width: 560px;
  max-height: 400px;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  animation: slide-in 150ms ease-out;

  @keyframes slide-in {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
}

.command-palette-input-wrapper {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.command-palette-input {
  width: 100%;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 15px;
  font-family: var(--font-sans);

  &::placeholder {
    color: var(--text-muted);
  }
}

.command-palette-results {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.command-palette-loading,
.command-palette-error,
.command-palette-empty {
  padding: 16px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.command-palette-group {
  & + & {
    margin-top: 4px;
  }
}

.command-palette-separator {
  height: 1px;
  background: var(--border-color);
  margin: 4px 16px;
}

.command-palette-group-label {
  padding: 4px 16px;
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
}

.command-palette-item {
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 16px;
  cursor: pointer;
  gap: 12px;

  &:hover,
  &.is-selected {
    background: var(--bg-hover);
  }

  &.is-selected {
    border-left: 3px solid var(--accent-color);
    padding-left: 13px;
  }
}

.command-palette-item-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.command-palette-item-title {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-palette-item-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}
</style>
