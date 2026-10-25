import { DEMO_AMOUNTS, DEMO_TERMS } from '@confidential-loans/core/demo-ledger'
import type { Borrower, LoanTerms, Snapshot } from '@confidential-loans/core/demo-ledger'
import { formatClock } from '#web/cta.ts'
import type { Command } from '#web/cta.ts'
import { loanCard, termsCard } from '#web/loan.ts'
import type { LoanCardModel } from '#web/loan.ts'
import { NAMES } from '#web/names.ts'
import { parseWhole } from '#web/value.ts'
import type { Fact, LabelledAmount } from '#web/value.ts'

export type TermField = keyof LoanTerms

/** What the Broker has typed. */
export interface BrokerUi {
  readonly debtMaximum: string
  readonly draw: string
  readonly borrower: Borrower
  readonly terms: Readonly<Record<TermField, string>>
}

/** The agreed amounts and demo terms, offered to Borrower A. */
export const brokerInitial: BrokerUi = {
  debtMaximum: String(DEMO_AMOUNTS.debtMaximum),
  draw: String(DEMO_AMOUNTS.draw),
  borrower: 'borrowerA',
  terms: {
    principal: String(DEMO_TERMS.principal),
    amountOwed: String(DEMO_TERMS.amountOwed),
    periodicPayment: String(DEMO_TERMS.periodicPayment),
    paymentTotal: String(DEMO_TERMS.paymentTotal),
    paymentInterval: String(DEMO_TERMS.paymentInterval),
    gracePeriod: String(DEMO_TERMS.gracePeriod),
  },
}

/** A whole-number field: `$` amounts, seconds, or a plain count. */
export interface TermInput {
  readonly key: TermField
  readonly label: string
  readonly unit: '$' | 's' | ''
  readonly text: string
}

export interface BrokerModel {
  /** Undefined once the LoanBroker exists. */
  readonly create: (Command & { readonly text: string }) | undefined
  readonly lending: readonly LabelledAmount[]
  readonly draw: Command & { readonly text: string; readonly available: LabelledAmount }
  readonly merge: Command
  readonly settle: Command
  readonly offer: Command & { readonly borrower: Borrower; readonly fields: readonly TermInput[] }
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
  { key: 'amountOwed', label: 'Amount owed', unit: '$' },
  { key: 'periodicPayment', label: 'Periodic payment', unit: '$' },
  { key: 'paymentTotal', label: 'Payments', unit: '' },
  { key: 'paymentInterval', label: 'Payment interval', unit: 's' },
  { key: 'gracePeriod', label: 'Grace period', unit: 's' },
]

function termsOf(typed: BrokerUi['terms']): LoanTerms {
  const whole = (field: TermField) => parseWhole(typed[field]).value
  return {
    principal: whole('principal'),
    amountOwed: whole('amountOwed'),
    periodicPayment: whole('periodicPayment'),
    paymentTotal: Number(whole('paymentTotal')),
    paymentInterval: Number(whole('paymentInterval')),
    gracePeriod: Number(whole('gracePeriod')),
  }
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
  const debtMaximum = parseWhole(ui.debtMaximum)
  const draw = parseWhole(ui.draw)
  return {
    create:
      broker === undefined
        ? {
            text: debtMaximum.text,
            action: { type: 'LoanBrokerSet', debtMaximum: debtMaximum.value },
            label: 'Create LoanBroker',
          }
        : undefined,
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
        text: parseWhole(ui.terms[field.key]).text,
      })),
      action: { type: 'LoanSetSign', borrower: ui.borrower, terms: termsOf(ui.terms) },
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
