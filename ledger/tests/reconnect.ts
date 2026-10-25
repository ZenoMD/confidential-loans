// Regression test for dropped websockets: drops the connection twice (an abrupt terminate, then a
// graceful close) and sends a request straight after each drop, while the socket is still closing.
// `reconnecting` must carry each request through. Devnet dropped connections during setup; without
// the fix the process exits with "unsettled top-level await". Prints `exited normally` on success.

import { Client } from 'xrpl'

import { NETWORK, reconnecting, withClient } from '#lib/network'
import { ledgerTime } from '#lib/time'

type Socket = { terminate(): void; close(code?: number): void }

function socket(client: Client): Socket {
  const ws = (client.connection as unknown as { ws: Socket | null }).ws
  if (ws === null || !client.isConnected()) throw new Error('No open websocket to drop')
  return ws
}

const DROPS: Array<[string, (ws: Socket) => void]> = [
  ['terminate', (ws) => ws.terminate()],
  ['graceful close', (ws) => ws.close(4000)],
]

await withClient(async (client) => {
  let disconnects = 0
  client.on('disconnected', () => disconnects++)
  for (const [name, drop] of DROPS) {
    // Make sure the socket is open, so this drop is the one under test.
    await reconnecting(client, () => client.getLedgerIndex())
    drop(socket(client))
    const time = await ledgerTime(client)
    console.log(`${name}: request after the drop answered (ledger close time ${time})`)
  }
  const index = await reconnecting(client, () => client.getLedgerIndex())
  console.log(`${NETWORK.name} at ledger ${index}; ${disconnects} disconnects seen`)
  if (disconnects < DROPS.length) throw new Error(`Expected ${DROPS.length} disconnects`)
})
console.log('exited normally')
