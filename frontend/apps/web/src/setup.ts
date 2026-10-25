import { durationProblem } from '@confidential-loans/core/deploy'
import type { Durations, Stage } from '@confidential-loans/core/deploy'
import { secondsOf } from './duration.ts'
import type { DurationInput } from './duration.ts'

/** Where a deployment or a new run is: the stages finished, the one running, or the failure. */
export interface Progress {
  readonly stages: readonly Stage[]
  readonly done: readonly Stage[]
  readonly running: Stage | undefined
  readonly failure: { readonly stage: Stage | undefined; readonly error: string } | undefined
}

export const IDLE: Progress = { stages: [], done: [], running: undefined, failure: undefined }

const LABELS: Readonly<Record<Stage, string>> = {
  wallets: 'Fund the accounts from the faucet',
  token: 'Issue CUSD and register the issuer and auditor keys',
  holders: 'Give depositors public CUSD and borrowers confidential CUSD',
  vault: 'Create the vault',
  broker: 'Create the LoanBroker under the Broker Key',
}

export interface StageRow {
  readonly stage: Stage
  readonly label: string
  readonly state: 'done' | 'running' | 'failed' | 'todo'
}

/** The progress list: one row per stage of the deployment or run. */
export function stageRows(progress: Progress): readonly StageRow[] {
  return progress.stages.map((stage) => {
    let state: StageRow['state'] = 'todo'
    if (progress.done.includes(stage)) state = 'done'
    else if (progress.running === stage) state = 'running'
    else if (progress.failure?.stage === stage) state = 'failed'
    return { stage, label: LABELS[stage], state }
  })
}

/** Marks the running stage done. */
export function finish(progress: Progress): Progress {
  const { running } = progress
  const done = running === undefined ? progress.done : [...progress.done, running]
  return { ...progress, done, running: undefined }
}

/** Marks the running stage done and starts `stage`. */
export function startStage(progress: Progress, stage: Stage): Progress {
  return { ...finish(progress), running: stage }
}

/** Records the failure against the running stage. */
export function fail(progress: Progress, error: string): Progress {
  return { ...progress, running: undefined, failure: { stage: progress.running, error } }
}

export interface DurationInputs {
  readonly subscription: DurationInput
  readonly investment: DurationInput
}

/** Reads the duration fields: the durations, or why they would be refused. */
export function durationsOf(inputs: DurationInputs): {
  readonly durations: Durations
  readonly problem: string | undefined
} {
  const durations = {
    subscription: secondsOf(inputs.subscription),
    investment: secondsOf(inputs.investment),
  }
  return { durations, problem: durationProblem(durations) }
}
