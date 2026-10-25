import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseRoute, stepHref } from './route.ts'
import type { Step } from './route.ts'

const STEPS: readonly Step[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

describe('parseRoute', () => {
  it('opens step 1 for an empty hash', () => {
    for (const hash of ['', '#', '#/']) assert.equal(parseRoute(hash), 1, hash)
  })

  it('opens the numbered step', () => {
    assert.equal(parseRoute('#/1'), 1)
    assert.equal(parseRoute('#/10'), 10)
  })

  it('falls back to step 1 for any other hash', () => {
    for (const hash of ['#/0', '#/01', '#/11', '#/-1', '#/1/', '#/abc', '#1', '/1', '#/kit']) {
      assert.equal(parseRoute(hash), 1, hash)
    }
  })
})

describe('stepHref', () => {
  it('round-trips through parseRoute for every step', () => {
    for (const step of STEPS) assert.equal(parseRoute(stepHref(step)), step)
  })
})
