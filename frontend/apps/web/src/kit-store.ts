import { parseKit } from '@confidential-loans/core/kit'
import type { Kit } from '@confidential-loans/core/kit'

/** The `sessionStorage` key that holds the pasted kit text. */
export const KIT_KEY = 'confidential-loans.kit'

export type KitStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** The kit in this tab, if any. */
export type StoredKit =
  | { readonly status: 'missing' }
  | { readonly status: 'ready'; readonly kit: Kit }
  /** The stored text does not parse, or the browser refuses storage. */
  | { readonly status: 'invalid'; readonly error: string }

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Reads the kit stored in this tab.
 *
 * @param storage - Returns `sessionStorage`; a getter because the browser may refuse access.
 * @returns The kit, or why there is none.
 */
export function readKit(storage: () => KitStorage): StoredKit {
  let text: string | null
  try {
    text = storage().getItem(KIT_KEY)
  } catch (error) {
    return { status: 'invalid', error: `Could not read session storage: ${describe(error)}` }
  }
  if (text === null) return { status: 'missing' }
  try {
    return { status: 'ready', kit: parseKit(text) }
  } catch (error) {
    return { status: 'invalid', error: describe(error) }
  }
}

/**
 * Validates pasted kit text with `parseKit` and stores it for this tab.
 *
 * @param storage - Returns `sessionStorage`.
 * @param text - The JSON that `scripts/export-kit.ts` prints.
 * @returns The stored kit.
 * @throws {Error} From `parseKit` or the storage, leaving any stored kit in place.
 */
export function saveKit(storage: () => KitStorage, text: string): StoredKit {
  const kit = parseKit(text)
  storage().setItem(KIT_KEY, text)
  return { status: 'ready', kit }
}

/** Removes the stored kit. */
export function forgetKit(storage: () => KitStorage): StoredKit {
  storage().removeItem(KIT_KEY)
  return { status: 'missing' }
}
