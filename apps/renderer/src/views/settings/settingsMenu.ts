import type { SideMenuItem } from '@/components/side-menu'

/** 设置页左侧悬浮菜单配置（复用 PageLayout 的 sideMenu 能力，替代原 SettingsLayout 的内联 nav） */
export const settingsSideMenu: SideMenuItem[] = [
  {
    key: 'appearance',
    labelKey: 'settings.navAppearance',
    icon: 'mdi:palette',
    to: '/settings/appearance',
  },
  { key: 'general', labelKey: 'settings.navGeneral', icon: 'mdi:cog', to: '/settings/general' },
  {
    key: 'downloads',
    labelKey: 'settings.navDownloads',
    icon: 'mdi:download',
    to: '/settings/downloads',
  },
  {
    key: 'privacy',
    labelKey: 'settings.navPrivacy',
    icon: 'mdi:shield',
    to: '/settings/privacy',
  },
  { key: 'about', labelKey: 'settings.navAbout', icon: 'mdi:information', to: '/settings/about' },
]
