import { afterEach, describe, expect, it } from 'bun:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { build } from 'esbuild'
import {
  isInstrumentEnabled,
  rewriteConsoleCalls,
  sourceLocationEsbuildPlugin,
  sourceLocationVuePlugin,
} from '../source-location.ts'

describe('isInstrumentEnabled', () => {
  const original = process.env.WMFX_DEV_INSTRUMENT
  afterEach(() => {
    if (original === undefined) delete process.env.WMFX_DEV_INSTRUMENT
    else process.env.WMFX_DEV_INSTRUMENT = original
  })

  it('returns true when WMFX_DEV_INSTRUMENT=1', () => {
    process.env.WMFX_DEV_INSTRUMENT = '1'
    expect(isInstrumentEnabled()).toBe(true)
  })

  it('returns false otherwise', () => {
    process.env.WMFX_DEV_INSTRUMENT = '0'
    expect(isInstrumentEnabled()).toBe(false)
    delete process.env.WMFX_DEV_INSTRUMENT
    expect(isInstrumentEnabled()).toBe(false)
  })
})

describe('rewriteConsoleCalls', () => {
  it('rewrites console.debug with relative path, line and column', () => {
    const out = rewriteConsoleCalls(
      "console.debug('[X] hi', tabId)\n",
      '/repo/apps/main/src/a.ts',
      '/repo'
    )
    expect(out).toBe("console.debug('apps/main/src/a.ts:1:1', '[X] hi', tabId)\n")
  })

  it('rewrites both dot and bracket form', () => {
    const out = rewriteConsoleCalls(
      "console.error('e')\nconsole['warn']('w')\n",
      '/repo/p.ts',
      '/repo'
    )
    expect(out).toContain("console.error('p.ts:1:1', 'e')")
    expect(out).toContain("console.warn('p.ts:2:1', 'w')")
  })

  it('does not rewrite console-like string content', () => {
    const code = 'const s = \'console.log("x")\'\n'
    expect(rewriteConsoleCalls(code, '/repo/p.ts', '/repo')).toBe(code)
  })

  it('rewrites logger.debug with relative path, line and column', () => {
    const out = rewriteConsoleCalls(
      "logger.debug('[X] hi', tabId)\n",
      '/repo/apps/renderer/src/Comp.vue',
      '/repo'
    )
    expect(out).toBe("logger.debug('apps/renderer/src/Comp.vue:1:1', '[X] hi', tabId)\n")
  })

  it('uses correct line and column for later calls', () => {
    const out = rewriteConsoleCalls(
      "const a = 1\nconst b = 2\nconsole.log('here')\n",
      '/repo/p.ts',
      '/repo'
    )
    expect(out).toContain("'p.ts:3:1', 'here'")
  })
})

describe('sourceLocationEsbuildPlugin', () => {
  it('injects location through esbuild transform with relative path', async () => {
    process.env.WMFX_DEV_INSTRUMENT = '1'
    const dir = join(import.meta.dirname, '.srcloc-tmp')
    const plugin = sourceLocationEsbuildPlugin(dir)
    const file = join(dir, 'apps/main/src/x.ts')
    await mkdir(join(dir, 'apps/main/src'), { recursive: true })
    await writeFile(file, "console.log('hi')\n", 'utf8')
    const res = await build({
      entryPoints: [file],
      bundle: false,
      write: false,
      plugins: [plugin],
    })
    expect(res.outputFiles[0].text).toContain('apps/main/src/x.ts:1:1')
    expect(res.outputFiles[0].text).toContain('hi')
    await rm(dir, { recursive: true, force: true })
    delete process.env.WMFX_DEV_INSTRUMENT
  })
})

describe('sourceLocationVuePlugin', () => {
  it('rewrites console inside <script> with relative path, line and column', () => {
    process.env.WMFX_DEV_INSTRUMENT = '1'
    const plugin = sourceLocationVuePlugin('/repo')
    const code = "<template><div/></template>\n<script setup>\nconsole.log('hi')\n</script>\n"
    const res = plugin.transform(code, '/repo/apps/renderer/src/Comp.vue')
    expect(res).toBeDefined()
    const out = typeof res === 'string' ? res : res.code
    expect(out).toContain("'apps/renderer/src/Comp.vue:3:1', 'hi'")
    delete process.env.WMFX_DEV_INSTRUMENT
  })
})
