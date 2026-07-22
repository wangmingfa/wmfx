/**
 * 标签页操作的统一图标配置。
 * TabBar / VerticalTabBar 右键菜单 & CommandPalette 共用，改一处全局生效。
 */
export const TAB_ACTION_ICONS = {
  newTab: 'mdi:plus',
  reload: 'mdi:refresh',
  duplicate: 'mdi:content-copy',
  pin: 'mdi:pin',
  muteOn: 'mdi:volume-high',
  muteOff: 'mdi:volume-off',
  close: 'mdi:close',
  closeOthers: 'mdi:close-box-multiple',
  closeLeft: 'mdi:arrow-left-bold-box-outline',
  closeRight: 'mdi:arrow-right-bold-box-outline',
  closeAbove: 'mdi:arrow-up-bold-box-outline',
  closeBelow: 'mdi:arrow-down-bold-box-outline',
  reopenClosed: 'mdi:history',
} as const
