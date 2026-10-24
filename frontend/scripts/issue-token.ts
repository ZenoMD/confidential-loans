import { xrpBalance } from '@confidential-loans/core/accounts'
import { txLink, withClient } from '@confidential-loans/core/network'
import {
  createConfidentialToken,
  registerTokenKeys,
  tokenExists,
} from '@confidential-loans/core/token'

import { auditorKey, confidentialKey, roleWallet } from './env.ts'
import { readState, saveState } from './state.ts'

await withClient(async (client) => {
  const existing = readState().mptIssuanceID
  if (existing !== undefined && (await tokenExists(client, existing))) {
    console.log(`Token already issued: ${existing}. Delete scripts/state.json to issue a new one.`)
    return
  }

  const issuer = roleWallet('issuer')
  if ((await xrpBalance(client, issuer.address)) === undefined) {
    throw new Error('The issuer account does not exist; run node scripts/setup-wallets.ts first')
  }

  const { mptIssuanceID, hash } = await createConfidentialToken(client, issuer)
  console.log(`Issued CUSD, an MPT that can hold confidential balances: ${mptIssuanceID}`)
  console.log(`  ${txLink(hash)}`)

  const keysHash = await registerTokenKeys(client, issuer, mptIssuanceID, {
    issuer: confidentialKey('issuer').publicKey,
    auditor: auditorKey().publicKey,
  })
  console.log('Registered the issuer and auditor ElGamal keys')
  console.log(`  ${txLink(keysHash)}`)

  saveState({ mptIssuanceID })
})
