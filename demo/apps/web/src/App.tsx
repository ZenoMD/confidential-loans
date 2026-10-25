import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { Borrower, Depositor } from '@confidential-loans/core/demo-ledger'
import { useLedgerStatus } from './ledger.tsx'
import { DecryptOnSwitch, useLens } from './lens.tsx'
import { parseRoute, tabHref } from './route.ts'
import type { Tab } from './route.ts'
import { BorrowerTab } from './tabs/borrower.tsx'
import { BrokerTab } from './tabs/broker.tsx'
import { DepositorTab } from './tabs/depositor.tsx'

// The spec and its markdown parser load only when the spec is opened.
const SpecPage = lazy(async () => ({ default: (await import('./SpecPage.tsx')).SpecPage }))

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash)
}

/**
 * Routes `#/depositor`, `#/broker` and `#/borrower` to their tabs and `#/spec` to the spec; any
 * other hash opens the depositor's tab. The depositor and borrower picks live here, so they
 * survive switching tabs. While the demo waits to be initialized a tab moves to the depositor's,
 * where a run starts. Each switch of tab, account or view replays the decrypt of the amounts the
 * new view reads.
 */
export function App() {
  const hash = useHash()
  const route = parseRoute(hash)
  const tab: Tab | undefined = route.page === 'tab' ? route.tab : undefined
  const setup = useLedgerStatus().status === 'setup'
  useEffect(() => {
    if (setup && tab !== undefined) window.location.replace(tabHref('depositor'))
  }, [setup, tab])
  const [depositor, setDepositor] = useState<Depositor>('depositorA')
  const [borrower, setBorrower] = useState<Borrower>('borrowerA')
  const { publicView } = useLens()
  // The spec scrolls itself, to the section its route names.
  useEffect(() => {
    if (tab !== undefined) window.scrollTo(0, 0)
  }, [tab])
  if (route.page === 'spec') {
    return (
      <Suspense fallback={null}>
        <SpecPage section={route.section} />
      </Suspense>
    )
  }
  const tabs: Readonly<Record<Tab, ReactNode>> = {
    depositor: <DepositorTab depositor={depositor} onDepositor={setDepositor} />,
    broker: <BrokerTab />,
    borrower: <BorrowerTab borrower={borrower} onBorrower={setBorrower} />,
  }
  // Whose eyes the tab shows: a change replays the decrypt.
  const view = `${route.tab} ${depositor} ${borrower} ${publicView}`
  return <DecryptOnSwitch view={view}>{tabs[route.tab]}</DecryptOnSwitch>
}
