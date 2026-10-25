import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Shown } from '@confidential-loans/core/amount'
import type {
  Action,
  LoanView,
  Snapshot,
  TransactionType,
  TxRecord,
} from '@confidential-loans/core/demo-ledger'
import { repayModel } from './06-repay.model.ts'

const MERGE: Action = { type: 'ConfidentialMPTMergeInbox', borrower: 'borrowerA' }
const PAY: Action = { type: 'ConfidentialLoanPay', loan: 'A' }

function decrypted(value: bigint): Shown {
  return { visibility: 'decrypted', value }
}

function pub(value: bigint) {
  return { visibility: 'public', value } as const
}

function record(type: TransactionType, extra: Partial<TxRecord> = {}): TxRecord {
  return {
    hash: `${type}-${extra.closedAt ?? 0}`,
    explorerUrl: '',
    step: 6,
    type,
    loan: 'A',
    signers: ['borrowerA'],
    result: 'tesSUCCESS',
    closedAt: 0,
    amount: undefined,
    flag: undefined,
    ...extra,
  }
}

function loanA(status: LoanView['status'], amountOwed: bigint): LoanView {
  return {
    loanID: 'LOAN-A',
    borrower: 'borrowerA',
    principal: decrypted(100_000n),
    amountOwed: decrypted(amountOwed),
    periodicPayment: decrypted(105_000n),
    paymentRemaining: status === 'repaid' ? 0 : 1,
    paymentInterval: 60,
    gracePeriod: 60,
    startDate: 0,
    nextPaymentDueDate: status === 'repaid' ? undefined : 60_000,
    status,
  }
}

const LOAN_SET = record('LoanSet', { step: 4, signers: ['brokerA', 'borrowerA'] })

interface Fixture {
  readonly spending?: bigint
  readonly inbox?: bigint
  readonly loan?: LoanView | undefined
  readonly log?: readonly TxRecord[]
  readonly submitting?: Action
}

function snapshot(f: Fixture = {}): Snapshot {
  const depositor = { wallet: pub(0n), shares: 0n, deposited: undefined, redeemed: undefined }
  const none = { spending: decrypted(0n), inbox: decrypted(0n) }
  const loan = 'loan' in f ? f.loan : loanA('active', 105_000n)
  return {
    viewer: 'borrowerA',
    ledgerIndex: 1,
    now: 0,
    phase: 'investment',
    vault: {
      vaultID: 'VAULT',
      assetsTotal: pub(0n),
      assetsAvailable: pub(0n),
      lossUnrealized: pub(0n),
      sharesTotal: 0n,
      subscriptionDate: 0,
      redemptionDate: 0,
    },
    broker: undefined,
    loans: loan === undefined ? {} : { A: loan },
    offers: {},
    depositors: {
      depositorA: { ...depositor, redeemFailure: undefined },
      depositorB: { ...depositor, redeemFailure: undefined },
    },
    borrowers: {
      borrowerA: {
        spending: decrypted(f.spending ?? 20_000n),
        inbox: decrypted(f.inbox ?? 100_000n),
      },
      borrowerB: none,
    },
    log: f.log ?? [LOAN_SET],
    submitting: f.submitting,
    errors: [],
  }
}

const MERGED_LOG = [LOAN_SET, record('ConfidentialMPTMergeInbox', { closedAt: 1 })]
const PAID_LOG = [
  ...MERGED_LOG,
  record('ConfidentialLoanPay', { closedAt: 2, amount: decrypted(105_000n) }),
]

function bars(s: Snapshot): string[] {
  return repayModel(s).steps.map((step) => step.state)
}

describe('repayModel', () => {
  it('names both steps, without the protocol sentence in the pay note', () => {
    assert.deepEqual(
      repayModel(snapshot()).steps.map(({ label, note }) => [label, note]),
      [
        ['Merge the inbox', 'Inbox into spending'],
        ['Pay the amount owed', 'Full payment, exactly the amount owed.'],
      ],
    )
  })

  it('before the merge, shows the live balances and pays the amount owed', () => {
    const model = repayModel(snapshot())
    assert.equal(model.stage, 'ready')
    assert.deepEqual(model.values, [
      { label: 'Spending', shown: decrypted(20_000n) },
      { label: 'Inbox', shown: decrypted(100_000n) },
      { label: 'Amount owed', shown: decrypted(105_000n) },
      { label: 'Payment', shown: decrypted(105_000n) },
    ])
    assert.deepEqual(bars(snapshot()), ['todo', 'todo'])
    assert.deepEqual(model.cta, { action: MERGE, label: 'Repay loan A' })
  })

  it('while the merge runs, marks the merge current', () => {
    const s = snapshot({ submitting: MERGE })
    assert.equal(repayModel(s).stage, 'merging')
    assert.deepEqual(bars(s), ['current', 'todo'])
    assert.deepEqual(repayModel(s).cta, { action: MERGE, label: 'Merging the inbox' })
  })

  it('once merged, submits the payment next', () => {
    const s = snapshot({ spending: 120_000n, inbox: 0n, log: MERGED_LOG })
    const model = repayModel(s)
    assert.equal(model.stage, 'merged')
    assert.deepEqual(bars(s), ['done', 'todo'])
    assert.deepEqual(model.cta, { action: PAY, label: 'Repay loan A' })
    assert.deepEqual(model.values.slice(0, 2), [
      { label: 'Spending', shown: decrypted(120_000n) },
      { label: 'Inbox', shown: decrypted(0n) },
    ])
  })

  it('while the payment runs, marks the merge done and the payment current', () => {
    const s = snapshot({ inbox: 0n, log: MERGED_LOG, submitting: PAY })
    assert.equal(repayModel(s).stage, 'paying')
    assert.deepEqual(bars(s), ['done', 'current'])
    assert.deepEqual(repayModel(s).cta, { action: PAY, label: 'Paying loan A' })
  })

  it('once repaid, updates the amount owed and shows the amount paid', () => {
    const s = snapshot({
      spending: 15_000n,
      inbox: 0n,
      loan: loanA('repaid', 0n),
      log: PAID_LOG,
    })
    const model = repayModel(s)
    assert.equal(model.stage, 'repaid')
    assert.deepEqual(bars(s), ['done', 'done'])
    assert.deepEqual(model.cta, { action: PAY, label: 'Repaid' })
    assert.deepEqual(model.values, [
      { label: 'Spending', shown: decrypted(15_000n) },
      { label: 'Inbox', shown: decrypted(0n) },
      { label: 'Amount owed', shown: decrypted(0n) },
      { label: 'Payment', shown: decrypted(105_000n) },
    ])
  })

  it('ignores a merge that ran before loan A was created', () => {
    const early = record('ConfidentialMPTMergeInbox', { closedAt: -1 })
    const s = snapshot({ log: [early, LOAN_SET] })
    assert.equal(repayModel(s).stage, 'ready')
    assert.deepEqual(repayModel(s).cta.action, MERGE)
  })

  it('ignores a failed merge', () => {
    const failed = record('ConfidentialMPTMergeInbox', { result: 'tecNO_PERMISSION' })
    const s = snapshot({ log: [LOAN_SET, failed] })
    assert.equal(repayModel(s).stage, 'ready')
  })

  it('ignores loan B activity', () => {
    const s = snapshot({
      log: [LOAN_SET, record('ConfidentialMPTMergeInbox', { loan: 'B', signers: ['borrowerB'] })],
      submitting: { type: 'ConfidentialMPTMergeInbox', borrower: 'borrowerB' },
    })
    assert.equal(repayModel(s).stage, 'ready')
  })

  it('without loan A, shows only the balances and submits the merge for the gate to stop', () => {
    const model = repayModel(snapshot({ loan: undefined, log: [] }))
    assert.deepEqual(
      model.values.map((v) => v.label),
      ['Spending', 'Inbox'],
    )
    assert.deepEqual(model.cta, { action: MERGE, label: 'Repay loan A' })
  })

  it('rejects a snapshot seen by anyone but Borrower A', () => {
    assert.throws(() => repayModel({ ...snapshot(), viewer: 'outsider' }), /borrowerA.*outsider/)
  })
})
