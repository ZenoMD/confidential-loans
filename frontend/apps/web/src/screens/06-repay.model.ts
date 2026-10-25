import type { Shown } from '@confidential-loans/core/amount'
import type { Action, Snapshot, TransactionType } from '@confidential-loans/core/demo-ledger'

/**
 * Where loan A's repayment stands. `merged` is the pause between the two transactions, which the
 * canvas never shows because one click runs both.
 */
export type RepayStage = 'ready' | 'merging' | 'merged' | 'paying' | 'repaid'

export interface RepayValue {
  readonly label: string
  readonly shown: Shown
}

export interface RepayStep {
  readonly label: string
  readonly note: string
  readonly state: 'done' | 'current' | 'todo'
}

export interface RepayModel {
  readonly stage: RepayStage
  /** Spending and Inbox, then Amount owed and Payment once loan A exists. */
  readonly values: readonly RepayValue[]
  readonly steps: readonly [RepayStep, RepayStep]
  /** The transaction the one CTA submits now, and the canvas label for the stage. */
  readonly cta: { readonly action: Action; readonly label: string }
}

const MERGE: Action = Object.freeze({ type: 'ConfidentialMPTMergeInbox', borrower: 'borrowerA' })
const PAY: Action = Object.freeze({ type: 'ConfidentialLoanPay', loan: 'A' })

const CTA_LABEL: Readonly<Record<RepayStage, string>> = {
  ready: 'Repay loan A',
  merging: 'Merging the inbox',
  merged: 'Repay loan A',
  paying: 'Paying loan A',
  repaid: 'Repaid',
}

const BARS: Readonly<Record<RepayStage, readonly [RepayStep['state'], RepayStep['state']]>> = {
  ready: ['todo', 'todo'],
  merging: ['current', 'todo'],
  merged: ['done', 'todo'],
  paying: ['done', 'current'],
  repaid: ['done', 'done'],
}

function lastSuccess(s: Snapshot, type: TransactionType): number {
  return s.log.findLastIndex((r) => r.type === type && r.loan === 'A' && r.result === 'tesSUCCESS')
}

/** Borrower A's inbox is merged once a successful merge follows loan A's LoanSet in the log. */
function stageOf(s: Snapshot): RepayStage {
  if (s.loans.A?.status === 'repaid') return 'repaid'
  if (s.submitting?.type === 'ConfidentialLoanPay' && s.submitting.loan === 'A') return 'paying'
  const merging = s.submitting?.type === 'ConfidentialMPTMergeInbox'
  if (merging && s.submitting.borrower === 'borrowerA') return 'merging'
  const loanSet = lastSuccess(s, 'LoanSet')
  const merged = loanSet !== -1 && lastSuccess(s, 'ConfidentialMPTMergeInbox') > loanSet
  return merged ? 'merged' : 'ready'
}

function valuesOf(s: Snapshot): RepayValue[] {
  const { spending, inbox } = s.borrowers.borrowerA
  const values: RepayValue[] = [
    { label: 'Spending', shown: spending },
    { label: 'Inbox', shown: inbox },
  ]
  const loan = s.loans.A
  if (loan === undefined) return values
  const paid = s.log[lastSuccess(s, 'ConfidentialLoanPay')]?.amount
  values.push(
    { label: 'Amount owed', shown: loan.amountOwed },
    { label: 'Payment', shown: paid ?? loan.amountOwed },
  )
  return values
}

/**
 * Screen 6: Borrower A merges the inbox, then pays loan A in full. The stage comes from the log and
 * the action in flight, so a reload resumes where the ledger is.
 *
 * @param s - Borrower A's snapshot: only Borrower A's key decrypts these amounts.
 * @returns The values, the two progress steps and what the CTA submits.
 * @throws {Error} When the snapshot is not Borrower A's.
 */
export function repayModel(s: Snapshot): RepayModel {
  if (s.viewer !== 'borrowerA') {
    throw new Error(`Screen 6 renders the borrowerA snapshot, got ${s.viewer}`)
  }
  const stage = stageOf(s)
  const [merge, pay] = BARS[stage]
  const paying = stage === 'merged' || stage === 'paying' || stage === 'repaid'
  return {
    stage,
    values: valuesOf(s),
    steps: [
      { label: 'Merge the inbox', note: 'Inbox into spending', state: merge },
      { label: 'Pay the amount owed', note: 'Full payment, exactly the amount owed.', state: pay },
    ],
    cta: { action: paying ? PAY : MERGE, label: CTA_LABEL[stage] },
  }
}
