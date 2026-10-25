import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadMptCrypto } from 'xrpl'
import type { Client } from 'xrpl'

import { confidentialKeypair, newSeed } from './accounts.ts'
import { readBalance } from './confidential.ts'

const ISSUANCE = '0000000000000000000000000000000000000000000000AA'
const HOLDER = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'

interface LedgerState {
  outstanding: string
  token: object
}

/** A devnet whose validated ledger advances after every request, as when ledgers close between
 *  round trips. Entries are answered from the state at the requested index; an unnamed ledger
 *  is answered as the latest. */
class FakeLedger {
  validated = 10
  readonly history: Map<number, LedgerState>

  constructor(history: Map<number, LedgerState>) {
    this.history = history
  }

  async request(request: {
    command: string
    ledger_index?: number | string
    mptoken?: object
  }): Promise<{ result: object }> {
    const latest = request.ledger_index === undefined || request.ledger_index === 'validated'
    const index = latest ? this.validated : request.ledger_index
    this.validated += 1
    const state = typeof index === 'number' ? this.history.get(index) : undefined
    if (state === undefined) throw new Error(`No ledger ${String(request.ledger_index)}`)
    if (request.command === 'ledger') return { result: { ledger_index: index, validated: true } }
    if (request.command !== 'ledger_entry') throw new Error(`Unexpected ${request.command}`)
    const node =
      request.mptoken === undefined
        ? { ConfidentialOutstandingAmount: state.outstanding }
        : state.token
    return { result: { node, ledger_index: index, validated: true } }
  }
}

test('readBalance takes the decryption bound from the ledger it read the token at', async () => {
  const keypair = confidentialKeypair(newSeed())
  const crypto = await loadMptCrypto()
  const encrypt = async (amount: bigint): Promise<string> =>
    crypto.encryptAmount(amount, keypair.publicKey, await crypto.generateBlindingFactor())
  const fake = new FakeLedger(
    new Map([
      [
        10,
        {
          outstanding: '100',
          token: { MPTAmount: '5', ConfidentialBalanceSpending: await encrypt(80n) },
        },
      ],
      [
        11,
        {
          outstanding: '50',
          token: { MPTAmount: '5', ConfidentialBalanceSpending: await encrypt(30n) },
        },
      ],
    ]),
  )
  const balance = await readBalance(fake as unknown as Client, HOLDER, ISSUANCE, keypair)
  assert.deepEqual(balance, { public: 5n, spending: 80n, inbox: 0n })
})
