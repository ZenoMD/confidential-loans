import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseRoute, specHref, tabHref, TABS } from './route.ts'

describe('parseRoute', () => {
  it('opens the named tab', () => {
    assert.deepEqual(parseRoute('#/broker'), { page: 'tab', tab: 'broker' })
    assert.deepEqual(parseRoute('#/borrower'), { page: 'tab', tab: 'borrower' })
  })

  it('opens the spec, at a section if one is named', () => {
    assert.deepEqual(parseRoute('#/spec'), { page: 'spec', section: undefined })
    assert.deepEqual(parseRoute('#/spec/4-ledger-entry-loanbroker'), {
      page: 'spec',
      section: '4-ledger-entry-loanbroker',
    })
  })

  it('falls back to the depositor tab for any other hash', () => {
    for (const hash of [
      '',
      '#',
      '#/',
      '#/1',
      '#/Broker',
      '#/broker/',
      '#broker',
      '/broker',
      '#/spec/',
      '#/spec/a/b',
      '#1-abstract',
    ]) {
      assert.deepEqual(parseRoute(hash), { page: 'tab', tab: 'depositor' }, hash)
    }
  })
})

describe('tabHref', () => {
  it('round-trips through parseRoute for every tab', () => {
    for (const tab of TABS) assert.deepEqual(parseRoute(tabHref(tab)), { page: 'tab', tab })
  })
})

describe('specHref', () => {
  it('round-trips through parseRoute', () => {
    assert.deepEqual(parseRoute(specHref()), { page: 'spec', section: undefined })
    assert.deepEqual(parseRoute(specHref('a1-x')), { page: 'spec', section: 'a1-x' })
  })
})
