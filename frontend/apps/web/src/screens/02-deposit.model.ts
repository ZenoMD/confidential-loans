import { DEMO_AMOUNTS } from '@confidential-loans/core/demo-ledger'
import type { Action, Depositor, Shown, Snapshot } from '@confidential-loans/core/demo-ledger'
import { screenHref } from '#web/route.ts'
import type { RoleKind } from '#web/stepNav.ts'
import type { ToggleOption } from '#web/Toggle.tsx'

/** The toggle and what the depositor has typed. Read the snapshot as `depositor`. */
export interface Step02Ui {
  readonly depositor: Depositor
  readonly amount: string
}

/** Depositor A, with the agreed deposit typed in. */
export const step02Initial: Step02Ui = {
  depositor: 'depositorA',
  amount: String(DEMO_AMOUNTS.deposit),
}

export interface Step02Model {
  readonly role: { readonly role: RoleKind; readonly who: string; readonly action: string }
  readonly toggle: {
    readonly label: string
    readonly options: readonly [ToggleOption<Depositor>, ToggleOption<Depositor>]
    readonly selected: Depositor
  }
  readonly wallet: { readonly label: string; readonly shown: Shown }
  readonly heading: string
  /** Whole units, digits only. */
  readonly amount: { readonly label: string; readonly text: string }
  /** `text` is what Max puts in the amount field: the whole wallet. */
  readonly max: { readonly label: string; readonly text: string }
  readonly cta: { readonly action: Action; readonly label: string }
  readonly next: { readonly href: string; readonly label: string }
}

const NAMES: Readonly<Record<Depositor, string>> = {
  depositorA: 'Depositor A',
  depositorB: 'Depositor B',
}

/**
 * Screen 2, the depositors subscribing, as board `02` shows it with K7 applied: the wallet follows
 * the toggle. An empty amount submits 0, which `gate` rejects with `temBAD_AMOUNT`.
 *
 * @param s - The selected depositor's snapshot.
 * @param ui - The selected depositor and the amount, as entered.
 * @returns Everything the board renders.
 */
export function step02(s: Snapshot, ui: Step02Ui): Step02Model {
  const name = NAMES[ui.depositor]
  const { wallet } = s.depositors[ui.depositor]
  const text = ui.amount.replace(/\D/g, '')
  return {
    role: { role: 'depositor', who: name, action: 'Subscribes with a public deposit' },
    toggle: {
      label: 'Depositor',
      options: [
        { value: 'depositorA', label: NAMES.depositorA },
        { value: 'depositorB', label: NAMES.depositorB },
      ],
      selected: ui.depositor,
    },
    wallet: { label: 'Wallet', shown: wallet },
    heading: 'Deposit',
    amount: { label: 'Deposit amount', text },
    max: { label: 'Max', text: String(wallet.value) },
    cta: {
      action: {
        type: 'VaultDeposit',
        depositor: ui.depositor,
        amount: BigInt(text === '' ? 0 : text),
      },
      label: `Deposit as ${name}`,
    },
    next: { href: screenHref(3), label: 'Continue to step 3' },
  }
}
