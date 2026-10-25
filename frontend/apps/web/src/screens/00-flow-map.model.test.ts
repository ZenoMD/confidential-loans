import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { flowMap } from './00-flow-map.model.ts'

describe('flowMap', () => {
  it('lists the four lanes top to bottom', () => {
    assert.deepEqual(
      flowMap().lanes.map((lane) => [lane.role, lane.title, lane.members]),
      [
        ['depositor', 'Depositors', 'depositorA, depositorB'],
        ['broker', 'Broker', 'brokerA'],
        ['borrower', 'Borrowers', 'borrowerA, borrowerB'],
        ['explorer', 'Explorer', 'outsider, auditor'],
      ],
    )
  })

  it('spans each phase pill over the steps in that phase', () => {
    assert.deepEqual(flowMap().phases, [
      { phase: 'Subscription', first: 1, last: 2 },
      { phase: 'Investment', first: 3, last: 9 },
      { phase: 'Redemption', first: 10, last: 10 },
    ])
  })

  it('places one linked card per step, in step order', () => {
    assert.deepEqual(
      flowMap().cards.map((card) => [card.step, card.label, card.href]),
      [
        [1, '01', '#/1'],
        [2, '02', '#/2'],
        [3, '03', '#/3'],
        [4, '04', '#/4'],
        [5, '05', '#/5'],
        [6, '06', '#/6'],
        [7, '07', '#/7'],
        [8, '08', '#/8'],
        [9, '09', '#/9'],
        [10, '10', '#/10'],
      ],
    )
  })

  it('puts each card in the lane of the role that acts on its step', () => {
    const rows = flowMap().cards.map((card) => [card.step, card.row.start, card.row.span])
    assert.deepEqual(rows, [
      [1, 2, 1],
      [2, 1, 1],
      [3, 2, 1],
      [4, 2, 2],
      [5, 4, 1],
      [6, 3, 1],
      [7, 2, 1],
      [8, 2, 1],
      [9, 4, 1],
      [10, 1, 1],
    ])
  })

  it('marks the explorer steps read-only', () => {
    const readOnly = flowMap()
      .cards.filter((card) => card.exposure === 'readOnly')
      .map((c) => c.step)
    assert.deepEqual(readOnly, [5, 9])
  })
})
