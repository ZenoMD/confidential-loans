/**
 * The confidential lending lifecycle (SPEC.md) against the live devnet, through
 * the xrpl.js builders: an issuer creates a confidential MPT, a lender funds a
 * closed-ended vault and runs a confidential LoanBroker over it, draws into the
 * Lending Balance, lends confidentially to a borrower, is repaid with a regular
 * and a full confidential payment, and settles everything back to the vault.
 *
 * The steps share state and run in order. The vault's Subscription window must
 * pass before the broker can draw, so the run takes a minute or two.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import {
  type Client,
  deriveConfidentialKeypair,
  getConfidentialBalance,
  getLendingBalance,
  LedgerEntry,
  loadMptCrypto,
  type MPTokenIssuanceCreate,
  prepareConfidentialConvert,
  prepareConfidentialLoanBrokerSet,
  prepareConfidentialLoanPay,
  prepareConfidentialLoanSet,
  prepareConfidentialMergeInbox,
  prepareLoanBrokerDraw,
  prepareLoanBrokerMergeInbox,
  prepareLoanBrokerSettle,
  signLoanSetByCounterparty,
  type TransactionMetadata,
  type Wallet,
} from 'xrpl'

import {
  connect,
  createdIndex,
  fundWallet,
  ledgerCloseTime,
  ledgerEntry,
  submit,
  submitSigned,
  waitForCloseTime,
} from '../src/devnet.ts'

// Seconds after vault creation before the Investment phase starts: long enough
// to deposit and create the LoanBroker during the Subscription phase.
const SUBSCRIPTION_OFFSET = 30
const INVESTMENT_WINDOW = 1_000_000
const VAULT_KIND_CLOSED = 1

const ISSUED = { lender: 10_000n, borrower: 2_000n }
const DEPOSIT = 5_000n
const DRAW = 3_000n
const TERMS = {
  principal: 600n,
  amountOwed: 660n,
  periodicPayment: 60n,
  paymentTotal: 12,
  paymentInterval: 600,
}
const REGULAR_PAYMENT = 60n
// The Amount Owed left after the regular payment, paid in full.
const FULL_PAYMENT = TERMS.amountOwed - REGULAR_PAYMENT
// Everything the Lending Balance ends with: the draw, less the principal, plus
// both payments.
const SETTLE = DRAW - TERMS.principal + REGULAR_PAYMENT + FULL_PAYMENT

const issuerKey = deriveConfidentialKeypair()
const auditorKey = deriveConfidentialKeypair()
const brokerKey = deriveConfidentialKeypair()
const borrowerKey = deriveConfidentialKeypair()
const loanAuditorKey = deriveConfidentialKeypair()

/**
 * Decrypts a ciphertext with a test key, searching up to the deposit size.
 *
 * @param ciphertext - The ciphertext.
 * @param privateKey - The private key.
 * @returns The plaintext.
 */
async function decrypt(ciphertext: string | undefined, privateKey: string): Promise<bigint> {
  assert.ok(ciphertext != null, 'ciphertext is present')
  return (await loadMptCrypto()).decryptAmount(ciphertext, privateKey, ISSUED.lender)
}

describe('confidential lending lifecycle', () => {
  let client: Client
  let issuer: Wallet
  let lender: Wallet
  let borrower: Wallet
  let mptIssuanceID: string
  let vaultID: string
  let loanBrokerID: string
  let loanID: string

  const mpt = (value: bigint): { mpt_issuance_id: string; value: string } => ({
    mpt_issuance_id: mptIssuanceID,
    value: value.toString(),
  })
  const vault = async (): Promise<LedgerEntry.Vault> => ledgerEntry(client, vaultID)
  const broker = async (): Promise<LedgerEntry.LoanBroker> => ledgerEntry(client, loanBrokerID)
  const loan = async (): Promise<LedgerEntry.Loan> => ledgerEntry(client, loanID)

  before(async () => {
    client = await connect()
    ;[issuer, lender, borrower] = await Promise.all([
      fundWallet(client),
      fundWallet(client),
      fundWallet(client),
    ])
  })

  after(async () => {
    await client.disconnect()
  })

  it('creates a confidential MPT and distributes it', async () => {
    const created = await submit(
      client,
      {
        TransactionType: 'MPTokenIssuanceCreate',
        Account: issuer.classicAddress,
        AssetScale: 0,
        Flags: {
          tfMPTCanLock: true,
          tfMPTCanTransfer: true,
          tfMPTCanClawback: true,
          tfMPTCanHoldConfidentialBalance: true,
        },
      },
      issuer,
    )
    const { mpt_issuance_id } = created.result.meta as TransactionMetadata<MPTokenIssuanceCreate>
    assert.ok(mpt_issuance_id != null)
    mptIssuanceID = mpt_issuance_id

    // The issuer and MPT Auditor keys are registered together.
    await submit(
      client,
      {
        TransactionType: 'MPTokenIssuanceSet',
        Account: issuer.classicAddress,
        MPTokenIssuanceID: mptIssuanceID,
        IssuerEncryptionKey: issuerKey.publicKey,
        AuditorEncryptionKey: auditorKey.publicKey,
      },
      issuer,
    )

    for (const [holder, amount] of [
      [lender, ISSUED.lender],
      [borrower, ISSUED.borrower],
    ] as const) {
      await submit(
        client,
        {
          TransactionType: 'MPTokenAuthorize',
          Account: holder.classicAddress,
          MPTokenIssuanceID: mptIssuanceID,
        },
        holder,
      )
      await submit(
        client,
        {
          TransactionType: 'Payment',
          Account: issuer.classicAddress,
          Destination: holder.classicAddress,
          Amount: mpt(amount),
        },
        issuer,
      )
    }
  })

  it('gives the borrower a confidential balance', async () => {
    await submit(
      client,
      await prepareConfidentialConvert(client, {
        account: borrower.classicAddress,
        amount: ISSUED.borrower,
        holderKeypair: borrowerKey,
        mptIssuanceID,
      }),
      borrower,
    )
    await submit(
      client,
      await prepareConfidentialMergeInbox(client, {
        account: borrower.classicAddress,
        mptIssuanceID,
      }),
      borrower,
    )
    assert.equal(
      await getConfidentialBalance(
        client,
        borrower.classicAddress,
        mptIssuanceID,
        borrowerKey.privateKey,
      ),
      ISSUED.borrower,
    )
  })

  it('funds a closed-ended vault and creates a confidential LoanBroker', async () => {
    const subscriptionDate = (await ledgerCloseTime(client)) + SUBSCRIPTION_OFFSET
    const created = await submit(
      client,
      {
        TransactionType: 'VaultCreate',
        Account: lender.classicAddress,
        Asset: { mpt_issuance_id: mptIssuanceID },
        VaultKind: VAULT_KIND_CLOSED,
        SubscriptionDate: subscriptionDate,
        RedemptionDate: subscriptionDate + INVESTMENT_WINDOW,
      },
      lender,
    )
    vaultID = createdIndex(created, 'Vault')

    await submit(
      client,
      {
        TransactionType: 'VaultDeposit',
        Account: lender.classicAddress,
        VaultID: vaultID,
        Amount: mpt(DEPOSIT),
      },
      lender,
    )

    const brokerSet = await submit(
      client,
      await prepareConfidentialLoanBrokerSet(client, {
        account: lender.classicAddress,
        vaultID,
        brokerKeypair: brokerKey,
      }),
      lender,
    )
    loanBrokerID = createdIndex(brokerSet, 'LoanBroker')
    const entry = await broker()
    assert.ok(
      (entry.Flags & LedgerEntry.LoanBrokerFlags.lsfLoanBrokerConfidential) !== 0,
      'LoanBroker is confidential',
    )
    assert.deepEqual(await getLendingBalance(client, loanBrokerID, brokerKey.privateKey), {
      spending: 0n,
      inbox: 0n,
    })

    // A confidential LoanBroker takes no First-Loss Capital (spec §10).
    await submit(
      client,
      {
        TransactionType: 'LoanBrokerCoverDeposit',
        Account: lender.classicAddress,
        LoanBrokerID: loanBrokerID,
        Amount: mpt(1n),
      },
      lender,
      'tecNO_PERMISSION',
    )

    // Drawing needs the Investment phase.
    await waitForCloseTime(client, subscriptionDate)
  })

  it('draws from the vault into the Lending Balance and merges the inbox', async () => {
    await submit(
      client,
      await prepareLoanBrokerDraw(client, {
        account: lender.classicAddress,
        loanBrokerID,
        amount: DRAW,
      }),
      lender,
    )
    assert.deepEqual(await getLendingBalance(client, loanBrokerID, brokerKey.privateKey), {
      spending: 0n,
      inbox: DRAW,
    })

    await submit(
      client,
      await prepareLoanBrokerMergeInbox(client, {
        account: lender.classicAddress,
        loanBrokerID,
      }),
      lender,
    )
    assert.deepEqual(await getLendingBalance(client, loanBrokerID, brokerKey.privateKey), {
      spending: DRAW,
      inbox: 0n,
    })

    assert.equal((await broker()).DebtTotal, DRAW.toString())
    const entry = await vault()
    assert.equal(entry.AssetsAvailable, (DEPOSIT - DRAW).toString())
    assert.equal(entry.AssetsTotal, DEPOSIT.toString())
  })

  it('lends confidentially to the borrower', async () => {
    const loanSet = await client.autofill(
      await prepareConfidentialLoanSet(client, {
        account: lender.classicAddress,
        loanBrokerID,
        borrower: borrower.classicAddress,
        brokerKeypair: brokerKey,
        loanAuditorKey: loanAuditorKey.publicKey,
        ...TERMS,
      }),
    )
    // The lender signs the autofilled LoanSet first; the borrower then adds
    // CounterpartySignature over it, and the doubly signed blob is submitted.
    const { tx_blob } = signLoanSetByCounterparty(borrower, lender.sign(loanSet).tx_blob)
    const created = await submitSigned(client, tx_blob)
    loanID = createdIndex(created, 'Loan')

    const entry = await loan()
    assert.ok(
      (entry.Flags & LedgerEntry.LoanFlags.lsfLoanConfidential) !== 0,
      'Loan is confidential',
    )
    assert.equal(entry.PaymentRemaining, TERMS.paymentTotal)
    assert.equal(entry.ConfidentialLoanVersion ?? 0, 0)
    // Each party reads its own copy of the terms.
    assert.equal(
      await decrypt(entry.BorrowerEncryptedAmountOwed, borrowerKey.privateKey),
      TERMS.amountOwed,
    )
    assert.equal(
      await decrypt(entry.BrokerEncryptedPeriodicPayment, brokerKey.privateKey),
      TERMS.periodicPayment,
    )
    assert.equal(
      await decrypt(entry.LoanAuditorEncryptedPrincipal, loanAuditorKey.privateKey),
      TERMS.principal,
    )

    // The principal left the Lending Balance; the vault is untouched.
    assert.deepEqual(await getLendingBalance(client, loanBrokerID, brokerKey.privateKey), {
      spending: DRAW - TERMS.principal,
      inbox: 0n,
    })
    assert.equal((await vault()).AssetsAvailable, (DEPOSIT - DRAW).toString())

    // The borrower merges the principal into its spendable balance.
    await submit(
      client,
      await prepareConfidentialMergeInbox(client, {
        account: borrower.classicAddress,
        mptIssuanceID,
      }),
      borrower,
    )
    assert.equal(
      await getConfidentialBalance(
        client,
        borrower.classicAddress,
        mptIssuanceID,
        borrowerKey.privateKey,
      ),
      ISSUED.borrower + TERMS.principal,
    )
  })

  it('rejects a public LoanPay on a confidential Loan', async () => {
    await submit(
      client,
      {
        TransactionType: 'LoanPay',
        Account: borrower.classicAddress,
        LoanID: loanID,
        Amount: mpt(REGULAR_PAYMENT),
      },
      borrower,
      'tecNO_PERMISSION',
    )
  })

  it('takes a regular confidential payment', async () => {
    await submit(
      client,
      await prepareConfidentialLoanPay(client, {
        account: borrower.classicAddress,
        loanID,
        amount: REGULAR_PAYMENT,
        borrowerKeypair: borrowerKey,
        amountOwed: TERMS.amountOwed,
        periodicPayment: TERMS.periodicPayment,
      }),
      borrower,
    )

    const entry = await loan()
    assert.equal(entry.PaymentRemaining, TERMS.paymentTotal - 1)
    assert.equal(entry.ConfidentialLoanVersion, 1)
    assert.equal(
      await decrypt(entry.BorrowerEncryptedAmountOwed, borrowerKey.privateKey),
      FULL_PAYMENT,
    )
    assert.equal(await decrypt(entry.BrokerEncryptedAmountOwed, brokerKey.privateKey), FULL_PAYMENT)
    assert.equal(
      await decrypt(entry.LoanAuditorEncryptedAmountOwed, loanAuditorKey.privateKey),
      FULL_PAYMENT,
    )
    assert.deepEqual(await getLendingBalance(client, loanBrokerID, brokerKey.privateKey), {
      spending: DRAW - TERMS.principal,
      inbox: REGULAR_PAYMENT,
    })
  })

  it('takes a full confidential payment that closes the Loan', async () => {
    // Without the terms the builder decrypts the Amount Owed itself, and a
    // payment equal to it is a full payment.
    const pay = await prepareConfidentialLoanPay(client, {
      account: borrower.classicAddress,
      loanID,
      amount: FULL_PAYMENT,
      borrowerKeypair: borrowerKey,
    })
    assert.equal(pay.Flags, 0x00020000)
    await submit(client, pay, borrower)

    const entry = await loan()
    // rippled omits PaymentRemaining once it reaches its default of 0.
    assert.equal(entry.PaymentRemaining ?? 0, 0)
    assert.equal(
      await getConfidentialBalance(
        client,
        borrower.classicAddress,
        mptIssuanceID,
        borrowerKey.privateKey,
      ),
      ISSUED.borrower + TERMS.principal - REGULAR_PAYMENT - FULL_PAYMENT,
    )
  })

  it('settles the Lending Balance back to the vault', async () => {
    await submit(
      client,
      await prepareLoanBrokerMergeInbox(client, {
        account: lender.classicAddress,
        loanBrokerID,
      }),
      lender,
    )
    assert.deepEqual(await getLendingBalance(client, loanBrokerID, brokerKey.privateKey), {
      spending: SETTLE,
      inbox: 0n,
    })

    await submit(
      client,
      await prepareLoanBrokerSettle(client, {
        account: lender.classicAddress,
        loanBrokerID,
        amount: SETTLE,
        brokerKeypair: brokerKey,
      }),
      lender,
    )
    assert.deepEqual(await getLendingBalance(client, loanBrokerID, brokerKey.privateKey), {
      spending: 0n,
      inbox: 0n,
    })
    // The settle repays the draw; the interest is yield to the vault.
    assert.equal((await broker()).DebtTotal ?? '0', '0')
    const entry = await vault()
    const yieldEarned = SETTLE - DRAW
    assert.equal(entry.AssetsAvailable, (DEPOSIT + yieldEarned).toString())
    assert.equal(entry.AssetsTotal, (DEPOSIT + yieldEarned).toString())
  })

  it('deletes the repaid Loan', async () => {
    await submit(
      client,
      { TransactionType: 'LoanDelete', Account: lender.classicAddress, LoanID: loanID },
      lender,
    )
  })
})
