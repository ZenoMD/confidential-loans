import type { ReactNode } from 'react'
import './Page.css'
import './Tab.css'
import { header } from './header.ts'
import { useLedgerStatus, useSetup, useSnapshot } from './ledger.tsx'
import type { LedgerStatus } from './ledger.tsx'
import { useLens } from './lens.tsx'
import { RoleIcon } from './Role.tsx'
import { Toggle } from './Toggle.tsx'
import { tabHref, TABS } from './route.ts'
import type { Tab } from './route.ts'
import { Setup } from './Setup.tsx'

interface PageProps {
  readonly tab: Tab
  /** The role column: a Role, plus the account Toggle on two tabs. */
  readonly aside: ReactNode
  /**
   * Rendered once a run is open; until then the page shows the connection status, and the setup
   * dialog shades it.
   */
  readonly children?: ReactNode
}

const CLEAR_CONFIRM =
  "Erase this browser's deployment? Its accounts and vault stay on the devnet but the app " +
  'forgets them, and the next Initialize deploys fresh ones.'

const TAB_NAMES: Readonly<Record<Tab, string>> = {
  depositor: 'Depositor',
  broker: 'Broker',
  borrower: 'Borrower',
}

function Body({ status, children }: { status: LedgerStatus; children: ReactNode }) {
  switch (status.status) {
    case 'connecting':
      return <p className="page-notice">Connecting to the devnet</p>
    case 'failed':
      return (
        <p className="page-notice" role="alert">
          Could not connect to the devnet: {status.error}.
        </p>
      )
    case 'setup':
      return null
    case 'ready':
      return children
  }
}

/** The vault phase, the countdown to the next one, the ledger the tabs show, and Clear data. */
function PhaseBar() {
  const snapshot = useSnapshot('outsider')
  const { clearData } = useSetup()
  if (snapshot === null) return null
  const model = header(snapshot)
  return (
    <div className="page-phase">
      <span className="page-phase-name">{model.phase}</span>
      {model.next !== undefined && <span>{model.next}</span>}
      <span className="page-ledger">{model.ledger}</span>
      <button
        type="button"
        className="pill"
        onClick={() => {
          if (window.confirm(CLEAR_CONFIRM)) clearData()
        }}
      >
        Clear data
      </button>
    </div>
  )
}

/** Switches every tab between its actor's view and the public ledger. */
function LensBar({ who }: { who: string }) {
  const { publicView, setPublicView } = useLens()
  return (
    <div className="page-lensbar">
      <Toggle
        label="View"
        options={[
          { value: 'actor', label: `${who} view` },
          { value: 'public', label: 'Public ledger' },
        ]}
        selected={publicView ? 'public' : 'actor'}
        onSelect={(view) => setPublicView(view === 'public')}
      />
    </div>
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
          <span className="page-brand">Zeno Confidential Loans</span>
          <PhaseBar />
        </div>
        <div className="page-row">
          <nav className="page-tabs" aria-label="Actors">
            {TABS.map((t) => (
              <a key={t} href={tabHref(t)} aria-current={t === tab ? 'page' : undefined}>
                <RoleIcon role={t} size={20} stroke={3} />
                {TAB_NAMES[t]}
              </a>
            ))}
          </nav>
          {status.status === 'ready' && <LensBar who={TAB_NAMES[tab]} />}
        </div>
      </header>
      <div className="page-body">
        <aside className="page-aside" aria-label="Role">
          {aside}
        </aside>
        <main className="page-main">
          <Body status={status}>{children}</Body>
          {errors.map((error) => (
            <p key={error} className="page-notice" role="alert">
              {error}
            </p>
          ))}
        </main>
      </div>
      {status.status === 'setup' && <Setup note={status.note} />}
    </div>
  )
}
