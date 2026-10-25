import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { Depositor } from '@confidential-loans/core/demo-ledger'
import { Cta } from '#web/Cta.tsx'
import { useSnapshot } from '#web/ledger.tsx'
import { Page } from '#web/Page.tsx'
import { Role } from '#web/Role.tsx'
import { screenHref } from '#web/route.ts'
import { Toggle } from '#web/Toggle.tsx'
import { Value } from '#web/Value.tsx'
import { DEPOSITOR_OPTIONS, depositorName, redeemModel } from '#web/screens/10-redeem.model.ts'
import type { RowTone } from '#web/screens/10-redeem.model.ts'

const TONE_COLOR: Readonly<Record<RowTone, string>> = {
  mute: 'var(--mute)',
  loss: 'var(--loss)',
  ink: 'var(--ink)',
}

const BREAKDOWN: CSSProperties = { display: 'flex', flexDirection: 'column', maxWidth: 640 }
const HEADING: CSSProperties = { margin: '0 0 16px', font: 'var(--type-heading-sm)' }
const ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 24,
  padding: '14px 0',
}
const ACTION: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 12,
}
const FAILURE: CSSProperties = {
  margin: 0,
  font: 'var(--type-body-sm)',
  color: 'var(--loss)',
  overflowWrap: 'anywhere',
}
const BACK: CSSProperties = {
  alignSelf: 'flex-start',
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  padding: '0 20px',
  borderRadius: 'var(--radius-pill)',
  border: '1px solid var(--rule-strong)',
  font: 'var(--type-control)',
}

function Redemption({ depositor }: { depositor: Depositor }) {
  const snapshot = useSnapshot(depositor)
  if (snapshot === null) return null
  const model = redeemModel(snapshot, { depositor })
  return (
    <>
      <section aria-labelledby="breakdown" style={BREAKDOWN}>
        <h2 id="breakdown" style={HEADING}>
          Redemption
        </h2>
        {model.rows.map((row) => (
          <div
            key={row.label}
            style={{
              ...ROW,
              borderTop: `1px solid var(${row.tone === 'ink' ? '--rule-strong' : '--rule'})`,
            }}
          >
            <span style={{ font: 'var(--type-body-sm)', color: TONE_COLOR[row.tone] }}>
              {row.label}
            </span>
            <Value shown={row.shown} />
          </div>
        ))}
      </section>
      <div style={ACTION}>
        <Cta
          key={`${depositor}-${model.attempts}`}
          action={model.cta.action}
          label={model.cta.label}
        />
        {model.failure !== undefined && (
          <p role="alert" style={FAILURE}>
            {model.failure}
          </p>
        )}
      </div>
      <a href={screenHref(0)} style={BACK}>
        Back to the flow map
      </a>
    </>
  )
}

/** Screen 10: the selected depositor redeems all shares, and sees what the vault paid out. */
export function Step10() {
  const [depositor, setDepositor] = useState<Depositor>('depositorA')
  const aside = (
    <>
      <Role role="depositor" who={depositorName(depositor)} action="Redeems all shares" />
      <Toggle
        label="Depositor"
        options={DEPOSITOR_OPTIONS}
        selected={depositor}
        onSelect={setDepositor}
      />
    </>
  )
  return (
    <Page step={10} aside={aside}>
      <Redemption depositor={depositor} />
    </Page>
  )
}
