import assert from 'node:assert/strict'
import { before, it } from 'node:test'
import type { TestContext } from 'node:test'

import { decode, hashes, loadMptCrypto } from 'xrpl'
import type { Client, MptCryptoModule } from 'xrpl'

import { confidentialKeypair, walletFromSeed } from './accounts.ts'
import { deploy, durationProblem, STAGES } from './deploy.ts'
import type { Stage } from './deploy.ts'
import { newDeployment } from './kit.ts'
import type { Deployment } from './kit.ts'

const POLL_MS = 1000
const TOKEN = '0000046B4127945F4651C08EC3394795A3A78A67860AA34C'
const OLD_VAULT = '5E1AF944C0BBAA2E1CF466AB6F0EF0226A3248ACCBBBB95B7D61CFDA3745B909'
const NEW_VAULT = 'D80405EF351D9F381E0436BFD8096B5FA002149FD549B5775F4CD2D2D3C16A1F'
const CLOSE_TIME = 846_219_000
const DURATIONS = { subscription: 300, investment: 600 }

let crypto: MptCryptoModule
before(async () => {
  crypto = await loadMptCrypto()
})

function rippledError(code: string): Error {
  return Object.assign(new Error(code), { data: { error: code } })
}

type Entry = Record<string, unknown>
type Request = Record<string, unknown> & { command: string }

/** A devnet holding a whole deployment, where every submitted transaction creates `NEW_VAULT`. */
class FakeDevnet {
  ledgerIndex = 100
  readonly entries = new Map<string, Entry>()
  /** The LoanBrokers brokerA owns. */
  readonly brokers: Entry[] = []
  readonly submitted: Entry[] = []
  private readonly validated = new Map<string, Entry>()

  async autofill(tx: Entry): Promise<Entry> {
    return { Fee: '12', Sequence: 7, LastLedgerSequence: this.ledgerIndex + 20, ...tx }
  }

  async getLedgerIndex(): Promise<number> {
    return this.ledgerIndex
  }

  async request(request: Request): Promise<{ result: unknown }> {
    return { result: this.answer(request) }
  }

  private answer(request: Request): unknown {
    switch (request.command) {
      case 'account_info':
        return { account_data: { Balance: '100000000', Sequence: 7 } }
      case 'ledger':
        return { ledger_index: this.ledgerIndex, ledger: { close_time: CLOSE_TIME } }
      case 'ledger_entry':
        return { node: this.lookup(request) }
      case 'account_objects':
        return { account_objects: request['type'] === 'loan_broker' ? this.brokers : [] }
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
    const token = request['mptoken'] as { account: string } | undefined
    const key =
      token !== undefined
        ? `token:${token.account}`
        : request['mpt_issuance'] !== undefined
          ? 'issuance'
          : `index:${String(request['index'])}`
    const found = this.entries.get(key)
    if (found === undefined) throw rippledError('entryNotFound')
    return found
  }

  private submit(blob: string): Entry {
    const tx = decode(blob)
    this.submitted.push(tx)
    if (tx['TransactionType'] === 'VaultCreate') {
      this.entries.set(`index:${NEW_VAULT}`, { index: NEW_VAULT, Asset: tx['Asset'] })
    }
    this.ledgerIndex += 1
    const created = { CreatedNode: { LedgerEntryType: 'Vault', LedgerIndex: NEW_VAULT } }
    this.validated.set(hashes.hashSignedTx(blob), {
      validated: true,
      tx_json: tx,
      meta: { TransactionResult: 'tesSUCCESS', TransactionIndex: 0, AffectedNodes: [created] },
    })
    return { engine_result: 'tesSUCCESS' }
  }
}

/** A devnet where the deployment's accounts, token, balances and vault all exist. */
async function deployedDevnet(deployment: Deployment): Promise<FakeDevnet> {
  const devnet = new FakeDevnet()
  devnet.entries.set('issuance', {
    IssuerEncryptionKey: confidentialKeypair(deployment.seeds.issuer).publicKey,
    AuditorEncryptionKey: confidentialKeypair(deployment.keySeeds.mptAuditor).publicKey,
    ConfidentialOutstandingAmount: '200000',
    MaximumAmount: '1000000000',
  })
  devnet.entries.set(`index:${OLD_VAULT}`, { index: OLD_VAULT })
  devnet.brokers.push({ index: 'BROKER', VaultID: OLD_VAULT })
  const address = (role: keyof Deployment['seeds']) =>
    walletFromSeed(deployment.seeds[role]).address
  devnet.entries.set(`token:${address('brokerA')}`, {})
  for (const role of ['depositorA', 'depositorB'] as const) {
    devnet.entries.set(`token:${address(role)}`, { MPTAmount: '150000' })
  }
  for (const role of ['borrowerA', 'borrowerB'] as const) {
    const key = confidentialKeypair(deployment.seeds[role]).publicKey
    const encrypt = async (value: bigint) =>
      crypto.encryptAmount(value, key, await crypto.generateBlindingFactor())
    devnet.entries.set(`token:${address(role)}`, {
      HolderEncryptionKey: key,
      ConfidentialBalanceSpending: await encrypt(100_000n),
      ConfidentialBalanceInbox: await encrypt(0n),
    })
  }
  return devnet
}

function deployment(): Deployment {
  return {
    ...newDeployment(),
    mptIssuanceID: TOKEN,
    vault: { vaultID: OLD_VAULT, subscriptionDate: CLOSE_TIME - 900, redemptionDate: CLOSE_TIME },
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

it('reuses a whole deployment without submitting anything, even once its vault closed', async () => {
  const saved = deployment()
  const devnet = await deployedDevnet(saved)
  const stages: Stage[] = []
  const saves: Deployment[] = []
  const client = devnet as unknown as Client
  const result = await deploy(client, saved, DURATIONS, {
    onStage: (stage) => stages.push(stage),
    onSave: (d) => saves.push(d),
  })
  assert.deepEqual(result, saved)
  assert.deepEqual(stages, STAGES)
  assert.equal(devnet.submitted.length, 0)
  assert.deepEqual(saves, [saved])
})

it('creates a vault when the saved one is gone, then its LoanBroker with the widest cap', async (t) => {
  const saved = deployment()
  const devnet = await deployedDevnet(saved)
  devnet.entries.delete(`index:${OLD_VAULT}`)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const saves: Deployment[] = []
  const sent: string[] = []
  const client = devnet as unknown as Client
  const hooks = {
    onSave: (d: Deployment) => saves.push(d),
    onTransaction: (type: string, hash: string) => sent.push(`${type} ${hash.length}`),
  }
  const result = await settle(t, deploy(client, saved, DURATIONS, hooks))
  assert.deepEqual(sent, ['VaultCreate 64', 'LoanBrokerSet 64'])
  const vault = {
    vaultID: NEW_VAULT,
    subscriptionDate: CLOSE_TIME + 300,
    redemptionDate: CLOSE_TIME + 900,
  }
  assert.deepEqual(result.vault, vault)
  assert.deepEqual(saves.at(-1)?.vault, vault)
  const owner = walletFromSeed(saved.seeds.brokerA).address
  const [vaultCreate, brokerSet] = devnet.submitted
  assert.equal(vaultCreate?.['TransactionType'], 'VaultCreate')
  assert.equal(vaultCreate?.['Account'], owner)
  assert.equal(vaultCreate?.['SubscriptionDate'], CLOSE_TIME + 300)
  assert.equal(brokerSet?.['TransactionType'], 'LoanBrokerSet')
  assert.equal(brokerSet?.['Account'], owner)
  assert.equal(brokerSet?.['VaultID'], NEW_VAULT)
  assert.equal(brokerSet?.['DebtMaximum'], '1000000000')
  assert.equal(brokerSet?.['Flags'], 0x0002_0000)
  const brokerKey = confidentialKeypair(saved.keySeeds.brokerA).publicKey
  assert.equal(brokerSet?.['HolderEncryptionKey'], brokerKey)
})

it('rejects durations below the demo and ledger floors', () => {
  assert.equal(durationProblem(DURATIONS), undefined)
  assert.equal(durationProblem({ subscription: 180, investment: 180 }), undefined)
  assert.equal(
    durationProblem({ subscription: 179, investment: 600 }),
    'Subscription must be at least 180 seconds',
  )
  assert.equal(
    durationProblem({ subscription: 180, investment: 179 }),
    'Investment must be at least 180 seconds',
  )
})
