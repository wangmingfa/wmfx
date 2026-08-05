/**
 * electron-builder beforeBuild hook — 打包前把 apps/main/node_modules/
 * 下指向 .bun 的 symlink 替换成真实目录，并补全其 transitive 依赖。
 *
 * bun workspace 的模块是 symlink:
 *   apps/main/node_modules/ws -> ../../../node_modules/.bun/ws@8.21.0/node_modules/ws
 * electron-builder 不会跟随这些指向 workspace 外的 symlinks，导致运行时 ENOENT。
 *
 * 注意：bun 把所有包平铺在 .bun/ 顶层（如 .bun/asn1@0.2.6/），
 * ssh2 的依赖 asn1 并不会嵌套在 ssh2 目录内。Node 解析 require('asn1')
 * 时会到 apps/main/node_modules/asn1 找，所以必须把所有被引用到的子包
 * 也映射一份到 node_modules 顶层。
 */

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const TM = path.join(ROOT, 'apps/main/node_modules')
const BUN = path.join(ROOT, 'node_modules/.bun')

module.exports = function beforeBuild() {
  const mapped = new Set()
  const seen = new Set()

  /**
   * 解析 .bun/ 下某个包的路径。
   * 注意 bun 把 scoped package 名里的 "/" URL-encode 成 "+"（如 @img/sharp-darwin-arm64 -> @img+sharp-darwin-arm64）。
   */
  /**
   * 解析 .bun/ 下某个包的路径，返回版本号最高的可用目录。
   * bun 把所有版本平铺在 .bun/ 顶层（如 jsonfile@4.0.0、jsonfile@6.2.1），
   * 同一个包多个版本时必须选最新的。
   */
  function findBunPkg(name) {
    const encodedName = name.replace(/\//g, '+')
    const prefix = `${encodedName}@`
    const entries = fs.readdirSync(BUN)
    let best = null
    for (const e of entries) {
      if (e === encodedName) {
        best = e
        continue
      }
      if (e.startsWith(prefix)) {
        const dir = path.join(BUN, e, 'node_modules', name)
        if (fs.existsSync(dir)) {
          const ver = e.slice(encodedName.length + 1) // 去掉 "jsonfile@" 前缀
          if (!best || ver.localeCompare(best.slice(encodedName.length + 1), undefined, { numeric: true }) > 0) {
            best = e
          }
        }
      }
    }
    if (best && best.startsWith(encodedName)) {
      const dir = path.join(BUN, best, 'node_modules', name)
      if (fs.existsSync(dir))
        return dir
    }
    return null
  }

  /** 把包映射到 node_modules/name，递归处理其依赖 */
  function mapPkg(pkgPath, knownName) {
    if (!pkgPath)
      return
    // 解析包名：如果是 scoped package（路径含 /node_modules/@scope/pkg），取 @scope/pkg
    let name = knownName || path.basename(pkgPath)
    const parts = pkgPath.split(path.sep)
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === 'node_modules' && i + 2 < parts.length && parts[i + 1].startsWith('@')) {
        name = `${parts[i + 1]}/${parts[i + 2]}`
        break
      }
    }
    // seen 用路径去重（避免死循环），而非包名——同名包在不同位置（顶层 vs workspace 嵌套）
    // 是不同的运行时上下文，需要分别处理其 transitive deps
    const pkgKey = path.resolve(pkgPath)
    if (seen.has(pkgKey))
      return
    seen.add(pkgKey)

    const target = path.join(TM, name)
    if (!fs.existsSync(target)) {
      fs.cpSync(pkgPath, target, { recursive: true, force: true, dereference: true })
      mapped.add(name)
    }
    else if (fs.lstatSync(target).isSymbolicLink()) {
      fs.rmSync(target, { force: true })
      fs.cpSync(pkgPath, target, { recursive: true, force: true, dereference: true })
      mapped.add(name)
    }

    // 处理 scope 目录下的子包（如 @browser/database、@wmfx/database）。
    // scope 根目录（@browser/package.json）是 workspace manifest，不是可运行时 require 的包，
    // 真正需要处理的是 scope 目录下的每个子目录包。
    if (name.startsWith('@') && !name.includes('/')) {
      try {
        for (const sub of fs.readdirSync(pkgPath)) {
          const subP = path.join(pkgPath, sub)
          if (fs.statSync(subP).isDirectory())
            mapPkg(subP, `${name}/${sub}`)
        }
      }
      catch {}
      return
    }

    // 读 package.json 的 dependencies，递归映射 transitive deps
    // （即使 target 已存在也要处理，否则 nested deps 缺失导致运行时 ENOENT）
    const pkgJsonPath = path.join(pkgPath, 'package.json')
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
        const deps = { ...pkg.dependencies, ...pkg.optionalDependencies }
        for (const dep of Object.keys(deps)) {
          if (dep.startsWith('workspace:') || dep.startsWith('file:') || dep.startsWith('.'))
            continue
          // 先查该包自身是否已嵌套在 node_modules 中（workspace 包的内部依赖）
          const nestedDep = path.join(pkgPath, 'node_modules', dep)
          if (fs.existsSync(nestedDep)) {
            // workspace 包内部的嵌套依赖：递归处理（映射它自己的 transitive deps）
            mapPkg(nestedDep, dep)
            continue
          }
          // 非嵌套：查 .bun 顶层映射
          const depPath = findBunPkg(dep)
          if (depPath)
            mapPkg(depPath, dep)
        }
      }
      catch {}
    }
  }

  // 1. 处理 apps/main/node_modules 顶层包：symlink 先替换成真实目录，然后统一映射 transitive 依赖
  const topEntries = fs.readdirSync(TM)
  for (const entry of topEntries) {
    const p = path.join(TM, entry)
    const st = fs.lstatSync(p)
    let pkgPath = null
    if (st.isSymbolicLink()) {
      const target = fs.readlinkSync(p)
      const resolved = path.resolve(TM, target)
      if (fs.existsSync(resolved) && fs.lstatSync(resolved).isDirectory()) {
        fs.rmSync(p, { force: true })
        fs.cpSync(resolved, p, { recursive: true, force: true, dereference: true })
        pkgPath = resolved
      }
    }
    else if (st.isDirectory()) {
      pkgPath = p
    }
    if (pkgPath) {
      // entry 已经是正确的包名（含 scope，如 @wmfx/database），传给 mapPkg 用于去重和定位
      mapPkg(pkgPath, entry)
    }
  }

  // 2. 处理根 node_modules 里也是真实目录但 electron-builder 会打包的包
  // （如 @iconify/utils — 如果它被 index.cjs runtime require 到）
  // 不做额外处理，根 node_modules 真实目录 electron-builder 自然打包

  console.log(`[prep-build] mapped ${mapped.size} package(s) including transitive deps`)
}
