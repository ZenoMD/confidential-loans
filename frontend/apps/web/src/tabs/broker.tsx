import { useState } from 'react'
import type { Time } from '@confidential-loans/core/demo-ledger'
import '#web/Cta.css'
import { Cta } from '#web/Cta.tsx'
import { DurationField } from '#web/DurationField.tsx'
import { useViewSnapshot } from '#web/lens.tsx'
import { LoanCard } from '#web/LoanCard.tsx'
import { Modal } from '#web/Modal.tsx'
import { NAMES } from '#web/names.ts'
import { Page } from '#web/Page.tsx'
import { Role } from '#web/Role.tsx'
import { Stats } from '#web/Stats.tsx'
import { Toggle } from '#web/Toggle.tsx'
import { Value } from '#web/Value.tsx'
import { WholeField } from '#web/WholeField.tsx'
import { brokerInitial, brokerTab } from '#web/tabs/broker.model.ts'
import type { BrokerModel, BrokerUi } from '#web/tabs/broker.model.ts'

type Edit = (change: Partial<BrokerUi>) => void

function LendingBalance({ m, edit }: { m: BrokerModel; edit: Edit }) {
  return (
    <section className="section" aria-labelledby="lending">
      <h2 id="lending" className="section-heading">
        Lending Balance
      </h2>
      <Stats amounts={m.lending} />
      <WholeField
        id="draw"
        label="Draw amount"
        unit="$"
        text={m.draw.text}
        onChange={(draw) => edit({ draw })}
      >
        <Value label={m.draw.available.label} shown={m.draw.available.shown} />
      </WholeField>
      <div className="actions">
        <Cta action={m.draw.action} label={m.draw.label} />
        <Cta action={m.merge.action} label={m.merge.label} />
        <Cta action={m.settle.action} label={m.settle.label} />
      </div>
    </section>
  )
}

/** The new loan form, in a dialog. Signing closes it once the offer is held. */
function OfferDialog({
  m,
  ui,
  edit,
  onClose,
}: {
  m: BrokerModel
  ui: BrokerUi
  edit: Edit
  onClose: () => void
}) {
  return (
    <Modal labelledBy="new-loan" onClose={onClose}>
      <h2 id="new-loan" className="section-heading">
        New loan
      </h2>
      <Toggle
        label="Borrower"
        options={[
          { value: 'borrowerA', label: NAMES.borrowerA },
          { value: 'borrowerB', label: NAMES.borrowerB },
        ]}
        selected={m.offer.borrower}
        onSelect={(borrower) => edit({ borrower })}
      />
      <div className="fields">
        {m.offer.fields.map((field) => (
          <WholeField
            key={field.key}
            id={`term-${field.key}`}
            label={field.label}
            unit={field.unit}
            text={field.text}
            onChange={(text) => edit({ terms: { ...ui.terms, [field.key]: text } })}
          />
        ))}
      </div>
      <div className="fields">
        {m.offer.durations.map((term) => (
          <DurationField
            key={term.key}
            id={`term-${term.key}`}
            label={term.label}
            value={term.value}
            onChange={(value) => edit({ terms: { ...ui.terms, [term.key]: value } })}
          />
        ))}
      </div>
      <Stats amounts={m.offer.derived} />
      <div className="actions">
        <Cta action={m.offer.action} label={m.offer.label} />
        <button type="button" className="pill" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}

/** The held offer, if any, and the button that opens the new loan form. */
function Offers({ m, onNewLoan }: { m: BrokerModel; onNewLoan: () => void }) {
  return (
    <section className="section" aria-labelledby="offers">
      <h2 id="offers" className="section-heading">
        Offers
      </h2>
      <button type="button" className="cta-button" onClick={onNewLoan}>
        New loan
      </button>
      {m.pending === undefined ? (
        <p className="section-note">No offer is waiting for a co-signature.</p>
      ) : (
        <article className="card" aria-label={m.pending.title}>
          <header className="card-head">
            <h3 className="card-title">{m.pending.title}</h3>
            <span className="card-status" data-troubled={m.pending.stale}>
              {m.pending.stale ? 'Expired' : 'Pending'}
            </span>
          </header>
          <p className="section-note">{m.pending.note}</p>
          <Stats amounts={m.pending.amounts} facts={m.pending.facts} />
          <div className="actions">
            <Cta action={m.pending.withdraw.action} label={m.pending.withdraw.label} small />
          </div>
        </article>
      )}
    </section>
  )
}

/** The Broker: the LoanBroker and its Lending Balance, new loans, and every open loan. */
export function BrokerTab() {
  const [ui, setUi] = useState(brokerInitial)
  // The form opens over the offer held at the time; a new signature replaces it and closes the form.
  const [offering, setOffering] = useState<{ readonly over: Time | undefined } | null>(null)
  const edit: Edit = (change) => setUi({ ...ui, ...change })
  const snapshot = useViewSnapshot('brokerA')
  const signedAt = snapshot?.offer?.signedAt
  const formOpen = offering !== null && offering.over === signedAt
  const m = snapshot === null ? null : brokerTab(snapshot, ui)
  const aside = (
    <Role
      role="broker"
      who={NAMES.brokerA}
      action="Runs the vault's LoanBroker"
      address={snapshot?.addresses.brokerA}
    />
  )
  return (
    <Page tab="broker" aside={aside}>
      {m !== null && (
        <>
          <LendingBalance m={m} edit={edit} />
          <Offers m={m} onNewLoan={() => setOffering({ over: signedAt })} />
          {formOpen && <OfferDialog m={m} ui={ui} edit={edit} onClose={() => setOffering(null)} />}
          <section className="section" aria-labelledby="loans">
            <h2 id="loans" className="section-heading">
              Loans
            </h2>
            {m.loans.length === 0 && <p className="section-note">No loans yet.</p>}
            {m.loans.map((loan) => (
              <LoanCard key={loan.loanID} card={loan}>
                <Cta action={loan.impair.action} label={loan.impair.label} small />
                <Cta action={loan.default.action} label={loan.default.label} small />
              </LoanCard>
            ))}
          </section>
        </>
      )}
    </Page>
  )
}
