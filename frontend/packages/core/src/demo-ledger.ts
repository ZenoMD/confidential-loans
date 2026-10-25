import { createAmountDisplay } from './amount.ts'
import type { Shown } from './amount.ts'
import { decryptCiphertext } from './confidential.ts'
import { ActionFailed, createActions } from './demo-actions.ts'
import type { OfferSlot } from './demo-actions.ts'
import { readLedgerState } from './demo-state.ts'
import type { LedgerState } from './demo-state.ts'
import { buildSnapshot } from './demo-view.ts'
import { validateLoanTerms } from './demo.ts'
import type { LoanTerms } from './demo.ts'
import type { Kit } from './kit.ts'
import type { Ledger } from './network.ts'

export { ActionFailed }
export type { Kit, LoanTerms, Shown }

export type Depositor = 'depositorA' | 'depositorB'
export type Borrower = 'borrowerA' | 'borrowerB'
/** The accounts that sign demo transactions. */
export type Signer = 'brokerA' | Depositor | Borrower
/** The holders of an ElGamal private key in the kit. */
export type KeyHolder = 'brokerA' | Borrower | 'mptAuditor' | 'loanAuditor'
/** Whose eyes a snapshot is rendered through. `outsider` and the depositors hold no key. */
export type Viewer = 'outsider' | Signer
/** The closed-ended vault's phase, decided by the latest validated ledger's close time. */
export type Phase = 'subscription' | 'investment' | 'redemption'
/** A moment in Unix milliseconds, ready for `new Date(time)`. */
export type Time = number

/** The amounts the forms prefill. */
export const DEMO_AMOUNTS = Object.freeze({
  deposit: 150_000n,
  draw: 200_000n,
})

/** An amount everyone can read. Assignable to `Shown`. */
export type Public = { readonly visibility: 'public'; readonly value: bigint }

/** Something the demo can do. Each submits one transaction, except the offer sign and withdraw. */
export type Action =
  | { readonly type: 'VaultDeposit'; readonly depositor: Depositor; readonly amount: bigint }
  /** Moves a public amount from the vault into the Lending Balance inbox. */
  | { readonly type: 'LoanBrokerDraw'; readonly amount: bigint }
  /** Moves the Lending Balance inbox into its spending balance. */
  | { readonly type: 'LoanBrokerMergeInbox' }
  /**
   * The Broker builds the proof and signs a `LoanSet` to `borrower`. Nothing is submitted: the
   * offer waits in memory, in `Snapshot.offer`, for the borrower. A reload loses it.
   */
  | { readonly type: 'LoanSetSign'; readonly borrower: Borrower; readonly terms: LoanTerms }
  /** The borrower co-signs the held offer and submits it. */
  | { readonly type: 'LoanSetCosign'; readonly borrower: Borrower }
  /** The Broker drops the held offer. Nothing is submitted. */
  | { readonly type: 'LoanSetWithdraw' }
  | { readonly type: 'ConfidentialMPTMergeInbox'; readonly borrower: Borrower }
  /**
   * Pays a loan from the borrower's spending balance: the periodic payment, or exactly the amount
   * owed, both decrypted with the borrower's key.
   */
  | {
      readonly type: 'ConfidentialLoanPay'
      readonly loanID: string
      readonly mode: 'installment' | 'full'
    }
  /** Settles the whole Lending Balance spending to the vault. */
  | { readonly type: 'LoanBrokerSettle' }
  | {
      readonly type: 'LoanManage'
      readonly loanID: string
      readonly flag: 'impair' | 'default'
    }
  /** Redeems all of the depositor's shares. */
  | { readonly type: 'VaultWithdraw'; readonly depositor: Depositor }

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
  /** Counts the LoanBroker's loans from 1. */
  readonly loanSequence: number
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
  readonly borrower: Borrower
  readonly terms: LoanTerms
  readonly signedAt: Time
  /**
   * The Broker has submitted another transaction since signing, or the offer's last ledger has
   * passed: the ledger would reject it.
   */
  readonly stale: boolean
}

export interface DepositorView {
  /** Public balance of the vault asset. */
  readonly wallet: Public
  readonly shares: bigint
  /** What the shares redeem for now: their part of `AssetsTotal` less `LossUnrealized`. */
  readonly value: Public
}

/** Everything the tabs render, read from one validated ledger and seen by one viewer. */
export interface Snapshot {
  readonly viewer: Viewer
  /** Each demo account's classic address. */
  readonly addresses: Readonly<Record<Signer, string>>
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
  /** Undefined until Initialize creates it. */
  readonly broker: BrokerView | undefined
  /** The LoanBroker's loans, oldest first. */
  readonly loans: readonly LoanView[]
  readonly offer: LoanOffer | undefined
  readonly depositors: Readonly<Record<Depositor, DepositorView>>
  readonly borrowers: Readonly<Record<Borrower, ConfidentialBalance>>
  /** The action in flight, if any. Only one runs at a time. */
  readonly submitting: Action | undefined
  /** Problems to show: a failed refresh, or an amount that failed to decrypt (shown redacted). */
  readonly errors: readonly string[]
}

/** Whether an action can run now, and if not, why. */
export type Gate =
  | { readonly open: true }
  /** Opens by ledger time: the tabs show "Opens at HH:MM:SS". */
  | { readonly open: false; readonly reason: 'opens'; readonly at: Time }
  /** The ledger would reject it with `code`. */
  | { readonly open: false; readonly reason: 'closed'; readonly code: string }
  /** Something else must happen first; `why` says what, as a sentence. */
  | { readonly open: false; readonly reason: 'blocked'; readonly why: string }
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
   * @returns The validated transaction's hash; undefined for the actions that submit nothing.
   * @throws {ActionFailed} With the engine code or the reason nothing was submitted.
   */
  act(action: Action): Promise<string | undefined>
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
function blocked(why: string): Gate {
  return { open: false, reason: 'blocked', why }
}
const DONE: Gate = Object.freeze({ open: false, reason: 'done' })
const NO_BROKER = 'The vault has no LoanBroker: clear data and initialize again'

const SECOND = 1000
/** XLS-66 closed-ended gate: the final payment must precede RedemptionDate by this much. */
const LOAN_REDEMPTION_BUFFER_MS = 60 * SECOND

function amountGate(amount: bigint, limit: bigint): Gate | undefined {
  if (amount <= 0n) return closed('temBAD_AMOUNT')
  if (amount > limit) return closed('tecINSUFFICIENT_FUNDS')
  return undefined
}

function drawGate(s: Snapshot, amount: bigint): Gate {
  if (s.broker === undefined) return blocked(NO_BROKER)
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

/** The ledger's phase and schedule rules for a LoanSet with `terms` submitted now. */
function termsGate(s: Snapshot, terms: LoanTerms): Gate {
  try {
    validateLoanTerms(terms)
  } catch (error) {
    return blocked(error instanceof Error ? error.message : String(error))
  }
  if (s.phase === 'subscription') return opens(s.vault.subscriptionDate + SECOND)
  if (s.phase === 'redemption') return closed('tecEXPIRED')
  const finalPayment = s.now + terms.paymentInterval * terms.paymentTotal * SECOND
  if (finalPayment + LOAN_REDEMPTION_BUFFER_MS > s.vault.redemptionDate) {
    return closed('tecNO_PERMISSION')
  }
  return open()
}

function signGate(s: Snapshot, terms: LoanTerms): Gate {
  if (s.broker === undefined) return blocked(NO_BROKER)
  if (s.offer !== undefined && !s.offer.stale) {
    return blocked('An offer is waiting for its co-signature')
  }
  if (s.broker.debtTotal.value === 0n) return blocked('Draw into the Lending Balance first')
  return termsGate(s, terms)
}

function cosignGate(s: Snapshot, borrower: Borrower): Gate {
  const { offer } = s
  if (offer === undefined || offer.borrower !== borrower) return blocked('No offer to co-sign')
  if (offer.stale) return blocked('The offer expired: the Broker must sign it again')
  return termsGate(s, offer.terms)
}

function payGate(loan: LoanView, mode: 'installment' | 'full'): Gate {
  if (loan.status === 'repaid') return DONE
  if (loan.status === 'defaulted') return closed('tecNO_PERMISSION')
  if (mode === 'installment' && loan.paymentRemaining <= 1) {
    return blocked('Only the final payment is left: pay in full')
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

function depositGate(s: Snapshot, depositor: Depositor, amount: bigint): Gate {
  const { wallet } = s.depositors[depositor]
  if (s.phase !== 'subscription') return closed('tecEXPIRED')
  if (wallet.value === 0n) return blocked('The wallet is empty')
  return amountGate(amount, wallet.value) ?? open()
}

function withdrawGate(s: Snapshot, depositor: Depositor): Gate {
  if (s.depositors[depositor].shares === 0n) return blocked('No shares to redeem')
  if (s.phase === 'investment') return opens(s.vault.redemptionDate)
  return open()
}

function loanGate(s: Snapshot, loanID: string, check: (loan: LoanView) => Gate): Gate {
  const loan = s.loans.find((l) => l.loanID === loanID)
  return loan === undefined ? blocked('No such loan') : check(loan)
}

/**
 * Decides from a snapshot whether an action can run, with the ledger's own phase, time and limit
 * rules (rippled `getVaultPhase`, `LoanSet`, `LoanBrokerDraw`, `LoanManage`). The tabs enable
 * buttons from it. It does not check what only a decrypt could tell, such as whether a balance
 * covers a payment: the builder checks that, and `act` rejects with `buildFailed`.
 *
 * @param s - Any viewer's snapshot.
 * @param action - The action to check.
 * @returns Open, or the reason it is not.
 */
export function gate(s: Snapshot, action: Action): Gate {
  switch (action.type) {
    case 'VaultDeposit':
      return depositGate(s, action.depositor, action.amount)
    case 'LoanBrokerDraw':
      return drawGate(s, action.amount)
    case 'LoanBrokerMergeInbox':
    case 'LoanBrokerSettle':
      return s.broker === undefined ? blocked(NO_BROKER) : open()
    case 'LoanSetSign':
      return signGate(s, action.terms)
    case 'LoanSetCosign':
      return cosignGate(s, action.borrower)
    case 'LoanSetWithdraw':
      return s.offer === undefined ? blocked('No offer to withdraw') : open()
    case 'ConfidentialMPTMergeInbox':
      return open()
    case 'ConfidentialLoanPay':
      return loanGate(s, action.loanID, (loan) => payGate(loan, action.mode))
    case 'LoanManage':
      return loanGate(s, action.loanID, (loan) => manageGate(s, loan, action.flag))
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
 * @param kit - Accounts, keys and ledger IDs: `kitOf` a deployment.
 * @param ledger - The connection from `connectLedger`.
 * @returns The demo, with its first snapshot ready.
 * @throws When the first read fails, for example because the kit's vault does not exist.
 */
export async function openDemo(kit: Kit, ledger: Ledger): Promise<Demo> {
  const { client } = ledger
  const display = createAmountDisplay(decryptCiphertext)
  const offer: OfferSlot = { current: undefined }
  let state: LedgerState = await readLedgerState(client, kit)
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
      state = await readLedgerState(client, kit)
      errors = []
    } catch (error) {
      errors = [`Could not read the ledger: ${describe(error)}`]
    }
    changed()
  })
  const stopFollowing = ledger.onLedgerClosed(() => void refresh())
  const actions = createActions({ client, kit, display, offer, state: () => state })

  return {
    snapshot(viewer) {
      const cached = snapshots.get(viewer)
      if (cached?.version === version) return cached.snapshot
      const view = { state, offer: offer.current, submitting, errors, kit, display }
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
        return await actions.perform(action)
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
