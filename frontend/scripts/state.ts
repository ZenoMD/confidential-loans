import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const STATE_PATH = new URL('state.json', import.meta.url)

/** Ledger IDs one script creates and later scripts use. Stored in `scripts/state.json`. */
export interface State {
  mptIssuanceID?: string
  /** The vault of the current run; dates are Ripple Epoch seconds. */
  vault?: { vaultID: string; subscriptionDate: number; redemptionDate: number } | undefined
}

export function readState(): State {
  if (!existsSync(STATE_PATH)) return {}
  return JSON.parse(readFileSync(STATE_PATH, 'utf8')) as State
}

export function saveState(values: State): void {
  writeFileSync(STATE_PATH, `${JSON.stringify({ ...readState(), ...values }, null, 2)}\n`)
}

/** Reads the token ID that `issue-token.ts` saved, or explains how to create it. */
export function requireToken(): string {
  const { mptIssuanceID } = readState()
  if (mptIssuanceID === undefined) {
    throw new Error('No token in scripts/state.json; run node scripts/issue-token.ts first')
  }
  return mptIssuanceID
}
