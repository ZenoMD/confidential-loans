import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { walletFromSeed } from './accounts.ts'
import { kitOf, newDeployment, parseDeployment, serializeDeployment } from './kit.ts'
import type { Deployment } from './kit.ts'

const TOKEN = '0000046B4127945F4651C08EC3394795A3A78A67860AA34C'
const VAULT = '5E1AF944C0BBAA2E1CF466AB6F0EF0226A3248ACCBBBB95B7D61CFDA3745B909'

const deployed: Deployment = {
  ...newDeployment(),
  mptIssuanceID: TOKEN,
  vault: { vaultID: VAULT, subscriptionDate: 846_219_727, redemptionDate: 846_220_327 },
}

function withField(path: readonly string[], value: unknown): string {
  const json = JSON.parse(serializeDeployment(deployed)) as Record<string, unknown>
  let node = json
  for (const key of path.slice(0, -1)) node = node[key] as Record<string, unknown>
  node[path.at(-1) ?? ''] = value
  return JSON.stringify(json)
}

describe('newDeployment', () => {
  it('generates a distinct seed for every account and key, with nothing on the ledger', () => {
    const fresh = newDeployment()
    const seeds = [...Object.values(fresh.seeds), ...Object.values(fresh.keySeeds)]
    assert.equal(seeds.length, 9)
    assert.equal(new Set(seeds).size, 9)
    assert.equal(fresh.mptIssuanceID, undefined)
    assert.equal(fresh.vault, undefined)
  })
})

describe('parseDeployment', () => {
  it('reads back what serializeDeployment wrote, before and after the ledger IDs', () => {
    assert.deepEqual(parseDeployment(serializeDeployment(deployed)), deployed)
    const fresh = newDeployment()
    assert.deepEqual(parseDeployment(serializeDeployment(fresh)), fresh)
  })

  it('names the first field that is malformed', () => {
    assert.throws(() => parseDeployment('{'), /not JSON/)
    assert.throws(() => parseDeployment(withField(['version'], 1)), /version/)
    assert.throws(() => parseDeployment(withField(['seeds', 'brokerA'], 'nope')), /seeds\.brokerA/)
    assert.throws(() => parseDeployment(withField(['vault', 'vaultID'], 'AB')), /vault\.vaultID/)
  })
})

describe('kitOf', () => {
  it('has no kit until the token and vault exist', () => {
    assert.equal(kitOf({ ...deployed, vault: undefined }), undefined)
    assert.equal(kitOf({ ...deployed, mptIssuanceID: undefined }), undefined)
  })

  it('gives each signer its account and each key holder its seed', () => {
    const kit = kitOf(deployed)
    assert.equal(kit?.vaultID, VAULT)
    assert.equal(
      kit?.accounts.depositorB.address,
      walletFromSeed(deployed.seeds.depositorB).address,
    )
    assert.equal(kit?.elgamal.borrowerA, deployed.seeds.borrowerA)
    assert.equal(kit?.elgamal.brokerA, deployed.keySeeds.brokerA)
    assert.equal(kit?.elgamal.loanAuditor, deployed.keySeeds.loanAuditor)
  })
})
