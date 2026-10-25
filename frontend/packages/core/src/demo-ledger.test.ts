import assert from 'node:assert/strict'
import { before, it } from 'node:test'
import type { TestContext } from 'node:test'

import { decode, deriveConfidentialKeypair, hashes, loadMptCrypto, Wallet } from 'xrpl'
import type { Client, ConfidentialKeypair, MptCryptoModule } from 'xrpl'

import { confidentialKeypair, newSeed, walletFromSeed } from './accounts.ts'
import { ActionFailed, DEMO_TERMS, gate, openDemo } from './demo-ledger.ts'
import type { Demo, LoanTerms, Shown, Snapshot, Viewer } from './demo-ledger.ts'
import type { Kit } from './kit.ts'
import type { Ledger, LedgerClosedListener } from './network.ts'

const RIPPLE_EPOCH_MS = 946_684_800_000
const POLL_MS = 1000
const ISSUANCE = '0000046B4127945F4651C08EC3394795A3A78A67860AA34C'
const SHARES = '0000047A4127945F4651C08EC3394795A3A78A67860AA34C'
const VAULT = '5E1AF944C0BBAA2E1CF466AB6F0EF0226A3248ACCBBBB95B7D61CFDA3745B909'
const BROKER = 'D80405EF351D9F381E0436BFD8096B5FA002149FD549B5775F4CD2D2D3C16A1F'
const LOAN_A = '9D7FCAFBCB11321EAF4E1FC8D70F45551BE0260714C4AF1D985C20F17D9AA213'
const LOAN_B = '2ABC7593BF245CE518B2277834CAA31AC95E7DBB4217257438F76B0BD0F17C75'
/** Ledger close time when Subscription ends; Investment lasts 600 s. */
const SUBSCRIPTION = 846_219_727
const REDEMPTION = SUBSCRIPTION + 600
const LOAN_START = SUBSCRIPTION + 30

/** Small amounts keep each decrypt in the test under a few milliseconds. */
const TERMS: LoanTerms = {
  ...DEMO_TERMS,
  principal: 1000n,
  amountOwed: 1050n,
  periodicPayment: 1050n,
}

let crypto: MptCryptoModule
before(async () => {
  crypto = await loadMptCrypto()
})

async function encrypt(value: bigint, publicKey: string): Promise<string> {
  return crypto.encryptAmount(value, publicKey, await crypto.generateBlindingFactor())
}

function account(): { address: string; seed: string } {
  const seed = newSeed()
  return { address: walletFromSeed(seed).address, seed }
}

const kit: Kit = {
  mptIssuanceID: ISSUANCE,
  vaultID: VAULT,
  accounts: {
    brokerA: account(),
    depositorA: account(),
    depositorB: account(),
    borrowerA: account(),
    borrowerB: account(),
  },
  elgamal: {
    brokerA: newSeed(),
    borrowerA: newSeed(),
    borrowerB: newSeed(),
    mptAuditor: newSeed(),
    loanAuditor: newSeed(),
  },
}
const key = (holder: keyof Kit['elgamal']): ConfidentialKeypair =>
  confidentialKeypair(kit.elgamal[holder])
const issuerKey = deriveConfidentialKeypair()
const address = (role: keyof Kit['accounts']): string => kit.accounts[role].address
const brokerPseudo = Wallet.generate().address

function rippledError(code: string): Error {
  return Object.assign(new Error(code), { data: { error: code } })
}

type Entry = Record<string, unknown>
type Request = Record<string, unknown> & { command: string }
interface Logged {
  hash: string
  ledger_index: number
  tx_json: Entry
  meta: Entry
}

/**
 * A devnet that answers the demo's reads from entries a test sets, and validates every submitted
 * transaction with the result `onSubmit` returns, one ledger later.
 */
class FakeDevnet {
  ledgerIndex = 100
  closeTime = SUBSCRIPTION - 100
  readonly entries = new Map<string, Entry>()
  readonly owned = new Map<string, Entry[]>()
  readonly history = new Map<string, Logged[]>()
  readonly submitted: Entry[] = []
  readonly validated = new Map<string, Logged>()
  onSubmit: (tx: Entry) => string = () => 'tesSUCCESS'
  failReads: Error | undefined
  private readonly listeners = new Set<LedgerClosedListener>()

  readonly ledger: Ledger = {
    client: this as unknown as Client,
    onLedgerClosed: (listener) => {
      this.listeners.add(listener)
      return () => this.listeners.delete(listener)
    },
    close: async () => {},
  }

  set(key: string, entry: Entry): void {
    this.entries.set(key, entry)
  }

  /** Validates the next ledger at `closeTime` and tells the demo. */
  close(closeTime = this.closeTime): void {
    this.ledgerIndex += 1
    this.closeTime = closeTime
    for (const listener of this.listeners) listener(this.ledgerIndex, closeTime)
  }

  log(account: string, tx: Entry, result = 'tesSUCCESS', hash?: string): Logged {
    this.ledgerIndex += 1
    const logged: Logged = {
      hash: hash ?? `${String(this.ledgerIndex).padStart(4, '0')}${'0'.repeat(60)}`,
      ledger_index: this.ledgerIndex,
      tx_json: { Account: account, date: this.closeTime, ...tx },
      meta: { TransactionResult: result, TransactionIndex: 0, AffectedNodes: [] },
    }
    for (const who of [account, tx['Counterparty']]) {
      if (typeof who !== 'string') continue
      this.history.set(who, [...(this.history.get(who) ?? []), logged])
    }
    return logged
  }

  async autofill(tx: Entry): Promise<Entry> {
    return { Fee: '12', Sequence: 7, LastLedgerSequence: this.ledgerIndex + 20, ...tx }
  }

  async getLedgerIndex(): Promise<number> {
    return this.ledgerIndex
  }

  async request(request: Request): Promise<{ result: unknown }> {
    if (this.failReads !== undefined && request.command === 'ledger') throw this.failReads
    return { result: this.answer(request) }
  }

  private answer(request: Request): unknown {
    switch (request.command) {
      case 'ledger':
        return { ledger_index: this.ledgerIndex, ledger: { close_time: this.closeTime } }
      case 'ledger_entry':
        return { node: this.lookup(request) }
      case 'account_info':
        return { account_data: { Sequence: 7 } }
      case 'account_objects':
        return { account_objects: this.owned.get(`${request['account']}:${request['type']}`) ?? [] }
      case 'account_tx':
        return { transactions: this.accountTx(request) }
      case 'server_info':
        return { info: { validated_ledger: { seq: this.ledgerIndex }, complete_ledgers: '1-9999' } }
      case 'submit':
        return this.submit(String(request['tx_blob']))
      case 'tx':
        return this.validated.get(String(request['transaction']))
      default:
        throw new Error(`Unexpected request ${request.command}`)
    }
  }

  private lookup(request: Request): Entry {
    const token = request['mptoken'] as { mpt_issuance_id: string; account: string } | undefined
    const key =
      token !== undefined
        ? `token:${token.mpt_issuance_id}:${token.account}`
        : request['mpt_issuance'] !== undefined
          ? `issuance:${String(request['mpt_issuance'])}`
          : `index:${String(request['index'])}`
    const found = this.entries.get(key)
    if (found === undefined) throw rippledError('entryNotFound')
    return found
  }

  private accountTx(request: Request): Logged[] {
    const min = Number(request['ledger_index_min'])
    const max = Number(request['ledger_index_max'])
    return (this.history.get(String(request['account'])) ?? []).filter(
      (t) => (min < 0 || t.ledger_index >= min) && t.ledger_index <= max,
    )
  }

  private submit(blob: string): Entry {
    const tx = decode(blob)
    this.submitted.push(tx)
    const result = this.onSubmit(tx)
    const hash = hashes.hashSignedTx(blob)
    const logged = this.log(String(tx['Account']), tx, result, hash)
    this.validated.set(hash, { ...logged, validated: true } as Logged)
    return { engine_result: result.startsWith('tec') ? result : 'tesSUCCESS' }
  }
}

/** A devnet in Investment with the vault funded, the broker drawn and loan A open. */
async function investing(): Promise<FakeDevnet> {
  const devnet = new FakeDevnet()
  devnet.closeTime = SUBSCRIPTION + 40
  const broker = key('brokerA').publicKey
  devnet.set(`issuance:${ISSUANCE}`, {
    IssuerEncryptionKey: issuerKey.publicKey,
    AuditorEncryptionKey: key('mptAuditor').publicKey,
    ConfidentialOutstandingAmount: '4000',
  })
  devnet.set(`index:${VAULT}`, {
    index: VAULT,
    Asset: { mpt_issuance_id: ISSUANCE },
    AssetsTotal: '3000',
    AssetsAvailable: '1000',
    ShareMPTID: SHARES,
    VaultKind: 1,
    SubscriptionDate: SUBSCRIPTION,
    RedemptionDate: REDEMPTION,
  })
  devnet.set(`issuance:${SHARES}`, { OutstandingAmount: '3000' })
  const loanBroker = {
    index: BROKER,
    VaultID: VAULT,
    Account: brokerPseudo,
    Owner: address('brokerA'),
    Flags: 0x0002_0000,
    DebtMaximum: '2500',
    DebtTotal: '1000',
  }
  devnet.owned.set(`${address('brokerA')}:loan_broker`, [loanBroker])
  devnet.set(`index:${BROKER}`, loanBroker)
  devnet.set(`token:${ISSUANCE}:${brokerPseudo}`, {
    HolderEncryptionKey: broker,
    ConfidentialBalanceSpending: await encrypt(1000n, broker),
    ConfidentialBalanceInbox: await encrypt(0n, broker),
    ConfidentialBalanceVersion: 3,
  })
  for (const borrower of ['borrowerA', 'borrowerB'] as const) {
    const own = key(borrower).publicKey
    devnet.set(`token:${ISSUANCE}:${address(borrower)}`, {
      HolderEncryptionKey: own,
      ConfidentialBalanceSpending: await encrypt(borrower === 'borrowerA' ? 2000n : 1000n, own),
      ConfidentialBalanceInbox: await encrypt(0n, own),
      ConfidentialBalanceVersion: 1,
      IssuerEncryptedBalance: await encrypt(2000n, issuerKey.publicKey),
      AuditorEncryptedBalance: await encrypt(2000n, key('mptAuditor').publicKey),
    })
  }
  for (const depositor of ['depositorA', 'depositorB'] as const) {
    devnet.set(`token:${ISSUANCE}:${address(depositor)}`, { MPTAmount: '0' })
    devnet.set(`token:${SHARES}:${address(depositor)}`, { MPTAmount: '1500' })
  }
  await addLoan(devnet, 'A', LOAN_A)
  return devnet
}

async function addLoan(devnet: FakeDevnet, label: 'A' | 'B', index: string): Promise<Entry> {
  const borrower = label === 'A' ? 'borrowerA' : 'borrowerB'
  const holders = [key(borrower), key('brokerA'), key('loanAuditor')].map((k) => k.publicKey)
  const encryptAll = (value: bigint) => Promise.all(holders.map((k) => encrypt(value, k)))
  const [p, o, q] = await Promise.all([
    encryptAll(TERMS.principal),
    encryptAll(TERMS.amountOwed),
    encryptAll(TERMS.periodicPayment),
  ])
  const loan: Entry = {
    index,
    LoanBrokerID: BROKER,
    Borrower: address(borrower),
    Flags: 0x0008_0000,
    LoanSequence: label === 'A' ? 1 : 2,
    StartDate: LOAN_START,
    PaymentInterval: 60,
    GracePeriod: 60,
    NextPaymentDueDate: LOAN_START + 60,
    PaymentRemaining: 1,
    ConfidentialLoanVersion: 0,
    LoanAuditorEncryptionKey: holders[2],
    BorrowerEncryptedPrincipal: p[0],
    BrokerEncryptedPrincipal: p[1],
    LoanAuditorEncryptedPrincipal: p[2],
    BorrowerEncryptedAmountOwed: o[0],
    BrokerEncryptedAmountOwed: o[1],
    LoanAuditorEncryptedAmountOwed: o[2],
    BorrowerEncryptedPeriodicPayment: q[0],
    BrokerEncryptedPeriodicPayment: q[1],
    LoanAuditorEncryptedPeriodicPayment: q[2],
  }
  devnet.owned.set(`${address(borrower)}:loan`, [loan])
  devnet.set(`index:${index}`, loan)
  return loan
}

/** Waits until `pick` shows something other than a pending decrypt. */
async function settled(demo: Demo, viewer: Viewer, pick: (s: Snapshot) => Shown): Promise<Shown> {
  for (;;) {
    const shown = pick(demo.snapshot(viewer))
    if (shown.visibility !== 'pending') return shown
    await new Promise<void>((resolve) => {
      const off = demo.subscribe(() => {
        off()
        resolve()
      })
    })
  }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

/** Advances fake time one poll at a time until `work` settles. */
async function settle<T>(t: TestContext, work: Promise<T>): Promise<T> {
  let done = false
  work.then(
    () => (done = true),
    () => (done = true),
  )
  for (let turn = 0; turn < 10_000 && !done; turn += 1) {
    await flush()
    t.mock.timers.tick(POLL_MS)
  }
  return work
}

const toMs = (rippleSeconds: number): number => rippleSeconds * 1000 + RIPPLE_EPOCH_MS

it('reads the vault and the phase from the validated ledger', async () => {
  const devnet = await investing()
  devnet.closeTime = SUBSCRIPTION
  const demo = await openDemo(kit, devnet.ledger)
  const first = demo.snapshot('outsider')
  assert.equal(first.phase, 'subscription')
  assert.deepEqual(first.vault.assetsAvailable, { visibility: 'public', value: 1000n })
  assert.equal(first.vault.subscriptionDate, toMs(SUBSCRIPTION))
  assert.equal(first.vault.redemptionDate, toMs(REDEMPTION))
  assert.equal(first.depositors.depositorA.shares, 1500n)
  assert.equal(demo.snapshot('outsider'), first, 'same object until something changes')

  const changed = new Promise<void>((resolve) => demo.subscribe(resolve))
  devnet.close(SUBSCRIPTION + 1)
  await changed
  assert.equal(demo.snapshot('outsider').phase, 'investment')
  devnet.close(REDEMPTION)
  await new Promise<void>((resolve) => demo.subscribe(resolve))
  assert.equal(demo.snapshot('outsider').phase, 'redemption')
  demo.close()
})

it('decrypts the Lending Balance for the broker only', async () => {
  const devnet = await investing()
  const demo = await openDemo(kit, devnet.ledger)
  const spending = (s: Snapshot): Shown =>
    s.broker?.lendingBalance.spending ?? { visibility: 'redacted' }
  assert.deepEqual(await settled(demo, 'brokerA', spending), {
    visibility: 'decrypted',
    value: 1000n,
  })
  assert.deepEqual(await settled(demo, 'outsider', spending), { visibility: 'redacted' })
  assert.deepEqual(await settled(demo, 'borrowerA', spending), { visibility: 'redacted' })
  assert.deepEqual(demo.snapshot('brokerA').broker?.debtTotal, {
    visibility: 'public',
    value: 1000n,
  })
  demo.close()
})

it('shows loan terms to its borrower, the broker and the auditor, and no one else', async () => {
  const devnet = await investing()
  await addLoan(devnet, 'B', LOAN_B)
  const demo = await openDemo(kit, devnet.ledger)
  const owedA = (s: Snapshot): Shown => s.loans.A?.amountOwed ?? { visibility: 'redacted' }
  const decrypted = { visibility: 'decrypted', value: 1050n }
  for (const viewer of ['borrowerA', 'brokerA', 'auditor'] as const) {
    assert.deepEqual(await settled(demo, viewer, owedA), decrypted, viewer)
  }
  for (const viewer of ['borrowerB', 'outsider', 'depositorA'] as const) {
    assert.deepEqual(await settled(demo, viewer, owedA), { visibility: 'redacted' }, viewer)
  }
  const loan = demo.snapshot('outsider').loans.A
  assert.equal(loan?.status, 'active')
  assert.equal(loan?.borrower, 'borrowerA')
  assert.equal(loan?.nextPaymentDueDate, toMs(LOAN_START + 60))
  demo.close()
})

it('reads a loan with no PaymentRemaining as repaid', async () => {
  const devnet = await investing()
  const loan = await addLoan(devnet, 'A', LOAN_A)
  delete loan['PaymentRemaining']
  loan['NextPaymentDueDate'] = 0
  const demo = await openDemo(kit, devnet.ledger)
  assert.equal(demo.snapshot('outsider').loans.A?.status, 'repaid')
  assert.equal(demo.snapshot('outsider').loans.A?.paymentRemaining, 0)
  assert.equal(demo.snapshot('outsider').loans.A?.nextPaymentDueDate, undefined)
  demo.close()
})

it('logs the run in ledger order, with each amount public or encrypted', async () => {
  const devnet = await investing()
  const broker = address('brokerA')
  devnet.log(address('borrowerA'), {
    TransactionType: 'ConfidentialMPTMergeInbox',
    MPTokenIssuanceID: ISSUANCE,
  })
  devnet.log(broker, { TransactionType: 'LoanBrokerSet', VaultID: VAULT })
  const amount = (value: string) => ({ mpt_issuance_id: ISSUANCE, value })
  devnet.log(address('depositorA'), {
    TransactionType: 'VaultDeposit',
    VaultID: VAULT,
    Amount: amount('1500'),
  })
  devnet.log(address('depositorA'), { TransactionType: 'Payment', Destination: broker })
  devnet.log(broker, {
    TransactionType: 'LoanBrokerDraw',
    LoanBrokerID: BROKER,
    Amount: amount('2000'),
  })
  devnet.log(broker, { TransactionType: 'LoanBrokerMergeInbox', LoanBrokerID: BROKER })
  devnet.log(broker, {
    TransactionType: 'LoanSet',
    LoanBrokerID: BROKER,
    Counterparty: address('borrowerA'),
    SenderEncryptedAmount: await encrypt(1000n, key('brokerA').publicKey),
    AuditorEncryptedAmount: await encrypt(1000n, key('mptAuditor').publicKey),
  })
  devnet.log(address('borrowerA'), {
    TransactionType: 'ConfidentialMPTMergeInbox',
    MPTokenIssuanceID: ISSUANCE,
  })
  devnet.log(address('borrowerA'), {
    TransactionType: 'ConfidentialLoanPay',
    LoanID: LOAN_A,
    LoanAuditorEncryptedAmount: await encrypt(1050n, key('loanAuditor').publicKey),
  })
  devnet.log(broker, { TransactionType: 'LoanBrokerMergeInbox', LoanBrokerID: BROKER })
  devnet.log(broker, { TransactionType: 'LoanManage', LoanID: LOAN_A, Flags: 0x0002_0000 })
  devnet.log(
    address('depositorB'),
    { TransactionType: 'VaultWithdraw', VaultID: VAULT, Amount: amount('1500') },
    'tecINSUFFICIENT_FUNDS',
  )
  const demo = await openDemo(kit, devnet.ledger)
  const { log } = demo.snapshot('outsider')
  assert.deepEqual(
    log.map((r) => `${r.step} ${r.type} ${r.signers.join('+')} ${r.loan ?? '-'} ${r.result}`),
    [
      '1 LoanBrokerSet brokerA - tesSUCCESS',
      '2 VaultDeposit depositorA - tesSUCCESS',
      '3 LoanBrokerDraw brokerA - tesSUCCESS',
      '3 LoanBrokerMergeInbox brokerA - tesSUCCESS',
      '4 LoanSet brokerA+borrowerA A tesSUCCESS',
      '6 ConfidentialMPTMergeInbox borrowerA A tesSUCCESS',
      '6 ConfidentialLoanPay borrowerA A tesSUCCESS',
      '7 LoanBrokerMergeInbox brokerA - tesSUCCESS',
      '8 LoanManage brokerA A tesSUCCESS',
      '10 VaultWithdraw depositorB - tecINSUFFICIENT_FUNDS',
    ],
  )
  assert.deepEqual(log[1]?.amount, { visibility: 'public', value: 1500n })
  assert.deepEqual(log[4]?.amount, { visibility: 'redacted' })
  assert.equal(log[8]?.flag, 'Impaired')
  assert.match(log[0]?.explorerUrl ?? '', /\/transactions\/[0-9A-F]{64}$/)
  const auditorSees = async (i: number) =>
    settled(demo, 'auditor', (s) => s.log[i]?.amount ?? { visibility: 'redacted' })
  assert.deepEqual(await auditorSees(4), { visibility: 'decrypted', value: 1000n })
  assert.deepEqual(await auditorSees(6), { visibility: 'decrypted', value: 1050n })
  const b = demo.snapshot('depositorB').depositors.depositorB
  assert.equal(b.redeemFailure, 'tecINSUFFICIENT_FUNDS')
  assert.equal(b.redeemed, undefined)
  assert.deepEqual(demo.snapshot('outsider').depositors.depositorA.deposited, {
    visibility: 'public',
    value: 1500n,
  })
  demo.close()
})

it('reads a redemption payout into a wallet the deposit had emptied', async () => {
  const devnet = await investing()
  const depositor = address('depositorA')
  const withdrawal = devnet.log(depositor, {
    TransactionType: 'VaultWithdraw',
    VaultID: VAULT,
    Amount: { mpt_issuance_id: SHARES, value: '1500' },
  })
  // As the devnet records it: MPTAmount was absent at 0, so PreviousFields does not name it.
  withdrawal.meta['AffectedNodes'] = [
    {
      ModifiedNode: {
        LedgerEntryType: 'MPToken',
        FinalFields: { Account: depositor, MPTokenIssuanceID: ISSUANCE, MPTAmount: '1500' },
        PreviousFields: {},
      },
    },
    {
      ModifiedNode: {
        LedgerEntryType: 'Vault',
        LedgerIndex: VAULT,
        FinalFields: { AssetsTotal: '1500', AssetsAvailable: '550' },
        PreviousFields: { AssetsTotal: '3000', AssetsAvailable: '2050' },
      },
    },
  ]
  const demo = await openDemo(kit, devnet.ledger)
  const snapshot = demo.snapshot('outsider')
  const payout = { visibility: 'public', value: 1500n }
  assert.deepEqual(snapshot.log.at(-1)?.amount, payout)
  assert.deepEqual(snapshot.depositors.depositorA.redeemed, payout)
  demo.close()
})

it('reports a failed read and recovers on the next ledger', async () => {
  const devnet = await investing()
  const demo = await openDemo(kit, devnet.ledger)
  devnet.failReads = new Error('Timeout for request')
  devnet.close()
  await new Promise<void>((resolve) => demo.subscribe(resolve))
  assert.deepEqual(demo.snapshot('outsider').errors, [
    'Could not read the ledger: Timeout for request',
  ])
  devnet.failReads = undefined
  devnet.close()
  await new Promise<void>((resolve) => demo.subscribe(resolve))
  assert.deepEqual(demo.snapshot('outsider').errors, [])
  demo.close()
})

it('act creates a confidential LoanBroker under the Broker Key', async (t) => {
  const devnet = await investing()
  devnet.owned.delete(`${address('brokerA')}:loan_broker`)
  const demo = await openDemo(kit, devnet.ledger)
  assert.equal(demo.snapshot('brokerA').broker, undefined)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const acting = demo.act({ type: 'LoanBrokerSet', debtMaximum: 2500n })
  assert.equal(demo.snapshot('brokerA').submitting?.type, 'LoanBrokerSet')
  await settle(t, acting)
  const [tx] = devnet.submitted
  assert.equal(tx?.['TransactionType'], 'LoanBrokerSet')
  assert.equal(tx?.['Account'], address('brokerA'))
  assert.equal(tx?.['VaultID'], VAULT)
  assert.equal(tx?.['DebtMaximum'], '2500')
  assert.equal(tx?.['Flags'], 0x0002_0000)
  assert.equal(tx?.['HolderEncryptionKey'], key('brokerA').publicKey)
  assert.equal(demo.snapshot('brokerA').submitting, undefined)
  assert.equal(demo.snapshot('brokerA').log.at(-1)?.type, 'LoanBrokerSet')
  demo.close()
})

it('has the broker sign a LoanSet and the borrower co-sign that blob', async (t) => {
  const devnet = await investing()
  devnet.owned.delete(`${address('borrowerA')}:loan`)
  const demo = await openDemo(kit, devnet.ledger)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  await settle(t, demo.act({ type: 'LoanSetSign', loan: 'A', terms: TERMS }))
  assert.equal(devnet.submitted.length, 0, 'signing submits nothing')
  assert.deepEqual(demo.snapshot('brokerA').offers.A?.terms, TERMS)

  await settle(t, demo.act({ type: 'LoanSetCosign', loan: 'A' }))
  const [tx] = devnet.submitted
  assert.equal(tx?.['TransactionType'], 'LoanSet')
  assert.equal(tx?.['Account'], address('brokerA'))
  assert.equal(tx?.['Counterparty'], address('borrowerA'))
  assert.equal(tx?.['SigningPubKey'], walletFromSeed(kit.accounts.brokerA.seed).publicKey)
  const counterparty = tx?.['CounterpartySignature'] as { SigningPubKey?: string } | undefined
  assert.equal(counterparty?.SigningPubKey, walletFromSeed(kit.accounts.borrowerA.seed).publicKey)
  assert.equal(tx?.['LoanAuditorEncryptionKey'], key('loanAuditor').publicKey)
  const owed = String(tx?.['BorrowerEncryptedAmountOwed'])
  assert.equal(await crypto.decryptAmount(owed, key('borrowerA').privateKey, 4000n), 1050n)
  assert.equal(demo.snapshot('brokerA').offers.A, undefined)
  demo.close()
})

it('pays a loan in full with exactly the amount owed', async (t) => {
  const devnet = await investing()
  const demo = await openDemo(kit, devnet.ledger)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  await settle(t, demo.act({ type: 'ConfidentialLoanPay', loan: 'A' }))
  const [tx] = devnet.submitted
  assert.equal(tx?.['TransactionType'], 'ConfidentialLoanPay')
  assert.equal(tx?.['Account'], address('borrowerA'))
  assert.equal(tx?.['LoanID'], LOAN_A)
  assert.equal(tx?.['Flags'], 0x0002_0000)
  const paid = String(tx?.['DestinationEncryptedAmount'])
  assert.equal(await crypto.decryptAmount(paid, key('brokerA').privateKey, 4000n), 1050n)
  demo.close()
})

it('settles the whole Lending Balance spending', async (t) => {
  const devnet = await investing()
  const demo = await openDemo(kit, devnet.ledger)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  await settle(t, demo.act({ type: 'LoanBrokerSettle' }))
  const [tx] = devnet.submitted
  assert.equal(tx?.['TransactionType'], 'LoanBrokerSettle')
  assert.deepEqual(tx?.['Amount'], { mpt_issuance_id: ISSUANCE, value: '1000' })
  demo.close()
})

it('impairs and defaults with LoanManage, and redeems every share', async (t) => {
  const devnet = await investing()
  const demo = await openDemo(kit, devnet.ledger)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  await settle(t, demo.act({ type: 'LoanManage', loan: 'A', flag: 'impair' }))
  await settle(t, demo.act({ type: 'LoanManage', loan: 'A', flag: 'default' }))
  await settle(t, demo.act({ type: 'VaultWithdraw', depositor: 'depositorB' }))
  const [impair, defaulted, withdraw] = devnet.submitted
  assert.equal(impair?.['Flags'], 0x0002_0000)
  assert.equal(defaulted?.['Flags'], 0x0001_0000)
  assert.equal(defaulted?.['LoanID'], LOAN_A)
  assert.equal(withdraw?.['Account'], address('depositorB'))
  assert.deepEqual(withdraw?.['Amount'], { mpt_issuance_id: SHARES, value: '1500' })
  demo.close()
})

it('act rejects with the engine code and keeps the failed transaction in the log', async (t) => {
  const devnet = await investing()
  devnet.onSubmit = () => 'tecINSUFFICIENT_FUNDS'
  const demo = await openDemo(kit, devnet.ledger)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  await assert.rejects(
    settle(t, demo.act({ type: 'VaultWithdraw', depositor: 'depositorB' })),
    (error) => {
      assert.ok(error instanceof ActionFailed)
      assert.equal(error.code, 'tecINSUFFICIENT_FUNDS')
      assert.match(error.hash ?? '', /^[0-9A-F]{64}$/)
      return true
    },
  )
  const s = demo.snapshot('depositorB')
  assert.equal(s.submitting, undefined)
  assert.equal(s.depositors.depositorB.redeemFailure, 'tecINSUFFICIENT_FUNDS')
  demo.close()
})

it('act rejects a second action while one runs', async (t) => {
  const devnet = await investing()
  const demo = await openDemo(kit, devnet.ledger)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const first = demo.act({ type: 'LoanBrokerMergeInbox' })
  await assert.rejects(demo.act({ type: 'LoanBrokerMergeInbox' }), { code: 'busy' })
  await settle(t, first)
  assert.equal(devnet.submitted.length, 1)
  demo.close()
})

it('submits nothing when the proof cannot be built', async () => {
  const devnet = await investing()
  const token = devnet.entries.get(`token:${ISSUANCE}:${address('borrowerA')}`) ?? {}
  token['ConfidentialBalanceSpending'] = await encrypt(10n, key('borrowerA').publicKey)
  const demo = await openDemo(kit, devnet.ledger)
  await assert.rejects(demo.act({ type: 'ConfidentialLoanPay', loan: 'A' }), (error) => {
    assert.ok(error instanceof ActionFailed)
    assert.equal(error.code, 'buildFailed')
    assert.match(error.message, /exceeds the confidential spending balance 10/)
    return true
  })
  assert.equal(devnet.submitted.length, 0)
  demo.close()
})

it('act rejects co-signing a loan the broker has not signed', async () => {
  const devnet = await investing()
  const demo = await openDemo(kit, devnet.ledger)
  await assert.rejects(demo.act({ type: 'LoanSetCosign', loan: 'B' }), { code: 'unavailable' })
  demo.close()
})

async function snapshotAt(
  closeTime: number,
  change?: (devnet: FakeDevnet) => void,
): Promise<Snapshot> {
  const devnet = await investing()
  devnet.closeTime = closeTime
  change?.(devnet)
  const demo = await openDemo(kit, devnet.ledger)
  demo.close()
  return demo.snapshot('outsider')
}

function undeposited(devnet: FakeDevnet): void {
  devnet.set(`token:${ISSUANCE}:${address('depositorA')}`, { MPTAmount: '1500' })
  devnet.set(`token:${SHARES}:${address('depositorA')}`, { MPTAmount: '0' })
}

it('gate marks a deposit done once the wallet is in the vault, in any phase', async () => {
  const deposit = { type: 'VaultDeposit', depositor: 'depositorA', amount: 1500n } as const
  assert.deepEqual(gate(await snapshotAt(SUBSCRIPTION), deposit), { open: false, reason: 'done' })
  assert.deepEqual(gate(await snapshotAt(SUBSCRIPTION + 1), deposit), {
    open: false,
    reason: 'done',
  })
  const empty = await snapshotAt(SUBSCRIPTION, (devnet) => {
    devnet.set(`token:${SHARES}:${address('depositorA')}`, { MPTAmount: '0' })
  })
  assert.deepEqual(gate(empty, deposit), {
    open: false,
    reason: 'closed',
    code: 'tecINSUFFICIENT_FUNDS',
  })
})

it('gate closes deposits after Subscription and opens draws one second later', async () => {
  const during = await snapshotAt(SUBSCRIPTION, undeposited)
  assert.deepEqual(gate(during, { type: 'VaultDeposit', depositor: 'depositorA', amount: 0n }), {
    open: false,
    reason: 'closed',
    code: 'temBAD_AMOUNT',
  })
  assert.deepEqual(gate(during, { type: 'LoanBrokerDraw', amount: 1000n }), {
    open: false,
    reason: 'opens',
    at: toMs(SUBSCRIPTION + 1),
  })
  const after = await snapshotAt(SUBSCRIPTION + 1, undeposited)
  assert.deepEqual(gate(after, { type: 'VaultDeposit', depositor: 'depositorA', amount: 1n }), {
    open: false,
    reason: 'closed',
    code: 'tecEXPIRED',
  })
  assert.deepEqual(gate(after, { type: 'LoanBrokerDraw', amount: 1000n }), { open: true })
  assert.deepEqual(gate(after, { type: 'LoanBrokerDraw', amount: 1001n }), {
    open: false,
    reason: 'closed',
    code: 'tecINSUFFICIENT_FUNDS',
  })
})

it('gate opens loan B only after loan A, and only while its payment fits before redemption', async () => {
  const s = await snapshotAt(SUBSCRIPTION + 40, (devnet) => {
    devnet.owned.delete(`${address('borrowerA')}:loan`)
    devnet.log(address('brokerA'), {
      TransactionType: 'LoanBrokerMergeInbox',
      LoanBrokerID: BROKER,
    })
  })
  assert.deepEqual(gate(s, { type: 'LoanSetSign', loan: 'B', terms: TERMS }), {
    open: false,
    reason: 'prerequisite',
    step: 4,
    loan: 'A',
  })
  assert.deepEqual(gate(s, { type: 'LoanSetSign', loan: 'A', terms: TERMS }), { open: true })
  const late = await snapshotAt(REDEMPTION - 119, (devnet) => {
    devnet.owned.delete(`${address('borrowerA')}:loan`)
    devnet.log(address('brokerA'), {
      TransactionType: 'LoanBrokerMergeInbox',
      LoanBrokerID: BROKER,
    })
  })
  assert.deepEqual(gate(late, { type: 'LoanSetSign', loan: 'A', terms: TERMS }), {
    open: false,
    reason: 'closed',
    code: 'tecNO_PERMISSION',
  })
})

it('gate opens impairment after the due date and default after the grace period', async () => {
  const due = LOAN_START + 60
  const early = await snapshotAt(due)
  assert.deepEqual(gate(early, { type: 'LoanManage', loan: 'A', flag: 'impair' }), {
    open: false,
    reason: 'opens',
    at: toMs(due + 1),
  })
  assert.deepEqual(gate(early, { type: 'LoanManage', loan: 'A', flag: 'default' }), {
    open: false,
    reason: 'opens',
    at: toMs(due + 61),
  })
  const late = await snapshotAt(due + 61)
  assert.deepEqual(gate(late, { type: 'LoanManage', loan: 'A', flag: 'default' }), { open: true })
  assert.deepEqual(gate(late, { type: 'LoanManage', loan: 'B', flag: 'impair' }), {
    open: false,
    reason: 'prerequisite',
    step: 4,
  })
})

it('gate opens redemption at the RedemptionDate', async () => {
  const investing = await snapshotAt(REDEMPTION - 1)
  assert.deepEqual(gate(investing, { type: 'VaultWithdraw', depositor: 'depositorA' }), {
    open: false,
    reason: 'opens',
    at: toMs(REDEMPTION),
  })
  const redeeming = await snapshotAt(REDEMPTION)
  assert.deepEqual(gate(redeeming, { type: 'VaultWithdraw', depositor: 'depositorA' }), {
    open: true,
  })
})
