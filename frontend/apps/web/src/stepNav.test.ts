import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { phaseOf, stepNav } from './stepNav.ts'
import type { Step } from './route.ts'

describe('stepNav', () => {
  it('lists the ten demo steps in order, each linking to its screen', () => {
    const { items } = stepNav(0)
    assert.deepEqual(
      items.map((it) => [it.n, it.label, it.href]),
      [
        [1, 'Create broker', '#/1'],
        [2, 'Subscribe', '#/2'],
        [3, 'Draw and merge', '#/3'],
        [4, 'Co-sign loans', '#/4'],
        [5, 'Explorer', '#/5'],
        [6, 'Repay loan A', '#/6'],
        [7, 'Settle', '#/7'],
        [8, 'Default loan B', '#/8'],
        [9, 'Explorer after default', '#/9'],
        [10, 'Redeem', '#/10'],
      ],
    )
  })

  it('shows the roles that act on each step', () => {
    const icons = stepNav(0).items.map((it) => it.icons)
    assert.deepEqual(icons, [
      ['broker'],
      ['depositor'],
      ['broker'],
      ['broker', 'borrower'],
      ['explorer'],
      ['borrower'],
      ['broker'],
      ['broker'],
      ['explorer'],
      ['depositor'],
    ])
  })

  it('marks every step upcoming on the flow map', () => {
    const { items } = stepNav(0)
    assert.ok(items.every((it) => it.state === 'upcoming'))
    assert.ok(items.every((it) => it.ariaCurrent === 'false'))
    assert.equal(items[0]?.ariaLabel, 'Step 1: Create broker')
    assert.equal(items[0]?.text, '1')
  })

  it('marks earlier steps done, the given step current, and later steps upcoming', () => {
    const { items } = stepNav(4)
    assert.deepEqual(
      items.map((it) => it.state),
      ['done', 'done', 'done', 'current', ...Array<string>(6).fill('upcoming')],
    )
  })

  it('names the state in the accessible label and spells out only the current step', () => {
    const [, second, , fourth, fifth] = stepNav(4).items
    assert.deepEqual(
      [second?.ariaLabel, second?.text, second?.ariaCurrent],
      ['Step 2, done: Subscribe', '2', 'false'],
    )
    assert.deepEqual(
      [fourth?.ariaLabel, fourth?.text, fourth?.ariaCurrent],
      ['Step 4, current: Co-sign loans', '4 Co-sign loans', 'page'],
    )
    assert.deepEqual([fifth?.ariaLabel, fifth?.text], ['Step 5: Explorer', '5'])
  })

  it('marks every earlier step done on the last step', () => {
    const states = stepNav(10).items.map((it) => it.state)
    assert.deepEqual(states, [...Array<string>(9).fill('done'), 'current'])
  })

  it('carries the phase of the given step', () => {
    assert.equal(stepNav(0).phase, undefined)
    assert.equal(stepNav(2).phase, 'Subscription')
    assert.equal(stepNav(10).phase, 'Redemption')
  })
})

describe('phaseOf', () => {
  it('puts steps 1-2 in Subscription, 3-9 in Investment and 10 in Redemption', () => {
    const steps: readonly Step[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const phases = steps.map((n) => phaseOf(n))
    assert.deepEqual(phases, [
      'Subscription',
      'Subscription',
      ...Array<string>(7).fill('Investment'),
      'Redemption',
    ])
  })
})
