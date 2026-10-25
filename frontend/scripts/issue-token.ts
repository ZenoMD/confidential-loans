import { xrpBalance } from '@confidential-loans/core/accounts'
import { txLink, withClient } from '@confidential-loans/core/network'
import {
  createConfidentialToken,
  readToken,
  registerTokenKeys,
} from '@confidential-loans/core/token'

import { confidentialKey, namedKey, roleWallet } from './env.ts'
import { readState, saveState } from './state.ts'

await withClient(async (client) => {
  const issuer = roleWallet('issuer')
  const saved = readState().mptIssuanceID
  let mptIssuanceID = saved
  let token = saved === undefined ? undefined : await readToken(client, saved)
  if (token === undefined) {
    if ((await xrpBalance(client, issuer.address)) === undefined) {
      throw new Error('The issuer account does not exist; run node scripts/setup-wallets.ts first')
    }
    const created = await createConfidentialToken(client, issuer)
    mptIssuanceID = created.mptIssuanceID
    saveState({ mptIssuanceID, vault: undefined })
    console.log(`Issued CUSD, an MPT that can hold confidential balances: ${mptIssuanceID}`)
    console.log(`  ${txLink(created.hash)}`)
    token = await readToken(client, mptIssuanceID)
  } else {
    console.log(`Token already issued: ${mptIssuanceID}`)
  }
  if (mptIssuanceID === undefined) throw new Error('No token ID after issuing')

  if (token?.AuditorEncryptionKey !== undefined) {
    console.log('The issuer and MPT Auditor ElGamal keys are registered')
    return
  }
  const keysHash = await registerTokenKeys(client, issuer, mptIssuanceID, {
    issuer: confidentialKey('issuer').publicKey,
    auditor: namedKey('AUDITOR').publicKey,
  })
  console.log('Registered the issuer and MPT Auditor ElGamal keys')
  console.log(`  ${txLink(keysHash)}`)
})
