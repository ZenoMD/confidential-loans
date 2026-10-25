import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatAmount, formatCount, parsePercent, parseWhole, valueView } from './value.ts'

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
  it('shows a public amount in ink, for anyone', () => {
    assert.deepEqual(valueView({ visibility: 'public', value: 105_000n }), {
      kind: 'amount',
      text: '$105,000',
      tone: 'ink',
      icon: 'public',
      note: 'Public on the ledger: anyone can read it.',
    })
  })

  it('shows a decrypted amount in the key color, naming who can read it', () => {
    const seen = { visibility: 'decrypted', value: 5n, readers: ['borrowerA', 'brokerA'] } as const
    assert.deepEqual(valueView(seen), {
      kind: 'amount',
      text: '$5',
      tone: 'key',
      icon: 'decrypted',
      note: 'Encrypted on the ledger; decrypted with your key. Readable by Borrower A and Broker.',
    })
  })

  it('shows neither digits nor $ for a redacted amount, and says the viewer holds no key', () => {
    const readers = ['borrowerA', 'brokerA', 'loanAuditor'] as const
    assert.deepEqual(valueView({ visibility: 'redacted', readers }), {
      kind: 'redacted',
      icon: 'locked',
      note:
        'Encrypted on the ledger. Readable by Borrower A, Broker and Loan Auditor. ' +
        'You hold none of these keys.',
    })
  })

  it('shows a pending amount as dim "Decrypting" text, not a redaction bar', () => {
    const view = valueView({ visibility: 'pending' })
    assert.equal(view.kind === 'amount' && view.text, 'Decrypting')
    assert.equal(view.kind === 'amount' && view.tone, 'dim')
    assert.equal(view.icon, 'decrypted')
  })
})

describe('parseWhole', () => {
  it('keeps only the digits typed', () => {
    assert.deepEqual(parseWhole('$150,000'), { text: '150000', value: 150_000n })
    assert.deepEqual(parseWhole('12a3'), { text: '123', value: 123n })
  })

  it('reads an empty field as 0', () => {
    assert.deepEqual(parseWhole(''), { text: '', value: 0n })
  })
})

describe('formatCount', () => {
  it('groups thousands without a currency sign', () => {
    assert.equal(formatCount(1500n), '1,500')
    assert.equal(formatCount(60), '60')
  })
})

describe('parsePercent', () => {
  it('reads up to two decimals as hundredths of a percent', () => {
    assert.deepEqual(parsePercent('5.25%'), { text: '5.25', hundredths: 525n })
    assert.deepEqual(parsePercent('10'), { text: '10', hundredths: 1000n })
    assert.deepEqual(parsePercent('.5'), { text: '.5', hundredths: 50n })
  })

  it('drops a third decimal and a second point', () => {
    assert.deepEqual(parsePercent('1.234'), { text: '1.23', hundredths: 123n })
    assert.deepEqual(parsePercent('1.2.3'), { text: '1.23', hundredths: 123n })
  })

  it('reads an empty field as 0', () => {
    assert.deepEqual(parsePercent(''), { text: '', hundredths: 0n })
  })
})
