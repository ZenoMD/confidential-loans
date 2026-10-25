import { parseDeployment, serializeDeployment } from '@confidential-loans/core/kit'
import type { Deployment } from '@confidential-loans/core/kit'
import { NETWORK_WSS } from '@confidential-loans/core/network'

/** One deployment per network, so pointing the app at another devnet starts fresh. */
export const STORAGE_KEY = `confidential-loans:deployment:${NETWORK_WSS}`

/**
 * Reads the deployment this browser saved.
 *
 * @param storage - `localStorage`, or undefined when the browser blocks it.
 * @returns The deployment, or undefined when none is saved, storage fails, or the saved text is
 *   not a deployment.
 */
export function loadDeployment(storage: Storage | undefined): Deployment | undefined {
  try {
    const text = storage?.getItem(STORAGE_KEY)
    return text === null || text === undefined ? undefined : parseDeployment(text)
  } catch (error) {
    console.warn('Ignoring the saved deployment', error)
    return undefined
  }
}

/** Erases the saved deployment; blocked storage has none to erase. */
export function clearDeployment(storage: Storage | undefined): void {
  try {
    storage?.removeItem(STORAGE_KEY)
  } catch {
    // Nothing was saved.
  }
}

/**
 * Saves the deployment for the next visit.
 *
 * @returns False when storage is blocked or full: the deployment lasts only until a reload.
 */
export function saveDeployment(storage: Storage | undefined, deployment: Deployment): boolean {
  try {
    if (storage === undefined) return false
    storage.setItem(STORAGE_KEY, serializeDeployment(deployment))
    return true
  } catch {
    return false
  }
}
