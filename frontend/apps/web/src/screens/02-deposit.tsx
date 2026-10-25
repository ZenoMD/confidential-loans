import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Cta } from '#web/Cta.tsx'
import { useSnapshot } from '#web/ledger.tsx'
import { Page } from '#web/Page.tsx'
import { Role } from '#web/Role.tsx'
import { Toggle } from '#web/Toggle.tsx'
import { Value } from '#web/Value.tsx'
import { step02, step02Aside, step02Initial } from '#web/screens/02-deposit.model.ts'

const SECTION: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 }
const HEADING: CSSProperties = { margin: 0, font: 'var(--type-heading-sm)' }
const ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 16,
  flexWrap: 'wrap',
  maxWidth: 560,
}
const FIELD: CSSProperties = { flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 6 }
const LABEL: CSSProperties = { font: 'var(--type-body-sm)', color: 'var(--mute)' }
const UNDERLINE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  borderBottom: '1px solid var(--rule-strong)',
}
const DOLLAR: CSSProperties = { font: 'var(--type-amount)', color: 'var(--dim)' }
const INPUT: CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 44,
  padding: 0,
  border: 0,
  background: 'transparent',
  color: 'var(--ink)',
  font: 'var(--type-amount)',
}
const PILL: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  borderRadius: 'var(--radius-pill)',
  border: '1px solid var(--rule-strong)',
  background: 'transparent',
  color: 'var(--ink)',
  font: 'var(--type-control)',
}
const MAX: CSSProperties = { ...PILL, padding: '0 18px', cursor: 'pointer' }
const NEXT: CSSProperties = { ...PILL, alignSelf: 'flex-start', padding: '0 20px' }

/** Screen 2: the depositors subscribe, one at a time through the toggle (board `02`, K7). */
export function Step02() {
  const [ui, setUi] = useState(step02Initial)
  const snapshot = useSnapshot(ui.depositor)
  const aside = step02Aside(ui)
  const m = snapshot === null ? null : step02(snapshot, ui)
  return (
    <Page
      step={2}
      aside={
        <>
          <Role {...aside.role} />
          <Toggle {...aside.toggle} onSelect={(depositor) => setUi({ ...ui, depositor })} />
        </>
      }
    >
      {m !== null && (
        <>
          <Value label={m.wallet.label} shown={m.wallet.shown} />
          <section aria-labelledby="deposit" style={SECTION}>
            <h2 id="deposit" style={HEADING}>
              {m.heading}
            </h2>
            <div style={ROW}>
              <div style={FIELD}>
                <label htmlFor="deposit-amount" style={LABEL}>
                  {m.amount.label}
                </label>
                <div style={UNDERLINE}>
                  <span aria-hidden="true" style={DOLLAR}>
                    $
                  </span>
                  <input
                    id="deposit-amount"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={m.amount.text}
                    onChange={(event) => setUi({ ...ui, amount: event.target.value })}
                    style={INPUT}
                  />
                </div>
              </div>
              <button
                type="button"
                style={MAX}
                onClick={() => setUi({ ...ui, amount: m.max.text })}
              >
                {m.max.label}
              </button>
            </div>
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
