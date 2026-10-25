import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { depositorTab } from './depositor.model.ts'
import { pub, snapshot } from '#web/snapshot.fixture.ts'

describe('depositorTab', () => {
  it('shows the selected depositor holdings', () => {
    const m = depositorTab(snapshot(), 'depositorB', '')
    assert.deepEqual(m.holdings, {
      amounts: [
        { label: 'Wallet', shown: pub(5n) },
        { label: 'Share value', shown: pub(150_000n) },
      ],
      facts: [{ label: 'Shares', text: '150,000' }],
    })
    assert.equal(m.deposit.max, '5')
  })

  it('deposits the digits typed, as the selected depositor', () => {
    const m = depositorTab(snapshot(), 'depositorA', '$1,500')
    assert.equal(m.deposit.text, '1500')
    assert.deepEqual(m.deposit.action, {
      type: 'VaultDeposit',
      depositor: 'depositorA',
      amount: 1500n,
    })
    assert.equal(m.deposit.label, 'Deposit as Depositor A')
    assert.deepEqual(m.redeem.action, { type: 'VaultWithdraw', depositor: 'depositorA' })
  })
})
