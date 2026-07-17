import type { IconifyJSON } from '@iconify/types'
import { getIconData, iconToSVG } from '@iconify/utils'
import { nativeImage } from 'electron'

export class NativeIconManager {
  private cache = new Map<string, Electron.NativeImage>()
  private loadedSets = new Map<string, IconifyJSON>()

  async get(name: string): Promise<Electron.NativeImage | undefined> {
    const cached = this.cache.get(name)
    if (cached) return cached

    const colonIdx = name.indexOf(':')
    if (colonIdx === -1) {
      console.warn('[NativeIconManager] get: invalid icon name format', name)
      return undefined
    }

    const prefix = name.slice(0, colonIdx)
    const iconName = name.slice(colonIdx + 1)

    try {
      const iconSet = await this.loadIconSet(prefix)
      if (!iconSet) return undefined

      const iconData = getIconData(iconSet, iconName)
      if (!iconData) {
        console.warn('[NativeIconManager] get: icon not found', name)
        return undefined
      }

      const svgResult = iconToSVG(iconData)
      if (!svgResult) return undefined

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" ${svgResult.attributes}>${svgResult.body}</svg>`
      const buffer = Buffer.from(svg)
      const image = nativeImage.createFromBuffer(buffer)

      this.cache.set(name, image)
      console.debug('[NativeIconManager] get: converted & cached', name)
      return image
    } catch (err) {
      console.error('[NativeIconManager] get: conversion failed', name, err)
      return undefined
    }
  }

  async warmup(names: string[]): Promise<void> {
    for (const name of names) {
      await this.get(name)
    }
    console.info('[NativeIconManager] warmup: cached %d icons', this.cache.size)
  }

  private async loadIconSet(prefix: string): Promise<IconifyJSON | undefined> {
    if (this.loadedSets.has(prefix)) return this.loadedSets.get(prefix)

    try {
      const mod = await import(`@iconify-json/${prefix}`)
      const iconSet: IconifyJSON = (mod.icons ??
        mod.default?.icons ??
        mod.default ??
        mod) as IconifyJSON
      this.loadedSets.set(prefix, iconSet)
      return iconSet
    } catch {
      console.warn('[NativeIconManager] loadIconSet: package not installed', prefix)
      return undefined
    }
  }
}
