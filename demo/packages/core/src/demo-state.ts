import type { Client, LedgerEntry } from 'xrpl'

import { rippledErrorCode } from './accounts.ts'
import type { Borrower, Depositor, Signer } from './demo-ledger.ts'
import type { Kit } from './kit.ts'
import { findLoanBroker, ownedObjects } from './lending.ts'
import type { WithIndex } from './lending.ts'

const BORROWERS = ['borrowerA', 'borrowerB'] as const satisfies readonly Borrower[]
const DEPOSITORS = ['depositorA', 'depositorB'] as const satisfies readonly Depositor[]
const SIGNERS = ['brokerA', ...DEPOSITORS, ...BORROWERS] as const satisfies readonly Signer[]

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
  /** Both borrowers' Loans from that LoanBroker, by `LoanSequence`. */
  readonly loans: ReadonlyArray<WithIndex<LedgerEntry.Loan>>
  /** brokerA's next Sequence: a held offer signed with another one can no longer land. */
  readonly brokerSequence: number
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

async function readBroker(
  client: Client,
  kit: Kit,
  ledgerIndex: number,
): Promise<LedgerState['broker']> {
  const broker = await findLoanBroker(
    client,
    kit.accounts.brokerA.address,
    kit.vaultID,
    ledgerIndex,
  )
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
  if (loanBrokerID === undefined) return []
  const owned = await Promise.all(
    BORROWERS.map((borrower) =>
      ownedObjects<LedgerEntry.Loan>(client, kit.accounts[borrower].address, 'loan', ledgerIndex),
    ),
  )
  return owned
    .flat()
    .filter((loan) => loan.LoanBrokerID === loanBrokerID)
    .sort((a, b) => a.LoanSequence - b.LoanSequence)
}

async function readSequence(client: Client, account: string, ledgerIndex: number): Promise<number> {
  const { result } = await client.request({
    command: 'account_info',
    account,
    ledger_index: ledgerIndex,
  })
  return result.account_data.Sequence
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
  const [shareIssuance, loans, brokerSequence, assetTokens, shareTokens] = await Promise.all([
    entry<LedgerEntry.MPTokenIssuance>(client, { mpt_issuance: vault.ShareMPTID }, ledgerIndex),
    readLoans(client, kit, broker?.entry.index, ledgerIndex),
    readSequence(client, kit.accounts.brokerA.address, ledgerIndex),
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
    brokerSequence,
    assetTokens,
    shareTokens,
  }
}
