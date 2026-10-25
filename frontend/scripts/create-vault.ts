import { parseArgs } from 'node:util'

import { createClosedVault, ledgerTime, readVault } from '@confidential-loans/core/lending'
import { txLink, withClient } from '@confidential-loans/core/network'

import { roleWallet } from './env.ts'
import { readState, requireToken, saveState } from './state.ts'

const USAGE = `Usage: node scripts/create-vault.ts [--subscription <seconds>] [--investment <seconds>]

Creates the closed-ended CUSD vault for a run, owned by brokerA, unless scripts/state.json holds
one that still takes deposits. Step 1 of the app creates its LoanBroker.
  --subscription  seconds from now until deposits close (default 300)
  --investment    seconds between deposits closing and withdrawals opening, at least 180
                  (default 600)`

const RIPPLE_EPOCH_OFFSET = 946_684_800

const { values } = parseArgs({
  options: {
    subscription: { type: 'string', default: '300' },
    investment: { type: 'string', default: '600' },
    help: { type: 'boolean', default: false },
  },
})
if (values.help) {
  console.log(USAGE)
  process.exit(0)
}
const subscriptionSeconds = Number(values.subscription)
const investmentSeconds = Number(values.investment)
if (!(subscriptionSeconds > 0) || !(investmentSeconds >= 180)) {
  throw new Error(`--subscription must be > 0 and --investment >= 180\n${USAGE}`)
}
const token = requireToken()

const isoTime = (rippleSeconds: number): string =>
  new Date((rippleSeconds + RIPPLE_EPOCH_OFFSET) * 1000).toISOString()

await withClient(async (client) => {
  const now = await ledgerTime(client)
  const saved = readState().vault
  if (saved !== undefined && (await readVault(client, saved.vaultID)) !== undefined) {
    if (now <= saved.subscriptionDate) {
      console.log(`Vault ${saved.vaultID} still takes deposits`)
      console.log(`  deposits until   ${isoTime(saved.subscriptionDate)}`)
      console.log(`  withdrawals from ${isoTime(saved.redemptionDate)}`)
      return
    }
    console.log(`Vault ${saved.vaultID} closed its deposits; creating a new one`)
  }

  const subscriptionDate = now + subscriptionSeconds
  const redemptionDate = subscriptionDate + investmentSeconds
  const owner = roleWallet('brokerA')
  const vault = await createClosedVault(client, owner, token, { subscriptionDate, redemptionDate })
  saveState({ vault: { vaultID: vault.vaultID, subscriptionDate, redemptionDate } })
  console.log(`Vault ${vault.vaultID} owned by brokerA`)
  console.log(`  deposits until   ${isoTime(subscriptionDate)}`)
  console.log(`  withdrawals from ${isoTime(redemptionDate)}`)
  console.log(`  ${txLink(vault.hash)}`)
})
