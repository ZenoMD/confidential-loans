import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Shown } from '@confidential-loans/core/amount'
import type { LoanView, Snapshot, TxRecord, Viewer } from '@confidential-loans/core/demo-ledger'
import { explorerDefault } from './09-explorer-default.model.ts'

const REDACTED: Shown = { visibility: 'redacted' }

function pub(value: bigint): Shown {
  return { visibility: 'public', value }
}

function decrypted(value: bigint): Shown {
  return { visibility: 'decrypted', value }
}

function record(fields: Partial<TxRecord> & Pick<TxRecord, 'step' | 'type'>): TxRecord {
  return {
    hash: `${fields.type}-${fields.step}-${fields.flag ?? ''}-${fields.result ?? ''}`,
    explorerUrl: `https://explorer.test/tx/${fields.type}`,
    loan: undefined,
    signers: ['brokerA'],
    result: 'tesSUCCESS',
    closedAt: 0,
    amount: undefined,
    flag: undefined,
    ...fields,
  }
}

function loanB(amountOwed: Shown): LoanView {
  return {
    loanID: 'LB',
    borrower: 'borrowerB',
    principal: amountOwed,
    amountOwed,
    periodicPayment: amountOwed,
    paymentRemaining: 1,
    paymentInterval: 60,
    gracePeriod: 60,
    startDate: 0,
    nextPaymentDueDate: undefined,
    status: 'defaulted',
  }
}

function snapshot(viewer: Viewer, log: readonly TxRecord[], loans: Snapshot['loans'] = {}) {
  const empty = { spending: pub(0n), inbox: pub(0n) }
  const depositor = {
    wallet: { visibility: 'public', value: 0n },
    shares: 0n,
    deposited: undefined,
    redeemed: undefined,
    redeemFailure: undefined,
  } as const
  const s: Snapshot = {
    viewer,
    ledgerIndex: 1,
    now: 0,
    phase: 'investment',
    vault: {
      vaultID: 'V',
      assetsTotal: { visibility: 'public', value: 0n },
      assetsAvailable: { visibility: 'public', value: 0n },
      lossUnrealized: { visibility: 'public', value: 0n },
      sharesTotal: 0n,
      subscriptionDate: 0,
      redemptionDate: 0,
    },
    broker: undefined,
    loans,
    offers: {},
    depositors: { depositorA: depositor, depositorB: depositor },
    borrowers: { borrowerA: empty, borrowerB: empty },
    log,
    submitting: undefined,
    errors: [],
  }
  return s
}

/** A whole run up to step 8, with the payment as `viewer` sees it. */
function defaultLog(paid: Shown): TxRecord[] {
  return [
    record({ step: 1, type: 'LoanBrokerSet' }),
    record({ step: 4, type: 'LoanSet', loan: 'A', signers: ['brokerA', 'borrowerA'] }),
    record({
      step: 6,
      type: 'ConfidentialMPTMergeInbox',
      loan: 'A',
      signers: ['borrowerA'],
    }),
    record({
      step: 6,
      type: 'ConfidentialLoanPay',
      loan: 'A',
      signers: ['borrowerA'],
      amount: paid,
    }),
    record({ step: 7, type: 'LoanBrokerMergeInbox' }),
    record({ step: 7, type: 'LoanBrokerSettle', amount: pub(105_000n) }),
    record({ step: 8, type: 'LoanManage', loan: 'B', flag: 'Impaired' }),
    record({ step: 8, type: 'LoanManage', loan: 'B', flag: 'Defaulted' }),
  ]
}

describe('explorerDefault', () => {
  it('lists steps 6 to 8 as the canvas rows', () => {
    const model = explorerDefault('outsider', snapshot('outsider', defaultLog(REDACTED)))
    assert.deepEqual(
      model.rows.map((r) => [r.step, r.transaction, r.signedBy]),
      [
        ['6', 'ConfidentialMPTMergeInbox', 'Borrower A'],
        ['6', 'ConfidentialLoanPay', 'Borrower A'],
        ['7', 'LoanBrokerMergeInbox', 'Broker A'],
        ['7', 'LoanBrokerSettle', 'Broker A'],
        ['8', 'LoanManage, loan B', 'Broker A'],
        ['8', 'LoanManage, loan B', 'Broker A'],
      ],
    )
  })

  it('redacts the payment for the Outsider and flags both LoanManage rows', () => {
    const model = explorerDefault('outsider', snapshot('outsider', defaultLog(REDACTED)))
    assert.deepEqual(
      model.rows.map((r) => r.amount),
      [
        { kind: 'none', text: 'No amount' },
        { kind: 'value', shown: REDACTED },
        { kind: 'none', text: 'No amount' },
        { kind: 'value', shown: pub(105_000n) },
        { kind: 'flag', text: 'Impaired' },
        { kind: 'flag', text: 'Defaulted' },
      ],
    )
  })

  it('shows the payment decrypted for the Auditor', () => {
    const model = explorerDefault('auditor', snapshot('auditor', defaultLog(decrypted(105_000n))))
    assert.deepEqual(model.rows[1]?.amount, { kind: 'value', shown: decrypted(105_000n) })
  })

  it('totals the payment, the settle and loan B amount owed as the viewer sees them', () => {
    const s = snapshot('auditor', defaultLog(decrypted(105_000n)), {
      B: loanB(decrypted(105_000n)),
    })
    assert.deepEqual(explorerDefault('auditor', s).totals, [
      { label: 'Loan A repaid', amount: { kind: 'value', shown: decrypted(105_000n) } },
      { label: 'Settled', amount: { kind: 'value', shown: pub(105_000n) } },
      { label: 'Loan B amount owed', amount: { kind: 'value', shown: decrypted(105_000n) } },
    ])
  })

  it('redacts the encrypted totals for the Outsider', () => {
    const s = snapshot('outsider', defaultLog(REDACTED), { B: loanB(REDACTED) })
    assert.deepEqual(
      explorerDefault('outsider', s).totals.map((t) => t.amount),
      [
        { kind: 'value', shown: REDACTED },
        { kind: 'value', shown: pub(105_000n) },
        { kind: 'value', shown: REDACTED },
      ],
    )
  })

  it('adds up every successful settle', () => {
    const log = [
      record({ step: 7, type: 'LoanBrokerSettle', amount: pub(100_000n), hash: 'S1' }),
      record({ step: 7, type: 'LoanBrokerSettle', amount: pub(5_000n), hash: 'S2' }),
      record({
        step: 7,
        type: 'LoanBrokerSettle',
        amount: pub(1n),
        hash: 'S3',
        result: 'tecINSUFFICIENT_FUNDS',
      }),
    ]
    const settled = explorerDefault('outsider', snapshot('outsider', log)).totals[1]
    assert.deepEqual(settled?.amount, { kind: 'value', shown: pub(105_000n) })
  })

  it('shows "No amount" for each total whose source does not exist yet', () => {
    const totals = explorerDefault('outsider', snapshot('outsider', [])).totals
    assert.deepEqual(
      totals.map((t) => t.amount),
      [
        { kind: 'none', text: 'No amount' },
        { kind: 'none', text: 'No amount' },
        { kind: 'none', text: 'No amount' },
      ],
    )
  })

  it('asks for step 6 while steps 6 to 8 have no transaction', () => {
    const log = defaultLog(REDACTED).filter((r) => r.step < 6)
    assert.deepEqual(explorerDefault('outsider', snapshot('outsider', log)).status, {
      kind: 'prerequisite',
      text: 'Complete step 6 first',
      href: '#/6',
    })
  })

  it('shows a loading line, no rows and empty totals before the first snapshot', () => {
    const model = explorerDefault('outsider', null)
    assert.deepEqual(model.status, { kind: 'loading', text: 'Reading the ledger' })
    assert.deepEqual(model.rows, [])
    assert.deepEqual(
      model.totals.map((t) => t.amount.kind),
      ['none', 'none', 'none'],
    )
  })

  it('names the view and links back to step 5 and on to step 10', () => {
    const model = explorerDefault('auditor', null)
    assert.equal(model.who, 'Auditor')
    assert.equal(model.action, 'Reads the ledger after the default')
    assert.equal(model.toggle.selected, 'auditor')
    assert.deepEqual(model.earlier, { href: '#/5', label: 'Earlier transactions on step 5' })
    assert.deepEqual(model.next, { href: '#/10', label: 'Continue to step 10' })
  })
})
