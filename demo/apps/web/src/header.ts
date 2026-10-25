import type { Snapshot } from '@confidential-loans/core/demo-ledger'
import { formatClock } from './cta.ts'
import { formatCount } from './value.ts'

export interface HeaderModel {
  readonly phase: string
  /** When the next phase starts, by ledger time; undefined in Redemption. */
  readonly next: string | undefined
  readonly ledger: string
}

/** Formats a wait as `m:ss`, never below `0:00`. */
function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * The vault phase bar in the corner. The countdown runs on ledger close times, so it moves once
 * per validated ledger.
 *
 * @param s - Any viewer's snapshot.
 */
export function header(s: Snapshot): HeaderModel {
  const ledger = `Ledger ${formatCount(s.ledgerIndex)}`
  const until = (name: string, at: number): string =>
    `${name} at ${formatClock(at)}, in ${countdown(at - s.now)}`
  switch (s.phase) {
    case 'subscription':
      return {
        phase: 'Subscription',
        next: until('Investment', s.vault.subscriptionDate + 1000),
        ledger,
      }
    case 'investment':
      return { phase: 'Investment', next: until('Redemption', s.vault.redemptionDate), ledger }
    case 'redemption':
      return { phase: 'Redemption', next: undefined, ledger }
  }
}
