import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { borrowerTab, repayDialog } from './borrower.model.ts'
import { loan, NOW, snapshot, TERMS } from '#web/snapshot.fixture.ts'

describe('borrowerTab', () => {
  it('lists only the selected borrower loans, with both payments', () => {
    const loans = [loan(), loan({ loanID: 'L2', loanSequence: 2, borrower: 'borrowerB' })]
    const m = borrowerTab(snapshot({ loans }), 'borrowerB')
    assert.deepEqual(
      m.loans.map((l) => l.title),
      ['Loan 2'],
    )
    assert.equal(m.loans[0]?.repay.label, 'Make repayment')
    assert.deepEqual(m.loans[0]?.full.action, {
      type: 'ConfidentialLoanPay',
      loanID: 'L2',
      amount: 'full',
    })
    assert.deepEqual(m.merge.action, { type: 'ConfidentialMPTMergeInbox', borrower: 'borrowerB' })
  })

  it('shows the held offer to its borrower only', () => {
    const offer = { borrower: 'borrowerA', terms: TERMS, signedAt: NOW, stale: false } as const
    const s = snapshot({ offer })
    assert.deepEqual(borrowerTab(s, 'borrowerA').offer?.cosign.action, {
      type: 'LoanSetCosign',
      borrower: 'borrowerA',
    })
    assert.equal(borrowerTab(s, 'borrowerB').offer, undefined)
  })

  it('shows the borrower the offered amounts, and an outsider only who can read them', () => {
    const offer = { borrower: 'borrowerA', terms: TERMS, signedAt: NOW, stale: false } as const
    const readers = ['borrowerA', 'brokerA', 'loanAuditor']
    const own = borrowerTab(snapshot({ offer, viewer: 'borrowerA' }), 'borrowerA').offer
    assert.deepEqual(own?.amounts[0]?.shown, { visibility: 'decrypted', value: 100_000n, readers })
    const outside = borrowerTab(snapshot({ offer }), 'borrowerA').offer
    assert.deepEqual(outside?.amounts[0]?.shown, { visibility: 'redacted', readers })
  })
})

describe('repayDialog', () => {
  const owing = snapshot({
    viewer: 'borrowerA',
    loans: [
      loan({
        amountOwed: { visibility: 'decrypted', value: 105_000n },
        periodicPayment: { visibility: 'decrypted', value: 35_000n },
      }),
    ],
    borrowers: {
      borrowerA: {
        spending: { visibility: 'decrypted', value: 80_000n },
        inbox: { visibility: 'decrypted', value: 0n },
      },
      borrowerB: { spending: { visibility: 'redacted' }, inbox: { visibility: 'redacted' } },
    },
  })
  const loanID = owing.loans[0]?.loanID ?? ''

  it('starts at the periodic payment', () => {
    const m = repayDialog(owing, loanID, undefined)
    assert.equal(m?.text, '35000')
    assert.equal(m?.label, 'Pay $35,000')
    assert.deepEqual(m?.action, { type: 'ConfidentialLoanPay', loanID, amount: 35_000n })
    assert.equal(m?.invalid, undefined)
  })

  it('pays the amount typed', () => {
    const m = repayDialog(owing, loanID, '50,000')
    assert.equal(m?.text, '50000')
    assert.deepEqual(m?.action, { type: 'ConfidentialLoanPay', loanID, amount: 50_000n })
  })

  it('says why an amount cannot be paid', () => {
    const invalid = (typed: string) => repayDialog(owing, loanID, typed)?.invalid
    assert.equal(invalid(''), 'Enter an amount')
    assert.equal(invalid('34999'), 'At least the periodic payment, $35,000')
    assert.equal(invalid('105001'), 'At most the amount owed, $105,000')
    assert.equal(invalid('90000'), 'More than the spending balance, $80,000')
  })

  it('has no dialog for a loan the snapshot lacks', () => {
    assert.equal(repayDialog(owing, 'missing', undefined), undefined)
  })
})
