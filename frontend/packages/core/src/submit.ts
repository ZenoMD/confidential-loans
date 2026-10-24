import { decode } from 'xrpl'
import type { Client, SubmittableTransaction, TxResponse, Wallet } from 'xrpl'

import { txLink } from './network.ts'

const POLL_MS = 1000
const NEVER_APPLIES = ['tem', 'tef', 'tel']

export interface Submitted {
  hash: string
  response: TxResponse
}

export class TxFailed extends Error {
  readonly transactionType: string
  readonly code: string
  readonly hash: string

  constructor(transactionType: string, code: string, hash: string) {
    super(`${transactionType} failed with ${code}: ${txLink(hash)}`)
    this.transactionType = transactionType
    this.code = code
    this.hash = hash
  }
}

function resultCode(response: TxResponse): string {
  const { meta } = response.result
  if (meta === undefined || typeof meta === 'string') {
    throw new Error(`No metadata for ${response.result.hash}; look it up by hash before retrying`)
  }
  return meta.TransactionResult
}

async function waitValidated(
  client: Client,
  hash: string,
  lastLedger: number,
): Promise<TxResponse> {
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    const found = await client.request({ command: 'tx', transaction: hash }).catch(() => undefined)
    if (found?.result.validated === true) return found
    if ((await client.getLedgerIndex()) > lastLedger) {
      throw new Error(`${hash} expired: LastLedgerSequence ${lastLedger} passed without validation`)
    }
  }
}

/**
 * Autofills, signs and submits a transaction, then waits for a validated result.
 *
 * The preliminary result is not final: `tem`/`tef`/`tel` codes never reach a ledger and fail at
 * once; anything else waits until the transaction validates or `LastLedgerSequence` passes.
 *
 * @param client - Connected client.
 * @param tx - Transaction to send. A `Sequence` already set is kept, which proofs rely on.
 * @param wallet - Signing wallet.
 * @returns The hash and validated response.
 * @throws {TxFailed} When the final result is not `tesSUCCESS`.
 */
export async function submit(
  client: Client,
  tx: SubmittableTransaction,
  wallet: Wallet,
): Promise<Submitted> {
  const signed = wallet.sign(await client.autofill(tx))
  const lastLedger = decode(signed.tx_blob)['LastLedgerSequence']
  if (typeof lastLedger !== 'number')
    throw new Error('Signed transaction has no LastLedgerSequence')
  const prelim = await client.request({ command: 'submit', tx_blob: signed.tx_blob })
  const engine = prelim.result.engine_result
  if (NEVER_APPLIES.some((prefix) => engine.startsWith(prefix))) {
    throw new TxFailed(tx.TransactionType, engine, signed.hash)
  }
  const response = await waitValidated(client, signed.hash, lastLedger)
  const code = resultCode(response)
  if (code !== 'tesSUCCESS') throw new TxFailed(tx.TransactionType, code, signed.hash)
  return { hash: signed.hash, response }
}
