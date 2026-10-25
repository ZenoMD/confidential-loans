import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { header } from './header.ts'
import { NOW, snapshot } from './snapshot.fixture.ts'

describe('header', () => {
  it('counts down to Investment one second after the subscription date', () => {
    const s = snapshot({ phase: 'subscription', now: NOW - 90_000 })
    assert.deepEqual(header(s), {
      phase: 'Subscription',
      next: 'Investment at 11:59:01, in 0:31',
      ledger: 'Ledger 1,234',
    })
  })

  it('counts down to Redemption, never below zero', () => {
    assert.equal(header(snapshot()).next, 'Redemption at 12:02:05, in 2:05')
    assert.equal(header(snapshot({ now: NOW + 200_000 })).next, 'Redemption at 12:02:05, in 0:00')
  })

  it('names no next phase in Redemption', () => {
    assert.equal(header(snapshot({ phase: 'redemption' })).next, undefined)
  })
})
