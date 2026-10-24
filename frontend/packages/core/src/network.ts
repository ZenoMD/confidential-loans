import { Client } from 'xrpl'

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

export interface ServerStatus {
  buildVersion: string
  networkId: number | undefined
  validatedLedger: number | undefined
}

/**
 * Reads `server_info` from the team devnet.
 *
 * @returns The node's build version, network ID, and latest validated ledger index.
 */
export async function readServerStatus(): Promise<ServerStatus> {
  return withClient(async (client) => {
    const { info } = (await client.request({ command: 'server_info' })).result
    return {
      buildVersion: info.build_version,
      networkId: info.network_id,
      validatedLedger: info.validated_ledger?.seq,
    }
  })
}
