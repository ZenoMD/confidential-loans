import { createRequire } from 'node:module'

import { encode } from 'xrpl'
import type { Client, SubmittableTransaction } from 'xrpl'

// Both Ledger packages are CommonJS with a default export; load them through require.
const require = createRequire(import.meta.url)
const TransportNodeHid = require('@ledgerhq/hw-transport-node-hid').default as {
  create(openTimeout?: number, listenTimeout?: number): Promise<LedgerTransport>
}
const Xrp = require('@ledgerhq/hw-app-xrp').default as new (transport: LedgerTransport) => XrpApp

export const PATH = "44'/144'/0'/0/0"
const SIGN_TIMEOUT_MS = 300_000
// autofill sets LastLedgerSequence about 20 ledgers (~1 minute) ahead, shorter than a careful
// on-device review. Hardware signing needs a wider window.
export const LEDGER_EXPIRY_LEDGERS = 200

/**
 * Autofills a transaction with an expiry window long enough for on-device review.
 *
 * @param client - Connected client.
 * @param tx - Transaction from the Ledger account.
 * @returns The autofilled transaction with `LastLedgerSequence` about 200 ledgers ahead.
 */
export async function autofillForLedger<T extends SubmittableTransaction>(
  client: Client,
  tx: T,
): Promise<T> {
  const filled = await client.autofill(tx)
  filled.LastLedgerSequence = (await client.getLedgerIndex()) + LEDGER_EXPIRY_LEDGERS
  return filled
}

interface LedgerTransport {
  send(cla: number, ins: number, p1: number, p2: number): Promise<Buffer>
  close(): Promise<void>
}

interface XrpApp {
  getAddress(path: string): Promise<{ publicKey: string; address: string }>
  getAppConfiguration(): Promise<{ version: string }>
  signTransaction(path: string, rawTxHex: string): Promise<string>
}

export interface LedgerSession {
  xrp: XrpApp
  transport: LedgerTransport
  address: string
  publicKey: string
}

/**
 * Opens the first Ledger over USB HID and reads the address at the default path.
 *
 * @returns Session with the XRP app client, address and public key.
 * @throws When no device is found or the XRP app is not open.
 */
export async function openLedger(): Promise<LedgerSession> {
  const transport = await TransportNodeHid.create(5000, 5000)
  const xrp = new Xrp(transport)
  const { address, publicKey } = await xrp.getAddress(PATH)
  return { xrp, transport, address, publicKey: publicKey.toUpperCase() }
}

/**
 * Reads the name and version of the app running on the device (works on the dashboard too).
 *
 * @param transport - Open transport.
 * @returns App name and version, e.g. `XRP 2.8.2` or `BOLOS 1.7.0`.
 */
export async function runningApp(transport: LedgerTransport): Promise<string> {
  const response = await transport.send(0xb0, 0x01, 0x00, 0x00)
  let i = 1
  const nameLength = response[i++] ?? 0
  const name = response.subarray(i, i + nameLength).toString()
  i += nameLength
  const versionLength = response[i++] ?? 0
  return `${name} ${response.subarray(i, i + versionLength).toString()}`
}

/**
 * Asks the device to sign an autofilled transaction; the user reviews and approves on screen.
 *
 * @param session - Open Ledger session.
 * @param tx - Autofilled transaction from the Ledger account.
 * @returns The signed blob and the transaction with `TxnSignature` attached.
 */
export async function ledgerSign(
  session: LedgerSession,
  tx: SubmittableTransaction,
): Promise<{ txBlob: string; signed: SubmittableTransaction }> {
  const unsigned = { ...tx, SigningPubKey: session.publicKey }
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(`no answer on the device within ${SIGN_TIMEOUT_MS} ms`)),
      SIGN_TIMEOUT_MS,
    ).unref()
  })
  const signature = await Promise.race([
    session.xrp.signTransaction(PATH, encode(unsigned)),
    timeout,
  ])
  const signed = { ...unsigned, TxnSignature: signature.toUpperCase() }
  return { txBlob: encode(signed), signed }
}

/**
 * Describes a Ledger error by its APDU status code when there is one.
 *
 * @param error - Error thrown by the transport or app.
 * @returns `0x6985 ...` style text.
 */
export function ledgerError(error: unknown): string {
  const status = (error as { statusCode?: number }).statusCode
  const message = error instanceof Error ? error.message : String(error)
  return status === undefined ? message : `0x${status.toString(16)} ${message}`
}
