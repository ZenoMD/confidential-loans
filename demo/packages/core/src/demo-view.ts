import type { ConfidentialKeypair, LedgerEntry } from 'xrpl'

import type { Amount, AmountDisplay, Shown } from './amount.ts'
import type { Offer } from './demo-actions.ts'
import type {
  Action,
  Borrower,
  ConfidentialBalance,
  Depositor,
  DepositorView,
  LoanOffer,
  LoanView,
  Phase,
  Public,
  Reader,
  Seen,
  Snapshot,
  Time,
  Viewer,
} from './demo-ledger.ts'
import type { LedgerState } from './demo-state.ts'
import type { Kit } from './kit.ts'

/** What the demo holds between ledger reads. */
export interface ViewInputs {
  readonly state: LedgerState
  readonly offer: Offer | undefined
  readonly submitting: Action | undefined
  readonly errors: readonly string[]
  readonly kit: Kit
  readonly display: AmountDisplay
}

const RIPPLE_EPOCH_MS = 946_684_800_000
const LSF_LOAN_DEFAULT = 0x0001_0000
const LSF_LOAN_IMPAIRED = 0x0002_0000
const REDACTED: Shown = Object.freeze({ visibility: 'redacted' })

/** Converts Ripple Epoch seconds to Unix milliseconds. */
export function rippleTime(seconds: number): Time {
  return seconds * 1000 + RIPPLE_EPOCH_MS
}

function pub(value: bigint | string | undefined): Public {
  return { visibility: 'public', value: BigInt(value ?? 0) }
}

/** Shows amounts to one viewer, recording any decrypt failure instead of throwing. */
interface Lens {
  show(amount: Amount): Shown
  /**
   * Shows an amount from its ciphertext for each reader that has one. `alsoReadBy` names readers
   * who reach it through another ciphertext, such as a balance's total, which is not decrypted.
   */
  encrypted(
    entries: ReadonlyArray<readonly [Reader, string | undefined, unknown]>,
    alsoReadBy?: readonly Reader[],
  ): Seen
  readonly errors: string[]
}

function lens(view: ViewInputs, keys: readonly ConfidentialKeypair[]): Lens {
  const bound = BigInt(view.state.issuance.ConfidentialOutstandingAmount ?? '0')
  const errors: string[] = []
  const show = (amount: Amount): Shown => {
    let key: ConfidentialKeypair | undefined
    if (amount.kind === 'encrypted') {
      const holders = new Set(Object.keys(amount.to).map((k) => k.toUpperCase()))
      key = keys.find((candidate) => holders.has(candidate.publicKey.toUpperCase()))
    }
    try {
      return view.display.show(amount, key)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
      return REDACTED
    }
  }
  return {
    show,
    errors,
    encrypted(entries, alsoReadBy = []) {
      const to: Record<string, string> = {}
      const readers: Reader[] = []
      for (const [reader, publicKey, ciphertext] of entries) {
        if (publicKey === undefined || typeof ciphertext !== 'string') continue
        to[publicKey] = ciphertext
        readers.push(reader)
      }
      return { ...show({ kind: 'encrypted', to, bound }), readers: [...readers, ...alsoReadBy] }
    },
  }
}

interface Keys {
  readonly broker: string | undefined
  borrower(borrower: Borrower): string | undefined
}

function publicKeys(state: LedgerState): Keys {
  return {
    broker: state.broker?.lendingBalance?.HolderEncryptionKey,
    borrower: (borrower) => state.assetTokens[borrower]?.HolderEncryptionKey,
  }
}

function phaseAt(closeTime: number, vault: LedgerEntry.Vault): Phase {
  if (closeTime <= (vault.SubscriptionDate ?? 0)) return 'subscription'
  if (closeTime < (vault.RedemptionDate ?? 0)) return 'investment'
  return 'redemption'
}

/**
 * A confidential balance. Its spending and inbox are encrypted to the holder; the Issuer and MPT
 * Auditor each hold a ciphertext of the total.
 */
function confidential(
  lens: Lens,
  holder: Reader,
  token: LedgerEntry.MPToken | undefined,
  key: string | undefined,
): ConfidentialBalance {
  const total: Reader[] = []
  if (token?.IssuerEncryptedBalance !== undefined) total.push('issuer')
  if (token?.AuditorEncryptedBalance !== undefined) total.push('mptAuditor')
  return {
    spending: lens.encrypted([[holder, key, token?.ConfidentialBalanceSpending]], total),
    inbox: lens.encrypted([[holder, key, token?.ConfidentialBalanceInbox]], total),
  }
}

function loanStatus(loan: LedgerEntry.Loan): LoanView['status'] {
  if ((loan.Flags & LSF_LOAN_DEFAULT) !== 0) return 'defaulted'
  // rippled omits PaymentRemaining once it reaches 0.
  if ((loan.PaymentRemaining ?? 0) === 0) return 'repaid'
  return (loan.Flags & LSF_LOAN_IMPAIRED) !== 0 ? 'impaired' : 'active'
}

function loanView(
  lens: Lens,
  keys: Keys,
  borrower: Borrower,
  loan: LedgerState['loans'][number],
): LoanView {
  const holders = [
    [borrower, keys.borrower(borrower)],
    ['brokerA', keys.broker],
    ['loanAuditor', loan.LoanAuditorEncryptionKey],
  ] as const
  const term = (ciphertexts: readonly [unknown, unknown, unknown]): Seen =>
    lens.encrypted(holders.map(([reader, key], i) => [reader, key, ciphertexts[i]] as const))
  const due = loan.NextPaymentDueDate ?? 0
  return {
    loanID: loan.index,
    loanSequence: loan.LoanSequence,
    borrower,
    principal: term([
      loan.BorrowerEncryptedPrincipal,
      loan.BrokerEncryptedPrincipal,
      loan.LoanAuditorEncryptedPrincipal,
    ]),
    amountOwed: term([
      loan.BorrowerEncryptedAmountOwed,
      loan.BrokerEncryptedAmountOwed,
      loan.LoanAuditorEncryptedAmountOwed,
    ]),
    periodicPayment: term([
      loan.BorrowerEncryptedPeriodicPayment,
      loan.BrokerEncryptedPeriodicPayment,
      loan.LoanAuditorEncryptedPeriodicPayment,
    ]),
    paymentRemaining: loan.PaymentRemaining ?? 0,
    paymentInterval: loan.PaymentInterval,
    gracePeriod: loan.GracePeriod,
    startDate: rippleTime(loan.StartDate),
    nextPaymentDueDate: due === 0 ? undefined : rippleTime(due),
    status: loanStatus(loan),
  }
}

function depositorView(state: LedgerState, who: Depositor): DepositorView {
  const shares = BigInt(state.shareTokens[who]?.MPTAmount ?? '0')
  const sharesTotal = BigInt(state.shareIssuance.OutstandingAmount ?? '0')
  const { AssetsTotal, LossUnrealized } = state.vault
  const assets = BigInt(AssetsTotal ?? '0') - BigInt(LossUnrealized ?? '0')
  return {
    wallet: pub(state.assetTokens[who]?.MPTAmount),
    shares,
    value: pub(sharesTotal === 0n ? 0n : (shares * assets) / sharesTotal),
  }
}

function offerView(state: LedgerState, offer: Offer | undefined): LoanOffer | undefined {
  if (offer === undefined) return undefined
  const { borrower, terms, signedAt } = offer
  const stale = state.brokerSequence !== offer.sequence || state.ledgerIndex >= offer.lastLedger
  return { borrower, terms, signedAt, stale }
}

function borrowerOf(kit: Kit, address: string): Borrower | undefined {
  if (address === kit.accounts.borrowerA.address) return 'borrowerA'
  if (address === kit.accounts.borrowerB.address) return 'borrowerB'
  return undefined
}

/**
 * Renders the demo state as one viewer sees it. Encrypted amounts are decrypted with the first of
 * `keys` they were encrypted to, and redacted when there is none.
 *
 * @param view - The latest ledger state, log and local state.
 * @param viewer - Whose snapshot this is.
 * @param keys - The viewer's ElGamal keypairs.
 * @returns The snapshot.
 */
export function buildSnapshot(
  view: ViewInputs,
  viewer: Viewer,
  keys: readonly ConfidentialKeypair[],
): Snapshot {
  const { state, kit } = view
  const l = lens(view, keys)
  const k = publicKeys(state)
  const loans: LoanView[] = []
  for (const loan of state.loans) {
    const borrower = borrowerOf(kit, loan.Borrower)
    if (borrower !== undefined) loans.push(loanView(l, k, borrower, loan))
  }
  const { vault, broker } = state
  return {
    viewer,
    addresses: {
      brokerA: kit.accounts.brokerA.address,
      depositorA: kit.accounts.depositorA.address,
      depositorB: kit.accounts.depositorB.address,
      borrowerA: kit.accounts.borrowerA.address,
      borrowerB: kit.accounts.borrowerB.address,
    },
    ledgerIndex: state.ledgerIndex,
    now: rippleTime(state.closeTime),
    phase: phaseAt(state.closeTime, vault),
    vault: {
      vaultID: kit.vaultID,
      assetsTotal: pub(vault.AssetsTotal),
      assetsAvailable: pub(vault.AssetsAvailable),
      lossUnrealized: pub(vault.LossUnrealized),
      sharesTotal: BigInt(state.shareIssuance.OutstandingAmount ?? '0'),
      subscriptionDate: rippleTime(vault.SubscriptionDate ?? 0),
      redemptionDate: rippleTime(vault.RedemptionDate ?? 0),
    },
    broker:
      broker === undefined
        ? undefined
        : {
            loanBrokerID: broker.entry.index,
            debtMaximum: pub(broker.entry.DebtMaximum),
            debtTotal: pub(broker.entry.DebtTotal),
            lendingBalance: confidential(l, 'brokerA', broker.lendingBalance, k.broker),
          },
    loans,
    offer: offerView(state, view.offer),
    depositors: {
      depositorA: depositorView(state, 'depositorA'),
      depositorB: depositorView(state, 'depositorB'),
    },
    borrowers: {
      borrowerA: confidential(l, 'borrowerA', state.assetTokens.borrowerA, k.borrower('borrowerA')),
      borrowerB: confidential(l, 'borrowerB', state.assetTokens.borrowerB, k.borrower('borrowerB')),
    },
    submitting: view.submitting,
    errors: [...view.errors, ...l.errors],
  }
}
