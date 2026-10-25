import { useState } from 'react'
import type { ReactNode } from 'react'
import './05-explorer-loans.css'
import { Page } from '#web/Page.tsx'
import { Role } from '#web/Role.tsx'
import { Toggle } from '#web/Toggle.tsx'
import { Value } from '#web/Value.tsx'
import { useSnapshot } from '#web/ledger.tsx'
import { explorerLoans } from '#web/screens/05-explorer-loans.model.ts'
import type {
  ExplorerAmount,
  ExplorerModel,
  ExplorerRow,
  ExplorerViewer,
  Link,
} from '#web/screens/05-explorer-loans.model.ts'

function AmountCell({ amount }: { amount: ExplorerAmount }) {
  switch (amount.kind) {
    case 'value':
      return <Value label="" shown={amount.shown} />
    case 'flag':
      return <span className="explorer-flag">{amount.text}</span>
    case 'none':
      return <span className="explorer-none">{amount.text}</span>
  }
}

function Row({ row }: { row: ExplorerRow }) {
  return (
    <div className="explorer-row" role="row">
      <span className="explorer-step" role="cell">
        {row.step}
      </span>
      <span className="explorer-transaction" role="cell">
        {row.transaction}
      </span>
      <span className="explorer-signed" role="cell">
        {row.signedBy}
      </span>
      <span role="cell">
        <AmountCell amount={row.amount} />
      </span>
      <span role="cell">
        {row.href === undefined ? (
          <span className="explorer-hash" title={row.hash}>
            {row.hashText}
          </span>
        ) : (
          <a className="explorer-hash" href={row.href} title={row.hash}>
            {row.hashText}
          </a>
        )}
      </span>
    </div>
  )
}

const HEADINGS = ['Step', 'Transaction', 'Signed by', 'Amount', 'Hash'] as const

/** The role, named by the pressed view, over the Outsider and Auditor toggle. */
export function ExplorerAside({
  model,
  action,
  onSelect,
}: {
  model: ExplorerModel
  action: string
  onSelect: (view: ExplorerViewer) => void
}) {
  return (
    <>
      <Role role="explorer" who={model.who} action={action} />
      <Toggle {...model.toggle} onSelect={onSelect} />
    </>
  )
}

/**
 * The transaction table in its scroll region, or the loading or prerequisite line in its place,
 * followed by any snapshot errors. `footer` sits under the last row, inside the scroll region.
 */
export function ExplorerTable({
  model,
  label,
  footer,
}: {
  model: ExplorerModel
  label: string
  footer?: ReactNode
}) {
  const { status } = model
  return (
    <>
      {status.kind === 'loading' && <p className="page-notice">{status.text}</p>}
      {status.kind === 'prerequisite' && (
        <p className="page-notice">
          <a href={status.href}>{status.text}</a>
        </p>
      )}
      {status.kind === 'ready' && (
        <section aria-label={label} className="explorer-scroll">
          <div className="explorer-table">
            <div role="table">
              <div className="explorer-row" data-head role="row">
                {HEADINGS.map((heading) => (
                  <span key={heading} role="columnheader">
                    {heading}
                  </span>
                ))}
              </div>
              {model.rows.map((row) => (
                <Row key={row.key} row={row} />
              ))}
            </div>
            {footer}
          </div>
        </section>
      )}
      {model.errors.map((error) => (
        <p key={error} className="explorer-alert" role="alert">
          {error}
        </p>
      ))}
    </>
  )
}

/** The pill link to the next step. */
export function NextLink({ link }: { link: Link }) {
  return (
    <a className="explorer-next" href={link.href}>
      {link.label}
    </a>
  )
}

/** Screen 5: the step 1 to 4 transactions, read as the Outsider or the Auditor. */
export function Step05() {
  const [view, setView] = useState<ExplorerViewer>('outsider')
  const model = explorerLoans(view, useSnapshot(view))
  return (
    <Page step={5} aside={<ExplorerAside model={model} action={model.action} onSelect={setView} />}>
      <ExplorerTable model={model} label="Transactions this run" />
      <NextLink link={model.next} />
    </Page>
  )
}
