import { ActionFailed } from '@confidential-loans/core/demo-ledger'
import type { Action } from '@confidential-loans/core/demo-ledger'
import { txLink } from '@confidential-loans/core/network'

/** A transaction the ledger validated, as a toast shows it. */
export interface Toast {
  /** True for `tesSUCCESS`; false for a failure the ledger recorded. */
  readonly ok: boolean
  readonly title: string
  /** The engine result. */
  readonly detail: string
  readonly hash: string
  readonly href: string
}

/** The transaction an action submits; the offer sign and withdraw submit none. */
export function transactionType(action: Action): string | undefined {
  switch (action.type) {
    case 'LoanSetSign':
    case 'LoanSetWithdraw':
      return undefined
    case 'LoanSetCosign':
      return 'LoanSet'
    default:
      return action.type
  }
}

/** Shortens a hash to its first and last 6 digits. */
export function shortHash(hash: string): string {
  return hash.length <= 14 ? hash : `${hash.slice(0, 6)}...${hash.slice(-6)}`
}

function toast(ok: boolean, type: string, detail: string, hash: string): Toast {
  const title = `${type} ${ok ? 'validated' : 'failed'}`
  return { ok, title, detail, hash: shortHash(hash), href: txLink(hash) }
}

/**
 * The toast for an action `act` resolved, or undefined when nothing was submitted.
 *
 * @param action - The action that ran.
 * @param hash - What `act` resolved with.
 */
export function successToast(action: Action, hash: string | undefined): Toast | undefined {
  const type = transactionType(action)
  if (type === undefined || hash === undefined) return undefined
  return toast(true, type, 'tesSUCCESS', hash)
}

/**
 * The toast for an action `act` rejected, when a ledger holds the failed transaction. Failures
 * decided before submitting, or never validated, have no transaction to link.
 *
 * @param action - The action that ran.
 * @param error - What `act` rejected with.
 */
export function failureToast(action: Action, error: unknown): Toast | undefined {
  const type = transactionType(action)
  if (type === undefined || !(error instanceof ActionFailed) || error.hash === undefined) {
    return undefined
  }
  if (error.code === 'unconfirmed') return undefined
  return toast(false, type, error.code, error.hash)
}
