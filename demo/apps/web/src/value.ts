import type { Reader, Seen } from '@confidential-loans/core/demo-ledger'
import { READER_NAMES } from './names.ts'

/** Public, encrypted and read with this viewer's key, or encrypted and unreadable. */
export type PrivacyIcon = 'public' | 'decrypted' | 'locked'

/** How private a value is: its icon, and the note that says who can read it. */
export interface Privacy {
  readonly icon: PrivacyIcon
  readonly note: string
}

export type ValueView = Privacy &
  (
    | { readonly kind: 'amount'; readonly text: string; readonly tone: 'ink' | 'key' | 'dim' }
    | { readonly kind: 'redacted' }
  )

/** An amount with its label, as `<Value>` takes it. */
export interface LabelledAmount {
  readonly label: string
  readonly shown: Seen
}

/** Everything that is not an encrypted amount: shares, dates, schedules and public amounts. */
export const PUBLIC: Privacy = Object.freeze({
  icon: 'public',
  note: 'Public on the ledger: anyone can read it.',
})

/** Joins names as `A`, `A and B`, or `A, B and C`. */
function list(names: readonly string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

function readable(readers: readonly Reader[] | undefined): string {
  const names = (readers ?? []).map((reader) => READER_NAMES[reader])
  return names.length === 0 ? '' : ` Readable by ${list(names)}.`
}

/** Says who can read an amount and whether this viewer is one of them. */
export function privacyOf(seen: Seen): Privacy {
  switch (seen.visibility) {
    case 'public':
      return PUBLIC
    case 'decrypted':
    case 'pending':
      return {
        icon: 'decrypted',
        note: `Encrypted on the ledger; decrypted with your key.${readable(seen.readers)}`,
      }
    case 'redacted':
      return {
        icon: 'locked',
        note: `Encrypted on the ledger.${readable(seen.readers)} You hold none of these keys.`,
      }
  }
}

/** A labelled fact that is not an amount, such as a share count or a date. */
export interface Fact {
  readonly label: string
  readonly text: string
}

/** What a whole-number field holds: the digits typed, and their value, 0 when empty. */
export interface Whole {
  readonly text: string
  readonly value: bigint
}

/** Keeps the digits of what was typed into a whole-number field. */
export function parseWhole(typed: string): Whole {
  const text = typed.replace(/\D/g, '')
  return { text, value: BigInt(text === '' ? 0 : text) }
}

/** What a percentage field holds: the text typed, and its value in hundredths of a percent. */
export interface Percent {
  readonly text: string
  readonly hundredths: bigint
}

/** Keeps the digits and one decimal point of what was typed, with at most two decimals. */
export function parsePercent(typed: string): Percent {
  const [whole = '', ...rest] = typed.replace(/[^\d.]/g, '').split('.')
  const decimals = rest.join('').slice(0, 2)
  const text = rest.length > 0 ? `${whole}.${decimals}` : whole
  const hundredths = BigInt(whole === '' ? 0 : whole) * 100n + BigInt(decimals.padEnd(2, '0'))
  return { text, hundredths }
}

/** Groups the thousands of a count, such as shares: `1,500`. */
export function formatCount(value: bigint | number): string {
  return value.toLocaleString('en-US')
}

/** Formats a whole-unit amount as `$105,000`. */
export function formatAmount(value: bigint): string {
  if (value < 0n) {
    throw new RangeError(`formatAmount got ${value}: negative amounts have no agreed rendering`)
  }
  return `$${value.toLocaleString('en-US')}`
}

/**
 * Applies the canvas rule: public in ink, decrypted in the key color, otherwise no digits.
 * A pending decrypt reads "Decrypting" in dim text, the plan's D8 default. Each carries its
 * privacy icon and note.
 */
export function valueView(shown: Seen): ValueView {
  const privacy = privacyOf(shown)
  switch (shown.visibility) {
    case 'public':
      return { ...privacy, kind: 'amount', text: formatAmount(shown.value), tone: 'ink' }
    case 'decrypted':
      return { ...privacy, kind: 'amount', text: formatAmount(shown.value), tone: 'key' }
    case 'redacted':
      return { ...privacy, kind: 'redacted' }
    case 'pending':
      return { ...privacy, kind: 'amount', text: 'Decrypting', tone: 'dim' }
  }
}
