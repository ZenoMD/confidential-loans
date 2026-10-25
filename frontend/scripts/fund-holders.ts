import {
  authorize,
  convertToConfidential,
  mergeInbox,
  payPublic,
  readBalance,
  readMPToken,
} from '@confidential-loans/core/confidential'
import { DEMO_AMOUNTS } from '@confidential-loans/core/demo-ledger'
import { withClient } from '@confidential-loans/core/network'
import type { Client } from '@confidential-loans/core/network'

import { confidentialKey, roleWallet } from './env.ts'
import type { Role } from './env.ts'
import { requireToken } from './state.ts'

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
const DEPOSITORS = ['depositorA', 'depositorB'] as const satisfies readonly Role[]
const BORROWERS = ['borrowerA', 'borrowerB'] as const satisfies readonly Role[]

/**
 * The confidential balance each borrower starts a run with. Borrower A repays the 105,000 owed
 * from it plus the 100,000 principal. Confidential supply bounds every decrypt, so it stays small.
 */
const BORROWER_CONFIDENTIAL = 100_000n

const token = requireToken()

async function authorizeAll(client: Client): Promise<void> {
  for (const role of HOLDERS) {
    if ((await readMPToken(client, roleWallet(role).address, token)) !== undefined) continue
    await authorize(client, roleWallet(role), token)
    console.log(`  ${role} authorized CUSD`)
  }
}

/** Pays public CUSD from the issuer until `role` holds `target`. */
async function topUpPublic(client: Client, role: Role, target: bigint): Promise<void> {
  const address = roleWallet(role).address
  const held = BigInt((await readMPToken(client, address, token))?.MPTAmount ?? '0')
  if (held >= target) return
  await payPublic(client, roleWallet('issuer'), address, token, target - held)
  console.log(`  issuer paid ${target - held} public CUSD to ${role}`)
}

/**
 * Brings a borrower's confidential balance to the target: the issuer pays the shortfall in public
 * CUSD, the borrower converts it (its first convert registers its ElGamal key, so its MPToken
 * gains the issuer and auditor balances LoanSet needs), then merges the inbox into spending.
 */
async function topUpConfidential(client: Client, role: Role): Promise<void> {
  const borrower = roleWallet(role)
  const registered =
    (await readMPToken(client, borrower.address, token))?.HolderEncryptionKey !== undefined
  const balance = registered
    ? await readBalance(client, borrower.address, token, confidentialKey(role))
    : { public: 0n, spending: 0n, inbox: 0n }
  const shortfall = BORROWER_CONFIDENTIAL - balance.spending - balance.inbox
  if (shortfall > 0n) {
    await topUpPublic(client, role, shortfall)
    await convertToConfidential(client, borrower, token, shortfall, confidentialKey(role))
    console.log(`  ${role} converted ${shortfall} CUSD to its confidential balance`)
  }
  if (shortfall > 0n || balance.inbox > 0n) {
    await mergeInbox(client, borrower, token)
    console.log(`  ${role} merged its inbox into spending`)
  }
}

async function printBalances(client: Client): Promise<void> {
  console.log("Balances (confidential amounts decrypted with each borrower's own key):")
  for (const role of DEPOSITORS) {
    const held = (await readMPToken(client, roleWallet(role).address, token))?.MPTAmount ?? '0'
    console.log(`  ${role.padEnd(10)} public ${held.padStart(8)}`)
  }
  for (const role of BORROWERS) {
    const b = await readBalance(client, roleWallet(role).address, token, confidentialKey(role))
    console.log(
      `  ${role.padEnd(10)} public ${String(b.public).padStart(8)}  confidential ${b.spending} (inbox ${b.inbox})`,
    )
  }
}

await withClient(async (client) => {
  console.log('1. Holders authorize CUSD')
  await authorizeAll(client)
  console.log(`2. Issuer tops depositors up to ${DEMO_AMOUNTS.deposit} public CUSD`)
  for (const role of DEPOSITORS) await topUpPublic(client, role, DEMO_AMOUNTS.deposit)
  console.log(`3. Borrowers top up to ${BORROWER_CONFIDENTIAL} confidential CUSD`)
  for (const role of BORROWERS) await topUpConfidential(client, role)
  await printBalances(client)
})
