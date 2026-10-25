import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { validateLoanTerms } from './demo.ts'
import type { LoanTerms } from './demo.ts'

const valid: LoanTerms = {
  principal: 100n,
  amountOwed: 105n,
  periodicPayment: 35n,
  paymentTotal: 3,
  paymentInterval: 120,
  gracePeriod: 60,
}

function rejects(change: Partial<LoanTerms>, reason: RegExp): void {
  assert.throws(() => validateLoanTerms({ ...valid, ...change }), {
    name: 'RangeError',
    message: reason,
  })
}

describe('validateLoanTerms', () => {
  it('accepts terms that meet every LoanSet check', () => {
    validateLoanTerms(valid)
  })

  it('accepts the boundaries O = P, N*Q = O and grace = interval = 60', () => {
    validateLoanTerms({
      principal: 100n,
      amountOwed: 100n,
      periodicPayment: 100n,
      paymentTotal: 1,
      paymentInterval: 60,
      gracePeriod: 60,
    })
  })

  it('rejects an amount owed below the principal', () => {
    rejects({ amountOwed: 99n, periodicPayment: 99n }, /amount owed 99 is below principal 100/)
  })

  it('rejects payments that do not cover the amount owed', () => {
    rejects(
      { amountOwed: 103n, periodicPayment: 34n },
      /3 payments of 34 do not cover amount owed 103/,
    )
  })

  it('rejects negative amounts', () => {
    rejects({ principal: -1n }, /principal -1 is negative/)
    rejects({ amountOwed: -1n, principal: -2n }, /amount owed -1 is negative/)
    rejects({ periodicPayment: -1n }, /periodic payment -1 is negative/)
  })

  it('rejects fewer than one payment', () => {
    rejects({ paymentTotal: 0 }, /payment total 0 is below 1/)
  })

  it('rejects a payment interval under 60 seconds', () => {
    rejects({ paymentInterval: 59, gracePeriod: 59 }, /payment interval 59 is below 60 seconds/)
  })

  it('rejects a grace period under 60 seconds or longer than the interval', () => {
    rejects({ gracePeriod: 59 }, /grace period 59 is below 60 seconds/)
    rejects({ gracePeriod: 121 }, /grace period 121 exceeds payment interval 120/)
  })

  it('rejects schedule values that are not whole numbers', () => {
    rejects({ paymentTotal: 1.5 }, /payment total 1.5 is not a whole number/)
    rejects({ paymentInterval: Number.NaN }, /payment interval NaN is not a whole number/)
    rejects({ gracePeriod: 60.5 }, /grace period 60.5 is not a whole number/)
  })

  it('rejects schedule values above the UINT32 field maximum', () => {
    rejects({ paymentTotal: 2 ** 32 }, /payment total 4294967296 exceeds 4294967295/)
    rejects(
      { paymentInterval: 2 ** 32, gracePeriod: 60 },
      /payment interval 4294967296 exceeds 4294967295/,
    )
    rejects({ gracePeriod: 2 ** 32 }, /grace period 4294967296 exceeds 4294967295/)
  })

  it('accepts schedule values at the UINT32 field maximum', () => {
    validateLoanTerms({
      ...valid,
      amountOwed: 100n,
      paymentTotal: 0xffff_ffff,
      paymentInterval: 0xffff_ffff,
      gracePeriod: 0xffff_ffff,
    })
  })

  it('names every broken rule in one error', () => {
    rejects({ principal: 200n, paymentTotal: 0 }, /below principal 200.*payment total 0/s)
  })
})
