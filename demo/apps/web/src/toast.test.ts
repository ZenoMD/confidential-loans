import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ActionFailed } from '@confidential-loans/core/demo-ledger'
import { TERMS } from './snapshot.fixture.ts'
import type { Action } from '@confidential-loans/core/demo-ledger'
import { failureToast, shortHash, successToast, transactionType } from './toast.ts'

const HASH = 'ABCDEF0123456789'.repeat(4)
const DEPOSIT: Action = { type: 'VaultDeposit', depositor: 'depositorA', amount: 1n }

describe('transactionType', () => {
  it('names the transaction an action submits', () => {
    assert.equal(transactionType(DEPOSIT), 'VaultDeposit')
    assert.equal(transactionType({ type: 'LoanSetCosign', borrower: 'borrowerA' }), 'LoanSet')
    const sign: Action = { type: 'LoanSetSign', borrower: 'borrowerA', terms: TERMS }
    assert.equal(transactionType(sign), undefined)
  })
})

describe('successToast', () => {
  it('links the validated transaction', () => {
    assert.deepEqual(successToast(DEPOSIT, HASH), {
      ok: true,
      title: 'VaultDeposit validated',
      detail: 'tesSUCCESS',
      hash: 'ABCDEF...456789',
      href: `https://custom.xrpl.org/xrpl-confidential-loans.zeno.md:443/transactions/${HASH}`,
    })
  })

  it('has nothing to show when nothing was submitted', () => {
    assert.equal(successToast({ type: 'LoanSetWithdraw' }, undefined), undefined)
  })
})

describe('failureToast', () => {
  it('links a failure the ledger recorded, with its code', () => {
    const error = new ActionFailed('tecNO_PERMISSION', 'nope', { hash: HASH })
    const shown = failureToast(DEPOSIT, error)
    assert.equal(shown?.ok, false)
    assert.equal(shown?.title, 'VaultDeposit failed')
    assert.equal(shown?.detail, 'tecNO_PERMISSION')
  })

  it('has nothing to link when no ledger holds the failure', () => {
    assert.equal(failureToast(DEPOSIT, new ActionFailed('buildFailed', 'no proof')), undefined)
    const unconfirmed = new ActionFailed('unconfirmed', 'lost', { hash: HASH })
    assert.equal(failureToast(DEPOSIT, unconfirmed), undefined)
    assert.equal(failureToast(DEPOSIT, new Error('boom')), undefined)
  })
})

describe('shortHash', () => {
  it('keeps the ends of a long hash', () => {
    assert.equal(shortHash(HASH), 'ABCDEF...456789')
    assert.equal(shortHash('ABC'), 'ABC')
  })
})
