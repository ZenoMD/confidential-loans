import assert from 'node:assert/strict'

import {
  Client,
  Wallet,
  type LedgerEntry,
  type SubmittableTransaction,
  type TransactionMetadata,
  type TxResponse,
} from 'xrpl'

/** Team devnet running the confidential lending fork of rippled. */
export const DEVNET_WSS = process.env['DEVNET_WSS'] ?? 'wss://xrpl-confidential-loans.zeno.md'
export const DEVNET_FAUCET =
  process.env['DEVNET_FAUCET'] ?? 'https://faucet.xrpl-confidential-loans.zeno.md/accounts'
export const DEVNET_EXPLORER = 'https://custom.xrpl.org/xrpl-confidential-loans.zeno.md:443'

const POLL_MS = 1_000
const FUND_TIMEOUT_MS = 60_000

/**
 * Connects to the devnet.
 *
 * @returns A connected client.
 */
export async function connect(): Promise<Client> {
  const client = new Client(DEVNET_WSS, { timeout: 60_000 })
  await client.connect()
  return client
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Creates a wallet and funds it from the devnet faucet, waiting until the
 * account exists in a validated ledger.
 *
 * @param client - A connected client.
 * @returns The funded wallet.
 */
export async function fundWallet(client: Client): Promise<Wallet> {
  const wallet = Wallet.generate()
  const response = await fetch(DEVNET_FAUCET, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ destination: wallet.classicAddress }),
  })
  assert.ok(response.ok, `faucet returned ${response.status}`)

  const deadline = Date.now() + FUND_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      await client.request({
        command: 'account_info',
        account: wallet.classicAddress,
        ledger_index: 'validated',
      })
      return wallet
    } catch {
      await sleep(POLL_MS)
    }
  }
  throw new Error(`faucet did not fund ${wallet.classicAddress}`)
}

/**
 * The explorer link for a transaction.
 *
 * @param hash - The transaction hash.
 * @returns The explorer URL.
 */
export function explorerLink(hash: string): string {
  return `${DEVNET_EXPLORER}/transactions/${hash}`
}

/**
 * Reads a validated transaction's result code.
 *
 * @param response - The submitAndWait response.
 * @returns The `TransactionResult`.
 */
function resultOf(response: TxResponse): string {
  const { meta } = response.result
  assert.ok(meta != null && typeof meta !== 'string', 'transaction has metadata')
  return meta.TransactionResult
}

/**
 * Autofills, signs and submits a transaction, waits for validation, and checks
 * its result.
 *
 * @param client - A connected client.
 * @param tx - The transaction. Fields already set (such as a proof-bound
 *   `Sequence`) are kept.
 * @param wallet - The signing wallet.
 * @param expected - The expected result code.
 * @returns The validated transaction.
 */
export async function submit(
  client: Client,
  tx: SubmittableTransaction,
  wallet: Wallet,
  expected = 'tesSUCCESS',
): Promise<TxResponse> {
  const { tx_blob } = wallet.sign(await client.autofill(tx))
  return submitSigned(client, tx_blob, expected)
}

/**
 * Submits a signed transaction, waits for validation, and checks its result.
 *
 * @param client - A connected client.
 * @param txBlob - The signed transaction blob.
 * @param expected - The expected result code.
 * @returns The validated transaction.
 */
export async function submitSigned(
  client: Client,
  txBlob: string,
  expected = 'tesSUCCESS',
): Promise<TxResponse> {
  const response = await client.submitAndWait(txBlob)
  const result = resultOf(response)
  const { hash } = response.result
  console.log(`  ${response.result.tx_json.TransactionType}: ${result} ${explorerLink(hash)}`)
  assert.equal(result, expected)
  return response
}

/**
 * Finds the ledger entry a transaction created.
 *
 * @param response - The validated transaction.
 * @param entryType - The created entry's `LedgerEntryType`.
 * @returns The created entry's index.
 */
export function createdIndex(response: TxResponse, entryType: string): string {
  const meta = response.result.meta as TransactionMetadata
  for (const node of meta.AffectedNodes) {
    if ('CreatedNode' in node && node.CreatedNode.LedgerEntryType === entryType) {
      return node.CreatedNode.LedgerIndex
    }
  }
  throw new Error(`no ${entryType} was created`)
}

/**
 * Reads a validated ledger entry by its index.
 *
 * @param client - A connected client.
 * @param index - The entry's index.
 * @returns The entry.
 */
export async function ledgerEntry<T extends LedgerEntry.LedgerEntry>(
  client: Client,
  index: string,
): Promise<T> {
  const { node } = (
    await client.request({
      command: 'ledger_entry',
      index,
      ledger_index: 'validated',
    })
  ).result
  return node as unknown as T
}

/**
 * The close time of the latest validated ledger, in seconds since the Ripple
 * Epoch — the clock vault phases are measured against.
 *
 * @param client - A connected client.
 * @returns The close time.
 */
export async function ledgerCloseTime(client: Client): Promise<number> {
  const { ledger } = (await client.request({ command: 'ledger', ledger_index: 'validated' })).result
  return ledger.close_time
}

/**
 * Waits until a validated ledger closes after a given time.
 *
 * @param client - A connected client.
 * @param time - Seconds since the Ripple Epoch.
 */
export async function waitForCloseTime(client: Client, time: number): Promise<void> {
  while ((await ledgerCloseTime(client)) <= time) {
    await sleep(POLL_MS)
  }
}
