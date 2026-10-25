import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import type { TestContext } from 'node:test'

import type { Client } from 'xrpl'

import { connectLedger } from './network.ts'

class FakeClient extends EventEmitter {
  connects = 0
  subscribes = 0
  disconnects = 0
  failNextConnects = 0
  hangConnects = false

  async connect(): Promise<void> {
    this.connects += 1
    if (this.hangConnects) return new Promise(() => {})
    if (this.failNextConnects > 0) {
      this.failNextConnects -= 1
      throw new Error('connection refused')
    }
  }

  async disconnect(): Promise<void> {
    this.disconnects += 1
  }

  async request(request: { command: string; streams?: string[] }): Promise<{ result: object }> {
    if (request.command === 'subscribe' && request.streams?.includes('ledger') === true) {
      this.subscribes += 1
      return { result: {} }
    }
    throw new Error(`Unexpected request ${request.command}`)
  }

  closeLedger(ledgerIndex: number, ledgerTime: number): void {
    this.emit('ledgerClosed', {
      type: 'ledgerClosed',
      ledger_index: ledgerIndex,
      ledger_time: ledgerTime,
    })
  }
}

function asClient(fake: FakeClient): Client {
  return fake as unknown as Client
}

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

async function advance(t: TestContext, ms: number): Promise<void> {
  await flush()
  t.mock.timers.tick(ms)
  await flush()
}

test('connectLedger rejects when the connection does not open in time', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fake = new FakeClient()
  fake.hangConnects = true
  const rejected = assert.rejects(
    connectLedger({ client: asClient(fake), timeoutMs: 5000 }),
    /timed out after 5000 ms/,
  )
  await advance(t, 5000)
  await rejected
  assert.equal(fake.disconnects, 1)
})

test('connectLedger forwards ledger closes until the listener unsubscribes', async () => {
  const fake = new FakeClient()
  const ledger = await connectLedger({ client: asClient(fake) })
  const seen: Array<[number, number]> = []
  const unsubscribe = ledger.onLedgerClosed((index, time) => seen.push([index, time]))
  fake.closeLedger(7, 830000000)
  unsubscribe()
  fake.closeLedger(8, 830000010)
  assert.equal(fake.subscribes, 1)
  assert.deepEqual(seen, [[7, 830000000]])
})

test('connectLedger reconnects and resubscribes after the socket drops', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fake = new FakeClient()
  const ledger = await connectLedger({ client: asClient(fake) })
  const seen: number[] = []
  ledger.onLedgerClosed((index) => seen.push(index))
  fake.emit('disconnected', 1006)
  await advance(t, 1000)
  assert.equal(fake.connects, 2)
  assert.equal(fake.subscribes, 2)
  fake.closeLedger(9, 830000020)
  assert.deepEqual(seen, [9])
})

test('connectLedger reports a failed reconnect and tries again', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fake = new FakeClient()
  const errors: unknown[] = []
  await connectLedger({ client: asClient(fake), onError: (error) => errors.push(error) })
  fake.failNextConnects = 1
  fake.emit('disconnected', 1006)
  await advance(t, 1000)
  assert.equal(errors.length, 1)
  assert.match(String(errors[0]), /connection refused/)
  assert.equal(fake.subscribes, 1)
  await advance(t, 2000)
  assert.equal(fake.connects, 3)
  assert.equal(fake.subscribes, 2)
})

test('close disconnects and stops reconnecting', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fake = new FakeClient()
  const ledger = await connectLedger({ client: asClient(fake) })
  await ledger.close()
  fake.emit('disconnected', 4000)
  await advance(t, 60_000)
  assert.equal(fake.disconnects, 1)
  assert.equal(fake.connects, 1)
})

test('close during a pending reconnect cancels it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fake = new FakeClient()
  const ledger = await connectLedger({ client: asClient(fake) })
  fake.emit('disconnected', 1006)
  await ledger.close()
  await advance(t, 60_000)
  assert.equal(fake.connects, 1)
})
