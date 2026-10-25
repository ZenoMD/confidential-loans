import type { Borrower, Snapshot } from '@confidential-loans/core/demo-ledger'
import { loanCard, termsCard } from '#web/loan.ts'
import type { LoanCardModel } from '#web/loan.ts'
import type { Command } from '#web/cta.ts'
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
    readonly installment: Command
    readonly full: Command
  })[]
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
        installment: {
          action: { type: 'ConfidentialLoanPay', loanID: loan.loanID, mode: 'installment' },
          label: 'Pay installment',
        },
        full: {
          action: { type: 'ConfidentialLoanPay', loanID: loan.loanID, mode: 'full' },
          label: 'Pay in full',
        },
      })),
  }
}
