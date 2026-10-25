import type { ConfidentialKeypair, LedgerEntry, TransactionMetadata } from 'xrpl'

import type { Amount, AmountDisplay, Shown } from './amount.ts'
import type { Offer } from './demo-actions.ts'
import type {
  Action,
  Borrower,
  ConfidentialBalance,
  Depositor,
  DepositorView,
  LoanLabel,
  LoanOffer,
  LoanView,
  Phase,
  Public,
  Signer,
  Snapshot,
  Step,
  Time,
  TransactionType,
  TxRecord,
  Viewer,
} from './demo-ledger.ts'
import type { LedgerState, LoggedTx } from './demo-state.ts'
import type { Kit } from './kit.ts'
import { txLink } from './network.ts'

/** What the demo holds between ledger reads. */
export interface ViewInputs {
  readonly state: LedgerState
  readonly log: readonly LoggedTx[]
  readonly offers: ReadonlyMap<LoanLabel, Offer>
  readonly submitting: Action | undefined
  readonly errors: readonly string[]
  readonly kit: Kit
  readonly display: AmountDisplay
}

const RIPPLE_EPOCH_MS = 946_684_800_000
const LSF_LOAN_DEFAULT = 0x0001_0000
const LSF_LOAN_IMPAIRED = 0x0002_0000
const TF_LOAN_DEFAULT = 0x0001_0000
const TF_LOAN_IMPAIR = 0x0002_0000
const REDACTED: Shown = Object.freeze({ visibility: 'redacted' })

const DEMO_TYPES = new Set<string>([
  'LoanBrokerSet',
  'VaultDeposit',
  'LoanBrokerDraw',
  'LoanBrokerMergeInbox',
  'LoanSet',
  'ConfidentialMPTMergeInbox',
  'ConfidentialLoanPay',
  'LoanBrokerSettle',
  'LoanManage',
  'VaultWithdraw',
])

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
  encrypted(pairs: ReadonlyArray<readonly [string | undefined, unknown]>): Shown
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
    encrypted(pairs) {
      const to: Record<string, string> = {}
      for (const [publicKey, ciphertext] of pairs) {
        if (publicKey !== undefined && typeof ciphertext === 'string') to[publicKey] = ciphertext
      }
      return show({ kind: 'encrypted', to, bound })
    },
  }
}

interface Keys {
  readonly broker: string | undefined
  readonly issuer: string | undefined
  readonly auditor: string | undefined
  borrower(borrower: Borrower): string | undefined
}

function publicKeys(state: LedgerState): Keys {
  return {
    broker: state.broker?.lendingBalance?.HolderEncryptionKey,
    issuer: state.issuance.IssuerEncryptionKey,
    auditor: state.issuance.AuditorEncryptionKey,
    borrower: (borrower) => state.assetTokens[borrower]?.HolderEncryptionKey,
  }
}

function phaseAt(closeTime: number, vault: LedgerEntry.Vault): Phase {
  if (closeTime <= (vault.SubscriptionDate ?? 0)) return 'subscription'
  if (closeTime < (vault.RedemptionDate ?? 0)) return 'investment'
  return 'redemption'
}

function confidential(lens: Lens, token: LedgerEntry.MPToken | undefined, key: string | undefined) {
  return {
    spending: lens.encrypted([[key, token?.ConfidentialBalanceSpending]]),
    inbox: lens.encrypted([[key, token?.ConfidentialBalanceInbox]]),
  } satisfies ConfidentialBalance
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
  loan: LedgerEntry.Loan & { index: string },
): LoanView {
  const holders = [keys.borrower(borrower), keys.broker, loan.LoanAuditorEncryptionKey] as const
  const term = (ciphertexts: readonly [unknown, unknown, unknown]): Shown =>
    lens.encrypted(holders.map((key, i) => [key, ciphertexts[i]] as const))
  const due = loan.NextPaymentDueDate ?? 0
  return {
    loanID: loan.index,
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

/** Facts about the run that decide which logged transactions belong to it. */
interface Run {
  readonly kit: Kit
  readonly roleOf: ReadonlyMap<string, Signer>
  readonly loanBrokerID: string | undefined
  readonly loanOf: ReadonlyMap<string, LoanLabel>
  readonly brokerCreatedIn: number
  loanAuditorKey(loanID: string): string | undefined
}

function borrowerLoan(role: Signer | undefined): LoanLabel | undefined {
  if (role === 'borrowerA') return 'A'
  if (role === 'borrowerB') return 'B'
  return undefined
}

function belongs(run: Run, { tx, ledgerIndex }: LoggedTx): boolean {
  if (!DEMO_TYPES.has(tx.TransactionType)) return false
  if (tx['VaultID'] === run.kit.vaultID) return true
  if (run.loanBrokerID !== undefined && tx['LoanBrokerID'] === run.loanBrokerID) return true
  if (typeof tx['LoanID'] === 'string' && run.loanOf.has(tx['LoanID'])) return true
  return (
    tx.TransactionType === 'ConfidentialMPTMergeInbox' &&
    tx['MPTokenIssuanceID'] === run.kit.mptIssuanceID &&
    borrowerLoan(run.roleOf.get(String(tx['Account']))) !== undefined &&
    run.loanBrokerID !== undefined &&
    ledgerIndex >= run.brokerCreatedIn
  )
}

function createdIn(log: readonly LoggedTx[], kit: Kit): number {
  const created = log.find(
    ({ tx, meta }) =>
      tx.TransactionType === 'LoanBrokerSet' &&
      tx['VaultID'] === kit.vaultID &&
      meta.TransactionResult === 'tesSUCCESS',
  )
  return created?.ledgerIndex ?? 0
}

function runOf(view: ViewInputs): Run {
  const { kit, state } = view
  const roleOf = new Map<string, Signer>()
  for (const [role, { address }] of Object.entries(kit.accounts)) {
    roleOf.set(address, role as Signer)
  }
  const loanOf = new Map<string, LoanLabel>()
  for (const [label, loan] of Object.entries(state.loans))
    loanOf.set(loan.index, label as LoanLabel)
  return {
    kit,
    roleOf,
    loanBrokerID: state.broker?.entry.index,
    loanOf,
    brokerCreatedIn: createdIn(view.log, kit),
    loanAuditorKey: (loanID) =>
      Object.values(state.loans).find((loan) => loan.index === loanID)?.LoanAuditorEncryptionKey,
  }
}

/**
 * The assets a withdrawal took out of the vault. The depositor's MPToken cannot tell: rippled omits
 * `MPTAmount` at 0, so a wallet the deposit emptied has no previous amount in the metadata.
 */
function payout(meta: TransactionMetadata, vaultID: string): bigint {
  for (const node of meta.AffectedNodes) {
    if (!('ModifiedNode' in node)) continue
    const { LedgerEntryType, LedgerIndex, FinalFields, PreviousFields } = node.ModifiedNode
    if (LedgerEntryType !== 'Vault' || LedgerIndex !== vaultID) continue
    const before = PreviousFields?.['AssetsTotal']
    if (before === undefined) return 0n
    return BigInt(String(before)) - BigInt(String(FinalFields?.['AssetsTotal'] ?? 0))
  }
  return 0n
}

function stepOf(type: TransactionType, paid: boolean): Step {
  const steps: Record<TransactionType, Step> = {
    LoanBrokerSet: 1,
    VaultDeposit: 2,
    LoanBrokerDraw: 3,
    LoanBrokerMergeInbox: paid ? 7 : 3,
    LoanSet: 4,
    ConfidentialMPTMergeInbox: 6,
    ConfidentialLoanPay: 6,
    LoanBrokerSettle: 7,
    LoanManage: 8,
    VaultWithdraw: 10,
  }
  return steps[type]
}

function recordAmount(lens: Lens, keys: Keys, run: Run, logged: LoggedTx): Shown | undefined {
  const { tx, meta } = logged
  const borrower = (field: string): Borrower | undefined => {
    const role = run.roleOf.get(String(tx[field]))
    return borrowerLoan(role) === undefined ? undefined : (role as Borrower)
  }
  const value = (tx['Amount'] as { value?: string } | undefined)?.value
  switch (tx.TransactionType) {
    case 'VaultDeposit':
    case 'LoanBrokerDraw':
    case 'LoanBrokerSettle':
      return pub(value)
    case 'VaultWithdraw': {
      if (meta.TransactionResult !== 'tesSUCCESS') return undefined
      return pub(payout(meta, run.kit.vaultID))
    }
    case 'LoanSet': {
      const to = borrower('Counterparty')
      return lens.encrypted([
        [keys.broker, tx['SenderEncryptedAmount']],
        [to === undefined ? undefined : keys.borrower(to), tx['DestinationEncryptedAmount']],
        [keys.issuer, tx['IssuerEncryptedAmount']],
        [keys.auditor, tx['AuditorEncryptedAmount']],
        [tx['LoanAuditorEncryptionKey'] as string | undefined, tx['LoanAuditorEncryptedPrincipal']],
      ])
    }
    case 'ConfidentialLoanPay': {
      const from = borrower('Account')
      return lens.encrypted([
        [from === undefined ? undefined : keys.borrower(from), tx['SenderEncryptedAmount']],
        [keys.broker, tx['DestinationEncryptedAmount']],
        [keys.issuer, tx['IssuerEncryptedAmount']],
        [keys.auditor, tx['AuditorEncryptedAmount']],
        [run.loanAuditorKey(String(tx['LoanID'])), tx['LoanAuditorEncryptedAmount']],
      ])
    }
    default:
      return undefined
  }
}

function recordLoan(run: Run, { tx }: LoggedTx): LoanLabel | undefined {
  switch (tx.TransactionType) {
    case 'LoanSet':
      return borrowerLoan(run.roleOf.get(String(tx['Counterparty'])))
    case 'ConfidentialMPTMergeInbox':
      return borrowerLoan(run.roleOf.get(String(tx['Account'])))
    case 'ConfidentialLoanPay':
    case 'LoanManage':
      return run.loanOf.get(String(tx['LoanID']))
    default:
      return undefined
  }
}

function recordFlag({ tx }: LoggedTx): TxRecord['flag'] {
  if (tx.TransactionType !== 'LoanManage') return undefined
  const flags = Number(tx['Flags'] ?? 0)
  if ((flags & TF_LOAN_DEFAULT) !== 0) return 'Defaulted'
  return (flags & TF_LOAN_IMPAIR) !== 0 ? 'Impaired' : undefined
}

function records(view: ViewInputs, lens: Lens, keys: Keys): TxRecord[] {
  const run = runOf(view)
  const result: TxRecord[] = []
  let paid = false
  for (const logged of view.log) {
    if (!belongs(run, logged)) continue
    const { tx, meta, hash } = logged
    const type = tx.TransactionType as TransactionType
    const signers: Signer[] = []
    for (const field of ['Account', ...(type === 'LoanSet' ? ['Counterparty'] : [])]) {
      const role = run.roleOf.get(String(tx[field]))
      if (role !== undefined) signers.push(role)
    }
    result.push({
      hash,
      explorerUrl: txLink(hash),
      step: stepOf(type, paid),
      type,
      loan: recordLoan(run, logged),
      signers,
      result: meta.TransactionResult,
      closedAt: rippleTime(logged.closeTime),
      amount: recordAmount(lens, keys, run, logged),
      flag: recordFlag(logged),
    })
    if (type === 'ConfidentialLoanPay' && meta.TransactionResult === 'tesSUCCESS') paid = true
  }
  return result
}

function sum(values: readonly bigint[]): Public | undefined {
  return values.length === 0 ? undefined : pub(values.reduce((a, b) => a + b, 0n))
}

function depositorView(view: ViewInputs, log: readonly TxRecord[], who: Depositor): DepositorView {
  const mine = log.filter((r) => r.signers[0] === who)
  const values = (type: TransactionType): bigint[] =>
    mine
      .filter((r) => r.type === type && r.result === 'tesSUCCESS' && r.amount !== undefined)
      .map((r) => (r.amount?.visibility === 'public' ? r.amount.value : 0n))
  const last = mine.findLast((r) => r.type === 'VaultWithdraw')
  return {
    wallet: pub(view.state.assetTokens[who]?.MPTAmount),
    shares: BigInt(view.state.shareTokens[who]?.MPTAmount ?? '0'),
    deposited: sum(values('VaultDeposit')),
    redeemed: sum(values('VaultWithdraw')),
    redeemFailure: last === undefined || last.result === 'tesSUCCESS' ? undefined : last.result,
  }
}

function offersOf(offers: ReadonlyMap<LoanLabel, Offer>): Snapshot['offers'] {
  const shown: Partial<Record<LoanLabel, LoanOffer>> = {}
  for (const { loan, terms, signedAt } of offers.values()) shown[loan] = { loan, terms, signedAt }
  return shown
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
  const { state } = view
  const l = lens(view, keys)
  const k = publicKeys(state)
  const log = records(view, l, k)
  const loans: Partial<Record<LoanLabel, LoanView>> = {}
  const { A, B } = state.loans
  if (A !== undefined) loans.A = loanView(l, k, 'borrowerA', A)
  if (B !== undefined) loans.B = loanView(l, k, 'borrowerB', B)
  const { vault, broker } = state
  return {
    viewer,
    ledgerIndex: state.ledgerIndex,
    now: rippleTime(state.closeTime),
    phase: phaseAt(state.closeTime, vault),
    vault: {
      vaultID: view.kit.vaultID,
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
            lendingBalance: confidential(l, broker.lendingBalance, k.broker),
          },
    loans,
    offers: offersOf(view.offers),
    depositors: {
      depositorA: depositorView(view, log, 'depositorA'),
      depositorB: depositorView(view, log, 'depositorB'),
    },
    borrowers: {
      borrowerA: confidential(l, state.assetTokens.borrowerA, k.borrower('borrowerA')),
      borrowerB: confidential(l, state.assetTokens.borrowerB, k.borrower('borrowerB')),
    },
    log,
    submitting: view.submitting,
    errors: [...view.errors, ...l.errors],
  }
}
