import {
  MPTokenIssuanceCreateFlags,
  decode,
  hashes,
  signLoanSetByCounterparty,
  xrpToDrops,
} from 'xrpl'
import type { Client, LoanSet, MPTAmount, Wallet } from 'xrpl'

import { readFixture, saveFixture } from '#lib/fixture'
import type { DemoLoan } from '#lib/fixture'
import { autofillForLedger, ledgerSign, openLedger } from '#lib/ledger'
import { accountLink, reconnecting, withClient } from '#lib/network'
import { createdId, entry } from '#lib/read'
import { expectSuccess, submit, submitBlob } from '#lib/submit'
import { ledgerTime, waitForLedgerTime } from '#lib/time'
import { regularKey, roleWallet } from '#lib/wallets'
import type { Role } from '#lib/wallets'

const OWNER_XRP = 50
const DEPOSIT = 1_000_000
const COVER = 100_000
// Subscription takes about five transactions; 150 s leaves room for a slow network.
const SUBSCRIPTION_SECONDS = 150
// Long enough that the loans stay usable until the demo, whenever it runs.
const INVESTMENT_SECONDS = 30 * 24 * 3600
const LOANS: Array<{ borrower: Role; name: string; principal: number }> = [
  { borrower: 'borrowerA', name: 'Borrower A', principal: 300_000 },
  { borrower: 'borrowerB', name: 'Borrower B', principal: 200_000 },
]
const PAYMENT_INTERVAL = 60
const GRACE_PERIOD = 60

function mpt(mptIssuanceID: string, value: number): MPTAmount {
  return { mpt_issuance_id: mptIssuanceID, value: String(value) }
}

function rippledError(error: unknown): string | undefined {
  return (error as { data?: { error?: string } }).data?.error
}

async function exists(client: Client, request: () => Promise<unknown>): Promise<boolean> {
  try {
    await reconnecting(client, request)
    return true
  } catch (error) {
    if (rippledError(error) === 'entryNotFound' || rippledError(error) === 'actNotFound') {
      return false
    }
    throw error
  }
}

/** The Ledger's address, read from the device once and then kept in the fixture. */
async function ledgerAddress(): Promise<string> {
  const saved = readFixture().ledgerAddress
  if (saved !== undefined) return saved
  console.log('Reading the broker address from the Ledger (XRP app open)')
  const session = await openLedger()
  await session.transport.close()
  saveFixture({ ledgerAddress: session.address })
  return session.address
}

/** Funds the Ledger account and lets the software regular key sign for it (one clear signature). */
async function prepareOwner(client: Client, owner: string, regular: Wallet, funder: Wallet) {
  const ownerExists = () =>
    client.request({ command: 'account_info', account: owner, ledger_index: 'validated' })
  if (!(await exists(client, ownerExists))) {
    const fund = {
      TransactionType: 'Payment',
      Account: funder.address,
      Destination: owner,
      Amount: xrpToDrops(OWNER_XRP),
    } as const
    await submit(client, fund, funder, `Payment ${OWNER_XRP} XRP to the Ledger account`)
  }
  const info = await client.request({ command: 'account_info', account: owner })
  if (info.result.account_data.RegularKey === regular.address) return
  console.log(`Approve SetRegularKey ${regular.address} on the Ledger (clear signing)`)
  const session = await openLedger()
  try {
    const tx = {
      TransactionType: 'SetRegularKey',
      Account: owner,
      RegularKey: regular.address,
    } as const
    const { txBlob } = await ledgerSign(session, await autofillForLedger(client, tx))
    expectSuccess(await submitBlob(client, txBlob, hashes.hashSignedTx(txBlob)), 'SetRegularKey')
  } finally {
    await session.transport.close()
  }
}

/** The token the vault lends: kept in the fixture, created again if the network lost it. */
async function issuance(client: Client, issuer: Wallet): Promise<string> {
  const saved = readFixture().mptIssuanceID
  const lookup = (id: string) => () =>
    client.request({ command: 'ledger_entry', mpt_issuance: id, ledger_index: 'validated' })
  if (saved !== undefined && (await exists(client, lookup(saved)))) return saved
  const create = {
    TransactionType: 'MPTokenIssuanceCreate',
    Account: issuer.address,
    AssetScale: 0,
    Flags: MPTokenIssuanceCreateFlags.tfMPTCanTransfer,
  } as const
  const outcome = await submit(client, create, issuer, 'MPTokenIssuanceCreate')
  const meta = outcome.validated?.result.meta
  if (typeof meta !== 'object' || !('mpt_issuance_id' in meta)) {
    throw new Error('MPTokenIssuanceCreate returned no mpt_issuance_id')
  }
  const mptIssuanceID = String(meta.mpt_issuance_id)
  saveFixture({ mptIssuanceID })
  return mptIssuanceID
}

async function authorize(client: Client, mptID: string, account: string, signer: Wallet) {
  const held = () =>
    client.request({
      command: 'ledger_entry',
      mptoken: { mpt_issuance_id: mptID, account },
      ledger_index: 'validated',
    })
  if (await exists(client, held)) return
  const tx = {
    TransactionType: 'MPTokenAuthorize',
    Account: account,
    MPTokenIssuanceID: mptID,
  } as const
  await submit(client, tx, signer, `MPTokenAuthorize ${account}`)
}

async function pay(client: Client, issuer: Wallet, mptID: string, to: string, amount: number) {
  const tx = {
    TransactionType: 'Payment',
    Account: issuer.address,
    Destination: to,
    Amount: mpt(mptID, amount),
  } as const
  await submit(client, tx, issuer, `Payment ${amount} to ${to}`)
}

async function createLoan(
  client: Client,
  owner: string,
  regular: Wallet,
  loanBrokerID: string,
  loan: (typeof LOANS)[number],
  mptID: string,
): Promise<DemoLoan> {
  const borrower = await roleWallet(client, loan.borrower)
  await authorize(client, mptID, borrower.address, borrower)
  const loanSet: LoanSet = {
    TransactionType: 'LoanSet',
    Account: owner,
    Counterparty: borrower.address,
    LoanBrokerID: loanBrokerID,
    PrincipalRequested: String(loan.principal),
    InterestRate: 10000,
    PaymentTotal: 2,
    PaymentInterval: PAYMENT_INTERVAL,
    GracePeriod: GRACE_PERIOD,
  }
  const brokerSigned = regular.sign(await client.autofill(loanSet)).tx_blob
  const coSigned = signLoanSetByCounterparty(borrower, decode(brokerSigned) as unknown as LoanSet)
  const label = `LoanSet ${loan.name}`
  const outcome = expectSuccess(await submitBlob(client, coSigned.tx_blob, coSigned.hash), label)
  const loanID = createdId(outcome.validated, 'Loan')
  const sequence = Number((await entry(client, loanID))?.['LoanSequence'])
  return { loanID, borrower: loan.name, sequence }
}

async function deploy(client: Client, owner: string, regular: Wallet, mptID: string) {
  const depositor = await roleWallet(client, 'depositor')
  const issuer = await roleWallet(client, 'issuer')
  await authorize(client, mptID, owner, regular)
  await authorize(client, mptID, depositor.address, depositor)
  await pay(client, issuer, mptID, owner, COVER)
  await pay(client, issuer, mptID, depositor.address, DEPOSIT)

  console.log('Vault, LoanBroker, cover and deposit (the regular key signs for the Ledger account)')
  const subscriptionDate = (await ledgerTime(client)) + SUBSCRIPTION_SECONDS
  const vaultCreate = {
    TransactionType: 'VaultCreate',
    Account: owner,
    Asset: { mpt_issuance_id: mptID },
    VaultKind: 1,
    SubscriptionDate: subscriptionDate,
    RedemptionDate: subscriptionDate + INVESTMENT_SECONDS,
  } as const
  const vaultOutcome = await submit(client, vaultCreate, regular, 'VaultCreate')
  const vaultID = createdId(vaultOutcome.validated, 'Vault')
  const brokerSet = {
    TransactionType: 'LoanBrokerSet',
    Account: owner,
    VaultID: vaultID,
    CoverRateMinimum: 10000,
    CoverRateLiquidation: 50000,
  } as const
  const brokerOutcome = await submit(client, brokerSet, regular, 'LoanBrokerSet')
  const loanBrokerID = createdId(brokerOutcome.validated, 'LoanBroker')
  const cover = {
    TransactionType: 'LoanBrokerCoverDeposit',
    Account: owner,
    LoanBrokerID: loanBrokerID,
    Amount: mpt(mptID, COVER),
  } as const
  await submit(client, cover, regular, 'LoanBrokerCoverDeposit')
  const deposit = {
    TransactionType: 'VaultDeposit',
    Account: depositor.address,
    VaultID: vaultID,
    Amount: mpt(mptID, DEPOSIT),
  } as const
  await submit(client, deposit, depositor, 'VaultDeposit')

  await waitForLedgerTime(client, subscriptionDate + 1, 'Investment phase')
  console.log('Two loans, signed by the regular key and co-signed by each borrower')
  const loans: DemoLoan[] = []
  for (const loan of LOANS)
    loans.push(await createLoan(client, owner, regular, loanBrokerID, loan, mptID))
  const createdAt = new Date().toISOString()
  saveFixture({
    deployment: { owner, regularKey: regular.address, vaultID, loanBrokerID, loans, createdAt },
  })
  return loans
}

await withClient(async (client) => {
  const owner = await ledgerAddress()
  const regular = regularKey()
  const issuer = await roleWallet(client, 'issuer')
  console.log(`broker account (master key on the Ledger): ${accountLink(owner)}`)
  await prepareOwner(client, owner, regular, issuer)
  const mptID = await issuance(client, issuer)
  const loans = await deploy(client, owner, regular, mptID)

  const lastLoan = await entry(client, loans.at(-1)?.loanID ?? '')
  const due = Number(lastLoan?.['NextPaymentDueDate'])
  await waitForLedgerTime(client, due + GRACE_PERIOD + 1, 'grace period end on every loan')
  console.log('Ready: every loan can be impaired, defaulted and deleted. Run pnpm start')
})
