import { gate } from '@confidential-loans/core/demo-ledger'
import type { Action, Shown, Snapshot, TxRecord } from '@confidential-loans/core/demo-ledger'

/**
 * Where loan B stands. `overdue`, `impaired` and `defaulted` are the canvas stages 0, 1 and 2; the
 * others are ledger states the canvas does not draw.
 */
export type Stage =
  | 'missing'
  | 'notDue'
  | 'overdue'
  | 'impaired'
  | 'graceOver'
  | 'defaulted'
  | 'repaid'

/** One point on the five-point loan B timeline. */
export interface TimelinePoint {
  readonly label: string
  readonly note: string
  /** Draws the bar in ink, or in `--loss` when `loss` is set. */
  readonly done: boolean
  readonly loss: boolean
}

export interface ImpairDefaultCta {
  readonly action: Action
  readonly label: string
}

export interface ImpairDefaultModel {
  readonly stage: Stage
  /** Loan B's amount owed; undefined until loan B exists. */
  readonly amountOwed: Shown | undefined
  /** The sum of successful payments on loan B. */
  readonly repaid: Shown
  /** The `role="status"` line next to the "Loan B" heading. */
  readonly status: { readonly text: string; readonly tone: 'mute' | 'loss' }
  readonly timeline: readonly TimelinePoint[]
  readonly impair: ImpairDefaultCta
  readonly default: ImpairDefaultCta
  /** The "Default result" Shortfall: loan B's amount owed. Defined only once loan B defaulted. */
  readonly shortfall: Shown | undefined
}

const IMPAIR: Action = Object.freeze({ type: 'LoanManage', loan: 'B', flag: 'impair' })
const DEFAULT: Action = Object.freeze({ type: 'LoanManage', loan: 'B', flag: 'default' })
const NO_PAYMENT: Shown = Object.freeze({ visibility: 'decrypted', value: 0n })

const STATUS: Readonly<Record<Stage, string>> = {
  missing: 'Not created yet',
  notDue: 'Active, payment not yet due',
  overdue: 'Overdue',
  impaired: 'Impaired, grace period running',
  graceOver: 'Impaired, grace period over',
  defaulted: 'Defaulted',
  repaid: 'Repaid',
}

function stageOf(s: Snapshot): Stage {
  const loan = s.loans.B
  if (loan === undefined) return 'missing'
  switch (loan.status) {
    case 'repaid':
      return 'repaid'
    case 'defaulted':
      return 'defaulted'
    case 'impaired':
      return gate(s, DEFAULT).open ? 'graceOver' : 'impaired'
    case 'active':
      return gate(s, IMPAIR).open ? 'overdue' : 'notDue'
  }
}

function wasImpaired(s: Snapshot): boolean {
  return s.log.some(
    (r) =>
      r.type === 'LoanManage' &&
      r.loan === 'B' &&
      r.flag === 'Impaired' &&
      r.result === 'tesSUCCESS',
  )
}

function point(label: string, note: string, done: boolean, loss = false): TimelinePoint {
  return { label, note, done, loss }
}

function paymentNote(stage: Stage): string {
  if (stage === 'repaid') return 'Paid'
  return stage === 'missing' || stage === 'notDue' ? 'Not yet due' : 'Missed'
}

function impairedPoint(stage: Stage, impaired: boolean): TimelinePoint {
  switch (stage) {
    case 'missing':
    case 'notDue':
      return point('Impaired', 'After the due date', false)
    case 'overdue':
      return point('Impaired', 'Available now', false)
    case 'impaired':
    case 'graceOver':
      return point('Impaired', 'Marked late', true)
    case 'defaulted':
      return impaired ? point('Impaired', 'Marked late', true) : point('Impaired', 'Skipped', false)
    case 'repaid':
      return point('Impaired', 'Not needed', false)
  }
}

function timeline(stage: Stage, impaired: boolean): TimelinePoint[] {
  const exists = stage !== 'missing'
  const missed = stage !== 'missing' && stage !== 'notDue' && stage !== 'repaid'
  const graceOver = stage === 'graceOver' || stage === 'defaulted'
  const defaulted = stage === 'defaulted'
  return [
    point('Started', exists ? 'Loan B active' : 'Not started', exists),
    point('Payment due', paymentNote(stage), missed || stage === 'repaid'),
    impairedPoint(stage, impaired),
    point('Grace ends', graceOver ? 'Passed' : 'After the due date', graceOver),
    point('Defaulted', defaulted ? 'Shortfall to depositors' : 'After grace ends', defaulted, true),
  ]
}

function isPayment(r: TxRecord): boolean {
  return r.type === 'ConfidentialLoanPay' && r.loan === 'B' && r.result === 'tesSUCCESS'
}

/** Sums loan B's payments; one amount this viewer cannot read hides the total. */
function repaidSoFar(log: readonly TxRecord[]): Shown {
  const amounts = log.filter(isPayment).map((r): Shown => r.amount ?? { visibility: 'redacted' })
  if (amounts.length === 0) return NO_PAYMENT
  let total = 0n
  let pending = false
  for (const amount of amounts) {
    if (amount.visibility === 'redacted') return amount
    if (amount.visibility === 'pending') pending = true
    else total += amount.value
  }
  if (pending) return { visibility: 'pending' }
  const visibility = amounts.every((a) => a.visibility === 'public') ? 'public' : 'decrypted'
  return { visibility, value: total }
}

/**
 * Derives the screen 8 board from a snapshot: the broker impairs loan B once its payment is
 * missed, then defaults it after the grace period. Every state comes from the ledger; the CTAs
 * gate themselves with core `gate()`.
 *
 * @param s - The `brokerA` snapshot, so loan B's amounts decrypt.
 * @returns What the board shows.
 */
export function impairDefault(s: Snapshot): ImpairDefaultModel {
  const stage = stageOf(s)
  const loan = s.loans.B
  return {
    stage,
    amountOwed: loan?.amountOwed,
    repaid: repaidSoFar(s.log),
    status: { text: STATUS[stage], tone: stage === 'defaulted' ? 'loss' : 'mute' },
    timeline: timeline(stage, wasImpaired(s)),
    impair: { action: IMPAIR, label: 'Impair loan B' },
    default: { action: DEFAULT, label: stage === 'defaulted' ? 'Defaulted' : 'Default loan B' },
    shortfall: stage === 'defaulted' ? loan?.amountOwed : undefined,
  }
}
