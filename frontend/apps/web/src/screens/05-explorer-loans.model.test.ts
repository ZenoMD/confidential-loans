import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Shown } from '@confidential-loans/core/amount'
import type { Snapshot, TxRecord, Viewer } from '@confidential-loans/core/demo-ledger'
import { explorerLoans } from './05-explorer-loans.model.ts'

const HASH = 'A1B2C3D4E5F60718293A4B5C6D7E8F90A1B2C3D4E5F60718293A4B5C6D7E8F90'

function pub(value: bigint): Shown {
  return { visibility: 'public', value }
}

function record(fields: Partial<TxRecord> & Pick<TxRecord, 'step' | 'type'>): TxRecord {
  return {
    hash: `${fields.type}-${fields.step}-${fields.loan ?? ''}-${fields.signers?.join('') ?? ''}`,
    explorerUrl: `https://explorer.test/tx/${fields.type}`,
    loan: undefined,
    signers: ['brokerA'],
    result: 'tesSUCCESS',
    closedAt: 0,
    amount: undefined,
    flag: undefined,
    ...fields,
  }
}

function snapshot(viewer: Viewer, log: readonly TxRecord[]): Snapshot {
  const empty = { spending: pub(0n), inbox: pub(0n) }
  const depositor = {
    wallet: { visibility: 'public', value: 0n },
    shares: 0n,
    deposited: undefined,
    redeemed: undefined,
    redeemFailure: undefined,
  } as const
  return {
    viewer,
    ledgerIndex: 1,
    now: 0,
    phase: 'investment',
    vault: {
      vaultID: 'V',
      assetsTotal: { visibility: 'public', value: 0n },
      assetsAvailable: { visibility: 'public', value: 0n },
      lossUnrealized: { visibility: 'public', value: 0n },
      sharesTotal: 0n,
      subscriptionDate: 0,
      redemptionDate: 0,
    },
    broker: undefined,
    loans: {},
    offers: {},
    depositors: { depositorA: depositor, depositorB: depositor },
    borrowers: { borrowerA: empty, borrowerB: empty },
    log,
    submitting: undefined,
    errors: [],
  }
}

/** The step 1-4 records of a run, each principal as `viewer` sees it. */
function loansLog(principal: Shown): TxRecord[] {
  return [
    record({ step: 1, type: 'LoanBrokerSet' }),
    record({ step: 2, type: 'VaultDeposit', signers: ['depositorA'], amount: pub(150_000n) }),
    record({ step: 2, type: 'VaultDeposit', signers: ['depositorB'], amount: pub(150_000n) }),
    record({ step: 3, type: 'LoanBrokerDraw', amount: pub(200_000n) }),
    record({ step: 3, type: 'LoanBrokerMergeInbox' }),
    record({
      step: 4,
      type: 'LoanSet',
      loan: 'A',
      signers: ['brokerA', 'borrowerA'],
      amount: principal,
    }),
    record({
      step: 4,
      type: 'LoanSet',
      loan: 'B',
      signers: ['brokerA', 'borrowerB'],
      amount: principal,
    }),
  ]
}

describe('explorerLoans', () => {
  it('lists steps 1 to 4 as the canvas rows', () => {
    const model = explorerLoans(
      'outsider',
      snapshot('outsider', loansLog({ visibility: 'redacted' })),
    )
    assert.deepEqual(
      model.rows.map((r) => [r.step, r.transaction, r.signedBy]),
      [
        ['1', 'LoanBrokerSet', 'Broker A'],
        ['2', 'VaultDeposit', 'Depositor A'],
        ['2', 'VaultDeposit', 'Depositor B'],
        ['3', 'LoanBrokerDraw', 'Broker A'],
        ['3', 'LoanBrokerMergeInbox', 'Broker A'],
        ['4', 'LoanSet, loan A', 'Broker A, Borrower A'],
        ['4', 'LoanSet, loan B', 'Broker A, Borrower B'],
      ],
    )
  })

  it('redacts each principal for the Outsider and keeps public amounts', () => {
    const model = explorerLoans(
      'outsider',
      snapshot('outsider', loansLog({ visibility: 'redacted' })),
    )
    assert.deepEqual(
      model.rows.map((r) => r.amount),
      [
        { kind: 'none', text: 'No amount' },
        { kind: 'value', shown: pub(150_000n) },
        { kind: 'value', shown: pub(150_000n) },
        { kind: 'value', shown: pub(200_000n) },
        { kind: 'none', text: 'No amount' },
        { kind: 'value', shown: { visibility: 'redacted' } },
        { kind: 'value', shown: { visibility: 'redacted' } },
      ],
    )
  })

  it('shows each principal decrypted for the Auditor', () => {
    const decrypted: Shown = { visibility: 'decrypted', value: 100_000n }
    const model = explorerLoans('auditor', snapshot('auditor', loansLog(decrypted)))
    assert.deepEqual(
      model.rows.filter((r) => r.step === '4').map((r) => r.amount),
      [
        { kind: 'value', shown: decrypted },
        { kind: 'value', shown: decrypted },
      ],
    )
  })

  it('names the selected view in the role and the toggle', () => {
    const outsider = explorerLoans('outsider', snapshot('outsider', []))
    const auditor = explorerLoans('auditor', snapshot('auditor', []))
    assert.equal(outsider.who, 'Outsider')
    assert.equal(auditor.who, 'Auditor')
    assert.equal(outsider.action, 'Reads the ledger')
    assert.equal(outsider.toggle.selected, 'outsider')
    assert.equal(auditor.toggle.selected, 'auditor')
    assert.equal(auditor.toggle.label, 'Read the ledger as')
    assert.deepEqual(auditor.toggle.options, [
      { value: 'outsider', label: 'Outsider' },
      { value: 'auditor', label: 'Auditor' },
    ])
  })

  it('shortens the hash and links it to the explorer', () => {
    const log = [record({ step: 1, type: 'LoanBrokerSet', hash: HASH, explorerUrl: 'https://x/1' })]
    const [row] = explorerLoans('outsider', snapshot('outsider', log)).rows
    assert.equal(row?.key, HASH)
    assert.equal(row?.hash, HASH)
    assert.equal(row?.hashText, 'A1B2C3…8F90')
    assert.equal(row?.href, 'https://x/1')
  })

  it('leaves out failed transactions and the steps after 4', () => {
    const log = [
      record({ step: 1, type: 'LoanBrokerSet' }),
      record({ step: 4, type: 'LoanSet', loan: 'A', result: 'tecNO_PERMISSION' }),
      record({ step: 6, type: 'ConfidentialLoanPay', loan: 'A', signers: ['borrowerA'] }),
    ]
    const model = explorerLoans('outsider', snapshot('outsider', log))
    assert.deepEqual(
      model.rows.map((r) => r.transaction),
      ['LoanBrokerSet'],
    )
  })

  it('asks for step 1 while steps 1 to 4 have no transaction', () => {
    const log = [record({ step: 1, type: 'LoanBrokerSet', result: 'tecNO_PERMISSION' })]
    const model = explorerLoans('outsider', snapshot('outsider', log))
    assert.deepEqual(model.status, {
      kind: 'prerequisite',
      text: 'Complete step 1 first',
      href: '#/1',
    })
    assert.deepEqual(model.rows, [])
  })

  it('is ready once a step 1 to 4 transaction exists', () => {
    const log = [record({ step: 1, type: 'LoanBrokerSet' })]
    assert.deepEqual(explorerLoans('auditor', snapshot('auditor', log)).status, { kind: 'ready' })
  })

  it('shows a loading line and no rows before the first snapshot', () => {
    const model = explorerLoans('auditor', null)
    assert.deepEqual(model.status, { kind: 'loading', text: 'Reading the ledger' })
    assert.deepEqual(model.rows, [])
    assert.equal(model.who, 'Auditor')
  })

  it('passes the snapshot errors through', () => {
    const s = { ...snapshot('outsider', []), errors: ['Could not read the ledger: down'] }
    assert.deepEqual(explorerLoans('outsider', s).errors, ['Could not read the ledger: down'])
  })

  it('rejects a snapshot taken for another viewer', () => {
    assert.throws(
      () => explorerLoans('auditor', snapshot('outsider', [])),
      /auditor view got a outsider snapshot/,
    )
  })

  it('links on to step 6', () => {
    assert.deepEqual(explorerLoans('outsider', null).next, {
      href: '#/6',
      label: 'Continue to step 6',
    })
  })
})
