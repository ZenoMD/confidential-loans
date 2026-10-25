import type { Client, LedgerEntry, TransactionMetadata } from 'xrpl'

import { rippledErrorCode } from './accounts.ts'
import type { Borrower, Depositor, LoanLabel, Signer } from './demo-ledger.ts'
import type { Kit } from './kit.ts'

const BORROWERS = ['borrowerA', 'borrowerB'] as const satisfies readonly Borrower[]
const DEPOSITORS = ['depositorA', 'depositorB'] as const satisfies readonly Depositor[]
const SIGNERS = ['brokerA', ...DEPOSITORS, ...BORROWERS] as const satisfies readonly Signer[]
const LOAN_OF: Readonly<Record<Borrower, LoanLabel>> = { borrowerA: 'A', borrowerB: 'B' }

type WithIndex<T> = T & { readonly index: string }

/** The raw ledger entries the demo renders, all read at one validated ledger. */
export interface LedgerState {
  readonly ledgerIndex: number
  /** Ripple Epoch seconds. */
  readonly closeTime: number
  readonly issuance: LedgerEntry.MPTokenIssuance
  readonly vault: LedgerEntry.Vault
  readonly shareIssuance: LedgerEntry.MPTokenIssuance
  /** The kit vault's LoanBroker owned by brokerA, with its pseudo-account's MPToken. */
  readonly broker:
    | {
        readonly entry: WithIndex<LedgerEntry.LoanBroker>
        readonly lendingBalance: LedgerEntry.MPToken | undefined
      }
    | undefined
  /** Each borrower's newest Loan from that LoanBroker. */
  readonly loans: Readonly<Partial<Record<LoanLabel, WithIndex<LedgerEntry.Loan>>>>
  /** Each signer's MPToken for the vault asset; undefined when it has not authorized it. */
  readonly assetTokens: Readonly<Record<Signer, LedgerEntry.MPToken | undefined>>
  /** Each depositor's MPToken for the vault shares. */
  readonly shareTokens: Readonly<Record<Depositor, LedgerEntry.MPToken | undefined>>
}

async function entry<T>(client: Client, request: object, ledgerIndex: number): Promise<T> {
  const { result } = await client.request({
    command: 'ledger_entry',
    ledger_index: ledgerIndex,
    ...request,
  } as never)
  return (result as { node: T }).node
}

async function maybeEntry<T>(
  client: Client,
  request: object,
  ledgerIndex: number,
): Promise<T | undefined> {
  try {
    return await entry<T>(client, request, ledgerIndex)
  } catch (error) {
    if (rippledErrorCode(error) === 'entryNotFound') return undefined
    throw error
  }
}

async function ownedObjects<T>(
  client: Client,
  account: string,
  type: 'loan' | 'loan_broker',
  ledgerIndex: number,
): Promise<Array<WithIndex<T>>> {
  const found: Array<WithIndex<T>> = []
  let marker: unknown
  do {
    const { result } = await client.request({
      command: 'account_objects',
      account,
      type,
      ledger_index: ledgerIndex,
      ...(marker === undefined ? {} : { marker }),
    })
    found.push(...(result.account_objects as unknown as Array<WithIndex<T>>))
    marker = result.marker
  } while (marker !== undefined)
  return found
}

async function readBroker(
  client: Client,
  kit: Kit,
  ledgerIndex: number,
): Promise<LedgerState['broker']> {
  const brokers = await ownedObjects<LedgerEntry.LoanBroker>(
    client,
    kit.accounts.brokerA.address,
    'loan_broker',
    ledgerIndex,
  )
  const broker = brokers.find((b) => b.VaultID === kit.vaultID)
  if (broker === undefined) return undefined
  const lendingBalance = await maybeEntry<LedgerEntry.MPToken>(
    client,
    { mptoken: { mpt_issuance_id: kit.mptIssuanceID, account: broker.Account } },
    ledgerIndex,
  )
  return { entry: broker, lendingBalance }
}

async function readLoans(
  client: Client,
  kit: Kit,
  loanBrokerID: string | undefined,
  ledgerIndex: number,
): Promise<LedgerState['loans']> {
  if (loanBrokerID === undefined) return {}
  const loans: Partial<Record<LoanLabel, WithIndex<LedgerEntry.Loan>>> = {}
  await Promise.all(
    BORROWERS.map(async (borrower) => {
      const owned = await ownedObjects<LedgerEntry.Loan>(
        client,
        kit.accounts[borrower].address,
        'loan',
        ledgerIndex,
      )
      const ours = owned.filter((loan) => loan.LoanBrokerID === loanBrokerID)
      const newest = ours.sort((a, b) => b.LoanSequence - a.LoanSequence)[0]
      if (newest !== undefined) loans[LOAN_OF[borrower]] = newest
    }),
  )
  return loans
}

function tokensOf<R extends string>(
  roles: readonly R[],
  read: (role: R) => Promise<LedgerEntry.MPToken | undefined>,
): Promise<Record<R, LedgerEntry.MPToken | undefined>> {
  return Promise.all(roles.map(async (role) => [role, await read(role)] as const)).then(
    (pairs) => Object.fromEntries(pairs) as Record<R, LedgerEntry.MPToken | undefined>,
  )
}

/**
 * Reads every entry the demo renders from the latest validated ledger, all at that one ledger so
 * the decrypt bound matches the ciphertexts.
 *
 * @param client - Connected client.
 * @param kit - The demo kit.
 * @returns The state.
 * @throws When the kit's issuance or vault does not exist, or a request fails.
 */
export async function readLedgerState(client: Client, kit: Kit): Promise<LedgerState> {
  const { result } = await client.request({ command: 'ledger', ledger_index: 'validated' })
  const ledgerIndex = result.ledger_index
  const [issuance, vault, broker] = await Promise.all([
    entry<LedgerEntry.MPTokenIssuance>(client, { mpt_issuance: kit.mptIssuanceID }, ledgerIndex),
    entry<LedgerEntry.Vault>(client, { index: kit.vaultID }, ledgerIndex),
    readBroker(client, kit, ledgerIndex),
  ])
  const token = (issuanceID: string, account: string) =>
    maybeEntry<LedgerEntry.MPToken>(
      client,
      { mptoken: { mpt_issuance_id: issuanceID, account } },
      ledgerIndex,
    )
  const [shareIssuance, loans, assetTokens, shareTokens] = await Promise.all([
    entry<LedgerEntry.MPTokenIssuance>(client, { mpt_issuance: vault.ShareMPTID }, ledgerIndex),
    readLoans(client, kit, broker?.entry.index, ledgerIndex),
    tokensOf(SIGNERS, (role) => token(kit.mptIssuanceID, kit.accounts[role].address)),
    tokensOf(DEPOSITORS, (role) => token(vault.ShareMPTID, kit.accounts[role].address)),
  ])
  return {
    ledgerIndex,
    closeTime: result.ledger.close_time,
    issuance,
    vault,
    shareIssuance,
    broker,
    loans,
    assetTokens,
    shareTokens,
  }
}

/** A validated transaction of a demo account. */
export interface LoggedTx {
  readonly hash: string
  readonly ledgerIndex: number
  /** Ripple Epoch seconds. */
  readonly closeTime: number
  readonly tx: Readonly<Record<string, unknown>> & { readonly TransactionType: string }
  readonly meta: TransactionMetadata
}

interface AccountTxEntry {
  hash?: string
  ledger_index?: number
  tx_json?: LoggedTx['tx'] & { date?: number }
  meta?: TransactionMetadata | string
}

/**
 * Every validated transaction of the five demo accounts, fetched incrementally with
 * `account_tx`. The node keeps a few hours of history, which covers a demo run.
 */
export class TxLog {
  private readonly accounts: readonly string[]
  private readonly byHash = new Map<string, LoggedTx>()
  private fetchedThrough = -1
  private sorted: readonly LoggedTx[] = []

  constructor(kit: Kit) {
    this.accounts = SIGNERS.map((role) => kit.accounts[role].address)
  }

  /** Adds every transaction validated up to `ledgerIndex` that is not yet in the log. */
  async fetch(client: Client, ledgerIndex: number): Promise<void> {
    if (ledgerIndex <= this.fetchedThrough) return
    // -1 asks for the earliest ledger the node holds.
    const from = this.fetchedThrough < 0 ? -1 : this.fetchedThrough + 1
    const pages = await Promise.all(
      this.accounts.map((account) => this.fetchAccount(client, account, from, ledgerIndex)),
    )
    for (const tx of pages.flat()) this.byHash.set(tx.hash, tx)
    this.fetchedThrough = ledgerIndex
    this.sorted = [...this.byHash.values()].sort(
      (a, b) => a.ledgerIndex - b.ledgerIndex || a.meta.TransactionIndex - b.meta.TransactionIndex,
    )
  }

  /** The transactions in ledger order. */
  entries(): readonly LoggedTx[] {
    return this.sorted
  }

  private async fetchAccount(
    client: Client,
    account: string,
    from: number,
    through: number,
  ): Promise<LoggedTx[]> {
    const found: LoggedTx[] = []
    let marker: unknown
    do {
      const { result } = await client.request({
        command: 'account_tx',
        account,
        ledger_index_min: from,
        ledger_index_max: through,
        forward: true,
        ...(marker === undefined ? {} : { marker }),
      })
      for (const item of result.transactions as AccountTxEntry[]) {
        const { hash, ledger_index: index, tx_json: tx, meta } = item
        if (hash === undefined || index === undefined || tx === undefined) continue
        if (meta === undefined || typeof meta === 'string') continue
        found.push({ hash, ledgerIndex: index, closeTime: tx.date ?? 0, tx, meta })
      }
      marker = result.marker
    } while (marker !== undefined)
    return found
  }
}
