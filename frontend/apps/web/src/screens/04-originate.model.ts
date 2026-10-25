import { DEMO_TERMS } from '@confidential-loans/core/demo-ledger'
import type {
  Action,
  LoanLabel,
  LoanTerms,
  Shown,
  Snapshot,
  Viewer,
} from '@confidential-loans/core/demo-ledger'
import { screenHref } from '#web/route.ts'

/** Broker A holds the key every loan amount is encrypted to, so screen 4 reads through it. */
export const ORIGINATE_VIEWER: Viewer = 'brokerA'

/** One bar of the Signatures progress row, as `<Steps>` takes it. */
export interface SignatureStep {
  readonly label: string
  readonly note: string
  readonly state: 'done' | 'current' | 'todo'
}

/** The role column, which shows before the ledger is read. */
export interface OriginateAside {
  readonly role: { readonly who: string; readonly action: string }
  readonly toggle: {
    readonly label: string
    readonly options: readonly [
      { readonly value: 'A'; readonly label: string },
      { readonly value: 'B'; readonly label: string },
    ]
    readonly selected: LoanLabel
  }
}

export interface OriginateModel {
  /** Principal, Periodic payment and Amount owed. */
  readonly values: readonly { readonly label: string; readonly shown: Shown }[]
  /** Payment interval, Payments and Grace period, read-only. */
  readonly schedule: readonly { readonly label: string; readonly value: string }[]
  readonly steps: readonly [SignatureStep, SignatureStep, SignatureStep]
  /** What the one CTA submits; `gate()` decides whether it can. */
  readonly cta: { readonly action: Action; readonly label: string }
  readonly next: { readonly href: string; readonly label: string }
}

/** 0: nothing signed. 1: the Broker's offer is held. 2: the LoanSet is on the ledger. */
type Stage = 0 | 1 | 2

function stageOf(s: Snapshot, loan: LoanLabel): Stage {
  if (s.loans[loan] !== undefined) return 2
  return s.offers[loan] === undefined ? 0 : 1
}

function decrypted(value: bigint): Shown {
  return { visibility: 'decrypted', value }
}

function values(s: Snapshot, loan: LoanLabel, terms: LoanTerms): OriginateModel['values'] {
  const view = s.loans[loan]
  return [
    { label: 'Principal', shown: view?.principal ?? decrypted(terms.principal) },
    { label: 'Periodic payment', shown: view?.periodicPayment ?? decrypted(terms.periodicPayment) },
    { label: 'Amount owed', shown: view?.amountOwed ?? decrypted(terms.amountOwed) },
  ]
}

function bar(stage: Stage, i: Stage): SignatureStep['state'] {
  if (stage > i) return 'done'
  return stage === i ? 'current' : 'todo'
}

function steps(stage: Stage, borrower: string): OriginateModel['steps'] {
  const cosigned = stage === 1 ? 'Signing now' : 'Waiting'
  return [
    { label: 'Broker signs', note: stage > 0 ? 'Signed' : 'Waiting', state: bar(stage, 0) },
    {
      label: `${borrower} co-signs`,
      note: stage > 1 ? 'Co-signed' : cosigned,
      state: bar(stage, 1),
    },
    {
      label: 'LoanSet',
      note: stage > 1 ? `Principal sent to ${borrower}` : 'Needs both signatures',
      state: bar(stage, 2),
    },
  ]
}

function cta(stage: Stage, loan: LoanLabel, borrower: string): OriginateModel['cta'] {
  if (stage === 0) {
    return { action: { type: 'LoanSetSign', loan, terms: DEMO_TERMS }, label: 'Sign as Broker' }
  }
  return { action: { type: 'LoanSetCosign', loan }, label: `Co-sign as ${borrower}` }
}

/** Screen 4's role column for the loan the toggle selects. */
export function originateAside(loan: LoanLabel): OriginateAside {
  return {
    role: { who: 'Broker and borrowers', action: `Co-sign loan ${loan} with Borrower ${loan}` },
    toggle: {
      label: 'Loan',
      options: [
        { value: 'A', label: 'Loan A' },
        { value: 'B', label: 'Loan B' },
      ],
      selected: loan,
    },
  }
}

/**
 * Screen 4: what the board shows for the selected loan. The stage comes from the ledger and the
 * held offers, not from clicks, so there is no replay loop (K1); the toggle switches loans. Once
 * the LoanSet lands, the CTA still names the co-sign, and `gate()` reports it done.
 *
 * @param s - A snapshot seen by `ORIGINATE_VIEWER`.
 * @param loan - The loan the toggle selects.
 */
export function originate(s: Snapshot, loan: LoanLabel): OriginateModel {
  const borrower = `Borrower ${loan}`
  const stage = stageOf(s, loan)
  const terms = s.offers[loan]?.terms ?? DEMO_TERMS
  return {
    values: values(s, loan, terms),
    schedule: [
      { label: 'Payment interval', value: `${terms.paymentInterval} seconds` },
      { label: 'Payments', value: String(terms.paymentTotal) },
      { label: 'Grace period', value: `${terms.gracePeriod} seconds` },
    ],
    steps: steps(stage, borrower),
    cta: cta(stage, loan, borrower),
    next: { href: screenHref(5), label: 'Continue to step 5' },
  }
}
