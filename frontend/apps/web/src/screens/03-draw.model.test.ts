import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type {
  BrokerView,
  Snapshot,
  TransactionType,
  TxRecord,
} from '@confidential-loans/core/demo-ledger'
import { DRAW_PREFILL, DRAW_VIEWER, drawScreen } from './03-draw.model.ts'

const BROKER: BrokerView = {
  loanBrokerID: 'B0',
  debtMaximum: { visibility: 'public', value: 250_000n },
  debtTotal: { visibility: 'public', value: 0n },
  lendingBalance: {
    inbox: { visibility: 'decrypted', value: 0n },
    spending: { visibility: 'decrypted', value: 0n },
  },
}

function record(type: TransactionType, result = 'tesSUCCESS', step: 3 | 7 = 3): TxRecord {
  return {
    hash: `${type}-${result}-${step}`,
    explorerUrl: '',
    step,
    type,
    loan: undefined,
    signers: ['brokerA'],
    result,
    closedAt: 0,
    amount: undefined,
    flag: undefined,
  }
}

function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  const depositor = {
    wallet: { visibility: 'public', value: 0n },
    shares: 0n,
    deposited: undefined,
    redeemed: undefined,
    redeemFailure: undefined,
  } as const
  const balance = {
    inbox: { visibility: 'redacted' },
    spending: { visibility: 'redacted' },
  } as const
  return {
    viewer: 'brokerA',
    ledgerIndex: 1,
    now: 0,
    phase: 'investment',
    vault: {
      vaultID: 'V0',
      assetsTotal: { visibility: 'public', value: 300_000n },
      assetsAvailable: { visibility: 'public', value: 300_000n },
      lossUnrealized: { visibility: 'public', value: 0n },
      sharesTotal: 300_000n,
      subscriptionDate: 0,
      redemptionDate: 0,
    },
    broker: BROKER,
    loans: {},
    offers: {},
    depositors: { depositorA: depositor, depositorB: depositor },
    borrowers: { borrowerA: balance, borrowerB: balance },
    log: [],
    submitting: undefined,
    errors: [],
    ...over,
  }
}

function withBalance(inbox: bigint, spending: bigint): BrokerView {
  return {
    ...BROKER,
    lendingBalance: {
      inbox: { visibility: 'decrypted', value: inbox },
      spending: { visibility: 'decrypted', value: spending },
    },
  }
}

const UI = { drawInput: '200000' }

describe('drawScreen', () => {
  it('reads the snapshot as Broker A and prefills the agreed draw', () => {
    assert.equal(DRAW_VIEWER, 'brokerA')
    assert.equal(DRAW_PREFILL, '200000')
  })

  it('shows the vault, inbox and spendable balances with the canvas labels', () => {
    const s = snapshot({
      vault: { ...snapshot().vault, assetsAvailable: { visibility: 'public', value: 100_000n } },
      broker: withBalance(200_000n, 0n),
      log: [record('LoanBrokerDraw')],
    })
    assert.deepEqual(drawScreen(s, UI).values, [
      { label: 'Vault, available', shown: { visibility: 'public', value: 100_000n } },
      { label: 'Lending Balance inbox', shown: { visibility: 'decrypted', value: 200_000n } },
      { label: 'Lending Balance, spendable', shown: { visibility: 'decrypted', value: 0n } },
    ])
  })

  it('shows empty balances before the broker exists', () => {
    const values = drawScreen(snapshot({ broker: undefined }), UI).values
    assert.deepEqual(
      values.slice(1).map((v) => v.shown),
      [
        { visibility: 'public', value: 0n },
        { visibility: 'public', value: 0n },
      ],
    )
  })

  it('starts at the draw with no bar done', () => {
    const screen = drawScreen(snapshot(), UI)
    assert.equal(screen.stage, 0)
    assert.deepEqual(screen.steps, [
      { label: 'Draw from the vault', note: 'LoanBrokerDraw', state: 'todo' },
      { label: 'Merge into spending', note: 'LoanBrokerMergeInbox', state: 'todo' },
    ])
    assert.deepEqual(screen.cta, {
      kind: 'submit',
      label: 'Draw from the vault',
      action: { type: 'LoanBrokerDraw', amount: 200_000n },
    })
  })

  it('submits the typed amount, ignoring separators and spaces', () => {
    const screen = drawScreen(snapshot(), { drawInput: ' 150,000 ' })
    assert.deepEqual(screen.cta, {
      kind: 'submit',
      label: 'Draw from the vault',
      action: { type: 'LoanBrokerDraw', amount: 150_000n },
    })
  })

  it('sends 0 for input that is not a whole amount, so the gate rejects it', () => {
    for (const drawInput of ['', 'abc', '1.5', '-5']) {
      const cta = drawScreen(snapshot(), { drawInput }).cta
      assert.deepEqual(cta.kind === 'submit' && cta.action, { type: 'LoanBrokerDraw', amount: 0n })
    }
  })

  it('moves to the merge once the draw succeeded', () => {
    const screen = drawScreen(snapshot({ log: [record('LoanBrokerDraw')] }), UI)
    assert.equal(screen.stage, 1)
    assert.deepEqual(
      screen.steps.map((step) => step.state),
      ['done', 'todo'],
    )
    assert.deepEqual(screen.cta, {
      kind: 'submit',
      label: 'Merge into spending',
      action: { type: 'LoanBrokerMergeInbox' },
    })
  })

  it('stays at the draw when the draw failed', () => {
    const screen = drawScreen(
      snapshot({ log: [record('LoanBrokerDraw', 'tecLIMIT_EXCEEDED')] }),
      UI,
    )
    assert.equal(screen.stage, 0)
  })

  it('is done once the merge succeeded, with no replay', () => {
    const log = [record('LoanBrokerDraw'), record('LoanBrokerMergeInbox')]
    const screen = drawScreen(snapshot({ log }), UI)
    assert.equal(screen.stage, 2)
    assert.deepEqual(
      screen.steps.map((step) => step.state),
      ['done', 'done'],
    )
    assert.deepEqual(screen.cta, { kind: 'done', label: 'Done' })
  })

  it('ignores the step-7 merge and failed merges', () => {
    const log = [
      record('LoanBrokerDraw'),
      record('LoanBrokerMergeInbox', 'tecNO_PERMISSION'),
      record('LoanBrokerMergeInbox', 'tesSUCCESS', 7),
    ]
    assert.equal(drawScreen(snapshot({ log }), UI).stage, 1)
  })

  it('follows the latest step-3 transaction after a second draw', () => {
    const log = [
      record('LoanBrokerDraw'),
      record('LoanBrokerMergeInbox'),
      { ...record('LoanBrokerDraw'), hash: 'second' },
    ]
    assert.equal(drawScreen(snapshot({ log }), UI).stage, 1)
  })

  it('links on to step 4', () => {
    assert.deepEqual(drawScreen(snapshot(), UI).next, {
      href: '#/4',
      label: 'Continue to step 4',
    })
  })
})
