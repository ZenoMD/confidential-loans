import { createAmountDisplay } from './amount.ts'
import type { Shown } from './amount.ts'
import { decryptCiphertext } from './confidential.ts'
import { ActionFailed, createActions } from './demo-actions.ts'
import type { Offer } from './demo-actions.ts'
import { readLedgerState, TxLog } from './demo-state.ts'
import type { LedgerState } from './demo-state.ts'
import { buildSnapshot } from './demo-view.ts'
import type { LoanTerms } from './demo.ts'
import type { Kit } from './kit.ts'
import type { Ledger } from './network.ts'

export { ActionFailed }
export type { Kit, LoanTerms, Shown }

export type Depositor = 'depositorA' | 'depositorB'
export type Borrower = 'borrowerA' | 'borrowerB'
export type LoanLabel = 'A' | 'B'
/** The accounts that sign demo transactions. */
export type Signer = 'brokerA' | Depositor | Borrower
/** The holders of an ElGamal private key in the kit. */
export type KeyHolder = 'brokerA' | Borrower | 'mptAuditor' | 'loanAuditor'
/**
 * Whose eyes a snapshot is rendered through. `auditor` holds both the MPT Auditor key and the Loan
 * Auditor key; `outsider` and the depositors hold none.
 */
export type Viewer = 'outsider' | 'auditor' | Signer
/** The closed-ended vault's phase, decided by the latest validated ledger's close time. */
export type Phase = 'subscription' | 'investment' | 'redemption'
/** The demo screens that submit transactions. */
export type Step = 1 | 2 | 3 | 4 | 6 | 7 | 8 | 10
/** A moment in Unix milliseconds, ready for `new Date(time)`. */
export type Time = number

/** The agreed terms of both demo loans: one full payment 60 s after the start, 60 s grace. */
export const DEMO_TERMS: LoanTerms = Object.freeze({
  principal: 100_000n,
  amountOwed: 105_000n,
  periodicPayment: 105_000n,
  paymentTotal: 1,
  paymentInterval: 60,
  gracePeriod: 60,
})

/** The agreed amounts the screens prefill. */
export const DEMO_AMOUNTS = Object.freeze({
  debtMaximum: 250_000n,
  deposit: 150_000n,
  draw: 200_000n,
})

/** An amount everyone can read. Assignable to `Shown`. */
export type Public = { readonly visibility: 'public'; readonly value: bigint }

/** A step the demo can take. Each submits one transaction, except `LoanSetSign`. */
export type Action =
  /** Creates the confidential LoanBroker for the kit's vault. 0 means no debt cap. */
  | { readonly type: 'LoanBrokerSet'; readonly debtMaximum: bigint }
  | { readonly type: 'VaultDeposit'; readonly depositor: Depositor; readonly amount: bigint }
  /** Moves a public amount from the vault into the Lending Balance inbox. */
  | { readonly type: 'LoanBrokerDraw'; readonly amount: bigint }
  /** Moves the Lending Balance inbox into its spending balance. */
  | { readonly type: 'LoanBrokerMergeInbox' }
  /**
   * The Broker builds the proof and signs the loan's `LoanSet`. Nothing is submitted: the offer
   * waits in memory, in `Snapshot.offers`, for the borrower. A reload loses it.
   */
  | { readonly type: 'LoanSetSign'; readonly loan: LoanLabel; readonly terms: LoanTerms }
  /** The borrower co-signs the held offer and submits it. */
  | { readonly type: 'LoanSetCosign'; readonly loan: LoanLabel }
  | { readonly type: 'ConfidentialMPTMergeInbox'; readonly borrower: Borrower }
  /** Pays the loan in full: exactly the amount owed, decrypted with the borrower's key. */
  | { readonly type: 'ConfidentialLoanPay'; readonly loan: LoanLabel }
  /** Settles the whole Lending Balance spending to the vault. */
  | { readonly type: 'LoanBrokerSettle' }
  | { readonly type: 'LoanManage'; readonly loan: LoanLabel; readonly flag: 'impair' | 'default' }
  /** Redeems all of the depositor's shares. */
  | { readonly type: 'VaultWithdraw'; readonly depositor: Depositor }

/** The transaction types the demo submits. */
export type TransactionType =
  | 'LoanBrokerSet'
  | 'VaultDeposit'
  | 'LoanBrokerDraw'
  | 'LoanBrokerMergeInbox'
  | 'LoanSet'
  | 'ConfidentialMPTMergeInbox'
  | 'ConfidentialLoanPay'
  | 'LoanBrokerSettle'
  | 'LoanManage'
  | 'VaultWithdraw'

/** One validated demo transaction, as the explorers list it. Failed ones are kept too. */
export interface TxRecord {
  readonly hash: string
  readonly explorerUrl: string
  readonly step: Step
  readonly type: TransactionType
  /** The loan it concerns, for LoanSet, borrower merges, payments and LoanManage. */
  readonly loan: LoanLabel | undefined
  /** The submitter first; a LoanSet adds its co-signing borrower. */
  readonly signers: readonly Signer[]
  /** `tesSUCCESS`, or the `tec` code the ledger recorded. */
  readonly result: string
  readonly closedAt: Time
  /**
   * Public for a deposit, draw, settle and redemption payout; encrypted for a LoanSet principal
   * and a ConfidentialLoanPay. Undefined for merges, LoanBrokerSet and LoanManage.
   */
  readonly amount: Shown | undefined
  /** The LoanManage flag set. */
  readonly flag: 'Impaired' | 'Defaulted' | undefined
}

export interface ConfidentialBalance {
  readonly spending: Shown
  readonly inbox: Shown
}

export interface BrokerView {
  readonly loanBrokerID: string
  readonly debtMaximum: Public
  /** What the Lending Balance owes the vault: moves only on draw and settle. */
  readonly debtTotal: Public
  /** Readable with the Broker Key only. */
  readonly lendingBalance: ConfidentialBalance
}

export interface LoanView {
  readonly loanID: string
  readonly borrower: Borrower
  readonly principal: Shown
  /** Reduced by each payment. */
  readonly amountOwed: Shown
  readonly periodicPayment: Shown
  readonly paymentRemaining: number
  /** Seconds. */
  readonly paymentInterval: number
  /** Seconds. */
  readonly gracePeriod: number
  readonly startDate: Time
  /** Undefined once the loan is repaid or defaulted. */
  readonly nextPaymentDueDate: Time | undefined
  readonly status: 'active' | 'impaired' | 'defaulted' | 'repaid'
}

/** A LoanSet the Broker signed, waiting for the borrower's co-signature. */
export interface LoanOffer {
  readonly loan: LoanLabel
  readonly terms: LoanTerms
  readonly signedAt: Time
}

export interface DepositorView {
  /** Public balance of the vault asset. */
  readonly wallet: Public
  readonly shares: bigint
  /** Sum of the depositor's successful deposits; undefined before the first. */
  readonly deposited: Public | undefined
  /** Sum of the depositor's redemption payouts; undefined before the first. */
  readonly redeemed: Public | undefined
  /** The code of a failed redemption not followed by a successful one. */
  readonly redeemFailure: string | undefined
}

/** Everything screens 1 to 10 render, read from one validated ledger and seen by one viewer. */
export interface Snapshot {
  readonly viewer: Viewer
  readonly ledgerIndex: number
  /** The ledger's close time. Gates compare against it, never against the local clock. */
  readonly now: Time
  readonly phase: Phase
  readonly vault: {
    readonly vaultID: string
    readonly assetsTotal: Public
    readonly assetsAvailable: Public
    readonly lossUnrealized: Public
    readonly sharesTotal: bigint
    /** Deposits close after this moment. */
    readonly subscriptionDate: Time
    /** Withdrawals open at this moment. */
    readonly redemptionDate: Time
  }
  /** Undefined until step 1 creates it. */
  readonly broker: BrokerView | undefined
  readonly loans: Readonly<Partial<Record<LoanLabel, LoanView>>>
  readonly offers: Readonly<Partial<Record<LoanLabel, LoanOffer>>>
  readonly depositors: Readonly<Record<Depositor, DepositorView>>
  readonly borrowers: Readonly<Record<Borrower, ConfidentialBalance>>
  /** Demo transactions in ledger order. */
  readonly log: readonly TxRecord[]
  /** The action in flight, if any. Only one runs at a time. */
  readonly submitting: Action | undefined
  /** Problems to show: a failed refresh, or an amount that failed to decrypt (shown redacted). */
  readonly errors: readonly string[]
}

/** Whether an action can run now, and if not, why. */
export type Gate =
  | { readonly open: true }
  /** Opens by ledger time: the screens show "Opens at HH:MM:SS". */
  | { readonly open: false; readonly reason: 'opens'; readonly at: Time }
  /** The ledger would reject it with `code`. */
  | { readonly open: false; readonly reason: 'closed'; readonly code: string }
  /** An earlier step must run first: "Complete step N first". `loan` names the missing loan. */
  | {
      readonly open: false
      readonly reason: 'prerequisite'
      readonly step: Step
      readonly loan?: LoanLabel
    }
  | { readonly open: false; readonly reason: 'done' }

/** The running demo on the devnet. */
export interface Demo {
  /**
   * Returns the latest state as `viewer` sees it, starting any decrypt it needs. Returns the same
   * object until something changes, so it can back `useSyncExternalStore`.
   */
  snapshot(viewer: Viewer): Snapshot
  /**
   * Calls `listener` after each change: a validated ledger read, a decrypt that finished, an
   * action that started or ended.
   *
   * @returns A function that removes the listener.
   */
  subscribe(listener: () => void): () => void
  /**
   * Runs one action: builds, signs, submits and waits for validation, then rereads the ledger.
   *
   * @throws {ActionFailed} With the engine code or the reason nothing was submitted.
   */
  act(action: Action): Promise<void>
  /** Stops following ledger closes. The ledger connection stays open; its owner closes it. */
  close(): void
}

function open(): Gate {
  return { open: true }
}
function opens(at: Time): Gate {
  return { open: false, reason: 'opens', at }
}
function closed(code: string): Gate {
  return { open: false, reason: 'closed', code }
}
function prerequisite(step: Step, loan?: LoanLabel): Gate {
  return loan === undefined
    ? { open: false, reason: 'prerequisite', step }
    : { open: false, reason: 'prerequisite', step, loan }
}
const DONE: Gate = Object.freeze({ open: false, reason: 'done' })

const SECOND = 1000
/** XLS-66 closed-ended gate: the final payment must precede RedemptionDate by this much. */
const LOAN_REDEMPTION_BUFFER_MS = 60 * SECOND

function succeeded(s: Snapshot, type: TransactionType, step?: Step): boolean {
  return s.log.some(
    (r) => r.type === type && r.result === 'tesSUCCESS' && (step === undefined || r.step === step),
  )
}

function amountGate(amount: bigint, limit: bigint): Gate | undefined {
  if (amount <= 0n) return closed('temBAD_AMOUNT')
  if (amount > limit) return closed('tecINSUFFICIENT_FUNDS')
  return undefined
}

function drawGate(s: Snapshot, amount: bigint): Gate {
  if (s.broker === undefined) return prerequisite(1)
  if (s.phase === 'subscription') return opens(s.vault.subscriptionDate + SECOND)
  if (s.phase === 'redemption') return closed('tecNO_PERMISSION')
  const tooMuch = amountGate(amount, s.vault.assetsAvailable.value)
  if (tooMuch !== undefined) return tooMuch
  const { debtMaximum, debtTotal } = s.broker
  if (debtMaximum.value !== 0n && debtTotal.value + amount > debtMaximum.value) {
    return closed('tecLIMIT_EXCEEDED')
  }
  return open()
}

function loanSetGate(s: Snapshot, loan: LoanLabel, terms: LoanTerms): Gate {
  if (s.broker === undefined) return prerequisite(1)
  if (s.loans[loan] !== undefined) return DONE
  if (!succeeded(s, 'LoanBrokerMergeInbox', 3)) return prerequisite(3)
  if (loan === 'B' && s.loans.A === undefined) return prerequisite(4, 'A')
  if (s.phase === 'subscription') return opens(s.vault.subscriptionDate + SECOND)
  if (s.phase === 'redemption') return closed('tecEXPIRED')
  const finalPayment = s.now + terms.paymentInterval * terms.paymentTotal * SECOND
  if (finalPayment + LOAN_REDEMPTION_BUFFER_MS > s.vault.redemptionDate) {
    return closed('tecNO_PERMISSION')
  }
  return open()
}

function manageGate(s: Snapshot, loan: LoanView, flag: 'impair' | 'default'): Gate {
  if (loan.status === 'defaulted') return flag === 'default' ? DONE : closed('tecNO_PERMISSION')
  if (loan.status === 'repaid') return closed('tecNO_PERMISSION')
  if (flag === 'impair' && loan.status === 'impaired') return DONE
  const due = loan.nextPaymentDueDate ?? 0
  const boundary = flag === 'impair' ? due : due + loan.gracePeriod * SECOND
  return s.now > boundary ? open() : opens(boundary + SECOND)
}

/** Done once the depositor's whole wallet is in the vault; tecEXPIRED and amount checks follow. */
function depositGate(s: Snapshot, depositor: Depositor, amount: bigint): Gate {
  const { wallet, shares } = s.depositors[depositor]
  if (shares > 0n && wallet.value === 0n) return DONE
  if (s.phase !== 'subscription') return closed('tecEXPIRED')
  return amountGate(amount, wallet.value) ?? open()
}

function withdrawGate(s: Snapshot, depositor: Depositor): Gate {
  const { shares, deposited } = s.depositors[depositor]
  if (shares === 0n) return deposited === undefined ? prerequisite(2) : DONE
  if (s.phase === 'investment') return opens(s.vault.redemptionDate)
  return open()
}

/**
 * Decides from a snapshot whether an action can run, with the ledger's own phase, time and limit
 * rules (rippled `getVaultPhase`, `LoanSet`, `LoanBrokerDraw`, `LoanManage`). The screens enable
 * buttons from it. It does not check what only a decrypt could tell, such as whether a balance
 * covers a payment: the builder checks that, and `act` rejects with `buildFailed`.
 *
 * @param s - Any viewer's snapshot.
 * @param action - The action to check.
 * @returns Open, or the reason it is not.
 */
export function gate(s: Snapshot, action: Action): Gate {
  switch (action.type) {
    case 'LoanBrokerSet':
      return s.broker === undefined ? open() : DONE
    case 'VaultDeposit':
      return depositGate(s, action.depositor, action.amount)
    case 'LoanBrokerDraw':
      return drawGate(s, action.amount)
    case 'LoanBrokerMergeInbox':
      return s.broker === undefined ? prerequisite(1) : open()
    case 'LoanSetSign':
      return loanSetGate(s, action.loan, action.terms)
    case 'LoanSetCosign': {
      const offer = s.offers[action.loan]
      if (offer === undefined) return s.loans[action.loan] === undefined ? prerequisite(4) : DONE
      return loanSetGate(s, action.loan, offer.terms)
    }
    case 'ConfidentialMPTMergeInbox':
      return s.loans[action.borrower === 'borrowerA' ? 'A' : 'B'] === undefined
        ? prerequisite(4)
        : open()
    case 'ConfidentialLoanPay': {
      const loan = s.loans[action.loan]
      if (loan === undefined) return prerequisite(4)
      if (loan.status === 'repaid') return DONE
      return loan.status === 'defaulted' ? closed('tecNO_PERMISSION') : open()
    }
    case 'LoanBrokerSettle':
      if (s.broker === undefined) return prerequisite(1)
      return succeeded(s, 'ConfidentialLoanPay') ? open() : prerequisite(6)
    case 'LoanManage': {
      const loan = s.loans[action.loan]
      return loan === undefined ? prerequisite(4) : manageGate(s, loan, action.flag)
    }
    case 'VaultWithdraw':
      return withdrawGate(s, action.depositor)
  }
}

/** Runs one refresh at a time; a request during a refresh runs once more after it. */
function serialRefresh(load: () => Promise<void>): () => Promise<void> {
  let inFlight: Promise<void> | undefined
  let queued: Promise<void> | undefined
  const refresh = (): Promise<void> => {
    if (inFlight === undefined) {
      inFlight = load().finally(() => {
        inFlight = undefined
      })
      return inFlight
    }
    queued ??= inFlight.then(() => {
      queued = undefined
      return refresh()
    })
    return queued
  }
  return refresh
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Opens the demo for a kit on a live ledger connection. It reads the whole demo state, then
 * rereads it after every validated ledger and every action.
 *
 * @param kit - Accounts, keys and ledger IDs from `scripts/export-kit.ts`.
 * @param ledger - The connection from `connectLedger`.
 * @returns The demo, with its first snapshot ready.
 * @throws When the first read fails, for example because the kit's vault does not exist.
 */
export async function openDemo(kit: Kit, ledger: Ledger): Promise<Demo> {
  const { client } = ledger
  const display = createAmountDisplay(decryptCiphertext)
  const txLog = new TxLog(kit)
  const offers = new Map<LoanLabel, Offer>()
  const read = async (): Promise<LedgerState> => {
    const state = await readLedgerState(client, kit)
    await txLog.fetch(client, state.ledgerIndex)
    return state
  }
  let state = await read()
  let errors: readonly string[] = []
  let submitting: Action | undefined
  let version = 0
  const listeners = new Set<() => void>()
  const snapshots = new Map<Viewer, { version: number; snapshot: Snapshot }>()
  const changed = (): void => {
    version += 1
    for (const listener of listeners) listener()
  }
  const unsubscribeDisplay = display.subscribe(changed)
  const refresh = serialRefresh(async () => {
    try {
      state = await read()
      errors = []
    } catch (error) {
      errors = [`Could not read the ledger: ${describe(error)}`]
    }
    changed()
  })
  const stopFollowing = ledger.onLedgerClosed(() => void refresh())
  const actions = createActions({ client, kit, display, offers, state: () => state })

  return {
    snapshot(viewer) {
      const cached = snapshots.get(viewer)
      if (cached?.version === version) return cached.snapshot
      const view = { state, log: txLog.entries(), offers, submitting, errors, kit, display }
      const snapshot = buildSnapshot(view, viewer, actions.keysOf(viewer))
      snapshots.set(viewer, { version, snapshot })
      return snapshot
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async act(action) {
      if (submitting !== undefined) {
        throw new ActionFailed('busy', `${submitting.type} is still running`)
      }
      submitting = action
      changed()
      try {
        await actions.perform(action)
      } finally {
        await refresh()
        submitting = undefined
        changed()
      }
    },
    close() {
      stopFollowing()
      unsubscribeDisplay()
      listeners.clear()
    },
  }
}
