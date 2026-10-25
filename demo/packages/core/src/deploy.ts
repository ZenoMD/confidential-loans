import type { Client } from 'xrpl'

import { confidentialKeypair, fundIfMissing, walletFromSeed } from './accounts.ts'
import {
  authorize,
  convertToConfidential,
  mergeInbox,
  payPublic,
  readBalance,
  readMPToken,
} from './confidential.ts'
import { DEMO_AMOUNTS } from './demo-ledger.ts'
import { ROLES } from './kit.ts'
import type { Deployment, Role } from './kit.ts'
import {
  createClosedVault,
  createConfidentialLoanBroker,
  findLoanBroker,
  ledgerTime,
  readVault,
} from './lending.ts'
import { createConfidentialToken, readToken, registerTokenKeys } from './token.ts'

/** The deployment's steps, in order. Each creates only what the ledger lacks. */
export type Stage = 'wallets' | 'token' | 'holders' | 'vault' | 'broker'

export const STAGES = [
  'wallets',
  'token',
  'holders',
  'vault',
  'broker',
] as const satisfies readonly Stage[]

/** How long the run's vault takes deposits, then lends, in seconds. */
export interface Durations {
  readonly subscription: number
  readonly investment: number
}

/** XLS-65 closed-ended vaults: `RedemptionDate` is at least this long after `SubscriptionDate`. */
export const MIN_INVESTMENT_SECONDS = 180

/** The demo's floor, not the ledger's: time for both depositors to subscribe. */
export const MIN_SUBSCRIPTION_SECONDS = 180

/** Three minutes to subscribe, then 30 days of lending. */
export const DEFAULT_DURATIONS: Durations = Object.freeze({
  subscription: 180,
  investment: 30 * 86_400,
})

export interface DeployHooks {
  /** Called as each stage starts. */
  readonly onStage?: (stage: Stage) => void
  /** Called each time the deployment gains a ledger ID, so a later failure keeps it. */
  readonly onSave: (deployment: Deployment) => void
  /** Called with each validated transaction: its type and hash. Faucet funding has none. */
  readonly onTransaction?: (type: string, hash: string) => void
}

/**
 * Every account that holds the token. The broker owner needs an MPToken too: a confidential
 * LoanSet checks the owner's authorization and fails with `tecNO_AUTH` without one.
 */
const HOLDERS = [
  'brokerA',
  'depositorA',
  'depositorB',
  'borrowerA',
  'borrowerB',
] as const satisfies readonly Role[]

/**
 * The confidential balance each borrower starts with. Confidential supply bounds every decrypt,
 * so it stays small.
 */
const BORROWER_CONFIDENTIAL = 100_000n

/** Checks durations against the demo's floor and the ledger's closed-ended vault rules. */
export function durationProblem({ subscription, investment }: Durations): string | undefined {
  if (!Number.isSafeInteger(subscription) || subscription < MIN_SUBSCRIPTION_SECONDS) {
    return `Subscription must be at least ${MIN_SUBSCRIPTION_SECONDS} seconds`
  }
  if (!Number.isSafeInteger(investment) || investment < MIN_INVESTMENT_SECONDS) {
    return `Investment must be at least ${MIN_INVESTMENT_SECONDS} seconds`
  }
  return undefined
}

class Deployer {
  private readonly client: Client
  private readonly deployment: Deployment
  private readonly hooks: DeployHooks

  constructor(client: Client, deployment: Deployment, hooks: DeployHooks) {
    this.client = client
    this.deployment = deployment
    this.hooks = hooks
  }

  /** Reports a validated transaction and passes its hash on. */
  private sent(type: string, hash: string): string {
    this.hooks.onTransaction?.(type, hash)
    return hash
  }

  private wallet(role: Role) {
    return walletFromSeed(this.deployment.seeds[role])
  }

  async fundWallets(): Promise<void> {
    for (const role of ROLES) await fundIfMissing(this.client, this.wallet(role))
  }

  /** Issues CUSD unless the saved issuance exists, then registers the issuer and auditor keys. */
  async issueToken(): Promise<Deployment> {
    const { client, deployment } = this
    const issuer = this.wallet('issuer')
    let { mptIssuanceID } = deployment
    let token = mptIssuanceID === undefined ? undefined : await readToken(client, mptIssuanceID)
    if (mptIssuanceID === undefined || token === undefined) {
      const created = await createConfidentialToken(client, issuer)
      this.sent('MPTokenIssuanceCreate', created.hash)
      mptIssuanceID = created.mptIssuanceID
      token = await readToken(client, mptIssuanceID)
    }
    if (token?.AuditorEncryptionKey === undefined) {
      const keys = {
        issuer: confidentialKeypair(deployment.seeds.issuer).publicKey,
        auditor: confidentialKeypair(deployment.keySeeds.mptAuditor).publicKey,
      }
      this.sent('MPTokenIssuanceSet', await registerTokenKeys(client, issuer, mptIssuanceID, keys))
    }
    // A new token means the old vault, if any, held another asset.
    const vault = mptIssuanceID === deployment.mptIssuanceID ? deployment.vault : undefined
    return { ...deployment, mptIssuanceID, vault }
  }

  /** Authorizes every holder, then tops up the depositors' public and borrowers' confidential CUSD. */
  async fundHolders(token: string): Promise<void> {
    for (const role of HOLDERS) {
      if ((await readMPToken(this.client, this.wallet(role).address, token)) !== undefined) continue
      this.sent('MPTokenAuthorize', await authorize(this.client, this.wallet(role), token))
    }
    for (const role of ['depositorA', 'depositorB'] as const) {
      await this.topUpPublic(role, token, DEMO_AMOUNTS.deposit)
    }
    for (const role of ['borrowerA', 'borrowerB'] as const) {
      await this.topUpConfidential(role, token)
    }
  }

  /** Pays public CUSD from the issuer until `role` holds `target`. */
  private async topUpPublic(role: Role, token: string, target: bigint): Promise<void> {
    const { address } = this.wallet(role)
    const held = BigInt((await readMPToken(this.client, address, token))?.MPTAmount ?? '0')
    if (held >= target) return
    const issuer = this.wallet('issuer')
    this.sent('Payment', await payPublic(this.client, issuer, address, token, target - held))
  }

  /**
   * Brings a borrower's confidential balance to the target: the issuer pays the shortfall in
   * public CUSD, the borrower converts it (its first convert registers its ElGamal key, so its
   * MPToken gains the issuer and auditor balances LoanSet needs), then merges the inbox.
   */
  private async topUpConfidential(role: 'borrowerA' | 'borrowerB', token: string): Promise<void> {
    const borrower = this.wallet(role)
    const key = confidentialKeypair(this.deployment.seeds[role])
    const registered =
      (await readMPToken(this.client, borrower.address, token))?.HolderEncryptionKey !== undefined
    const balance = registered
      ? await readBalance(this.client, borrower.address, token, key)
      : { spending: 0n, inbox: 0n }
    const shortfall = BORROWER_CONFIDENTIAL - balance.spending - balance.inbox
    if (shortfall > 0n) {
      await this.topUpPublic(role, token, shortfall)
      const hash = await convertToConfidential(this.client, borrower, token, shortfall, key)
      this.sent('ConfidentialMPTConvert', hash)
    }
    if (shortfall > 0n || balance.inbox > 0n) {
      this.sent('ConfidentialMPTMergeInbox', await mergeInbox(this.client, borrower, token))
    }
  }

  /** Creates the run's closed-ended vault, owned by brokerA, starting from the ledger's time. */
  async createVault(token: string, durations: Durations): Promise<Deployment> {
    const problem = durationProblem(durations)
    if (problem !== undefined) throw new RangeError(problem)
    const now = await ledgerTime(this.client)
    const subscriptionDate = now + durations.subscription
    const redemptionDate = subscriptionDate + durations.investment
    const dates = { subscriptionDate, redemptionDate }
    const owner = this.wallet('brokerA')
    const { vaultID, hash } = await createClosedVault(this.client, owner, token, dates)
    this.sent('VaultCreate', hash)
    return { ...this.deployment, vault: { vaultID, ...dates } }
  }

  /**
   * Creates the vault's confidential LoanBroker under the Broker Key unless it exists. Its debt
   * cap is the token's maximum supply: the most the vault could ever lend.
   */
  async createBroker(token: string, vaultID: string): Promise<void> {
    const owner = this.wallet('brokerA')
    if ((await findLoanBroker(this.client, owner.address, vaultID)) !== undefined) return
    const maximum = (await readToken(this.client, token))?.MaximumAmount
    if (maximum === undefined) throw new Error(`Token ${token} has no MaximumAmount`)
    const brokerKey = confidentialKeypair(this.deployment.keySeeds.brokerA)
    const cap = BigInt(maximum)
    const hash = await createConfidentialLoanBroker(this.client, owner, vaultID, brokerKey, cap)
    this.sent('LoanBrokerSet', hash)
  }
}

/**
 * Deploys the demo to the devnet: funds the accounts, issues the confidential token, gives the
 * holders their starting balances, and creates the vault and its LoanBroker. Each stage creates only what the ledger
 * lacks, so a retry after a failure, or a rerun after a devnet reset, picks up where it stopped.
 * An existing vault is kept even once its deposits close.
 *
 * @param client - Connected client.
 * @param deployment - The seeds, and any ledger IDs already created.
 * @param durations - The vault's phases, if it has to be created.
 * @param hooks - Progress and persistence callbacks.
 * @returns The deployment with its token and vault.
 */
export async function deploy(
  client: Client,
  deployment: Deployment,
  durations: Durations,
  hooks: DeployHooks,
): Promise<Deployment> {
  hooks.onStage?.('wallets')
  await new Deployer(client, deployment, hooks).fundWallets()
  hooks.onStage?.('token')
  let current = await new Deployer(client, deployment, hooks).issueToken()
  hooks.onSave(current)
  const token = current.mptIssuanceID
  if (token === undefined) throw new Error('No token after issuing')
  hooks.onStage?.('holders')
  await new Deployer(client, current, hooks).fundHolders(token)
  hooks.onStage?.('vault')
  const { vault } = current
  if (vault === undefined || (await readVault(client, vault.vaultID)) === undefined) {
    current = await new Deployer(client, current, hooks).createVault(token, durations)
    hooks.onSave(current)
  }
  hooks.onStage?.('broker')
  const vaultID = current.vault?.vaultID
  if (vaultID === undefined) throw new Error('No vault after creating it')
  await new Deployer(client, current, hooks).createBroker(token, vaultID)
  return current
}
