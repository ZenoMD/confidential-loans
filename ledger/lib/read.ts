import type { Client, TransactionMetadata, TxResponse } from 'xrpl'

import { reconnecting } from '#lib/network'

/**
 * Finds the ID of the ledger entry of `entryType` that a transaction created.
 *
 * @param response - Validated transaction response.
 * @param entryType - Ledger entry type, such as `Vault`, `LoanBroker` or `Loan`.
 * @returns The created entry's index.
 */
export function createdId(response: TxResponse | undefined, entryType: string): string {
  const meta = response?.result.meta as TransactionMetadata | undefined
  for (const node of meta?.AffectedNodes ?? []) {
    if ('CreatedNode' in node && node.CreatedNode.LedgerEntryType === entryType)
      return node.CreatedNode.LedgerIndex
  }
  throw new Error(`Transaction created no ${entryType}`)
}

/**
 * Reads one ledger entry by index from the latest validated ledger.
 *
 * @param client - Connected client.
 * @param index - Ledger entry ID.
 * @returns The entry's fields, or undefined when it no longer exists.
 */
export async function entry(
  client: Client,
  index: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const response = await reconnecting(client, () =>
      client.request({ command: 'ledger_entry', index, ledger_index: 'validated' }),
    )
    return response.result.node as unknown as Record<string, unknown> | undefined
  } catch (error) {
    if ((error as { data?: { error?: string } }).data?.error === 'entryNotFound') return undefined
    throw error
  }
}
