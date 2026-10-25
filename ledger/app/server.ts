import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { Client, LoanManageFlags, decode, hashes } from 'xrpl'
import type { SubmittableTransaction } from 'xrpl'

import { autofillForLedger, ledgerSign, openLedger, runningApp } from '#lib/ledger'
import type { LedgerSession } from '#lib/ledger'
import { readDeployment } from '#lib/fixture'
import type { DemoLoan } from '#lib/fixture'
import { NETWORK, freshConnection, reconnecting, txLink } from '#lib/network'
import { entry } from '#lib/read'
import { submitBlob } from '#lib/submit'
import { ledgerTime } from '#lib/time'
import { regularKey } from '#lib/wallets'

const PORT = 5180
// Only this machine may reach the server: it signs and submits for the broker account.
const HOST = '127.0.0.1'
const DRY_RUN = process.argv.includes('--dry-run')
const PUBLIC = new URL('./public/', import.meta.url)
const STATIC: Record<string, { file: string; type: string }> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/demo.css': { file: 'demo.css', type: 'text/css; charset=utf-8' },
  '/styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
}
const IMPAIRED = 0x00020000
const DEFAULTED = 0x00010000
// Statuses after which the transport still works; anything else reopens the device next time.
const KEEP_SESSION = new Set([0x6985, 0x680b])
const DEVICE_ERRORS: Record<number, string> = {
  0x5515: 'The Ledger is locked. Enter the PIN and open the XRP app.',
  0x6985: 'Rejected on the Ledger, or blind signing is off in the XRP app settings.',
  0x6901: 'The Ledger is still showing an earlier review. Approve or reject it on the device.',
  0x680b: 'The XRP app cannot read this transaction.',
  0x6511: 'Open the XRP app on the Ledger.',
  0x6d00: 'Open the XRP app on the Ledger.',
  0x6e00: 'Open the XRP app on the Ledger.',
  0x6e01: 'Open the XRP app on the Ledger.',
}

type Action = 'impair' | 'default' | 'delete'

const demo = readDeployment()
const regular = regularKey()
const client = new Client(NETWORK.wss)
let connecting: Promise<void> | undefined
let session: LedgerSession | undefined
let deviceApp: string | undefined
let signing = false

class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** The XRPL network client, reconnected when the websocket has dropped. */
async function network(): Promise<Client> {
  if (client.isConnected()) return client
  connecting ??= freshConnection(client).finally(() => {
    connecting = undefined
  })
  await connecting
  return client
}

async function closeDevice(): Promise<void> {
  const open = session
  session = undefined
  deviceApp = undefined
  await open?.transport.close().catch(() => undefined)
}

async function device(): Promise<LedgerSession> {
  if (session !== undefined) return session
  const opened = await openLedger()
  if (opened.address !== demo.owner) {
    await opened.transport.close()
    throw new HttpError(409, `This Ledger holds ${opened.address}; the broker is ${demo.owner}.`)
  }
  session = opened
  deviceApp = await runningApp(opened.transport)
  return opened
}

function deviceMessage(error: unknown): string {
  if (error instanceof HttpError) return error.message
  const status = (error as { statusCode?: number }).statusCode
  if (status !== undefined) return DEVICE_ERRORS[status] ?? `Ledger error 0x${status.toString(16)}.`
  const message = error instanceof Error ? error.message : String(error)
  if (/no device|no ledger device|cannot open device|NoDevice/i.test(message)) {
    return 'No Ledger found. Plug it in, unlock it and close Ledger Live.'
  }
  return message
}

async function onDeviceError(error: unknown): Promise<never> {
  const status = (error as { statusCode?: number }).statusCode
  if (status === undefined || !KEEP_SESSION.has(status)) await closeDevice()
  throw new HttpError(502, deviceMessage(error))
}

function signerView(): Record<string, unknown> {
  if (DRY_RUN) return { mode: 'dry-run', connected: true, label: 'Software key (dry run)' }
  return { mode: 'ledger', connected: session !== undefined, label: deviceApp ?? 'Ledger' }
}

function loanStatus(flags: number): string {
  if ((flags & DEFAULTED) !== 0) return 'Defaulted'
  if ((flags & IMPAIRED) !== 0) return 'Impaired'
  return 'Active'
}

async function loanView(loan: DemoLoan, now: number): Promise<Record<string, unknown>> {
  const node = await entry(await network(), loan.loanID)
  if (node === undefined) return { ...loan, status: 'Deleted', actions: [] }
  const num = (field: string): number => Number(node[field] ?? 0)
  const flags = num('Flags')
  const due = num('NextPaymentDueDate')
  const status = loanStatus(flags)
  const actions: Action[] = []
  if (status === 'Active' && now > due) actions.push('impair')
  if (status !== 'Defaulted' && now > due + num('GracePeriod')) actions.push('default')
  if (status === 'Defaulted') actions.push('delete')
  return {
    ...loan,
    status,
    principal: num('PrincipalOutstanding'),
    owed: num('TotalValueOutstanding'),
    periodic: Math.ceil(num('PeriodicPayment')),
    paymentsLeft: num('PaymentRemaining'),
    interval: num('PaymentInterval'),
    due,
    graceEnds: due + num('GracePeriod'),
    actions,
  }
}

async function stateView(): Promise<Record<string, unknown>> {
  const xrpl = await network()
  const now = await ledgerTime(xrpl)
  const vault = (await entry(xrpl, demo.vaultID)) ?? {}
  const broker = (await entry(xrpl, demo.loanBrokerID)) ?? {}
  const loans = []
  for (const loan of demo.loans) loans.push(await loanView(loan, now))
  return {
    network: NETWORK.name,
    explorer: NETWORK.explorer,
    ledgerIndex: await reconnecting(xrpl, () => xrpl.getLedgerIndex()),
    now,
    owner: demo.owner,
    signer: signerView(),
    vault: {
      assetsTotal: Number(vault['AssetsTotal'] ?? 0),
      assetsAvailable: Number(vault['AssetsAvailable'] ?? 0),
      lossUnrealized: Number(vault['LossUnrealized'] ?? 0),
    },
    broker: {
      coverAvailable: Number(broker['CoverAvailable'] ?? 0),
      debtTotal: Number(broker['DebtTotal'] ?? 0),
    },
    loans,
  }
}

function transaction(action: Action, loanID: string): SubmittableTransaction {
  if (action === 'delete')
    return { TransactionType: 'LoanDelete', Account: demo.owner, LoanID: loanID }
  const flag = action === 'impair' ? LoanManageFlags.tfLoanImpair : LoanManageFlags.tfLoanDefault
  return { TransactionType: 'LoanManage', Account: demo.owner, LoanID: loanID, Flags: flag }
}

async function sign(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const action = body['action']
  const loanID = body['loanID']
  if (action !== 'impair' && action !== 'default' && action !== 'delete') {
    throw new HttpError(400, `Unknown action ${String(action)}`)
  }
  const loan = demo.loans.find((candidate) => candidate.loanID === loanID)
  if (loan === undefined) throw new HttpError(400, `Unknown loan ${String(loanID)}`)
  if (signing) throw new HttpError(409, 'A signature is already waiting on the device.')
  signing = true
  try {
    // Never put a transaction on the device that the ledger would reject after approval.
    const view = await loanView(loan, await ledgerTime(await network()))
    if (!(view['actions'] as Action[]).includes(action)) {
      throw new HttpError(
        409,
        `Loan ${loan.sequence} is ${String(view['status'])}; ${action} is not available.`,
      )
    }
    const tx = await autofillForLedger(await network(), transaction(action, loan.loanID))
    if (DRY_RUN) {
      const signed = regular.sign(tx)
      return { txBlob: signed.tx_blob, hash: signed.hash }
    }
    const signed = await device()
      .then((open) => ledgerSign(open, tx))
      .catch(onDeviceError)
    return { txBlob: signed.txBlob, hash: hashes.hashSignedTx(signed.txBlob) }
  } finally {
    signing = false
  }
}

async function submit(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { txBlob, hash } = body
  if (typeof txBlob !== 'string' || typeof hash !== 'string') {
    throw new HttpError(400, 'Expected txBlob and hash')
  }
  const tx = decode(txBlob)
  if (tx['Account'] !== demo.owner) throw new HttpError(400, 'Only the broker account submits here')
  const outcome = await submitBlob(await network(), txBlob, hash)
  console.log(`${String(tx['TransactionType'])} ${outcome.code} ${txLink(hash)}`)
  return { code: outcome.code, hash, link: txLink(hash) }
}

async function connect(): Promise<Record<string, unknown>> {
  if (!DRY_RUN) {
    await closeDevice()
    await device().catch(onDeviceError)
  }
  return signerView()
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  // A JSON content type forces a CORS preflight, which this server never answers, so other
  // origins in the browser cannot trigger signing.
  if (request.headers['content-type'] !== 'application/json') {
    throw new HttpError(415, 'Expected Content-Type: application/json')
  }
  let text = ''
  for await (const chunk of request) text += String(chunk)
  return text === '' ? {} : (JSON.parse(text) as Record<string, unknown>)
}

async function route(request: IncomingMessage): Promise<Record<string, unknown>> {
  const key = `${request.method} ${request.url}`
  if (key === 'GET /api/state') return stateView()
  const body = request.method === 'POST' ? await readBody(request) : {}
  if (key === 'POST /api/connect') return connect()
  if (key === 'POST /api/sign') return sign(body)
  if (key === 'POST /api/submit') return submit(body)
  throw new HttpError(404, `No route ${key}`)
}

function send(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  response.end(JSON.stringify(body))
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const file = STATIC[request.url ?? '']
  if (request.method === 'GET' && file !== undefined) {
    response.writeHead(200, { 'content-type': file.type, 'cache-control': 'no-store' })
    response.end(await readFile(new URL(file.file, PUBLIC)))
    return
  }
  try {
    send(response, 200, await route(request))
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    const message = error instanceof Error ? error.message : String(error)
    console.log(`${request.method} ${request.url} -> ${status} ${message}`)
    send(response, status, { error: message })
  }
}

function check(ok: boolean, line: string): boolean {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${line}`)
  return ok
}

async function preflight(): Promise<void> {
  const xrpl = await network()
  check(
    true,
    `${NETWORK.name} connected at ledger ${await reconnecting(xrpl, () => xrpl.getLedgerIndex())}`,
  )
  const info = await reconnecting(xrpl, () =>
    xrpl.request({ command: 'account_info', account: demo.owner }),
  )
  check(
    info.result.account_data.RegularKey === demo.regularKey,
    `broker ${demo.owner} regular key set`,
  )
  const state = await stateView()
  for (const loan of state['loans'] as Array<Record<string, unknown>>) {
    const actions = (loan['actions'] as Action[]).join(', ') || 'none'
    check(
      loan['status'] !== 'Deleted',
      `${String(loan['borrower'])} loan: ${String(loan['status'])}, can ${actions}`,
    )
  }
  if (DRY_RUN) {
    check(true, 'dry run: the software regular key signs instead of the Ledger')
    return
  }
  try {
    await device()
    check(
      deviceApp?.startsWith('XRP ') === true,
      `device app ${deviceApp ?? '?'} holds ${demo.owner}`,
    )
  } catch (error) {
    check(false, `Ledger: ${deviceMessage(error)} (Connect on the page retries)`)
  }
  console.log('Before signing: blind signing on in the XRP app, auto-lock off, Ledger Live closed.')
}

const server = createServer((request, response) => void handle(request, response))
// A review on the device can take minutes; never time the request out.
server.requestTimeout = 0
await preflight()
server.listen(PORT, HOST, () => console.log(`Ledger broker POC on http://localhost:${PORT}`))
