import type { ReactNode } from 'react'
import './Page.css'
import './Tab.css'
import { header } from './header.ts'
import { useLedgerStatus, useSnapshot } from './ledger.tsx'
import type { LedgerStatus } from './ledger.tsx'
import { RoleIcon } from './Role.tsx'
import { tabHref, TABS } from './route.ts'
import type { Tab } from './route.ts'

interface PageProps {
  readonly tab: Tab
  /** The role column: a Role, plus the account Toggle on two tabs. */
  readonly aside: ReactNode
  /** Rendered once the demo is open; until then the page shows one status line instead. */
  readonly children?: ReactNode
}

const TAB_NAMES: Readonly<Record<Tab, string>> = {
  depositor: 'Depositor',
  broker: 'Broker',
  borrower: 'Borrower',
}

function Notice({ status }: { status: Exclude<LedgerStatus, { status: 'ready' }> }) {
  switch (status.status) {
    case 'noKit':
      return (
        <p className="page-notice" role="alert">
          Could not load the demo kit: {status.error}. Run <code>node scripts/setup.ts</code> in{' '}
          <code>frontend/</code>, then reload.
        </p>
      )
    case 'connecting':
      return <p className="page-notice">Reading the ledger</p>
    case 'failed':
      return (
        <p className="page-notice" role="alert">
          Could not open the demo: {status.error}.
        </p>
      )
  }
}

/** The vault phase, the countdown to the next one, and the ledger the tabs show. */
function PhaseBar() {
  const snapshot = useSnapshot('outsider')
  if (snapshot === null) return null
  const model = header(snapshot)
  return (
    <p className="page-phase">
      <span className="page-phase-name">{model.phase}</span>
      {model.next !== undefined && <span>{model.next}</span>}
      <span className="page-ledger">{model.ledger}</span>
    </p>
  )
}

/** A tab: the header with the phase bar and tab bar, then the main column and the role column. */
export function Page({ tab, aside, children }: PageProps) {
  const status = useLedgerStatus()
  const errors = useSnapshot('outsider')?.errors ?? []
  return (
    <div className="page">
      <header className="page-header">
        <div className="page-top">
          <span className="page-brand">Confidential Loans</span>
          <PhaseBar />
        </div>
        <nav className="page-tabs" aria-label="Actors">
          {TABS.map((t) => (
            <a key={t} href={tabHref(t)} aria-current={t === tab ? 'page' : undefined}>
              <RoleIcon role={t} size={20} stroke={3} />
              {TAB_NAMES[t]}
            </a>
          ))}
        </nav>
      </header>
      <div className="page-body">
        <aside className="page-aside" aria-label="Role">
          {aside}
        </aside>
        <main className="page-main">
          {status.status === 'ready' ? children : <Notice status={status} />}
          {errors.map((error) => (
            <p key={error} className="page-notice" role="alert">
              {error}
            </p>
          ))}
        </main>
      </div>
    </div>
  )
}
