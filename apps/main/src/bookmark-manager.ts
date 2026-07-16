import type { BookmarkRepository } from '@wmfx/database'

export interface BookmarkCreateOptions {
  title: string
  url: string | null
  favicon?: string | null
  parentId?: string | null
}

export interface BookmarkItemDto {
  id: string
  parentId: string | null
  title: string
  url: string | null
  favicon: string | null
  position: number
  createdAt: number
}

const toDto = (b: {
  id: string
  parent_id: string | null
  title: string
  url: string | null
  favicon: string | null
  position: number
  created_at: number
}): BookmarkItemDto => ({
  id: b.id,
  parentId: b.parent_id,
  title: b.title,
  url: b.url,
  favicon: b.favicon,
  position: b.position,
  createdAt: b.created_at,
})

export class BookmarkManager {
  constructor(private repo: BookmarkRepository) {}

  create(opts: BookmarkCreateOptions): { id: string } {
    const parentId = opts.parentId ?? null
    const siblings = this.repo.getList(parentId)
    const maxPos = siblings.reduce((max, b) => Math.max(max, b.position), -1)
    const id = this.repo.create({
      title: opts.title,
      url: opts.url,
      favicon: opts.favicon ?? null,
      parent_id: parentId,
      position: maxPos + 1,
    })
    console.debug(
      `[BookmarkManager] create: title=${opts.title}, url=${opts.url}, parentId=${parentId}, id=${id}`
    )
    return { id }
  }

  delete(id: string): boolean {
    console.debug(`[BookmarkManager] delete: id=${id}`)
    return this.repo.delete(id)
  }

  rename(id: string, title: string): void {
    console.debug(`[BookmarkManager] rename: id=${id}, title=${title}`)
    this.repo.update(id, { title })
  }

  getList(parentId?: string | null): BookmarkItemDto[] {
    return this.repo.getList(parentId).map(toDto)
  }

  search(query: string): BookmarkItemDto[] {
    return this.repo.search(query).map(toDto)
  }

  isBookmarked(url: string): { isBookmarked: boolean; id: string | null } {
    const items = this.repo.search(url)
    if (items.length > 0) {
      return { isBookmarked: true, id: items[0].id }
    }
    return { isBookmarked: false, id: null }
  }

  importHTML(html: string): void {
    const links = this.parseBookmarksHTML(html)
    console.debug(`[BookmarkManager] importHTML: parsed ${links.length} links`)
    for (const link of links) {
      this.repo.create({
        title: link.title,
        url: link.url ?? null,
        favicon: null,
        parent_id: null,
        position: 0,
      })
    }
  }

  exportHTML(): { html: string } {
    const items = this.repo.getList(null)
    console.debug(`[BookmarkManager] exportHTML: exporting ${items.length} items`)
    const html = this.buildBookmarksHTML(items)
    return { html }
  }

  private parseBookmarksHTML(html: string): Array<{ title: string; url: string | null }> {
    const links: Array<{ title: string; url: string | null }> = []
    const urlRegex = /<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi
    const matches = [...html.matchAll(urlRegex)]

    for (const match of matches) {
      const url = match[1]
      const title = match[2].trim()
      if (title && url.startsWith('http')) {
        links.push({ title, url })
      }
    }
    return links
  }

  private buildBookmarksHTML(
    items: {
      url: string | null
      title: string
    }[]
  ): string {
    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<title>Bookmarks</title>
<h1>Bookmarks</h1>
<dl><p>\n`
    for (const item of items) {
      html += `<dt><a href="${item.url ?? ''}">${item.title}</a></dt>\n`
    }
    html += `</dl><p>\n`
    return html
  }
}
