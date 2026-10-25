import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { amountOwedOf, brokerInitial, brokerTab, periodicPaymentOf } from './broker.model.ts'
import { loan, NOW, snapshot, TERMS } from '#web/snapshot.fixture.ts'

describe('brokerTab', () => {
  it('signs an offer with the typed terms to the selected borrower', () => {
    const ui = {
      ...brokerInitial,
      borrower: 'borrowerB' as const,
      terms: {
        ...brokerInitial.terms,
        interestRate: '36.5%',
        paymentTotal: '4',
        paymentInterval: { amount: '1', unit: 'd' as const },
      },
    }
    const m = brokerTab(snapshot(), ui)
    // 36.5 % a year for 4 days is 0.4 %: 400 on 100,000.
    assert.deepEqual(m.offer.action, {
      type: 'LoanSetSign',
      borrower: 'borrowerB',
      terms: {
        principal: 100_000n,
        amountOwed: 100_400n,
        periodicPayment: 25_100n,
        paymentTotal: 4,
        paymentInterval: 86_400,
        gracePeriod: 86_400,
      },
    })
    assert.equal(m.offer.label, 'Sign offer to Borrower B')
    assert.equal(m.offer.fields.find((f) => f.key === 'interestRate')?.text, '36.5')
    assert.deepEqual(
      m.offer.derived.map(
        (d) => `${d.label} ${d.shown.visibility === 'decrypted' && d.shown.value}`,
      ),
      ['Interest 400', 'Amount owed 100400', 'Periodic payment 25100'],
    )
  })

  it('prefills a week of daily payments at 10 % a year', () => {
    const m = brokerTab(snapshot(), brokerInitial)
    // 191.78 of interest rounds up to 192; 7 payments of 14,314 cover 100,192.
    assert.deepEqual(m.offer.action, {
      type: 'LoanSetSign',
      borrower: 'borrowerA',
      terms: {
        principal: 100_000n,
        amountOwed: 100_192n,
        periodicPayment: 14_314n,
        paymentTotal: 7,
        paymentInterval: 86_400,
        gracePeriod: 86_400,
      },
    })
    assert.deepEqual(m.offer.durations[0]?.value, { amount: '1', unit: 'd' })
  })

  it('shows the held offer, and says when it went stale', () => {
    const offer = { borrower: 'borrowerA', terms: TERMS, signedAt: NOW, stale: false } as const
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

describe('periodicPaymentOf', () => {
  it('rounds up so the payments cover the amount owed', () => {
    assert.equal(periodicPaymentOf(105_000n, 1), 105_000n)
    assert.equal(periodicPaymentOf(100n, 3), 34n)
    assert.equal(periodicPaymentOf(99n, 3), 33n)
  })

  it('asks for all of it when there are no payments', () => {
    assert.equal(periodicPaymentOf(100n, 0), 100n)
  })
})

describe('amountOwedOf', () => {
  it('adds simple interest for the loan length', () => {
    assert.equal(amountOwedOf(100_000n, 1000n, 365 * 86_400), 110_000n)
    assert.equal(amountOwedOf(100_000n, 0n, 365 * 86_400), 100_000n)
  })

  it('rounds the interest up to a whole unit', () => {
    assert.equal(amountOwedOf(100_000n, 1000n, 60), 100_001n)
    assert.equal(amountOwedOf(100_000n, 1000n, 0), 100_000n)
  })
})
