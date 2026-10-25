import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { DepositorView, Snapshot } from '@confidential-loans/core/demo-ledger'
import { redeemModel } from './10-redeem.model.ts'

const pub = (value: bigint) => ({ visibility: 'public', value }) as const

const FRESH: DepositorView = {
  wallet: pub(0n),
  shares: 0n,
  deposited: undefined,
  redeemed: undefined,
  redeemFailure: undefined,
}

interface Fixture {
  readonly assetsTotal?: bigint
  readonly assetsAvailable?: bigint
  readonly lossUnrealized?: bigint
  readonly a?: Partial<DepositorView>
  readonly b?: Partial<DepositorView>
}

/** A redemption-phase snapshot. Shares total is the sum of both depositors' shares. */
function snapshot(f: Fixture): Snapshot {
  const depositorA = { ...FRESH, ...f.a }
  const depositorB = { ...FRESH, ...f.b }
  return {
    viewer: 'depositorA',
    ledgerIndex: 1,
    now: 2_000,
    phase: 'redemption',
    vault: {
      vaultID: 'V',
      assetsTotal: pub(f.assetsTotal ?? 300_000n),
      assetsAvailable: pub(f.assetsAvailable ?? 205_000n),
      lossUnrealized: pub(f.lossUnrealized ?? 0n),
      sharesTotal: depositorA.shares + depositorB.shares,
      subscriptionDate: 0,
      redemptionDate: 1_000,
    },
    broker: undefined,
    loans: {},
    offers: {},
    depositors: { depositorA, depositorB },
    borrowers: {
      borrowerA: { spending: pub(0n), inbox: pub(0n) },
      borrowerB: { spending: pub(0n), inbox: pub(0n) },
    },
    log: [],
    submitting: undefined,
    errors: [],
  }
}

const SUBSCRIBED: Partial<DepositorView> = { shares: 150_000n, deposited: pub(150_000n) }

function amounts(s: Snapshot, depositor: 'depositorA' | 'depositorB') {
  return redeemModel(s, { depositor }).rows.map((row) => [row.label, row.shown.value])
}

describe('redeemModel', () => {
  it('lays out the canvas rows with the shortfall label in the loss color', () => {
    const model = redeemModel(snapshot({ a: SUBSCRIBED, b: SUBSCRIBED }), {
      depositor: 'depositorA',
    })
    assert.deepEqual(
      model.rows.map((row) => [row.label, row.shown.visibility, row.tone]),
      [
        ['Deposited', 'public', 'mute'],
        ['Interest earned', 'public', 'mute'],
        ['Default shortfall', 'public', 'loss'],
        ['Payout', 'public', 'ink'],
      ],
    )
  })

  it('names the selected depositor and submits a withdrawal of their shares', () => {
    const s = snapshot({ a: SUBSCRIBED, b: SUBSCRIBED })
    const a = redeemModel(s, { depositor: 'depositorA' })
    const b = redeemModel(s, { depositor: 'depositorB' })
    assert.equal(a.who, 'Depositor A')
    assert.equal(b.who, 'Depositor B')
    assert.deepEqual(a.cta, {
      action: { type: 'VaultWithdraw', depositor: 'depositorA' },
      label: 'Redeem all shares',
    })
    assert.deepEqual(b.cta.action, { type: 'VaultWithdraw', depositor: 'depositorB' })
  })

  it('values unredeemed shares at the share price when no loss is booked', () => {
    const s = snapshot({ a: SUBSCRIBED, b: SUBSCRIBED })
    assert.deepEqual(amounts(s, 'depositorA'), [
      ['Deposited', 150_000n],
      ['Interest earned', 0n],
      ['Default shortfall', 0n],
      ['Payout', 150_000n],
    ])
    assert.equal(redeemModel(s, { depositor: 'depositorA' }).failure, undefined)
  })

  it('shows the redeemed amount once the shares are gone', () => {
    const a = { shares: 0n, deposited: pub(150_000n), redeemed: pub(150_000n) }
    const s = snapshot({ assetsTotal: 150_000n, assetsAvailable: 55_000n, a, b: SUBSCRIBED })
    assert.deepEqual(amounts(s, 'depositorA'), [
      ['Deposited', 150_000n],
      ['Interest earned', 0n],
      ['Default shortfall', 0n],
      ['Payout', 150_000n],
    ])
  })

  it('reports a redemption the vault cannot cover, with the available assets', () => {
    const a = { shares: 0n, deposited: pub(150_000n), redeemed: pub(150_000n) }
    const b = { ...SUBSCRIBED, redeemFailure: 'tecINSUFFICIENT_FUNDS' }
    const s = snapshot({ assetsTotal: 150_000n, assetsAvailable: 55_000n, a, b })
    const model = redeemModel(s, { depositor: 'depositorB' })
    assert.equal(
      model.failure,
      'Redemption failed with tecINSUFFICIENT_FUNDS: the vault has $55,000 available.',
    )
    assert.deepEqual(amounts(s, 'depositorB').at(-1), ['Payout', 150_000n])
    assert.equal(redeemModel(s, { depositor: 'depositorA' }).failure, undefined)
  })

  it('splits a vault gain into interest earned', () => {
    const s = snapshot({ assetsTotal: 310_000n, a: SUBSCRIBED, b: SUBSCRIBED })
    assert.deepEqual(amounts(s, 'depositorA'), [
      ['Deposited', 150_000n],
      ['Interest earned', 5_000n],
      ['Default shortfall', 0n],
      ['Payout', 155_000n],
    ])
  })

  it('deducts an unrealized loss from the payout as a shortfall', () => {
    const s = snapshot({ lossUnrealized: 95_000n, a: SUBSCRIBED, b: SUBSCRIBED })
    assert.deepEqual(amounts(s, 'depositorB'), [
      ['Deposited', 150_000n],
      ['Interest earned', 0n],
      ['Default shortfall', 47_500n],
      ['Payout', 102_500n],
    ])
  })

  it('shows zeros for a depositor who never subscribed', () => {
    const s = snapshot({ a: SUBSCRIBED })
    assert.deepEqual(amounts(s, 'depositorB'), [
      ['Deposited', 0n],
      ['Interest earned', 0n],
      ['Default shortfall', 0n],
      ['Payout', 0n],
    ])
    assert.deepEqual(amounts(snapshot({}), 'depositorA').at(-1), ['Payout', 0n])
  })
})
