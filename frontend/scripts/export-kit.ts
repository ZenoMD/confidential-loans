import { walletFromSeed } from '@confidential-loans/core/accounts'
import { serializeKit } from '@confidential-loans/core/kit'
import type { Kit } from '@confidential-loans/core/kit'

import { keySeed, roleSeed } from './env.ts'
import { readState, requireToken } from './state.ts'

const SIGNERS = ['brokerA', 'depositorA', 'depositorB', 'borrowerA', 'borrowerB'] as const

const vault = readState().vault
if (vault === undefined) {
  throw new Error('No vault in scripts/state.json; run node scripts/create-vault.ts first')
}

const account = (role: (typeof SIGNERS)[number]) => {
  const seed = roleSeed(role)
  return { address: walletFromSeed(seed).address, seed }
}

const kit: Kit = {
  mptIssuanceID: requireToken(),
  vaultID: vault.vaultID,
  accounts: {
    brokerA: account('brokerA'),
    depositorA: account('depositorA'),
    depositorB: account('depositorB'),
    borrowerA: account('borrowerA'),
    borrowerB: account('borrowerB'),
  },
  elgamal: {
    brokerA: keySeed('BROKERA'),
    borrowerA: roleSeed('borrowerA'),
    borrowerB: roleSeed('borrowerB'),
    mptAuditor: keySeed('AUDITOR'),
    loanAuditor: keySeed('LOAN_AUDITOR'),
  },
}

console.error(
  'This kit holds every demo seed. Paste it into the app; never commit it or put it in a URL.',
)
process.stdout.write(serializeKit(kit))
