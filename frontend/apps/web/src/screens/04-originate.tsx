import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { LoanLabel } from '@confidential-loans/core/demo-ledger'
import { Cta } from '#web/Cta.tsx'
import { useSnapshot } from '#web/ledger.tsx'
import { Page } from '#web/Page.tsx'
import { Role } from '#web/Role.tsx'
import { Steps } from '#web/Steps.tsx'
import { Toggle } from '#web/Toggle.tsx'
import { Value } from '#web/Value.tsx'
import { originate, originateAside, ORIGINATE_VIEWER } from '#web/screens/04-originate.model.ts'

const VALUES: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '32px 56px' }
const SECTION: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 20 }
const HEADING: CSSProperties = { margin: 0, font: 'var(--type-heading-sm)' }
const FIELDS: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '24px 40px' }
const FIELD: CSSProperties = {
  flex: '1 1 140px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  font: 'var(--type-body-sm)',
  color: 'var(--mute)',
}
const INPUT: CSSProperties = {
  width: '100%',
  height: 44,
  padding: 0,
  border: 0,
  borderBottom: '1px solid var(--rule-strong)',
  borderRadius: 0,
  background: 'transparent',
  color: 'var(--ink)',
  font: 'var(--type-amount)',
}
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

function Content({ loan }: { loan: LoanLabel }) {
  const snapshot = useSnapshot(ORIGINATE_VIEWER)
  if (snapshot === null) return <p className="page-notice">Reading the ledger</p>
  const model = originate(snapshot, loan)
  return (
    <>
      <div style={VALUES}>
        {model.values.map((value) => (
          <Value key={value.label} label={value.label} shown={value.shown} />
        ))}
      </div>
      <section aria-labelledby="schedule" style={SECTION}>
        <h2 id="schedule" style={HEADING}>
          Schedule
        </h2>
        <div style={FIELDS}>
          {model.schedule.map((field) => (
            <label key={field.label} style={FIELD}>
              {field.label}
              <input type="text" readOnly value={field.value} style={INPUT} />
            </label>
          ))}
        </div>
      </section>
      <section aria-labelledby="signatures" style={SECTION}>
        <h2 id="signatures" style={HEADING}>
          Signatures
        </h2>
        <Steps items={model.steps} />
        <Cta action={model.cta.action} label={model.cta.label} />
      </section>
      <a href={model.next.href} style={NEXT}>
        {model.next.label}
      </a>
    </>
  )
}

/** Screen 4: the broker signs each loan, its borrower co-signs, and the LoanSet lands. */
export function Step04() {
  const [loan, setLoan] = useState<LoanLabel>('A')
  const { role, toggle } = originateAside(loan)
  const aside = (
    <>
      <Role role="broker" who={role.who} action={role.action} />
      <Toggle
        label={toggle.label}
        options={toggle.options}
        selected={toggle.selected}
        onSelect={setLoan}
      />
    </>
  )
  return (
    <Page step={4} aside={aside}>
      <Content loan={loan} />
    </Page>
  )
}
