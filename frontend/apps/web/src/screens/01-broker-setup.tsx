import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Cta } from '#web/Cta.tsx'
import { useSnapshot } from '#web/ledger.tsx'
import { Page } from '#web/Page.tsx'
import { Role } from '#web/Role.tsx'
import {
  step01,
  step01Initial,
  step01Role,
  step01Viewer,
} from '#web/screens/01-broker-setup.model.ts'

const SECTION: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 20 }
const HEADING: CSSProperties = { margin: 0, font: 'var(--type-heading-sm)' }
const FIELD: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  maxWidth: 420,
  font: 'var(--type-body-sm)',
  color: 'var(--mute)',
}
const UNDERLINE: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 4,
  borderBottom: '1px solid var(--rule-strong)',
}
const DOLLAR: CSSProperties = { font: 'var(--type-amount)', color: 'var(--dim)' }
const INPUT: CSSProperties = {
  width: '100%',
  height: 44,
  padding: 0,
  border: 0,
  background: 'transparent',
  color: 'var(--ink)',
  font: 'var(--type-amount)',
}
const TERMS: CSSProperties = { margin: 0, display: 'flex', flexWrap: 'wrap', gap: '16px 48px' }
const TERM_LABEL: CSSProperties = { font: 'var(--type-body-sm)', color: 'var(--mute)' }
const TERM_TEXT: CSSProperties = { margin: '4px 0 0', font: 'var(--type-heading-sm)' }
const NEXT: CSSProperties = {
  alignSelf: 'flex-start',
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  padding: '0 20px',
  borderRadius: 'var(--radius-pill)',
  border: '1px solid var(--rule-strong)',
  font: 'var(--type-control)',
}

/** Screen 1: Broker A creates the confidential LoanBroker (board `01`). */
export function Step01() {
  const snapshot = useSnapshot(step01Viewer)
  const [ui, setUi] = useState(step01Initial)
  const m = snapshot === null ? null : step01(snapshot, ui)
  return (
    <Page step={1} aside={<Role {...step01Role} />}>
      {m !== null && (
        <>
          <section aria-labelledby="terms" style={SECTION}>
            <h2 id="terms" style={HEADING}>
              {m.heading}
            </h2>
            <label style={FIELD}>
              {m.debtMaximum.label}
              <span style={UNDERLINE}>
                <span aria-hidden="true" style={DOLLAR}>
                  $
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={m.debtMaximum.text}
                  readOnly={m.debtMaximum.readOnly}
                  onChange={(event) => setUi({ debtMaximum: event.target.value })}
                  style={INPUT}
                />
              </span>
            </label>
            <dl style={TERMS}>
              {m.terms.map((term) => (
                <div key={term.label}>
                  <dt style={TERM_LABEL}>{term.label}</dt>
                  <dd style={TERM_TEXT}>{term.text}</dd>
                </div>
              ))}
            </dl>
          </section>
          <Cta action={m.cta.action} label={m.cta.label} />
          <a href={m.next.href} style={NEXT}>
            {m.next.label}
          </a>
        </>
      )}
    </Page>
  )
}
