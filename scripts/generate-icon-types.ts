import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

interface IconSet {
  prefix?: string
  icons?: Record<string, unknown> | { icons?: Record<string, unknown>; prefix?: string }
}

const PACKAGES: { prefix: string; pkg: string }[] = [
  { prefix: 'mdi', pkg: '@iconify-json/mdi' },
  { prefix: 'ic', pkg: '@iconify-json/ic' },
  { prefix: 'carbon', pkg: '@iconify-json/carbon' },
]

function extractIconNames(prefix: string, pkgName: string): string[] {
  try {
    const mod: unknown = require(pkgName)
    // @iconify-json/* 导出格式: { default: IconifyJSON } 或直接 IconifyJSON
    const iconSet = (mod as { default?: IconSet }).default || (mod as IconSet)
    // 有些包 icons 属性直接是 icon data，有些包 icons.icons 才是
    const icons = iconSet.icons
    const iconNames =
      icons && typeof icons === 'object' && !('prefix' in icons)
        ? icons
        : (icons as unknown as { icons: Record<string, unknown> })?.icons || {}
    return Object.keys(iconNames).map((name) => `${prefix}:${name}`)
  } catch {
    console.warn(`[generate-icon-types] skipped ${pkgName}: not installed`)
    return []
  }
}

function main(): void {
  const allIcons: string[] = []

  for (const { prefix, pkg } of PACKAGES) {
    const icons = extractIconNames(prefix, pkg)
    allIcons.push(...icons)
    console.log(`[generate-icon-types] ${pkg}: ${icons.length} icons`)
  }

  allIcons.sort()

  const lines = allIcons.map((name) => `  | '${name}'`)
  const content = `// 自动生成，请勿手动编辑
// 运行: bunx tsx scripts/generate-icon-types.ts
export type NativeIconName =
${lines.join('\n')}
`

  const outPath = path.join(ROOT, 'packages/ipc-contract/src/icon-names.d.ts')
  writeFileSync(outPath, content, 'utf-8')
  console.log(
    `[generate-icon-types] wrote ${allIcons.length} icons to ${path.relative(ROOT, outPath)}`
  )
}

main()
