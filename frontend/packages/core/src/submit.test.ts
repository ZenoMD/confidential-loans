import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TestContext } from 'node:test'

import { Wallet } from 'xrpl'
import type { Client, SubmittableTransaction } from 'xrpl'

import { TxFailed, submit } from './submit.ts'

const LAST_LEDGER = 12
const POLL_MS = 1000

interface Validated {
  readonly result: string
}

/** A devnet that answers `submit`, `ledger` and `tx` from state the test steps forward. */
class FakeLedger {
  engine = 'tesSUCCESS'
  validatedLedger = 10
  found: Validated | undefined
  txError: Error | undefined
  ledgerError: Error | undefined
  onTxPoll: () => void = () => {}
  txPolls = 0

  async autofill(tx: SubmittableTransaction): Promise<SubmittableTransaction> {
    return { ...tx, Fee: '12', Sequence: 1, LastLedgerSequence: LAST_LEDGER }
  }

  async request(request: { command: string; tx_blob?: string }): Promise<{ result: object }> {
    switch (request.command) {
      case 'submit':
        return { result: { engine_result: this.engine } }
      case 'ledger':
        if (this.ledgerError !== undefined) throw this.ledgerError
        return { result: { ledger_index: this.validatedLedger, validated: true } }
      case 'tx':
        return { result: this.answerTx() }
      default:
        throw new Error(`Unexpected request ${request.command}`)
    }
  }

  private answerTx(): object {
    this.txPolls += 1
    const { found, txError } = this
    this.onTxPoll()
    if (txError !== undefined) throw txError
    if (found === undefined) throw rippledError('txnNotFound')
    return {
      validated: true,
      ledger_index: LAST_LEDGER,
      tx_json: { TransactionType: 'AccountSet' },
      meta: { TransactionResult: found.result, AffectedNodes: [], TransactionIndex: 0 },
    }
  }
}

function rippledError(code: string): Error {
  return Object.assign(new Error(code), { data: { error: code } })
}

function asClient(fake: FakeLedger): Client {
  return fake as unknown as Client
}

const wallet = Wallet.generate()
const accountSet: SubmittableTransaction = {
  TransactionType: 'AccountSet',
  Account: wallet.address,
}

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

/** Advances fake time one poll at a time until `work` settles. */
async function settle<T>(t: TestContext, work: Promise<T>): Promise<T> {
  let settled = false
  work.then(
    () => (settled = true),
    () => (settled = true),
  )
  for (let poll = 0; poll < 100 && !settled; poll += 1) {
    await flush()
    t.mock.timers.tick(POLL_MS)
  }
  await flush()
  return work
}

test('submit returns the validated transaction and its metadata', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fake = new FakeLedger()
  fake.onTxPoll = () => (fake.found = { result: 'tesSUCCESS' })
  const submitted = await settle(t, submit(asClient(fake), accountSet, wallet))
  assert.match(submitted.hash, /^[0-9A-F]{64}$/)
  assert.equal(submitted.tx.TransactionType, 'AccountSet')
  assert.equal(submitted.meta.TransactionResult, 'tesSUCCESS')
})

test('submit throws at once on a tem result, without polling', async () => {
  const fake = new FakeLedger()
  fake.engine = 'temMALFORMED'
  await assert.rejects(submit(asClient(fake), accountSet, wallet), (error: unknown) => {
    assert.ok(error instanceof TxFailed)
    assert.equal(error.code, 'temMALFORMED')
    return true
  })
  assert.equal(fake.txPolls, 0)
})

test('submit throws with the code and hash when the transaction validates with tec', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fake = new FakeLedger()
  fake.found = { result: 'tecNO_PERMISSION' }
  const failing = settle(t, submit(asClient(fake), accountSet, wallet))
  await assert.rejects(failing, (error: unknown) => {
    assert.ok(error instanceof TxFailed)
    assert.equal(error.code, 'tecNO_PERMISSION')
    assert.match(error.hash ?? '', /^[0-9A-F]{64}$/)
    assert.match(error.message, /AccountSet failed with tecNO_PERMISSION: https:/)
    return true
  })
})

test('submit throws when LastLedgerSequence validates without the transaction', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fake = new FakeLedger()
  fake.onTxPoll = () => (fake.validatedLedger += 1)
  const expiring = settle(t, submit(asClient(fake), accountSet, wallet))
  await assert.rejects(expiring, /expired: LastLedgerSequence 12 validated without it/)
})

test('submit does not report expiry when the transaction made its last ledger', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fake = new FakeLedger()
  fake.validatedLedger = LAST_LEDGER - 1
  fake.onTxPoll = () => {
    fake.found = { result: 'tesSUCCESS' }
    fake.validatedLedger = LAST_LEDGER + 1
  }
  const submitted = await settle(t, submit(asClient(fake), accountSet, wallet))
  assert.equal(submitted.meta.TransactionResult, 'tesSUCCESS')
})

test('submit names the poll error when the transaction expires', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fake = new FakeLedger()
  fake.txError = new Error('Timeout for request')
  fake.onTxPoll = () => {
    fake.txError = undefined
    fake.validatedLedger += 1
  }
  const expiring = settle(t, submit(asClient(fake), accountSet, wallet))
  await assert.rejects(expiring, /expired.*last poll error: Timeout for request/)
})

test('submit keeps polling through a transient poll error', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fake = new FakeLedger()
  fake.txError = new Error('websocket was closed')
  fake.onTxPoll = () => {
    fake.txError = undefined
    fake.found = { result: 'tesSUCCESS' }
  }
  const submitted = await settle(t, submit(asClient(fake), accountSet, wallet))
  assert.equal(submitted.meta.TransactionResult, 'tesSUCCESS')
})

test('submit counts only consecutive failed polls towards giving up', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fake = new FakeLedger()
  let polls = 0
  fake.onTxPoll = () => {
    polls += 1
    fake.txError = polls % 2 === 1 ? new Error('Timeout for request') : undefined
    if (polls === 70) fake.found = { result: 'tesSUCCESS' }
  }
  const submitted = await settle(t, submit(asClient(fake), accountSet, wallet))
  assert.equal(submitted.meta.TransactionResult, 'tesSUCCESS')
})

for (const [unreachable, setUp] of [
  ['ledger', (fake: FakeLedger) => (fake.ledgerError = new Error('NotConnectedError'))],
  ['lookup', (fake: FakeLedger) => (fake.txError = new Error('NotConnectedError'))],
] as const) {
  test(`submit gives up with the poll error while the ${unreachable} fails`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const fake = new FakeLedger()
    const cause = setUp(fake)
    fake.onTxPoll = () => (fake.validatedLedger += 1)
    const stuck = settle(t, submit(asClient(fake), accountSet, wallet))
    await assert.rejects(stuck, (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /Could not confirm [0-9A-F]{64}: NotConnectedError/)
      assert.equal(error.cause, cause)
      return true
    })
  })
}

test('TxFailed without a hash names no explorer link', () => {
  const error = new TxFailed('LoanBrokerDraw', 'tecNO_PERMISSION')
  assert.equal(error.hash, undefined)
  assert.equal(error.message, 'LoanBrokerDraw failed with tecNO_PERMISSION')
})
