import { setTimeout as sleep } from 'node:timers/promises'

import { ConnectionError, decode } from 'xrpl'
import type { Client, SubmittableTransaction, TxResponse, Wallet } from 'xrpl'

import { reconnecting, txLink } from '#lib/network'

const POLL_MS = 1000
const NEVER_APPLIES = ['tem', 'tef', 'tel']
// Answers to a resubmitted blob that mean the first submission may already have applied.
const ALREADY_SEEN = new Set(['tefPAST_SEQ', 'tefALREADY'])

export interface Outcome {
  code: string
  hash: string
  validated: TxResponse | undefined
}

function resultCode(response: TxResponse): string {
  const meta = response.result.meta
  if (meta === undefined || typeof meta === 'string') {
    throw new Error(`No metadata for ${response.result.hash}; look it up by hash before retrying`)
  }
  return meta.TransactionResult
}

function lastLedgerOf(txBlob: string): number {
  const last = decode(txBlob)['LastLedgerSequence']
  if (typeof last !== 'number') throw new Error('Signed transaction has no LastLedgerSequence')
  return last
}

async function waitValidated(
  client: Client,
  hash: string,
  lastLedger: number,
): Promise<TxResponse> {
  for (;;) {
    await sleep(POLL_MS)
    const found = await client.request({ command: 'tx', transaction: hash }).catch(() => undefined)
    if (found?.result.validated === true) return found
    const validatedIndex = await reconnecting(client, () => client.getLedgerIndex())
    if (validatedIndex > lastLedger) {
      throw new Error(
        `${hash} expired: validated ledger ${validatedIndex} > LastLedgerSequence ${lastLedger}`,
      )
    }
  }
}

/**
 * Sends a signed blob once, resending it if the websocket drops mid-request.
 *
 * @returns The preliminary engine result, or `resubmitted` when the result of the resend cannot
 *   tell whether the first send applied; the caller's hash poll decides.
 */
async function submitOnce(client: Client, txBlob: string): Promise<string> {
  const request = { command: 'submit', tx_blob: txBlob } as const
  try {
    return (await client.request(request)).result.engine_result
  } catch (error) {
    if (!(error instanceof ConnectionError)) throw error
    const engine = (await reconnecting(client, () => client.request(request))).result.engine_result
    return ALREADY_SEEN.has(engine) ? 'resubmitted' : engine
  }
}

/**
 * Submits a signed blob and returns its final result code without throwing on failure.
 *
 * `tem`/`tef`/`tel` preliminary results return immediately because they never reach a ledger.
 * Anything else waits for a validated result or for `LastLedgerSequence` to pass.
 *
 * @param client - Connected client.
 * @param txBlob - Signed transaction blob.
 * @param hash - Hash of the signed transaction.
 * @returns The final code, hash, and validated response when there is one.
 */
export async function submitBlob(client: Client, txBlob: string, hash: string): Promise<Outcome> {
  const engine = await submitOnce(client, txBlob)
  if (NEVER_APPLIES.some((prefix) => engine.startsWith(prefix))) {
    return { code: engine, hash, validated: undefined }
  }
  const validated = await waitValidated(client, hash, lastLedgerOf(txBlob))
  return { code: resultCode(validated), hash, validated }
}

/**
 * Prints the outcome and throws unless it is `tesSUCCESS`.
 *
 * @param outcome - Result of a submission.
 * @param label - Short name for the log line.
 * @returns The same outcome.
 */
export function expectSuccess(outcome: Outcome, label: string): Outcome {
  const ok = outcome.code === 'tesSUCCESS'
  const link = outcome.validated === undefined ? '(not applied)' : txLink(outcome.hash)
  console.log(`${ok ? 'ok ' : 'BAD'} ${label}: ${outcome.code} ${link}`)
  if (!ok) throw new Error(`${label} failed with ${outcome.code}: ${txLink(outcome.hash)}`)
  return outcome
}

/**
 * Autofills, signs with a software wallet, submits and requires `tesSUCCESS`.
 *
 * @param client - Connected client.
 * @param tx - Transaction to send.
 * @param wallet - Signing wallet: the account's own key or its regular key.
 * @param label - Short name for the log line.
 * @returns The outcome.
 */
export async function submit(
  client: Client,
  tx: SubmittableTransaction,
  wallet: Wallet,
  label: string,
): Promise<Outcome> {
  const signed = wallet.sign(await client.autofill(tx))
  return expectSuccess(await submitBlob(client, signed.tx_blob, signed.hash), label)
}
