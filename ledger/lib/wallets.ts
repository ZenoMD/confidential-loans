import { appendFileSync, existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import xrpl, { Wallet } from 'xrpl'
import type { Client } from 'xrpl'

import { NETWORK, accountLink } from '#lib/network'

// xrpl is CommonJS; Node's ESM loader does not expose its ECDSA re-export as a named import.
const { ECDSA } = xrpl

// Seeds live in ledger/.env, which the repo's .gitignore excludes. They are never printed.
const ENV_PATH = fileURLToPath(new URL('../.env', import.meta.url))

export type Role = 'issuer' | 'depositor' | 'borrowerA' | 'borrowerB'

if (!existsSync(ENV_PATH)) writeFileSync(ENV_PATH, '')
process.loadEnvFile(ENV_PATH)

function seedFor(name: string): string {
  const key = `SEED_${name.toUpperCase()}`
  const existing = process.env[key]
  if (existing !== undefined && existing !== '') return existing
  const seed = Wallet.generate(ECDSA.ed25519).seed
  if (seed === undefined) throw new Error('Wallet.generate returned no seed')
  appendFileSync(ENV_PATH, `${key}=${seed}\n`)
  process.env[key] = seed
  return seed
}

async function accountExists(client: Client, address: string): Promise<boolean> {
  try {
    await client.request({ command: 'account_info', account: address, ledger_index: 'validated' })
    return true
  } catch (error) {
    if ((error as { data?: { error?: string } }).data?.error === 'actNotFound') return false
    throw error
  }
}

/**
 * Loads a role's wallet from `.env`, creating and faucet-funding it on first use.
 *
 * @param client - Connected client, used to check and fund the account.
 * @param role - Which role's wallet to load.
 * @returns The role's wallet.
 */
export async function roleWallet(client: Client, role: Role): Promise<Wallet> {
  const wallet = Wallet.fromSeed(seedFor(role))
  if (!(await accountExists(client, wallet.address))) {
    const { faucetHost } = NETWORK
    await client.fundWallet(wallet, faucetHost === undefined ? {} : { faucetHost })
    console.log(`funded ${role} on ${NETWORK.name}: ${accountLink(wallet.address)}`)
  }
  return wallet
}

/**
 * The broker's software regular key, from `SEED_REGULARKEY` in `.env`. It is never funded: the
 * Ledger account authorizes it with `SetRegularKey`.
 *
 * @returns The regular key's wallet.
 */
export function regularKey(): Wallet {
  return Wallet.fromSeed(seedFor('regularKey'))
}
