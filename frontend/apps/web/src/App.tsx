import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Borrower, Depositor } from '@confidential-loans/core/demo-ledger'
import { parseRoute } from './route.ts'
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
 * depositor's. The depositor and borrower picks live here, so they survive switching tabs.
 */
export function App() {
  const route = useRoute()
  const [depositor, setDepositor] = useState<Depositor>('depositorA')
  const [borrower, setBorrower] = useState<Borrower>('borrowerA')
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route])
  switch (route) {
    case 'depositor':
      return <DepositorTab depositor={depositor} onDepositor={setDepositor} />
    case 'broker':
      return <BrokerTab />
    case 'borrower':
      return <BorrowerTab borrower={borrower} onBorrower={setBorrower} />
  }
}
