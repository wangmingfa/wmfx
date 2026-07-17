import type { NativeMenuItemDescriptor } from '@browser/ipc-contract'
import { type BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import type { NativeIconManager } from './native-icon-manager'

export class NativeMenuManager {
  private currentMenu: Menu | null = null

  constructor(
    private win: BrowserWindow,
    private iconManager: NativeIconManager
  ) {}

  async open(
    menuId: string,
    items: NativeMenuItemDescriptor[],
    position?: { x: number; y: number }
  ): Promise<void> {
    console.info('[NativeMenuManager] open: menuId itemCount', menuId, items.length)

    if (this.currentMenu) {
      this.currentMenu = null
    }

    const template = await this.buildTemplate(items, menuId)
    this.currentMenu = Menu.buildFromTemplate(template)

    this.currentMenu.on('menu-will-close', () => {
      console.debug('[NativeMenuManager] menu-will-close: menuId', menuId)
      this.win.webContents.send('native-menu:closed', menuId)
      this.currentMenu = null
    })

    const [winX, winY] = this.win.getPosition()

    this.currentMenu.popup({
      window: this.win,
      x: position ? winX + position.x : undefined,
      y: position ? winY + position.y : undefined,
    })
  }

  close(_menuId: string): void {
    if (this.currentMenu) {
      this.currentMenu.closePopup()
      this.currentMenu = null
    }
  }

  private async buildTemplate(
    items: NativeMenuItemDescriptor[],
    menuId: string
  ): Promise<MenuItemConstructorOptions[]> {
    const results: MenuItemConstructorOptions[] = []

    for (const item of items) {
      if (item.type === 'separator') {
        results.push({ type: 'separator' })
        continue
      }

      const electronType = item.type === 'item' || !item.type ? 'normal' : item.type
      const templateItem: MenuItemConstructorOptions = {
        id: item.id,
        label: item.label,
        type: electronType,
        enabled: item.enabled ?? true,
      }

      if (item.type === 'checkbox' || item.type === 'radio') {
        templateItem.checked = item.checked ?? false
      }

      if (item.icon) {
        const image = await this.iconManager.get(item.icon)
        if (image) templateItem.icon = image
      }

      if (item.type !== 'submenu') {
        templateItem.click = () => {
          console.debug('[NativeMenuManager] click: menuId itemId', menuId, item.id)
          this.win.webContents.send('native-menu:action', { menuId, itemId: item.id })
        }
      }

      if (item.children) {
        templateItem.submenu = await this.buildTemplate(item.children, menuId)
      }

      results.push(templateItem)
    }

    return results
  }
}
