import { screenHref } from './route.ts'
import type { Step, Screen } from './route.ts'

export type RoleKind = 'broker' | 'depositor' | 'borrower' | 'explorer'
export type Phase = 'Subscription' | 'Investment' | 'Redemption'
export type StepState = 'done' | 'current' | 'upcoming'

export interface StepItem {
  readonly n: Step
  readonly label: string
  readonly href: string
  /** Roles that act on the step, in display order. */
  readonly icons: readonly RoleKind[]
  readonly state: StepState
  readonly ariaCurrent: 'page' | 'false'
  readonly ariaLabel: string
  /** Visible text: the current step spells out its label, the others show only the number. */
  readonly text: string
}

export interface StepNavModel {
  readonly items: readonly StepItem[]
  /** Undefined on the flow map. */
  readonly phase: Phase | undefined
}

export const STEPS: readonly { n: Step; label: string; icons: readonly RoleKind[] }[] = [
  { n: 1, label: 'Create broker', icons: ['broker'] },
  { n: 2, label: 'Subscribe', icons: ['depositor'] },
  { n: 3, label: 'Draw and merge', icons: ['broker'] },
  { n: 4, label: 'Co-sign loans', icons: ['broker', 'borrower'] },
  { n: 5, label: 'Explorer', icons: ['explorer'] },
  { n: 6, label: 'Repay loan A', icons: ['borrower'] },
  { n: 7, label: 'Settle', icons: ['broker'] },
  { n: 8, label: 'Default loan B', icons: ['broker'] },
  { n: 9, label: 'Explorer after default', icons: ['explorer'] },
  { n: 10, label: 'Redeem', icons: ['depositor'] },
]

/** The vault phase the demo is in while a step runs. */
export function phaseOf(step: Step): Phase {
  if (step >= 10) return 'Redemption'
  if (step >= 3) return 'Investment'
  return 'Subscription'
}

function stateOf(n: Step, screen: Screen): StepState {
  if (n < screen) return 'done'
  return n === screen ? 'current' : 'upcoming'
}

/** The step navigation as seen from `screen`. */
export function stepNav(screen: Screen): StepNavModel {
  const items = STEPS.map(({ n, label, icons }): StepItem => {
    const state = stateOf(n, screen)
    return {
      n,
      label,
      href: screenHref(n),
      icons,
      state,
      ariaCurrent: state === 'current' ? 'page' : 'false',
      ariaLabel: `Step ${n}${state === 'upcoming' ? '' : `, ${state}`}: ${label}`,
      text: state === 'current' ? `${n} ${label}` : String(n),
    }
  })
  return { items, phase: screen === 0 ? undefined : phaseOf(screen) }
}
