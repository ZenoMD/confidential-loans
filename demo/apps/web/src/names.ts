import type { Reader, Signer } from '@confidential-loans/core/demo-ledger'

/** How the tabs name each demo account. */
export const NAMES: Readonly<Record<Signer, string>> = {
  brokerA: 'Broker',
  depositorA: 'Depositor A',
  depositorB: 'Depositor B',
  borrowerA: 'Borrower A',
  borrowerB: 'Borrower B',
}

/** How the tabs name each holder of a key that reads encrypted amounts. */
export const READER_NAMES: Readonly<Record<Reader, string>> = {
  brokerA: 'Broker',
  borrowerA: 'Borrower A',
  borrowerB: 'Borrower B',
  issuer: 'Issuer',
  mptAuditor: 'MPT Auditor',
  loanAuditor: 'Loan Auditor',
}
