import { isValidClassicAddress } from 'xrpl'

import { confidentialKeypair, newSeed, walletFromSeed } from './accounts.ts'
import type { KeyHolder, Signer } from './demo-ledger.ts'

/** The format version this module reads and writes. */
const DEPLOYMENT_VERSION = 2

/** The token issuer plus the demo's signers: every account a deployment funds. */
export type Role = 'issuer' | Signer

export const ROLES = [
  'issuer',
  'brokerA',
  'depositorA',
  'depositorB',
  'borrowerA',
  'borrowerB',
] as const satisfies readonly Role[]

/** The ElGamal keys with a seed of their own, not derived from an account's seed. */
export type NamedKey = 'brokerA' | 'mptAuditor' | 'loanAuditor'

const NAMED_KEYS = ['brokerA', 'mptAuditor', 'loanAuditor'] as const satisfies readonly NamedKey[]

/** The closed-ended vault of the current run. Dates are Ripple Epoch seconds. */
export interface RunVault {
  readonly vaultID: string
  readonly subscriptionDate: number
  readonly redemptionDate: number
}

/**
 * What the browser deployed to the devnet: every seed, and the ledger IDs once created. It holds
 * secrets: the app keeps it in `localStorage` only, never in the bundle, a `VITE_*` variable or a
 * URL.
 */
export interface Deployment {
  /** The family seed of each account. The issuer's and each borrower's also derive its ElGamal key. */
  readonly seeds: Readonly<Record<Role, string>>
  /**
   * The family seed of each ElGamal key that has no account: the Broker Key, which encrypts the
   * Lending Balance, the issuance's MPT Auditor key and the Loan Auditor key.
   */
  readonly keySeeds: Readonly<Record<NamedKey, string>>
  readonly mptIssuanceID: string | undefined
  readonly vault: RunVault | undefined
}

/**
 * Everything the browser needs to play every role in one run: the ledger IDs, each signer's
 * account, and each ElGamal key.
 */
export interface Kit {
  /** The confidential MPT issuance the vault holds. */
  readonly mptIssuanceID: string
  /** The closed-ended vault this run lends from. The LoanBroker is created in the app. */
  readonly vaultID: string
  /** Each signer's classic address and the family seed that derives it. */
  readonly accounts: Readonly<Record<Signer, { readonly address: string; readonly seed: string }>>
  /** The family seed of each ElGamal key. */
  readonly elgamal: Readonly<Record<KeyHolder, string>>
}

/** Generates fresh seeds for a deployment that has nothing on the ledger yet. */
export function newDeployment(): Deployment {
  return {
    seeds: Object.fromEntries(ROLES.map((role) => [role, newSeed()])) as Deployment['seeds'],
    keySeeds: Object.fromEntries(
      NAMED_KEYS.map((key) => [key, newSeed()]),
    ) as Deployment['keySeeds'],
    mptIssuanceID: undefined,
    vault: undefined,
  }
}

/**
 * The kit for a deployment's current run.
 *
 * @param deployment - A deployment with its token and vault created.
 * @returns The kit, or undefined while either is missing.
 */
export function kitOf({ seeds, keySeeds, mptIssuanceID, vault }: Deployment): Kit | undefined {
  if (mptIssuanceID === undefined || vault === undefined) return undefined
  const account = (role: Signer) => ({
    address: walletFromSeed(seeds[role]).address,
    seed: seeds[role],
  })
  return {
    mptIssuanceID,
    vaultID: vault.vaultID,
    accounts: {
      brokerA: account('brokerA'),
      depositorA: account('depositorA'),
      depositorB: account('depositorB'),
      borrowerA: account('borrowerA'),
      borrowerB: account('borrowerB'),
    },
    elgamal: {
      brokerA: keySeeds.brokerA,
      borrowerA: seeds.borrowerA,
      borrowerB: seeds.borrowerB,
      mptAuditor: keySeeds.mptAuditor,
      loanAuditor: keySeeds.loanAuditor,
    },
  }
}

/** Writes a deployment as the JSON text `parseDeployment` reads. */
export function serializeDeployment(deployment: Deployment): string {
  return JSON.stringify({ version: DEPLOYMENT_VERSION, ...deployment })
}

type Json = Record<string, unknown>

function object(value: unknown, path: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid deployment: ${path}: expected an object`)
  }
  return value as Json
}

function hexId(value: unknown, path: string, length: number): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9A-F]{${length}}$`, 'i').test(value)) {
    throw new Error(`Invalid deployment: ${path}: expected ${length} hex digits`)
  }
  return value.toUpperCase()
}

function familySeed(value: unknown, path: string): string {
  try {
    if (typeof value !== 'string') throw new TypeError('not a string')
    confidentialKeypair(value)
    if (!isValidClassicAddress(walletFromSeed(value).address)) throw new Error('no address')
    return value
  } catch {
    throw new Error(`Invalid deployment: ${path}: expected a family seed`)
  }
}

function seedsOf<K extends string>(value: unknown, keys: readonly K[], path: string) {
  const json = object(value, path)
  return Object.fromEntries(
    keys.map((key) => [key, familySeed(json[key], `${path}.${key}`)]),
  ) as Record<K, string>
}

function vaultOf(value: unknown): RunVault | undefined {
  if (value === undefined) return undefined
  const json = object(value, 'vault')
  const date = (key: string): number => {
    const date = json[key]
    if (typeof date !== 'number' || !Number.isSafeInteger(date)) {
      throw new Error(`Invalid deployment: vault.${key}: expected whole seconds`)
    }
    return date
  }
  return {
    vaultID: hexId(json['vaultID'], 'vault.vaultID', 64),
    subscriptionDate: date('subscriptionDate'),
    redemptionDate: date('redemptionDate'),
  }
}

/**
 * Reads a deployment that `serializeDeployment` wrote, checking every field.
 *
 * @param text - The stored JSON text.
 * @returns The deployment.
 * @throws {Error} Naming the first field that is missing or malformed, or an unknown version.
 */
export function parseDeployment(text: string): Deployment {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(`The deployment is not JSON: ${String(error)}`, { cause: error })
  }
  const json = object(parsed, 'deployment')
  if (json['version'] !== DEPLOYMENT_VERSION) {
    throw new Error(`Invalid deployment: version: expected ${DEPLOYMENT_VERSION}`)
  }
  const { mptIssuanceID } = json
  return {
    seeds: seedsOf(json['seeds'], ROLES, 'seeds'),
    keySeeds: seedsOf(json['keySeeds'], NAMED_KEYS, 'keySeeds'),
    mptIssuanceID:
      mptIssuanceID === undefined ? undefined : hexId(mptIssuanceID, 'mptIssuanceID', 48),
    vault: vaultOf(json['vault']),
  }
}
