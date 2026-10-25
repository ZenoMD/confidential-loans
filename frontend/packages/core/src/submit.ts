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
  /** The transaction as the validated ledger holds it, when a ledger holds the failure. */
  readonly tx: Transaction | undefined
  readonly meta: TransactionMetadata | undefined

  constructor(
    transactionType: string,
    code: string,
    hash?: string,
    validated?: Omit<Submitted, 'hash'>,
  ) {
    const failed = `${transactionType} failed with ${code}`
    super(hash === undefined ? failed : `${failed}: ${txLink(hash)}`)
    this.transactionType = transactionType
    this.code = code
    this.hash = hash
    this.tx = validated?.tx
    this.meta = validated?.meta
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

interface NodeLedgers {
  validated: number
  /** rippled's `complete_ledgers`, such as `515-863` or `1-9,12-40`. */
  complete: string
}

async function readNodeLedgers(client: Client): Promise<NodeLedgers> {
  const { info } = (await client.request({ command: 'server_info' })).result
  const validated = info.validated_ledger?.seq
  if (validated === undefined) throw new Error('The node has no validated ledger yet')
  return { validated, complete: info.complete_ledgers }
}

/** True when one span of `complete` holds every ledger from `first` to `last`. */
function holdsAll(complete: string, first: number, last: number): boolean {
  return complete.split(',').some((span) => {
    const [low, high] = span.split('-').map(Number)
    return low !== undefined && low <= first && last <= (high ?? low)
  })
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

/** Ledgers the transaction can apply in: from the one validated before submit to its last. */
interface Window {
  first: number
  last: number
}

type Poll =
  | { kind: 'found'; response: TxResponse }
  | { kind: 'pending' }
  | { kind: 'expired' }
  | { kind: 'failed'; error: unknown }

/**
 * Reads the node's ledgers, then looks the transaction up. In that order, a transaction absent
 * once its last ledger is validated can never apply; the reverse order could miss one that made
 * the last ledger in between. Absence proves expiry only when the node holds the whole window:
 * a node that restarted, or lost history, can miss a transaction that applied.
 */
async function poll(client: Client, hash: string, window: Window): Promise<Poll> {
  try {
    const { validated, complete } = await readNodeLedgers(client)
    const found = await findValidated(client, hash)
    if (found !== undefined) return { kind: 'found', response: found }
    if (validated < window.last) return { kind: 'pending' }
    if (holdsAll(complete, window.first, window.last)) return { kind: 'expired' }
    const { first, last } = window
    const error = new Error(`The node is missing ledgers ${first} to ${last}; it holds ${complete}`)
    return { kind: 'failed', error }
  } catch (error) {
    return { kind: 'failed', error }
  }
}

/**
 * Polls until the transaction validates or a lookup finds its last ledger validated without it.
 * A failed lookup proves nothing, so failures only count towards giving up.
 */
async function waitValidated(client: Client, hash: string, window: Window): Promise<TxResponse> {
  let lastError: unknown
  let failedPolls = 0
  for (;;) {
    await sleep(POLL_MS)
    const result = await poll(client, hash, window)
    switch (result.kind) {
      case 'found':
        return result.response
      case 'expired': {
        const last = lastError === undefined ? '' : `; last poll error: ${describe(lastError)}`
        throw new Error(
          `${hash} expired: LastLedgerSequence ${window.last} validated without it${last}`,
          { cause: lastError },
        )
      }
      case 'pending':
        failedPolls = 0
        break
      case 'failed':
        lastError = result.error
        failedPolls += 1
        if (failedPolls >= MAX_FAILED_POLLS) {
          const reason = describe(result.error)
          throw new Error(
            `Could not confirm ${hash}: ${reason}; look it up by hash before retrying`,
            { cause: result.error },
          )
        }
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
 * @throws {TxFailed} When the final result is not `tesSUCCESS`. A `tec` failure carries its hash
 *   and the validated transaction and metadata; a `tem`/`tef`/`tel` failure has neither.
 */
export async function submit(
  client: Client,
  tx: SubmittableTransaction,
  wallet: Wallet,
): Promise<Submitted> {
  return submitSigned(client, wallet.sign(await client.autofill(tx)))
}

/**
 * Submits a transaction that is already signed, such as a co-signed `LoanSet`, then waits for a
 * validated result as `submit` does.
 *
 * @param client - Connected client.
 * @param signed - The signed blob and its hash. The blob must carry `LastLedgerSequence`.
 * @returns The hash, the validated transaction and its metadata.
 * @throws As `submit`.
 */
export async function submitSigned(
  client: Client,
  signed: { readonly tx_blob: string; readonly hash: string },
): Promise<Submitted> {
  const decoded = decode(signed.tx_blob)
  const lastLedger = decoded['LastLedgerSequence']
  if (typeof lastLedger !== 'number')
    throw new Error('Signed transaction has no LastLedgerSequence')
  const transactionType = String(decoded['TransactionType'])
  const { validated: first } = await readNodeLedgers(client)
  const prelim = await client.request({ command: 'submit', tx_blob: signed.tx_blob })
  const engine = prelim.result.engine_result
  if (NEVER_APPLIES.some((prefix) => engine.startsWith(prefix))) {
    throw new TxFailed(transactionType, engine)
  }
  const response = await waitValidated(client, signed.hash, { first, last: lastLedger })
  const validated = { tx: response.result.tx_json, meta: metadata(response) }
  const code = validated.meta.TransactionResult
  if (code !== 'tesSUCCESS') throw new TxFailed(transactionType, code, signed.hash, validated)
  return { hash: signed.hash, ...validated }
}
