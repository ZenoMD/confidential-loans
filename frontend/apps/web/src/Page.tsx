import type { ReactNode } from 'react'
import './Page.css'
import { useLedgerStatus } from './ledger.tsx'
import type { LedgerStatus } from './ledger.tsx'
import { KIT_HREF } from './route.ts'
import type { Step } from './route.ts'
import { StepNav } from './StepNav.tsx'

interface PageProps {
  readonly step: Step
  /** The role column: a Role, plus a Toggle on some screens. */
  readonly aside?: ReactNode
  /** Rendered once the demo is open; until then the page shows one status line instead. */
  readonly children?: ReactNode
}

function Notice({ status }: { status: Exclude<LedgerStatus, { status: 'ready' }> }) {
  switch (status.status) {
    case 'noKit':
      return (
        <p className="page-notice">
          <a href={KIT_HREF}>Load the demo kit</a> to run this step.
        </p>
      )
    case 'badKit':
      return (
        <p className="page-notice" role="alert">
          {status.error}. <a href={KIT_HREF}>Load the demo kit again</a>.
        </p>
      )
    case 'connecting':
      return <p className="page-notice">Reading the ledger</p>
    case 'failed':
      return (
        <p className="page-notice" role="alert">
          Could not open the demo: {status.error}. <a href={KIT_HREF}>Check the kit</a>.
        </p>
      )
  }
}

/** A step screen: step navigation, then the main column with the role column on its right. */
export function Page({ step, aside, children }: PageProps) {
  const status = useLedgerStatus()
  return (
    <div className="page">
      <StepNav step={step} />
      <div className="page-body">
        {aside !== undefined && (
          <aside className="page-aside" aria-label="Role">
            {aside}
          </aside>
        )}
        <main className="page-main">
          {status.status === 'ready' ? children : <Notice status={status} />}
        </main>
      </div>
    </div>
  )
}
