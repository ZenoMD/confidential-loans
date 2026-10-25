// The Broker tab of the demo, reduced to the loan actions the Ledger signs. The local server
// (server.ts) reads the ledger, asks the device to sign, and submits.

const RIPPLE_EPOCH = 946_684_800
const POLL_MS = 4000
const TOAST_MS = 10_000

// Icon paths copied from the demo's Role.tsx; the device icon is this page's own.
const ICONS = {
  broker:
    '<path d="M6 18L24 7l18 11H6z"/><path d="M8 21h32M12 21v13M20 21v13M28 21v13M36 21v13M8 37h32M6 41h36"/>',
  depositor:
    '<rect x="4" y="20" width="32" height="18" rx="2"/><circle cx="20" cy="29" r="4"/><path d="M8 16h32v18M12 12h32v18"/>',
  borrower:
    '<path d="M6 16l4-8h28l4 8"/><path d="M6 16q4.5 6 9 0q4.5 6 9 0q4.5 6 9 0q4.5 6 9 0"/><path d="M10 21v20M38 21v20M8 41h32M10 31h28"/><circle cx="17" cy="28" r="3"/><circle cx="24" cy="28" r="3"/><circle cx="31" cy="28" r="3"/>',
  device:
    '<rect x="4" y="16" width="34" height="16" rx="3"/><rect x="11" y="20" width="16" height="8" rx="1"/><path d="M38 21h6v6h-6"/>',
}
const GLOBE =
  '<svg class="privacy-icon" data-kind="public" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13M1.5 8h13M8 1.5c2 2 2 11 0 13M8 1.5c-2 2-2 11 0 13"/></svg>'

const ACTIONS = {
  impair: { label: 'Impair', type: 'LoanManage', flag: 'tfLoanImpair', done: 'Loan impaired' },
  default: { label: 'Default', type: 'LoanManage', flag: 'tfLoanDefault', done: 'Loan defaulted' },
  delete: { label: 'Delete', type: 'LoanDelete', flag: undefined, done: 'Loan deleted' },
}

const $ = (id) => document.getElementById(id)
let state
let shownJson = ''
let review

function escape(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

function icon(name, size, stroke) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
}

function paintIcons() {
  for (const svg of document.querySelectorAll('svg[data-icon]')) {
    const size = Number(svg.getAttribute('width'))
    svg.outerHTML = icon(svg.dataset.icon, size, size > 32 ? 1.5 : 3)
  }
}

/** Who signs, as the buttons name it: the Ledger, or the software key in a dry run. */
function signerName() {
  return state.signer.mode === 'dry-run' ? 'software key' : 'Ledger'
}

function money(amount) {
  return `$${Math.round(amount).toLocaleString('en-US')}`
}

function clock(rippleTime) {
  const date = new Date((rippleTime + RIPPLE_EPOCH) * 1000)
  return date.toTimeString().slice(0, 8)
}

function short(hash) {
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`
}

function value(label, text, tone) {
  const toneAttr = tone === undefined ? '' : ` data-tone="${tone}"`
  return `<span class="value" tabindex="0"><span class="value-label">${escape(label)}</span><span class="value-line">${GLOBE}<span class="value-amount"${toneAttr}>${escape(text)}</span></span><span role="tooltip" class="value-note">Public on the ledger.</span></span>`
}

async function api(path, body) {
  const init =
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }
  const response = await fetch(path, init)
  const json = await response.json()
  if (!response.ok) throw new Error(json.error ?? `${path} failed with ${response.status}`)
  return json
}

function renderSigner(signer) {
  const dryRun = signer.mode === 'dry-run'
  $('mode').hidden = !dryRun
  $('signer-name').textContent = dryRun
    ? 'Software key'
    : signer.connected
      ? `Ledger · ${signer.label}`
      : 'Ledger'
  $('signer-state').dataset.on = String(signer.connected)
  $('signer-state').textContent = signer.connected ? 'Connected' : 'Not connected'
  $('connect').textContent = signer.connected ? 'Reconnect' : 'Connect Ledger'
  $('connect').hidden = dryRun
}

function renderVault() {
  const { vault, broker } = state
  $('vault-stats').innerHTML = [
    value('Assets total', money(vault.assetsTotal)),
    value('Assets available', money(vault.assetsAvailable)),
    value('Unrealized loss', money(vault.lossUnrealized)),
    value('First-loss cover', money(broker.coverAvailable)),
    value('Debt total', money(broker.debtTotal)),
  ].join('')
}

function loanTitle(loan) {
  return `Loan ${loan.sequence}`
}

function loanCard(loan) {
  const title = loanTitle(loan)
  const troubled = loan.status === 'Impaired' || loan.status === 'Defaulted'
  const head = `<header class="card-head"><h3 class="card-title">${escape(title)}</h3><span class="card-meta">${escape(loan.borrower)}</span><span class="card-status" data-troubled="${troubled}" data-gone="${loan.status === 'Deleted'}">${loan.status}</span></header>`
  if (loan.status === 'Deleted') {
    return `<article class="card" aria-label="${escape(title)}">${head}<p class="section-note">Deleted from the ledger by the broker.</p></article>`
  }
  const due = `${clock(loan.due)}${state.now > loan.due ? ', overdue' : ''}`
  const stats = [
    value('Principal', money(loan.principal)),
    value('Amount owed', money(loan.owed)),
    value('Periodic payment', money(loan.periodic)),
    value('Payments left', String(loan.paymentsLeft)),
    value('Interval', `${loan.interval} s`),
    value('Next payment due', due),
  ].join('')
  const buttons = Object.entries(ACTIONS)
    .map(([action, { label }]) => {
      const disabled = loan.actions.includes(action) ? '' : ' disabled'
      return `<div class="cta" data-size="small"><button type="button" class="cta-button" data-loan="${loan.loanID}" data-action="${action}"${disabled}>${icon('device', 16, 3).replace('<svg', '<svg class="device-icon"')}${label} with ${signerName()}</button></div>`
    })
    .join('')
  return `<article class="card" aria-label="${escape(title)}">${head}<div class="stats">${stats}</div><div class="actions">${buttons}</div></article>`
}

function render() {
  $('notice').hidden = true
  $('vault-section').hidden = false
  $('loans-section').hidden = false
  $('owner').innerHTML =
    `${state.owner}<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2h6v6M10 2L3 9" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`
  $('owner').href = `${state.explorer}/accounts/${state.owner}`
  $('network').textContent = state.network === 'devnet' ? 'Devnet' : state.network
  $('ledger-index').textContent = `Ledger ${state.ledgerIndex.toLocaleString('en-US')}`
  renderSigner(state.signer)
  // Redraw the cards only when they change, so a poll never steals focus from a button.
  const json = JSON.stringify([state.vault, state.broker, state.loans, state.signer.mode])
  if (json === shownJson) return
  shownJson = json
  renderVault()
  $('loan-cards').innerHTML = state.loans.map(loanCard).join('')
}

async function refresh() {
  try {
    state = await api('/api/state')
    render()
  } catch (error) {
    // A missed poll keeps the last good view; only the first load reports it.
    if (state === undefined)
      $('notice').textContent = `Could not reach the devnet: ${error.message}`
  }
}

function toast({ ok, title, detail, hash, href }) {
  const item = document.createElement('li')
  item.className = 'toast'
  item.dataset.ok = String(ok)
  const link =
    hash === undefined
      ? ''
      : `<a class="toast-link" href="${href}" target="_blank" rel="noreferrer">${short(hash)} in the explorer</a>`
  item.innerHTML = `<div class="toast-text"><span class="toast-title">${escape(title)}</span><span class="toast-detail">${escape(detail)}</span>${link}</div><button type="button" class="toast-close" aria-label="Dismiss"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5"/></svg></button>`
  item.querySelector('button').addEventListener('click', () => item.remove())
  $('toasts').append(item)
  setTimeout(() => item.remove(), TOAST_MS)
}

const MARKS = { done: 'Done', running: 'Now', failed: 'Failed', waiting: '' }

function renderStages() {
  const dryRun = state.signer.mode === 'dry-run'
  const names = [
    'Prepare the transaction',
    dryRun ? 'Sign with the software key' : 'Review and approve on the Ledger',
    `Submit to ${state.network === 'devnet' ? 'Devnet' : state.network}`,
    'Validated',
  ]
  $('review-stages').innerHTML = names
    .map((name, i) => {
      const status = review.stages[i]
      return `<li class="stage" data-state="${status}"><span class="stage-mark">${MARKS[status]}</span><span>${name}</span></li>`
    })
    .join('')
}

function setStage(index, status) {
  review.stages[index] = status
  renderStages()
}

function openReview(loanID, action) {
  const loan = state.loans.find((l) => l.loanID === loanID)
  const spec = ACTIONS[action]
  review = { loanID, action, stages: ['waiting', 'waiting', 'waiting', 'waiting'], running: false }
  const facts = [
    ['Transaction', spec.type],
    ...(spec.flag === undefined ? [] : [['Flags', spec.flag]]),
    ['Account', state.owner],
    ['Loan', `${loanTitle(loan)} · ${loan.borrower}`],
    ['LoanID', loanID],
  ]
  $('review-facts').innerHTML = facts.map(([k, v]) => `<dt>${k}</dt><dd>${escape(v)}</dd>`).join('')
  $('review-device').innerHTML =
    state.signer.mode === 'dry-run'
      ? "<strong>Dry run.</strong> The broker's software regular key signs instead of the Ledger."
      : `<strong>Blind signing.</strong> The XRP app cannot display ${spec.type} fields, so it shows a blind signing warning and the transaction hash. Approve it on the device.`
  $('review-title').textContent = `${spec.label} ${loanTitle(loan)} with ${signerName()}`
  $('review').showModal()
  void runReview()
}

async function runReview() {
  const spec = ACTIONS[review.action]
  review.running = true
  review.stages = ['waiting', 'waiting', 'waiting', 'waiting']
  $('review-result').hidden = true
  $('review-retry').hidden = true
  $('review-close').disabled = true
  let current = 0
  try {
    setStage(0, 'done')
    current = 1
    setStage(1, 'running')
    const signed = await api('/api/sign', { loanID: review.loanID, action: review.action })
    setStage(1, 'done')
    current = 2
    setStage(2, 'running')
    const result = await api('/api/submit', signed)
    if (result.code !== 'tesSUCCESS') throw new Error(`Devnet rejected it with ${result.code}.`)
    setStage(2, 'done')
    setStage(3, 'done')
    $('review-result').dataset.kind = ''
    $('review-result').innerHTML =
      `tesSUCCESS: <a href="${result.link}" target="_blank" rel="noreferrer">${short(result.hash)} in the explorer</a>`
    toast({
      ok: true,
      title: spec.done,
      detail: 'tesSUCCESS',
      hash: result.hash,
      href: result.link,
    })
  } catch (error) {
    setStage(current, 'failed')
    $('review-result').dataset.kind = 'alert'
    $('review-result').textContent = error.message
    $('review-retry').hidden = false
    toast({ ok: false, title: `${spec.label} failed`, detail: error.message })
  } finally {
    review.running = false
    $('review-result').hidden = false
    $('review-close').disabled = false
    void refresh()
  }
}

async function connect() {
  const line = $('connect-line')
  $('connect').disabled = true
  line.hidden = true
  try {
    renderSigner(await api('/api/connect', {}))
  } catch (error) {
    line.dataset.kind = 'alert'
    line.textContent = error.message
    line.hidden = false
  } finally {
    $('connect').disabled = false
  }
}

paintIcons()
$('connect').addEventListener('click', () => void connect())
$('loan-cards').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]')
  if (button !== null && !button.disabled) openReview(button.dataset.loan, button.dataset.action)
})
$('review-retry').addEventListener('click', () => void runReview())
$('review-close').addEventListener('click', () => $('review').close())
$('review').addEventListener('cancel', (event) => {
  if (review?.running) event.preventDefault()
})
void refresh()
setInterval(() => void refresh(), POLL_MS)
