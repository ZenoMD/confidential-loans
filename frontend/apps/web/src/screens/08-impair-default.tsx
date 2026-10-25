import './08-impair-default.css'
import { Cta } from '#web/Cta.tsx'
import { useSnapshot } from '#web/ledger.tsx'
import { Page } from '#web/Page.tsx'
import { Role } from '#web/Role.tsx'
import { screenHref } from '#web/route.ts'
import { Value } from '#web/Value.tsx'
import { impairDefault } from '#web/screens/08-impair-default.model.ts'
import type { ImpairDefaultModel } from '#web/screens/08-impair-default.model.ts'

function Timeline({ model }: { model: ImpairDefaultModel }) {
  return (
    <section className="impair-section" aria-labelledby="impair-timeline">
      <div className="impair-head">
        <h2 id="impair-timeline" className="impair-heading">
          Loan B
        </h2>
        <span
          className="impair-status"
          data-tone={model.status.tone}
          role="status"
          aria-live="polite"
        >
          {model.status.text}
        </span>
      </div>
      <ol className="impair-timeline">
        {model.timeline.map((point) => (
          <li key={point.label} className="impair-point">
            <span
              className="impair-bar"
              data-done={point.done || undefined}
              data-loss={point.loss || undefined}
              aria-hidden="true"
            />
            <span className="impair-label">{point.label}</span>
            <span className="impair-note">{point.note}</span>
          </li>
        ))}
      </ol>
      <div className="impair-actions">
        <Cta action={model.impair.action} label={model.impair.label} />
        <Cta action={model.default.action} label={model.default.label} />
      </div>
    </section>
  )
}

function Body() {
  const snapshot = useSnapshot('brokerA')
  if (snapshot === null) return null
  const model = impairDefault(snapshot)
  return (
    <>
      <div className="impair-values">
        {model.amountOwed !== undefined && <Value label="Amount owed" shown={model.amountOwed} />}
        <Value label="Repaid so far" shown={model.repaid} />
      </div>
      <Timeline model={model} />
      {model.shortfall !== undefined && (
        <section className="impair-section impair-result" aria-labelledby="impair-effect">
          <h2 id="impair-effect" className="impair-heading">
            Default result
          </h2>
          <Value label="Shortfall" shown={model.shortfall} />
          <div className="impair-row">
            <span className="impair-row-label">Shortfall carried by</span>
            <span className="impair-row-value">Depositors</span>
          </div>
        </section>
      )}
      <a className="impair-continue" href={screenHref(9)}>
        Continue to step 9
      </a>
    </>
  )
}

/** Screen 8: the broker impairs loan B once its payment is missed, then defaults it. */
export function Step08() {
  return (
    <Page
      step={8}
      aside={<Role role="broker" who="Broker A" action="Impairs loan B, then defaults it" />}
    >
      <Body />
    </Page>
  )
}
