import { appendFileSync, existsSync } from 'node:fs'

import { newSeed, walletFromSeed } from '@confidential-loans/core/accounts'
import type { Wallet } from '@confidential-loans/core/accounts'

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

/**
 * Reads `SEED_<ROLE>` from `scripts/.env`, generating and appending a new seed when it is missing.
 *
 * The file is gitignored. Seeds are never printed.
 *
 * @param role - Account role.
 * @returns The role's wallet.
 */
export function roleWallet(role: Role): Wallet {
  const key = `SEED_${role.toUpperCase()}`
  let seed = process.env[key]
  if (seed === undefined || seed === '') {
    seed = newSeed()
    appendFileSync(ENV_PATH, `${key}=${seed}\n`)
    process.env[key] = seed
  }
  return walletFromSeed(seed)
}
