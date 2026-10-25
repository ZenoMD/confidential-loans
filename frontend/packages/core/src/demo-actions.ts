import {
  prepareConfidentialLoanBrokerSet,
  prepareConfidentialLoanPay,
  prepareConfidentialLoanSet,
  prepareConfidentialMergeInbox,
  prepareLoanBrokerDraw,
  prepareLoanBrokerMergeInbox,
  prepareLoanBrokerSettle,
  signLoanSetByCounterparty,
} from 'xrpl'
import type { Client, ConfidentialKeypair, SubmittableTransaction, Wallet } from 'xrpl'

import { confidentialKeypair, walletFromSeed } from './accounts.ts'
import type { AmountDisplay } from './amount.ts'
import type {
  Action,
  Borrower,
  Depositor,
  KeyHolder,
  LoanLabel,
  Signer,
  Time,
  Viewer,
} from './demo-ledger.ts'
import type { LedgerState } from './demo-state.ts'
import { rippleTime } from './demo-view.ts'
import { validateLoanTerms } from './demo.ts'
import type { LoanTerms } from './demo.ts'
import type { Kit } from './kit.ts'
import { submitSigned, TxFailed } from './submit.ts'

/**
 * Ledgers a broker-signed LoanSet stays submittable, so the borrower has minutes to co-sign. The
 * offer goes stale sooner if the broker submits anything else, which uses its Sequence.
 */
const OFFER_LEDGERS = 150
const TF_LOAN_DEFAULT = 0x0001_0000
const TF_LOAN_IMPAIR = 0x0002_0000
const BORROWER: Readonly<Record<LoanLabel, Borrower>> = { A: 'borrowerA', B: 'borrowerB' }

/** Why an action failed. The screens show `code`. */
export class ActionFailed extends Error {
  /**
   * The engine result (`tecINSUFFICIENT_FUNDS`, `temBAD_AMOUNT`, ...) when the ledger rejected the
   * transaction. Otherwise: `busy` (another action is running), `unavailable` (a prerequisite
   * such as the broker, the loan or the offer is missing), `buildFailed` (the transaction or its
   * proof could not be built or signed, so nothing was submitted) or `unconfirmed` (submitted,
   * but neither validated nor expired as far as the node could tell).
   */
  readonly code: string
  /** The transaction hash, when a ledger holds the failure. */
  readonly hash: string | undefined

  constructor(code: string, message: string, options: { hash?: string; cause?: unknown } = {}) {
    super(`${code}: ${message}`, { cause: options.cause })
    this.name = 'ActionFailed'
    this.code = code
    this.hash = options.hash
  }
}

/** A LoanSet the Broker signed, held until the borrower co-signs it. */
export interface Offer {
  readonly loan: LoanLabel
  readonly terms: LoanTerms
  readonly signedAt: Time
  readonly blob: string
}

export interface ActionContext {
  readonly client: Client
  readonly kit: Kit
  readonly display: AmountDisplay
  readonly offers: Map<LoanLabel, Offer>
  /** The latest ledger read. */
  state(): LedgerState
}

export interface Actions {
  perform(action: Action): Promise<void>
  /** The ElGamal keypairs a viewer holds. */
  keysOf(viewer: Viewer): readonly ConfidentialKeypair[]
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Runs a step before anything is submitted; any failure means nothing reached the ledger. */
async function build<T>(work: () => T | Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof ActionFailed) throw error
    throw new ActionFailed('buildFailed', describe(error), { cause: error })
  }
}

async function submitBlob(client: Client, signed: { tx_blob: string; hash: string }) {
  try {
    await submitSigned(client, signed)
  } catch (error) {
    if (error instanceof TxFailed) {
      const options =
        error.hash === undefined ? { cause: error } : { hash: error.hash, cause: error }
      throw new ActionFailed(error.code, error.message, options)
    }
    throw new ActionFailed('unconfirmed', describe(error), { hash: signed.hash, cause: error })
  }
}

function unavailable(what: string): ActionFailed {
  return new ActionFailed('unavailable', what)
}

/**
 * Runs actions for one kit. Every builder call follows the fork's working order from the
 * end-to-end devnet run: the proof is built at the latest validated ledger, autofill keeps its
 * Sequence, and a LoanSet is signed by the Broker before the borrower co-signs the signed blob.
 */
class ActionRunner implements Actions {
  private readonly context: ActionContext
  private readonly client: Client
  private readonly kit: Kit
  private readonly wallets: Record<Signer, Wallet>
  private readonly keys: Record<KeyHolder, ConfidentialKeypair>
  private readonly broker: Wallet

  constructor(context: ActionContext) {
    this.context = context
    this.client = context.client
    this.kit = context.kit
    this.wallets = Object.fromEntries(
      Object.entries(this.kit.accounts).map(([role, { seed }]) => [role, walletFromSeed(seed)]),
    ) as Record<Signer, Wallet>
    this.keys = Object.fromEntries(
      Object.entries(this.kit.elgamal).map(([holder, seed]) => [holder, confidentialKeypair(seed)]),
    ) as Record<KeyHolder, ConfidentialKeypair>
    this.broker = this.wallets.brokerA
  }

  keysOf(viewer: Viewer): readonly ConfidentialKeypair[] {
    switch (viewer) {
      case 'auditor':
        return [this.keys.mptAuditor, this.keys.loanAuditor]
      case 'brokerA':
      case 'borrowerA':
      case 'borrowerB':
        return [this.keys[viewer]]
      case 'outsider':
      case 'depositorA':
      case 'depositorB':
        return []
    }
  }

  async perform(action: Action): Promise<void> {
    switch (action.type) {
      case 'LoanBrokerSet':
        return this.createBroker(action.debtMaximum)
      case 'VaultDeposit':
        return this.deposit(action.depositor, action.amount)
      case 'LoanBrokerDraw': {
        const params = { ...this.brokerParams(), amount: action.amount }
        return this.send(
          build(() => prepareLoanBrokerDraw(this.client, params)),
          this.broker,
        )
      }
      case 'LoanBrokerMergeInbox': {
        const params = this.brokerParams()
        return this.send(
          build(() => prepareLoanBrokerMergeInbox(this.client, params)),
          this.broker,
        )
      }
      case 'LoanSetSign':
        return this.signLoan(action.loan, action.terms)
      case 'LoanSetCosign':
        return this.cosignLoan(action.loan)
      case 'ConfidentialMPTMergeInbox': {
        const wallet = this.wallets[action.borrower]
        const params = { account: wallet.address, mptIssuanceID: this.kit.mptIssuanceID }
        return this.send(
          build(() => prepareConfidentialMergeInbox(this.client, params)),
          wallet,
        )
      }
      case 'ConfidentialLoanPay':
        return this.payLoan(action.loan)
      case 'LoanBrokerSettle':
        return this.settle()
      case 'LoanManage':
        return this.manage(action.loan, action.flag)
      case 'VaultWithdraw':
        return this.withdraw(action.depositor)
    }
  }

  private async send(
    tx: SubmittableTransaction | Promise<SubmittableTransaction>,
    by: Wallet,
  ): Promise<void> {
    const signed = await build(async () => by.sign(await this.client.autofill(await tx)))
    await submitBlob(this.client, signed)
  }

  private brokerParams(): { account: string; loanBrokerID: string } {
    const found = this.context.state().broker?.entry.index
    if (found === undefined) throw unavailable('No LoanBroker for this vault yet: run step 1')
    return { account: this.broker.address, loanBrokerID: found }
  }

  private loan(loan: LoanLabel): NonNullable<LedgerState['loans']['A']> {
    const entry = this.context.state().loans[loan]
    if (entry === undefined) throw unavailable(`Loan ${loan} does not exist yet`)
    return entry
  }

  /** Decrypts a ciphertext the key reads, through the shared display cache. */
  private async decrypt(
    ciphertext: string | undefined,
    key: ConfidentialKeypair,
    what: string,
  ): Promise<bigint> {
    if (ciphertext === undefined) throw unavailable(`${what} has no ciphertext on the ledger`)
    const bound = BigInt(this.context.state().issuance.ConfidentialOutstandingAmount ?? '0')
    const amount = { kind: 'encrypted', to: { [key.publicKey]: ciphertext }, bound } as const
    const shown = await build(() => this.context.display.reveal(amount, key))
    if (shown.visibility === 'redacted') throw unavailable(`${what} is not readable with that key`)
    return shown.value
  }

  private createBroker(debtMaximum: bigint): Promise<void> {
    const params = {
      account: this.broker.address,
      vaultID: this.kit.vaultID,
      brokerKeypair: this.keys.brokerA,
      debtMaximum: debtMaximum.toString(),
    }
    return this.send(
      build(() => prepareConfidentialLoanBrokerSet(this.client, params)),
      this.broker,
    )
  }

  private deposit(depositor: Depositor, amount: bigint): Promise<void> {
    const wallet = this.wallets[depositor]
    const tx = {
      TransactionType: 'VaultDeposit',
      Account: wallet.address,
      VaultID: this.kit.vaultID,
      Amount: { mpt_issuance_id: this.kit.mptIssuanceID, value: amount.toString() },
    } as const
    return this.send(tx, wallet)
  }

  private async signLoan(loan: LoanLabel, terms: LoanTerms): Promise<void> {
    const { client, broker, keys } = this
    const signed = await build(async () => {
      validateLoanTerms(terms)
      const tx = await prepareConfidentialLoanSet(client, {
        ...this.brokerParams(),
        borrower: this.wallets[BORROWER[loan]].address,
        brokerKeypair: keys.brokerA,
        loanAuditorKey: keys.loanAuditor.publicKey,
        ...terms,
      })
      const filled = await client.autofill(tx)
      filled.LastLedgerSequence = (await client.getLedgerIndex()) + OFFER_LEDGERS
      return broker.sign(filled)
    })
    const signedAt = rippleTime(this.context.state().closeTime)
    this.context.offers.set(loan, { loan, terms, signedAt, blob: signed.tx_blob })
  }

  private async cosignLoan(loan: LoanLabel): Promise<void> {
    const offer = this.context.offers.get(loan)
    if (offer === undefined) throw unavailable(`Loan ${loan} has no broker signature yet`)
    const borrower = this.wallets[BORROWER[loan]]
    const cosigned = await build(() => signLoanSetByCounterparty(borrower, offer.blob))
    this.context.offers.delete(loan)
    await submitBlob(this.client, cosigned)
  }

  private async payLoan(loan: LoanLabel): Promise<void> {
    const entry = this.loan(loan)
    const borrower = BORROWER[loan]
    const key = this.keys[borrower]
    const owed = await this.decrypt(entry.BorrowerEncryptedAmountOwed, key, `Loan ${loan} owed`)
    const params = {
      account: this.wallets[borrower].address,
      loanID: entry.index,
      amount: owed,
      amountOwed: owed,
      fullPayment: true,
      borrowerKeypair: key,
    }
    await this.send(
      build(() => prepareConfidentialLoanPay(this.client, params)),
      this.wallets[borrower],
    )
  }

  private async settle(): Promise<void> {
    const params = this.brokerParams()
    const spending = this.context.state().broker?.lendingBalance?.ConfidentialBalanceSpending
    const amount = await this.decrypt(spending, this.keys.brokerA, 'The Lending Balance')
    if (amount === 0n) throw unavailable('The Lending Balance spending is 0: merge the inbox first')
    const settle = { ...params, amount, brokerKeypair: this.keys.brokerA }
    await this.send(
      build(() => prepareLoanBrokerSettle(this.client, settle)),
      this.broker,
    )
  }

  private manage(loan: LoanLabel, flag: 'impair' | 'default'): Promise<void> {
    const tx = {
      TransactionType: 'LoanManage',
      Account: this.broker.address,
      LoanID: this.loan(loan).index,
      Flags: flag === 'impair' ? TF_LOAN_IMPAIR : TF_LOAN_DEFAULT,
    } as const
    return this.send(tx, this.broker)
  }

  private withdraw(depositor: Depositor): Promise<void> {
    const { vault, shareTokens } = this.context.state()
    const shares = shareTokens[depositor]?.MPTAmount ?? '0'
    if (BigInt(shares) === 0n) throw unavailable(`${depositor} holds no shares`)
    const tx = {
      TransactionType: 'VaultWithdraw',
      Account: this.wallets[depositor].address,
      VaultID: this.kit.vaultID,
      Amount: { mpt_issuance_id: vault.ShareMPTID, value: shares },
    } as const
    return this.send(tx, this.wallets[depositor])
  }
}

/**
 * Creates the action runner for one kit.
 *
 * @param context - Client, kit, display, offer store and the latest state.
 * @returns The runner.
 */
export function createActions(context: ActionContext): Actions {
  return new ActionRunner(context)
}
