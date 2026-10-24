import { MPTokenIssuanceCreateFlags, encodeMPTokenMetadata } from 'xrpl'
import type { Client, TransactionMetadata, Wallet } from 'xrpl'

import { rippledErrorCode } from './accounts.ts'
import { submit } from './submit.ts'

/** Largest supply the token can ever have, in whole units (`AssetScale` 0). */
const MAXIMUM_AMOUNT = '1000000000'

/**
 * Checks whether an MPT issuance exists in the latest validated ledger.
 *
 * @param client - Connected client.
 * @param mptIssuanceID - Issuance to look up.
 * @returns True when the issuance exists.
 */
export async function tokenExists(client: Client, mptIssuanceID: string): Promise<boolean> {
  try {
    await client.request({
      command: 'ledger_entry',
      mpt_issuance: mptIssuanceID,
      ledger_index: 'validated',
    })
    return true
  } catch (error) {
    if (rippledErrorCode(error) === 'entryNotFound') return false
    throw error
  }
}

/**
 * Creates the demo stablecoin: an MPT that can hold confidential balances.
 *
 * Confidential MPTs require `TransferFee` 0. Clawback and locking stay available to the issuer.
 *
 * @param client - Connected client.
 * @param issuer - Issuing account.
 * @returns The new issuance ID and the transaction hash.
 */
export async function createConfidentialToken(
  client: Client,
  issuer: Wallet,
): Promise<{ mptIssuanceID: string; hash: string }> {
  const { hash, response } = await submit(
    client,
    {
      TransactionType: 'MPTokenIssuanceCreate',
      Account: issuer.address,
      AssetScale: 0,
      MaximumAmount: MAXIMUM_AMOUNT,
      TransferFee: 0,
      Flags:
        MPTokenIssuanceCreateFlags.tfMPTCanHoldConfidentialBalance |
        MPTokenIssuanceCreateFlags.tfMPTCanTransfer |
        MPTokenIssuanceCreateFlags.tfMPTCanClawback |
        MPTokenIssuanceCreateFlags.tfMPTCanLock,
      MPTokenMetadata: encodeMPTokenMetadata({
        ticker: 'CUSD',
        name: 'Confidential USD',
        desc: 'Demo stablecoin for Confidential Loans on the XRP Ledger.',
        icon: 'https://github.com/ZenoMD.png',
        asset_class: 'rwa',
        asset_subclass: 'stablecoin',
        issuer_name: 'Confidential Loans demo issuer',
      }),
    },
    issuer,
  )
  const meta = response.result.meta as TransactionMetadata & { mpt_issuance_id?: string }
  if (meta.mpt_issuance_id === undefined) throw new Error(`No mpt_issuance_id in ${hash}`)
  return { mptIssuanceID: meta.mpt_issuance_id, hash }
}

/**
 * Registers the issuer's and auditor's ElGamal public keys on the token.
 *
 * Every confidential balance is also encrypted to these keys, so the issuer and auditor can read
 * it. Keys can only be set through `MPTokenIssuanceSet`, and only before any confidential balance
 * exists.
 *
 * @param client - Connected client.
 * @param issuer - Issuing account.
 * @param mptIssuanceID - Token to update.
 * @param keys - Issuer and auditor ElGamal public keys.
 * @returns The transaction hash.
 */
export async function registerTokenKeys(
  client: Client,
  issuer: Wallet,
  mptIssuanceID: string,
  keys: { issuer: string; auditor: string },
): Promise<string> {
  const { hash } = await submit(
    client,
    {
      TransactionType: 'MPTokenIssuanceSet',
      Account: issuer.address,
      MPTokenIssuanceID: mptIssuanceID,
      IssuerEncryptionKey: keys.issuer,
      AuditorEncryptionKey: keys.auditor,
    },
    issuer,
  )
  return hash
}
