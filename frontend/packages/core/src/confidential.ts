import {
  fetchMPTokenIssuance,
  loadMptCrypto,
  prepareConfidentialConvert,
  prepareConfidentialMergeInbox,
  prepareConfidentialSend,
} from 'xrpl'
import type { Client, ConfidentialKeypair, LedgerEntry, Wallet } from 'xrpl'

import { rippledErrorCode } from './accounts.ts'
import { submit } from './submit.ts'

/**
 * Reads an account's `MPToken` for an issuance from a validated ledger.
 *
 * @param client - Connected client.
 * @param account - Holder address.
 * @param mptIssuanceID - Issuance.
 * @param ledgerIndex - Ledger to read; the latest validated one by default.
 * @returns The entry, or undefined when the account has not authorized the token.
 */
export async function readMPToken(
  client: Client,
  account: string,
  mptIssuanceID: string,
  ledgerIndex: number | 'validated' = 'validated',
): Promise<LedgerEntry.MPToken | undefined> {
  try {
    const { result } = await client.request({
      command: 'ledger_entry',
      mptoken: { mpt_issuance_id: mptIssuanceID, account },
      ledger_index: ledgerIndex,
    })
    return result.node as unknown as LedgerEntry.MPToken
  } catch (error) {
    if (rippledErrorCode(error) === 'entryNotFound') return undefined
    throw error
  }
}

/**
 * Opts an account in to holding a token. Authorizing twice fails with `tecDUPLICATE` and burns
 * the fee, so callers check `readMPToken` first.
 *
 * @returns The transaction hash.
 */
export async function authorize(
  client: Client,
  holder: Wallet,
  mptIssuanceID: string,
): Promise<string> {
  const tx = {
    TransactionType: 'MPTokenAuthorize',
    Account: holder.address,
    MPTokenIssuanceID: mptIssuanceID,
  } as const
  return (await submit(client, tx, holder)).hash
}

/** Sends a public (visible) token amount. Returns the transaction hash. */
export async function payPublic(
  client: Client,
  sender: Wallet,
  destination: string,
  mptIssuanceID: string,
  amount: bigint,
): Promise<string> {
  const tx = {
    TransactionType: 'Payment',
    Account: sender.address,
    Destination: destination,
    Amount: { mpt_issuance_id: mptIssuanceID, value: amount.toString() },
  } as const
  return (await submit(client, tx, sender)).hash
}

/**
 * Moves part of a public balance into the holder's confidential inbox, with a zero-knowledge
 * proof. The first convert also registers the holder's ElGamal key; a convert of 0 does only that.
 *
 * @returns The transaction hash.
 */
export async function convertToConfidential(
  client: Client,
  holder: Wallet,
  mptIssuanceID: string,
  amount: bigint,
  holderKeypair: ConfidentialKeypair,
): Promise<string> {
  const tx = await prepareConfidentialConvert(client, {
    account: holder.address,
    mptIssuanceID,
    amount,
    holderKeypair,
  })
  return (await submit(client, tx, holder)).hash
}

/**
 * Moves incoming confidential funds from the inbox to the spending balance. Received funds land
 * in the inbox and cannot be spent until merged.
 *
 * @returns The transaction hash.
 */
export async function mergeInbox(
  client: Client,
  holder: Wallet,
  mptIssuanceID: string,
): Promise<string> {
  const tx = await prepareConfidentialMergeInbox(client, { account: holder.address, mptIssuanceID })
  return (await submit(client, tx, holder)).hash
}

/**
 * Sends a confidential amount: the ledger records only ciphertexts and a proof that the sender
 * can afford it. The proof binds the sender's sequence and balance, so nothing else may be
 * submitted from the sender between building and submitting it.
 *
 * @returns The transaction hash.
 */
export async function sendConfidential(
  client: Client,
  sender: Wallet,
  destination: string,
  mptIssuanceID: string,
  amount: bigint,
  senderKeypair: ConfidentialKeypair,
): Promise<string> {
  const tx = await prepareConfidentialSend(client, {
    account: sender.address,
    destination,
    mptIssuanceID,
    amount,
    senderKeypair,
  })
  return (await submit(client, tx, sender)).hash
}

export interface Balance {
  public: bigint
  spending: bigint
  inbox: bigint
}

/**
 * Reads a holder's public balance and decrypts its confidential spending and inbox balances.
 * The token and the issuance come from one validated ledger, so the decryption bound matches the
 * ciphertexts.
 *
 * Decryption searches up to the token's `ConfidentialOutstandingAmount`, so it takes longer as
 * confidential supply grows (about 3.6 s per 1,000,000 of supply per balance).
 *
 * @param client - Connected client.
 * @param account - Holder address.
 * @param mptIssuanceID - Token.
 * @param keypair - The holder's ElGamal keypair.
 * @returns Balances in whole token units; zero where the holder has none.
 */
export async function readBalance(
  client: Client,
  account: string,
  mptIssuanceID: string,
  keypair: ConfidentialKeypair,
): Promise<Balance> {
  const ledger = await client.request({ command: 'ledger', ledger_index: 'validated' })
  const ledgerIndex = ledger.result.ledger_index
  const [token, issuance, crypto] = await Promise.all([
    readMPToken(client, account, mptIssuanceID, ledgerIndex),
    fetchMPTokenIssuance(client, mptIssuanceID, ledgerIndex),
    loadMptCrypto(),
  ])
  const bound = BigInt(issuance.ConfidentialOutstandingAmount ?? '0')
  const decrypt = async (ciphertext: string | undefined): Promise<bigint> =>
    ciphertext === undefined ? 0n : crypto.decryptAmount(ciphertext, keypair.privateKey, bound)
  const [spending, inbox] = await Promise.all([
    decrypt(token?.ConfidentialBalanceSpending),
    decrypt(token?.ConfidentialBalanceInbox),
  ])
  return { public: BigInt(token?.MPTAmount ?? '0'), spending, inbox }
}
