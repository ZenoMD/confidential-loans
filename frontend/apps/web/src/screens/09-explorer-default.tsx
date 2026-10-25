import { useState } from 'react'
import { Value } from '#web/Value.tsx'
import { Page } from '#web/Page.tsx'
import { useSnapshot } from '#web/ledger.tsx'
import { ExplorerAside, ExplorerTable, NextLink } from '#web/screens/05-explorer-loans.tsx'
import type { ExplorerViewer } from '#web/screens/05-explorer-loans.model.ts'
import { explorerDefault } from '#web/screens/09-explorer-default.model.ts'
import type { Total } from '#web/screens/09-explorer-default.model.ts'

function TotalValue({ total }: { total: Total }) {
  if (total.amount.kind === 'value') return <Value label={total.label} shown={total.amount.shown} />
  return (
    <span className="value">
      <span className="value-label">{total.label}</span>
      <span className="explorer-none">{total.amount.text}</span>
    </span>
  )
}

/** Screen 9: the step 6 to 8 transactions and the position after loan B defaults. */
export function Step09() {
  const [view, setView] = useState<ExplorerViewer>('outsider')
  const model = explorerDefault(view, useSnapshot(view))
  return (
    <Page step={9} aside={<ExplorerAside model={model} action={model.action} onSelect={setView} />}>
      <ExplorerTable
        model={model}
        label="Transactions since step 5"
        footer={
          <a className="explorer-earlier" href={model.earlier.href}>
            {model.earlier.label}
          </a>
        }
      />
      <section aria-label="Position after the default" className="explorer-totals">
        {model.totals.map((total) => (
          <TotalValue key={total.label} total={total} />
        ))}
      </section>
      <NextLink link={model.next} />
    </Page>
  )
}
