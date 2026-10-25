import { setTimeout as sleep } from 'node:timers/promises'

import { Client, ConnectionError } from 'xrpl'

const RECONNECT_ATTEMPTS = 20
const RECONNECT_WAIT_MS = 3000

export interface Network {
  name: 'devnet' | 'team'
  wss: string
  /** Faucet host for `fundWallet`; `undefined` lets xrpl.js pick the public Devnet faucet. */
  faucetHost: string | undefined
  explorer: string
}

const NETWORKS: Record<Network['name'], Network> = {
  devnet: {
    name: 'devnet',
    wss: 'wss://s.devnet.rippletest.net:51233',
    faucetHost: undefined,
    explorer: 'https://devnet.xrpl.org',
  },
  team: {
    name: 'team',
    wss: 'wss://xrpl-confidential-loans.zeno.md',
    faucetHost: 'faucet.xrpl-confidential-loans.zeno.md',
    explorer: 'https://custom.xrpl.org/xrpl-confidential-loans.zeno.md:443',
  },
}

function selectNetwork(): Network {
  const name = process.env['XRPL_NETWORK'] ?? 'devnet'
  if (name !== 'devnet' && name !== 'team') {
    throw new Error(`XRPL_NETWORK=${name} is not a known network; use devnet or team`)
  }
  return NETWORKS[name]
}

/** The network every script talks to, chosen with `XRPL_NETWORK` (default `devnet`). */
export const NETWORK = selectNetwork()

export function txLink(hash: string): string {
  return `${NETWORK.explorer}/transactions/${hash}`
}

export function accountLink(address: string): string {
  return `${NETWORK.explorer}/accounts/${address}`
}

/**
 * Runs a read-only request, retrying it when the websocket drops. xrpl.js reconnects by itself but
 * rejects every request in flight. Devnet dropped connections intermittently during setup waits.
 *
 * @param client - Client the request uses.
 * @param request - An idempotent request; it may run more than once.
 * @returns The request's result.
 * @throws The last error when it is not a connection error or 20 attempts (about a minute) fail.
 */
export async function reconnecting<T>(client: Client, request: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await request()
    } catch (error) {
      if (!(error instanceof ConnectionError) || attempt === RECONNECT_ATTEMPTS) throw error
      console.log(`  ${NETWORK.name} connection dropped; reconnecting (attempt ${attempt})`)
      await sleep(RECONNECT_WAIT_MS)
      await freshConnection(client)
    }
  }
}

/**
 * Opens a socket when none is open. While the old socket is still CLOSING, `connect()` rejects at
 * once; callers retry until `ws` finishes the close (at most 30 s). Never call `disconnect()`
 * here: on a CLOSING socket its promise never settles, and Node exits mid-await.
 */
export async function freshConnection(client: Client): Promise<void> {
  if (client.isConnected()) return
  await client.connect().catch((error: unknown) => {
    console.log(`  reconnect failed: ${error instanceof Error ? error.message : String(error)}`)
  })
}

/**
 * Connects to the selected network, runs `fn`, and always disconnects.
 *
 * @param fn - Work to run with a connected client.
 * @returns Whatever `fn` returns.
 */
export async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client(NETWORK.wss)
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.disconnect()
  }
}
