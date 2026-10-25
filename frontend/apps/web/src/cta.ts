import type { Action, Gate, Time } from '@confidential-loans/core/demo-ledger'
import { stepHref } from './route.ts'

/** The one line under a CTA: a failure, a gate note, or a link to the missing step. */
export type CtaLine =
  | { readonly kind: 'alert'; readonly text: string }
  | { readonly kind: 'note'; readonly text: string }
  | { readonly kind: 'link'; readonly text: string; readonly href: string }

export interface CtaView {
  readonly text: string
  readonly disabled: boolean
  readonly line: CtaLine | undefined
}

export interface CtaInput {
  readonly label: string
  readonly action: Action
  /** `gate(snapshot, action)`; undefined while the first snapshot loads. */
  readonly gate: Gate | undefined
  /** `Snapshot.submitting`: the action in flight, if any. */
  readonly submitting: Action | undefined
  /** `failureText` of this action's last rejection, cleared on the next click. */
  readonly failure?: string | undefined
}

/**
 * A stable identity for an action, so a CTA recognizes its own action in `Snapshot.submitting`
 * and its own failure after the screen re-renders with a new object.
 */
export function actionKey(action: Action): string {
  return JSON.stringify(action, (_, value: unknown) =>
    typeof value === 'bigint' ? `${value}n` : value,
  )
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Formats a ledger time as local `HH:MM:SS`. */
export function formatClock(time: Time): string {
  const date = new Date(time)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** The text a CTA alerts for a rejected `act`: an `ActionFailed` message leads with its code. */
export function failureText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function gateLine(gate: Gate): CtaLine | undefined {
  if (gate.open) return undefined
  switch (gate.reason) {
    case 'opens':
      return { kind: 'note', text: `Opens at ${formatClock(gate.at)}` }
    case 'closed':
      return { kind: 'note', text: gate.code }
    case 'prerequisite':
      return { kind: 'link', text: `Complete step ${gate.step} first`, href: stepHref(gate.step) }
    case 'done':
      return undefined
  }
}

/**
 * Decides what a CTA shows: Submitting while its action runs, Done once it has run, and
 * otherwise its label, enabled only when the gate is open and nothing else is running.
 *
 * @param input - The label, the action, its gate and what is in flight or failed.
 * @returns The button text, whether it is disabled, and the line under it.
 */
export function ctaView(input: CtaInput): CtaView {
  const { label, action, gate, submitting, failure } = input
  if (submitting !== undefined && actionKey(submitting) === actionKey(action)) {
    return { text: 'Submitting', disabled: true, line: undefined }
  }
  if (gate === undefined) return { text: label, disabled: true, line: undefined }
  if (!gate.open && gate.reason === 'done') return { text: 'Done', disabled: true, line: undefined }
  const disabled = !gate.open || submitting !== undefined
  const line: CtaLine | undefined =
    failure === undefined ? gateLine(gate) : { kind: 'alert', text: failure }
  return { text: label, disabled, line }
}
