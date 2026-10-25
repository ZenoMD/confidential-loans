import type { Client, LedgerEntry, Wallet } from 'xrpl'

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
