import type { Shown } from '@confidential-loans/core/amount'
import type { Signer, Snapshot, TxRecord, Viewer } from '@confidential-loans/core/demo-ledger'
import { screenHref } from '#web/route.ts'
import type { Step } from '#web/route.ts'

/** The two ways the explorers read the ledger. */
export type ExplorerViewer = Extract<Viewer, 'outsider' | 'auditor'>

/** The Amount cell: a Value, a LoanManage flag in the loss color, or a dim "No amount". */
export type ExplorerAmount =
  | { readonly kind: 'value'; readonly shown: Shown }
  | { readonly kind: 'flag'; readonly text: 'Impaired' | 'Defaulted' }
  | { readonly kind: 'none'; readonly text: 'No amount' }

export interface ExplorerRow {
  /** The transaction hash, unique per row. */
  readonly key: string
  readonly step: string
  readonly transaction: string
  readonly signedBy: string
  readonly amount: ExplorerAmount
  readonly hash: string
  /** The hash as the narrow Hash column prints it. */
  readonly hashText: string
  readonly href: string
}

export interface Link {
  readonly href: string
  readonly label: string
}

/** Loading before the first snapshot, a missing earlier step, or rows to show. */
export type ExplorerStatus =
  | { readonly kind: 'loading'; readonly text: 'Reading the ledger' }
  | { readonly kind: 'prerequisite'; readonly text: string; readonly href: string }
  | { readonly kind: 'ready' }

export interface ExplorerOption {
  readonly value: ExplorerViewer
  readonly label: 'Outsider' | 'Auditor'
}

export interface ExplorerToggle {
  readonly label: 'Read the ledger as'
  readonly options: readonly [ExplorerOption, ExplorerOption]
  readonly selected: ExplorerViewer
}

/** What screens 5 and 9 share: the role, the view toggle and the transaction table. */
export interface ExplorerModel {
  readonly who: 'Outsider' | 'Auditor'
  readonly toggle: ExplorerToggle
  readonly status: ExplorerStatus
  readonly rows: readonly ExplorerRow[]
  /** Snapshot problems, for a `role="alert"` line. */
  readonly errors: readonly string[]
}

export interface ExplorerLoansModel extends ExplorerModel {
  readonly action: 'Reads the ledger'
  readonly next: Link
}

const SIGNER_NAMES: Readonly<Record<Signer, string>> = {
  brokerA: 'Broker A',
  depositorA: 'Depositor A',
  depositorB: 'Depositor B',
  borrowerA: 'Borrower A',
  borrowerB: 'Borrower B',
}

const OPTIONS: ExplorerToggle['options'] = [
  { value: 'outsider', label: 'Outsider' },
  { value: 'auditor', label: 'Auditor' },
]

const LOADING: ExplorerStatus = { kind: 'loading', text: 'Reading the ledger' }

function transactionName(r: TxRecord): string {
  const perLoan = r.type === 'LoanSet' || r.type === 'LoanManage'
  return perLoan && r.loan !== undefined ? `${r.type}, loan ${r.loan}` : r.type
}

function amountCell(r: TxRecord): ExplorerAmount {
  if (r.amount !== undefined) return { kind: 'value', shown: r.amount }
  if (r.flag !== undefined) return { kind: 'flag', text: r.flag }
  return { kind: 'none', text: 'No amount' }
}

function row(r: TxRecord): ExplorerRow {
  return {
    key: r.hash,
    step: String(r.step),
    transaction: transactionName(r),
    signedBy: r.signers.map((s) => SIGNER_NAMES[s]).join(', '),
    amount: amountCell(r),
    hash: r.hash,
    hashText: `${r.hash.slice(0, 6)}…${r.hash.slice(-4)}`,
    href: r.explorerUrl,
  }
}

/**
 * Builds the shared explorer board for one view. Rows are the successful transactions of
 * `steps`, in ledger order; failed ones are left out, as the canvas lists none.
 *
 * @param view - The pressed toggle.
 * @param s - The snapshot for `view`, or null while the first one loads.
 * @param steps - The demo steps whose transactions the table lists; the first is the one to
 *   complete when none exist.
 * @returns The board without its screen-specific copy.
 * @throws {Error} When `s` was taken for another viewer.
 */
export function explorerBoard(
  view: ExplorerViewer,
  s: Snapshot | null,
  steps: readonly [Step, ...Step[]],
): ExplorerModel {
  if (s !== null && s.viewer !== view) {
    throw new Error(`The ${view} view got a ${s.viewer} snapshot: pass useSnapshot('${view}')`)
  }
  const base = {
    who: view === 'auditor' ? 'Auditor' : 'Outsider',
    toggle: { label: 'Read the ledger as', options: OPTIONS, selected: view },
  } as const
  if (s === null) return { ...base, status: LOADING, rows: [], errors: [] }
  const rows = s.log
    .filter((r) => r.result === 'tesSUCCESS' && (steps as readonly number[]).includes(r.step))
    .map(row)
  const first = steps[0]
  const status: ExplorerStatus =
    rows.length === 0
      ? { kind: 'prerequisite', text: `Complete step ${first} first`, href: screenHref(first) }
      : { kind: 'ready' }
  return { ...base, status, rows, errors: s.errors }
}

/**
 * Screen 5: the step 1 to 4 transactions as the Outsider or the Auditor reads them. Each
 * encrypted amount arrives redacted in the outsider snapshot and decrypted in the auditor one.
 *
 * @param view - The pressed toggle.
 * @param s - `useSnapshot(view)`: null while the first snapshot loads.
 */
export function explorerLoans(view: ExplorerViewer, s: Snapshot | null): ExplorerLoansModel {
  return {
    ...explorerBoard(view, s, [1, 2, 3, 4]),
    action: 'Reads the ledger',
    next: { href: screenHref(6), label: 'Continue to step 6' },
  }
}
