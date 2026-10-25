import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const STATE_PATH = new URL('state.json', import.meta.url)

/** Ledger IDs one script creates and later scripts use. Stored in `scripts/state.json`. */
export interface State {
  mptIssuanceID?: string
  /** Latest vault per broker; dates are Ripple Epoch seconds. */
  vaults?: Partial<
    Record<
      'brokerA' | 'brokerB',
      { vaultID: string; loanBrokerID: string; subscriptionDate: number; redemptionDate: number }
    >
  >
}

export function readState(): State {
  if (!existsSync(STATE_PATH)) return {}
  return JSON.parse(readFileSync(STATE_PATH, 'utf8')) as State
}

export function saveState(values: State): void {
  writeFileSync(STATE_PATH, `${JSON.stringify({ ...readState(), ...values }, null, 2)}\n`)
}
