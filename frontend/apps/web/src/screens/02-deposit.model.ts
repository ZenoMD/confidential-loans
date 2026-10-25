import { DEMO_AMOUNTS } from '@confidential-loans/core/demo-ledger'
import type { Action, Depositor, Shown, Snapshot } from '@confidential-loans/core/demo-ledger'
import { stepHref } from '#web/route.ts'
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

/** The aside: who acts, and the toggle that picks the depositor. */
export interface Step02Aside {
  readonly role: { readonly role: RoleKind; readonly who: string; readonly action: string }
  readonly toggle: {
    readonly label: string
    readonly options: readonly [ToggleOption<Depositor>, ToggleOption<Depositor>]
    readonly selected: Depositor
  }
}

export interface Step02Model {
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
 * Screen 2's aside. It needs no snapshot, so it renders while the ledger loads.
 *
 * @param ui - The selected depositor.
 * @returns The role and the depositor toggle, both following the selection.
 */
export function step02Aside(ui: Pick<Step02Ui, 'depositor'>): Step02Aside {
  return {
    role: {
      role: 'depositor',
      who: NAMES[ui.depositor],
      action: 'Subscribes with a public deposit',
    },
    toggle: {
      label: 'Depositor',
      options: [
        { value: 'depositorA', label: NAMES.depositorA },
        { value: 'depositorB', label: NAMES.depositorB },
      ],
      selected: ui.depositor,
    },
  }
}

/**
 * Screen 2, the depositors subscribing, as board `02` shows it with K7 applied: the wallet follows
 * the toggle. An empty amount submits 0, which `gate` rejects with `temBAD_AMOUNT`.
 *
 * @param s - The selected depositor's snapshot.
 * @param ui - The selected depositor and the amount, as entered.
 * @returns Everything the board's main column renders.
 */
export function step02(s: Snapshot, ui: Step02Ui): Step02Model {
  const name = NAMES[ui.depositor]
  const { wallet } = s.depositors[ui.depositor]
  const text = ui.amount.replace(/\D/g, '')
  return {
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
    next: { href: stepHref(3), label: 'Continue to step 3' },
  }
}
