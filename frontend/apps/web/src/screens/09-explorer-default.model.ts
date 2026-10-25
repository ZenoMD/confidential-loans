import type { Shown } from '@confidential-loans/core/amount'
import type { Snapshot } from '@confidential-loans/core/demo-ledger'
import { stepHref } from '#web/route.ts'
import { explorerBoard } from './05-explorer-loans.model.ts'
import type { ExplorerModel, ExplorerViewer, Link } from './05-explorer-loans.model.ts'

export type TotalAmount =
  | { readonly kind: 'value'; readonly shown: Shown }
  | { readonly kind: 'none'; readonly text: 'No amount' }

export interface Total {
  readonly label: 'Loan A repaid' | 'Settled' | 'Loan B amount owed'
  readonly amount: TotalAmount
}

export interface ExplorerDefaultModel extends ExplorerModel {
  readonly action: 'Reads the ledger after the default'
  /** Loan A repaid, Settled, Loan B amount owed: the "Position after the default" row. */
  readonly totals: readonly [Total, Total, Total]
  readonly earlier: Link
  readonly next: Link
}

const NONE: TotalAmount = { kind: 'none', text: 'No amount' }

function amount(shown: Shown | undefined): TotalAmount {
  return shown === undefined ? NONE : { kind: 'value', shown }
}

function settled(s: Snapshot): Shown | undefined {
  let total: bigint | undefined
  for (const r of s.log) {
    if (r.type !== 'LoanBrokerSettle' || r.result !== 'tesSUCCESS') continue
    if (r.amount?.visibility !== 'public') continue
    total = (total ?? 0n) + r.amount.value
  }
  return total === undefined ? undefined : { visibility: 'public', value: total }
}

function totals(s: Snapshot | null): ExplorerDefaultModel['totals'] {
  const paid = s?.log.find(
    (r) => r.type === 'ConfidentialLoanPay' && r.loan === 'A' && r.result === 'tesSUCCESS',
  )
  return [
    { label: 'Loan A repaid', amount: amount(paid?.amount) },
    { label: 'Settled', amount: amount(s === null ? undefined : settled(s)) },
    { label: 'Loan B amount owed', amount: amount(s?.loans.B?.amountOwed) },
  ]
}

/**
 * Screen 9: the step 6 to 8 transactions and the position after loan B defaults, as the Outsider
 * or the Auditor reads them. Loan A's payment and loan B's amount owed are encrypted, so they are
 * redacted for the Outsider; the settle amount is public.
 *
 * @param view - The pressed toggle.
 * @param s - `useSnapshot(view)`: null while the first snapshot loads.
 */
export function explorerDefault(view: ExplorerViewer, s: Snapshot | null): ExplorerDefaultModel {
  return {
    ...explorerBoard(view, s, [6, 7, 8]),
    action: 'Reads the ledger after the default',
    totals: totals(s),
    earlier: { href: stepHref(5), label: 'Earlier transactions on step 5' },
    next: { href: stepHref(10), label: 'Continue to step 10' },
  }
}
