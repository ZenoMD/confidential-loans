import { Client } from 'xrpl'

/** Team devnet running the confidential lending fork of rippled. */
export const NETWORK_WSS = 'wss://xrpl-confidential-loans.zeno.md'

export interface ServerStatus {
  buildVersion: string
  networkId: number | undefined
  validatedLedger: number | undefined
}

/**
 * Connects to the team devnet, reads `server_info`, and disconnects.
 *
 * @returns The node's build version, network ID, and latest validated ledger index.
 */
export async function readServerStatus(): Promise<ServerStatus> {
  const client = new Client(NETWORK_WSS)
  await client.connect()
  try {
    const { info } = (await client.request({ command: 'server_info' })).result
    return {
      buildVersion: info.build_version,
      networkId: info.network_id,
      validatedLedger: info.validated_ledger?.seq,
    }
  } finally {
    await client.disconnect()
  }
}
