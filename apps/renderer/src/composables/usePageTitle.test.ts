import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'
import { usePageTitle } from './usePageTitle'

// Mock Document and document globally for browser API simulation
const mockDocument = { title: '' }
vi.stubGlobal('document', mockDocument)
vi.stubGlobal('Document', { prototype: mockDocument })

// Flush pending Vue watchers by running nextTick twice
async function flush() {
  await nextTick()
  await nextTick()
}

describe('usePageTitle', () => {
  beforeEach(() => {
    mockDocument.title = ''
  })

  it('sets title from static string initial', async () => {
    const [title] = usePageTitle('Settings')
    await flush()
    expect(document.title).toBe('Settings')
    expect(title.value).toBe('Settings')
  })

  it('updates title via setTitle', async () => {
    const [, setTitle] = usePageTitle('Init')
    await flush()
    expect(document.title).toBe('Init')
    setTitle('New Title')
    await flush()
    expect(document.title).toBe('New Title')
  })

  it('syncs from watchable ref', async () => {
    const sourceRef = ref('Source Value')
    const [title] = usePageTitle(sourceRef)
    await flush()
    expect(document.title).toBe('Source Value')
    expect(title.value).toBe('Source Value')

    sourceRef.value = 'Updated'
    await flush()
    expect(document.title).toBe('Updated')
    expect(title.value).toBe('Updated')
  })

  it('syncs from watchable computed', async () => {
    const prefix = ref('Hello')
    const source = computed(() => `${prefix.value} World`)
    const [title] = usePageTitle(source)
    await flush()
    expect(document.title).toBe('Hello World')
    expect(title.value).toBe('Hello World')

    prefix.value = 'Goodbye'
    await flush()
    expect(document.title).toBe('Goodbye World')
    expect(title.value).toBe('Goodbye World')
  })

  it('handles null/undefined initial', async () => {
    const [title] = usePageTitle(undefined)
    await flush()
    expect(document.title).toBe('')
    expect(title.value).toBe('')
  })

  it('title is read-only computed', async () => {
    const [title] = usePageTitle('Test')
    await flush()
    expect(typeof title.value).toBe('string')
  })
})
