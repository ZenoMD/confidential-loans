import type { Signer } from '@confidential-loans/core/demo-ledger'

/** How the tabs name each demo account. */
export const NAMES: Readonly<Record<Signer, string>> = {
  brokerA: 'Broker',
  depositorA: 'Depositor A',
  depositorB: 'Depositor B',
  borrowerA: 'Borrower A',
  borrowerB: 'Borrower B',
}
