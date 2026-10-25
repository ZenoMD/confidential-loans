import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createAmountDisplay } from './amount.ts'
import type { Amount, Decrypt } from './amount.ts'

const borrower = { publicKey: '02B0', privateKey: 'B0' }
const auditor = { publicKey: '03A0', privateKey: 'A0' }
const outsider = { publicKey: '02FF', privateKey: 'FF' }

/** Ciphertext -> [private key that opens it, plaintext]. */
const ledger: Record<string, [string, bigint]> = {
  CT_BORROWER: ['B0', 105n],
  CT_AUDITOR: ['A0', 105n],
  CT_OTHER: ['B0', 7n],
  CT_LARGE: ['B0', 2500n],
}

const owed: Amount = {
  kind: 'encrypted',
  to: { '02B0': 'CT_BORROWER', '03A0': 'CT_AUDITOR' },
  bound: 1000n,
}

/** A decrypt that resolves only when `settle` is called, recording every call. */
function fakeDecrypt() {
  const calls: [string, string, bigint][] = []
  const waiting: (() => void)[] = []
  const decrypt: Decrypt = (ciphertext, privateKey, bound) => {
    calls.push([ciphertext, privateKey, bound])
    return new Promise((resolve, reject) => {
      waiting.push(() => {
        const entry = ledger[ciphertext]
        if (entry === undefined || entry[0] !== privateKey || entry[1] > bound) {
          reject(new Error('mpt_decrypt_amount failed'))
        } else {
          resolve(entry[1])
        }
      })
    })
  }
  const settle = async (): Promise<void> => {
    do {
      for (const run of waiting.splice(0)) run()
      await new Promise((resolve) => setImmediate(resolve))
    } while (waiting.length > 0)
  }
  return { decrypt, calls, settle }
}

describe('createAmountDisplay', () => {
  it('shows a public amount as public without decrypting', async () => {
    const { decrypt, calls } = fakeDecrypt()
    const display = createAmountDisplay(decrypt)
    const amount: Amount = { kind: 'public', value: 150_000n }

    assert.deepEqual(display.show(amount, undefined), { visibility: 'public', value: 150_000n })
    assert.deepEqual(await display.reveal(amount, borrower), {
      visibility: 'public',
      value: 150_000n,
    })
    assert.equal(calls.length, 0)
  })

  it('redacts an encrypted amount for a viewer without a recipient key', async () => {
    const { decrypt, calls } = fakeDecrypt()
    const display = createAmountDisplay(decrypt)

    assert.deepEqual(display.show(owed, undefined), { visibility: 'redacted' })
    assert.deepEqual(await display.reveal(owed, outsider), { visibility: 'redacted' })
    assert.equal(calls.length, 0)
  })

  it('decrypts the ciphertext sent to the viewer key, within the amount bound', async () => {
    const { decrypt, calls, settle } = fakeDecrypt()
    const display = createAmountDisplay(decrypt)

    const revealed = display.reveal(owed, auditor)
    await settle()

    assert.deepEqual(await revealed, { visibility: 'decrypted', value: 105n })
    assert.deepEqual(calls, [['CT_AUDITOR', 'A0', 1000n]])
  })

  it('doubles the search bound from 1000 up to the amount bound', async () => {
    const { decrypt, calls, settle } = fakeDecrypt()
    const display = createAmountDisplay(decrypt)
    const large: Amount = { kind: 'encrypted', to: { '02B0': 'CT_LARGE' }, bound: 3000n }
    const tooLarge: Amount = { kind: 'encrypted', to: { '02B0': 'CT_LARGE' }, bound: 2000n }

    const revealed = display.reveal(large, borrower)
    await settle()

    assert.deepEqual(await revealed, { visibility: 'decrypted', value: 2500n })
    assert.deepEqual(
      calls.map(([, , bound]) => bound),
      [1000n, 2000n, 3000n],
    )

    const capped = fakeDecrypt()
    const failed = assert.rejects(createAmountDisplay(capped.decrypt).reveal(tooLarge, borrower), {
      message: /bound 2000/,
    })
    await capped.settle()
    await failed
    assert.deepEqual(
      capped.calls.map(([, , bound]) => bound),
      [1000n, 2000n],
    )
  })

  it('matches the viewer public key regardless of hex case', async () => {
    const { decrypt, settle } = fakeDecrypt()
    const display = createAmountDisplay(decrypt)

    const lowerRecipient: Amount = { kind: 'encrypted', to: { '02b0': 'CT_OTHER' }, bound: 1000n }
    const revealed = display.reveal(owed, { publicKey: '02b0', privateKey: 'B0' })
    const revealedLower = display.reveal(lowerRecipient, borrower)
    await settle()

    assert.deepEqual(await revealed, { visibility: 'decrypted', value: 105n })
    assert.deepEqual(await revealedLower, { visibility: 'decrypted', value: 7n })
  })

  it('shows pending while the decrypt runs, then notifies and shows the value', async () => {
    const { decrypt, settle } = fakeDecrypt()
    const display = createAmountDisplay(decrypt)
    let notified = 0
    display.subscribe(() => notified++)

    assert.deepEqual(display.show(owed, borrower), { visibility: 'pending' })
    assert.deepEqual(display.show(owed, borrower), { visibility: 'pending' })
    assert.equal(notified, 0)

    await settle()

    assert.equal(notified, 1)
    assert.deepEqual(display.show(owed, borrower), { visibility: 'decrypted', value: 105n })
  })

  it('decrypts each ciphertext once across show and reveal calls', async () => {
    const { decrypt, calls, settle } = fakeDecrypt()
    const display = createAmountDisplay(decrypt)
    const other: Amount = { kind: 'encrypted', to: { '02B0': 'CT_OTHER' }, bound: 1000n }

    display.show(owed, borrower)
    const first = display.reveal(owed, borrower)
    const second = display.reveal(other, borrower)
    await settle()
    await display.reveal(owed, borrower)
    display.show(other, borrower)

    assert.deepEqual(await first, { visibility: 'decrypted', value: 105n })
    assert.deepEqual(await second, { visibility: 'decrypted', value: 7n })
    assert.deepEqual(
      calls.map(([ciphertext]) => ciphertext),
      ['CT_BORROWER', 'CT_OTHER'],
    )
  })

  it('returns the same object for an unchanged display, as React snapshots need', async () => {
    const { decrypt, settle } = fakeDecrypt()
    const display = createAmountDisplay(decrypt)
    const deposit: Amount = { kind: 'public', value: 150_000n }

    assert.equal(display.show(deposit, undefined), display.show({ ...deposit }, undefined))
    assert.equal(display.show(owed, undefined), display.show(owed, outsider))
    assert.equal(display.show(owed, borrower), display.show(owed, borrower))
    await settle()
    assert.equal(display.show(owed, borrower), display.show(owed, borrower))
  })

  it('fails with the ciphertext and bound when the value is outside the bound', async () => {
    const { decrypt, calls, settle } = fakeDecrypt()
    const display = createAmountDisplay(decrypt)
    const tight: Amount = { kind: 'encrypted', to: { '02B0': 'CT_BORROWER' }, bound: 100n }
    let notified = 0
    display.subscribe(() => notified++)

    const message = /CT_BORROWER.*bound 100/
    const revealed = assert.rejects(display.reveal(tight, borrower), (error: Error) => {
      assert.match(error.message, message)
      assert.match(String(error.cause), /mpt_decrypt_amount failed/)
      return true
    })
    await settle()
    await revealed

    assert.throws(() => display.show(tight, borrower), { message })
    await assert.rejects(display.reveal(tight, borrower), { message })
    assert.equal(notified, 1)
    assert.equal(calls.length, 1)
  })

  it('reports a failed decrypt through show alone, without an unhandled rejection', async () => {
    const { decrypt, settle } = fakeDecrypt()
    const display = createAmountDisplay(decrypt)
    const tight: Amount = { kind: 'encrypted', to: { '02B0': 'CT_BORROWER' }, bound: 100n }

    assert.deepEqual(display.show(tight, borrower), { visibility: 'pending' })
    await settle()

    assert.throws(() => display.show(tight, borrower), { message: /CT_BORROWER.*bound 100/ })
  })

  it('stops notifying a listener once it unsubscribes', async () => {
    const { decrypt, settle } = fakeDecrypt()
    const display = createAmountDisplay(decrypt)
    let notified = 0
    const unsubscribe = display.subscribe(() => notified++)

    unsubscribe()
    display.show(owed, borrower)
    await settle()

    assert.equal(notified, 0)
  })
})
