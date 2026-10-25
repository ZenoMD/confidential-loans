import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DEMO_TERMS } from '@confidential-loans/core/demo-ledger'
import type { LoanLabel, LoanView, Snapshot } from '@confidential-loans/core/demo-ledger'
import { originate, originateAside, ORIGINATE_VIEWER } from './04-originate.model.ts'

const NOW = Date.UTC(2026, 9, 25, 12, 0, 0)
const PUBLIC_ZERO = { visibility: 'public', value: 0n } as const
const ZERO_BALANCE = { spending: PUBLIC_ZERO, inbox: PUBLIC_ZERO }
const DEPOSITOR = {
  wallet: PUBLIC_ZERO,
  shares: 0n,
  deposited: undefined,
  redeemed: undefined,
  redeemFailure: undefined,
}

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    viewer: 'brokerA',
    ledgerIndex: 100,
    now: NOW,
    phase: 'investment',
    vault: {
      vaultID: 'V',
      assetsTotal: PUBLIC_ZERO,
      assetsAvailable: PUBLIC_ZERO,
      lossUnrealized: PUBLIC_ZERO,
      sharesTotal: 0n,
      subscriptionDate: NOW - 10_000,
      redemptionDate: NOW + 600_000,
    },
    broker: undefined,
    loans: {},
    offers: {},
    depositors: { depositorA: DEPOSITOR, depositorB: DEPOSITOR },
    borrowers: { borrowerA: ZERO_BALANCE, borrowerB: ZERO_BALANCE },
    log: [],
    submitting: undefined,
    errors: [],
    ...overrides,
  }
}

function offered(loan: LoanLabel): Snapshot {
  return snapshot({ offers: { [loan]: { loan, terms: DEMO_TERMS, signedAt: NOW } } })
}

function loanView(loan: LoanLabel, amountOwed: bigint): LoanView {
  return {
    loanID: `L${loan}`,
    borrower: loan === 'A' ? 'borrowerA' : 'borrowerB',
    principal: { visibility: 'decrypted', value: 100_000n },
    amountOwed: { visibility: 'decrypted', value: amountOwed },
    periodicPayment: { visibility: 'decrypted', value: 105_000n },
    paymentRemaining: 1,
    paymentInterval: 60,
    gracePeriod: 60,
    startDate: NOW,
    nextPaymentDueDate: NOW + 60_000,
    status: 'active',
  }
}

function created(loan: LoanLabel, amountOwed = 105_000n): Snapshot {
  return snapshot({ loans: { [loan]: loanView(loan, amountOwed) } })
}

function decrypted(value: bigint) {
  return { visibility: 'decrypted', value } as const
}

describe('originate', () => {
  it('reads the snapshot as Broker A, who holds the key to both loans', () => {
    assert.equal(ORIGINATE_VIEWER, 'brokerA')
  })

  it('names the role and the selected loan with its borrower, before the ledger is read', () => {
    const a = originateAside('A')
    assert.equal(a.role.who, 'Broker and borrowers')
    assert.equal(a.role.action, 'Co-sign loan A with Borrower A')
    assert.equal(originateAside('B').role.action, 'Co-sign loan B with Borrower B')
  })

  it('offers the Loan A and Loan B toggle with the selected loan pressed', () => {
    const model = originateAside('B')
    assert.equal(model.toggle.label, 'Loan')
    assert.deepEqual(model.toggle.options, [
      { value: 'A', label: 'Loan A' },
      { value: 'B', label: 'Loan B' },
    ])
    assert.equal(model.toggle.selected, 'B')
  })

  it('shows the agreed terms as the broker sees them before the loan exists', () => {
    assert.deepEqual(originate(snapshot(), 'A').values, [
      { label: 'Principal', shown: decrypted(100_000n) },
      { label: 'Periodic payment', shown: decrypted(105_000n) },
      { label: 'Amount owed', shown: decrypted(105_000n) },
    ])
  })

  it('shows the loan entry amounts once the loan exists, so repayment is reflected', () => {
    const values = originate(created('A', 0n), 'A').values
    assert.deepEqual(
      values.map((v) => [v.label, v.shown]),
      [
        ['Principal', decrypted(100_000n)],
        ['Periodic payment', decrypted(105_000n)],
        ['Amount owed', decrypted(0n)],
      ],
    )
  })

  it('shows a pending decrypt of a loan amount as pending', () => {
    const pending = snapshot({
      loans: { A: { ...loanView('A', 105_000n), principal: { visibility: 'pending' } } },
    })
    assert.deepEqual(originate(pending, 'A').values[0]?.shown, { visibility: 'pending' })
  })

  it('prefills the schedule from the demo terms', () => {
    assert.deepEqual(originate(snapshot(), 'A').schedule, [
      { label: 'Payment interval', value: '60 seconds' },
      { label: 'Payments', value: '1' },
      { label: 'Grace period', value: '60 seconds' },
    ])
  })

  it('waits for the broker before anything is signed', () => {
    const model = originate(snapshot(), 'A')
    assert.deepEqual(model.steps, [
      { label: 'Broker signs', note: 'Waiting', state: 'current' },
      { label: 'Borrower A co-signs', note: 'Waiting', state: 'todo' },
      { label: 'LoanSet', note: 'Needs both signatures', state: 'todo' },
    ])
    assert.deepEqual(model.cta, {
      action: { type: 'LoanSetSign', loan: 'A', terms: DEMO_TERMS },
      label: 'Sign as Broker',
    })
  })

  it('asks the borrower to co-sign once the broker offer is held', () => {
    const model = originate(offered('B'), 'B')
    assert.deepEqual(model.steps, [
      { label: 'Broker signs', note: 'Signed', state: 'done' },
      { label: 'Borrower B co-signs', note: 'Signing now', state: 'current' },
      { label: 'LoanSet', note: 'Needs both signatures', state: 'todo' },
    ])
    assert.deepEqual(model.cta, {
      action: { type: 'LoanSetCosign', loan: 'B' },
      label: 'Co-sign as Borrower B',
    })
  })

  it('reports the principal sent once the LoanSet is on the ledger, with no replay', () => {
    const model = originate(created('A'), 'A')
    assert.deepEqual(model.steps, [
      { label: 'Broker signs', note: 'Signed', state: 'done' },
      { label: 'Borrower A co-signs', note: 'Co-signed', state: 'done' },
      { label: 'LoanSet', note: 'Principal sent to Borrower A', state: 'current' },
    ])
    assert.deepEqual(model.cta, {
      action: { type: 'LoanSetCosign', loan: 'A' },
      label: 'Co-sign as Borrower A',
    })
  })

  it('derives each loan stage from its own ledger state', () => {
    const both = snapshot({
      loans: { A: loanView('A', 105_000n) },
      offers: { B: { loan: 'B', terms: DEMO_TERMS, signedAt: NOW } },
    })
    assert.equal(originate(both, 'A').steps[2]?.note, 'Principal sent to Borrower A')
    assert.equal(originate(both, 'B').steps[1]?.note, 'Signing now')
    assert.equal(originate(created('A'), 'B').cta.label, 'Sign as Broker')
  })

  it('links on to the step 5 explorer', () => {
    assert.deepEqual(originate(snapshot(), 'A').next, {
      href: '#/5',
      label: 'Continue to step 5',
    })
  })
})
