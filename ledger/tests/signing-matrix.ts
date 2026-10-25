// Hardware-in-the-loop test: asks a connected Ledger to sign every transaction type the confidential
// lending flow uses and compares each answer with the prediction from the XRP app's parser. Nothing
// is submitted. Each transaction is built offline with correctly typed placeholder values, because
// the device decides from field types alone; ledger state, fees and proofs do not matter to it.
//
// Run with the XRP app open and approve every review that appears. Pass --blind-signing-off when the
// app's "Blind signing" setting is off: blind-sign cases are then expected to be rejected instantly.
// --encode-only checks, without a device, that every case encodes and fits the app's size limit.

import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { LoanManageFlags, encode, xrpToDrops } from 'xrpl'
import type { SubmittableTransaction } from 'xrpl'

import { ledgerError, ledgerSign, openLedger, runningApp } from '#lib/ledger'

type Prediction = 'clear' | 'blind' | 'refused'
type Answer = 'signed' | 'refused' | 'rejected'
type Source = 'published' | 'confidential lending'

interface Case {
  role: string
  name: string
  source: Source
  predict: Prediction
  why: string
  fields: Record<string, unknown>
}

const BLIND_ON = !process.argv.includes('--blind-signing-off')
// The XRP app's MAX_RAW_TX (LedgerHQ/app-xrp src/limitations.h).
const MAX_TX_BYTES = 10_000
const RESULTS = fileURLToPath(new URL('../results/signing-matrix.md', import.meta.url))
// Placeholders of the right type and size: a Hash256 ID, a 48-hex MPT issuance ID, an XRPL account.
const ID = 'AB'.repeat(32)
const MPT_ID = '00000001'.padEnd(48, 'C')
// ACCOUNT_ONE, a well-known placeholder address that no key controls.
const OTHER_ACCOUNT = 'rrrrrrrrrrrrrrrrrrrrBZbvji'
const MPT_AMOUNT = { mpt_issuance_id: MPT_ID, value: '1000' }
// XLS-96 sizes: an ElGamal ciphertext is 66 bytes, a key or commitment 33, a blinding factor 32.
const blob = (bytes: number): string => 'AB'.repeat(bytes)
const CIPHERTEXT = blob(66)
const POINT = '02'.concat(blob(32))

const CASES: Case[] = [
  {
    role: 'any',
    name: 'Payment (XRP)',
    source: 'published',
    predict: 'clear',
    why: 'Known type and fields',
    fields: { TransactionType: 'Payment', Destination: OTHER_ACCOUNT, Amount: xrpToDrops(1) },
  },
  {
    role: 'broker',
    name: 'SetRegularKey',
    source: 'published',
    predict: 'clear',
    why: 'Known type and fields',
    fields: { TransactionType: 'SetRegularKey', RegularKey: OTHER_ACCOUNT },
  },
  {
    role: 'any holder',
    name: 'MPTokenAuthorize',
    source: 'published',
    predict: 'refused',
    why: '`MPTokenIssuanceID` is `UInt192`',
    fields: { TransactionType: 'MPTokenAuthorize', MPTokenIssuanceID: MPT_ID },
  },
  {
    role: 'depositor',
    name: 'VaultDeposit (MPT amount)',
    source: 'published',
    predict: 'refused',
    why: 'MPT `Amount` encoding',
    fields: { TransactionType: 'VaultDeposit', VaultID: ID, Amount: MPT_AMOUNT },
  },
  {
    role: 'broker',
    name: 'VaultCreate (MPT asset)',
    source: 'published',
    predict: 'refused',
    why: 'MPT `Asset` encoding',
    fields: {
      TransactionType: 'VaultCreate',
      Asset: { mpt_issuance_id: MPT_ID },
      VaultKind: 1,
      SubscriptionDate: 900_000_000,
      RedemptionDate: 900_086_400,
    },
  },
  {
    role: 'broker',
    name: 'LoanBrokerSet (public)',
    source: 'published',
    predict: 'blind',
    why: 'Type unknown to the app; readable fields',
    fields: { TransactionType: 'LoanBrokerSet', VaultID: ID },
  },
  {
    role: 'broker',
    name: 'LoanSet (public, first signer)',
    source: 'published',
    predict: 'refused',
    why: '`PrincipalRequested` is `Number`',
    fields: {
      TransactionType: 'LoanSet',
      Counterparty: OTHER_ACCOUNT,
      LoanBrokerID: ID,
      PrincipalRequested: '1000',
    },
  },
  {
    role: 'broker',
    name: 'LoanManage (impair)',
    source: 'published',
    predict: 'blind',
    why: 'Type unknown to the app; readable fields',
    fields: { TransactionType: 'LoanManage', LoanID: ID, Flags: LoanManageFlags.tfLoanImpair },
  },
  {
    role: 'broker',
    name: 'LoanManage (default)',
    source: 'published',
    predict: 'blind',
    why: 'Type unknown to the app; readable fields',
    fields: { TransactionType: 'LoanManage', LoanID: ID, Flags: LoanManageFlags.tfLoanDefault },
  },
  {
    role: 'broker',
    name: 'LoanDelete',
    source: 'published',
    predict: 'blind',
    why: 'Type unknown to the app; readable fields',
    fields: { TransactionType: 'LoanDelete', LoanID: ID },
  },
  {
    role: 'borrower',
    name: 'LoanPay (MPT amount)',
    source: 'published',
    predict: 'refused',
    why: 'MPT `Amount` encoding',
    fields: { TransactionType: 'LoanPay', LoanID: ID, Amount: MPT_AMOUNT },
  },
  {
    role: 'any holder',
    name: 'ConfidentialMPTMergeInbox',
    source: 'published',
    predict: 'refused',
    why: '`MPTokenIssuanceID` is `UInt192`',
    fields: { TransactionType: 'ConfidentialMPTMergeInbox', MPTokenIssuanceID: MPT_ID },
  },
  {
    role: 'broker',
    name: 'LoanBrokerSet (confidential)',
    source: 'confidential lending',
    predict: 'blind',
    why: 'Unknown type and flag; Blob fields',
    fields: {
      TransactionType: 'LoanBrokerSet',
      VaultID: ID,
      Flags: 0x00020000,
      HolderEncryptionKey: POINT,
      ZKProof: blob(64),
    },
  },
  {
    role: 'broker',
    name: 'LoanBrokerDraw',
    source: 'confidential lending',
    predict: 'refused',
    why: 'MPT `Amount` encoding',
    fields: {
      TransactionType: 'LoanBrokerDraw',
      LoanBrokerID: ID,
      Amount: MPT_AMOUNT,
      HolderEncryptedAmount: CIPHERTEXT,
      IssuerEncryptedAmount: CIPHERTEXT,
      AuditorEncryptedAmount: CIPHERTEXT,
      BlindingFactor: ID,
    },
  },
  {
    role: 'broker',
    name: 'LoanBrokerMergeInbox',
    source: 'confidential lending',
    predict: 'blind',
    why: 'Unknown type; readable fields',
    fields: { TransactionType: 'LoanBrokerMergeInbox', LoanBrokerID: ID },
  },
  {
    role: 'broker',
    name: 'LoanBrokerSettle',
    source: 'confidential lending',
    predict: 'refused',
    why: 'MPT `Amount` encoding',
    fields: {
      TransactionType: 'LoanBrokerSettle',
      LoanBrokerID: ID,
      Amount: MPT_AMOUNT,
      HolderEncryptedAmount: CIPHERTEXT,
      IssuerEncryptedAmount: CIPHERTEXT,
      AuditorEncryptedAmount: CIPHERTEXT,
      BlindingFactor: ID,
      BalanceCommitment: POINT,
      ZKProof: blob(816),
    },
  },
  {
    role: 'broker',
    name: 'LoanSet (confidential, first signer)',
    source: 'confidential lending',
    predict: 'blind',
    why: 'No `Number` fields; amounts are Blobs; 3030-byte proof fits the 10,000-byte limit',
    fields: {
      TransactionType: 'LoanSet',
      Counterparty: OTHER_ACCOUNT,
      LoanBrokerID: ID,
      PaymentTotal: 2,
      PaymentInterval: 60,
      GracePeriod: 60,
      SenderEncryptedAmount: CIPHERTEXT,
      DestinationEncryptedAmount: CIPHERTEXT,
      IssuerEncryptedAmount: CIPHERTEXT,
      AuditorEncryptedAmount: CIPHERTEXT,
      BalanceCommitment: POINT,
      AmountCommitment: POINT,
      ZKProof: blob(3030),
      LoanAuditorEncryptionKey: POINT,
      LoanAuditorEncryptedPrincipal: CIPHERTEXT,
      BorrowerEncryptedAmountOwed: CIPHERTEXT,
      BrokerEncryptedAmountOwed: CIPHERTEXT,
      LoanAuditorEncryptedAmountOwed: CIPHERTEXT,
      BorrowerEncryptedPeriodicPayment: CIPHERTEXT,
      BrokerEncryptedPeriodicPayment: CIPHERTEXT,
      LoanAuditorEncryptedPeriodicPayment: CIPHERTEXT,
      AmountOwedCommitment: POINT,
      PeriodicPaymentCommitment: POINT,
    },
  },
  {
    role: 'borrower',
    name: 'ConfidentialLoanPay',
    source: 'confidential lending',
    predict: 'blind',
    why: 'Unknown type; Blob fields; 2148-byte proof fits',
    fields: {
      TransactionType: 'ConfidentialLoanPay',
      LoanID: ID,
      SenderEncryptedAmount: CIPHERTEXT,
      DestinationEncryptedAmount: CIPHERTEXT,
      IssuerEncryptedAmount: CIPHERTEXT,
      AuditorEncryptedAmount: CIPHERTEXT,
      LoanAuditorEncryptedAmount: CIPHERTEXT,
      BalanceCommitment: POINT,
      AmountCommitment: POINT,
      AmountOwedCommitment: POINT,
      PeriodicPaymentCommitment: POINT,
      ZKProof: blob(2148),
    },
  },
]

/** What the device should answer for a prediction, given the blind signing setting. */
function expected(predict: Prediction): Answer {
  if (predict === 'refused') return 'refused'
  if (predict === 'blind' && !BLIND_ON) return 'rejected'
  return 'signed'
}

function answerOf(error: unknown): Answer | string {
  const status = (error as { statusCode?: number }).statusCode
  if (status === 0x680b) return 'refused'
  if (status === 0x6985) return 'rejected'
  return `error: ${ledgerError(error)}`
}

function txFor(testCase: Case, account: string): SubmittableTransaction {
  const tx = { ...testCase.fields, Account: account, Fee: '12', Sequence: 1, LastLedgerSequence: 1 }
  return tx as unknown as SubmittableTransaction
}

/** Encodes every case with the vendored codec and checks it fits the app's buffer. */
function encodeCases(): number {
  let failures = 0
  for (const testCase of CASES) {
    const bytes = encode(txFor(testCase, OTHER_ACCOUNT)).length / 2
    const fits = bytes <= MAX_TX_BYTES
    if (!fits) failures++
    console.log(`${fits ? 'ok  ' : 'FAIL'} ${testCase.name}: ${bytes} bytes`)
  }
  return failures
}

async function runOnDevice(): Promise<number> {
  const session = await openLedger()
  const rows: string[] = []
  let failures = 0
  try {
    const app = await runningApp(session.transport)
    console.log(`device app ${app}, blind signing ${BLIND_ON ? 'on' : 'off'}; nothing is submitted`)
    console.log('Approve every review that appears on the device.\n')
    for (const testCase of CASES) {
      const tx = txFor(testCase, session.address)
      console.log(`>> ${testCase.name}: watch the device`)
      const started = Date.now()
      let answer: Answer | string = 'signed'
      try {
        await ledgerSign(session, tx)
      } catch (error) {
        answer = answerOf(error)
      }
      const seconds = ((Date.now() - started) / 1000).toFixed(1)
      const pass = answer === expected(testCase.predict)
      if (!pass) failures++
      console.log(
        `   ${pass ? 'PASS' : 'FAIL'} ${answer} in ${seconds}s (expected ${expected(testCase.predict)})`,
      )
      rows.push(
        `| ${testCase.role} | ${testCase.name} | ${testCase.source} | ${testCase.predict} | ${testCase.why} | ${answer} | ${pass ? 'pass' : '**FAIL**'} |`,
      )
    }
    const header = [
      '# Ledger signing matrix',
      '',
      `Generated by \`pnpm signing-test\` on ${new Date().toISOString()}. Device app: ${app}.`,
      `Blind signing setting: ${BLIND_ON ? 'on' : 'off'}. Nothing was submitted.`,
      '',
      '`signed`: the device returned a signature after review. `refused`: status `0x680b`, the',
      "app's parser cannot read the transaction; blind signing does not change this. `rejected`:",
      'status `0x6985`, blind signing is required and the setting is off.',
      '',
      '| Role | Transaction | Source | Prediction | Why | Device | Result |',
      '|---|---|---|---|---|---|---|',
    ]
    mkdirSync(fileURLToPath(new URL('../results/', import.meta.url)), { recursive: true })
    writeFileSync(RESULTS, `${[...header, ...rows].join('\n')}\n`)
    console.log(
      `\n${CASES.length - failures}/${CASES.length} match the prediction; wrote results/signing-matrix.md`,
    )
  } finally {
    await session.transport.close()
  }
  return failures
}

const failures = process.argv.includes('--encode-only') ? encodeCases() : await runOnDevice()
if (failures > 0) process.exitCode = 1
