import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { LoanView, Shown, Snapshot, TxRecord } from '@confidential-loans/core/demo-ledger'

import { impairDefault } from './08-impair-default.model.ts'

const START = 1_800_000_000_000
const DUE = START + 60_000
const GRACE_END = DUE + 60_000
const OWED: Shown = { visibility: 'decrypted', value: 105_000n }

function loanB(fields: Partial<LoanView> = {}): LoanView {
  return {
    loanID: 'B'.repeat(64),
    borrower: 'borrowerB',
    principal: { visibility: 'decrypted', value: 100_000n },
    amountOwed: OWED,
    periodicPayment: OWED,
    paymentRemaining: 1,
    paymentInterval: 60,
    gracePeriod: 60,
    startDate: START,
    nextPaymentDueDate: DUE,
    status: 'active',
    ...fields,
  }
}

function record(fields: Partial<TxRecord>): TxRecord {
  return {
    hash: 'F'.repeat(64),
    explorerUrl: '',
    step: 8,
    type: 'LoanManage',
    loan: 'B',
    signers: ['brokerA'],
    result: 'tesSUCCESS',
    closedAt: START,
    amount: undefined,
    flag: undefined,
    ...fields,
  }
}

const IMPAIRED = record({ flag: 'Impaired' })
const DEFAULTED = record({ flag: 'Defaulted' })

function snapshot(now: number, loan?: LoanView, log: readonly TxRecord[] = []): Snapshot {
  const empty = { visibility: 'public', value: 0n } as const
  const depositor = {
    wallet: empty,
    shares: 0n,
    deposited: undefined,
    redeemed: undefined,
    redeemFailure: undefined,
  }
  const balance = { spending: empty, inbox: empty }
  return {
    viewer: 'brokerA',
    ledgerIndex: 1,
    now,
    phase: 'investment',
    vault: {
      vaultID: 'V'.repeat(64),
      assetsTotal: empty,
      assetsAvailable: empty,
      lossUnrealized: empty,
      sharesTotal: 0n,
      subscriptionDate: START - 60_000,
      redemptionDate: START + 1_200_000,
    },
    broker: undefined,
    loans: loan === undefined ? {} : { B: loan },
    offers: {},
    depositors: { depositorA: depositor, depositorB: depositor },
    borrowers: { borrowerA: balance, borrowerB: balance },
    log,
    submitting: undefined,
    errors: [],
  }
}

function points(model: ReturnType<typeof impairDefault>): string[] {
  return model.timeline.map(
    (p) => `${p.done ? 'x' : '-'}${p.loss ? '!' : ''} ${p.label}: ${p.note}`,
  )
}

describe('impairDefault', () => {
  it('submits LoanManage on loan B from both CTAs', () => {
    const model = impairDefault(snapshot(DUE + 1000, loanB()))
    assert.deepEqual(model.impair, {
      action: { type: 'LoanManage', loan: 'B', flag: 'impair' },
      label: 'Impair loan B',
    })
    assert.deepEqual(model.default, {
      action: { type: 'LoanManage', loan: 'B', flag: 'default' },
      label: 'Default loan B',
    })
  })

  it('shows the overdue board once the payment is missed (canvas stage 0)', () => {
    const model = impairDefault(snapshot(DUE + 1000, loanB()))
    assert.equal(model.stage, 'overdue')
    assert.deepEqual(model.status, { text: 'Overdue', tone: 'mute' })
    assert.deepEqual(points(model), [
      'x Started: Loan B active',
      'x Payment due: Missed',
      '- Impaired: Available now',
      '- Grace ends: After the due date',
      '-! Defaulted: After grace ends',
    ])
    assert.deepEqual(model.amountOwed, OWED)
    assert.equal(model.shortfall, undefined)
  })

  it('keeps the payment point open while the loan is not yet due', () => {
    const model = impairDefault(snapshot(DUE, loanB()))
    assert.equal(model.stage, 'notDue')
    assert.deepEqual(model.status, { text: 'Active, payment not yet due', tone: 'mute' })
    assert.deepEqual(points(model).slice(0, 3), [
      'x Started: Loan B active',
      '- Payment due: Not yet due',
      '- Impaired: After the due date',
    ])
  })

  it('shows the impaired board while grace runs (canvas stage 1)', () => {
    const model = impairDefault(snapshot(DUE + 2000, loanB({ status: 'impaired' }), [IMPAIRED]))
    assert.equal(model.stage, 'impaired')
    assert.deepEqual(model.status, { text: 'Impaired, grace period running', tone: 'mute' })
    assert.deepEqual(points(model), [
      'x Started: Loan B active',
      'x Payment due: Missed',
      'x Impaired: Marked late',
      '- Grace ends: After the due date',
      '-! Defaulted: After grace ends',
    ])
    assert.equal(model.default.label, 'Default loan B')
  })

  it('marks grace as passed once the ledger lets the broker default', () => {
    const model = impairDefault(snapshot(GRACE_END + 1000, loanB({ status: 'impaired' })))
    assert.equal(model.stage, 'graceOver')
    assert.deepEqual(model.status, { text: 'Impaired, grace period over', tone: 'mute' })
    assert.deepEqual(points(model).slice(2, 4), ['x Impaired: Marked late', 'x Grace ends: Passed'])
  })

  it('shows the default result with loan B amount owed as the shortfall (canvas stage 2)', () => {
    const loan = loanB({ status: 'defaulted', nextPaymentDueDate: undefined })
    const model = impairDefault(snapshot(GRACE_END + 5000, loan, [IMPAIRED, DEFAULTED]))
    assert.equal(model.stage, 'defaulted')
    assert.deepEqual(model.status, { text: 'Defaulted', tone: 'loss' })
    assert.deepEqual(points(model), [
      'x Started: Loan B active',
      'x Payment due: Missed',
      'x Impaired: Marked late',
      'x Grace ends: Passed',
      'x! Defaulted: Shortfall to depositors',
    ])
    assert.deepEqual(model.shortfall, OWED)
  })

  it('leaves the impaired point open when the loan defaulted without an impair', () => {
    const loan = loanB({ status: 'defaulted', nextPaymentDueDate: undefined })
    const failedImpair = record({ flag: 'Impaired', result: 'tecTOO_SOON' })
    const model = impairDefault(snapshot(GRACE_END + 5000, loan, [failedImpair, DEFAULTED]))
    assert.deepEqual(points(model)[2], '- Impaired: Skipped')
  })

  it('renders an empty board before loan B exists', () => {
    const model = impairDefault(snapshot(DUE, undefined))
    assert.equal(model.stage, 'missing')
    assert.deepEqual(model.status, { text: 'Not created yet', tone: 'mute' })
    assert.equal(model.amountOwed, undefined)
    assert.ok(model.timeline.every((p) => !p.done))
    assert.equal(points(model)[0], '- Started: Not started')
  })

  it('shows a repaid loan as paid with nothing to impair', () => {
    const loan = loanB({ status: 'repaid', paymentRemaining: 0, nextPaymentDueDate: undefined })
    const model = impairDefault(snapshot(DUE, loan))
    assert.equal(model.stage, 'repaid')
    assert.deepEqual(model.status, { text: 'Repaid', tone: 'mute' })
    assert.deepEqual(points(model).slice(0, 3), [
      'x Started: Loan B active',
      'x Payment due: Paid',
      '- Impaired: Not needed',
    ])
  })

  describe('repaid so far', () => {
    const pay = (amount: Shown, fields: Partial<TxRecord> = {}): TxRecord =>
      record({ step: 6, type: 'ConfidentialLoanPay', signers: ['borrowerB'], amount, ...fields })

    it('reads a decrypted 0 when loan B has no payment, as on the canvas', () => {
      const model = impairDefault(snapshot(DUE + 1000, loanB()))
      assert.deepEqual(model.repaid, { visibility: 'decrypted', value: 0n })
    })

    it('sums the successful payments on loan B only', () => {
      const log = [
        pay({ visibility: 'decrypted', value: 40_000n }),
        pay({ visibility: 'decrypted', value: 999n }, { loan: 'A' }),
        pay({ visibility: 'decrypted', value: 777n }, { result: 'tecINSUFFICIENT_FUNDS' }),
        pay({ visibility: 'decrypted', value: 10_000n }),
      ]
      const model = impairDefault(snapshot(DUE + 1000, loanB(), log))
      assert.deepEqual(model.repaid, { visibility: 'decrypted', value: 50_000n })
    })

    it('stays pending while any payment decrypts, and redacted if any cannot', () => {
      const decrypted = pay({ visibility: 'decrypted', value: 1n })
      const pending = impairDefault(
        snapshot(DUE, loanB(), [decrypted, pay({ visibility: 'pending' })]),
      )
      assert.deepEqual(pending.repaid, { visibility: 'pending' })
      const redacted = impairDefault(
        snapshot(DUE, loanB(), [pay({ visibility: 'redacted' }), pay({ visibility: 'pending' })]),
      )
      assert.deepEqual(redacted.repaid, { visibility: 'redacted' })
    })
  })
})
