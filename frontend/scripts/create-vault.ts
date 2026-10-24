import { parseArgs } from 'node:util'

import { readMPToken } from '@confidential-loans/core/confidential'
import {
  createClosedVault,
  createLoanBroker,
  depositCover,
  ledgerTime,
} from '@confidential-loans/core/lending'
import { txLink, withClient } from '@confidential-loans/core/network'

import { roleWallet } from './env.ts'
import { readState, saveState } from './state.ts'

const USAGE = `Usage: node scripts/create-vault.ts [--broker brokerA|brokerB]
                                   [--subscription <seconds>] [--investment <seconds>]

Creates a closed-ended CUSD vault owned by the broker, its LoanBroker, and first-loss cover.
  --subscription  seconds from now until deposits close (default 300)
  --investment    seconds between deposits closing and withdrawals opening, at least 180
                  (default 600)`

/** 1% management fee, 10% minimum cover, 50% of the minimum liquidated on default. */
const TERMS = { managementFeeRate: 1000, coverRateMinimum: 10000, coverRateLiquidation: 50000 }
const COVER = 10_000_000n
const RIPPLE_EPOCH_OFFSET = 946_684_800

const { values } = parseArgs({
  options: {
    broker: { type: 'string', default: 'brokerA' },
    subscription: { type: 'string', default: '300' },
    investment: { type: 'string', default: '600' },
    help: { type: 'boolean', default: false },
  },
})
const broker = values.broker
const subscriptionSeconds = Number(values.subscription)
const investmentSeconds = Number(values.investment)
if (values.help) {
  console.log(USAGE)
  process.exit(0)
}
if (broker !== 'brokerA' && broker !== 'brokerB') throw new Error(`--broker ${broker}\n${USAGE}`)
if (!(subscriptionSeconds > 0) || !(investmentSeconds >= 180)) {
  throw new Error(`--subscription must be > 0 and --investment >= 180\n${USAGE}`)
}

const mptIssuanceID = readState().mptIssuanceID
if (mptIssuanceID === undefined) {
  throw new Error('No token in scripts/state.json; run node scripts/issue-token.ts first')
}
const token = mptIssuanceID

const isoTime = (rippleSeconds: number): string =>
  new Date((rippleSeconds + RIPPLE_EPOCH_OFFSET) * 1000).toISOString()

await withClient(async (client) => {
  const owner = roleWallet(broker)
  const held = BigInt((await readMPToken(client, owner.address, token))?.MPTAmount ?? '0')
  if (held < COVER) {
    throw new Error(
      `${broker} holds ${held} public CUSD, below the ${COVER} cover; run node scripts/fund-holders.ts`,
    )
  }

  const subscriptionDate = (await ledgerTime(client)) + subscriptionSeconds
  const redemptionDate = subscriptionDate + investmentSeconds
  const vault = await createClosedVault(client, owner, token, { subscriptionDate, redemptionDate })
  console.log(`Vault ${vault.vaultID} owned by ${broker}`)
  console.log(`  deposits until  ${isoTime(subscriptionDate)}`)
  console.log(`  withdrawals from ${isoTime(redemptionDate)}`)
  console.log(`  ${txLink(vault.hash)}`)

  const loanBroker = await createLoanBroker(client, owner, vault.vaultID, TERMS)
  console.log(`LoanBroker ${loanBroker.loanBrokerID}: 1% management fee, 10% minimum cover`)
  console.log(`  ${txLink(loanBroker.hash)}`)

  const coverHash = await depositCover(client, owner, loanBroker.loanBrokerID, token, COVER)
  console.log(`Deposited ${COVER} CUSD of first-loss cover`)
  console.log(`  ${txLink(coverHash)}`)

  saveState({
    vaults: {
      ...readState().vaults,
      [broker]: {
        vaultID: vault.vaultID,
        loanBrokerID: loanBroker.loanBrokerID,
        subscriptionDate,
        redemptionDate,
      },
    },
  })
})
