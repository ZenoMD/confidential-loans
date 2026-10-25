import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { gate } from '@confidential-loans/core/demo-ledger'
import type { DepositorView, Phase, Snapshot } from '@confidential-loans/core/demo-ledger'
import { step02, step02Aside, step02Initial } from './02-deposit.model.ts'

function depositor(wallet: bigint): DepositorView {
  return {
    wallet: { visibility: 'public', value: wallet },
    shares: 0n,
    deposited: undefined,
    redeemed: undefined,
    redeemFailure: undefined,
  }
}

function snapshot(phase: Phase = 'subscription'): Snapshot {
  const balance = {
    spending: { visibility: 'redacted' },
    inbox: { visibility: 'redacted' },
  } as const
  return {
    viewer: 'depositorA',
    ledgerIndex: 10,
    now: 1_000_000,
    phase,
    vault: {
      vaultID: 'V'.repeat(64),
      assetsTotal: { visibility: 'public', value: 0n },
      assetsAvailable: { visibility: 'public', value: 0n },
      lossUnrealized: { visibility: 'public', value: 0n },
      sharesTotal: 0n,
      subscriptionDate: 1_045_000,
      redemptionDate: 2_245_000,
    },
    broker: undefined,
    loans: {},
    offers: {},
    depositors: { depositorA: depositor(400_000n), depositorB: depositor(160_000n) },
    borrowers: { borrowerA: balance, borrowerB: balance },
    log: [],
    submitting: undefined,
    errors: [],
  }
}

describe('step02', () => {
  it('starts on Depositor A with the agreed deposit', () => {
    const m = step02(snapshot(), step02Initial)
    assert.deepEqual(step02Aside(step02Initial).role, {
      role: 'depositor',
      who: 'Depositor A',
      action: 'Subscribes with a public deposit',
    })
    assert.equal(m.amount.text, '150000')
    assert.deepEqual(m.cta, {
      action: { type: 'VaultDeposit', depositor: 'depositorA', amount: 150_000n },
      label: 'Deposit as Depositor A',
    })
  })

  it('offers both depositors in the toggle and presses the selected one', () => {
    const aside = step02Aside({ ...step02Initial, depositor: 'depositorB' })
    assert.deepEqual(aside.toggle, {
      label: 'Depositor',
      options: [
        { value: 'depositorA', label: 'Depositor A' },
        { value: 'depositorB', label: 'Depositor B' },
      ],
      selected: 'depositorB',
    })
  })

  it('names the selected depositor in the role and the CTA', () => {
    const ui = { ...step02Initial, depositor: 'depositorB' } as const
    const m = step02(snapshot(), ui)
    assert.equal(step02Aside(ui).role.who, 'Depositor B')
    assert.equal(m.cta.label, 'Deposit as Depositor B')
    assert.equal(m.cta.action.type === 'VaultDeposit' && m.cta.action.depositor, 'depositorB')
  })

  it('shows the selected depositor wallet and fills Max with it', () => {
    const a = step02(snapshot(), step02Initial)
    const b = step02(snapshot(), { ...step02Initial, depositor: 'depositorB' })
    assert.deepEqual(a.wallet, {
      label: 'Wallet',
      shown: { visibility: 'public', value: 400_000n },
    })
    assert.deepEqual(b.wallet, {
      label: 'Wallet',
      shown: { visibility: 'public', value: 160_000n },
    })
    assert.deepEqual(a.max, { label: 'Max', text: '400000' })
    assert.deepEqual(b.max, { label: 'Max', text: '160000' })
  })

  it('keeps only the digits of what was typed or pasted', () => {
    const m = step02(snapshot(), { ...step02Initial, amount: '$12,000.5' })
    assert.equal(m.amount.text, '120005')
    assert.deepEqual(m.cta.action, {
      type: 'VaultDeposit',
      depositor: 'depositorA',
      amount: 120_005n,
    })
  })

  it('submits an empty field as 0, which the gate rejects', () => {
    const s = snapshot()
    const m = step02(s, { ...step02Initial, amount: '' })
    assert.equal(m.amount.text, '')
    assert.deepEqual(gate(s, m.cta.action), {
      open: false,
      reason: 'closed',
      code: 'temBAD_AMOUNT',
    })
  })

  it('opens the deposit during Subscription and closes it with tecEXPIRED after', () => {
    const open = snapshot()
    const late = snapshot('investment')
    assert.deepEqual(gate(open, step02(open, step02Initial).cta.action), { open: true })
    assert.deepEqual(gate(late, step02(late, step02Initial).cta.action), {
      open: false,
      reason: 'closed',
      code: 'tecEXPIRED',
    })
  })

  it('labels the board as the canvas does', () => {
    const m = step02(snapshot(), step02Initial)
    assert.equal(m.heading, 'Deposit')
    assert.equal(m.amount.label, 'Deposit amount')
    assert.deepEqual(m.next, { href: '#/3', label: 'Continue to step 3' })
  })
})
