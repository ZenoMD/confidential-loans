import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { inputOf, secondsOf } from './duration.ts'

describe('inputOf', () => {
  it('shows seconds in the largest unit that divides them', () => {
    assert.deepEqual(inputOf(180), { amount: '3', unit: 'min' })
    assert.deepEqual(inputOf(86_400), { amount: '1', unit: 'd' })
    assert.deepEqual(inputOf(90), { amount: '90', unit: 's' })
  })
})

describe('secondsOf', () => {
  it('multiplies the typed amount by its unit', () => {
    assert.equal(secondsOf({ amount: '2', unit: 'h' }), 7200)
    assert.equal(secondsOf({ amount: '', unit: 'd' }), 0)
  })
})
