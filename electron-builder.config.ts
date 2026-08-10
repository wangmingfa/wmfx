import type { Configuration } from 'electron-builder'

const config: Configuration = {
  appId: 'com.wmfx.browser',
  productName: 'WMFX',
  directories: {
    output: 'dist-pack',
  },

  beforeBuild: './scripts/prep-build.cjs',

  files: [
    'apps/main/dist/**/*',
    'apps/renderer/dist/**/*',
    'apps/main/node_modules/**/*',
    'node_modules/better-sqlite3/**/*',
    'node_modules/@better-sqlite3/**/*',
  ],

  // 原生 .node addon + 其依赖的 .dylib/.so 必须以真实目录存在，否则 dlopen 找不到共享库。
  asarUnpack: [
    '**/*.node',
    '**/*.dylib',
    'apps/main/node_modules/@img/**/*',
    'apps/main/node_modules/sharp/**/*',
  ],

  extraResources: [
    {
      from: 'mihomo/',
      to: 'mihomo/',
      filter: ['**/*'],
    },
    {
      from: 'resources/',
      to: 'resources/',
      filter: ['**/*'],
    },
    // renderer dist 必须以真实文件存在（loadFile 走本地 filesystem，无法读取 asar 内部）。
    {
      from: 'apps/renderer/dist/',
      to: 'apps/renderer/dist/',
      filter: ['**/*'],
    },
    // preload.cjs 也必须真实文件：webPreferences.preload 是文件系统路径，无法从 asar 加载。
    {
      from: 'apps/main/dist/preload.cjs',
      to: 'apps/main/dist/preload.cjs',
    },
  ],

  linux: {
    target: ['AppImage', 'deb'],
    icon: 'resources/icons/linux',
    category: 'Network',
  },

  mac: {
    target: ['dmg'],
    icon: 'resources/icons/macos/icon.png',
    category: 'public.app-category.browsers',
  },

  win: {
    target: ['nsis'],
    icon: 'resources/icons/windows/icon.ico',
    artifactName: '${productName}-Setup-${version}.${ext}',
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },

  // 声明应用接管 http/https 协议，使「设为默认浏览器」在系统层面生效
  // （macOS 写入 Info.plist CFBundleURLTypes，Windows 写入注册表）
  protocols: {
    name: 'WMFX',
    schemes: ['http', 'https'],
  },

  publish: [
    {
      provider: 'github',
      releaseType: 'draft',
      owner: 'wangmingfa',
      repo: 'wmfx',
    },
  ],
}

export default config
