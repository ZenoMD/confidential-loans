import type { Action, Gate, Time } from '@confidential-loans/core/demo-ledger'

/** The one line under a CTA: a failure, or why the gate is shut. */
export type CtaLine =
  | { readonly kind: 'alert'; readonly text: string }
  | { readonly kind: 'note'; readonly text: string }

/** An action and the label of the button that runs it, as `<Cta>` takes them. */
export interface Command {
  readonly action: Action
  readonly label: string
}

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
  /** Why the form's input cannot be sent, when the gate cannot tell without a decrypt. */
  readonly invalid?: string | undefined
}

/**
 * A stable identity for an action, so a CTA recognizes its own action in `Snapshot.submitting`
 * and its own failure after the tab re-renders with a new object.
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
    case 'blocked':
      return { kind: 'note', text: gate.why }
    case 'done':
      return undefined
  }
}

/**
 * Decides what a CTA shows: Submitting while its action runs, Done once it has run, and
 * otherwise its label, enabled only when the gate is open, the input is valid and nothing else is
 * running.
 *
 * @param input - The label, the action, its gate, the input's problem and what is in flight or
 *   failed.
 * @returns The button text, whether it is disabled, and the line under it.
 */
export function ctaView(input: CtaInput): CtaView {
  const { label, action, gate, submitting, failure, invalid } = input
  if (submitting !== undefined && actionKey(submitting) === actionKey(action)) {
    return { text: 'Submitting', disabled: true, line: undefined }
  }
  if (gate === undefined) return { text: label, disabled: true, line: undefined }
  if (!gate.open && gate.reason === 'done') return { text: 'Done', disabled: true, line: undefined }
  const disabled = !gate.open || invalid !== undefined || submitting !== undefined
  if (failure !== undefined) {
    return { text: label, disabled, line: { kind: 'alert', text: failure } }
  }
  const line =
    gateLine(gate) ?? (invalid === undefined ? undefined : { kind: 'note', text: invalid })
  return { text: label, disabled, line }
}
