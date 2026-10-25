import type { Client, Wallet } from 'xrpl'

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
 * @param owner - Vault owner (the loan broker's account).
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
 * Creates the loan broker that lends from a vault, with no management fee and no first-loss cover,
 * the terms SPEC.md 4.2 sets for a confidential broker, so depositors carry all losses.
 *
 * The broker is not confidential yet: SPEC.md 6 also needs `tfLoanBrokerConfidential`, a
 * `HolderEncryptionKey` and a `ZKProof` of that key, which this xrpl.js cannot build. Until the
 * protocol fork lands, `LoanBrokerDraw` from this broker fails with `tecNO_PERMISSION`
 * (SPEC.md 7.2).
 *
 * @param client - Connected client.
 * @param owner - The vault owner, who becomes the broker.
 * @param vaultID - Vault to lend from.
 * @param debtMaximum - Most the broker may owe the vault. Drawn funds become confidential supply,
 *   which bounds every decryption, so this cap also bounds balance-read time.
 * @returns The LoanBroker ID and transaction hash.
 */
export async function createLoanBroker(
  client: Client,
  owner: Wallet,
  vaultID: string,
  debtMaximum: bigint,
): Promise<{ loanBrokerID: string; hash: string }> {
  const tx = {
    TransactionType: 'LoanBrokerSet',
    Account: owner.address,
    VaultID: vaultID,
    DebtMaximum: debtMaximum.toString(),
  } as const
  const submitted = await submit(client, tx, owner)
  return { loanBrokerID: createdId(submitted, 'LoanBroker'), hash: submitted.hash }
}
