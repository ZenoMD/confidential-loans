import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DEMO_TERMS } from '@confidential-loans/core/demo-ledger'
import { borrowerTab } from './borrower.model.ts'
import { loan, NOW, snapshot } from '#web/snapshot.fixture.ts'

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
    const offer = { borrower: 'borrowerA', terms: DEMO_TERMS, signedAt: NOW, stale: false } as const
    const s = snapshot({ offer })
    assert.deepEqual(borrowerTab(s, 'borrowerA').offer?.cosign.action, {
      type: 'LoanSetCosign',
      borrower: 'borrowerA',
    })
    assert.equal(borrowerTab(s, 'borrowerB').offer, undefined)
  })
})
