import { DEMO_AMOUNTS } from '@confidential-loans/core/demo-ledger'
import type { Action, Shown, Snapshot, Viewer } from '@confidential-loans/core/demo-ledger'

/** Screen 3 reads the ledger as Broker A, so the Lending Balance decrypts. */
export const DRAW_VIEWER: Viewer = 'brokerA'
/** The text the amount input starts with. */
export const DRAW_PREFILL = DEMO_AMOUNTS.draw.toString()

/** What the screen keeps locally: the amount input's text. */
export interface DrawUi {
  readonly drawInput: string
}

/** 0 before the draw, 1 after the draw, 2 after the merge. */
export type DrawStage = 0 | 1 | 2

export interface DrawValue {
  readonly label: string
  readonly shown: Shown
}

export interface DrawStep {
  readonly label: string
  readonly note: string
  readonly state: 'done' | 'todo'
}

/** The primary button: the action it submits, or a finished state with nothing to submit. */
export type DrawCta =
  | { readonly kind: 'submit'; readonly label: string; readonly action: Action }
  | { readonly kind: 'done'; readonly label: 'Done' }

export interface DrawScreen {
  readonly stage: DrawStage
  /** Vault available, Lending Balance inbox, Lending Balance spendable, in canvas order. */
  readonly values: readonly [DrawValue, DrawValue, DrawValue]
  readonly steps: readonly [DrawStep, DrawStep]
  readonly cta: DrawCta
  readonly next: { readonly href: '#/4'; readonly label: 'Continue to step 4' }
}

/** Before step 1 there is no Lending Balance, so it holds nothing. */
const EMPTY: Shown = Object.freeze({ visibility: 'public', value: 0n })
const STEP_NAMES = [
  { label: 'Draw from the vault', note: 'LoanBrokerDraw' },
  { label: 'Merge into spending', note: 'LoanBrokerMergeInbox' },
] as const

/** The stage of the latest successful step-3 transaction; step-7 merges do not count. */
function stageOf(s: Snapshot): DrawStage {
  const last = s.log.findLast((r) => r.step === 3 && r.result === 'tesSUCCESS')
  if (last === undefined) return 0
  return last.type === 'LoanBrokerMergeInbox' ? 2 : 1
}

/** A whole amount with optional thousands separators; anything else is 0, which the gate rejects. */
function parseDrawAmount(text: string): bigint {
  const digits = text.replaceAll(',', '').trim()
  return /^\d+$/.test(digits) ? BigInt(digits) : 0n
}

function ctaFor(stage: DrawStage, ui: DrawUi): DrawCta {
  if (stage === 0) {
    const action: Action = { type: 'LoanBrokerDraw', amount: parseDrawAmount(ui.drawInput) }
    return { kind: 'submit', label: STEP_NAMES[0].label, action }
  }
  if (stage === 1) {
    return { kind: 'submit', label: STEP_NAMES[1].label, action: { type: 'LoanBrokerMergeInbox' } }
  }
  return { kind: 'done', label: 'Done' }
}

/**
 * Derives screen 3 from the ledger, after canvas board 03 with K1 applied: the stage comes from
 * the log, and the finished state has no replay.
 *
 * @param s - A snapshot seen by `DRAW_VIEWER`.
 * @param ui - The amount input's text.
 * @returns The values, progress steps, CTA and link the board shows.
 */
export function drawScreen(s: Snapshot, ui: DrawUi): DrawScreen {
  const stage = stageOf(s)
  const balance = s.broker?.lendingBalance
  return {
    stage,
    values: [
      { label: 'Vault, available', shown: s.vault.assetsAvailable },
      { label: 'Lending Balance inbox', shown: balance?.inbox ?? EMPTY },
      { label: 'Lending Balance, spendable', shown: balance?.spending ?? EMPTY },
    ],
    steps: [
      { ...STEP_NAMES[0], state: stage > 0 ? 'done' : 'todo' },
      { ...STEP_NAMES[1], state: stage > 1 ? 'done' : 'todo' },
    ],
    cta: ctaFor(stage, ui),
    next: { href: '#/4', label: 'Continue to step 4' },
  }
}
