import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { newDeployment } from '@confidential-loans/core/kit'
import { clearDeployment, loadDeployment, saveDeployment, STORAGE_KEY } from './deployment-store.ts'

function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  }
}

describe('deployment store', () => {
  it('loads what it saved', () => {
    const storage = memoryStorage()
    const deployment = newDeployment()
    assert.equal(saveDeployment(storage, deployment), true)
    assert.deepEqual(loadDeployment(storage), deployment)
  })

  it('has nothing to load once cleared', () => {
    const storage = memoryStorage()
    saveDeployment(storage, newDeployment())
    clearDeployment(storage)
    assert.equal(loadDeployment(storage), undefined)
  })

  it('has nothing to load when nothing is saved or the text is not a deployment', () => {
    const storage = memoryStorage()
    assert.equal(loadDeployment(storage), undefined)
    storage.setItem(STORAGE_KEY, '{"version":1}')
    assert.equal(loadDeployment(storage), undefined)
  })

  it('reports a save that blocked or full storage refused', () => {
    const full = { ...memoryStorage(), setItem: () => assert.fail('QuotaExceededError') }
    assert.equal(saveDeployment(full, newDeployment()), false)
    assert.equal(saveDeployment(undefined, newDeployment()), false)
    assert.equal(loadDeployment(undefined), undefined)
  })
})
