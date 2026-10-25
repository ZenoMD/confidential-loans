import assert from 'node:assert/strict'
import { before, it } from 'node:test'
import type { TestContext } from 'node:test'

import { decode, deriveConfidentialKeypair, hashes, loadMptCrypto, Wallet } from 'xrpl'
import type { Client, ConfidentialKeypair, MptCryptoModule } from 'xrpl'

import { confidentialKeypair, newSeed, walletFromSeed } from './accounts.ts'
import { ActionFailed, gate, openDemo } from './demo-ledger.ts'
import type { Demo, LoanTerms, Shown, Snapshot, Viewer } from './demo-ledger.ts'
import type { Kit } from './kit.ts'
import type { Ledger, LedgerClosedListener } from './network.ts'

const RIPPLE_EPOCH_MS = 946_684_800_000
const POLL_MS = 1000
const ISSUANCE = '0000046B4127945F4651C08EC3394795A3A78A67860AA34C'
const SHARES = '0000047A4127945F4651C08EC3394795A3A78A67860AA34C'
const VAULT = '5E1AF944C0BBAA2E1CF466AB6F0EF0226A3248ACCBBBB95B7D61CFDA3745B909'
const BROKER = 'D80405EF351D9F381E0436BFD8096B5FA002149FD549B5775F4CD2D2D3C16A1F'
const LOAN_1 = '9D7FCAFBCB11321EAF4E1FC8D70F45551BE0260714C4AF1D985C20F17D9AA213'
const LOAN_2 = '2ABC7593BF245CE518B2277834CAA31AC95E7DBB4217257438F76B0BD0F17C75'
const LOAN_3 = '6F3B0C1D2E4A5B6C7D8E9F00112233445566778899AABBCCDDEEFF0011223344'
/** Ledger close time when Subscription ends; Investment lasts 600 s. */
const SUBSCRIPTION = 846_219_727
const REDEMPTION = SUBSCRIPTION + 600
const LOAN_START = SUBSCRIPTION + 30

/** One payment a minute after the start. Small amounts keep each decrypt fast. */
const TERMS: LoanTerms = {
  principal: 1000n,
  amountOwed: 1050n,
  periodicPayment: 1050n,
  paymentTotal: 1,
  paymentInterval: 60,
  gracePeriod: 60,
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
  /** brokerA's next Sequence, for autofill and account_info. */
  sequence = 7
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
    return logged
  }

  async autofill(tx: Entry): Promise<Entry> {
    return { Fee: '12', Sequence: this.sequence, LastLedgerSequence: this.ledgerIndex + 20, ...tx }
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
        return { account_data: { Sequence: this.sequence } }
      case 'account_objects':
        return { account_objects: this.owned.get(`${request['account']}:${request['type']}`) ?? [] }
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

/** A devnet in Investment with the vault funded, the broker drawn and borrowerA's loan 1 open. */
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
  await addLoan(devnet, 'borrowerA', LOAN_1, 1)
  return devnet
}

async function addLoan(
  devnet: FakeDevnet,
  borrower: 'borrowerA' | 'borrowerB',
  index: string,
  sequence: number,
): Promise<Entry> {
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
    LoanSequence: sequence,
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
  const owner = `${address(borrower)}:loan`
  devnet.owned.set(owner, [...(devnet.owned.get(owner) ?? []), loan])
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
  assert.equal(first.addresses.borrowerB, address('borrowerB'))
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

it('lists the LoanBroker loans of both borrowers, oldest first', async () => {
  const devnet = await investing()
  await addLoan(devnet, 'borrowerA', LOAN_3, 3)
  await addLoan(devnet, 'borrowerB', LOAN_2, 2)
  const foreign = await addLoan(devnet, 'borrowerB', 'other', 0)
  foreign['LoanBrokerID'] = 'other'
  const demo = await openDemo(kit, devnet.ledger)
  const { loans } = demo.snapshot('outsider')
  assert.deepEqual(
    loans.map((l) => `${l.loanSequence} ${l.borrower} ${l.loanID}`),
    [`1 borrowerA ${LOAN_1}`, `2 borrowerB ${LOAN_2}`, `3 borrowerA ${LOAN_3}`],
  )
  assert.equal(loans[0]?.status, 'active')
  assert.equal(loans[0]?.nextPaymentDueDate, toMs(LOAN_START + 60))
  demo.close()
})

it('shows loan terms to its borrower and the broker, and no one else', async () => {
  const devnet = await investing()
  const demo = await openDemo(kit, devnet.ledger)
  const owed = (s: Snapshot): Shown => s.loans[0]?.amountOwed ?? { visibility: 'redacted' }
  for (const viewer of ['borrowerA', 'brokerA'] as const) {
    assert.deepEqual(await settled(demo, viewer, owed), { visibility: 'decrypted', value: 1050n })
  }
  for (const viewer of ['borrowerB', 'outsider', 'depositorA'] as const) {
    assert.deepEqual(await settled(demo, viewer, owed), { visibility: 'redacted' }, viewer)
  }
  demo.close()
})

it('reads a loan with no PaymentRemaining as repaid', async () => {
  const devnet = await investing()
  const [loan] = devnet.owned.get(`${address('borrowerA')}:loan`) ?? []
  delete loan?.['PaymentRemaining']
  if (loan !== undefined) loan['NextPaymentDueDate'] = 0
  const demo = await openDemo(kit, devnet.ledger)
  const [view] = demo.snapshot('outsider').loans
  assert.equal(view?.status, 'repaid')
  assert.equal(view?.paymentRemaining, 0)
  assert.equal(view?.nextPaymentDueDate, undefined)
  demo.close()
})

it('values shares at their part of the assets less the unrealized loss', async () => {
  const devnet = await investing()
  const vault = devnet.entries.get(`index:${VAULT}`) ?? {}
  vault['LossUnrealized'] = '600'
  const demo = await openDemo(kit, devnet.ledger)
  const a = demo.snapshot('outsider').depositors.depositorA
  assert.equal(a.shares, 1500n)
  assert.deepEqual(a.value, { visibility: 'public', value: 1200n })
  assert.deepEqual(a.wallet, { visibility: 'public', value: 0n })
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

it('has the broker sign a LoanSet and the borrower co-sign that blob', async (t) => {
  const devnet = await investing()
  const demo = await openDemo(kit, devnet.ledger)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const signed = await settle(
    t,
    demo.act({ type: 'LoanSetSign', borrower: 'borrowerB', terms: TERMS }),
  )
  assert.equal(signed, undefined, 'signing submits nothing')
  assert.equal(devnet.submitted.length, 0)
  const offer = demo.snapshot('brokerA').offer
  assert.equal(offer?.borrower, 'borrowerB')
  assert.deepEqual(offer?.terms, TERMS)
  assert.equal(offer?.stale, false)

  const hash = await settle(t, demo.act({ type: 'LoanSetCosign', borrower: 'borrowerB' }))
  assert.match(hash ?? '', /^[0-9A-F]{64}$/)
  const [tx] = devnet.submitted
  assert.equal(tx?.['TransactionType'], 'LoanSet')
  assert.equal(tx?.['Account'], address('brokerA'))
  assert.equal(tx?.['Counterparty'], address('borrowerB'))
  assert.equal(tx?.['SigningPubKey'], walletFromSeed(kit.accounts.brokerA.seed).publicKey)
  const counterparty = tx?.['CounterpartySignature'] as { SigningPubKey?: string } | undefined
  assert.equal(counterparty?.SigningPubKey, walletFromSeed(kit.accounts.borrowerB.seed).publicKey)
  assert.equal(tx?.['LoanAuditorEncryptionKey'], key('loanAuditor').publicKey)
  const owed = String(tx?.['BorrowerEncryptedAmountOwed'])
  assert.equal(await crypto.decryptAmount(owed, key('borrowerB').privateKey, 4000n), 1050n)
  assert.equal(demo.snapshot('brokerA').offer, undefined)
  demo.close()
})

it('marks the offer stale once the broker uses its Sequence, and withdraws it', async (t) => {
  const devnet = await investing()
  const demo = await openDemo(kit, devnet.ledger)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const sign = { type: 'LoanSetSign', borrower: 'borrowerA', terms: TERMS } as const
  await settle(t, demo.act(sign))
  assert.deepEqual(gate(demo.snapshot('outsider'), sign), {
    open: false,
    reason: 'blocked',
    why: 'An offer is waiting for its co-signature',
  })
  devnet.sequence = 8
  devnet.close()
  await new Promise<void>((resolve) => demo.subscribe(resolve))
  const s = demo.snapshot('outsider')
  assert.equal(s.offer?.stale, true)
  assert.deepEqual(gate(s, { type: 'LoanSetCosign', borrower: 'borrowerA' }), {
    open: false,
    reason: 'blocked',
    why: 'The offer expired: the Broker must sign it again',
  })
  assert.deepEqual(gate(s, sign), { open: true })
  await settle(t, demo.act({ type: 'LoanSetWithdraw' }))
  assert.equal(demo.snapshot('outsider').offer, undefined)
  assert.equal(devnet.submitted.length, 0)
  demo.close()
})

it('pays a loan in full with exactly the amount owed', async (t) => {
  const devnet = await investing()
  const demo = await openDemo(kit, devnet.ledger)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  await settle(t, demo.act({ type: 'ConfidentialLoanPay', loanID: LOAN_1, mode: 'full' }))
  const [tx] = devnet.submitted
  assert.equal(tx?.['TransactionType'], 'ConfidentialLoanPay')
  assert.equal(tx?.['Account'], address('borrowerA'))
  assert.equal(tx?.['LoanID'], LOAN_1)
  assert.equal(tx?.['Flags'], 0x0002_0000)
  const paid = String(tx?.['DestinationEncryptedAmount'])
  assert.equal(await crypto.decryptAmount(paid, key('brokerA').privateKey, 4000n), 1050n)
  demo.close()
})

it('pays an installment of the periodic payment', async (t) => {
  const devnet = await investing()
  const loan = await addLoan(devnet, 'borrowerB', LOAN_2, 2)
  loan['PaymentRemaining'] = 2
  const periodic = await encrypt(525n, key('borrowerB').publicKey)
  loan['BorrowerEncryptedPeriodicPayment'] = periodic
  const demo = await openDemo(kit, devnet.ledger)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  await settle(t, demo.act({ type: 'ConfidentialLoanPay', loanID: LOAN_2, mode: 'installment' }))
  const [tx] = devnet.submitted
  assert.equal(tx?.['Account'], address('borrowerB'))
  assert.equal(tx?.['Flags'] ?? 0, 0)
  assert.equal(typeof tx?.['PeriodicPaymentCommitment'], 'string')
  const paid = String(tx?.['DestinationEncryptedAmount'])
  assert.equal(await crypto.decryptAmount(paid, key('brokerA').privateKey, 4000n), 525n)
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
  await settle(t, demo.act({ type: 'LoanManage', loanID: LOAN_1, flag: 'impair' }))
  await settle(t, demo.act({ type: 'LoanManage', loanID: LOAN_1, flag: 'default' }))
  await settle(t, demo.act({ type: 'VaultWithdraw', depositor: 'depositorB' }))
  const [impair, defaulted, withdraw] = devnet.submitted
  assert.equal(impair?.['Flags'], 0x0002_0000)
  assert.equal(defaulted?.['Flags'], 0x0001_0000)
  assert.equal(defaulted?.['LoanID'], LOAN_1)
  assert.equal(withdraw?.['Account'], address('depositorB'))
  assert.deepEqual(withdraw?.['Amount'], { mpt_issuance_id: SHARES, value: '1500' })
  demo.close()
})

it('act rejects with the engine code and the hash', async (t) => {
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
  assert.equal(demo.snapshot('depositorB').submitting, undefined)
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
  await assert.rejects(
    demo.act({ type: 'ConfidentialLoanPay', loanID: LOAN_1, mode: 'full' }),
    (error) => {
      assert.ok(error instanceof ActionFailed)
      assert.equal(error.code, 'buildFailed')
      assert.match(error.message, /exceeds the confidential spending balance 10/)
      return true
    },
  )
  assert.equal(devnet.submitted.length, 0)
  demo.close()
})

it('act rejects co-signing a loan the broker has not signed', async () => {
  const devnet = await investing()
  const demo = await openDemo(kit, devnet.ledger)
  await assert.rejects(demo.act({ type: 'LoanSetCosign', borrower: 'borrowerB' }), {
    code: 'unavailable',
  })
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

it('gate opens a deposit within the wallet during Subscription only', async () => {
  const deposit = (amount: bigint) =>
    ({ type: 'VaultDeposit', depositor: 'depositorA', amount }) as const
  assert.deepEqual(gate(await snapshotAt(SUBSCRIPTION), deposit(1n)), {
    open: false,
    reason: 'blocked',
    why: 'The wallet is empty',
  })
  const funded = await snapshotAt(SUBSCRIPTION, undeposited)
  assert.deepEqual(gate(funded, deposit(1500n)), { open: true })
  assert.deepEqual(gate(funded, deposit(1501n)), {
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

it('gate opens an offer after a draw, with valid terms that end before redemption', async () => {
  const sign = (terms: LoanTerms) =>
    ({ type: 'LoanSetSign', borrower: 'borrowerA', terms }) as const
  const undrawn = await snapshotAt(SUBSCRIPTION + 40, (devnet) => {
    const broker = devnet.owned.get(`${address('brokerA')}:loan_broker`)?.[0]
    if (broker !== undefined) broker['DebtTotal'] = '0'
  })
  assert.deepEqual(gate(undrawn, sign(TERMS)), {
    open: false,
    reason: 'blocked',
    why: 'Draw into the Lending Balance first',
  })
  const s = await snapshotAt(SUBSCRIPTION + 40)
  assert.deepEqual(gate(s, sign(TERMS)), { open: true })
  const bad = gate(s, sign({ ...TERMS, amountOwed: 900n }))
  assert.equal(bad.open === false && bad.reason, 'blocked')
  const late = await snapshotAt(REDEMPTION - 119)
  assert.deepEqual(gate(late, sign(TERMS)), {
    open: false,
    reason: 'closed',
    code: 'tecNO_PERMISSION',
  })
})

it('gate keeps installments for loans with more than one payment left', async () => {
  const s = await snapshotAt(SUBSCRIPTION + 40)
  const pay = (mode: 'installment' | 'full') =>
    ({ type: 'ConfidentialLoanPay', loanID: LOAN_1, mode }) as const
  assert.deepEqual(gate(s, pay('full')), { open: true })
  assert.deepEqual(gate(s, pay('installment')), {
    open: false,
    reason: 'blocked',
    why: 'Only the final payment is left: pay in full',
  })
})

it('gate opens impairment after the due date and default after the grace period', async () => {
  const due = LOAN_START + 60
  const early = await snapshotAt(due)
  assert.deepEqual(gate(early, { type: 'LoanManage', loanID: LOAN_1, flag: 'impair' }), {
    open: false,
    reason: 'opens',
    at: toMs(due + 1),
  })
  assert.deepEqual(gate(early, { type: 'LoanManage', loanID: LOAN_1, flag: 'default' }), {
    open: false,
    reason: 'opens',
    at: toMs(due + 61),
  })
  const late = await snapshotAt(due + 61)
  assert.deepEqual(gate(late, { type: 'LoanManage', loanID: LOAN_1, flag: 'default' }), {
    open: true,
  })
  assert.deepEqual(gate(late, { type: 'LoanManage', loanID: LOAN_2, flag: 'impair' }), {
    open: false,
    reason: 'blocked',
    why: 'No such loan',
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
  const empty = await snapshotAt(REDEMPTION, undeposited)
  assert.deepEqual(gate(empty, { type: 'VaultWithdraw', depositor: 'depositorA' }), {
    open: false,
    reason: 'blocked',
    why: 'No shares to redeem',
  })
})
