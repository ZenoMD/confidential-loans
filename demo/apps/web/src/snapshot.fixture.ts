import type { LoanTerms, LoanView, Public, Snapshot } from '@confidential-loans/core/demo-ledger'

/** Ledger time in the fixture: 2026-10-25 12:00:00 local. */
export const NOW = new Date(2026, 9, 25, 12, 0, 0).getTime()

/** One payment of 105,000 a minute after the start. */
export const TERMS: LoanTerms = {
  principal: 100_000n,
  amountOwed: 105_000n,
  periodicPayment: 105_000n,
  paymentTotal: 1,
  paymentInterval: 60,
  gracePeriod: 60,
}

export function pub(value: bigint): Public {
  return { visibility: 'public', value }
}

/** An active single-payment loan of borrowerA, due a minute after `NOW`. */
export function loan(fields: Partial<LoanView> = {}): LoanView {
  return {
    loanID: 'L1',
    loanSequence: 1,
    borrower: 'borrowerA',
    principal: { visibility: 'decrypted', value: 100_000n },
    amountOwed: { visibility: 'decrypted', value: 105_000n },
    periodicPayment: { visibility: 'decrypted', value: 105_000n },
    paymentRemaining: 1,
    paymentInterval: 60,
    gracePeriod: 60,
    startDate: NOW,
    nextPaymentDueDate: NOW + 60_000,
    status: 'active',
    ...fields,
  }
}

/** A snapshot in Investment, with the LoanBroker created and nothing lent. */
export function snapshot(fields: Partial<Snapshot> = {}): Snapshot {
  const redacted = { visibility: 'redacted' } as const
  return {
    viewer: 'outsider',
    addresses: {
      brokerA: 'rBroker',
      depositorA: 'rDepositorA',
      depositorB: 'rDepositorB',
      borrowerA: 'rBorrowerA',
      borrowerB: 'rBorrowerB',
    },
    ledgerIndex: 1234,
    now: NOW,
    phase: 'investment',
    vault: {
      vaultID: 'V',
      assetsTotal: pub(300_000n),
      assetsAvailable: pub(100_000n),
      lossUnrealized: pub(0n),
      sharesTotal: 300_000n,
      subscriptionDate: NOW - 60_000,
      redemptionDate: NOW + 125_000,
    },
    broker: {
      loanBrokerID: 'B',
      debtMaximum: pub(250_000n),
      debtTotal: pub(200_000n),
      lendingBalance: { spending: redacted, inbox: redacted },
    },
    loans: [],
    offer: undefined,
    depositors: {
      depositorA: { wallet: pub(0n), shares: 150_000n, value: pub(150_000n) },
      depositorB: { wallet: pub(5n), shares: 150_000n, value: pub(150_000n) },
    },
    borrowers: {
      borrowerA: { spending: redacted, inbox: redacted },
      borrowerB: { spending: redacted, inbox: redacted },
    },
    submitting: undefined,
    errors: [],
    ...fields,
  }
}
