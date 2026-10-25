import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { NETWORK } from '#lib/network'

const FIXTURE_FILE = `fixtures/${NETWORK.name}.json`
const FIXTURE_PATH = fileURLToPath(new URL(`../${FIXTURE_FILE}`, import.meta.url))

export interface DemoLoan {
  loanID: string
  borrower: string
  /** The loan's `LoanSequence`, kept so a deleted loan keeps its title. */
  sequence: number
}

/** What `app/setup.ts` deployed: a vault and broker owned by the Ledger account, and its loans. */
export interface Deployment {
  /** The broker account; its master key is on the Ledger. */
  owner: string
  /** The software regular key that set the deployment up. */
  regularKey: string
  vaultID: string
  loanBrokerID: string
  loans: DemoLoan[]
  createdAt: string
}

/** IDs this package keeps per network, in `fixtures/<network>.json` (git-ignored). */
export interface Fixture {
  ledgerAddress?: string
  mptIssuanceID?: string
  deployment?: Deployment
}

export function readFixture(): Fixture {
  if (!existsSync(FIXTURE_PATH)) return {}
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Fixture
}

export function saveFixture(values: Fixture): void {
  mkdirSync(fileURLToPath(new URL('../fixtures/', import.meta.url)), { recursive: true })
  writeFileSync(FIXTURE_PATH, `${JSON.stringify({ ...readFixture(), ...values }, null, 2)}\n`)
}

/**
 * Reads the deployment the app runs on.
 *
 * @returns The deployment's account and ledger IDs.
 * @throws When setup has not run on this network.
 */
export function readDeployment(): Deployment {
  const { deployment } = readFixture()
  if (deployment === undefined)
    throw new Error(`No deployment in ${FIXTURE_FILE}; run pnpm create-loans`)
  return deployment
}
