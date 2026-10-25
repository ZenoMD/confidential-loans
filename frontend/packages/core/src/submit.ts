import { decode } from 'xrpl'
import type {
  Client,
  SubmittableTransaction,
  Transaction,
  TransactionMetadata,
  TxResponse,
  Wallet,
} from 'xrpl'

import { rippledErrorCode } from './accounts.ts'
import { txLink } from './network.ts'

const POLL_MS = 1000
/** Consecutive failed polls before giving up: 30 s, longer than one xrpl.js request timeout. */
const MAX_FAILED_POLLS = 30
const NEVER_APPLIES = ['tem', 'tef', 'tel']

export interface Submitted {
  hash: string
  /** The transaction as the validated ledger holds it. */
  tx: Transaction
  meta: TransactionMetadata
}

export class TxFailed extends Error {
  readonly transactionType: string
  readonly code: string
  /** Absent when the failure is decided off the ledger, so no transaction exists to link. */
  readonly hash: string | undefined

  constructor(transactionType: string, code: string, hash?: string) {
    const failed = `${transactionType} failed with ${code}`
    super(hash === undefined ? failed : `${failed}: ${txLink(hash)}`)
    this.transactionType = transactionType
    this.code = code
    this.hash = hash
  }
}

function metadata(response: TxResponse): TransactionMetadata {
  const { meta } = response.result
  if (meta === undefined || typeof meta === 'string') {
    throw new Error(`No metadata for ${response.result.hash}; look it up by hash before retrying`)
  }
  return meta
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function validatedLedgerIndex(client: Client): Promise<number> {
  const { result } = await client.request({ command: 'ledger', ledger_index: 'validated' })
  return result.ledger_index
}

/** Returns the transaction once a validated ledger holds it, else undefined. */
async function findValidated(client: Client, hash: string): Promise<TxResponse | undefined> {
  try {
    const found = await client.request({ command: 'tx', transaction: hash })
    return found.result.validated === true ? found : undefined
  } catch (error) {
    if (rippledErrorCode(error) === 'txnNotFound') return undefined
    throw error
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface Poll {
  /** Validated ledger index read before the lookup; undefined when that read failed. */
  validated: number | undefined
  found: TxResponse | undefined
  error: unknown
}

/**
 * Reads the validated index, then looks the transaction up. In that order, a transaction absent
 * once its last ledger is validated can never apply; the reverse order could miss one that made
 * the last ledger in between.
 */
async function poll(client: Client, hash: string): Promise<Poll> {
  let validated: number | undefined
  try {
    validated = await validatedLedgerIndex(client)
    return { validated, found: await findValidated(client, hash), error: undefined }
  } catch (error) {
    return { validated, found: undefined, error }
  }
}

/**
 * Polls until the transaction validates or a lookup finds its last ledger validated without it.
 * A failed lookup proves nothing, so failures only count towards giving up.
 */
async function waitValidated(
  client: Client,
  hash: string,
  lastLedger: number,
): Promise<TxResponse> {
  let lastError: unknown
  let failedPolls = 0
  for (;;) {
    await sleep(POLL_MS)
    const { validated, found, error } = await poll(client, hash)
    if (found !== undefined) return found
    if (error !== undefined) {
      lastError = error
      failedPolls += 1
    } else {
      failedPolls = 0
    }
    if (error === undefined && validated !== undefined && validated >= lastLedger) {
      const last = lastError === undefined ? '' : `; last poll error: ${describe(lastError)}`
      throw new Error(
        `${hash} expired: LastLedgerSequence ${lastLedger} validated without it${last}`,
        { cause: lastError },
      )
    }
    if (failedPolls >= MAX_FAILED_POLLS) {
      throw new Error(
        `Could not confirm ${hash}: ${describe(error)}; look it up by hash before retrying`,
        { cause: error },
      )
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
 * @returns The hash, the validated transaction and its metadata.
 * @throws When the transaction expires, or polls keep failing; the message names the last error.
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
  const meta = metadata(response)
  if (meta.TransactionResult !== 'tesSUCCESS') {
    throw new TxFailed(tx.TransactionType, meta.TransactionResult, signed.hash)
  }
  return { hash: signed.hash, tx: response.result.tx_json, meta }
}
