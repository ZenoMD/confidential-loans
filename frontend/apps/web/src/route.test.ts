import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseRoute, screenHref } from './route.ts'
import type { Screen } from './route.ts'

const SCREENS: readonly Screen[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

describe('parseRoute', () => {
  it('opens the flow map for an empty hash', () => {
    for (const hash of ['', '#', '#/']) assert.equal(parseRoute(hash), 0, hash)
  })

  it('opens the numbered screen', () => {
    assert.equal(parseRoute('#/1'), 1)
    assert.equal(parseRoute('#/10'), 10)
  })

  it('falls back to the flow map for any other hash', () => {
    for (const hash of ['#/0', '#/01', '#/11', '#/-1', '#/1/', '#/abc', '#1', '/1', '#/kit']) {
      assert.equal(parseRoute(hash), 0, hash)
    }
  })
})

describe('screenHref', () => {
  it('links the flow map to the root hash and steps to their number', () => {
    assert.equal(screenHref(0), '#/')
    assert.equal(screenHref(7), '#/7')
  })

  it('round-trips through parseRoute for every screen', () => {
    for (const screen of SCREENS) assert.equal(parseRoute(screenHref(screen)), screen)
  })
})
