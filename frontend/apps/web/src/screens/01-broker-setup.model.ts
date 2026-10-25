import { DEMO_AMOUNTS } from '@confidential-loans/core/demo-ledger'
import type { Action, Snapshot, Viewer } from '@confidential-loans/core/demo-ledger'
import { screenHref } from '#web/route.ts'
import type { RoleKind } from '#web/stepNav.ts'

/** Screen 1 shows no encrypted amount; it reads the ledger as the Broker. */
export const step01Viewer: Viewer = 'brokerA'

/** What the Broker has typed. */
export interface Step01Ui {
  readonly debtMaximum: string
}

/** The field starts at the agreed debt maximum. */
export const step01Initial: Step01Ui = { debtMaximum: String(DEMO_AMOUNTS.debtMaximum) }

export interface Step01Model {
  readonly role: { readonly role: RoleKind; readonly who: string; readonly action: string }
  readonly heading: string
  /** Whole units, digits only. Read-only once the broker exists, showing the ledger value. */
  readonly debtMaximum: {
    readonly label: string
    readonly text: string
    readonly readOnly: boolean
  }
  readonly terms: readonly { readonly label: string; readonly text: string }[]
  readonly cta: { readonly action: Action; readonly label: string }
  readonly next: { readonly href: string; readonly label: string }
}

/**
 * Screen 1, creating the confidential LoanBroker, as board `01` shows it. An empty debt maximum
 * submits 0, which the ledger reads as no cap.
 *
 * @param s - The Broker's snapshot.
 * @param ui - The typed debt maximum, as entered.
 * @returns Everything the board renders.
 */
export function step01(s: Snapshot, ui: Step01Ui): Step01Model {
  const text =
    s.broker === undefined ? ui.debtMaximum.replace(/\D/g, '') : String(s.broker.debtMaximum.value)
  return {
    role: { role: 'broker', who: 'Broker A', action: 'Creates the confidential LoanBroker' },
    heading: 'Terms',
    debtMaximum: { label: 'Debt maximum', text, readOnly: s.broker !== undefined },
    terms: [
      { label: 'Management fee', text: 'None' },
      { label: 'First-loss cover', text: 'None' },
    ],
    cta: {
      action: { type: 'LoanBrokerSet', debtMaximum: BigInt(text === '' ? 0 : text) },
      label: 'Create confidential LoanBroker',
    },
    next: { href: screenHref(2), label: 'Continue to step 2' },
  }
}
