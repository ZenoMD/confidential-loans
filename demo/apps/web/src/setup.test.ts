import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { STAGES } from '@confidential-loans/core/deploy'
import { durationsOf, fail, finish, IDLE, stageRows, startStage } from './setup.ts'

const START = { ...IDLE, stages: STAGES }

describe('stageRows', () => {
  it('follows the stages as they start and finish', () => {
    const second = startStage(startStage(START, 'wallets'), 'token')
    assert.deepEqual(
      stageRows(second).map((row) => row.state),
      ['done', 'running', 'todo', 'todo', 'todo'],
    )
    const all = finish(startStage(startStage(startStage(second, 'holders'), 'vault'), 'broker'))
    assert.deepEqual(
      stageRows(all).map((row) => row.state),
      ['done', 'done', 'done', 'done', 'done'],
    )
  })

  it('marks the stage that failed', () => {
    const failed = fail(startStage(START, 'wallets'), 'faucet down')
    assert.deepEqual(failed.failure, { stage: 'wallets', error: 'faucet down' })
    assert.equal(stageRows(failed)[0]?.state, 'failed')
  })
})

describe('durationsOf', () => {
  it('converts each field to seconds', () => {
    const inputs = {
      subscription: { amount: '3', unit: 'min' },
      investment: { amount: '2 ', unit: 'h' },
    } as const
    assert.deepEqual(durationsOf(inputs), {
      durations: { subscription: 180, investment: 7200 },
      problem: undefined,
    })
  })

  it('names a duration below its floor', () => {
    const inputs = {
      subscription: { amount: '2', unit: 'min' },
      investment: { amount: '1', unit: 'd' },
    } as const
    assert.equal(durationsOf(inputs).problem, 'Subscription must be at least 180 seconds')
  })
})
