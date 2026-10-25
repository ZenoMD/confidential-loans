import { DEMO_AMOUNTS } from '@confidential-loans/core/demo-ledger'
import type { Borrower, LoanTerms, Snapshot } from '@confidential-loans/core/demo-ledger'
import { formatClock } from '#web/cta.ts'
import type { Command } from '#web/cta.ts'
import { loanCard, termsCard } from '#web/loan.ts'
import type { LoanCardModel } from '#web/loan.ts'
import { secondsOf } from '#web/duration.ts'
import type { DurationInput } from '#web/duration.ts'
import { NAMES } from '#web/names.ts'
import { parsePercent, parseWhole } from '#web/value.ts'
import type { Fact, LabelledAmount } from '#web/value.ts'

/** The loan terms the Broker types. The amount owed and periodic payment follow from them. */
export interface OfferInputs {
  readonly principal: string
  /** Percent a year, simple interest. */
  readonly interestRate: string
  readonly paymentTotal: string
  readonly paymentInterval: DurationInput
  readonly gracePeriod: DurationInput
}

/** What the Broker has typed. */
export interface BrokerUi {
  readonly draw: string
  readonly borrower: Borrower
  readonly terms: OfferInputs
}

/**
 * The agreed draw, and a loan to Borrower A: 100,000 at 10 % a year, repaid daily over a week,
 * with a day's grace. It fits the default 30-day Investment.
 */
export const brokerInitial: BrokerUi = {
  draw: String(DEMO_AMOUNTS.draw),
  borrower: 'borrowerA',
  terms: {
    principal: '100000',
    interestRate: '10',
    paymentTotal: '7',
    paymentInterval: { amount: '1', unit: 'd' },
    gracePeriod: { amount: '1', unit: 'd' },
  },
}

/** A number field: a `$` amount, a `%` rate or a plain count. */
export interface TermInput {
  readonly key: 'principal' | 'interestRate' | 'paymentTotal'
  readonly label: string
  readonly unit: '$' | '%' | ''
  readonly text: string
}

export interface DurationTerm {
  readonly key: 'paymentInterval' | 'gracePeriod'
  readonly label: string
  readonly value: DurationInput
}

export interface BrokerModel {
  readonly lending: readonly LabelledAmount[]
  readonly draw: Command & { readonly text: string; readonly available: LabelledAmount }
  readonly merge: Command
  readonly settle: Command
  readonly offer: Command & {
    readonly borrower: Borrower
    readonly fields: readonly TermInput[]
    readonly durations: readonly DurationTerm[]
    /** The interest, the amount owed and the periodic payment the typed terms give. */
    readonly derived: readonly LabelledAmount[]
  }
  readonly pending:
    | {
        readonly title: string
        readonly note: string
        readonly stale: boolean
        readonly amounts: readonly LabelledAmount[]
        readonly facts: readonly Fact[]
        readonly withdraw: Command
      }
    | undefined
  readonly loans: readonly (LoanCardModel & {
    readonly impair: Command
    readonly default: Command
  })[]
}

const TERM_FIELDS: readonly Omit<TermInput, 'text'>[] = [
  { key: 'principal', label: 'Principal', unit: '$' },
  { key: 'interestRate', label: 'Interest per annum', unit: '%' },
  { key: 'paymentTotal', label: 'Payments', unit: '' },
]

const DURATION_TERMS: readonly Omit<DurationTerm, 'value'>[] = [
  { key: 'paymentInterval', label: 'Payment interval' },
  { key: 'gracePeriod', label: 'Grace period' },
]

const YEAR_SECONDS = 365n * 86_400n

/**
 * The principal plus simple interest over the loan, rounded up to a whole unit.
 *
 * @param principal - Whole units lent.
 * @param rate - Hundredths of a percent a year.
 * @param seconds - The loan's length: its payments times their interval.
 */
export function amountOwedOf(principal: bigint, rate: bigint, seconds: number): bigint {
  const scale = 10_000n * YEAR_SECONDS
  return principal + (principal * rate * BigInt(seconds) + scale - 1n) / scale
}

/** The smallest payment that `payments` of cover `owed`; all of it when there are none. */
export function periodicPaymentOf(owed: bigint, payments: number): bigint {
  if (payments < 1) return owed
  const n = BigInt(payments)
  return (owed + n - 1n) / n
}

function termsOf(typed: OfferInputs): LoanTerms {
  const principal = parseWhole(typed.principal).value
  const paymentTotal = Number(parseWhole(typed.paymentTotal).value)
  const paymentInterval = secondsOf(typed.paymentInterval)
  const rate = parsePercent(typed.interestRate).hundredths
  const amountOwed = amountOwedOf(principal, rate, paymentTotal * paymentInterval)
  return {
    principal,
    amountOwed,
    periodicPayment: periodicPaymentOf(amountOwed, paymentTotal),
    paymentTotal,
    paymentInterval,
    gracePeriod: secondsOf(typed.gracePeriod),
  }
}

function fieldText(key: TermInput['key'], typed: string): string {
  return key === 'interestRate' ? parsePercent(typed).text : parseWhole(typed).text
}

function pending(s: Snapshot): BrokerModel['pending'] {
  const { offer } = s
  if (offer === undefined) return undefined
  const borrower = NAMES[offer.borrower]
  const note = offer.stale
    ? 'Expired: the Broker has submitted since signing it. Withdraw it and sign again.'
    : `Signed at ${formatClock(offer.signedAt)}. Waiting for ${borrower} to co-sign.`
  return {
    title: `Offer to ${borrower}`,
    note,
    stale: offer.stale,
    ...termsCard(offer.terms),
    withdraw: { action: { type: 'LoanSetWithdraw' }, label: 'Withdraw offer' },
  }
}

/**
 * The Broker tab: the LoanBroker and its Lending Balance, read with the Broker Key, every loan it
 * made, and the offer form.
 *
 * @param s - The Broker's snapshot.
 * @param ui - What the Broker has typed.
 */
export function brokerTab(s: Snapshot, ui: BrokerUi): BrokerModel {
  const { broker } = s
  const redacted = { visibility: 'redacted' } as const
  const draw = parseWhole(ui.draw)
  const terms = termsOf(ui.terms)
  const known = (value: bigint) => ({ visibility: 'decrypted', value }) as const
  return {
    lending: [
      { label: 'Debt maximum', shown: broker?.debtMaximum ?? redacted },
      { label: 'Debt to the vault', shown: broker?.debtTotal ?? redacted },
      { label: 'Lending inbox', shown: broker?.lendingBalance.inbox ?? redacted },
      { label: 'Lending spending', shown: broker?.lendingBalance.spending ?? redacted },
    ],
    draw: {
      text: draw.text,
      available: { label: 'Vault available', shown: s.vault.assetsAvailable },
      action: { type: 'LoanBrokerDraw', amount: draw.value },
      label: 'Draw',
    },
    merge: { action: { type: 'LoanBrokerMergeInbox' }, label: 'Merge inbox' },
    settle: { action: { type: 'LoanBrokerSettle' }, label: 'Settle to vault' },
    offer: {
      borrower: ui.borrower,
      fields: TERM_FIELDS.map((field) => ({
        ...field,
        text: fieldText(field.key, ui.terms[field.key]),
      })),
      durations: DURATION_TERMS.map((term) => ({ ...term, value: ui.terms[term.key] })),
      derived: [
        { label: 'Interest', shown: known(terms.amountOwed - terms.principal) },
        { label: 'Amount owed', shown: known(terms.amountOwed) },
        { label: 'Periodic payment', shown: known(terms.periodicPayment) },
      ],
      action: { type: 'LoanSetSign', borrower: ui.borrower, terms },
      label: `Sign offer to ${NAMES[ui.borrower]}`,
    },
    pending: pending(s),
    loans: s.loans.map((loan) => ({
      ...loanCard(loan, s.now),
      impair: {
        action: { type: 'LoanManage', loanID: loan.loanID, flag: 'impair' },
        label: 'Impair',
      },
      default: {
        action: { type: 'LoanManage', loanID: loan.loanID, flag: 'default' },
        label: 'Default',
      },
    })),
  }
}
