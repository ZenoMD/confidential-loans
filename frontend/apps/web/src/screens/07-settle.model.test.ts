import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Shown, Snapshot, TxRecord, Viewer } from '@confidential-loans/core/demo-ledger'
import { model07 } from './07-settle.model.ts'

const pub = (value: bigint) => ({ visibility: 'public', value }) as const
const dec = (value: bigint) => ({ visibility: 'decrypted', value }) as const
const depositor = { wallet: pub(0n), shares: 0n, deposited: undefined, redeemed: undefined }

function record(
  step: TxRecord['step'],
  type: TxRecord['type'],
  more: { loan?: 'A' | 'B'; amount?: Shown; result?: string } = {},
): TxRecord {
  return {
    hash: `${type}-${step}-${more.result ?? 'ok'}`,
    explorerUrl: '',
    step,
    type,
    loan: more.loan,
    signers: ['brokerA'],
    result: more.result ?? 'tesSUCCESS',
    closedAt: 0,
    amount: more.amount,
    flag: undefined,
  }
}

function snapshot(
  log: readonly TxRecord[],
  more: { spending?: Shown; available?: bigint; viewer?: Viewer; noBroker?: true } = {},
): Snapshot {
  const broker = {
    loanBrokerID: 'LB',
    debtMaximum: pub(250_000n),
    debtTotal: pub(200_000n),
    lendingBalance: { spending: more.spending ?? dec(0n), inbox: dec(105_000n) },
  }
  return {
    viewer: more.viewer ?? 'brokerA',
    ledgerIndex: 1,
    now: 0,
    phase: 'investment',
    vault: {
      vaultID: 'V',
      assetsTotal: pub(300_000n),
      assetsAvailable: pub(more.available ?? 100_000n),
      lossUnrealized: pub(0n),
      sharesTotal: 300_000n,
      subscriptionDate: 0,
      redemptionDate: 0,
    },
    broker: more.noBroker === true ? undefined : broker,
    loans: {},
    offers: {},
    depositors: {
      depositorA: { ...depositor, redeemFailure: undefined },
      depositorB: { ...depositor, redeemFailure: undefined },
    },
    borrowers: {
      borrowerA: { spending: dec(0n), inbox: dec(0n) },
      borrowerB: { spending: dec(0n), inbox: dec(0n) },
    },
    log,
    submitting: undefined,
    errors: [],
  }
}

const PAID_A = record(6, 'ConfidentialLoanPay', { loan: 'A', amount: dec(105_000n) })
const MERGED = record(7, 'LoanBrokerMergeInbox')
const SETTLED = record(7, 'LoanBrokerSettle', { amount: pub(105_000n) })
const BEFORE = [record(3, 'LoanBrokerDraw'), record(3, 'LoanBrokerMergeInbox'), PAID_A]

describe('model07', () => {
  it('starts on Merge with both bars upcoming, ignoring the step-3 merge', () => {
    const m = model07(snapshot(BEFORE))
    assert.deepEqual(m.cta, { action: { type: 'LoanBrokerMergeInbox' }, label: 'Merge the inbox' })
    assert.deepEqual(m.steps, [
      { label: 'Merge the inbox', note: 'LoanBrokerMergeInbox', state: 'todo' },
      { label: 'Settle to the vault', note: 'LoanBrokerSettle', state: 'todo' },
    ])
  })

  it('moves to Settle once the step-7 merge succeeded, filling the first bar', () => {
    const m = model07(snapshot([...BEFORE, MERGED]))
    assert.deepEqual(m.cta, { action: { type: 'LoanBrokerSettle' }, label: 'Settle to the vault' })
    assert.deepEqual(
      m.steps.map((s) => s.state),
      ['done', 'todo'],
    )
  })

  it('stays on Merge when the step-7 merge failed', () => {
    const failed = record(7, 'LoanBrokerMergeInbox', { result: 'tecNO_PERMISSION' })
    assert.equal(model07(snapshot([...BEFORE, failed])).cta?.action.type, 'LoanBrokerMergeInbox')
  })

  it('offers no CTA after the settle succeeded, with both bars done (no replay, K1)', () => {
    const m = model07(snapshot([...BEFORE, MERGED, SETTLED]))
    assert.equal(m.cta, undefined)
    assert.deepEqual(
      m.steps.map((s) => s.state),
      ['done', 'done'],
    )
  })

  it('stays on Settle when the settle failed', () => {
    const failed = record(7, 'LoanBrokerSettle', {
      amount: pub(1n),
      result: 'tecINSUFFICIENT_FUNDS',
    })
    const m = model07(snapshot([...BEFORE, MERGED, failed]))
    assert.equal(m.cta?.action.type, 'LoanBrokerSettle')
    assert.equal(m.amountSettled, undefined)
  })

  it("shows loan A's step-6 payment as paid in full and loan B with no payment yet", () => {
    assert.deepEqual(model07(snapshot(BEFORE)).repayments, [
      { label: 'Loan A, Borrower A', paid: dec(105_000n) },
      { label: 'Loan B, Borrower B', paid: undefined },
    ])
  })

  it('shows no payment for a loan whose payment failed', () => {
    const failed = record(6, 'ConfidentialLoanPay', {
      loan: 'A',
      amount: dec(105_000n),
      result: 'tecINSUFFICIENT_FUNDS',
    })
    assert.equal(model07(snapshot([failed])).repayments[0]?.paid, undefined)
  })

  it('shows the Lending Balance spending and the public vault availability', () => {
    const m = model07(snapshot([...BEFORE, MERGED], { spending: dec(105_000n), available: 0n }))
    assert.deepEqual(m.lendingBalance, dec(105_000n))
    assert.deepEqual(m.vaultAvailable, pub(0n))
  })

  it('leaves the Lending Balance empty before step 1 creates the broker', () => {
    assert.equal(model07(snapshot([], { noBroker: true })).lendingBalance, undefined)
  })

  it('shows the settle record amount, public, only once settled', () => {
    assert.equal(model07(snapshot([...BEFORE, MERGED])).amountSettled, undefined)
    const settled = model07(snapshot([...BEFORE, MERGED, SETTLED]))
    assert.deepEqual(settled.amountSettled, pub(105_000n))
  })

  it('rejects a snapshot seen by anyone but Broker A', () => {
    assert.throws(() => model07(snapshot(BEFORE, { viewer: 'outsider' })), /brokerA/)
  })
})
