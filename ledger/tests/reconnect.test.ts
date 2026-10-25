import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DisconnectedError } from 'xrpl'
import type { Client } from 'xrpl'

import { reconnecting } from '#lib/network'

// xrpl.js's disconnect() on a socket that is still closing never settles (its close listener is
// removed by the library's own close handler). Devnet left sockets in that state during setup.
test(
  'reconnecting recovers while the old socket is stuck closing',
  { timeout: 15_000 },
  async () => {
    let connected = false
    const client = {
      isConnected: () => connected,
      disconnect: () => new Promise<never>(() => undefined),
      connect: async () => {
        connected = true
      },
    } as unknown as Client
    const request = async (): Promise<string> => {
      if (!connected) throw new DisconnectedError('websocket was closed')
      return 'answered'
    }
    assert.equal(await reconnecting(client, request), 'answered')
  },
)
