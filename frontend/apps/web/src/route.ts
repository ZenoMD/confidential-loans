/** One tab per actor. */
export type Tab = 'depositor' | 'broker' | 'borrower'

export const TABS: readonly Tab[] = ['depositor', 'broker', 'borrower']

const TAB_HASH = /^#\/(depositor|broker|borrower)$/

/** Reads the tab from `location.hash`. Any hash that names no tab opens the depositor's. */
export function parseRoute(hash: string): Tab {
  const match = TAB_HASH.exec(hash)
  return match === null ? 'depositor' : (match[1] as Tab)
}

export function tabHref(tab: Tab): string {
  return `#/${tab}`
}
