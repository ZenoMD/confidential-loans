import { Client } from 'xrpl'
import type { LedgerStream } from 'xrpl'

export type { Client }

/** Team devnet running the confidential lending fork of rippled. */
export const NETWORK_WSS = 'wss://xrpl-confidential-loans.zeno.md'
export const FAUCET_HOST = 'faucet.xrpl-confidential-loans.zeno.md'
const EXPLORER = 'https://custom.xrpl.org/xrpl-confidential-loans.zeno.md'

export function txLink(hash: string): string {
  return `${EXPLORER}/transactions/${hash}`
}

export function accountLink(address: string): string {
  return `${EXPLORER}/accounts/${address}`
}

/**
 * Connects to the team devnet, runs `fn`, and always disconnects.
 *
 * @param fn - Work to run with a connected client.
 * @returns Whatever `fn` returns.
 */
export async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client(NETWORK_WSS)
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.disconnect()
  }
}

/** xrpl.js's default request timeout. */
const DEFAULT_TIMEOUT_MS = 20_000
const FIRST_RETRY_MS = 1000
const MAX_RETRY_MS = 30_000

/** Receives each validated ledger: its index and close time in seconds since the Ripple Epoch. */
export type LedgerClosedListener = (ledgerIndex: number, closeTime: number) => void

/** One long-lived connection to the team devnet, shared by every caller in a tab. */
export interface Ledger {
  readonly client: Client
  /** Subscribes to validated ledger closes. Returns the unsubscribe function. */
  onLedgerClosed(listener: LedgerClosedListener): () => void
  /** Disconnects for good: no reconnects follow. */
  close(): Promise<void>
}

export interface LedgerOptions {
  /**
   * Milliseconds for the socket to open and subscribe, on connect and on each reconnect; the
   * default client also uses it as its request timeout. Defaults to 20 000.
   */
  timeoutMs?: number
  /** Receives each failed reconnect attempt; another attempt follows. Defaults to console.error. */
  onError?: (error: unknown) => void
  /** Client to drive instead of a new one for `NETWORK_WSS`. */
  client?: Client
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms)
  })
  try {
    return await Promise.race([work, timeout])
  } finally {
    clearTimeout(timer)
  }
}

class Connection implements Ledger {
  readonly client: Client
  private readonly timeoutMs: number
  private readonly onError: (error: unknown) => void
  private readonly listeners = new Set<LedgerClosedListener>()
  private closed = false
  private reconnecting = false

  constructor(client: Client, timeoutMs: number, onError: (error: unknown) => void) {
    this.client = client
    this.timeoutMs = timeoutMs
    this.onError = onError
  }

  open(): Promise<void> {
    return withTimeout(this.connectAndSubscribe(), this.timeoutMs, 'Connecting to the ledger')
  }

  listen(): void {
    this.client.on('ledgerClosed', this.forward)
    this.client.on('disconnected', this.reconnect)
  }

  onLedgerClosed(listener: LedgerClosedListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async close(): Promise<void> {
    this.closed = true
    this.client.off('ledgerClosed', this.forward)
    this.client.off('disconnected', this.reconnect)
    await this.client.disconnect()
  }

  private async connectAndSubscribe(): Promise<void> {
    await this.client.connect()
    await this.client.request({ command: 'subscribe', streams: ['ledger'] })
  }

  private readonly forward = (ledger: LedgerStream): void => {
    for (const listener of this.listeners) listener(ledger.ledger_index, ledger.ledger_time)
  }

  /** Retries with doubling delays until the socket reopens, because the subscription and
   *  xrpl.js's own reconnect do not survive a failed attempt. */
  private readonly reconnect = async (): Promise<void> => {
    if (this.reconnecting) return
    this.reconnecting = true
    for (let wait = FIRST_RETRY_MS; !this.closed; wait = Math.min(wait * 2, MAX_RETRY_MS)) {
      await delay(wait)
      if (this.closed) break
      try {
        await this.open()
        break
      } catch (error) {
        if (!this.closed) this.onError(error)
      }
    }
    this.reconnecting = false
  }
}

/**
 * Opens one long-lived connection to the team devnet and subscribes to validated ledger closes.
 *
 * The devnet socket has gone silent for minutes before closing, so requests time out and a
 * dropped socket reconnects and resubscribes until `close`.
 *
 * @param options - Timeout, reconnect error sink, and the client to drive.
 * @returns The open connection.
 * @throws When the socket does not open and subscribe within the timeout, or either fails.
 */
export async function connectLedger(options: LedgerOptions = {}): Promise<Ledger> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const client = options.client ?? new Client(NETWORK_WSS, { timeout: timeoutMs })
  const onError =
    options.onError ?? ((error: unknown) => console.error('Ledger reconnect failed', error))
  const connection = new Connection(client, timeoutMs, onError)
  try {
    await connection.open()
  } catch (error) {
    await client.disconnect()
    throw error
  }
  connection.listen()
  return connection
}

export interface ServerStatus {
  buildVersion: string
  networkId: number | undefined
  validatedLedger: number | undefined
}

/**
 * Reads `server_info` from the team devnet.
 *
 * @param client - Connected client.
 * @returns The node's build version, network ID, and latest validated ledger index.
 */
export async function readServerStatus(client: Client): Promise<ServerStatus> {
  const { info } = (await client.request({ command: 'server_info' })).result
  return {
    buildVersion: info.build_version,
    networkId: info.network_id,
    validatedLedger: info.validated_ledger?.seq,
  }
}
