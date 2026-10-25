import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseRoute, tabHref, TABS } from './route.ts'

describe('parseRoute', () => {
  it('opens the named tab', () => {
    assert.equal(parseRoute('#/broker'), 'broker')
    assert.equal(parseRoute('#/borrower'), 'borrower')
  })

  it('falls back to the depositor tab for any other hash', () => {
    for (const hash of ['', '#', '#/', '#/1', '#/Broker', '#/broker/', '#broker', '/broker']) {
      assert.equal(parseRoute(hash), 'depositor', hash)
    }
  })
})

describe('tabHref', () => {
  it('round-trips through parseRoute for every tab', () => {
    for (const tab of TABS) assert.equal(parseRoute(tabHref(tab)), tab)
  })
})
