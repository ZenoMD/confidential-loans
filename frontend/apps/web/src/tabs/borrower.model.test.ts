import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { borrowerTab } from './borrower.model.ts'
import { loan, NOW, snapshot, TERMS } from '#web/snapshot.fixture.ts'

describe('borrowerTab', () => {
  it('lists only the selected borrower loans, with both payments', () => {
    const loans = [loan(), loan({ loanID: 'L2', loanSequence: 2, borrower: 'borrowerB' })]
    const m = borrowerTab(snapshot({ loans }), 'borrowerB')
    assert.deepEqual(
      m.loans.map((l) => l.title),
      ['Loan 2'],
    )
    assert.deepEqual(m.loans[0]?.installment.action, {
      type: 'ConfidentialLoanPay',
      loanID: 'L2',
      mode: 'installment',
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
