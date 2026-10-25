import type { Shown } from '@confidential-loans/core/amount'

export type ValueView =
  | { readonly kind: 'amount'; readonly text: string; readonly tone: 'ink' | 'key' | 'dim' }
  | { readonly kind: 'redacted' }

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
