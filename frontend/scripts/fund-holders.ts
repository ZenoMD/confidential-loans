import {
  authorize,
  convertToConfidential,
  mergeInbox,
  payPublic,
  readBalance,
  readMPToken,
  sendConfidential,
} from '@confidential-loans/core/confidential'
import { withClient } from '@confidential-loans/core/network'
import type { Client } from '@confidential-loans/core/network'

import { confidentialKey, roleWallet } from './env.ts'
import type { Role } from './env.ts'
import { readState } from './state.ts'

const HOLDERS = [
  'treasury',
  'brokerA',
  'brokerB',
  'depositorA',
  'depositorB',
  'borrowerA',
  'borrowerB',
] as const satisfies readonly Role[]

/** Confidential supply the treasury creates once and hands out from. */
const TREASURY_SUPPLY = 500_000n
/** Public balances: brokers post first-loss cover, depositors fund the vault. */
const PUBLIC_TARGETS: Partial<Record<Role, bigint>> = {
  brokerA: 50_000_000n,
  brokerB: 50_000_000n,
  depositorA: 300_000_000n,
  depositorB: 300_000_000n,
}
/** Confidential balance each borrower starts with, to pay interest from. */
const BORROWER_CONFIDENTIAL = 100_000n

const mptIssuanceID = readState().mptIssuanceID
if (mptIssuanceID === undefined) {
  throw new Error('No token in scripts/state.json; run node scripts/issue-token.ts first')
}
const token = mptIssuanceID

async function authorizeAll(client: Client): Promise<void> {
  for (const role of HOLDERS) {
    if ((await readMPToken(client, roleWallet(role).address, token)) !== undefined) continue
    await authorize(client, roleWallet(role), token)
    console.log(`  ${role} authorized CUSD`)
  }
}

async function topUpPublic(client: Client): Promise<void> {
  const issuer = roleWallet('issuer')
  for (const [role, target] of Object.entries(PUBLIC_TARGETS) as Array<[Role, bigint]>) {
    const address = roleWallet(role).address
    const held = BigInt((await readMPToken(client, address, token))?.MPTAmount ?? '0')
    if (held >= target) continue
    await payPublic(client, issuer, address, token, target - held)
    console.log(`  issuer paid ${target - held} public CUSD to ${role}`)
  }
}

async function createTreasurySupply(client: Client): Promise<void> {
  const treasury = roleWallet('treasury')
  if ((await readMPToken(client, treasury.address, token))?.HolderEncryptionKey !== undefined)
    return
  await payPublic(client, roleWallet('issuer'), treasury.address, token, TREASURY_SUPPLY)
  await convertToConfidential(client, treasury, token, TREASURY_SUPPLY, confidentialKey('treasury'))
  await mergeInbox(client, treasury, token)
  console.log(`  treasury converted ${TREASURY_SUPPLY} CUSD to a confidential balance`)
}

async function registerKeys(client: Client): Promise<void> {
  for (const role of HOLDERS) {
    const wallet = roleWallet(role)
    if ((await readMPToken(client, wallet.address, token))?.HolderEncryptionKey !== undefined) {
      continue
    }
    await convertToConfidential(client, wallet, token, 0n, confidentialKey(role))
    console.log(`  ${role} registered its ElGamal key`)
  }
}

async function topUpBorrowers(client: Client): Promise<void> {
  const treasury = roleWallet('treasury')
  for (const role of ['borrowerA', 'borrowerB'] as const) {
    const borrower = roleWallet(role)
    const balance = await readBalance(client, borrower.address, token, confidentialKey(role))
    const held = balance.spending + balance.inbox
    if (held < BORROWER_CONFIDENTIAL) {
      const amount = BORROWER_CONFIDENTIAL - held
      await sendConfidential(
        client,
        treasury,
        borrower.address,
        token,
        amount,
        confidentialKey('treasury'),
      )
      console.log(`  treasury sent ${amount} confidential CUSD to ${role}`)
    }
    if (balance.inbox > 0n || held < BORROWER_CONFIDENTIAL) {
      await mergeInbox(client, borrower, token)
      console.log(`  ${role} merged its inbox into its spending balance`)
    }
  }
}

async function printBalances(client: Client): Promise<void> {
  console.log("Balances (confidential amounts decrypted with each holder's own key):")
  for (const role of HOLDERS) {
    const b = await readBalance(client, roleWallet(role).address, token, confidentialKey(role))
    console.log(
      `  ${role.padEnd(10)} public ${String(b.public).padStart(11)}  confidential ${String(b.spending).padStart(7)} (inbox ${b.inbox})`,
    )
  }
}

await withClient(async (client) => {
  console.log('1. Holders authorize CUSD')
  await authorizeAll(client)
  console.log('2. Issuer pays public CUSD for broker cover and vault deposits')
  await topUpPublic(client)
  console.log(
    '3. Treasury creates the confidential supply (issuers cannot hold confidential balances)',
  )
  await createTreasurySupply(client)
  console.log('4. Every holder registers the key its confidential balance is encrypted to')
  await registerKeys(client)
  console.log('5. Treasury sends borrowers confidential CUSD for interest')
  await topUpBorrowers(client)
  await printBalances(client)
})
