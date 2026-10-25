import type { CSSProperties } from 'react'
import { Cta } from '#web/Cta.tsx'
import { useSnapshot } from '#web/ledger.tsx'
import { Page } from '#web/Page.tsx'
import { Role } from '#web/Role.tsx'
import { Steps } from '#web/Steps.tsx'
import { Value } from '#web/Value.tsx'
import { stepHref } from '#web/route.ts'
import { model07 } from '#web/screens/07-settle.model.ts'
import type { Shown } from '@confidential-loans/core/amount'

const ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '8px 32px',
  padding: '20px 0',
  borderTop: '1px solid var(--rule)',
}
const LAST_ROW: CSSProperties = { ...ROW, borderBottom: '1px solid var(--rule)' }
const ROW_TEXT: CSSProperties = { flex: '1 1 200px', font: '500 16px/1.4 var(--font-body)' }
const HEADING: CSSProperties = { margin: 0, font: 'var(--type-heading-sm)' }
const CONTINUE: CSSProperties = {
  alignSelf: 'flex-start',
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  padding: '0 20px',
  borderRadius: 'var(--radius-pill)',
  border: '1px solid var(--rule-strong)',
  font: 'var(--type-control)',
}

/** A labelled amount, or dim text in its place while the ledger has none yet. */
function Amount({
  label,
  shown,
  empty,
}: {
  label: string
  shown: Shown | undefined
  empty: string
}) {
  if (shown !== undefined) return <Value label={label} shown={shown} />
  return (
    <span className="value">
      <span className="value-label">{label}</span>
      <span className="value-amount" data-tone="dim">
        {empty}
      </span>
    </span>
  )
}

function Settle() {
  const snapshot = useSnapshot('brokerA')
  if (snapshot === null) return null
  const view = model07(snapshot)
  return (
    <>
      <section aria-labelledby="book" style={{ display: 'flex', flexDirection: 'column' }}>
        <h2 id="book" style={{ ...HEADING, marginBottom: 16 }}>
          Repayments received
        </h2>
        {view.repayments.map((row, i) => (
          <div key={row.label} style={i === view.repayments.length - 1 ? LAST_ROW : ROW}>
            <span style={ROW_TEXT}>{row.label}</span>
            <span style={row.paid === undefined ? { ...ROW_TEXT, color: 'var(--dim)' } : ROW_TEXT}>
              {row.paid === undefined ? (
                'No payment yet'
              ) : (
                <Value label="Paid in full" shown={row.paid} />
              )}
            </span>
          </div>
        ))}
      </section>

      <div style={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '24px 40px' }}>
        <Amount label="Lending Balance" shown={view.lendingBalance} empty="No broker yet" />
        <span style={{ paddingBottom: 8, color: 'var(--dim)', display: 'flex' }}>
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 12h16M14 6l6 6-6 6" />
          </svg>
        </span>
        <Value label="Vault, available" shown={view.vaultAvailable} />
      </div>

      <section
        aria-labelledby="settle"
        style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
      >
        <h2 id="settle" style={HEADING}>
          Settle
        </h2>
        <Amount label="Amount settled" shown={view.amountSettled} empty="Not settled yet" />
        <Steps items={view.steps} />
        {view.cta !== undefined && <Cta action={view.cta.action} label={view.cta.label} />}
      </section>

      <a href={stepHref(8)} style={CONTINUE}>
        Continue to step 8
      </a>
    </>
  )
}

/** Screen 7: Broker A merges the inbox, then settles the whole Lending Balance to the vault. */
export function Step07() {
  return (
    <Page
      step={7}
      aside={
        <Role
          role="broker"
          who="Broker A"
          action="Merges the inbox, then settles the Lending Balance to the vault"
        />
      }
    >
      <Settle />
    </Page>
  )
}
