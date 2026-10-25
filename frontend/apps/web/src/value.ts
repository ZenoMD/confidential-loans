/** An amount as one viewer sees it. `pending` means a decrypt is still running. */
export type Shown =
  | { readonly visibility: 'public' | 'decrypted'; readonly value: bigint }
  | { readonly visibility: 'redacted' }
  | { readonly visibility: 'pending' }

export type ValueView =
  | { readonly kind: 'amount'; readonly text: string; readonly tone: 'ink' | 'key' }
  | { readonly kind: 'redacted' }
  | { readonly kind: 'pending' }

/** Formats a whole-unit amount as `$105,000`. */
export function formatAmount(value: bigint): string {
  if (value < 0n) {
    throw new RangeError(`formatAmount got ${value}: negative amounts have no agreed rendering`)
  }
  return `$${value.toLocaleString('en-US')}`
}

/** Applies the canvas rule: public in ink, decrypted in the key color, otherwise no digits. */
export function valueView(shown: Shown): ValueView {
  switch (shown.visibility) {
    case 'public':
      return { kind: 'amount', text: formatAmount(shown.value), tone: 'ink' }
    case 'decrypted':
      return { kind: 'amount', text: formatAmount(shown.value), tone: 'key' }
    case 'redacted':
    case 'pending':
      return { kind: shown.visibility }
  }
}
