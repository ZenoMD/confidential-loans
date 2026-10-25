import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { newSeed, walletFromSeed } from './accounts.ts'
import { parseKit, serializeKit } from './kit.ts'
import type { Kit } from './kit.ts'

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

function withField(path: readonly string[], value: unknown): string {
  const json = JSON.parse(serializeKit(kit)) as Record<string, unknown>
  let node = json
  for (const key of path.slice(0, -1)) node = node[key] as Record<string, unknown>
  const last = path.at(-1) ?? ''
  if (value === undefined) delete node[last]
  else node[last] = value
  return JSON.stringify(json)
}

describe('parseKit', () => {
  it('reads back what serializeKit wrote', () => {
    assert.deepEqual(parseKit(serializeKit(kit)), kit)
  })

  it('accepts surrounding whitespace from a paste', () => {
    assert.deepEqual(parseKit(`\n  ${serializeKit(kit)}\n\n`), kit)
  })

  it('rejects text that is not JSON', () => {
    assert.throws(() => parseKit('SEED_BROKERA=s...'), /The kit is not JSON/)
  })

  it('rejects a kit of another format version', () => {
    assert.throws(() => parseKit(withField(['kit'], 2)), /kit: expected 1, got 2/)
  })

  it('names a missing field', () => {
    assert.throws(
      () => parseKit(withField(['elgamal', 'loanAuditor'], undefined)),
      /elgamal\.loanAuditor: expected a family seed, got undefined/,
    )
  })

  it('names a malformed ledger ID', () => {
    assert.throws(() => parseKit(withField(['vaultID'], 'abc')), /vaultID: expected 64 hex/)
  })

  it('rejects a seed that does not derive the address next to it', () => {
    const other = account().seed
    assert.throws(
      () => parseKit(withField(['accounts', 'borrowerB', 'seed'], other)),
      /accounts\.borrowerB\.seed does not derive accounts\.borrowerB\.address/,
    )
  })

  it('rejects an ElGamal seed that is not a family seed', () => {
    assert.throws(
      () => parseKit(withField(['elgamal', 'brokerA'], 'not-a-seed')),
      /elgamal\.brokerA: expected a family seed/,
    )
  })

  it('rejects unknown fields, which are usually typos', () => {
    assert.throws(
      () => parseKit(withField(['loanBrokerId'], 'x')),
      /Unknown kit field loanBrokerId/,
    )
  })
})
