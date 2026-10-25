import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ActionFailed } from '@confidential-loans/core/demo-ledger'
import { TERMS } from './snapshot.fixture.ts'
import type { Action, Gate } from '@confidential-loans/core/demo-ledger'
import { actionKey, ctaView, failureText, formatClock } from './cta.ts'

const DRAW: Action = { type: 'LoanBrokerDraw', amount: 200_000n }
const MERGE: Action = { type: 'LoanBrokerMergeInbox' }
const OPEN: Gate = { open: true }

function view(gate: Gate | undefined, extra: Partial<Parameters<typeof ctaView>[0]> = {}) {
  return ctaView({ label: 'Draw', action: DRAW, gate, submitting: undefined, ...extra })
}

describe('ctaView', () => {
  it('enables the labelled button when the gate is open', () => {
    assert.deepEqual(view(OPEN), { text: 'Draw', disabled: false, line: undefined })
  })

  it('reads Submitting while this action runs', () => {
    const submitting: Action = { type: 'LoanBrokerDraw', amount: 200_000n }
    assert.deepEqual(view(OPEN, { submitting, failure: 'tecX: earlier' }), {
      text: 'Submitting',
      disabled: true,
      line: undefined,
    })
  })

  it('disables the button while another action runs', () => {
    assert.deepEqual(view(OPEN, { submitting: MERGE }), {
      text: 'Draw',
      disabled: true,
      line: undefined,
    })
  })

  it('disables the button while the first snapshot loads', () => {
    assert.deepEqual(view(undefined), { text: 'Draw', disabled: true, line: undefined })
  })

  it('shows when a time gate opens', () => {
    const at = new Date(2026, 9, 25, 9, 5, 7).getTime()
    assert.deepEqual(view({ open: false, reason: 'opens', at }), {
      text: 'Draw',
      disabled: true,
      line: { kind: 'note', text: 'Opens at 09:05:07' },
    })
  })

  it('says what must happen first', () => {
    assert.deepEqual(view({ open: false, reason: 'blocked', why: 'Create the LoanBroker first' }), {
      text: 'Draw',
      disabled: true,
      line: { kind: 'note', text: 'Create the LoanBroker first' },
    })
  })

  it('shows the engine code the ledger would reject with', () => {
    assert.deepEqual(view({ open: false, reason: 'closed', code: 'tecEXPIRED' }), {
      text: 'Draw',
      disabled: true,
      line: { kind: 'note', text: 'tecEXPIRED' },
    })
  })

  it('reads Done once the step has run, hiding an earlier failure', () => {
    assert.deepEqual(view({ open: false, reason: 'done' }, { failure: 'busy: x' }), {
      text: 'Done',
      disabled: true,
      line: undefined,
    })
  })

  it('alerts a failure and allows a retry while the gate stays open', () => {
    const failure = 'tecINSUFFICIENT_FUNDS: not enough'
    assert.deepEqual(view(OPEN, { failure }), {
      text: 'Draw',
      disabled: false,
      line: { kind: 'alert', text: failure },
    })
  })

  it('alerts a failure over the gate line', () => {
    const gate: Gate = { open: false, reason: 'closed', code: 'tecEXPIRED' }
    assert.deepEqual(view(gate, { failure: 'tecEXPIRED: expired' }), {
      text: 'Draw',
      disabled: true,
      line: { kind: 'alert', text: 'tecEXPIRED: expired' },
    })
  })
})

describe('actionKey', () => {
  it('matches actions with the same fields, including bigints and terms', () => {
    const a: Action = { type: 'LoanSetSign', borrower: 'borrowerA', terms: { ...TERMS } }
    const b: Action = { type: 'LoanSetSign', borrower: 'borrowerA', terms: TERMS }
    assert.equal(actionKey(a), actionKey(b))
  })

  it('tells apart actions that differ in any field', () => {
    assert.notEqual(actionKey(DRAW), actionKey({ type: 'LoanBrokerDraw', amount: 1n }))
    assert.notEqual(
      actionKey({ type: 'VaultWithdraw', depositor: 'depositorA' }),
      actionKey({ type: 'VaultWithdraw', depositor: 'depositorB' }),
    )
  })
})

describe('formatClock', () => {
  it('pads hours, minutes and seconds to two digits in local time', () => {
    assert.equal(formatClock(new Date(2026, 0, 1, 0, 0, 0).getTime()), '00:00:00')
    assert.equal(formatClock(new Date(2026, 0, 1, 23, 59, 9).getTime()), '23:59:09')
  })
})

describe('failureText', () => {
  it('leads with the engine code of an ActionFailed', () => {
    const error = new ActionFailed('tecNO_PERMISSION', 'LoanSet failed')
    assert.equal(failureText(error), 'tecNO_PERMISSION: LoanSet failed')
  })

  it('uses the message of any other error, or the thrown value', () => {
    assert.equal(failureText(new Error('socket closed')), 'socket closed')
    assert.equal(failureText('boom'), 'boom')
  })
})
