import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatAmount, valueView } from './value.ts'

describe('formatAmount', () => {
  it('prefixes $ and groups thousands', () => {
    assert.equal(formatAmount(0n), '$0')
    assert.equal(formatAmount(999n), '$999')
    assert.equal(formatAmount(105_000n), '$105,000')
    assert.equal(formatAmount(1_234_567_890_123_456_789n), '$1,234,567,890,123,456,789')
  })

  it('rejects a negative amount, whose sign rendering is not decided', () => {
    assert.throws(() => formatAmount(-1n), RangeError)
  })
})

describe('valueView', () => {
  it('shows a public amount in ink', () => {
    assert.deepEqual(valueView({ visibility: 'public', value: 105_000n }), {
      kind: 'amount',
      text: '$105,000',
      tone: 'ink',
    })
  })

  it('shows a decrypted amount in the key color', () => {
    assert.deepEqual(valueView({ visibility: 'decrypted', value: 5n }), {
      kind: 'amount',
      text: '$5',
      tone: 'key',
    })
  })

  it('shows neither digits nor $ for a redacted amount', () => {
    assert.deepEqual(valueView({ visibility: 'redacted' }), { kind: 'redacted' })
  })

  it('shows a pending amount as dim "Decrypting" text, not a redaction bar', () => {
    assert.deepEqual(valueView({ visibility: 'pending' }), {
      kind: 'amount',
      text: 'Decrypting',
      tone: 'dim',
    })
  })
})
