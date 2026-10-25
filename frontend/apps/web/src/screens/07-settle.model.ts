import type {
  Action,
  LoanLabel,
  Public,
  Shown,
  Snapshot,
  TransactionType,
} from '@confidential-loans/core/demo-ledger'

export interface StepItem {
  readonly label: string
  readonly note: string
  readonly state: 'done' | 'current' | 'todo'
}

export interface RepaymentRow {
  readonly label: string
  /** The successful step-6 payment, shown as "Paid in full"; undefined reads "No payment yet". */
  readonly paid: Shown | undefined
}

export interface Screen07 {
  readonly repayments: readonly RepaymentRow[]
  /** The Lending Balance spending; undefined until step 1 creates the broker. */
  readonly lendingBalance: Shown | undefined
  readonly vaultAvailable: Public
  /** The settle record's public amount; undefined until the settle succeeds. */
  readonly amountSettled: Shown | undefined
  readonly steps: readonly StepItem[]
  /** The next action; undefined once the settle succeeded, since the ledger cannot replay it. */
  readonly cta: { readonly action: Action; readonly label: string } | undefined
}

const STEPS: readonly { readonly label: string; readonly action: Action }[] = [
  { label: 'Merge the inbox', action: { type: 'LoanBrokerMergeInbox' } },
  { label: 'Settle to the vault', action: { type: 'LoanBrokerSettle' } },
]

const LOANS: readonly LoanLabel[] = ['A', 'B']

function succeededAt(s: Snapshot, step: 6 | 7, type: TransactionType, loan?: LoanLabel) {
  return s.log.findLast(
    (r) =>
      r.step === step &&
      r.type === type &&
      r.result === 'tesSUCCESS' &&
      (loan === undefined || r.loan === loan),
  )
}

/**
 * Screen 7, Broker A merges the inbox, then settles the whole Lending Balance to the vault. The
 * stage comes from the step-7 records: 0 before the merge, 1 after it, 2 after the settle. As on
 * the canvas, a bar fills once its step is done; there is no current style and no replay (K1).
 *
 * @param s - The snapshot seen by `brokerA`, the only viewer that decrypts the Lending Balance.
 * @returns Everything the board shows.
 * @throws {Error} When the snapshot belongs to another viewer.
 */
export function model07(s: Snapshot): Screen07 {
  if (s.viewer !== 'brokerA') {
    throw new Error(`Screen 7 renders the brokerA snapshot, got the ${s.viewer} snapshot`)
  }
  const settle = succeededAt(s, 7, 'LoanBrokerSettle')
  const merged = succeededAt(s, 7, 'LoanBrokerMergeInbox') !== undefined
  const stage = settle !== undefined ? 2 : merged ? 1 : 0
  const next = STEPS[stage]
  return {
    repayments: LOANS.map((loan) => ({
      label: `Loan ${loan}, Borrower ${loan}`,
      paid: succeededAt(s, 6, 'ConfidentialLoanPay', loan)?.amount,
    })),
    lendingBalance: s.broker?.lendingBalance.spending,
    vaultAvailable: s.vault.assetsAvailable,
    amountSettled: settle?.amount,
    steps: STEPS.map(({ label, action }, i) => ({
      label,
      note: action.type,
      state: stage > i ? 'done' : 'todo',
    })),
    cta: next === undefined ? undefined : { action: next.action, label: next.label },
  }
}
