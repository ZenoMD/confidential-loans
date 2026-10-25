import type { CSSProperties } from 'react'
import { Cta } from '#web/Cta.tsx'
import { useSnapshot } from '#web/ledger.tsx'
import { Page } from '#web/Page.tsx'
import { Role } from '#web/Role.tsx'
import { screenHref } from '#web/route.ts'
import { Steps } from '#web/Steps.tsx'
import { Value } from '#web/Value.tsx'
import { repayModel } from '#web/screens/06-repay.model.ts'

const VALUES: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '32px 56px' }
const SECTION: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 20 }
const HEADING: CSSProperties = { margin: 0, font: 'var(--type-heading-sm)' }
const CONTINUE: CSSProperties = {
  alignSelf: 'flex-start',
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  padding: '0 20px',
  borderRadius: 'var(--radius-pill)',
  border: '1px solid var(--rule-strong)',
  color: 'var(--ink)',
  font: 'var(--type-control)',
  textDecoration: 'none',
}

function Repay() {
  const snapshot = useSnapshot('borrowerA')
  if (snapshot === null) return null
  const { values, steps, cta } = repayModel(snapshot)
  return (
    <>
      <div style={VALUES}>
        {values.map((value) => (
          <Value key={value.label} label={value.label} shown={value.shown} />
        ))}
      </div>
      <section aria-labelledby="repay-heading" style={SECTION}>
        <h2 id="repay-heading" style={HEADING}>
          Repay in full
        </h2>
        <Steps items={steps} />
        <Cta action={cta.action} label={cta.label} />
      </section>
      <a href={screenHref(7)} style={CONTINUE}>
        Continue to step 7
      </a>
    </>
  )
}

/** Screen 6: Borrower A merges the inbox, then repays loan A in full. */
export function Step06() {
  return (
    <Page step={6} aside={<Role role="borrower" who="Borrower A" action="Repays loan A in full" />}>
      <Repay />
    </Page>
  )
}
