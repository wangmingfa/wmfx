import type { BookmarkItem } from '@browser/ipc-contract'
import { computed, ref } from 'vue'

const bookmarks = ref<BookmarkItem[]>([])

const byParent = computed<Map<string | null, BookmarkItem[]>>(() => {
  const map = new Map<string | null, BookmarkItem[]>()
  for (const item of bookmarks.value) {
    const key = item.parentId
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }
  for (const list of map.values()) list.sort((a, b) => a.position - b.position)
  return map
})

let registered = false

export function useBookmarks() {
  async function load(): Promise<void> {
    const ws = await window.browserAPI.getActiveWorkspace()
    const wsId = ws?.id ?? null
    bookmarks.value = await window.browserAPI.getBookmarksByWorkspace(null)
    console.debug('[useBookmarks] load: workspaceId=%s count', wsId, bookmarks.value.length)
  }

  function reload(): void {
    console.debug('[useBookmarks] reload: enter')
    void load()
  }

  async function moveBookmark(
    id: string,
    parentId: string | null,
    position: number
  ): Promise<void> {
    console.debug('[useBookmarks] moveBookmark: id parentId position', id, parentId, position)
    await window.browserAPI.moveBookmark({ id, parentId, position })
  }

  if (!registered) {
    registered = true
    console.debug(
      '[useBookmarks] register: onBookmarksChanged + onWorkspaceSwitched listeners attached'
    )
    window.browserAPI.onBookmarksChanged(() => reload())
    window.browserAPI.onWorkspaceSwitched(() => reload())
  }

  return { bookmarks, byParent, load, reload, moveBookmark }
}
