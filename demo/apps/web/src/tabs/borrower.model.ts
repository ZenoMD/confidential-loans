import type {
  Action,
  Borrower,
  LoanView,
  Seen,
  Snapshot,
} from '@confidential-loans/core/demo-ledger'
import { loanCard, termsCard } from '#web/loan.ts'
import type { LoanCardModel } from '#web/loan.ts'
import type { Command } from '#web/cta.ts'
import { formatAmount, parseWhole } from '#web/value.ts'
import type { Fact, LabelledAmount } from '#web/value.ts'

export interface BorrowerModel {
  readonly balances: readonly LabelledAmount[]
  readonly merge: Command
  /** The Broker's offer to this borrower, if one is held. */
  readonly offer:
    | {
        readonly amounts: readonly LabelledAmount[]
        readonly facts: readonly Fact[]
        readonly cosign: Command
      }
    | undefined
  readonly loans: readonly (LoanCardModel & {
    /** Opens the repayment dialog; its gate is every regular payment's. */
    readonly repay: Command
    readonly full: Command
  })[]
}

function regular(loanID: string, amount: bigint): Action {
  return { type: 'ConfidentialLoanPay', loanID, amount }
}

function readable(seen: Seen): bigint | undefined {
  return seen.visibility === 'public' || seen.visibility === 'decrypted' ? seen.value : undefined
}

/**
 * The Borrower tab: the borrower's confidential balance, read with its own key, any offer waiting
 * for its co-signature, and its loans with the two ways to pay.
 *
 * @param s - The selected borrower's snapshot.
 * @param borrower - The account the picker selects.
 */
export function borrowerTab(s: Snapshot, borrower: Borrower): BorrowerModel {
  const { spending, inbox } = s.borrowers[borrower]
  const { offer } = s
  return {
    balances: [
      { label: 'Spending', shown: spending },
      { label: 'Inbox', shown: inbox },
    ],
    merge: { action: { type: 'ConfidentialMPTMergeInbox', borrower }, label: 'Merge inbox' },
    offer:
      offer?.borrower === borrower
        ? {
            ...termsCard(offer.terms, borrower, s.viewer !== 'outsider'),
            cosign: { action: { type: 'LoanSetCosign', borrower }, label: 'Co-sign loan' },
          }
        : undefined,
    loans: s.loans
      .filter((loan) => loan.borrower === borrower)
      .map((loan) => ({
        ...loanCard(loan, s.now),
        // The dialog picks the amount; the gate of a regular payment does not depend on it.
        repay: {
          action: regular(loan.loanID, readable(loan.periodicPayment) ?? 0n),
          label: 'Make repayment',
        },
        full: {
          action: { type: 'ConfidentialLoanPay', loanID: loan.loanID, amount: 'full' },
          label: 'Pay in full',
        },
      })),
  }
}

export interface RepayModel {
  readonly title: string
  /** The Periodic Payment and the Amount Owed: the bounds of a regular payment. */
  readonly terms: readonly LabelledAmount[]
  /** The amount field, digits only. */
  readonly text: string
  readonly action: Action
  readonly label: string
  /** Why the amount cannot be paid, if it cannot. */
  readonly invalid: string | undefined
  /** Changes with each payment, so a dialog opened before one closes once it lands. */
  readonly version: string
}

function invalidAmount(s: Snapshot, value: bigint, loan: LoanView): string | undefined {
  const periodic = readable(loan.periodicPayment)
  const owed = readable(loan.amountOwed)
  const spending = readable(s.borrowers[loan.borrower].spending)
  if (value === 0n) return 'Enter an amount'
  if (periodic !== undefined && value < periodic) {
    return `At least the periodic payment, ${formatAmount(periodic)}`
  }
  if (owed !== undefined && value > owed) return `At most the amount owed, ${formatAmount(owed)}`
  if (spending !== undefined && value > spending) {
    return `More than the spending balance, ${formatAmount(spending)}`
  }
  return undefined
}

/**
 * The repayment dialog for one loan: a regular payment of any amount from the Periodic Payment
 * to the Amount Owed, which it starts at the Periodic Payment. Paying the whole Amount Owed
 * closes the loan.
 *
 * @param s - The paying borrower's own snapshot, which reads the terms whatever the lens shows.
 * @param loanID - The loan being repaid.
 * @param typed - The amount as typed, or undefined until the borrower types.
 * @returns The dialog, or undefined when the snapshot has no such loan.
 */
export function repayDialog(
  s: Snapshot,
  loanID: string,
  typed: string | undefined,
): RepayModel | undefined {
  const loan = s.loans.find((l) => l.loanID === loanID)
  if (loan === undefined) return undefined
  const periodic = readable(loan.periodicPayment)
  const { text, value } = parseWhole(typed ?? (periodic === undefined ? '' : String(periodic)))
  return {
    title: `Repay ${loanCard(loan, s.now).title}`,
    terms: [
      { label: 'Periodic payment', shown: loan.periodicPayment },
      { label: 'Amount owed', shown: loan.amountOwed },
    ],
    text,
    action: regular(loanID, value),
    label: value === 0n ? 'Pay' : `Pay ${formatAmount(value)}`,
    invalid: invalidAmount(s, value, loan),
    version: `${loan.paymentRemaining} ${loan.status}`,
  }
}
