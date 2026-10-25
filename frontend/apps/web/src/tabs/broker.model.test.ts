import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DEMO_TERMS } from '@confidential-loans/core/demo-ledger'
import { brokerInitial, brokerTab } from './broker.model.ts'
import { loan, NOW, snapshot } from '#web/snapshot.fixture.ts'

describe('brokerTab', () => {
  it('offers to create the LoanBroker only until it exists', () => {
    const before = brokerTab(snapshot({ broker: undefined }), brokerInitial)
    assert.deepEqual(before.create?.action, { type: 'LoanBrokerSet', debtMaximum: 250_000n })
    assert.equal(before.lending[0]?.shown.visibility, 'redacted')
    assert.equal(brokerTab(snapshot(), brokerInitial).create, undefined)
  })

  it('signs an offer with the typed terms to the selected borrower', () => {
    const ui = {
      ...brokerInitial,
      borrower: 'borrowerB' as const,
      terms: { ...brokerInitial.terms, paymentTotal: '2', periodicPayment: '$52,500' },
    }
    const m = brokerTab(snapshot(), ui)
    assert.deepEqual(m.offer.action, {
      type: 'LoanSetSign',
      borrower: 'borrowerB',
      terms: { ...DEMO_TERMS, paymentTotal: 2, periodicPayment: 52_500n },
    })
    assert.equal(m.offer.label, 'Sign offer to Borrower B')
    assert.equal(m.offer.fields.find((f) => f.key === 'periodicPayment')?.text, '52500')
  })

  it('shows the held offer, and says when it went stale', () => {
    const offer = { borrower: 'borrowerA', terms: DEMO_TERMS, signedAt: NOW, stale: false } as const
    const live = brokerTab(snapshot({ offer }), brokerInitial).pending
    assert.equal(live?.title, 'Offer to Borrower A')
    assert.equal(live?.note, 'Signed at 12:00:00. Waiting for Borrower A to co-sign.')
    assert.deepEqual(live?.withdraw.action, { type: 'LoanSetWithdraw' })
    const stale = brokerTab(snapshot({ offer: { ...offer, stale: true } }), brokerInitial).pending
    assert.equal(stale?.stale, true)
    assert.match(stale?.note ?? '', /^Expired/)
    assert.equal(brokerTab(snapshot(), brokerInitial).pending, undefined)
  })

  it('lists every loan with its impair and default actions', () => {
    const loans = [loan(), loan({ loanID: 'L2', loanSequence: 2, borrower: 'borrowerB' })]
    const m = brokerTab(snapshot({ loans }), brokerInitial)
    assert.deepEqual(
      m.loans.map((l) => `${l.title} ${l.borrower}`),
      ['Loan 1 Borrower A', 'Loan 2 Borrower B'],
    )
    assert.deepEqual(m.loans[1]?.default.action, {
      type: 'LoanManage',
      loanID: 'L2',
      flag: 'default',
    })
  })
})
