import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { newSeed, walletFromSeed } from '@confidential-loans/core/accounts'
import { serializeKit } from '@confidential-loans/core/kit'
import type { Kit } from '@confidential-loans/core/kit'
import { KIT_KEY, forgetKit, readKit, saveKit } from './kit-store.ts'
import type { KitStorage } from './kit-store.ts'

function account(): { address: string; seed: string } {
  const seed = newSeed()
  return { address: walletFromSeed(seed).address, seed }
}

const kit: Kit = {
  mptIssuanceID: '0000046B4127945F4651C08EC3394795A3A78A67860AA34C',
  vaultID: '5E1AF944C0BBAA2E1CF466AB6F0EF0226A3248ACCBBBB95B7D61CFDA3745B909',
  accounts: {
    brokerA: account(),
    depositorA: account(),
    depositorB: account(),
    borrowerA: account(),
    borrowerB: account(),
  },
  elgamal: {
    brokerA: newSeed(),
    borrowerA: newSeed(),
    borrowerB: newSeed(),
    mptAuditor: newSeed(),
    loanAuditor: newSeed(),
  },
}

function memory(initial: Record<string, string> = {}): KitStorage & { items: Map<string, string> } {
  const items = new Map(Object.entries(initial))
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  }
}

describe('readKit', () => {
  it('reports a missing kit', () => {
    assert.deepEqual(
      readKit(() => memory()),
      { status: 'missing' },
    )
  })

  it('reads a stored kit', () => {
    const storage = memory({ [KIT_KEY]: serializeKit(kit) })
    assert.deepEqual(
      readKit(() => storage),
      { status: 'ready', kit },
    )
  })

  it('reports a stored kit that no longer parses', () => {
    const stored = readKit(() => memory({ [KIT_KEY]: '{"kit":2}' }))
    assert.equal(stored.status, 'invalid')
    assert.match(stored.status === 'invalid' ? stored.error : '', /kit: expected 1, got 2/)
  })

  it('reports storage the browser refuses', () => {
    const blocked = (): KitStorage => {
      throw new Error('The operation is insecure.')
    }
    assert.deepEqual(readKit(blocked), {
      status: 'invalid',
      error: 'Could not read session storage: The operation is insecure.',
    })
  })
})

describe('saveKit', () => {
  it('stores a valid kit and returns it', () => {
    const storage = memory()
    assert.deepEqual(
      saveKit(() => storage, `  ${serializeKit(kit)}`),
      { status: 'ready', kit },
    )
    assert.deepEqual(
      readKit(() => storage),
      { status: 'ready', kit },
    )
  })

  it('rejects an invalid kit and keeps the stored one', () => {
    const storage = memory({ [KIT_KEY]: serializeKit(kit) })
    assert.throws(() => saveKit(() => storage, 'SEED=s...'), /The kit is not JSON/)
    assert.deepEqual(
      readKit(() => storage),
      { status: 'ready', kit },
    )
  })
})

describe('forgetKit', () => {
  it('removes the stored kit', () => {
    const storage = memory({ [KIT_KEY]: serializeKit(kit) })
    assert.deepEqual(
      forgetKit(() => storage),
      { status: 'missing' },
    )
    assert.equal(storage.items.has(KIT_KEY), false)
  })
})
