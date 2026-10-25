import type {
  Borrower,
  LoanTerms,
  LoanView,
  Reader,
  Seen,
  Time,
} from '@confidential-loans/core/demo-ledger'
import { formatClock } from './cta.ts'
import { NAMES } from './names.ts'
import type { Fact, LabelledAmount } from './value.ts'

/** One loan as both the Broker and its borrower see it; the tabs add their own actions. */
export interface LoanCardModel {
  readonly loanID: string
  readonly title: string
  readonly borrower: string
  readonly status: string
  /** Impaired or defaulted: the status shows in the loss color. */
  readonly troubled: boolean
  readonly amounts: readonly LabelledAmount[]
  readonly facts: readonly Fact[]
}

const STATUS: Readonly<Record<LoanView['status'], string>> = {
  active: 'Active',
  impaired: 'Impaired',
  defaulted: 'Defaulted',
  repaid: 'Repaid',
}

function due(loan: LoanView, now: Time): string {
  const at = loan.nextPaymentDueDate
  if (at === undefined) return 'None'
  return now > at ? `${formatClock(at)}, overdue` : formatClock(at)
}

/**
 * A loan's card. Its amounts show as the viewer's snapshot reveals them.
 *
 * @param loan - The loan, from the viewer's snapshot.
 * @param now - The snapshot's ledger time, to flag an overdue payment.
 */
export function loanCard(loan: LoanView, now: Time): LoanCardModel {
  return {
    loanID: loan.loanID,
    title: `Loan ${loan.loanSequence}`,
    borrower: NAMES[loan.borrower],
    status: STATUS[loan.status],
    troubled: loan.status === 'impaired' || loan.status === 'defaulted',
    amounts: [
      { label: 'Principal', shown: loan.principal },
      { label: 'Amount owed', shown: loan.amountOwed },
      { label: 'Periodic payment', shown: loan.periodicPayment },
    ],
    facts: [
      { label: 'Payments left', text: String(loan.paymentRemaining) },
      { label: 'Interval', text: `${loan.paymentInterval} s` },
      { label: 'Next payment due', text: due(loan, now) },
    ],
  }
}

/** Who reads a loan's encrypted terms: its borrower, the Broker and the Loan Auditor. */
export function termReaders(borrower: Borrower): readonly Reader[] {
  return [borrower, 'brokerA', 'loanAuditor']
}

/**
 * The terms of an offer. Its amounts are encrypted to the borrower, the Broker and the Loan
 * Auditor, in the signed LoanSet; the Broker and the borrower know them, anyone else does not.
 *
 * @param terms - The offered terms.
 * @param borrower - Who the offer is to.
 * @param readable - Whether the viewer is the Broker or the borrower.
 */
export function termsCard(
  terms: LoanTerms,
  borrower: Borrower,
  readable: boolean,
): {
  readonly amounts: readonly LabelledAmount[]
  readonly facts: readonly Fact[]
} {
  const readers = termReaders(borrower)
  const known = (value: bigint): Seen =>
    readable ? { visibility: 'decrypted', value, readers } : { visibility: 'redacted', readers }
  return {
    amounts: [
      { label: 'Principal', shown: known(terms.principal) },
      { label: 'Amount owed', shown: known(terms.amountOwed) },
      { label: 'Periodic payment', shown: known(terms.periodicPayment) },
    ],
    facts: [
      { label: 'Payments', text: String(terms.paymentTotal) },
      { label: 'Interval', text: `${terms.paymentInterval} s` },
      { label: 'Grace period', text: `${terms.gracePeriod} s` },
    ],
  }
}
