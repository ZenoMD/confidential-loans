import { screenHref } from '#web/route.ts'
import type { Step } from '#web/route.ts'
import { STEPS, phaseOf } from '#web/stepNav.ts'
import type { Phase, RoleKind } from '#web/stepNav.ts'

/** Which legend icon a card carries. */
export type Exposure = 'encrypted' | 'public' | 'readOnly'

export interface Lane {
  readonly role: RoleKind
  readonly title: string
  readonly members: string
}

export interface PhaseSpan {
  readonly phase: Phase
  readonly first: Step
  readonly last: Step
}

export interface FlowCard {
  readonly step: Step
  /** Zero-padded step number, as printed on the card. */
  readonly label: string
  readonly href: string
  readonly title: string
  readonly transactions: string
  readonly exposure: Exposure
  /** 1-based lane rows the card covers. */
  readonly row: { readonly start: number; readonly span: number }
}

export interface FlowMapModel {
  readonly lanes: readonly Lane[]
  readonly phases: readonly PhaseSpan[]
  readonly cards: readonly FlowCard[]
}

const LANES: readonly Lane[] = [
  { role: 'depositor', title: 'Depositors', members: 'depositorA, depositorB' },
  { role: 'broker', title: 'Broker', members: 'brokerA' },
  { role: 'borrower', title: 'Borrowers', members: 'borrowerA, borrowerB' },
  { role: 'explorer', title: 'Explorer', members: 'outsider, auditor' },
]

const CARDS: Readonly<Record<Step, Pick<FlowCard, 'title' | 'transactions' | 'exposure'>>> = {
  1: {
    title: 'Create confidential LoanBroker',
    transactions: 'LoanBrokerSet',
    exposure: 'encrypted',
  },
  2: { title: 'Subscribe to the vault', transactions: 'VaultDeposit x2', exposure: 'public' },
  3: {
    title: 'Draw, then merge',
    transactions: 'LoanBrokerDraw, LoanBrokerMergeInbox',
    exposure: 'encrypted',
  },
  4: { title: 'Co-sign loan A and loan B', transactions: 'LoanSet x2', exposure: 'encrypted' },
  5: { title: 'Outsider vs auditor view', transactions: 'no transaction', exposure: 'readOnly' },
  6: {
    title: 'Borrower A repays in full',
    transactions: 'ConfidentialMPTMergeInbox, ConfidentialLoanPay',
    exposure: 'encrypted',
  },
  7: {
    title: 'Settle back to the vault',
    transactions: 'LoanBrokerMergeInbox, LoanBrokerSettle',
    exposure: 'encrypted',
  },
  8: { title: 'Impair, then default loan B', transactions: 'LoanManage x2', exposure: 'public' },
  9: { title: 'Outsider vs auditor view', transactions: 'no transaction', exposure: 'readOnly' },
  10: { title: 'Redeem, absorbing the loss', transactions: 'VaultWithdraw x2', exposure: 'public' },
}

function laneRows(step: Step, roles: readonly RoleKind[]): FlowCard['row'] {
  const rows = roles.map((role) => LANES.findIndex((lane) => lane.role === role) + 1)
  const start = Math.min(...rows)
  const span = Math.max(...rows) - start + 1
  if (rows.includes(0) || span !== rows.length) {
    throw new Error(`Step ${step} roles ${roles.join(', ')} are not adjacent lanes`)
  }
  return { start, span }
}

function phaseSpans(): PhaseSpan[] {
  const spans: PhaseSpan[] = []
  for (const { n } of STEPS) {
    const phase = phaseOf(n)
    const last = spans.at(-1)
    if (last?.phase === phase) spans[spans.length - 1] = { ...last, last: n }
    else spans.push({ phase, first: n, last: n })
  }
  return spans
}

/** Screen 0: lanes by role, phase pills over the steps, one card per step. */
export function flowMap(): FlowMapModel {
  const cards = STEPS.map(({ n, icons }): FlowCard => ({
    step: n,
    label: String(n).padStart(2, '0'),
    href: screenHref(n),
    ...CARDS[n],
    row: laneRows(n, icons),
  }))
  return { lanes: LANES, phases: phaseSpans(), cards }
}
