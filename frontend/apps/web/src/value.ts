import type { Shown } from '@confidential-loans/core/amount'

export type ValueView =
  | { readonly kind: 'amount'; readonly text: string; readonly tone: 'ink' | 'key' | 'dim' }
  | { readonly kind: 'redacted' }

/** An amount with its label, as `<Value>` takes it. */
export interface LabelledAmount {
  readonly label: string
  readonly shown: Shown
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
 * A pending decrypt reads "Decrypting" in dim text, the plan's D8 default.
 */
export function valueView(shown: Shown): ValueView {
  switch (shown.visibility) {
    case 'public':
      return { kind: 'amount', text: formatAmount(shown.value), tone: 'ink' }
    case 'decrypted':
      return { kind: 'amount', text: formatAmount(shown.value), tone: 'key' }
    case 'redacted':
      return { kind: 'redacted' }
    case 'pending':
      return { kind: 'amount', text: 'Decrypting', tone: 'dim' }
  }
}
