import type { ConfidentialKeypair } from 'xrpl'

export type Hex = string

/** A token amount as the ledger holds it: in the clear, or encrypted to a set of keys. */
export type Amount =
  | { readonly kind: 'public'; readonly value: bigint }
  | {
      readonly kind: 'encrypted'
      /** The 66-byte ElGamal ciphertext for each recipient's compressed public key. */
      readonly to: Readonly<Record<Hex, Hex>>
      /** Largest value the decrypt searches for, inclusive. */
      readonly bound: bigint
    }

/** What a viewer can see of an amount once any decrypt has finished. */
export type Revealed =
  | { readonly visibility: 'public' | 'decrypted'; readonly value: bigint }
  | { readonly visibility: 'redacted' }

/** What a viewer can see of an amount right now. */
export type Shown = Revealed | { readonly visibility: 'pending' }

/** Recovers the value of an ElGamal ciphertext in [0, bound], as mpt-crypto `decryptAmount`. */
export type Decrypt = (ciphertext: Hex, privateKey: Hex, bound: bigint) => Promise<bigint>

/**
 * Decides, in one place, what each viewer sees of an amount. Public amounts stay public. An
 * encrypted amount is decrypted when the viewer holds a key it was sent to, and redacted
 * otherwise. Each ciphertext is decrypted at most once.
 */
export interface AmountDisplay {
  /**
   * Returns what the viewer sees now, starting the decrypt if it is needed and not yet started.
   * Returns the same object until the result changes, so it can back a React external store.
   *
   * @param amount - The amount to show.
   * @param key - The viewer's ElGamal keypair; undefined for a viewer with none.
   * @returns `pending` while the decrypt runs.
   * @throws {Error} When the decrypt failed, for example on a value above the bound.
   */
  show(amount: Amount, key: ConfidentialKeypair | undefined): Shown
  /** As `show`, but waits for the decrypt to finish. */
  reveal(amount: Amount, key: ConfidentialKeypair | undefined): Promise<Revealed>
  /**
   * Calls `listener` each time a decrypt finishes or fails.
   *
   * @returns A function that removes the listener.
   */
  subscribe(listener: () => void): () => void
}

type Decryption =
  | { readonly state: 'pending'; readonly settled: Promise<Revealed> }
  | { readonly state: 'done'; readonly shown: Revealed }
  | { readonly state: 'failed'; readonly error: Error }

const REDACTED: Revealed = Object.freeze({ visibility: 'redacted' })
const PENDING: Shown = Object.freeze({ visibility: 'pending' })

type Encrypted = Extract<Amount, { kind: 'encrypted' }>

function ciphertextFor(amount: Encrypted, key: ConfidentialKeypair): Hex | undefined {
  const publicKey = key.publicKey.toUpperCase()
  for (const [recipient, ciphertext] of Object.entries(amount.to)) {
    if (recipient.toUpperCase() === publicKey) return ciphertext
  }
  return undefined
}

/** First search bound; each failed search doubles it, up to the amount's bound. */
const FIRST_BOUND = 1000n

/**
 * Decrypts by searching doubling bounds. mpt-crypto 0.1.1 scans all of [0, bound], so a search
 * costs time linear in the bound, not the value (measured in Node 22: about 3.4 ms per 1,000 of
 * bound, and a value above the bound fails only after the full scan). Doubling keeps the total
 * within about 4 times the cost of a search bounded at the value itself.
 */
async function searchUpTo(
  decrypt: Decrypt,
  ciphertext: Hex,
  privateKey: Hex,
  bound: bigint,
): Promise<bigint> {
  let tried = FIRST_BOUND < bound ? FIRST_BOUND : bound
  for (;;) {
    try {
      return await decrypt(ciphertext, privateKey, tried)
    } catch (error) {
      if (tried >= bound) throw error
    }
    tried = tried * 2n < bound ? tried * 2n : bound
  }
}

/**
 * Creates the amount display.
 *
 * @param decrypt - Recovers a ciphertext's value; in the app, mpt-crypto `decryptAmount`.
 */
export function createAmountDisplay(decrypt: Decrypt): AmountDisplay {
  const decryptions = new Map<Hex, Decryption>()
  const publicValues = new Map<bigint, Revealed>()
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of listeners) listener()
  }

  function publicShown(value: bigint): Revealed {
    const cached = publicValues.get(value)
    if (cached !== undefined) return cached
    const shown: Revealed = Object.freeze({ visibility: 'public', value })
    publicValues.set(value, shown)
    return shown
  }

  function start(ciphertext: Hex, privateKey: Hex, bound: bigint): Decryption {
    const settled = searchUpTo(decrypt, ciphertext, privateKey, bound).then(
      (value) => {
        const shown: Revealed = Object.freeze({ visibility: 'decrypted', value })
        decryptions.set(ciphertext, { state: 'done', shown })
        return shown
      },
      (cause: unknown) => {
        const error = new Error(`Could not decrypt ${ciphertext} within bound ${bound}`, { cause })
        decryptions.set(ciphertext, { state: 'failed', error })
        throw error
      },
    )
    void settled.then(notify, notify)
    const pending: Decryption = { state: 'pending', settled }
    decryptions.set(ciphertext, pending)
    return pending
  }

  function lookup(amount: Amount, key: ConfidentialKeypair | undefined): Revealed | Decryption {
    if (amount.kind === 'public') return publicShown(amount.value)
    if (key === undefined) return REDACTED
    const ciphertext = ciphertextFor(amount, key)
    if (ciphertext === undefined) return REDACTED
    return decryptions.get(ciphertext) ?? start(ciphertext, key.privateKey, amount.bound)
  }

  return {
    show(amount, key) {
      const found = lookup(amount, key)
      if ('visibility' in found) return found
      switch (found.state) {
        case 'pending':
          return PENDING
        case 'done':
          return found.shown
        case 'failed':
          throw found.error
      }
    },
    async reveal(amount, key) {
      const found = lookup(amount, key)
      if ('visibility' in found) return found
      switch (found.state) {
        case 'pending':
          return found.settled
        case 'done':
          return found.shown
        case 'failed':
          throw found.error
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
