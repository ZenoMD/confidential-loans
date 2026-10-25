import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { loanCard } from './loan.ts'
import { loan, NOW } from './snapshot.fixture.ts'

describe('loanCard', () => {
  it('titles the loan by its sequence and names its borrower', () => {
    const card = loanCard(loan({ loanSequence: 3, borrower: 'borrowerB' }), NOW)
    assert.equal(card.title, 'Loan 3')
    assert.equal(card.borrower, 'Borrower B')
    assert.equal(card.status, 'Active')
    assert.equal(card.troubled, false)
    assert.deepEqual(card.facts, [
      { label: 'Payments left', text: '1' },
      { label: 'Interval', text: '60 s' },
      { label: 'Next payment due', text: '12:01:00' },
    ])
  })

  it('flags an overdue payment and a troubled loan', () => {
    const card = loanCard(loan({ status: 'impaired' }), NOW + 61_000)
    assert.equal(card.status, 'Impaired')
    assert.equal(card.troubled, true)
    assert.equal(card.facts[2]?.text, '12:01:00, overdue')
  })

  it('shows no due date once the loan is closed', () => {
    const card = loanCard(loan({ status: 'repaid', nextPaymentDueDate: undefined }), NOW)
    assert.equal(card.facts[2]?.text, 'None')
  })
})
