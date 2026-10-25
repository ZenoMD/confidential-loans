import { deriveConfidentialKeypair, isValidClassicAddress } from 'xrpl'

import { walletFromSeed } from './accounts.ts'
import type { KeyHolder, Signer } from './demo-ledger.ts'

/** The kit format version this module reads and writes. */
const KIT_VERSION = 1

const SIGNERS = [
  'brokerA',
  'depositorA',
  'depositorB',
  'borrowerA',
  'borrowerB',
] as const satisfies readonly Signer[]
const KEY_HOLDERS = [
  'brokerA',
  'borrowerA',
  'borrowerB',
  'mptAuditor',
  'loanAuditor',
] as const satisfies readonly KeyHolder[]
const FIELDS = new Set(['kit', 'mptIssuanceID', 'vaultID', 'accounts', 'elgamal'])

/**
 * Everything the browser needs to play every role on the devnet: the ledger IDs that setup
 * created, each signer's account, and each ElGamal key. It holds secrets: the app keeps it in
 * `sessionStorage` only, never in the bundle, a `VITE_*` variable or a URL.
 */
export interface Kit {
  /** The confidential MPT issuance the vault holds. */
  readonly mptIssuanceID: string
  /** The closed-ended vault this run lends from. The LoanBroker is created in the app. */
  readonly vaultID: string
  /** Each signer's classic address and the family seed that derives it. */
  readonly accounts: Readonly<Record<Signer, { readonly address: string; readonly seed: string }>>
  /**
   * The family seed of each ElGamal key: the Broker Key (`CONF_SEED_BROKERA`), each borrower's
   * `HolderEncryptionKey`, the issuance's MPT Auditor key (`CONF_SEED_AUDITOR`) and the Loan
   * Auditor key (`CONF_SEED_LOAN_AUDITOR`).
   */
  readonly elgamal: Readonly<Record<KeyHolder, string>>
}

/**
 * Writes a kit as the JSON text `parseKit` reads.
 *
 * @param kit - The kit to write.
 * @returns Pretty-printed JSON with a format version.
 */
export function serializeKit(kit: Kit): string {
  return `${JSON.stringify({ kit: KIT_VERSION, ...kit }, null, 2)}\n`
}

type Json = Record<string, unknown>

function object(value: unknown, path: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid kit: ${path}: expected an object, got ${String(value)}`)
  }
  return value as Json
}

function hexId(value: unknown, path: string, length: number): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9A-F]{${length}}$`, 'i').test(value)) {
    throw new Error(`Invalid kit: ${path}: expected ${length} hex digits, got ${String(value)}`)
  }
  return value.toUpperCase()
}

function familySeed(value: unknown, path: string): string {
  try {
    if (typeof value !== 'string') throw new TypeError('not a string')
    deriveConfidentialKeypair(value)
    return value
  } catch {
    throw new Error(`Invalid kit: ${path}: expected a family seed, got ${String(value)}`)
  }
}

function signerAccount(value: unknown, path: string): { address: string; seed: string } {
  const entry = object(value, path)
  const { address } = entry
  if (typeof address !== 'string' || !isValidClassicAddress(address)) {
    throw new Error(`Invalid kit: ${path}.address: expected a classic address`)
  }
  const seed = familySeed(entry['seed'], `${path}.seed`)
  if (walletFromSeed(seed).address !== address) {
    throw new Error(`Invalid kit: ${path}.seed does not derive ${path}.address`)
  }
  return { address, seed }
}

/**
 * Reads the kit that `scripts/export-kit.ts` prints, checking every field.
 *
 * @param text - The pasted JSON text.
 * @returns The kit.
 * @throws {Error} Naming the first field that is missing or malformed, a seed that does not
 *   derive its address, or a field the format does not have.
 */
export function parseKit(text: string): Kit {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(`The kit is not JSON: ${String(error)}`, { cause: error })
  }
  const json = object(parsed, 'kit')
  for (const key of Object.keys(json)) {
    if (!FIELDS.has(key)) throw new Error(`Unknown kit field ${key}`)
  }
  if (json['kit'] !== KIT_VERSION) {
    throw new Error(`Invalid kit: kit: expected ${KIT_VERSION}, got ${String(json['kit'])}`)
  }
  const accounts = object(json['accounts'], 'accounts')
  const elgamal = object(json['elgamal'], 'elgamal')
  return {
    mptIssuanceID: hexId(json['mptIssuanceID'], 'mptIssuanceID', 48),
    vaultID: hexId(json['vaultID'], 'vaultID', 64),
    accounts: Object.fromEntries(
      SIGNERS.map((role) => [role, signerAccount(accounts[role], `accounts.${role}`)]),
    ) as Kit['accounts'],
    elgamal: Object.fromEntries(
      KEY_HOLDERS.map((holder) => [holder, familySeed(elgamal[holder], `elgamal.${holder}`)]),
    ) as Kit['elgamal'],
  }
}
