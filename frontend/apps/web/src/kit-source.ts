import { parseKit } from '@confidential-loans/core/kit'
import type { Kit } from '@confidential-loans/core/kit'

/** Where the dev and preview servers serve the kit, built from the gitignored `scripts/.env`. */
export const KIT_URL = '/demo-kit'

/**
 * Loads the demo kit from the local server.
 *
 * @param fetchKitText - Fetches `KIT_URL`; `window.fetch` in the app.
 * @returns The parsed kit.
 * @throws {Error} With the server's message when it cannot build the kit, or what `parseKit`
 *   throws when the text is not a kit.
 */
export async function loadKit(fetchKitText: (url: string) => Promise<Response>): Promise<Kit> {
  const response = await fetchKitText(KIT_URL)
  const text = await response.text()
  if (!response.ok) throw new Error(text.trim() || `${KIT_URL} answered ${response.status}`)
  return parseKit(text)
}
