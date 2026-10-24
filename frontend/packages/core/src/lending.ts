import type { Client, TransactionMetadata, TxResponse, Wallet } from 'xrpl'

import { submit } from './submit.ts'

/** Loan broker terms, in 1/10 basis points (10000 = 10%), as XLS-66 stores them. */
export interface BrokerTerms {
  managementFeeRate: number
  coverRateMinimum: number
  coverRateLiquidation: number
}

function createdId(response: TxResponse, entryType: string): string {
  const meta = response.result.meta as TransactionMetadata
  for (const node of meta.AffectedNodes) {
    if ('CreatedNode' in node && node.CreatedNode.LedgerEntryType === entryType) {
      return node.CreatedNode.LedgerIndex
    }
  }
  throw new Error(`${response.result.hash} created no ${entryType}`)
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
  const { hash, response } = await submit(client, tx, owner)
  return { vaultID: createdId(response, 'Vault'), hash }
}

/**
 * Creates the loan broker that lends from a vault.
 *
 * @param client - Connected client.
 * @param owner - The vault owner, who becomes the broker.
 * @param vaultID - Vault to lend from.
 * @param terms - Management fee and first-loss cover rates.
 * @returns The LoanBroker ID and transaction hash.
 */
export async function createLoanBroker(
  client: Client,
  owner: Wallet,
  vaultID: string,
  terms: BrokerTerms,
): Promise<{ loanBrokerID: string; hash: string }> {
  const tx = {
    TransactionType: 'LoanBrokerSet',
    Account: owner.address,
    VaultID: vaultID,
    ManagementFeeRate: terms.managementFeeRate,
    CoverRateMinimum: terms.coverRateMinimum,
    CoverRateLiquidation: terms.coverRateLiquidation,
  } as const
  const { hash, response } = await submit(client, tx, owner)
  return { loanBrokerID: createdId(response, 'LoanBroker'), hash }
}

/**
 * Deposits first-loss cover: broker funds that absorb losses before depositors do when a loan
 * defaults.
 *
 * @returns The transaction hash.
 */
export async function depositCover(
  client: Client,
  owner: Wallet,
  loanBrokerID: string,
  mptIssuanceID: string,
  amount: bigint,
): Promise<string> {
  const tx = {
    TransactionType: 'LoanBrokerCoverDeposit',
    Account: owner.address,
    LoanBrokerID: loanBrokerID,
    Amount: { mpt_issuance_id: mptIssuanceID, value: amount.toString() },
  } as const
  return (await submit(client, tx, owner)).hash
}
