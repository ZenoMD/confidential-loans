/** One tab per actor. */
export type Tab = 'depositor' | 'broker' | 'borrower'

export const TABS: readonly Tab[] = ['depositor', 'broker', 'borrower']

/** A tab, or the spec scrolled to one of its headings (or to its top). */
export type Route =
  | { readonly page: 'tab'; readonly tab: Tab }
  | { readonly page: 'spec'; readonly section: string | undefined }

const TAB_HASH = /^#\/(depositor|broker|borrower)$/
const SPEC_HASH = /^#\/spec(?:\/([\p{L}\p{N}_-]+))?$/u

/** Reads the route from `location.hash`. Any hash that names no page opens the depositor's tab. */
export function parseRoute(hash: string): Route {
  const spec = SPEC_HASH.exec(hash)
  if (spec !== null) return { page: 'spec', section: spec[1] }
  const match = TAB_HASH.exec(hash)
  return { page: 'tab', tab: match === null ? 'depositor' : (match[1] as Tab) }
}

export function tabHref(tab: Tab): string {
  return `#/${tab}`
}

/** The spec, at the heading with this anchor if one is given. */
export function specHref(section?: string): string {
  return section === undefined ? '#/spec' : `#/spec/${section}`
}
