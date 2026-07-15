# AddressBar 自定义面板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Autocomplete dropdown with an inline focus panel that wraps the input in a white rounded rectangle with suggestions below.

**Architecture:** Modify AddressBar.vue to manage focus state, render a positioned panel overlay on focus containing the input + suggestions, and handle keyboard/mouse interactions. Delete the standalone Autocomplete.vue.

**Tech Stack:** Vue 3 Composition API, TypeScript, CSS scoped styles

## Global Constraints

- Package manager: `bun`
- Lint: `bun run lint` (biome TS + eslint Vue + typecheck)
- Format: `bun run format`
- Follow existing CSS variable conventions (`--text-primary`, `--bg-tertiary`, etc.)
- No new dependencies

---

### Task 1: Modify AddressBar.vue — integrate inline panel

**Files:**
- Modify: `apps/renderer/src/components/AddressBar.vue`

**Interfaces:**
- Consumes: `window.browserAPI.getAutocompleteSuggestions({ query, limit })` → `AutocompleteSuggestion[]`
- Produces: Panel open/close state, suggestion selection, keyboard navigation

- [ ] **Step 1: Add state variables and suggestion logic**

Add to `<script setup>`:

```ts
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const isFocused = ref(false)
const suggestions = ref<{ type: 'history' | 'bookmark' | 'search'; title: string; url: string }[]>([])
const activeIndex = ref(-1)
const panelRef = ref<HTMLDivElement>()
let debounceTimer: ReturnType<typeof setTimeout> | null = null
```

- [ ] **Step 2: Add focus/blur handlers with click-outside detection**

```ts
function onFocus(): void {
  isFocused.value = true
  requestAnimationFrame(() => {
    inputRef.value?.select()
  })
  fetchSuggestions()
}

function onBlur(): void {
  // Delay to allow suggestion click to fire first
  setTimeout(() => {
    isFocused.value = false
    suggestions.value = []
    activeIndex.value = -1
  }, 150)
}

function onPanelMouseDown(e: MouseEvent): void {
  // Prevent blur when clicking inside the panel
  if (panelRef.value?.contains(e.target as Node)) {
    e.preventDefault()
  }
}
```

- [ ] **Step 3: Add suggestion fetching and keyboard handling**

```ts
function fetchSuggestions(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (!urlInput.value.trim()) {
    suggestions.value = []
    return
  }
  debounceTimer = setTimeout(async () => {
    suggestions.value = await window.browserAPI.getAutocompleteSuggestions({
      query: urlInput.value,
      limit: 6,
    })
    activeIndex.value = -1
  }, 200)
}

function onInputKeydown(e: KeyboardEvent): void {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, suggestions.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, -1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (activeIndex.value >= 0 && suggestions.value[activeIndex.value]) {
      selectSuggestion(suggestions.value[activeIndex.value].url)
    } else {
      navigate()
    }
  } else if (e.key === 'Escape') {
    isFocused.value = false
    inputRef.value?.blur()
  }
}

function selectSuggestion(url: string): void {
  isFocused.value = false
  suggestions.value = []
  window.browserAPI.loadURL(props.tabId, url)
  emit('navigate', url)
}
```

- [ ] **Step 4: Watch urlInput for suggestion re-fetch**

```ts
watch(urlInput, () => {
  if (isFocused.value) {
    fetchSuggestions()
  }
})
```

- [ ] **Step 5: Update template — replace Autocomplete with inline panel**

Replace the `<Autocomplete>` tag and restructure `.url-input-wrap`:

```vue
<template>
  <div class="address-bar">
    <IconButton icon="ic:round-arrow-back" :disabled="!canGoBack" @click="goBack" />
    <IconButton icon="ic:round-arrow-forward" :disabled="!canGoForward" @click="goForward" />
    <IconButton :icon="isLoading ? 'ic:round-close' : 'ic:round-refresh'" @click="isLoading ? stop() : reload()" />
    <IconButton icon="ic:round-home" @click="goHome" />
    <IconButton icon="ic:round-print" @click="printPage" />
    <div class="url-input-wrap">
      <input
        ref="inputRef"
        v-model="urlInput"
        class="url-input"
        :class="{ focused: isFocused }"
        :placeholder="t('addressBar.placeholder')"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="onInputKeydown"
      />
      <div v-if="!isFocused" class="url-input-actions">
        <button class="zoom-display" @click="cycleZoom">
          {{ currentZoomLevel }}
        </button>
        <button class="bookmark-btn" :class="{ bookmarked: isBookmarked }" @click="toggleBookmark">
          <Icon :icon="isBookmarked ? 'ic:round-star' : 'ic:round-star-outline'" :width="iconSize" :height="iconSize" />
        </button>
      </div>
      <div
        v-if="isFocused"
        ref="panelRef"
        class="url-panel"
        @mousedown="onPanelMouseDown"
      >
        <div class="url-panel-input-row">
          <input
            ref="panelInputRef"
            v-model="urlInput"
            class="url-panel-input"
            :placeholder="t('addressBar.placeholder')"
            @blur="onBlur"
            @keydown="onInputKeydown"
          />
          <div class="url-panel-actions">
            <button class="zoom-display" @click="cycleZoom">
              {{ currentZoomLevel }}
            </button>
            <button class="bookmark-btn" :class="{ bookmarked: isBookmarked }" @click="toggleBookmark">
              <Icon :icon="isBookmarked ? 'ic:round-star' : 'ic:round-star-outline'" :width="iconSize" :height="iconSize" />
            </button>
          </div>
        </div>
        <div v-if="suggestions.length > 0" class="url-panel-suggestions">
          <div
            v-for="(item, index) in suggestions"
            :key="item.url"
            class="url-panel-suggestion-item"
            :class="{ active: index === activeIndex }"
            @mousedown.prevent="selectSuggestion(item.url)"
            @mouseenter="activeIndex = index"
          >
            <Icon v-if="item.type === 'history'" icon="carbon:time" width="14" height="14" />
            <Icon v-else-if="item.type === 'bookmark'" icon="carbon:bookmark-filled" width="14" height="14" />
            <Icon v-else icon="ic:round-search" width="14" height="14" />
            <span class="suggestion-title">{{ item.title }}</span>
            <span class="suggestion-url">{{ item.url }}</span>
          </div>
        </div>
      </div>
    </div>
    <AppMenuButton />
  </div>
</template>
```

- [ ] **Step 6: Add panelInputRef and focus sync**

```ts
const panelInputRef = ref<HTMLInputElement>()

watch(isFocused, (focused) => {
  if (focused) {
    nextTick(() => {
      panelInputRef.value?.focus()
      panelInputRef.value?.select()
    })
  }
})
```

Remove the old `onFocus` and `onBlur` functions, remove the `Autocomplete` import and `onAutocompleteSelect`/`onAutocompleteClose` functions.

- [ ] **Step 7: Add panel CSS styles**

```css
.url-panel {
  position: absolute;
  left: -8px;
  right: -8px;
  top: 0;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  z-index: 999;
  padding: 6px;
  overflow: hidden;
}

.url-panel-input-row {
  display: flex;
  align-items: center;
}

.url-panel-input {
  flex: 1;
  height: 28px;
  background: #fff;
  border: none;
  border-radius: 8px;
  padding: 0 76px 0 12px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.url-panel-input::placeholder {
  color: var(--text-muted, #999);
}

.url-panel-actions {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
}

.url-panel-suggestions {
  border-top: 1px solid var(--border-color);
  margin-top: 4px;
  padding-top: 4px;
}

.url-panel-suggestion-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
}

.url-panel-suggestion-item:hover,
.url-panel-suggestion-item.active {
  background: var(--bg-tertiary);
}

.suggestion-title {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.suggestion-url {
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}
```

- [ ] **Step 8: Verify — run lint**

Run: `bun run lint`
Expected: No errors

---

### Task 2: Delete Autocomplete.vue

**Files:**
- Delete: `apps/renderer/src/components/Autocomplete.vue`

- [ ] **Step 1: Delete the file**

Run: `rm apps/renderer/src/components/Autocomplete.vue`

- [ ] **Step 2: Verify no remaining imports**

Run: `grep -r "Autocomplete" apps/renderer/src/`
Expected: No results (or only unrelated matches)

- [ ] **Step 3: Run lint again**

Run: `bun run lint`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/renderer/src/components/AddressBar.vue apps/renderer/src/components/Autocomplete.vue
git commit -m "feat: replace Autocomplete dropdown with inline focus panel"
```
