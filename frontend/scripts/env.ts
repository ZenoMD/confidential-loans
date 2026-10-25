import { appendFileSync, existsSync } from 'node:fs'

import { confidentialKeypair, newSeed, walletFromSeed } from '@confidential-loans/core/accounts'
import type { ConfidentialKeypair, Wallet } from '@confidential-loans/core/accounts'

const ENV_PATH = new URL('.env', import.meta.url)

/** The demo's signers plus the token issuer. */
export const ROLES = [
  'issuer',
  'brokerA',
  'depositorA',
  'depositorB',
  'borrowerA',
  'borrowerB',
] as const
export type Role = (typeof ROLES)[number]

/**
 * ElGamal keys with a seed of their own: the MPT Auditor (`CONF_SEED_AUDITOR`), the Loan Auditor
 * (`CONF_SEED_LOAN_AUDITOR`) and Broker A's Broker Key (`CONF_SEED_BROKERA`), which encrypts the
 * Lending Balance.
 */
export type KeyName = 'AUDITOR' | 'LOAN_AUDITOR' | 'BROKERA'

if (existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH)

function readOrCreateSeed(key: string): string {
  const existing = process.env[key]
  if (existing !== undefined && existing !== '') return existing
  const seed = newSeed()
  appendFileSync(ENV_PATH, `${key}=${seed}\n`)
  process.env[key] = seed
  return seed
}

/**
 * Reads `SEED_<ROLE>` from `scripts/.env`, generating and appending a new seed when it is missing.
 * The file is gitignored. Only `export-kit.ts` prints seeds.
 *
 * @param role - Account role.
 * @returns The family seed.
 */
export function roleSeed(role: Role): string {
  return readOrCreateSeed(`SEED_${role.toUpperCase()}`)
}

export function roleWallet(role: Role): Wallet {
  return walletFromSeed(roleSeed(role))
}

/**
 * Derives a role's ElGamal keypair from its wallet seed, as the xrpl.org samples do. One secret
 * restores both the account and its confidential balances.
 *
 * @param role - Account role.
 * @returns The keypair that encrypts and decrypts the role's confidential balances.
 */
export function confidentialKey(role: Role): ConfidentialKeypair {
  return confidentialKeypair(roleSeed(role))
}

/** Reads `CONF_SEED_<NAME>` from `scripts/.env`, generating it when it is missing. */
export function keySeed(name: KeyName): string {
  return readOrCreateSeed(`CONF_SEED_${name}`)
}

export function namedKey(name: KeyName): ConfidentialKeypair {
  return confidentialKeypair(keySeed(name))
}
