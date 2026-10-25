import { prepareConfidentialLoanBrokerSet } from 'xrpl'
import type { Client, ConfidentialKeypair, LedgerEntry, Wallet } from 'xrpl'

import { rippledErrorCode } from './accounts.ts'
import { submit } from './submit.ts'
import type { Submitted } from './submit.ts'

function createdId({ hash, meta }: Submitted, entryType: string): string {
  for (const node of meta.AffectedNodes) {
    if ('CreatedNode' in node && node.CreatedNode.LedgerEntryType === entryType) {
      return node.CreatedNode.LedgerIndex
    }
  }
  throw new Error(`${hash} created no ${entryType}`)
}

/**
 * Reads the close time of the latest validated ledger, in seconds since the Ripple Epoch.
 * Vault phases and loan due dates compare against ledger time, not the local clock.
 */
export async function ledgerTime(client: Client): Promise<number> {
  const { result } = await client.request({ command: 'ledger', ledger_index: 'validated' })
  return result.ledger.close_time
}

/**
 * Creates a closed-ended vault for a token. Deposits are accepted until `subscriptionDate`,
 * capital is locked for lending until `redemptionDate`, then depositors withdraw. Both dates are
 * immutable and must be at least 180 seconds apart.
 *
 * @param client - Connected client.
 * @param owner - Vault owner, who later creates the LoanBroker in the app.
 * @param mptIssuanceID - Token the vault holds.
 * @param dates - Phase boundaries in Ripple Epoch seconds.
 * @returns The vault ID and transaction hash.
 */
export async function createClosedVault(
  client: Client,
  owner: Wallet,
  mptIssuanceID: string,
  dates: { subscriptionDate: number; redemptionDate: number },
): Promise<{ vaultID: string; hash: string }> {
  const tx = {
    TransactionType: 'VaultCreate',
    Account: owner.address,
    Asset: { mpt_issuance_id: mptIssuanceID },
    VaultKind: 1,
    SubscriptionDate: dates.subscriptionDate,
    RedemptionDate: dates.redemptionDate,
  } as const
  const submitted = await submit(client, tx, owner)
  return { vaultID: createdId(submitted, 'Vault'), hash: submitted.hash }
}

/**
 * Reads a vault from the latest validated ledger.
 *
 * @param client - Connected client.
 * @param vaultID - Vault to look up.
 * @returns The vault, or undefined when it does not exist.
 */
export async function readVault(
  client: Client,
  vaultID: string,
): Promise<LedgerEntry.Vault | undefined> {
  try {
    const { result } = await client.request({
      command: 'ledger_entry',
      index: vaultID,
      ledger_index: 'validated',
    })
    return result.node as unknown as LedgerEntry.Vault
  } catch (error) {
    if (rippledErrorCode(error) === 'entryNotFound') return undefined
    throw error
  }
}

/** A ledger entry with its ID, as `account_objects` returns it. */
export type WithIndex<T> = T & { readonly index: string }

/**
 * Lists the entries of one type that an account owns, following every page.
 *
 * @param client - Connected client.
 * @param account - Owner.
 * @param type - Entry type, as `account_objects` names it.
 * @param ledgerIndex - Ledger to read; the latest validated one by default.
 */
export async function ownedObjects<T>(
  client: Client,
  account: string,
  type: 'loan' | 'loan_broker',
  ledgerIndex: number | 'validated' = 'validated',
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

/**
 * Finds the LoanBroker an account owns for a vault.
 *
 * @returns The LoanBroker, or undefined when the owner has none for the vault.
 */
export async function findLoanBroker(
  client: Client,
  owner: string,
  vaultID: string,
  ledgerIndex: number | 'validated' = 'validated',
): Promise<WithIndex<LedgerEntry.LoanBroker> | undefined> {
  const brokers = await ownedObjects<LedgerEntry.LoanBroker>(
    client,
    owner,
    'loan_broker',
    ledgerIndex,
  )
  return brokers.find((broker) => broker.VaultID === vaultID)
}

/**
 * Creates a confidential LoanBroker for a vault: its Lending Balance is encrypted under the Broker
 * Key, with the proof that the owner holds that key.
 *
 * @param client - Connected client.
 * @param owner - The vault owner.
 * @param vaultID - Vault to lend from.
 * @param brokerKeypair - The Broker Key.
 * @param debtMaximum - The most the Lending Balance may owe the vault; 0 means no cap.
 * @returns The transaction hash.
 */
export async function createConfidentialLoanBroker(
  client: Client,
  owner: Wallet,
  vaultID: string,
  brokerKeypair: ConfidentialKeypair,
  debtMaximum: bigint,
): Promise<string> {
  const tx = await prepareConfidentialLoanBrokerSet(client, {
    account: owner.address,
    vaultID,
    brokerKeypair,
    debtMaximum: debtMaximum.toString(),
  })
  return (await submit(client, tx, owner)).hash
}
