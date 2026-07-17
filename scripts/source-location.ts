import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'esbuild'

export const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..')

export function isInstrumentEnabled(): boolean {
  return process.env.WMFX_DEV_INSTRUMENT === '1'
}

const CALL_RE =
  /((?:console|logger))\s*(?:\.\s*([A-Za-z_$][\w$]*)\s*|\[\s*['"]([A-Za-z_$][\w$]*)['"]\s*\])\s*\(/g

const METHODS = new Set(['debug', 'log', 'info', 'warn', 'error'])

function locOfOffset(code: string, offset: number): { line: number; col: number } {
  let line = 1
  let col = 1
  for (let i = 0; i < offset; i++) {
    if (code[i] === '\n') {
      line++
      col = 1
    } else {
      col++
    }
  }
  return { line, col }
}

function buildInStringMask(code: string): boolean[] {
  const mask = new Array<boolean>(code.length).fill(false)
  let inStr: string | null = null
  let escaped = false
  for (let i = 0; i < code.length; i++) {
    const c = code[i]
    if (inStr) {
      mask[i] = true
      if (escaped) {
        escaped = false
      } else if (c === '\\') {
        escaped = true
      } else if (c === inStr) {
        inStr = null
      }
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      inStr = c
      mask[i] = true
    }
  }
  return mask
}

export function rewriteConsoleCalls(code: string, id: string, root: string = REPO_ROOT): string {
  const rel = path.relative(root, id).split(path.sep).join('/')
  const mask = buildInStringMask(code)
  CALL_RE.lastIndex = 0
  let result = ''
  let lastIndex = 0
  let m = CALL_RE.exec(code)
  while (m !== null) {
    const prefix = m[1]
    const method = m[2] ?? m[3]
    const matchEnd = m.index + m[0].length
    if (!METHODS.has(method) || mask[m.index]) {
      m = CALL_RE.exec(code)
      continue
    }
    const { line, col } = locOfOffset(code, m.index)
    const loc = `${rel}:${line}:${col}`
    result += code.slice(lastIndex, m.index)
    result += `${prefix}.${method}('${loc}', `
    lastIndex = matchEnd
    m = CALL_RE.exec(code)
  }
  result += code.slice(lastIndex)
  return result
}

export function sourceLocationVuePlugin(root: string = REPO_ROOT): {
  name: string
  enforce: 'pre'
  transform: (code: string, id: string) => string | { code: string } | null
} {
  return {
    name: 'source-location-vue',
    enforce: 'pre',
    transform(code, id) {
      if (!isInstrumentEnabled()) return null
      if (!id.endsWith('.vue')) return null
      const out = rewriteConsoleCalls(code, id, root)
      return out === code ? null : { code: out }
    },
  }
}

export function sourceLocationEsbuildPlugin(root: string = REPO_ROOT): Plugin {
  return {
    name: 'source-location',
    setup(build) {
      build.onLoad({ filter: /\.(ts|tsx)$/ }, async (args) => {
        if (!isInstrumentEnabled()) return null
        const contents = await readFile(args.path, 'utf8')
        const out = rewriteConsoleCalls(contents, args.path, root)
        if (out === contents) return null
        const loader = args.path.endsWith('.tsx') ? 'tsx' : 'ts'
        return { contents: out, loader }
      })
    },
  }
}
