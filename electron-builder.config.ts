import type { Configuration } from 'electron-builder'

const config: Configuration = {
  appId: 'com.wmfx.browser',
  productName: 'WMFX',
  directories: {
    output: 'dist-pack',
  },

  files: [
    'apps/main/dist/**/*',
    'apps/renderer/dist/**/*',
    'node_modules/better-sqlite3/**/*',
    'node_modules/@better-sqlite3/**/*',
    'node_modules/electron-updater/**/*',
  ],

  extraResources: [
    {
      from: 'mihomo/',
      to: 'mihomo/',
      filter: ['**/*'],
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
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },

  publish: [
    {
      provider: 'github',
      releaseType: 'draft',
    },
  ],
}

export default config
