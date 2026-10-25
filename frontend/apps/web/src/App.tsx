import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { Borrower, Depositor } from '@confidential-loans/core/demo-ledger'
import { useLedgerStatus } from './ledger.tsx'
import { DecryptOnSwitch, useLens } from './lens.tsx'
import { parseRoute, tabHref } from './route.ts'
import type { Tab } from './route.ts'
import { BorrowerTab } from './tabs/borrower.tsx'
import { BrokerTab } from './tabs/broker.tsx'
import { DepositorTab } from './tabs/depositor.tsx'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function useRoute(): Tab {
  return useSyncExternalStore(subscribe, () => parseRoute(window.location.hash))
}

/**
 * Routes `#/depositor`, `#/broker` and `#/borrower` to their tabs; any other hash opens the
 * depositor's. The depositor and borrower picks live here, so they survive switching tabs. While
 * the demo waits to be initialized it moves to the depositor's tab, where a run starts. Each
 * switch of tab, account or view replays the decrypt of the amounts the new view reads.
 */
export function App() {
  const route = useRoute()
  const setup = useLedgerStatus().status === 'setup'
  useEffect(() => {
    if (setup) window.location.replace(tabHref('depositor'))
  }, [setup])
  const [depositor, setDepositor] = useState<Depositor>('depositorA')
  const [borrower, setBorrower] = useState<Borrower>('borrowerA')
  const { publicView } = useLens()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route])
  const tabs: Readonly<Record<Tab, ReactNode>> = {
    depositor: <DepositorTab depositor={depositor} onDepositor={setDepositor} />,
    broker: <BrokerTab />,
    borrower: <BorrowerTab borrower={borrower} onBorrower={setBorrower} />,
  }
  // Whose eyes the tab shows: a change replays the decrypt.
  const view = `${route} ${depositor} ${borrower} ${publicView}`
  return <DecryptOnSwitch view={view}>{tabs[route]}</DecryptOnSwitch>
}
