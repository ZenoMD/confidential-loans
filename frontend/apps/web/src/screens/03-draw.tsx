import { Fragment, useState } from 'react'
import type { CSSProperties } from 'react'
import { Cta } from '#web/Cta.tsx'
import { useSnapshot } from '#web/ledger.tsx'
import { Page } from '#web/Page.tsx'
import { Role } from '#web/Role.tsx'
import { Steps } from '#web/Steps.tsx'
import { Value } from '#web/Value.tsx'
import { DRAW_PREFILL, DRAW_VIEWER, drawScreen } from '#web/screens/03-draw.model.ts'
import type { DrawScreen } from '#web/screens/03-draw.model.ts'

/** Canvas board 03 (`03-draw.dc.html:31-59`), with its inline styles on the shared tokens. */
const STYLE = {
  values: { display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '24px 32px' },
  arrow: { display: 'flex', paddingBottom: 8, color: 'var(--dim)' },
  drawSection: { display: 'flex', flexDirection: 'column', gap: 16 },
  stepsSection: { display: 'flex', flexDirection: 'column', gap: 20 },
  heading: { margin: 0, font: 'var(--type-heading-sm)' },
  field: { display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 420 },
  label: { font: 'var(--type-body-sm)', color: 'var(--mute)' },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    borderBottom: '1px solid var(--rule-strong)',
  },
  currency: { font: 'var(--type-amount)', color: 'var(--dim)' },
  input: {
    flex: 1,
    minWidth: 0,
    height: 44,
    padding: 0,
    border: 0,
    background: 'transparent',
    color: 'var(--ink)',
    font: 'var(--type-amount)',
  },
  next: {
    alignSelf: 'flex-start',
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 44,
    padding: '0 20px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid var(--rule-strong)',
    font: 'var(--type-control)',
  },
} satisfies Record<string, CSSProperties>

function Arrow() {
  return (
    <span style={STYLE.arrow}>
      <svg
        width="24"
        height="24"
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
  )
}

function DrawCtaButton({ cta }: { cta: DrawScreen['cta'] }) {
  if (cta.kind === 'submit') return <Cta action={cta.action} label={cta.label} />
  return (
    <div className="cta">
      <button type="button" className="cta-button" disabled>
        {cta.label}
      </button>
    </div>
  )
}

function DrawBody() {
  const snapshot = useSnapshot(DRAW_VIEWER)
  const [drawInput, setDrawInput] = useState(DRAW_PREFILL)
  if (snapshot === null) return null
  const screen = drawScreen(snapshot, { drawInput })
  return (
    <>
      <div style={STYLE.values}>
        {screen.values.map((value, i) => (
          <Fragment key={value.label}>
            {i > 0 && <Arrow />}
            <Value label={value.label} shown={value.shown} />
          </Fragment>
        ))}
      </div>

      <section aria-labelledby="draw-heading" style={STYLE.drawSection}>
        <h2 id="draw-heading" style={STYLE.heading}>
          Draw
        </h2>
        <div style={STYLE.field}>
          <label htmlFor="draw-amount" style={STYLE.label}>
            Amount drawn
          </label>
          <div style={STYLE.inputRow}>
            <span aria-hidden="true" style={STYLE.currency}>
              $
            </span>
            <input
              id="draw-amount"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={drawInput}
              onChange={(event) => setDrawInput(event.target.value)}
              style={STYLE.input}
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="draw-steps-heading" style={STYLE.stepsSection}>
        <h2 id="draw-steps-heading" style={STYLE.heading}>
          Two transactions
        </h2>
        <Steps items={screen.steps} />
        <DrawCtaButton cta={screen.cta} />
      </section>

      <a href={screen.next.href} style={STYLE.next}>
        {screen.next.label}
      </a>
    </>
  )
}

/** Screen 3: Broker A draws from the vault into its Lending Balance, then merges the inbox. */
export function Step03() {
  return (
    <Page
      step={3}
      aside={
        <Role role="broker" who="Broker A" action="Draws from the vault, then merges the inbox" />
      }
    >
      <DrawBody />
    </Page>
  )
}
