import { appendFileSync, existsSync } from 'node:fs'

import { confidentialKeypair, newSeed, walletFromSeed } from '@confidential-loans/core/accounts'
import type { ConfidentialKeypair, Wallet } from '@confidential-loans/core/accounts'

const ENV_PATH = new URL('.env', import.meta.url)

/** Two accounts for each role in the demo, plus the token issuer and its treasury. */
export const ROLES = [
  'issuer',
  'treasury',
  'brokerA',
  'brokerB',
  'depositorA',
  'depositorB',
  'borrowerA',
  'borrowerB',
] as const
export type Role = (typeof ROLES)[number]

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
 *
 * The file is gitignored. Seeds are never printed.
 *
 * @param role - Account role.
 * @returns The role's wallet.
 */
export function roleWallet(role: Role): Wallet {
  return walletFromSeed(readOrCreateSeed(`SEED_${role.toUpperCase()}`))
}

/**
 * Derives a role's ElGamal keypair from its wallet seed, as the xrpl.org samples do.
 *
 * One secret restores both the account and its confidential balances; anyone holding the seed
 * can also decrypt them.
 *
 * @param role - Account role.
 * @returns The keypair that encrypts and decrypts the role's confidential balances.
 */
export function confidentialKey(role: Role): ConfidentialKeypair {
  return confidentialKeypair(readOrCreateSeed(`SEED_${role.toUpperCase()}`))
}

/**
 * Loads the auditor's ElGamal keypair. The auditor has no account, so its key has its own seed,
 * `CONF_SEED_AUDITOR`.
 *
 * @returns The auditor keypair.
 */
export function auditorKey(): ConfidentialKeypair {
  return confidentialKeypair(readOrCreateSeed('CONF_SEED_AUDITOR'))
}
