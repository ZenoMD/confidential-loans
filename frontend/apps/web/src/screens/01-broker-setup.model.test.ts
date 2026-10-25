import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { gate } from '@confidential-loans/core/demo-ledger'
import type { BrokerView, Snapshot } from '@confidential-loans/core/demo-ledger'
import { step01, step01Initial } from './01-broker-setup.model.ts'

const BROKER: BrokerView = {
  loanBrokerID: 'B'.repeat(64),
  debtMaximum: { visibility: 'public', value: 300_000n },
  debtTotal: { visibility: 'public', value: 0n },
  lendingBalance: { spending: { visibility: 'redacted' }, inbox: { visibility: 'redacted' } },
}

function snapshot(broker?: BrokerView): Snapshot {
  const depositor = {
    wallet: { visibility: 'public', value: 0n },
    shares: 0n,
    deposited: undefined,
    redeemed: undefined,
    redeemFailure: undefined,
  } as const
  const balance = {
    spending: { visibility: 'redacted' },
    inbox: { visibility: 'redacted' },
  } as const
  return {
    viewer: 'brokerA',
    ledgerIndex: 10,
    now: 1_000_000,
    phase: 'subscription',
    vault: {
      vaultID: 'V'.repeat(64),
      assetsTotal: { visibility: 'public', value: 0n },
      assetsAvailable: { visibility: 'public', value: 0n },
      lossUnrealized: { visibility: 'public', value: 0n },
      sharesTotal: 0n,
      subscriptionDate: 1_045_000,
      redemptionDate: 2_245_000,
    },
    broker,
    loans: {},
    offers: {},
    depositors: { depositorA: depositor, depositorB: depositor },
    borrowers: { borrowerA: balance, borrowerB: balance },
    log: [],
    submitting: undefined,
    errors: [],
  }
}

describe('step01', () => {
  it('shows the canvas labels and the fixed terms', () => {
    const m = step01(snapshot(), step01Initial)
    assert.deepEqual(m.role, {
      role: 'broker',
      who: 'Broker A',
      action: 'Creates the confidential LoanBroker',
    })
    assert.equal(m.heading, 'Terms')
    assert.equal(m.debtMaximum.label, 'Debt maximum')
    assert.deepEqual(m.terms, [
      { label: 'Management fee', text: 'None' },
      { label: 'First-loss cover', text: 'None' },
    ])
    assert.equal(m.cta.label, 'Create confidential LoanBroker')
    assert.deepEqual(m.next, { href: '#/2', label: 'Continue to step 2' })
  })

  it('prefills the agreed debt maximum and submits it', () => {
    const m = step01(snapshot(), step01Initial)
    assert.equal(m.debtMaximum.text, '250000')
    assert.equal(m.debtMaximum.readOnly, false)
    assert.deepEqual(m.cta.action, { type: 'LoanBrokerSet', debtMaximum: 250_000n })
  })

  it('keeps only the digits of what was typed or pasted', () => {
    const m = step01(snapshot(), { debtMaximum: '$1,234.5x' })
    assert.equal(m.debtMaximum.text, '12345')
    assert.deepEqual(m.cta.action, { type: 'LoanBrokerSet', debtMaximum: 12_345n })
  })

  it('submits an empty field as 0, which the ledger reads as no cap', () => {
    const m = step01(snapshot(), { debtMaximum: '' })
    assert.equal(m.debtMaximum.text, '')
    assert.deepEqual(m.cta.action, { type: 'LoanBrokerSet', debtMaximum: 0n })
  })

  it('opens the CTA until the broker exists', () => {
    const s = snapshot()
    assert.deepEqual(gate(s, step01(s, step01Initial).cta.action), { open: true })
  })

  it('shows the ledger debt maximum, read-only, once the broker exists', () => {
    const s = snapshot(BROKER)
    const m = step01(s, { debtMaximum: '999' })
    assert.equal(m.debtMaximum.text, '300000')
    assert.equal(m.debtMaximum.readOnly, true)
    assert.deepEqual(gate(s, m.cta.action), { open: false, reason: 'done' })
  })
})
