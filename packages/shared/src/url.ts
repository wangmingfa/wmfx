export interface AddressBarResult {
  type: 'url' | 'search'
  value: string
}

const DOMAIN_LIKE = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i

export function normalizeAddressBarInput(input: string): AddressBarResult {
  const trimmed = input.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    return { type: 'url', value: trimmed }
  }
  if (!trimmed.includes(' ') && DOMAIN_LIKE.test(trimmed)) {
    return { type: 'url', value: `https://${trimmed}` }
  }
  return { type: 'search', value: trimmed }
}
