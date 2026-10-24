import xrpl, { Wallet, dropsToXrp } from 'xrpl'
import type { Client } from 'xrpl'

import { FAUCET_HOST } from './network.ts'

// xrpl is CommonJS; Node's ESM loader does not expose its ECDSA re-export as a named import.
const { ECDSA } = xrpl

export type { Wallet }

/** Generates a new ed25519 family seed. */
export function newSeed(): string {
  const { seed } = Wallet.generate(ECDSA.ed25519)
  if (seed === undefined) throw new Error('Wallet.generate returned no seed')
  return seed
}

export function walletFromSeed(seed: string): Wallet {
  return Wallet.fromSeed(seed)
}

function rippledErrorCode(error: unknown): unknown {
  if (typeof error !== 'object' || error === null || !('data' in error)) return undefined
  const { data } = error
  return typeof data === 'object' && data !== null && 'error' in data ? data.error : undefined
}

/**
 * Reads an account's XRP balance from the latest validated ledger.
 *
 * @param client - Connected client.
 * @param address - Account to read.
 * @returns The balance in XRP, or undefined when the account does not exist.
 */
export async function xrpBalance(client: Client, address: string): Promise<number | undefined> {
  try {
    const { result } = await client.request({
      command: 'account_info',
      account: address,
      ledger_index: 'validated',
    })
    return dropsToXrp(result.account_data.Balance)
  } catch (error) {
    if (rippledErrorCode(error) === 'actNotFound') return undefined
    throw error
  }
}

/**
 * Funds an account from the team devnet faucet unless it already exists.
 *
 * @param client - Connected client.
 * @param wallet - Account to fund.
 * @returns True when the faucet funded it, false when it already existed.
 */
export async function fundIfMissing(client: Client, wallet: Wallet): Promise<boolean> {
  if ((await xrpBalance(client, wallet.address)) !== undefined) return false
  await client.fundWallet(wallet, { faucetHost: FAUCET_HOST })
  return true
}
