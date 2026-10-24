import { fundIfMissing, xrpBalance } from '@confidential-loans/core/accounts'
import { accountLink, withClient } from '@confidential-loans/core/network'

import { ROLES, roleWallet } from './env.ts'

await withClient(async (client) => {
  for (const role of ROLES) {
    const wallet = roleWallet(role)
    const funded = await fundIfMissing(client, wallet)
    const balance = await xrpBalance(client, wallet.address)
    const status = funded ? 'funded now' : 'existing'
    console.log(
      `${role.padEnd(10)} ${status.padEnd(10)} ${String(balance).padStart(10)} XRP  ${accountLink(wallet.address)}`,
    )
  }
})
